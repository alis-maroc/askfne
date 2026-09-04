import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { sendTelegramMessage } from "@/lib/channels/telegram";
import { emitNewMessage } from "@/lib/realtime";

function normalizeQuestionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove Arabic diacritics
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * POST /api/knowledge/unanswered/warn-correction
 * 1. Sends an advisory warning message to the customer (via WhatsApp / Telegram) stating that the previous answer was inaccurate.
 * 2. Saves the assistant message in conversation and emits realtime event.
 * 3. Registers or updates an active holding disclaimer (category: "unanswered_holding") so any future identical question
 *    is intercepted with the holding disclaimer before LLM generation.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const {
      question,
      conversationId,
      customMessage,
      holdingDisclaimer,
      notifyCustomer = true,
      enableHolding = true,
    } = body;

    const questionText = (question || "").trim();
    if (!questionText) {
      return NextResponse.json(
        { error: "نص السؤال مطلوب" },
        { status: 400 }
      );
    }

    const normKey = normalizeQuestionKey(questionText);

    // 1. Locate the target conversation
    let targetConv = null;
    if (conversationId) {
      targetConv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          channel: true,
          customerName: true,
          customerContact: true,
          metadata: true,
        },
      });
    }

    if (!targetConv) {
      // Find candidate conversation by question snippet
      targetConv = await prisma.conversation.findFirst({
        where: {
          messages: {
            some: { content: { contains: questionText.slice(0, 30) } },
          },
        },
        select: {
          id: true,
          channel: true,
          customerName: true,
          customerContact: true,
          metadata: true,
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    let customerNotified = false;
    let notificationError: string | null = null;

    // 2. Prepare and send warning message to customer
    const customerGreeting = targetConv?.customerName ? ` ${targetConv.customerName}` : "";
    const outboundMessage =
      (customMessage && customMessage.trim()) ||
      [
        "⚠️ *تنبيه وتصويب هام من الجامعة الوطنية للتعليم FNE* 🕊️",
        "",
        `تحية نضالية رفيقي/رفيقتي${customerGreeting}،`,
        "نحيطكم علماً بأن الجواب الآلي الذي تم تقديمه سابقاً بخصوص استفساركم:",
        `« *${questionText}* »`,
        "هو جواب غير دقيق أو شابته بعض النواقص، ونرجو منكم عدم الأخذ به أو الاعتماد عليه.",
        "",
        "📌 *المتابعة الجارية:*",
        "الموضوع قيد التدقيق والمراجعة الإدارية والنقابية مع الهياكل والمكاتب المختصة لضبط المعطيات الرسمية والنهائية، وبمجرد التوصل بالجواب الشامل والدقيق سنوافيكم به مباشرة هنا.",
        "",
        "نعتذر لكم عن هذا اللبس غير المقصود، ونحن دائماً في خدمتكم وإشارتكم!",
        "✊ عاشت الجامعة الوطنية للتعليم FNE صامدة ومناضلة.",
      ].join("\n");

    if (notifyCustomer && targetConv) {
      try {
        if (targetConv.channel === "whatsapp" && targetConv.customerContact) {
          const sent = await sendWhatsAppMessage(targetConv.customerContact, outboundMessage);
          if (sent) customerNotified = true;
          else notificationError = "تعذر إرسال رسالة الواتساب عبر السيرفر";
        } else if (targetConv.channel === "telegram" && targetConv.customerContact) {
          const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
          const tgChatId = Number(targetConv.customerContact);
          if (settings?.telegramBotToken && Number.isFinite(tgChatId)) {
            const sent = await sendTelegramMessage(settings.telegramBotToken, tgChatId, outboundMessage);
            if (sent) customerNotified = true;
            else notificationError = "تعذر إرسال رسالة التيليغرام";
          }
        } else {
          // Web chat or contact-less
          customerNotified = true;
        }

        // Save outbound message in conversation history
        const savedMsg = await prisma.message.create({
          data: {
            conversationId: targetConv.id,
            role: "assistant",
            content: outboundMessage,
          },
        });

        // Update conversation metadata
        const metadata = (targetConv.metadata || {}) as Record<string, unknown>;
        const warnedList = Array.isArray(metadata.warnedQuestions)
          ? (metadata.warnedQuestions as Array<{ question: string; warnedAt: string }>)
          : [];
        warnedList.push({ question: questionText, warnedAt: new Date().toISOString() });

        await prisma.conversation.update({
          where: { id: targetConv.id },
          data: {
            updatedAt: new Date(),
            metadata: {
              ...metadata,
              warnedQuestions: warnedList,
              hasHoldingWarning: true,
            },
          },
        });

        emitNewMessage(targetConv.id, {
          id: savedMsg.id,
          role: "assistant",
          content: outboundMessage,
        });
      } catch (err: any) {
        logger.error("[WarnCorrection] Failed to dispatch customer notification:", err);
        notificationError = err?.message || String(err);
      }
    }

    // 3. Register or update the holding disclaimer in CannedResponse
    let holdingCreatedOrUpdated = false;
    let holdingRecordId: string | null = null;

    if (enableHolding) {
      const holdingContent =
        (holdingDisclaimer && holdingDisclaimer.trim()) ||
        [
          "⚠️ *تنبيه وتوضيح من الجامعة الوطنية للتعليم FNE* 🕊️",
          "",
          `بخصوص الاستفسار حول: « *${questionText}* »`,
          "",
          "نحيطكم علماً بأن هذا الموضوع قيد التدقيق والتحري الإداري والنقابي حالياً لضبط المعطيات الرسمية الدقيقة والمعتمدة من الهياكل المختصة.",
          "نرجو عدم اعتماد أي أجوبة سابقة أو غير رسمية، وسيتم تزويدكم بالجواب الرسمي الشامل فور نشره في قاعدة المعرفة.",
          "",
          "✊ الجامعة الوطنية للتعليم FNE في خدمتكم دائماً.",
        ].join("\n");

      // Check if already exists in CannedResponse
      const existingHolding = await prisma.cannedResponse.findFirst({
        where: {
          category: "unanswered_holding",
          OR: [
            { shortcut: `holding:${normKey}` },
            { title: questionText },
          ],
        },
      });

      if (existingHolding) {
        const updated = await prisma.cannedResponse.update({
          where: { id: existingHolding.id },
          data: {
            title: questionText,
            content: holdingContent,
            isActive: true,
            updatedAt: new Date(),
          },
        });
        holdingRecordId = updated.id;
        holdingCreatedOrUpdated = true;
      } else {
        const created = await prisma.cannedResponse.create({
          data: {
            title: questionText,
            content: holdingContent,
            category: "unanswered_holding",
            shortcut: `holding:${normKey}`,
            isActive: true,
            usageCount: 0,
          },
        });
        holdingRecordId = created.id;
        holdingCreatedOrUpdated = true;
      }

      logger.info(`[WarnCorrection] Holding disclaimer activated for question: "${questionText}" (id: ${holdingRecordId})`);
    }

    return NextResponse.json({
      success: true,
      customerNotified,
      notificationError,
      holdingActive: enableHolding && holdingCreatedOrUpdated,
      holdingId: holdingRecordId,
      message: customerNotified
        ? "تم إرسال إشعار التصويب للمنخرط وتفعيل الرد التوقيفي للسؤال بنجاح!"
        : "تم حفظ الرد التوقيفي للسؤال بنجاح!",
    });
  } catch (error: any) {
    logger.error("[WarnCorrection] Error processing warning and holding:", error);
    return NextResponse.json(
      { error: error?.message || "فشل إرسال الإشعار وتفعيل التجميد" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/knowledge/unanswered/warn-correction
 * Allows manually releasing / lifting the holding disclaimer on a question without resolving it into KB.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { question, holdingId } = body;

    const questionText = (question || "").trim();
    const normKey = normalizeQuestionKey(questionText);

    await prisma.cannedResponse.updateMany({
      where: {
        category: "unanswered_holding",
        OR: [
          ...(holdingId ? [{ id: holdingId }] : []),
          ...(questionText ? [{ title: questionText }] : []),
          ...(normKey ? [{ shortcut: `holding:${normKey}` }] : []),
        ],
      },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "تم رفع التعليق وإلغاء الرد التوقيفي بنجاح.",
    });
  } catch (error: any) {
    logger.error("[WarnCorrection] Error lifting holding disclaimer:", error);
    return NextResponse.json(
      { error: error?.message || "فشل رفع التعليق" },
      { status: 500 }
    );
  }
}
