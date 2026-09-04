import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import https from "https";
import crypto from "crypto";
import { cleanArabicExtractedPdf } from "@/lib/arabic-cleaner";
import { extractTextWithOcr, isOcrAvailable } from "@/lib/pdf-ocr";

const MEN_IP = "196.200.143.135";
const MEN_HOST = "www.men.gov.ma";
const MEN_BASE_URL = "https://www.men.gov.ma";
const DEFAULT_CATEGORY_NAME = "مذكرات وبلاغات وزارة التربية الوطنية";

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
    .replace(/&nbsp;/g, " ")
    .trim();
}

function cleanHtml(html: string): string {
  if (!html) return "";
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<td[^>]*>/gi, " ")
    .replace(/<\/td>/gi, " | ")
    .replace(/<th[^>]*>/gi, " ")
    .replace(/<\/th>/gi, " | ")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

function cleanPortalTitle(raw: string): string {
  if (!raw) return "";
  let t = raw
    .replace(/\b(?:عرض المزيد|اكتشف المزيد|تنزيل|تحميل|الموضوع|الوثيقة)\b/g, " ")
    .replace(/^\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[A-Za-z]{3,9})\s+\d{4}\s*/gi, "")
    .replace(/^\s*\d{1,2}\s+(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليوز|غشت|شتنبر|أكتوبر|نونبر|دجنبر)\s+\d{4}\s*/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t;
}

function computeMenId(url: string, title: string): string {
  const hash = crypto.createHash("md5").update(url + title).digest("hex");
  return `men_${hash.substring(0, 16)}`;
}

