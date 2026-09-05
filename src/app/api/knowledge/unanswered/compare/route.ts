import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isAssistantRefusal } from "@/lib/ai/refusal-detector";
import { chat, createNewConversation, getAIConfig, callExternalAiFallback } from "@/lib/ai/engine";
import { sanitizeWhatsAppMessage } from "@/lib/channels/whatsapp";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { question, mode = "both" } = await request.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "نص السؤال مطلوب للمقارنة" }, { status: 400 });
    }

    const cleanQuestion = question.trim();
    const config = await getAIConfig();

    let localResult: {
      answer: string;
      hasAnswer: boolean;
      status: "found_in_kb" | "refusal";
      message: string;
    } | null = null;

    let externalResult: {
      answer: string;
      hasAnswer: boolean;
      provider: string;
      model: string;
      status: "generated" | "disabled" | "failed";
      message: string;
    } | null = null;

    // 1. Run local-only check (pure Knowledge Base without external AI)
    if (mode === "both" || mode === "local_only") {
      const temp = await createNewConversation("web", "Compare Test Local", `temp-compare-local-${Date.now()}`);
      try {
        const rawLocalAnswer = await chat(temp.id, cleanQuestion, { disableExternalAi: true });
        const cleanLocalAnswer = sanitizeWhatsAppMessage(rawLocalAnswer);
        const isRefusal = isAssistantRefusal(cleanLocalAnswer);

        localResult = {
          answer: cleanLocalAnswer,
          hasAnswer: !isRefusal,
          status: isRefusal ? "refusal" : "found_in_kb",
          message: isRefusal
            ? "المعلومة غير متوفرة حالياً في قاعدة المعرفة المحلية (تم إرجاع رد توقيفي / اعتذار)."
            : "تم العثور على إجابة مؤكدة في قاعدة المعرفة المحلية!",
        };
      } finally {
        try {
          await prisma.conversation.delete({ where: { id: temp.id } });
        } catch (_) {}
      }
    }

    // 2. Run external AI check (Gemini or Groq fallback)
    if (mode === "both" || mode === "external_only") {
      const provider = config.externalAiProvider || "groq";
      const model = config.externalAiModel || (provider === "gemini" ? "gemini-3.6-flash" : "openai/gpt-oss-120b");
      const hasApiKey = !!(config.externalAiApiKey || config.apiKey || config.fallbackApiKey);

      if (!hasApiKey) {
        externalResult = {
          answer: "",
          hasAnswer: false,
          provider,
          model,
          status: "disabled",
          message: "مفتاح الذكاء الاصطناعي الخارجي غير متوفر في الإعدادات.",
        };
      } else {
        try {
          const rawExternalAnswer = await callExternalAiFallback(config, cleanQuestion, []);
          if (rawExternalAnswer) {
            const cleanExternal = sanitizeWhatsAppMessage(rawExternalAnswer);
            externalResult = {
              answer: cleanExternal,
              hasAnswer: true,
              provider,
              model,
              status: "generated",
              message: `تم توليد الإجابة بنجاح بواسطة ${provider.toUpperCase()} (${model}).`,
            };
          } else {
            externalResult = {
              answer: "",
              hasAnswer: false,
              provider,
              model,
              status: "failed",
              message: "لم يتمكن الذكاء الخارجي من إرجاع إجابة لهذا السؤال.",
            };
          }
        } catch (err: any) {
          externalResult = {
            answer: "",
            hasAnswer: false,
            provider,
            model,
            status: "failed",
            message: err?.message || "خطأ أثناء الاتصال بالذكاء الخارجي.",
          };
        }
      }
    }

    let differenceSummary = "";
    if (localResult && externalResult) {
      if (localResult.hasAnswer && externalResult.hasAnswer) {
        differenceSummary = "كلا المصدرين يقدمان إجابة: القاعدة المحلية توفر الجواب الرسمي المعتمد، والذكاء الخارجي يقدم صيغته العامة.";
      } else if (!localResult.hasAnswer && externalResult.hasAnswer) {
        differenceSummary = `فرق حاسم: السؤال يفتقر إلى بيانات في القاعدة المحلية، بينما وفّر الذكاء الخارجي (${externalResult.provider.toUpperCase()}) إجابة كاملة يمكن اعتمادها وإضافتها لقاعدة المعرفة الآن.`;
      } else if (localResult.hasAnswer && !externalResult.hasAnswer) {
        differenceSummary = "القاعدة المحلية توفر الجواب المعتمد بينما تعذر الحصول على رد من الذكاء الخارجي.";
      } else {
        differenceSummary = "لا تتوفر إجابة لا في القاعدة المحلية ولا في الذكاء الخارجي.";
      }
    }

    return NextResponse.json({
      question: cleanQuestion,
      local: localResult,
      external: externalResult,
      differenceSummary,
    });
  } catch (error: any) {
    logger.error("Failed to compare question answers:", error);
    return NextResponse.json(
      { error: error?.message || "فشل اختبار ومقارنة السؤال" },
      { status: 500 }
    );
  }
}
