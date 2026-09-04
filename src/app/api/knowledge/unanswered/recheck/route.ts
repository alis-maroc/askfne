import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isAssistantRefusal } from "@/lib/ai/refusal-detector";
import { chat, createNewConversation } from "@/lib/ai/engine";
import { sanitizeWhatsAppMessage } from "@/lib/channels/whatsapp";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { question, conversationId } = await request.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "نص السؤال مطلوب لإعادة الفحص" }, { status: 400 });
    }

    const cleanQuestion = question.trim();

    // ALWAYS use an isolated temporary conversation for verification so the real customer conversation isn't polluted with test runs
    const temp = await createNewConversation("web", "Recheck Test", `temp-recheck-${Date.now()}`);
    const testConvId = temp.id;


    // Query the AI with the updated Knowledge Base
    const rawAnswer = await chat(testConvId, cleanQuestion);
    const cleanAnswer = sanitizeWhatsAppMessage(rawAnswer);

    // Check if the model still admits lack of knowledge / refuses
    const isRefusal = isAssistantRefusal(cleanAnswer);

    if (isRefusal) {
      return NextResponse.json({
        hasAnswer: false,
        answer: cleanAnswer,
        message: "قاعدة المعرفة الحالية لا تزال لا تحتوي على معطيات كافية لهذا السؤال.",
      });
    }

    return NextResponse.json({
      hasAnswer: true,
      answer: cleanAnswer,
      message: "تم العثور على إجابة مؤكدة ومفصلة في قاعدة المعرفة المحدثة!",
    });
  } catch (error: any) {
    logger.error("Failed to recheck unanswered question:", error);
    return NextResponse.json(
      { error: error?.message || "فشل إعادة اختبار السؤال" },
      { status: 500 }
    );
  }
}
