import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { question, conversationId } = await request.json();

    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return NextResponse.json(
        { error: "نص السؤال مطلوب لتوليد المقترح" },
        { status: 400 }
      );
    }

    const cleanQuestion = question.trim();

    // 1. Fetch available categories
    const categories = await prisma.category.findMany({
      select: { id: true, name: true, description: true },
      orderBy: { name: "asc" },
    });

    // 2. Fetch context from knowledge base (keyword matches)
    const searchTerms = cleanQuestion
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 5);

    let relatedEntries: Array<{ title: string; content: string }> = [];
    if (searchTerms.length > 0) {
      relatedEntries = await prisma.knowledgeEntry.findMany({
        where: {
          OR: searchTerms.map((term) => ({
            OR: [
              { title: { contains: term, mode: "insensitive" } },
              { content: { contains: term, mode: "insensitive" } },
            ],
          })),
        },
        select: { title: true, content: true },
        take: 4,
        orderBy: { priority: "desc" },
      });
    }

    // Context from conversation if provided
    let conversationHistory = "";
    if (conversationId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 4,
            select: { role: true, content: true },
          },
        },
      });
      if (conv?.messages) {
        conversationHistory = conv.messages
          .reverse()
          .map((m) => `${m.role === "assistant" ? "المساعد" : "المنخرط"}: ${m.content}`)
          .join("\n");
      }
    }

    // 3. Get AI settings
    const settings = await prisma.settings.findFirst();
    const apiKey =
      settings?.aiApiKey ||
      process.env.GROQ_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "";
    const provider = settings?.aiProvider || (process.env.GROQ_API_KEY ? "groq" : "openai");
    const model =
      settings?.aiModel ||
      (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

    if (!apiKey) {
      return NextResponse.json(
        { error: "مفتاح الذكاء الاصطناعي غير متوفر في الإعدادات" },
        { status: 500 }
      );
    }

    let baseURL: string | undefined = undefined;
    if (provider === "groq") baseURL = "https://api.groq.com/openai/v1";
    else if (provider === "openrouter") baseURL = "https://openrouter.ai/api/v1";
    else if (provider === "gemini") baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
    else if (provider === "grok" || provider === "xai") baseURL = "https://api.x.ai/v1";

    const openai = new OpenAI({ apiKey, baseURL });

    const categoriesList = categories
      .map((c) => `- معرف: "${c.id}" | الاسم: "${c.name}"${c.description ? ` (${c.description})` : ""}`)
      .join("\n");

    const kbContext = relatedEntries.length > 0
      ? relatedEntries.map((e) => `[مرجع: ${e.title}]\n${e.content.slice(0, 600)}`).join("\n\n")
      : "لا توجد مقالات سابقة مطابقة تماماً.";

    const prompt = `أنت خبير قانوني ونقابي وإداري في "الجامعة الوطنية للتعليم FNE" (المغرب).
ورد سؤال من أحد نساء أو رجال التعليم لم يجد له المساعد الآلي إجابة كافية، والمطلوب صياغة مقال إجابة رسمي ودقيق ومهني ليتم حفظه في قاعدة المعرفة (Knowledge Base) لخدمة جميع المنخرطين.

السؤال المطروح:
«${cleanQuestion}»

${conversationHistory ? `سياق المحادثة السابقة:\n${conversationHistory}\n` : ""}
معطيات مرجعية من النظام:
${kbContext}

قائمة الفئات المتاحة في النظام:
${categoriesList}

المطلوب: توليد كائن JSON صالح فقط (Valid JSON) دون أي شروحات أو مقدمات خارج JSON، بالبنية التالية تماماً:
{
  "title": "عنوان واضح وشامل للمقال (مثال: شروط ومساطر الترقية بالشهادات...)",
  "content": "نص الإجابة التفصيلية والمنظمة بنقاط واضحة ومقنعة تخاطب نساء ورجال التعليم بلغة نقابية وإدارية رصينة (FNE)، موضحاً الشروط والإجراءات الرسمية والمراجع القانونية المعتمدة إن وجدت.",
  "categoryId": "معرف الفئة الأنسب من القائمة أعلاه (استخدم المعرف الدقيق ID)",
  "priority": 10
}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a specialized Moroccan educational and trade-union legal expert for FNE (Fédération Nationale de l'Enseignement). Respond ONLY with a valid JSON object.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    });

    const rawResponse = completion.choices[0]?.message?.content || "";
    let parsed: any = null;

    try {
      // Clean possible markdown code fences
      const cleanedJson = rawResponse
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleanedJson);
    } catch (parseErr) {
      logger.warn("[UnansweredDraft] Failed to parse JSON response:", { rawResponse });
      // Fallback
      parsed = {
        title: cleanQuestion,
        content: rawResponse,
        categoryId: categories[0]?.id || "",
        priority: 10,
      };
    }

    // Resolve category name
    const matchedCategory = categories.find((c) => c.id === parsed.categoryId);
    const categoryName = matchedCategory ? matchedCategory.name : (categories[0]?.name || "عام");
    const finalCategoryId = matchedCategory ? matchedCategory.id : (categories[0]?.id || "");

    return NextResponse.json({
      success: true,
      draft: {
        title: parsed.title || cleanQuestion,
        content: parsed.content || "",
        categoryId: finalCategoryId,
        categoryName,
        priority: Number(parsed.priority) || 10,
      },
    });
  } catch (error: any) {
    logger.error("Failed to generate unanswered question draft:", error);
    return NextResponse.json(
      { error: error?.message || "فشل توليد الإجابة المقترحة بالذكاء الاصطناعي" },
      { status: 500 }
    );
  }
}
