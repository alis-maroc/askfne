import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { sendTelegramMessage } from "@/lib/channels/telegram";
import { getOrCreateShortLink } from "@/lib/short-links";

export const BAYAN_TAG = "مشتركو البيانات والمستجدات";
export const BAYAN_TAG_SLUG = "bayan_subscribers";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "analytics:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const [bayanCustomers, declinedCount, totalWaConvs, recentBayans] = await Promise.all([
      prisma.customer.findMany({
        where: {
          OR: [
            { tags: { contains: BAYAN_TAG_SLUG } },
            { tags: { contains: BAYAN_TAG } },
          ],
        },
        select: { id: true, name: true, whatsapp: true, phone: true },
      }),
      prisma.customer.count({
        where: {
          OR: [
            { tags: { contains: "bayan_opted_out" } },
            { tags: { contains: "رافضو خدمة البيانات" } },
          ],
        },
      }),
      prisma.conversation.findMany({
        where: { channel: "whatsapp" },
        select: { customerContact: true },
        distinct: ["customerContact"],
      }),
      prisma.campaign.findMany({
        where: {
          OR: [
            { name: { startsWith: "[بيان]" } },
            { description: { contains: "bayan" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      subscribersCount: bayanCustomers.length,
      declinedCount,
      totalWaCount: totalWaConvs.length,
      subscribers: bayanCustomers.slice(0, 50),
      recentBayans,
    });
  } catch (error) {
    logger.error("[Campaigns/Bayan] Failed to get bayan stats:", error);
    return NextResponse.json({ error: "Failed to fetch bayan data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "automation:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const {
      title,
      message,
      link,
      targetGroup = "bayan_subscribers",
      channel = "whatsapp",
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "عنوان البيان أو المستجد مطلوب" }, { status: 400 });
    }

    if ((!message || !message.trim()) && (!link || !link.trim())) {
      return NextResponse.json(
        { error: "يجب كتابة نص البيان أو إدراج الرابط على الأقل" },
        { status: 400 }
      );
    }

    // 1. Clean & shorten URL if provided
    let cleanLink = (link || "").trim();
    if (cleanLink) {
      cleanLink = await getOrCreateShortLink(cleanLink);
    }

    // 2. Assemble polished broadcast message
    const lines: string[] = [
      `📢 *${title.trim()}*`,
      "━━━━━━━━━━━━━━━━━━━━",
    ];

    if (message && message.trim()) {
      lines.push(message.trim());
    }

    if (cleanLink) {
      lines.push("");
      lines.push("🔗 *رابط الاطلاع والتحميل:*");
      lines.push(cleanLink);
    }

    lines.push("");
    lines.push("🕊️ _الجامعة الوطنية للتعليم FNE — نقابة مناضلة، ديمقراطية ومستقلة_");

    const finalMessage = lines.join("\n");

    // 3. Create Campaign record in DB
    const campaign = await prisma.campaign.create({
      data: {
        name: `[بيان] ${title.trim().substring(0, 100)}`,
        description: `بث بيان إخباري (${targetGroup === "bayan_subscribers" ? "المشتركون فقط" : "كافة جهات الاتصال"})`,
        channel,
        message: finalMessage,
        status: "running",
        segments: [targetGroup],
      },
    });

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // 4. Determine recipient contacts
    let targetContacts: { contact: string; name: string }[] = [];

    if (targetGroup === "bayan_subscribers") {
      // Find customers tagged with bayan subscription
      const customers = await prisma.customer.findMany({
        where: {
          OR: [
            { tags: { contains: BAYAN_TAG_SLUG } },
            { tags: { contains: BAYAN_TAG } },
          ],
        },
        select: { name: true, whatsapp: true, phone: true },
      });

      const uniqueJids = new Set<string>();
      for (const c of customers) {
        const raw = c.whatsapp || c.phone;
        if (raw) {
          const jid = raw.includes("@") ? raw : `${raw.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
          if (!uniqueJids.has(jid)) {
            uniqueJids.add(jid);
            targetContacts.push({ contact: jid, name: c.name || "عضو" });
          }
        }
      }

      // Fallback: Also check conversation metadata for bayanSubscribed
      const convs = await prisma.conversation.findMany({
        where: {
          channel: "whatsapp",
          metadata: { path: ["bayanSubscribed"], equals: true },
        },
        select: { customerContact: true, customerName: true },
      });

      for (const cv of convs) {
        if (!uniqueJids.has(cv.customerContact)) {
          uniqueJids.add(cv.customerContact);
          targetContacts.push({ contact: cv.customerContact, name: cv.customerName || "عضو" });
        }
      }
    } else {
      // All WhatsApp contacts
      const allWa = await prisma.conversation.findMany({
        where: { channel: "whatsapp" },
        select: { customerContact: true, customerName: true },
        distinct: ["customerContact"],
      });
      targetContacts = allWa.map((c) => ({
        contact: c.customerContact,
        name: c.customerName || "عضو",
      }));
    }

    // 5. Send to WhatsApp recipients with safe pacing
    if (channel === "whatsapp" || channel === "all") {
      for (const recipient of targetContacts) {
        try {
          const success = await sendWhatsAppMessage(recipient.contact, finalMessage);
          if (success) {
            sentCount++;
            // Find or link conversation for message history
            const conv = await prisma.conversation.findFirst({
              where: { channel: "whatsapp", customerContact: recipient.contact },
            });
            if (conv) {
              await prisma.message.create({
                data: {
                  conversationId: conv.id,
                  role: "assistant",
                  content: finalMessage,
                },
              });
              await prisma.conversation.update({
                where: { id: conv.id },
                data: { updatedAt: new Date() },
              });
            }
            // Pacing delay: 600ms
            await new Promise((r) => setTimeout(r, 600));
          } else {
            failedCount++;
          }
        } catch (waErr) {
          failedCount++;
          errors.push(`WA to ${recipient.contact}: ${String(waErr)}`);
        }
      }
    }

    // 6. Send to Telegram if requested
    if (channel === "telegram" || channel === "all") {
      const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
      const tgToken = settings?.telegramBotToken || "";
      if (tgToken) {
        const tgConversations = await prisma.conversation.findMany({
          where: { channel: "telegram" },
          select: { id: true, customerContact: true, metadata: true },
          distinct: ["customerContact"],
        });

        for (const cv of tgConversations) {
          try {
            const meta = cv.metadata as Record<string, unknown> | null;
            let rawChatId = meta?.telegramChatId || cv.customerContact.replace(/[^0-9-]/g, "");
            const chatId = parseInt(String(rawChatId), 10);
            if (!chatId || isNaN(chatId)) continue;

            const success = await sendTelegramMessage(tgToken, chatId, finalMessage);
            if (success) {
              sentCount++;
              await prisma.message.create({
                data: {
                  conversationId: cv.id,
                  role: "assistant",
                  content: finalMessage,
                },
              });
              await new Promise((r) => setTimeout(r, 400));
            } else {
              failedCount++;
            }
          } catch (tgErr) {
            failedCount++;
            errors.push(`TG to ${cv.customerContact}: ${String(tgErr)}`);
          }
        }
      }
    }

    // 7. Update Campaign status to completed
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "completed",
        sentCount,
      },
    });

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount,
      totalTargeted: targetContacts.length,
      campaignId: campaign.id,
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    logger.error("[Campaigns/Bayan] Execution failed:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء إرسال البيان", details: String(error) },
      { status: 500 }
    );
  }
}
