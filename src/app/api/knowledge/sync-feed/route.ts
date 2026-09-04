import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TARGET_WP_CATEGORIES = [79, 60, 76]; // 79: بيانات و بلاغات, 60: المكتب الوطني, 76: مستجدات وأخبار

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8230;/g, "…")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanTitle(title: string): string {
  return decodeHtmlEntities(title)
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/[#*`_]/g, "")
    .trim();
}

function htmlToCleanArticle(html: string): string {
  if (!html) return "";
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");

  text = decodeHtmlEntities(text);

  // Clean social/footer markers and embedded PDF viewer noise
  const footerMarkers = [
    "Loading...",
    "Taking too long?",
    "Reload document",
    "Open in new tab",
    "شارك هذا الموضوع",
    "المشاركة على X",
    "المشاركة على Twitter",
    "المشاركة على Telegram",
    "المشاركة على WhatsApp",
    "شارك على فيس بوك",
    "شارك على فيسبوك",
    "مرتبط:",
    "اترك تعليق",
    "منشورات هذا الموقع مرخصة",
    "تواصل معنا على الواتساب",
  ];

  for (const marker of footerMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.substring(0, idx).trim();
    }
  }

  // Remove any remaining PDF attachment/viewer tags
  text = text
    .replace(/تحميل\s*\[?\s*\d+(\.\d+)?\s*(KB|MB|Go|Mo|Ko)\s*\]?/gi, "")
    .replace(/\[embeddoc[\s\S]*?\]/gi, "");

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// GET: Retrieve current sync status and stats
export async function GET() {
  try {
    // Ensure WpProcessedPost table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WpProcessedPost" (
        "wpPostId" INT PRIMARY KEY,
        "title" TEXT NOT NULL,
        "url" TEXT,
        "status" TEXT NOT NULL DEFAULT 'imported',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    const category = await prisma.category.findFirst({
      where: { name: "الموقع الإلكتروني للجامعة" },
    });

    const totalInDb = category
      ? await prisma.knowledgeEntry.count({ where: { categoryId: category.id } })
      : 0;

    const processedRows: Array<{ status: string; count: string }> = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*)::text as count FROM "WpProcessedPost" GROUP BY status
    `);

    let totalImportedTracked = 0;
    let totalDeletedTracked = 0;
    for (const r of processedRows) {
      if (r.status === "deleted") totalDeletedTracked = parseInt(r.count, 10);
      else totalImportedTracked += parseInt(r.count, 10);
    }

    // Estimate next page
    const totalProcessed = totalImportedTracked + totalDeletedTracked;
    const suggestedNextPage = Math.floor(totalProcessed / 100) + 1;

    return NextResponse.json({
      categoryId: category?.id || null,
      categoryName: "الموقع الإلكتروني للجامعة",
      totalInDb,
      totalImportedTracked,
      totalDeletedTracked,
      suggestedNextPage,
      targetCategories: [
        { id: 79, name: "بيانات و بلاغات", totalInWp: 2375 },
        { id: 60, name: "المكتب الوطني", totalInWp: 314 },
        { id: 76, name: "مستجدات وأخبار", totalInWp: 260 },
      ],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to get stats" }, { status: 500 });
  }
}

export async function executeTaalimSync(options: {
  page?: number;
  perPage?: number;
  categories?: number[];
  categoryId?: string;
} = {}) {
  const {
    page = 1,
    perPage = 100,
    categories = TARGET_WP_CATEGORIES,
    categoryId: customCategoryId,
  } = options;

  try {

    // Ensure WpProcessedPost table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WpProcessedPost" (
        "wpPostId" INT PRIMARY KEY,
        "title" TEXT NOT NULL,
        "url" TEXT,
        "status" TEXT NOT NULL DEFAULT 'imported',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Target category in Database
    let category = null;
    if (customCategoryId) {
      category = await prisma.category.findUnique({ where: { id: customCategoryId } });
    }
    if (!category) {
      category = await prisma.category.findFirst({
        where: { name: "الموقع الإلكتروني للجامعة" },
      });
    }
    if (!category) {
      // Create it if it doesn't exist
      category = await prisma.category.create({
        data: {
          name: "الموقع الإلكتروني للجامعة",
          description: "مقالات، بيانات ومستجدات الموقع الإلكتروني الرسمي Taalim.org",
          icon: "Globe",
          color: "#059669",
        },
      });
    }

    const categoryId = category.id;
    const pageNum = Math.max(1, Number(page) || 1);
    const perPageNum = Math.min(Math.max(Number(perPage) || 100, 1), 100);
    const catList = Array.isArray(categories) && categories.length > 0 ? categories.join(",") : "79,60,76";

    // Call WordPress REST API (starts with the most recent articles and goes backwards in time)
    const wpUrl = `https://taalim.org/wp-json/wp/v2/posts?categories=${catList}&per_page=${perPageNum}&page=${pageNum}&orderby=date&order=desc&_fields=id,date,title,content,excerpt,link,categories`;

    const wpRes = await fetch(wpUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FNE-Bot/1.0",
        Accept: "application/json",
      },
    });

    if (!wpRes.ok) {
      if (wpRes.status === 400) {
        // WordPress returns 400 when page number exceeds total pages
        return {
          success: true,
          message: "تم استيراد كافة الصفحات المتوفرة",
          page: pageNum,
          imported: 0,
          skipped: 0,
          hasMore: false,
        };
      }
      throw new Error(`WordPress REST API error: ${wpRes.status} ${wpRes.statusText}`);
    }

    const totalPostsHeader = parseInt(wpRes.headers.get("x-wp-total") || "0", 10);
    const totalPagesHeader = parseInt(wpRes.headers.get("x-wp-totalpages") || "0", 10);

    const posts: any[] = await wpRes.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      return {
        success: true,
        page: pageNum,
        imported: 0,
        skipped: 0,
        hasMore: false,
        message: "لا توجد مقالات في هذه الصفحة",
      };
    }

    // Load all already-processed IDs (both imported and user-deleted)
    const processedRows: Array<{ wpPostId: number }> = await prisma.$queryRawUnsafe(
      'SELECT "wpPostId" FROM "WpProcessedPost"'
    );
    const processedSet = new Set(processedRows.map((r) => r.wpPostId));

    let importedCount = 0;
    let skippedCount = 0;

    for (const post of posts) {
      // 1. Skip if already processed or deleted by user
      if (processedSet.has(post.id)) {
        skippedCount++;
        continue;
      }

      const rawTitle = post.title?.rendered || "";
      const finalTitle = cleanTitle(rawTitle);

      // Skip if empty title
      if (!finalTitle || finalTitle.length < 5) {
        skippedCount++;
        // Track as ignored so we don't retry
        await prisma.$executeRawUnsafe(
          `INSERT INTO "WpProcessedPost" ("wpPostId", "title", "url", "status") 
           VALUES ($1, $2, $3, 'ignored') ON CONFLICT ("wpPostId") DO NOTHING`,
          post.id,
          finalTitle || `Post ${post.id}`,
          post.link || ""
        );
        processedSet.add(post.id);
        continue;
      }

      let content = htmlToCleanArticle(post.content?.rendered || "");
      if (!content || content.length < 50) {
        content = htmlToCleanArticle(post.excerpt?.rendered || "");
      }
      if (!content || content.length < 50) {
        content = `${finalTitle}\n\nبيان منشور على الموقع الرسمي للجامعة الوطنية للتعليم FNE.\nرابط المقال: ${post.link}`;
      }

      const originalDate = post.date ? new Date(post.date) : new Date();

      // 2. Create KnowledgeEntry
      await prisma.knowledgeEntry.create({
        data: {
          categoryId,
          title: finalTitle,
          content: content.substring(0, 60000),
          priority: 50,
          isActive: true,
          createdAt: originalDate,
          metadata: {
            source: "taalim_rest_api",
            wpPostId: post.id,
            originalUrl: post.link,
            wpCategories: post.categories,
            importedBatchPage: pageNum,
            importedAt: new Date().toISOString(),
          },
        },
      });

      // 3. Track in WpProcessedPost so it is NEVER duplicated or re-imported if deleted
      await prisma.$executeRawUnsafe(
        `INSERT INTO "WpProcessedPost" ("wpPostId", "title", "url", "status") 
         VALUES ($1, $2, $3, 'imported') ON CONFLICT ("wpPostId") DO NOTHING`,
        post.id,
        finalTitle,
        post.link || ""
      );
      processedSet.add(post.id);
      importedCount++;
    }

    const hasMore = pageNum < totalPagesHeader;
    const nextPage = hasMore ? pageNum + 1 : null;

    return {
      success: true,
      page: pageNum,
      totalPages: totalPagesHeader,
      totalWpPosts: totalPostsHeader,
      fetchedInBatch: posts.length,
      imported: importedCount,
      skipped: skippedCount,
      hasMore,
      nextPage,
    };
  } catch (error: any) {
    console.error("[WordPress Batch Import Error]:", error);
    throw error;
  }
}

// POST: Batch import 100 articles from WordPress REST API via HTTP
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await executeTaalimSync(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to import batch" },
      { status: 500 }
    );
  }
}
