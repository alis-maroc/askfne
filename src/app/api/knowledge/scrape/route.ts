import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { url, categoryId } = await req.json();

    if (!url || !categoryId) {
      return NextResponse.json(
        { error: "URL and Category ID are required" },
        { status: 400 }
      );
    }

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    let markdownContent = "";
    let extractedTitle = "";

    // Check if the URL points directly to a PDF
    if (url.toLowerCase().includes(".pdf")) {
      try {
        const { extractTextFromPdfUrl } = await import("@/lib/pdf-extractor");
        const cleanText = await extractTextFromPdfUrl(url);

        try {
          const rawFilename = decodeURIComponent(url.split("/").pop() || "")
            .replace(/\.pdf.*$/i, "")
            .replace(/[-_+]/g, " ")
            .trim();
          if (rawFilename) extractedTitle = rawFilename;
        } catch {}

        markdownContent = [
          `📄 **وثيقة رسمية بصيغة PDF**`,
          `🔗 **رابط التحميل المباشر:** [تحميل وثيقة PDF](${url})`,
          "",
          cleanText && cleanText.length > 40
            ? `### النص الكامل المستخرج من الوثيقة:\n\n${cleanText}`
            : "وثيقة بصيغة PDF متاحة للتحميل عبر الرابط أعلاه.",
        ].join("\n");
      } catch (pdfErr) {
        return NextResponse.json(
          { error: `Erreur lors de l'extraction du PDF : ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}` },
          { status: 500 }
        );
      }
    } else {
      // Fetch from Jina Reader (removes ads, menus, returns clean markdown)
      const jinaUrl = `https://r.jina.ai/${url}`;
      const response = await fetch(jinaUrl, {
        headers: {
          Accept: "text/plain", // Request raw text/markdown
          "X-Return-Format": "markdown",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch from Jina AI: ${response.status} ${errorText}`);
      }

      markdownContent = await response.text();

      // Detect any embedded or linked PDF files on the page (common in MEN and educational portals)
      try {
        const { extractPdfLinksFromContent, extractTextFromPdfUrl } = await import("@/lib/pdf-extractor");
        const pdfLinks = extractPdfLinksFromContent(markdownContent, url);

        if (pdfLinks.length > 0) {
          const extractedPdfSections: string[] = [];
          for (const pdfLink of pdfLinks.slice(0, 3)) {
            const pdfText = await extractTextFromPdfUrl(pdfLink);
            if (pdfText && pdfText.length > 40) {
              const pdfName = decodeURIComponent(pdfLink.split("/").pop() || "الوثيقة المرفقة");
              extractedPdfSections.push(
                `### 📄 النص المستخرج من المرفق [${pdfName}](${pdfLink}):\n\n${pdfText}`
              );
            }
          }
          if (extractedPdfSections.length > 0) {
            markdownContent = `${markdownContent}\n\n---\n\n${extractedPdfSections.join("\n\n---\n\n")}`;
          }
        }
      } catch (embErr) {
        console.warn("[Web Scrape] Embedded PDF extraction warning:", embErr);
      }
    }

    if (!markdownContent || markdownContent.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract content from the provided URL" },
        { status: 400 }
      );
    }

    // Extract clean title
    let title = extractedTitle || "مقال مستورد من الموقع";
    if (!extractedTitle) {
      const jinaTitleMatch = markdownContent.match(/^Title:\s*(.+)$/m);
      const h1Match = markdownContent.match(/^#\s+(.+)$/m);

      if (jinaTitleMatch && jinaTitleMatch[1]?.trim()) {
        title = jinaTitleMatch[1].trim();
      } else if (h1Match && h1Match[1]?.trim()) {
        title = h1Match[1].trim();
      } else {
        try {
          const parsedUrl = new URL(url);
          title = `مقال من ${parsedUrl.hostname}`;
        } catch (e) {
          // Ignore URL parsing error
        }
      }
    }

    // Strip markdown images, links, and symbols from title so it is 100% clean text
    title = title
      .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, "")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/[#*`_]/g, "")
      .trim();

    if (!title) {
      title = "مقال مستورد من الموقع";
    }

    // Clean content: remove header navigation links if an H1 title is found in the body
    let cleanContent = markdownContent;
    const h1Index = markdownContent.indexOf("\n# ");
    if (h1Index !== -1) {
      cleanContent = markdownContent.substring(h1Index + 1);
    } else {
      // Remove Jina metadata headers (Title:, URL Source:, Markdown Content:)
      cleanContent = cleanContent
        .replace(/^Title:.*$/m, "")
        .replace(/^URL Source:.*$/m, "")
        .replace(/^Published Time:.*$/m, "")
        .replace(/^Markdown Content:\s*/m, "")
        .trim();
    }

    // Trim bottom footer, comment section, and social footer
    const footerMarkers = ["\nاترك تعليق", "\n### اترك تعليق", "\n## اترك تعليق", "منشورات هذا الموقع مرخصة"];
    for (const marker of footerMarkers) {
      const idx = cleanContent.indexOf(marker);
      if (idx !== -1) {
        cleanContent = cleanContent.substring(0, idx).trim();
      }
    }

    // Save to the knowledge base
    const entry = await prisma.knowledgeEntry.create({
      data: {
        categoryId,
        title,
        content: cleanContent.substring(0, 50000), // Protect against overly large pages
        priority: 0,
        isActive: true,
        metadata: {
          source: "web_scrape",
          originalUrl: url,
          importedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error: any) {
    console.error("[Web Scrape Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scrape the URL" },
      { status: 500 }
    );
  }
}