async function fetchFromMen(rawUrlOrPath: string): Promise<string> {
  let path = rawUrlOrPath;
  if (path.startsWith("http")) {
    try {
      const parsed = new URL(rawUrlOrPath);
      path = parsed.pathname + parsed.search;
    } catch {
      // keep rawUrlOrPath
    }
  }
  if (!path.startsWith("/")) path = "/" + path;

  const fullUrl = `${MEN_BASE_URL}${path}`;

  // Docker has no DNS for men.gov.ma — use async curl with --resolve to bypass DNS without blocking Node.js event loop
  try {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    const cmd = `curl -sL -k --max-time 15 --resolve "${MEN_HOST}:443:${MEN_IP}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" "${fullUrl}"`;
    const { stdout } = await execAsync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    if (stdout && stdout.length > 100) {
      return stdout;
    }
  } catch (err) {
    logger.warn(`[Sync-MEN] curl --resolve failed for ${fullUrl}:`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return "";
}

async function fetchPdfBufferFromMen(rawUrlOrPath: string): Promise<Buffer | null> {
  let path = rawUrlOrPath;
  if (path.startsWith("http")) {
    try {
      const parsed = new URL(rawUrlOrPath);
      path = parsed.pathname + parsed.search;
    } catch {
      // keep rawUrlOrPath
    }
  }
  if (!path.startsWith("/")) path = "/" + path;

  const fullUrl = `${MEN_BASE_URL}${path}`;

  // Docker has no DNS for men.gov.ma — use curl with --resolve to bypass DNS
  try {
    const { execSync } = require("child_process");
    const cmd = `curl -sL -k --max-time 20 --resolve "${MEN_HOST}:443:${MEN_IP}" -H "User-Agent: Mozilla/5.0" "${fullUrl}"`;
    const buffer = execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    if (buffer && buffer.length > 500) {
      return buffer;
    }
  } catch {
    // ignore
  }
  return null;
}

// cleanArabicExtractedPdf is imported from @/lib/arabic-cleaner

// Use centralized robust PDF extractor
async function extractPdfTextFromUrl(pdfUrl: string): Promise<string> {
  try {
    const { extractTextFromPdfUrl } = await import("@/lib/pdf-extractor");
    return await extractTextFromPdfUrl(pdfUrl);
  } catch (err) {
    logger.warn(`[Sync-MEN] Could not parse PDF text from ${pdfUrl}:`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

// GET: Stats about synced men.gov.ma articles
export async function GET() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MenProcessedItem" (
        "id" TEXT PRIMARY KEY,
        "url" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'imported',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Clean up duplicate/vague surplus entry and boost practical guide
    await prisma.knowledgeEntry.updateMany({
      where: { id: "61bef001-d22a-49f9-a35a-e4d65e2ad5f7" },
      data: { isActive: false },
    });
    await prisma.knowledgeEntry.updateMany({
      where: { id: "7b59cbd0-e481-4a72-b75f-a36103122844" },
      data: { priority: 100, isActive: true },
    });

    const category = await prisma.category.findFirst({
      where: { name: DEFAULT_CATEGORY_NAME },
    });

    const totalActive = category
      ? await prisma.knowledgeEntry.count({
        where: { categoryId: category.id, isActive: true },
      })
      : 0;

    const statsRaw = (await prisma.$queryRawUnsafe(`
      SELECT "status", COUNT(*)::int as count FROM "MenProcessedItem" GROUP BY "status";
    `)) as Array<{ status: string; count: number }>;

    const importedCount = statsRaw.find((s) => s.status === "imported")?.count ?? 0;
    const deletedCount = statsRaw.find((s) => s.status === "deleted")?.count ?? 0;

    const recentProcessed = (await prisma.$queryRawUnsafe(`
      SELECT "id", "title", "url", "status", "updatedAt"
      FROM "MenProcessedItem"
      ORDER BY "updatedAt" DESC
      LIMIT 10;
    `)) as Array<any>;

    const totalProcessed = importedCount + deletedCount;
    const suggestedNextPage = Math.max(1, Math.floor(totalProcessed / 15) + 1);

    return NextResponse.json({
      category: category ? { id: category.id, name: category.name } : null,
      activeEntriesCount: totalActive,
      importedCount,
      deletedCount,
      suggestedNextPage,
      recentItems: recentProcessed,
    });
  } catch (error) {
    logger.error("[Sync-MEN] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to retrieve MEN sync status" },
      { status: 500 }
    );
  }
}

export function isRelevantForStaff(title: string, url: string): boolean {
  const norm = `${title} ${url}`.toLowerCase();

  // 1. Explicit exclusions (pupil-only sport, competitions, festivals, protocol)
  const excludedKeywords = [
    "رياضة مدرسية", "ألعاب القوى المدرسية", "بطولة مدرسية", "بطولة إفريقية",
    "كرة القدم المدرسية", "مونديال مدرسي", "عدو ريفي", "تظاهرة رياضية",
    "تحدي القراءة", "أولمبياد", "اولمبياد", "المباراة العامة للعلوم والتقنيات",
    "مهرجان سينمائي", "مهرجان وطني للسينما", "أنشطة صيفية لفائدة التلميذات",
    "ألبوم الصور", "ألبوم الفيديوهات", "استقبال سفير", "مأدبة عشاء", "بروتوكول", "فلكلور", "روبوتيك"
  ];

  for (const excl of excludedKeywords) {
    if (norm.includes(excl)) return false;
  }

  // 2. High priority inclusions for education staff
  const staffKeywords = [
    "مذكرة", "قرار", "مقرر", "حركة انتقالية", "استيداع", "إلحاق", "الحاق",
    "ترقية", "ترقي", "تقاعد", "نظام أساسي", "مباراة", "مباريات", "تفتيش",
    "تأطير", "أطر", "موظف", "موظفين", "أساتذة", "أستاذ", "أستاذة", "هيئة التدريس",
    "هيئة الإدارة", "مركز تكوين", "امتحان مهني", "امتحانات مهنية", "دخول مدرسي",
    "توقيع المحاضر", "محضر الدخول", "محضر الخروج", "عطل مدرسية", "منحة",
    "تعويضات", "أجرة", "اقتطاع", "أكاديمية", "مديرية إقليمية", "إجازة", "رخصة", "رخص",
    "توجيه", "تخطيط", "مستشار", "ملحق", "تعيين", "تأديب", "مجلس انضباطي",
    "حركة", "مؤسسات الريادة", "مدارس الريادة", "ساعات العمل"
  ];

  if (staffKeywords.some((kw) => norm.includes(kw))) {
    return true;
  }

  // Official circular and exam pages are always relevant
  if (url.includes("مذكرات") || url.includes("Notes") || url.includes("notes") || url.includes("مباريات")) {
    return true;
  }

  return false;
}

export async function executeMenSync(options: {
  requestedCatId?: string;
  mode?: string;
  customUrl?: string;
  limit?: number;
  page?: number;
}) {
  const { requestedCatId, mode = "auto", customUrl, limit = 20, page = 1 } = options;
  const pageNum = Math.max(1, Number(page) || 1);
  const isDirectUrl = mode === "url" && Boolean(customUrl);

  try {
    // Ensure MenProcessedItem table exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MenProcessedItem" (
      "id" TEXT PRIMARY KEY,
      "url" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'imported',
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Resolve or create category
  let targetCategoryId = requestedCatId;
  if (!targetCategoryId) {
    let defaultCat = await prisma.category.findFirst({
      where: { name: DEFAULT_CATEGORY_NAME },
    });
    if (!defaultCat) {
      defaultCat = await prisma.category.create({
        data: {
          name: DEFAULT_CATEGORY_NAME,
          description: "المقررات الوزارية، المذكرات التنظيمية، والبلاغات الصحفية الصادرة عن وزارة التربية الوطنية (men.gov.ma)",
          color: "#1e429f",
          icon: "Building",
        },
      });
    }
    targetCategoryId = defaultCat.id;
  }

  // Load set of previously deleted IDs so we NEVER re-import them
  const processedRows = (await prisma.$queryRawUnsafe(`
    SELECT "id", "status" FROM "MenProcessedItem";
  `)) as Array<{ id: string; status: string }>;

  const deletedIds = new Set(
    processedRows.filter((r) => r.status === "deleted").map((r) => r.id)
  );
  const existingImportedIds = new Set(
    processedRows.filter((r) => r.status === "imported").map((r) => r.id)
  );

  let itemsToProcess: Array<{ url: string; title: string; categoryHint: string }> = [];
  let skippedIrrelevantCount = 0;

  if (mode === "url" && customUrl) {
    itemsToProcess.push({
      url: customUrl,
      title: "",
      categoryHint: "مذكرة / بلاغ وزاري",
    });
  } else {
    // Auto / Batch mode: fetch paginated Drupal pages
    try {
      let pageUrls: string[] = [];
      if (pageNum === 1) {
        pageUrls = [
          "/",
          "/%D9%85%D8%B0%D9%83%D8%B1%D8%A7%D8%AA",
          "/%D8%A8%D9%84%D8%A7%D8%BA%D8%A7%D8%AA-%D8%B5%D8%AD%D9%81%D9%8A%D8%A9",
          "/%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA",
        ];
      } else {
        const drupalPage = pageNum - 1;
        pageUrls = [
          `/%D9%85%D8%B0%D9%83%D8%B1%D8%A7%D8%AA?page=${drupalPage}`,
          `/%D8%A8%D9%84%D8%A7%D8%BA%D8%A7%D8%AA-%D8%B5%D8%AD%D9%81%D9%8A%D8%A9?page=${drupalPage}`,
          `/%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA?page=${drupalPage}`,
        ];
      }

      const results = await Promise.allSettled(pageUrls.map((u) => fetchFromMen(u)));
      const rawPages = results
        .map((r) => (r.status === "fulfilled" ? r.value : ""))
        .filter(Boolean);

      for (const htmlContent of rawPages) {
        // 1. Direct PDF links with contextual filenames or titles
        const pdfRegex = /<a\s+[^>]*href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        for (const m of htmlContent.matchAll(pdfRegex)) {
          const href = m[1];
          let rawLabel = cleanPortalTitle(decodeHtmlEntities(m[2].replace(/<[^>]+>/g, " ")));
          if (!href.includes("/fr/")) {
            const fullPdfUrl = href.startsWith("http") ? href : `${MEN_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;

            let parsedTitle = rawLabel;
            if (!parsedTitle || parsedTitle.length < 5 || /^\d+$/.test(parsedTitle)) {
              try {
                const filename = decodeURIComponent(href.split("/").pop() || "")
                  .replace(/\.pdf.*$/i, "")
                  .replace(/[-_+]/g, " ")
                  .trim();
                if (filename.length > 3) parsedTitle = filename;
              } catch { }
            }

            // Apply staff relevance filter
            if (!isRelevantForStaff(parsedTitle || "", fullPdfUrl)) {
              skippedIrrelevantCount++;
              continue;
            }

            if (!itemsToProcess.some((i) => i.url === fullPdfUrl)) {
              itemsToProcess.push({
                url: fullPdfUrl,
                title: parsedTitle || "مذكرة وزارية رسمية (PDF)",
                categoryHint: "مذكرة وزارية / وثيقة رسمية (PDF)",
              });
            }
          }
        }

        // 2. Article Links (Drupal nodes, announcements, circulars)
        const linksMatches = htmlContent.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
        for (const m of linksMatches) {
          const href = m[1];
          const rawTitle = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, " "));
          const title = cleanPortalTitle(rawTitle);
          if (
            title.length > 15 &&
            !href.includes("/fr/") &&
            !href.includes("/admin") &&
            !href.endsWith(".pdf")
          ) {
            const fullUrl = href.startsWith("http") ? href : `${MEN_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;

            // Apply staff relevance filter
            if (!isRelevantForStaff(title, fullUrl)) {
              skippedIrrelevantCount++;
              continue;
            }

            if (!itemsToProcess.some((i) => i.url === fullUrl || i.title === title)) {
              itemsToProcess.push({
                url: fullUrl,
                title,
                categoryHint: title.includes("بلاغ") ? "بلاغ صحفي" : "مذكرة وزارية",
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error("[Sync-MEN] Error listing items from men.gov.ma:", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Limit items to process
  itemsToProcess = itemsToProcess.slice(0, Number(limit) || 15);

    let importedCount = 0;
    let skippedDeletedCount = 0;
    let skippedExistingCount = 0;
    const importedEntries = [];

    for (const item of itemsToProcess) {
      const menItemId = computeMenId(item.url, item.title);

      // Check if user previously deleted this item (only skip in automated batch mode, NOT when explicit or direct URL)
      if (!isDirectUrl && deletedIds.has(menItemId)) {
        skippedDeletedCount++;
        continue;
      }

      // Check if title already exists in KnowledgeEntry
      const existingEntry = await prisma.knowledgeEntry.findFirst({
        where: {
          categoryId: targetCategoryId,
          title: item.title,
        },
      });

      // If an existing entry is only a placeholder stub without extracted text, allow updating it to upgrade quality
      const isPlaceholderStub = !!(
        existingEntry &&
        existingEntry.content.includes("وثيقة ومذكرة رسمية صادرة") &&
        !existingEntry.content.includes("النص المرجعي")
      );

      // In auto batch mode, skip if already imported and not a stub
      if (!isDirectUrl && existingImportedIds.has(menItemId) && !isPlaceholderStub) {
        skippedExistingCount++;
        continue;
      }
      if (existingEntry && !isDirectUrl && !isPlaceholderStub) {
        skippedExistingCount++;
        continue;
      }

      // Fetch article page details or parse direct PDF
      let contentText = "";
      let pdfLinks: string[] = [];
      let directPdfExtractedText = "";
      const isDirectPdf = item.url && item.url.toLowerCase().includes(".pdf");
      if (isDirectPdf) {
        pdfLinks = [item.url];
        try {
          const rawName = decodeURIComponent(item.url.split("/").pop() || "")
            .replace(/\.pdf.*$/i, "")
            .replace(/[-_+]/g, " ")
            .trim();
          if (rawName && (!item.title || item.title.length < 5)) {
            item.title = rawName;
          }
        } catch { }

        if (!item.title) {
          item.title = "مذكرة وزارية رسمية (وثيقة PDF)";
        }
        item.categoryHint = "مذكرة وزارية / وثيقة رسمية (PDF)";

        try {
          directPdfExtractedText = await extractPdfTextFromUrl(item.url);
          if (directPdfExtractedText && directPdfExtractedText.length > 40) {
            // First: check if PDF contains an explicit "الموضوع:" line (standard Moroccan circular format)
            const subjectMatch = directPdfExtractedText.match(/الموضوع\s*:\s*([^\n\r\.]+)/);
            if (subjectMatch && subjectMatch[1].trim().length > 10) {
              item.title = subjectMatch[1].trim().replace(/^[-–•*#\s]+/, "").substring(0, 160).trim();
            } else if (!item.title || item.title.length <= 15 || item.title === "بلاغ" || item.title === "مذكرة" || item.title.startsWith("مذكرة رقم")) {
              // Auto-detect headline from the first lines of the PDF if title is generic
              const rawLines = directPdfExtractedText.split("\n").map((l) => l.trim()).filter((l) => l.length >= 10);
              const candidate = rawLines.find((l) =>
                l.includes("تمديد") || l.includes("بشأن") || l.includes("مذكرة") ||
                l.includes("قرار") || l.includes("إعلان") || l.includes("حول") ||
                l.includes("الاستفادة") || l.includes("الدخول") || l.includes("نتائج") ||
                l.includes("مباراة") || l.includes("توظيف")
              );
              if (candidate && candidate.length > 12) {
                item.title = candidate.replace(/^[-–•*#\s]+/, "").substring(0, 150).trim();
              }
            }
          }
        } catch (pdfErr) {
          logger.warn(`[Sync-MEN] Could not extract direct PDF ${item.url}:`, {
            error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
          });
        }

        contentText = `وثيقة ومذكرة رسمية صادرة عن وزارة التربية الوطنية والتعليم الأولي والرياضة بصيغة PDF. يمكن الاطلاع على الوثيقة الكاملة وتحميلها عبر الرابط المباشر أدناه.`;
      } else if (item.url && item.url !== "/" && item.url !== MEN_BASE_URL) {
        try {
          const detailHtml = await fetchFromMen(item.url);
          if (detailHtml) {
            // 1. Extract title if missing or refine it
            // 1. Extract title — try og:title first (most reliable on men.gov.ma)
            const ogTitleMatch =
              detailHtml.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
              detailHtml.match(/<meta\s+name="title"\s+content="([^"]+)"/i) ||
              detailHtml.match(/<title>([^<]{5,})<\/title>/i);
            if (ogTitleMatch) {
              const refinedTitle = decodeHtmlEntities(ogTitleMatch[1].replace(/\s*[|–-].*$/, "").trim());
              if (refinedTitle.length > 5) item.title = refinedTitle;
            }
            if (!item.title || item.title.length < 5) {
              const h1Match = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
              if (h1Match) {
                const t = cleanHtml(h1Match[1]);
                if (t.length > 5) item.title = t;
              }
            }

            // 2. Extract PDF attachments
            const pdfMatches = detailHtml.matchAll(/href="([^"]+\.pdf[^"]*)"/gi);
            for (const p of pdfMatches) {
              let pUrl = p[1];
              if (!pUrl.startsWith("http")) pUrl = `${MEN_BASE_URL}${pUrl.startsWith("/") ? "" : "/"}${pUrl}`;
              if (!pdfLinks.includes(pUrl)) pdfLinks.push(pUrl);
            }

            // 3. Extract rich content — men.gov.ma uses 'content article__body mt-2'
            const bodyPatterns = [
              /<div[^>]*class="[^"]*article__body[^"]*"[^>]*>([\s\S]{40,}?)<\/div>\s*<\/div>/i,
              /<div[^>]*class="[^"]*field--name-body[^"]*"[^>]*>([\s\S]{40,}?)<\/div>\s*<\/div>/i,
              /<div[^>]*class="[^"]*field__item[^"]*"[^>]*>([\s\S]{40,}?)<\/div>/i,
              /<article[^>]*>([\s\S]{40,}?)<\/article>/i,
            ];
            for (const pat of bodyPatterns) {
              const m = detailHtml.match(pat);
              if (m) {
                const cleaned = cleanHtml(m[1]);
                if (cleaned.length > 40) { contentText = cleaned; break; }
              }
            }

            // 4. Fallback to meta name="description"
            if (!contentText || contentText.length < 40) {
              const metaDescMatch =
                detailHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
                detailHtml.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
              if (metaDescMatch && metaDescMatch[1].length > 30) {
                contentText = decodeHtmlEntities(metaDescMatch[1]).trim();
              }
            }

            // 5. Secondary fallback: collect informative <p>, <ul>, <ol> blocks (exclude raw table metadata and portal navs)
            if (!contentText || contentText.length < 40) {
              const blocks = detailHtml.matchAll(/<(?:p|ul|ol)[^>]*>([\s\S]*?)<\/(?:p|ul|ol)>/gi);
              const collected: string[] = [];
              for (const block of blocks) {
                const cleanBlock = cleanHtml(block[0]);
                const isBoilerplate =
                  cleanBlock.includes("جميع الحقوق محفوظة") ||
                  cleanBlock.includes("Cookie") ||
                  cleanBlock.includes("اكتشف المزيد") ||
                  cleanBlock.includes("طلبات العروض") ||
                  cleanBlock.includes("الموضوع") && cleanBlock.includes("الوثيقة") ||
                  cleanBlock.includes("روابط أخرى") ||
                  cleanBlock === "تنزيل";

                if (cleanBlock.length > 20 && !isBoilerplate) {
                  collected.push(cleanBlock);
                }
              }
              contentText = collected.join("\n\n");
            }

            // Post-cleaning on contentText: remove portal navigation remnants
            if (contentText) {
              contentText = contentText
                .replace(/^[\s\S]*?(?=🏛️|📌|في إطار|تنهي|تعلن|بناء على|يشرفني|المملكة|قطاع)/i, (match) => {
                  // Keep match only if it contains actual announcement text
                  return match.includes("تعلن") || match.includes("تنهي") ? match : "";
                })
                .replace(/الموضوع\s+الوثيقة[\s\S]*?تنزيل/g, "")
                .replace(/اكتشف المزيد[\s\S]*$/g, "")
                .trim();
            }
          }
        } catch (detailErr) {
          logger.warn(`[Sync-MEN] Could not fetch detail page for ${item.url}:`, {
            error: detailErr instanceof Error ? detailErr.message : String(detailErr),
          });
        }
      }

      if (!item.title) {
        item.title = "مستجد رسمي من وزارة التربية الوطنية";
      }

      // Assemble content with header and references
      const lines = [
        `🏛️ **مصدر رسمي: وزارة التربية الوطنية والتعليم الأولي والرياضة (men.gov.ma)**`,
        `📌 **التصنيف:** ${item.categoryHint}`,
        "",
        contentText || item.title,
      ];

      if (pdfLinks.length > 0) {
        lines.push("");
        lines.push("📎 **وثائق ومرفقات رسمية للتحميل:**");
        for (const pdfUrl of pdfLinks) {
          lines.push("• 📄 **تحميل الوثيقة الرسمية بصيغة PDF:**");
          lines.push(pdfUrl);
        }

        // Include extracted text from the primary PDF circular
        try {
          const primaryPdf = pdfLinks[0];
          const extractedPdfText = isDirectPdf
            ? directPdfExtractedText
            : await extractPdfTextFromUrl(primaryPdf);

          if (extractedPdfText && extractedPdfText.length > 30) {
            lines.push("");
            lines.push("📄 **النص المرجعي المستخرج من المذكرة الوزارية المرفقة (PDF):**");
            const maxExcerpt = extractedPdfText.length > 8000
              ? extractedPdfText.substring(0, 8000) + "\n\n...(يمكن تحميل المذكرة كاملة من الرابط أعلاه)"
              : extractedPdfText;
            lines.push(maxExcerpt);
          }
        } catch {
          // PDF parsing fallback is graceful
        }
      }

      if (item.url && item.url !== "/") {
        lines.push("");
        lines.push("🔗 **رابط المصدر على بوابة الوزارة:**");
        lines.push(item.url);
      }


      const finalContent = lines.join("\n").trim();

      // Create or update entry in KnowledgeEntry
      // Find existing entry by title or by source URL/filename inside content
      let targetExisting = existingEntry;
      if (!targetExisting && item.title) {
        targetExisting = await prisma.knowledgeEntry.findFirst({
          where: {
            title: item.title,
          },
        });
      }
      if (!targetExisting && item.url && item.url !== "/") {
        const decodedUrl = decodeURIComponent(item.url);
        const filename = item.url.split("/").pop();
        const decodedFilename = filename ? decodeURIComponent(filename) : "";

        targetExisting = await prisma.knowledgeEntry.findFirst({
          where: {
            OR: [
              { content: { contains: item.url } },
              { content: { contains: decodedUrl } },
              ...(decodedFilename && decodedFilename.length > 4 ? [{ content: { contains: decodedFilename } }] : []),
              ...(filename && filename.length > 4 ? [{ content: { contains: filename } }] : []),
            ],
          },
        });
      }

      let savedEntryId: string;
      if (targetExisting) {
        const updated = await prisma.knowledgeEntry.update({
          where: { id: targetExisting.id },
          data: {
            title: item.title,
            content: finalContent,
            metadata: {
              source: "men.gov.ma",
              menItemId,
              url: item.url,
              categoryHint: item.categoryHint,
              quality: "high",
            },
          },
        });
        savedEntryId = updated.id;

        // Clean up any stale duplicate entries for this exact PDF URL
        if (item.url && item.url.toLowerCase().includes(".pdf")) {
          const decodedUrl = decodeURIComponent(item.url);
          await prisma.knowledgeEntry.deleteMany({
            where: {
              id: { not: targetExisting.id },
              OR: [
                { content: { contains: item.url } },
                { content: { contains: decodedUrl } },
              ],
            },
          });
        }
      } else {
        const created = await prisma.knowledgeEntry.create({
          data: {
            categoryId: targetCategoryId,
            title: item.title,
            content: finalContent,
            priority: 1700,
            isActive: true,
            metadata: {
              source: "men.gov.ma",
              menItemId,
              url: item.url,
              categoryHint: item.categoryHint,
              quality: "high",
            },
          },
        });
        savedEntryId = created.id;
      }

      // Record in MenProcessedItem
      await prisma.$executeRawUnsafe(
        `INSERT INTO "MenProcessedItem" ("id", "url", "title", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'imported', NOW(), NOW())
         ON CONFLICT ("id") DO UPDATE SET "status" = 'imported', "title" = $3, "updatedAt" = NOW()`,
        menItemId,
        item.url,
        item.title
      );

      importedCount++;
      importedEntries.push({ id: savedEntryId, title: item.title });

      // Automatically re-index vector embedding in background
      void (async (idToIdx) => {
        try {
          const { indexKnowledgeEntry } = await import("@/lib/ai/semantic-search");
          await indexKnowledgeEntry(idToIdx);
        } catch { }
      })(savedEntryId);
    }

    return {
      success: true,
      mode,
      page: pageNum,
      imported: importedCount,
      skippedDeleted: skippedDeletedCount,
      skippedExisting: skippedExistingCount,
      skippedIrrelevant: skippedIrrelevantCount,
      totalFound: itemsToProcess.length,
      hasMore: itemsToProcess.length > 0,
      nextPage: pageNum + 1,
      targetCategoryId,
      importedEntries,
    };
  } catch (error) {
    logger.error("[Sync-MEN] executeMenSync error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// POST: Execute sync or single page import
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedCatId = typeof body.categoryId === "string" ? body.categoryId : undefined;
    const mode = typeof body.mode === "string" ? body.mode : "auto";
    const customUrl = typeof body.url === "string" ? body.url : undefined;
    const limit = typeof body.limit === "number" ? body.limit : 20;
    const page = typeof body.page === "number" ? Math.max(1, body.page) : 1;

    const result = await executeMenSync({ requestedCatId, mode, customUrl, limit, page });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("[Sync-MEN] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync MEN items" },
      { status: 500 }
    );
  }
}
