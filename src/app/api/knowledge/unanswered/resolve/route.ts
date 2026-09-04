import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { indexKnowledgeEntry } from "@/lib/ai/semantic-search";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { sendTelegramMessage } from "@/lib/channels/telegram";

function normalizeQuestionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const {
      question,
      title,
      content,
      categoryId,
      priority = 10,
      conversationId,
      notifyUser = false,
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "عنوان المقال مطلوب" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "محتوى الإجابة مطلوب" },
        { status: 400 }
      );
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: "الفئة مطلوبة" },
        { status: 400 }
      );
    }

    // 1. Create Knowledge Entry
    const entry = await prisma.knowledgeEntry.create({
      data: {
        categoryId,
        title: title.trim(),
        content: content.trim(),
        priority: Number(priority) || 10,
      },
      include: {
        category: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    // Fire-and-forget indexing for semantic search embeddings
    void (async () => {
      try {
        await indexKnowledgeEntry(entry.id);
      } catch (e) {
        logger.warn("[UnansweredResolve] Semantic index failed:", { error: String(e) });
      }
    })();

    // 2. Dismiss question so it no longer appears in unanswered list
    const questionText = question || title;
    const normKey = normalizeQuestionKey(questionText);

    if (conversationId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { metadata: true },
      });
      if (conv) {
        const metadata = (conv.metadata || {}) as Record<string, unknown>;
        const dismissed = Array.isArray(metadata.dismissedQuestions)
          ? (metadata.dismissedQuestions as string[])
          : [];
        if (!dismissed.includes(normKey)) {
          dismissed.push(normKey);
        }

        const rawList = Array.isArray(metadata.unansweredQuestions)
          ? (metadata.unansweredQuestions as Array<{ question: string }>)
          : [];
        const remainingList = rawList.filter(
          (item) => normalizeQuestionKey(item.question) !== normKey
        );

        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            metadata: {
              ...metadata,
              dismissedQuestions: dismissed,
              unansweredQuestions: remainingList,
              isManuallyUnanswered: remainingList.length > 0,
            },
          },
        });
      }
    } else {
      // Find conversations that might contain this question
      const convs = await prisma.conversation.findMany({
        where: {
          messages: {
            some: { content: { contains: questionText.slice(0, 30) } },
          },
        },
        select: { id: true, metadata: true },
        take: 20,
      });
      for (const c of convs) {
        const metadata = (c.metadata || {}) as Record<string, unknown>;
        const dismissed = Array.isArray(metadata.dismissedQuestions)
          ? (metadata.dismissedQuestions as string[])
          : [];
        if (!dismissed.includes(normKey)) {
          dismissed.push(normKey);
        }

        const rawList = Array.isArray(metadata.unansweredQuestions)
          ? (metadata.unansweredQuestions as Array<{ question: string }>)
          : [];
        const remainingList = rawList.filter(
          (item) => normalizeQuestionKey(item.question) !== normKey
        );

        await prisma.conversation.update({
          where: { id: c.id },
          data: {
            metadata: {
              ...metadata,
              dismissedQuestions: dismissed,
              unansweredQuestions: remainingList,
              isManuallyUnanswered: remainingList.length > 0,
            },
          },
        });
      }
    }

    // 3. Lift / deactivate any holding disclaimer associated with this question
    try {
      await prisma.cannedResponse.updateMany({
        where: {
          category: "unanswered_holding",
          OR: [
            { shortcut: `holding:${normKey}` },
            { title: questionText },
            { title: { contains: questionText.slice(0, 30) } },
          ],
        },
        data: { isActive: false },
      });
      logger.info(`[UnansweredResolve] Lifted holding disclaimer for: "${questionText}"`);
    } catch (holdingErr) {
      logger.warn("[UnansweredResolve] Failed to deactivate holding disclaimer:", { error: String(holdingErr) });
    }

    // 4. Notify user on WhatsApp or Telegram if requested and eligible
    let userNotified = false;
    if (notifyUser && conversationId) {
      try {
        const targetConv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true, channel: true, customerContact: true, customerName: true },
        });

        if (targetConv && targetConv.customerContact) {
          const contact = targetConv.customerContact;
          const greetingName = targetConv.customerName ? ` ${targetConv.customerName}` : "";

          const notifyMsg = [
            "🕊️ *الجامعة الوطنية للتعليم FNE - إشعار متابعة*",
            "",
            `أهلاً بك رفيقي/رفيقتي${greetingName}،`,
            "بخصوص استفسارك السابق:",
            `«*${questionText.trim()}*»`,
            "",
            "📌 *التوضيح والجواب الرسمي المعتمد:*",
            content.trim(),
            "",
            "✊ نحن دائماً في خدمتكم وإشارتكم! للاستفسار عن أي موضوع لا تتردد في مراسلتنا.",
          ].join("\n");

          let sent = false;
          if (targetConv.channel === "whatsapp") {
            sent = await sendWhatsAppMessage(contact, notifyMsg);
          } else if (targetConv.channel === "telegram") {
            const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
            const tgChatId = Number(contact);
            if (settings?.telegramBotToken && Number.isFinite(tgChatId)) {
              sent = await sendTelegramMessage(settings.telegramBotToken, tgChatId, notifyMsg);
            }
          }

          if (sent) {
            userNotified = true;
            await prisma.message.create({
              data: {
                conversationId: targetConv.id,
                role: "assistant",
                content: notifyMsg,
              },
            });
            await prisma.conversation.update({
              where: { id: targetConv.id },
              data: { updatedAt: new Date() },
            });
            logger.info(`[UnansweredResolve] Follow-up notification sent to ${contact} via ${targetConv.channel}`);
          }
        }
      } catch (notifyErr) {
        logger.warn("[UnansweredResolve] Failed to send notification:", { error: String(notifyErr) });
      }
    }

    return NextResponse.json({
      success: true,
      entry,
      userNotified,
    });
  } catch (error: any) {
    logger.error("Failed to resolve unanswered question:", error);
    return NextResponse.json(
      { error: error?.message || "فشل اعتماد الإجابة وحفظها" },
      { status: 500 }
    );
  }
}
