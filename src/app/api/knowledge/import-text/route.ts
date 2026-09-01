import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

export async function POST(request: Request) {
  try {
    const { text, categoryId: fallbackCategoryId } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    const apiKey = settings?.aiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key missing. Please configure it in settings." }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    
    // Fetch categories for context
    const categories = await prisma.category.findMany({ select: { id: true, name: true } });
    const categoryList = categories.map(c => `- ID: ${c.id}, Name: ${c.name}`).join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that extracts knowledge base entries from raw pasted text.
You need to analyze the text and output a JSON object with:
- title: A concise and clear title for the entry in Arabic.
- content: The well-formatted content, maintaining all important details in Arabic.
- categoryId: The ID of the best matching category from the following list:
${categoryList}
If none matches well, use this fallback ID: ${fallbackCategoryId || categories[0]?.id || ""}

Output ONLY raw valid JSON, no markdown blocks. Example:
{
  "title": "عنوان المقال",
  "content": "نص المقال منسق...",
  "categoryId": "category-id-here"
}`
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
    });

    const output = JSON.parse(response.choices[0].message.content || "{}");
    
    const entry = await prisma.knowledgeEntry.create({
      data: {
        title: output.title || "بدون عنوان",
        content: output.content || text,
        categoryId: output.categoryId || fallbackCategoryId || categories[0]?.id,
        priority: 0,
        isActive: true,
      }
    });

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error("import-text error:", error);
    return NextResponse.json({ error: "Failed to process text" }, { status: 500 });
  }
}
