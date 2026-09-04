import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isLegitimateKnowledgeQuestion } from "@/lib/ai/refusal-detector";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    }

    // Determine question text: provided in body or extracted from latest customer message
    let questionText = typeof body.question === "string" ? body.question.trim() : "";
    if (!questionText) {
      const customerMsg = conversation.messages.find(
        (m) => (m.role === "customer" || m.role === "user") && (isLegitimateKnowledgeQuestion(m.content) || m.content.trim().length >= 2)
      );
      if (customerMsg) {
        questionText = customerMsg.content.trim();
      }
    }

    if (!questionText || questionText.length < 2) {
      return NextResponse.json(
        { error: "الرسالة فارغة ولا تحتوي على نص لسؤال" },
        { status: 400 }
      );
    }

    const currentMetadata = (conversation.metadata || {}) as Record<string, unknown>;

    function normalizeKey(str: string): string {
      return str.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
    }

    // Build or update the list of unanswered questions for this conversation
    const existingList: Array<{ question: string; messageId?: string; askedAt?: string }> =
      Array.isArray(currentMetadata.unansweredQuestions)
        ? [...(currentMetadata.unansweredQuestions as Array<{ question: string; messageId?: string; askedAt?: string }>)]
        : currentMetadata.unansweredQuestion
        ? [{ question: String(currentMetadata.unansweredQuestion), askedAt: String(currentMetadata.unansweredAt || "") }]
        : [];

    const normTarget = normalizeKey(questionText);
    const alreadyExists = existingList.some((item) => normalizeKey(item.question) === normTarget);

    if (!alreadyExists) {
      existingList.push({
        question: questionText,
        messageId: typeof body.messageId === "string" ? body.messageId : undefined,
        askedAt: new Date().toISOString(),
      });
    }

    // Mark as manually unanswered so it appears on /knowledge/unanswered
    const updatedMetadata = {
      ...currentMetadata,
      isManuallyUnanswered: true,
      unansweredQuestion: questionText, // latest
      unansweredQuestions: existingList,
      unansweredAt: new Date().toISOString(),
    };

    await prisma.conversation.update({
      where: { id },
      data: {
        status: "escalated",
        metadata: updatedMetadata,
        updatedAt: new Date(),
      },
    });

    logger.info(
      `[Conversations] Marked specific question in conversation ${id} as unanswered: "${questionText.slice(0, 50)}" (total: ${existingList.length})`
    );

    return NextResponse.json({
      success: true,
      question: questionText,
      conversationId: id,
      totalQuestions: existingList.length,
      unansweredQuestions: existingList,
      message: "تم تحويل هذا السؤال إلى قائمة الأسئلة بدون إجابة بنجاح لمتابعته وإعادة فحصه.",
    });
  } catch (error) {
    logger.error("[Conversations] Failed to mark unanswered:", error);
    return NextResponse.json(
      { error: "فشل تحويل المحادثة لقائمة الأسئلة بدون إجابة" },
      { status: 500 }
    );
  }
}
