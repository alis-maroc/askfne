import { NextRequest, NextResponse } from "next/server";
import { chat, checkKeywordTriggers, createNewConversation } from "@/lib/ai/engine";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MENU_TEXT = "السلام عليكم! مرحبا بك، كيف يمكنني مساعدتك اليوم؟\nاختر أحد المواضيع من الأزرار أسفله أو اكتب سؤالك مباشرة:";

const MENU_LABELS: Record<string, string> = {
  "1": "المكاتب والتنظيم",
  "2": "القانون الأساسي ديال الجامعة",
  "3": "مقرر السنة الدراسية",
  "4": "النظام الأساسي للوظيفة العمومية",
  "5": "الدخول المدرسي",
  "10": "ملاحظات واقتراحات",
};

const MENU_HINTS: Record<string, string> = {
  "1": "مثلا: كيفاش كيتأسس المكتب المحلي، شروط الانخراط، شكون هما أعضاء المكتب الوطني، أو أي سؤال آخر...",
  "2": "مثلا: شنو هي أهداف الجامعة، اختصاصات المجلس الوطني، شنو كيقول الفصل 15، أو أي سؤال آخر...",
  "3": "مثلا: متى العطلة المدرسية القادمة، تواريخ الامتحانات، فترات المراقبة المستمرة، أو أي سؤال آخر...",
  "4": "مثلا: شنو هي الرخص الصحية، شروط الترقية، العقوبات التأديبية، أو أي سؤال آخر...",
  "5": "مثلا: إجراءات الدخول المدرسي، تدبير الفائض والخصاص، الحركة الانتقالية للموارد البشرية، أو أي سؤال آخر...",
};

function normalizeChoice(input: string): string | null {
  const value = input.trim().replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632));
  return /^[0-5]$|^10$/.test(value) ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationId, channel, customerName, customerContact } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (message.length > 10000) {
      return NextResponse.json({ error: "Message exceeds maximum length of 10000 characters" }, { status: 400 });
    }

    let convId = typeof conversationId === "string" && conversationId.trim()
      ? conversationId.trim()
      : "";

    let conversation;
    if (convId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: convId },
      });
      if (!conversation) {
        convId = "";
      }
    }

    if (!convId || !conversation) {
      conversation = await createNewConversation(
        channel || "api",
        customerName || "API User",
        customerContact || ""
      );
      convId = conversation.id;
    }

    const metadata = (conversation.metadata || {}) as Record<string, unknown>;
    const choice = normalizeChoice(message);
    const awaitingMenuChoice = metadata.awaitingMenuChoice === true;
    const menuShown = metadata.menuShown === true;
    const awaitingSuggestion = metadata.awaitingSuggestion === true;
    let response: string;

    if (choice === "0") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: true, awaitingSuggestion: false } },
      });
      response = MENU_TEXT;
    } else if (choice === "10") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, awaitingSuggestion: true, menuShown: true, awaitingMenuChoice: false } },
      });
      response = "📨 *ملاحظة / اقتراح*\n\nشكرًا لرغبتك في المشاركة! الرجاء كتابة ملاحظتك أو اقتراحك بشكل واضح وسنطلع عليها ونأخذها بعين الاعتبار.\n\n_(أرسل 0 للإلغاء والرجوع للقائمة الرئيسية)_";
    } else if (awaitingSuggestion) {
      try {
        await (prisma as any).ticket.create({
          data: {
            title: `💡 اقتراح / ملاحظة — ويب شات (${customerName || "زائر"})`,
            description: message.trim(),
            status: "open",
            priority: "low",
            type: "suggestion",
            conversationId: conversation.id,
          },
        });
      } catch (sugErr) {
        logger.warn("[Chat] Failed to save suggestion as ticket:", { error: String(sugErr) });
      }
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, awaitingSuggestion: false, menuShown: true, awaitingMenuChoice: true } },
      });
      response = "✅ شكرًا جزيلاً على ملاحظتك واقتراحك! تم تسجيلها وسيطلع عليها المسؤولون في أقرب وقت.\n\nأرسل 0 للرجوع للقائمة الرئيسية.";
    } else if (choice && ["1", "2", "3", "4", "5"].includes(choice)) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...metadata,
            menuShown: true,
            awaitingMenuChoice: false,
            selectedMenuChoice: choice,
            selectedMenuLabel: MENU_LABELS[choice],
          },
        },
      });
      response = `مزيان، اخترتي: ${MENU_LABELS[choice]}.\nاضغط على أحد الأسئلة المقترحة أو اكتب سؤالك مباشرة:`;
    } else {
      // Check keyword triggers before AI
      const triggerReply = await checkKeywordTriggers(message.trim());
      const aiResponse = triggerReply ?? await chat(convId, message.trim());
      response = `${aiResponse}\n\nللاختيار من القائمة الرئيسية، صيفط 0.`;

      if (!menuShown || awaitingMenuChoice) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: false } },
        });
      }
    }

    return NextResponse.json({
      conversationId: convId,
      response,
    });
  } catch (error) {
    logger.error("Failed to process chat message:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
