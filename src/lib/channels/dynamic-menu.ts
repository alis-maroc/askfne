import { prisma } from "@/lib/prisma";

export interface ArticleItem {
  id: string;
  title: string;
  shortTitle: string;
  content: string;
  createdAt: Date;
}

export const MENU_CATEGORIES: Record<string, { label: string; icon: string; categoryNames: string[] }> = {
  "1": {
    label: "المكاتب والتنظيم",
    icon: "🏢",
    categoryNames: ["Offices", "المكاتب والتنظيم", "التنظيم"],
  },
  "2": {
    label: "القانون الأساسي للجامعة",
    icon: "📜",
    categoryNames: ["Statuts FNE", "القانون الأساسي"],
  },
  "3": {
    label: "مقرر السنة الدراسية",
    icon: "📅",
    categoryNames: ["مقرر السنة الدراسية 2026-2027", "مقرر السنة الدراسية"],
  },
  "4": {
    label: "الوظيفة العمومية",
    icon: "⚖️",
    categoryNames: ["النظام الأساسي للوظيفة العمومية", "الوظيفة العمومية"],
  },
  "5": {
    label: "الدخول المدرسي",
    icon: "🎒",
    categoryNames: ["إجراءات الدخول المدرسي", "الدخول المدرسي"],
  },
  "6": {
    label: "آخر البيانات والمستجدات",
    icon: "📢",
    categoryNames: ["الموقع الإلكتروني للجامعة", "بيانات وبلاغات", "مستجدات", "taalim_feed"],
  },
};

export const GUIDED_CATEGORY_QUESTIONS: Record<string, string[]> = {
  "2": [
    "ما هي أهداف ومبادئ الجامعة الوطنية للتعليم FNE؟",
    "ما هي شروط الانخراط وتجديد العضوية؟",
    "ما هي اختصاصات المؤتمر الوطني؟",
    "ما هي اختصاصات المجلس الوطني؟",
    "ما هي مهام المكتب الوطني؟",
    "كيف يتم تأسيس وتنظيم المكاتب الجهوية والإقليمية؟",
  ],
  "3": [
    "ما هي تواريخ الدخول المدرسي لهذه السنة؟",
    "ما هي فترات العطل المدرسية؟",
    "متى تنظم الامتحانات الإشهادية؟",
    "متى يتم توقيع محاضر الدخول والخروج؟",
    "ما هي تواريخ المجالس والاختبارات؟",
    "ما هي فترات الدعم والمعالجة التربوية؟",
  ],
  "4": [
    "ما هي أنواع الرخص الصحية؟",
    "ما هي مدة رخصة الولادة؟",
    "ما هي شروط الترقية في الدرجة؟",
    "ما هي العقوبات التأديبية؟",
    "ما هي حالات الإلحاق والاستيداع؟",
    "ما هي شروط التقاعد النسبي؟",
  ],
  "5": [
    "ما هي شروط الحركة الانتقالية الوطنية؟",
    "كيف يتم تدبير الفائض والخصاص؟",
    "ما هي معايير التكليف؟",
    "كيف يتم توزيع الحصص؟",
    "ما هي إجراءات الدخول المدرسي؟",
    "ما هي الوثائق المطلوبة للحركة الانتقالية؟",
  ],
};

function formatShortTitle(title: string): string {
  let clean = title
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#*`_]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8230;/g, "…")
    .replace(/\s+/g, " ")
    .trim();

  // If title is longer than 85 characters, truncate neatly
  if (clean.length > 85) {
    clean = clean.substring(0, 82).trim() + "...";
  }
  return clean;
}

export async function getCategoryArticles(
  choice: string,
  page = 1,
  pageSize = 5
): Promise<{
  label: string;
  icon: string;
  articles: ArticleItem[];
  total: number;
  totalPages: number;
  currentPage: number;
}> {
  const config = MENU_CATEGORIES[choice] || MENU_CATEGORIES["1"];

  // Find category matching categoryNames
  const categories = await prisma.category.findMany({
    where: {
      OR: config.categoryNames.map((name) => ({
        name: { contains: name, mode: "insensitive" },
      })),
    },
    select: { id: true },
  });

  const categoryIds = categories.map((c) => c.id);

  const whereClause =
    categoryIds.length > 0
      ? { categoryId: { in: categoryIds }, isActive: true }
      : { isActive: true };

  const total = await prisma.knowledgeEntry.count({
    where: whereClause,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const skip = (validPage - 1) * pageSize;

  const entries = await prisma.knowledgeEntry.findMany({
    where: whereClause,
    orderBy:
      choice === "6"
        ? [{ createdAt: "desc" }]
        : [{ priority: "desc" }, { createdAt: "desc" }],
    skip,
    take: pageSize,
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
    },
  });

  const articles: ArticleItem[] = entries.map((e) => ({
    id: e.id,
    title: e.title,
    shortTitle: formatShortTitle(e.title),
    content: e.content,
    createdAt: e.createdAt,
  }));

  return {
    label: config.label,
    icon: config.icon,
    articles,
    total,
    totalPages,
    currentPage: validPage,
  };
}

export async function getArticleById(id: string): Promise<ArticleItem | null> {
  const entry = await prisma.knowledgeEntry.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
    },
  });

  if (!entry) return null;

  return {
    id: entry.id,
    title: entry.title,
    shortTitle: formatShortTitle(entry.title),
    content: entry.content,
    createdAt: entry.createdAt,
  };
}

