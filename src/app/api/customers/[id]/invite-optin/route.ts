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
  const auth = await requireAuth(request, "customers:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        conversations: {
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "الزبون غير موجود" }, { status: 404 });
    }

    const name = customer.name?.trim() || "الرفيق/ة";
    const inviteText = [
      `مرحباً بك الرفيق/ة ${name} 🌹`,
      "تحية نضالية من الجامعة الوطنية للتعليم FNE.",
      "",
      "هل ترغب في التوصل بآخر البيانات والبلاغات والمذكرات الوزارية الرسمية فور صدورها؟",
      "• أرسل *1* أو *نعم* للاشتراك",
      "• أرسل *2* أو *لا* للتخطي",
      "",
      "💡 _يمكنك تعديل اختيارك في أي وقت._",
    ].join("\n");

    let sent = false;
    let channelUsed = "";
    let activeConv = customer.conversations[0] || null;

    // 1. Try WhatsApp
    const waConv = customer.conversations.find((c) => c.channel === "whatsapp");
    const rawWa = customer.whatsapp || customer.phone || waConv?.customerContact || "";
    const waContact = rawWa.endsWith("@lid") ? rawWa : rawWa.replace(/[^\d+]/g, "");

    if (waContact && (waContact.endsWith("@lid") || waContact.length >= 8)) {
      try {
        const ok = await sendWhatsAppMessage(waContact, inviteText);
        if (ok) {
          sent = true;
          channelUsed = "whatsapp";
          if (waConv) activeConv = waConv;
        }
      } catch (waErr) {
        logger.warn(`[Customers/OptInInvite] WA send failed to ${waContact}:`, { error: String(waErr) });
      }
    }

    // 2. Try Telegram if no WhatsApp or WhatsApp failed
    if (!sent) {
      const tgConv = customer.conversations.find((c) => c.channel === "telegram");
      if (tgConv) {
        const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
        if (settings?.telegramBotToken) {
          const meta = (tgConv.metadata as Record<string, unknown>) || {};
          const rawChatId = meta.telegramChatId || tgConv.customerContact;
          const chatId = Number(rawChatId);
          if (Number.isFinite(chatId)) {
            try {
              const ok = await sendTelegramMessage(settings.telegramBotToken, chatId, inviteText);
              if (ok) {
                sent = true;
                channelUsed = "telegram";
                activeConv = tgConv;
              }
            } catch (tgErr) {
              logger.warn(`[Customers/OptInInvite] TG send failed to ${chatId}:`, { error: String(tgErr) });
            }
          }
        }
      }
    }

    if (!sent) {
      return NextResponse.json(
        { error: "تعذر إرسال الدعوة. تأكد من توفر رقم هاتف/واتساب صالح أو محادثة تيليجرام نشطة لهذا المشترك." },
        { status: 400 }
      );
    }

    // Update conversation metadata to await their opt-in response
    if (activeConv) {
      const meta = (activeConv.metadata as Record<string, unknown>) || {};
      await prisma.conversation.update({
        where: { id: activeConv.id },
        data: {
          metadata: {
            ...meta,
            awaitingBayanOptIn: true,
            bayanOptInPrompted: true,
          },
        },
      });

      // Also record message in history
      await prisma.message.create({
        data: {
          conversationId: activeConv.id,
          role: "assistant",
          content: inviteText,
        },
      });
    }

    logger.info(`[Customers/OptInInvite] Sent opt-in invitation to customer ${customer.id} via ${channelUsed}`);

    return NextResponse.json({
      success: true,
      channel: channelUsed,
      message: `تم إرسال دعوة الاشتراك بنجاح عبر ${channelUsed === "whatsapp" ? "واتساب" : "تيليغرام"}!`,
    });
  } catch (error) {
    logger.error("[Customers/OptInInvite] Error sending opt-in invitation:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إرسال الدعوة" }, { status: 500 });
  }
}
