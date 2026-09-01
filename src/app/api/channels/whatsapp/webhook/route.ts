import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chat, createNewConversation } from "@/lib/ai/engine";
import { resolveCustomer } from "@/lib/customer-resolver";
import { logger } from "@/lib/logger";

// Webhook verification for Meta WhatsApp Cloud API
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const channel = await prisma.channel.findUnique({
    where: { type: "whatsapp" },
  });

  const config = (channel?.config || {}) as Record<string, string>;
  const expectedVerifyToken =
    config.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "owly_webhook_secret";

  if (mode === "subscribe" && token === expectedVerifyToken) {
    logger.info("[WhatsApp Cloud API] Webhook verified successfully with Meta!");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  logger.warn(
    `[WhatsApp Cloud API] Verification failed. Token received: ${token}, expected: ${expectedVerifyToken}`
  );
  return new NextResponse("Forbidden", { status: 403 });
}

// Incoming messages from Meta WhatsApp Cloud API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    const channel = await prisma.channel.findUnique({
      where: { type: "whatsapp" },
    });

    const config = (channel?.config || {}) as Record<string, string>;
    const accessToken =
      config.apiKey || config.accessToken || process.env.WHATSAPP_API_KEY || "";
    const configuredPhoneId = config.phoneNumberId || config.phoneId || "";

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value || change.field !== "messages") continue;

        const messages = value.messages || [];
        const contacts = value.contacts || [];
        const phoneId = value.metadata?.phone_number_id || configuredPhoneId;

        for (const msg of messages) {
          if (!msg.from) continue;

          const contact = contacts.find((c: any) => c.wa_id === msg.from);
          const customerName = contact?.profile?.name || "WhatsApp User";
          const customerContact = msg.from;

          let messageContent = "";
          if (msg.type === "text") {
            messageContent = msg.text?.body || "";
          } else if (msg.type === "audio" || msg.type === "voice") {
            messageContent = "[Voice message received]";
          } else if (msg.type === "image") {
            messageContent = `[Image: ${msg.image?.caption || ""}]`;
          } else if (msg.type === "document") {
            messageContent = `[Document: ${msg.document?.filename || ""}]`;
          } else if (msg.type === "button") {
            messageContent = msg.button?.text || msg.button?.payload || "";
          } else if (msg.type === "interactive") {
            messageContent =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              "";
          } else {
            messageContent = `[Message type: ${msg.type}]`;
          }

          if (!messageContent.trim()) continue;

          logger.info(
            `[WhatsApp Cloud API] Received from ${customerName} (${customerContact}): ${messageContent}`
          );

          // Resolve customer & conversation in Owly
          const customerId = await resolveCustomer(
            "whatsapp",
            customerContact,
            customerName
          );

          let conversation = await prisma.conversation.findFirst({
            where: {
              channel: "whatsapp",
              status: { in: ["active", "escalated"] },
              OR: [{ customerId }, { customerContact }],
            },
          });

          if (!conversation) {
            conversation = await createNewConversation(
              "whatsapp",
              customerName,
              customerContact,
              customerId
            );
          }

          // Generate response with AI Engine
          const aiResponse = await chat(conversation.id, messageContent);

          // Reply via Meta WhatsApp Graph API
          if (accessToken && phoneId) {
            const res = await fetch(
              `https://graph.facebook.com/v21.0/${phoneId}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  recipient_type: "individual",
                  to: customerContact,
                  type: "text",
                  text: { body: aiResponse },
                }),
              }
            );

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              logger.error("[WhatsApp Cloud API] Reply error:", err);
            } else {
              logger.info(`[WhatsApp Cloud API] Sent reply to ${customerContact}`);
            }
          } else {
            logger.warn(
              "[WhatsApp Cloud API] Cannot reply: accessToken or phoneId missing in channel config"
            );
          }
        }
      }
    }

    return NextResponse.json({ status: "processed" }, { status: 200 });
  } catch (error) {
    logger.error("[WhatsApp Cloud API] Webhook error:", error);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