export function cleanArticleBodyForChat(rawContent: string, title: string): { dateStr?: string; body: string } {
  let text = rawContent;

  // 1. Remove markdown images and linked images: [![Image...](...)](...) or ![Image...](...)
  text = text.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, "");
  text = text.replace(/!\[.*?\]\(.*?\)/g, "");

  // 2. Remove social share buttons and links
  text = text.replace(/^.*(?:facebook\.com\/sharer|whatsapp:\/\/send|telegram\.me\/share|facebook\.com\/dialog).*$/gm, "");
  text = text.replace(/^[\s*]*شارك[\s*]*$/gm, "");

  // 3. Extract date if present (e.g. *23 مارس 2026* or 10 أغسطس 2026)
  let dateStr = "";
  const dateMatch = text.match(/\*?(\d{1,2}\s+(?:يناير|فبراير|مارس|أبريل|ماي|مايو|يونيو|يوليوز|يوليو|غشت|أغسطس|شتنبر|سبتمبر|أكتوبر|نونبر|نوفمبر|دجنبر|ديسمبر)\s+\d{4})\*?/);
  if (dateMatch) {
    dateStr = dateMatch[1].trim();
  }

  // 4. Remove category links like [بيانات و بلاغات](...)
  text = text.replace(/\[(?:بيانات و بلاغات|بيانات وبلاغات|مستجدات وأخبار|مستجدات|أخبار)\]\(.*?\)/g, "");

  // 5. Remove repeated H1/H2 titles matching the title or starting with #
  text = text.replace(/^#+\s+.*$/gm, "");

  // 6. Remove lines that are just dates we extracted
  if (dateStr) {
    text = text.replace(new RegExp(`^\\s*\\*?${dateStr}\\*?\\s*$`, "gm"), "");
  }

  // 7. Clean residual empty links like [](url) or []()
  text = text.replace(/\[\]\(.*?\)/g, "");

  // 8. Cut off trailing footer as soon as any sharing, related posts, or comments section begins
  const footerCutoffTriggers = [
    "### شارك هذا الموضوع",
    "شارك هذا الموضوع",
    "المشاركة على X",
    "المشاركة على Twitter",
    "المشاركة على Telegram",
    "المشاركة على WhatsApp",
    "شارك على فيس بوك",
    "شارك على فيسبوك",
    "إرسال رابط بالبريد الإلكتروني",
    "?share=twitter",
    "?share=facebook",
    "?share=telegram",
    "?share=jetpack-whatsapp",
    "?share=email",
    "relatedposts_",
    "مقالات قد تعجبك",
    "المزيد من المقالات",
    "### معجب بهذه",
    "معجب بهذه",
    "### مرتبط",
    "مرتبط:",
    "اترك تعليق",
    "منشورات هذا الموقع مرخصة",
    "تواصل معنا على الواتساب",
    "[All](",
  ];

  let cutPoint = -1;
  for (const trigger of footerCutoffTriggers) {
    const idx = text.indexOf(trigger);
    if (idx !== -1) {
      if (cutPoint === -1 || idx < cutPoint) {
        cutPoint = idx;
      }
    }
  }

  if (cutPoint !== -1) {
    const lastNewlineBefore = text.lastIndexOf("\n", cutPoint);
    text = text.substring(0, lastNewlineBefore !== -1 ? lastNewlineBefore : cutPoint).trim();
  }

  // 9. Format into justified, coherent paragraphs for WhatsApp & chat clients
  // Fix lone bullet on its own line: \n•\ntext -> \n• text
  text = text.replace(/\n\s*([•◦▪️▫️\-\*])\s*\n\s*/g, "\n$1 ");

  // Convert markdown bold **...** to WhatsApp bold *...*
  text = text.replace(/\*\*(.*?)\*\*/g, "*$1*");
  // Convert markdown subheadings ### ... to clean bold subheadings
  text = text.replace(/^#+\s+(.+)$/gm, "📌 *$1*");

  // Strip leading spaces/tabs on all lines
  text = text.replace(/^[ \t]+/gm, "");

  // Split by intentional paragraphs (double newlines)
  const rawParagraphs = text.split(/\n\s*\n+/);
  const blocks: string[] = [];

  const bulletRegex = /^([•◦▪️▫️\-\*]|(?:\(?\d+[\.\-\)]))\s*(.+)$/;

  for (const rawP of rawParagraphs) {
    const lines = rawP
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    // Check if block contains list items
    const hasBullets = lines.some((l) => bulletRegex.test(l));

    if (hasBullets) {
      const listItems: string[] = [];
      for (const line of lines) {
        const match = line.match(bulletRegex);
        if (match) {
          const prefix = match[1];
          const content = match[2].trim();
          if (/^\(?\d+[\.\-\)]/.test(prefix)) {
            listItems.push(`${prefix} ${content}`);
          } else {
            listItems.push(`• ${content}`);
          }
        } else {
          // Continuation of previous bullet point or intro within list
          if (listItems.length > 0) {
            listItems[listItems.length - 1] += " " + line;
          } else {
            listItems.push(line);
          }
        }
      }
      blocks.push(listItems.join("\n"));
    } else if (
      lines.length > 1 &&
      lines.some((l) => /^(عن المكتب|الكاتب العام|الكاتب الوطني|عاشت|عاش|تحية|الرباط،|الدار البيضاء،|تيزنيت،)/.test(l))
    ) {
      // Signature and slogans block: keep lines distinct
      blocks.push(lines.join("\n"));
    } else if (lines.length === 1 && lines[0].startsWith("📌")) {
      // Heading
      blocks.push(lines[0]);
    } else {
      // Narrative paragraph: join broken lines into continuous, flowing text that WhatsApp & Telegram justify naturally across the screen
      blocks.push(lines.join(" "));
    }
  }

  text = blocks.join("\n\n").trim();

  return { dateStr, body: text };
}
