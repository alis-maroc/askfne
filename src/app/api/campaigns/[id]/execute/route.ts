import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { sendTelegramMessage } from "@/lib/channels/telegram";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "automation:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Mark as running
    await prisma.campaign.update({
      where: { id },
      data: { status: "running" },
    });

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // 1. Send via WhatsApp
    if (campaign.channel === "whatsapp" || campaign.channel === "all") {
      const waConversations = await prisma.conversation.findMany({
        where: { channel: "whatsapp" },
        select: { id: true, customerContact: true, customerName: true },
        distinct: ["customerContact"],
      });

      for (const conv of waConversations) {
        try {
          const success = await sendWhatsAppMessage(conv.customerContact, campaign.message);
          if (success) {
            sentCount++;
            await prisma.message.create({
              data: {
                conversationId: conv.id,
                role: "assistant",
                content: `📢 [${campaign.name}]\n\n${campaign.message}`,
              },
            });
            await prisma.conversation.update({
              where: { id: conv.id },
              data: { updatedAt: new Date() },
            });
            // Safe pacing between WhatsApp messages
            await new Promise((r) => setTimeout(r, 600));
          } else {
            failedCount++;
          }
        } catch (waErr) {
          failedCount++;
          errors.push(`WA to ${conv.customerContact}: ${String(waErr)}`);
        }
      }
    }

    // 2. Send via Telegram
    if (campaign.channel === "telegram" || campaign.channel === "all") {
      const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
      const tgToken = settings?.telegramBotToken || "";

      if (tgToken) {
        const tgConversations = await prisma.conversation.findMany({
          where: { channel: "telegram" },
          select: { id: true, customerContact: true, customerName: true, metadata: true },
          distinct: ["customerContact"],
        });

        const messagedChatIds = new Set<number>();

        for (const conv of tgConversations) {
          try {
            const meta = conv.metadata as Record<string, unknown> | null;
            let rawChatId: unknown = meta?.telegramChatId;
            if (!rawChatId) {
              const digitsOnly = conv.customerContact.replace(/[^0-9-]/g, "");
              if (digitsOnly) rawChatId = digitsOnly;
            }

            const chatId = parseInt(String(rawChatId || ""), 10);
            if (!chatId || isNaN(chatId) || messagedChatIds.has(chatId)) continue;
            messagedChatIds.add(chatId);

            const success = await sendTelegramMessage(
              tgToken,
              chatId,
              `📢 *${campaign.name}*\n━━━━━━━━━━━━━━━━━━━━\n${campaign.message}`
            );
            if (success) {
              sentCount++;
              await prisma.message.create({
                data: {
                  conversationId: conv.id,
                  role: "assistant",
                  content: `📢 [${campaign.name}]\n\n${campaign.message}`,
                },
              });
              await prisma.conversation.update({
                where: { id: conv.id },
                data: { updatedAt: new Date() },
              });
              await new Promise((r) => setTimeout(r, 300));
            } else {
              failedCount++;
            }
          } catch (tgErr) {
            failedCount++;
            errors.push(`TG to ${conv.customerContact}: ${String(tgErr)}`);
          }
        }
      }
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id },
      data: {
        status: "completed",
        sentCount: { increment: sentCount },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      campaignId: id,
      sentCount,
      failedCount,
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    logger.error("Failed to execute campaign:", error);
    return NextResponse.json(
      { error: "Failed to execute campaign: " + String(error) },
      { status: 500 }
    );
  }
}
