import OpenAI from "openai";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { confirmPendingTicket, executeToolCall, isTicketConfirmation, owlyTools } from "./tools";
import { emitNewMessage } from "@/lib/realtime";
import { searchKnowledgeBase } from "./semantic-search";
import { analyzeSentiment, detectIntent, estimateConfidenceDetailed, requiresHumanApproval } from "./guardrails";
import { detectHallucination, isAssistantRefusal } from "./refusal-detector";
import { globalAIQueue } from "./queue";
import { fetchHubOffices, formatHubOfficesResponse, type HubOffice } from "@/lib/hub-offices";
import { normalizeCitySkeleton } from "@/lib/arabic-skeleton";
// AGENTS.md compliance layer
import {
  classifyIntent,
  decideAnswer,
  INTENT,
  isSourceAllowed,
  type Intent,
  type SourceType,
} from "./intent-router";
import {
  clearStaleState,
  CONVERSATION_STATE,
  createIdleState,
  type StateContext,
} from "./conversation-state";
import { logAnswer, trackClarification, trackRefusal } from "./observability";
import { annotateWithStaleness, getStalenessReason } from "./freshness";
import { normalizeArabic } from "./arabic-search";
import { canConfirmTicket, canInitiateTicketWorkflow, formatTicketDraft, type TicketDraft } from "./ticket-guard";
import type {
  AIMessage,
  AIConfig,
  ConversationContext,
  KnowledgeItem,
} from "./types";

// Office/role/level stopwords — tokens that should NEVER be used to search the hub
// (they would match too many offices and cause false positives like "الكاتب الإقليمي" → all 82+ offices)
const OFFICE_ROLE_STOPWORDS = new Set([
  "كاتب", "كاتبه", "الكاتب", "الكاتبه", "كاتبا", "كاتبته", "كاتبتها",
  "اقليم", "اقليمي", "الاقليم", "الاقليمي", "اقليمية", "الاقليمية", "اقليميه", "الاقليميه",
  "جهه", "جهوي", "الجهوي", "جهة", "الجهة", "جهويا", "الجهوية", "الجهوي", "الجهويه", "جهويه",
  "محلي", "المحلي", "محلية", "المحلية", "محليا", "محليه", "المحليه",
  "وطني", "الوطني", "وطنية", "الوطنية", "وطنيا", "وطنيه", "الوطنيه",
  "مكتب", "المكتب", "مكاتب", "المكاتب", "مكاتبيه", "مكاتبي",
  "فرع", "الفرع", "فروع", "الفروع",
  "هاتف", "الهاتف", "هواتف", "ارقام", "رقم", "الرقم", "نمره", "النمرة", "نمرة", "نمرتها", "اتصال", "تواصل",
  "مدير", "المدير", "مديرية", "المديرية", "مديريه", "المديريه", "منسق", "المنسق",
  "مسؤول", "المسؤول", "مسؤولية", "مسؤوليات", "مسؤوليه",
  "امين", "امينه", "امين المال", "الامين", "الأمين",
  "شباب", "اتحاد", "تعليم", "التعليم", "تربية", "التربية", "تربيه", "التربيه",
  "وزارة", "الوزارة", "وزاره", "الوزاره", "قطاع", "القطاع",
  "نظام", "النظام", "اساسي", "الاساسي", "مادة", "المادة", "ماده", "الماده",
  "fne", "الجامعه", "النقابية", "النقابه", "نقابية", "نقابه",
  "النقابي", "نقابي", "الاتحاد", "الجامعة", "الجامعه",
  "تواصلو", "نتواصل", "اتواصل", "تصل", "اتصل",
  "الهيكله", "هيكلة", "التنظيم", "تنظيم",
  "اعضاء", "الاعضاء", "عضو", "العضو",
]);

const QUERY_STOPWORDS = new Set([
  "what", "which", "where", "when", "how", "about",
  "ما", "هو", "هي", "هل", "عن", "من", "في", "على", "الى", "إلى", "ل", "لو",
  "bureau", "numero", "num", "telephone", "tel", "office", "regional", "region",
]);

const CATEGORY_ROUTING_RULES: Array<{ keywords: string[]; categories: string[] }> = [
  {
    // Organization, offices, and contact routing (strictly office-scoped, not isolated generic words)
    keywords: [
      "المكتب الإقليمي", "المكتب الاقليمي", "مكتب إقليمي", "مكتب اقليمي",
      "المكتب الجهوي", "مكتب جهوي", "المكتب المحلي", "مكتب محلي",
      "الكاتب الإقليمي", "الكاتب الاقليمي", "الكاتب الجهوي", "الكاتب المحلي",
      "المكتب الوطني", "المكاتب الوطنية", "مقر النقابة", "مقرات النقابة", "فروع النقابة",
      "هاتف المكتب", "رقم الكاتب", "نمرة الكاتب", "أرقام مسؤولي", "هاتف الكاتب", "أمين المال",
      "organisation", "organization", "office", "bureau",
      // Moroccan Provinces & Cities
      "تيزنيت", "اكادير", "أكادير", "تارودانت", "شتوكة", "انزكان", "إنزكان", "طاطا", "كلميم", "العيون",
      "الداخلة", "بوجدور", "السمارة", "طانطان", "سيدي إفني", "سيدي افني",
      "الرباط", "سلا", "تمارة", "القنيطرة", "الخميسات", "سيدي قاسم", "سيدي سليمان",
      "الدار البيضاء", "المحمدية", "النواصر", "مديونة", "الجديدة", "سطات", "برشيد", "بنسليمان", "سيدي بنور",
      "فاس", "مكناس", "صفرو", "إفران", "افران", "الحاجب", "تاونات", "بولمان", "تازة",
      "طنجة", "تطوان", "العرائش", "شفشاون", "وزان", "المضيق", "الفنيدق", "فحص أنجرة",
      "مراكش", "الحوز", "شيشاوة", "قلعة السراغنة", "الصويرة", "آسفي", "اسفي", "الرحامنة", "اليوسفية",
      "بني ملال", "خريبكة", "أزيلال", "ازيلال", "الفقيه بن صالح", "خنيفرة",
      "وجدة", "بركان", "الناظور", "الدريوش", "جرسيف", "تاوريرت", "جرادة", "فكيك",
      "ورزازات", "زاكورة", "تنغير", "الرشيدية", "ميدلت",
    ],
    categories: ["Offices", "المكاتب والتنظيم", "المكاتب - إقليمي", "المكاتب - جهوي", "المكاتب - وطني"],
  },
  {
    // Adhesion and Digital Hub services routing
    keywords: [
      "انخراط", "الانخراط", "أنخرط", "انخرط", "تسجيل", "عضوية", "العضوية", "بطاقة", "بطاقة نقابية",
      "تجديد البطاقة", "طلب انخراط", "استمارة الانخراط", "adherer", "adhesion", "carte",
      "حساب النقط", "حاسبة الترقية", "حساب الترقية", "توليد طلب", "طلب إداري", "نموذج طلب",
      "ملف نقابي", "تبليغ عن خرق", "خروقات", "تظلم", "شطط", "خريطة مدرسية", "hub", "منصة"
    ],
    categories: ["Statuts FNE", "المكاتب والتنظيم", "Offices"],
  },
  {
    // Legal status routing
    keywords: [
      "النظام الأساسي", "النظام الاساسي", "القانون الاساسي", "القانون الأساسي", "النظام الداخلي", "statut", "statuts", "fne",
      "المادة", "مادة", "المادة 76", "المادة 77", "المادة 78", "إدماج", "ادماج", "مفتش", "مفتشي", "تخطيط", "توجيه",
      "أهداف", "الاهداف", "objectifs",
      "هياكل", "الهياكل", "هيكل", "الهيكل", "هيكلة", "الهيكلة", "أجهزة", "الأجهزة", "اجهزة", "الاجهزة",
      "المؤتمر الوطني", "المجلس الوطني", "اللجنة الإدارية", "اللجنة الادارية"
    ],
    categories: ["Statuts FNE"],
  },
  {
    // Administrative career procedures, movements, leaves, and exams (bivalent search across status, circulars, and union)
    keywords: [
      "النظام الأساسي للوظيفة العمومية", "النظام الاساسي للوظيفة العمومية", "الوظيفة العمومية", "وظيفة عمومية", "موظف", "موظفين",
      "حركة انتقالية", "الحركة الانتقالية", "حركة الأساتذة", "حركة التبادل", "تبادل", "التبادل",
      "استيداع", "الاستيداع", "إلحاق", "الالحاق", "الإلحاق", "تفرغ نقابي", "تفرغ",
      "تقاعد", "التقاعد", "تقاعد نسبي", "التقاعد النسبي", "حد السن",
      "ترقية", "ترقي", "الترقية", "الترقي", "رتبة", "الرتبة", "درجة", "الدرجة", "سلم", "السلم", "تنقيط", "التنقيط",
      "امتحان مهني", "امتحانات مهنية", "كفاءة مهنية", "الكفاءة المهنية", "مباراة", "مباريات",
      "رخصة", "رخص", "الرخص", "الرخصة", "رخصة مرض", "رخصة ولادة", "رخصة أداء مناسك الحج",
      "عقوبة", "عقوبات", "العقوبات", "تأديب", "تأديبي", "التأديبية", "مجلس انضباطي",
      "أجرة", "الأجرة", "تعويض", "تعويضات", "اقتطاع", "اقتطاعات",
      "fonction publique", "statut général de la fonction publique", "avancement", "grade", "echelon", "mutation", "disponibilite", "detachement"
    ],
    categories: [
      "النظام الأساسي للوظيفة العمومية",
      "مذكرات وبلاغات وزارة التربية الوطنية",
      "الموقع الإلكتروني للجامعة",
    ],
  },
  {
    // School-year decree and rentrée scolaire routing
    keywords: [
      "مقرر السنة الدراسية", "السنة الدراسية", "decret", "décret", "scolaire", "exam", "امتحان", "عطلة",
      "الدخول المدرسي", "دخول مدرسي", "إجراءات الدخول", "اجراءات الدخول",
      "تاريخ الدخول", "موعد الدخول", "مواعيد الدخول", "جدولة الدخول", "مواعيد التحاق",
      "الالتحاق بالعمل", "استئناف العمل", "محاضر الدخول", "محضر الدخول",
      "محاضر الالتحاق", "محضر الالتحاق", "توقيع المحضر", "توقيع المحاضر",
      "محاضر الخروج", "محضر الخروج", "نهاية السنة", "العطل المدرسية",
      "التسجيل", "تسجيل التلاميذ", "الانخراط", "التوجيه", "الاستئناف",
      "rentrée", "rentree", "rentrée scolaire", "inscription"
    ],
    categories: ["إجراءات الدخول المدرسي", "مقرر السنة الدراسية 2026-2027", "مذكرات وبلاغات وزارة التربية الوطنية"],
  },
  {
    // News, communiqués, and union stance routing
    keywords: [
      "بيان", "بيانات", "بلاغ", "بلاغات", "مستجدات", "أخبار", "اخبار",
      "وقفة", "إضراب", "اضراب", "تخفيض ساعات العمل", "ساعات العمل", "ساعات",
      "موقف", "موقف الجامعة", "مسار", "مؤسسات الريادة", "مطالب", "المطالب",
      "منتدى", "المنتدى", "منتدى المدرس", "المنتدى الوطني للمدرس",
      "موقع", "الموقع", "taalim",
      "مقال", "المقال", "مقالات", "المقالات", "منشور", "المنشور", "نشر", "ما نشر",
      "جديد الموقع", "آخر مقال", "اخر مقال", "أحدث مقال", "احدث مقال"
    ],
    categories: ["الموقع الإلكتروني للجامعة"],
  },
  {
    // Official Ministry circulars and communiqués (men.gov.ma)
    keywords: [
      "وزارة التربية", "الوزارة", "بلاغ الوزارة", "مذكرة وزارية", "المذكرة الوزارية",
      "قرار وزاري", "مقرر وزاري", "men.gov.ma", "موقع الوزارة", "وزير التربية الوطنية",
      "محمد سعد برادة", "المنحة", "منح التعليم العالي", "الأقسام التحضيرية",
      "الإيواء", "الايواء", "الإطعام", "الاطعام", "النقل المدرسي", "دور الطالب", "دور الطالبة",
      "الدعم الاجتماعي", "الداخليات", "الداخلية", "المطاعم المدرسية", "تمديد"
    ],
    categories: ["مذكرات وبلاغات وزارة التربية الوطنية", "مقرر السنة الدراسية 2026-2027"],
  },
];

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[\u0640]/g, "")
    .replace(/اال/g, "ال")
    .replace(/اإل/g, "ال")
    .replace(/األ/g, "ال")
    .replace(/اآل/g, "ال")
    .replace(/بالغ/g, "بلاغ")
    // City/Province spelling variants — NO \b (does not work with Arabic)
    .replace(/(اشتوكه|شتوكه|اشتوكة|شتوكة)/g, "شتوكة")
    .replace(/(ايت باها|أيت باها|ايتباها|ايت باهى)/g, "ايت باها")
    .replace(/(انزجان|إنزجان|اينزجان|انزكان|إنزكان|انزكن|إنزكن|انزكنان)/g, "انزكان")
    .replace(/(ايت ملول|أيت ملول|ايتملول|ايت ملل)/g, "ايت ملول")
    .replace(/(تيزنيت|تزنيت|تزميت|تيزنبت|تيزنت|تيزنيث|تيزنيط|تيزنيك|تيزنيت|تيزنيت|تيرنيت|تيرنيث|تيزنيت|تزينت)/g, "تيزنيت")
    .replace(/(تارودانت|تارودن|تارودنت|تارودنط|تارودنت|تارودنث)/g, "تارودانت")
    .replace(/(أكادير|اكادير|أكادير إداوتنان|اكادير اداوتنان|اكادير إداوتنان|أكادير اداوتنان|اغادير|أكادير|اكادير)/g, "اكادير")
    .replace(/(طنجة|طنجه|طنجت|طنجث|طنجه أصيلة|طنجة أصيلة|طنجة-اصيلة|طنجها|طنجهه)/g, "طنجة")
    .replace(/(تطوان|تطون|تطون|تطوان|تطوان|تطون|تطون)/g, "تطوان")
    .replace(/(كلميم|كليميم|كليميم|كليمم|كليم|كليمايم)/g, "كلميم")
    .replace(/(سيدي افني|سيدي إفني|افني|إفني|ايفني|إيفني|سيديافني|سيدى افنى|سيدي افنى)/g, "سيدي افني")
    .replace(/(سيدي بنور|سيدي قاسم|سيدي سليمان|سيدي البرنوصي)/g, "$1")
    .replace(/(الفقيه بنصالح|الفقيه بن صالح)/g, "الفقيه بن صالح")
    .replace(/(قلعة السراغنة|قلعه السراغنه|قلعة سراغنة)/g, "قلعة السراغنة")
    .replace(/(الدار البيضاء|كازا|الدارالبيضاء|كازابلانكا|كازا بلانكا)/g, "الدار البيضاء")
    .replace(/(بني ملال|بنيملال)/g, "بني ملال")
    .replace(/(مولاي يعقوب|مولاي رشيد)/g, "$1")
    .replace(/(غميميط|اغميميط)/g, "اغميمط")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance for fuzzy city name matching
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Find the closest matching known city to a user-provided token (fuzzy match)
function findClosestCity(token: string, knownCities: string[], maxDistance = 3): string | null {
  let best: string | null = null;
  let bestDist = maxDistance + 1;
  for (const city of knownCities) {
    const d = levenshtein(token, city);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }
  return bestDist <= maxDistance ? best : null;
}

function extractQueryTokens(query: string): string[] {
  const normalized = normalizeForMatch(query);
  const rawTokens = normalized.split(" ").filter((t) => t.length >= 3 && !QUERY_STOPWORDS.has(t));
  const tokens: string[] = [];

  for (const t of rawTokens) {
    tokens.push(t);
    // Strip common attached prepositions: بـ, لـ, كـ, فـ, و
    if (t.length >= 4 && (t.startsWith("ب") || t.startsWith("ل") || t.startsWith("و") || t.startsWith("ف"))) {
      tokens.push(t.slice(1));
    }
    // Strip definite article الـ
    if (t.length >= 5 && t.startsWith("ال")) {
      tokens.push(t.slice(2));
    }
    // Strip بالـ / ولـ
    if (t.length >= 6 && (t.startsWith("بال") || t.startsWith("وال") || t.startsWith("فال"))) {
      tokens.push(t.slice(3));
    }
  }

  return Array.from(
    new Set(
      tokens.filter(
        (t) =>
          t.length >= 3 &&
          !QUERY_STOPWORDS.has(t) &&
          !OFFICE_ROLE_STOPWORDS.has(t)
      )
    )
  );
}

type QueryIntent = "office_contact" | "official_structure" | "union_position" | "ticket_request" | "knowledge";

function classifyQueryIntent(query: string): QueryIntent {
  const normalized = normalizeForMatch(query);
  if (/(فتح|انشاء|إنشاء)\s+(?:تذكره|تذكرة|طلب)|اريد\s+(?:فتح|انشاء|إنشاء)\s+(?:تذكره|تذكرة|طلب)/i.test(normalized)) {
    return "ticket_request";
  }
  if (/(اللجنه الاداريه|اللجنة الإدارية|المجلس الوطني|المكتب الوطني|اعضاء|أعضاء|لائحه|لائحة|تشكيله|تشكيلة)/i.test(normalized)) {
    return "official_structure";
  }
  if (/(موقف الجامعه|موقف الجامعة|الحراك|اضراب|إضراب|بيان|بلاغ|مستجدات|اصلاح|إصلاح)/i.test(normalized)) {
    return "union_position";
  }
  // IMPORTANT: Contact intent requires an explicit office/union role or contact phrasing,
  // NOT isolated words like "رقم" (which matches رقم التأجير/PPR), "محلي" (حركة محلية),
  // "جهوي" (امتحان جهوي), or "مسؤول" (المسؤول الإداري).
  const isExplicitOfficeRole =
    /(?:المكتب|مكتب|الكاتب|كاتب|مقرات|مقر|فروع|فرع)\s+(?:الإقليمي|الاقليمي|الجهوي|المحلي|الوطني|التنفيذي|النقابة|النقابيه|النقابة|الجامعة|الجامعه)/i.test(normalized) ||
    /(?:الكاتب|امين المال|أمين المال)\s+(?:العام|الإقليمي|الاقليمي|الجهوي|المحلي|الوطني)/i.test(normalized) ||
    /(?:المكتب|مكتب)\s+(?:fne|التعليم|النقابي)/i.test(normalized);

  const isExplicitContactLookup =
    /(?:هاتف|نمره|نمرة|ارقام|أرقام|تواصل مع|اتصال بـ?|اتصل بـ?)\s+(?:المكتب|الكاتب|النقابة|الفرع|المسؤول النقابي|أمين المال|الجامعة)/i.test(normalized) ||
    /(?:رقم|هاتف|نمرة)\s+(?:الكاتب|امين المال|أمين المال|المسؤول النقابي)/i.test(normalized);

  if (isExplicitOfficeRole || isExplicitContactLookup) {
    return "office_contact";
  }
  return "knowledge";
}

type VerifiedOffice = Awaited<ReturnType<typeof prisma.office.findMany>>[number];

function formatVerifiedOffice(office: VerifiedOffice): string {
  const location = office.province && office.province !== "—" ? ` (${office.province})` : "";
  const secretaryTitle = office.level === "جهوي" ? "الكاتب الجهوي" : office.level === "وطني" ? "الكاتب الوطني" : "الكاتب الإقليمي";
  const lines = [`🏢 *${office.name}${location}:*`];
  if (office.secretary) lines.push(`• ${secretaryTitle}: الرفيق *${office.secretary}*${office.secretaryPhone ? ` (📞 ${office.secretaryPhone})` : ""}`);
  if (office.treasurer) lines.push(`• أمين المال: الرفيق *${office.treasurer}*${office.treasurerPhone ? ` (📞 ${office.treasurerPhone})` : ""}`);
  return lines.join("\n");
}

/**
 * Strip office-type prefix from an office name to get the canonical city/region name.
 * e.g. "المكتب الإقليمي لـ فاس" → "فاس"
 * e.g. "المكتب الجهوي لـ فاس مكناس" → "فاس مكناس"
 */
function stripOfficePrefix(name: string): string {
  return name
    .replace(/^(?:المكتب|الكاتب)\s+(?:الإقليمي|الإقليمية|الجهوي|الجهوية|محلي|محلية|وطني|وطنية)\s*ل?ـ?\s*/i, "")
    .replace(/^(?:مكتب|كاتب)\s+(?:إقليمي|جهوي|محلي|وطني)\s*ل?ـ?\s*/i, "")
    .trim();
}

/**
 * Check if a query city word matches a stripped office name.
 * Matches as a whole word OR as a prefix of a word (handles compound names like "فاس" in "فاس مكناس").
 */
function cityWordMatches(strippedName: string, queryWord: string): boolean {
  if (!queryWord || !strippedName) return false;
  const parts = strippedName.split(/\s+/).filter(Boolean);
  const normQuery = normalizeForMatch(queryWord);
  return parts.some((part) => {
    const normPart = normalizeForMatch(part);
    if (part === queryWord || normPart === normQuery || normPart === queryWord) return true;
    // Prefix matching requires at least 3 characters to avoid 2-letter false positives like "ما" -> "ماسة"
    if (normQuery.length >= 3 && (normPart.startsWith(normQuery) || part.startsWith(queryWord))) return true;
    return false;
  });
}

async function resolveVerifiedOffice(query: string, tokens: string[], allowFuzzySuggestions: boolean): Promise<string | null> {
  // STEP 0: Detect level intent from the ORIGINAL query.
  // Use a normalized match that handles Arabic alef variants (إ/ا/أ/آ) and alif maqsura (ى/ي).
  const normQ = query
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
  const wantsIqlimi = /(ال)?اقليم|إقليم|الإقليم/i.test(normQ) || /(ال)?اقليم/i.test(query);
  const wantsJihawi = /(ال)?جهوي|جهة|الجهوي/i.test(normQ) || /(ال)?جهوي|جهة/i.test(query);
  const wantsMahali = /(ال)?محلي/i.test(normQ) || /(ال)?محلي/i.test(query);
  const wantsWatani = /(ال)?وطني/i.test(normQ) || /(ال)?وطني/i.test(query);

  // STEP 1: Extract city/region tokens from the query (exclude role words and Arabic stopwords/interrogatives).
  const ROLE_AND_STOPWORDS = new Set([
    "مكتب", "المكتب", "الكتب", "كاتب", "الكاتب", "اقليم", "اقليمي", "الاقليم", "الاقليمي",
    "جهه", "جهوي", "الجهوي", "جهة", "الجهة", "محلي", "المحلي", "وطني", "الوطني",
    "فرع", "الفرع", "هاتف", "الهاتف", "رقم", "الرقم", "مدير", "منسق", "مسؤول", "امين", "الأمين",
    "شباب", "اتحاد", "تعليم", "fne", "الجامعه", "النقابيه", "النقابه", "تنظيم", "عضو",
    // Arabic stopwords and interrogative particles — MUST NOT be treated as city words
    "ما", "ماذا", "من", "هل", "هو", "هي", "كم", "كيف", "أين", "اين", "متى", "لماذا",
    "عن", "في", "على", "الى", "إلى", "مع", "بين", "حول", "كل", "بعض", "غير", "معظم",
    "شكون", "فين", "علاش", "كيفاش", "واش", "شنو", "ديال", "باش", "اللي", "الي",
    "سلام", "السلام", "مرحبا", "تحية", "نضالية", "نضاليه", "عليكم", "ورحمة", "وبركاته", "صباح", "مساء", "الخير", "النور",
  ]);
  const queryNorm = normalizeForMatch(query);
  const queryCityWords = queryNorm.split(/\s+/).filter((w) => w.length >= 2 && !ROLE_AND_STOPWORDS.has(w));
  // Raw tokens for ILIKE pre-filter (minimum length 3 to avoid noise)
  const rawTokens = tokens.filter((t) => t.length >= 3 && !ROLE_AND_STOPWORDS.has(t));

  if (queryCityWords.length === 0 && rawTokens.length === 0) return null;

  // STEP 2: Pre-filter offices via Prisma ILIKE on name/region/province/parentOffice.
  // Expand tokens with Arabic orthographic variants (ة <-> ه, with/without ال) for SQL ILIKE
  const expandedTokens: string[] = [];
  for (const t of rawTokens) {
    expandedTokens.push(t);
    if (t.endsWith("ه")) expandedTokens.push(t.slice(0, -1) + "ة");
    if (t.endsWith("ة")) expandedTokens.push(t.slice(0, -1) + "ه");
    if (t.startsWith("ال") && t.length >= 5) {
      const bare = t.slice(2);
      expandedTokens.push(bare);
      if (bare.endsWith("ه")) expandedTokens.push(bare.slice(0, -1) + "ة");
      if (bare.endsWith("ة")) expandedTokens.push(bare.slice(0, -1) + "ه");
    } else if (!t.startsWith("ال")) {
      const withAl = "ال" + t;
      expandedTokens.push(withAl);
      if (withAl.endsWith("ه")) expandedTokens.push(withAl.slice(0, -1) + "ة");
      if (withAl.endsWith("ة")) expandedTokens.push(withAl.slice(0, -1) + "ه");
    }
  }
  const uniqueExpandedTokens = Array.from(new Set(expandedTokens));

  const orConditions = uniqueExpandedTokens.flatMap((term) => [
    { name: { contains: term, mode: "insensitive" as const } },
    { region: { contains: term, mode: "insensitive" as const } },
    { province: { contains: term, mode: "insensitive" as const } },
    { parentOffice: { contains: term, mode: "insensitive" as const } },
  ]);

  if (orConditions.length === 0) return null;

  const offices = await prisma.office.findMany({
    where: {
      isActive: true,
      OR: orConditions,
    },
    orderBy: [{ sourceId: "asc" }],
  });

  if (offices.length === 0) return null;

  // STEP 3: Score and rank candidates by stripped-name match.
  const scored = offices.map((office) => {
    if (!office.name || office.name === "—") return { office, score: 0, stripped: "" };
    const stripped = stripOfficePrefix(office.name);
    let matchCount = 0;
    for (const qw of queryCityWords) {
      if (cityWordMatches(stripped, qw)) matchCount += 3;
    }
    const normOfficeName = normalizeForMatch(office.name);
    for (const qw of queryCityWords) {
      if (normOfficeName.includes(qw)) matchCount += 2;
    }
    // Boost if any expanded token literally appears in the office name (catches cases where
    // normalizeForMatch collapsed the city word but ILIKE pre-filter passed it through).
    let exactBoost = 0;
    for (const rt of uniqueExpandedTokens) {
      if (rt.length >= 3 && (office.name.includes(rt) || (office.region && office.region.includes(rt)) || (office.province && office.province.includes(rt)))) {
        exactBoost += 5;
      }
    }
    return { office, score: matchCount + exactBoost, stripped };
  });

  // Sort by score only. Level tiebreak is done in STEP 4.
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (top.score === 0) {
    // No match. Try suggestions.
    if (!allowFuzzySuggestions) return null;
    return suggestOffices(offices, rawTokens);
  }

  // STEP 4: Resolve ties using level intent.
  const topScore = top.score;
  const sameScore = scored.filter((s) => s.score === topScore);
  let candidates = sameScore;
  if (sameScore.length > 1) {
    if (wantsJihawi) {
      const match = sameScore.filter((s) => s.office.level === "جهوي");
      if (match.length > 0) candidates = match;
    } else if (wantsIqlimi) {
      const match = sameScore.filter((s) => s.office.level === "إقليمي");
      if (match.length > 0) candidates = match;
    } else if (wantsMahali) {
      const match = sameScore.filter((s) => s.office.level === "محلي");
      if (match.length > 0) candidates = match;
    } else if (wantsWatani) {
      const match = sameScore.filter((s) => s.office.level === "وطني");
      if (match.length > 0) candidates = match;
    }
  }

  if (candidates.length > 1) {
    // Ambiguity: multiple offices matched at the same level with the same top score.
    // Per AGENTS.md, return clarification instead of exposing a guessed contact.
    if (!allowFuzzySuggestions) return null;
    return suggestOffices(candidates.map((c) => c.office), rawTokens);
  }

  return formatVerifiedOffice(candidates[0].office);
}

function suggestOffices(offices: VerifiedOffice[], rawTokens: string[]): string | null {
  // Group by location (stripped name or province) and suggest the top results.
  const locations = new Map<string, VerifiedOffice[]>();
  for (const office of offices) {
    const cityFromName = stripOfficePrefix(office.name);
    const label = office.province && office.province !== "—" ? office.province : (cityFromName || office.name);
    const key = normalizeCitySkeleton(label);
    const group = locations.get(key) || [];
    group.push(office);
    locations.set(key, group);
  }

  if (locations.size > 0) {
    const suggestions = [...locations.values()]
      .slice(0, 5)
      .map((group) => {
        const o = group[0];
        return o.province && o.province !== "—" ? o.province : stripOfficePrefix(o.name) || o.name;
      });
    return `لم أستطع تحديد المكتب بدقة. هل تقصد أحد هذه الأقاليم؟\n${suggestions.map((name) => `• ${name}`).join("\n")}\n\nاكتب الاسم كاملاً أو اختر من قائمة المكاتب.`;
  }

  // Levenshtein suggestions as last resort.
  const candidates = new Map<string, string>();
  for (const office of offices) {
    const label = office.province && office.province !== "—" ? office.province : office.name;
    const key = normalizeCitySkeleton(label);
    candidates.set(key, label);
  }
  const querySkeletons = rawTokens.map((t) => normalizeCitySkeleton(t)).filter((s) => s.length >= 2);
  if (querySkeletons.length === 0) return null;

  const suggestions = [...candidates.entries()]
    .map(([skeleton, label]) => {
      const score = Math.max(...querySkeletons.map((token) => 1 - levenshtein(token, skeleton) / Math.max(token.length, skeleton.length)));
      return { label, score };
    })
    .filter((c) => c.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (suggestions.length > 0) {
    return `لم أجد تطابقاً مؤكداً. هل تقصد:\n${suggestions.map((c) => `• ${c.label}`).join("\n")}\n\nلن أعرض أرقام المسؤولين قبل تأكيد الإقليم.`;
  }
  return null;
}

function buildOfficeKnowledge(office: {
  name: string;
  level: string;
  region: string;
  province: string;
  parentOffice: string;
  secretary: string;
  secretaryPhone: string;
  treasurer: string;
  treasurerPhone: string;
  foundedAt: string;
  renewalAt: string;
  renewalDuration: string;
}): KnowledgeItem {
  const isProvincial = office.level === "إقليمي" || office.name.includes("الإقليمي");
  return {
    category: isProvincial ? "المكاتب - إقليمي (أساسي ورسمي)" : "المكاتب والتنظيم",
    title: `${office.name} (${office.level})`,
    content: [
      `المكتب: ${office.name}`,
      `المستوى: ${office.level}`,
      `الجهة: ${office.region}`,
      `الإقليم: ${office.province}`,
      `المكتب الأب: ${office.parentOffice}`,
      `الكاتب المسؤول: ${office.secretary}`,
      `هاتف الكاتب: ${office.secretaryPhone}`,
      `أمين المال: ${office.treasurer}`,
      `هاتف الأمين: ${office.treasurerPhone}`,
      `تاريخ التأسيس: ${office.foundedAt}`,
      `التجديد المقبل: ${office.renewalAt}`,
      `مدة التجديد: ${office.renewalDuration}`,
    ].join("\n"),
    priority: isProvincial ? 3000 : 2000,
  };
}

async function findOfficeMatches(query: string): Promise<KnowledgeItem[]> {
  const GREETINGS_AND_STOPWORDS = new Set([
    "سلام", "السلام", "مرحبا", "اهلين", "تحية", "نضالية", "صباح", "مساء", "عليكم",
    "اريد", "أريد", "بغيت", "اعرف", "أعرف", "معرفة", "استفسار", "طلب", "شروط", "وثائق",
  ]);
  const tokens = extractQueryTokens(query).filter(
    (token) => token.length >= 3 && !GREETINGS_AND_STOPWORDS.has(token)
  );
  if (tokens.length === 0) return [];

  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: [{ sourceId: "asc" }],
  });

  const ranked = offices
    .map((office) => {
      const isProv = office.level === "إقليمي" || office.name.includes("الإقليمي");
      const fields = [
        { value: normalizeForMatch(office.name), weight: 16 },
        { value: normalizeForMatch(office.province), weight: 12 },
        { value: normalizeForMatch(office.region), weight: 4 },
        { value: normalizeForMatch(office.parentOffice), weight: 3 },
      ];
      const matchScore = tokens.reduce(
        (total, token) =>
          total +
          fields.reduce(
            (fieldScore, field) => {
              // Word-level match or full equality — avoid substring false matches like "سلام" matching "سلا"
              const fieldWords = field.value.split(/\s+/);
              const matches = fieldWords.some((w) => w === token) || field.value === token;
              return fieldScore + (matches ? field.weight : 0);
            },
            0,
          ),
        0,
      );
      // Give Provincial bureaus a natural score boost if there's any match
      const score = matchScore > 0 ? matchScore + (isProv ? 15 : 0) : 0;
      return { office, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.office.sourceId - b.office.sourceId);

  if (ranked.length === 0) return [];

  // When a specific province/city matches strongly, isolate to that location
  const top = ranked[0];
  let filtered = ranked;
  if (top && top.score >= 12) {
    const loc = normalizeForMatch(top.office.province || top.office.name);
    if (loc && loc !== "—") {
      const matchedLocOffices = ranked.filter((item) => {
        const itemProv = normalizeForMatch(item.office.province);
        const itemName = normalizeForMatch(item.office.name);
        return itemProv.includes(loc) || itemName.includes(loc) || loc.includes(itemProv) || loc.includes(itemName);
      });
      if (matchedLocOffices.length > 0) {
        filtered = matchedLocOffices;
      }
    }
  }

  // If user specifically asked for local bureau (محلي / فرع), rank local bureaus first; otherwise provincial first
  const wantsLocal = /محلي|فرع/i.test(query);
  filtered.sort((a, b) => {
    if (wantsLocal) {
      const aIsLocal = a.office.level === "محلي" ? 1 : 0;
      const bIsLocal = b.office.level === "محلي" ? 1 : 0;
      if (aIsLocal !== bIsLocal) return bIsLocal - aIsLocal;
    } else {
      const aIsProv = a.office.level === "إقليمي" || a.office.name.includes("الإقليمي") ? 1 : 0;
      const bIsProv = b.office.level === "إقليمي" || b.office.name.includes("الإقليمي") ? 1 : 0;
      if (aIsProv !== bIsProv) return bIsProv - aIsProv;
    }
    return b.score - a.score || a.office.sourceId - b.office.sourceId;
  });

  return filtered.slice(0, 8).map(({ office }) => buildOfficeKnowledge(office));
}

export async function buildOfficeDirectAnswer(query: string): Promise<string | null> {
  const normQ = normalizeForMatch(query);

  // Pure greetings and pleasantries are NOT office-contact lookups
  if (/^(سلام|السلام|مرحبا|تحية|صباح|مساء|السلام عليكم|تحية نضالية)/i.test(normQ.trim()) && !/مكتب|كاتب|اقليم|جهوي|محلي|فرع|وطني|هاتف|رقم|تواصل/i.test(normQ)) {
    return null;
  }

  // Descriptive bureau questions (missions, roles, formation, etc.) are NOT
  // office-contact lookups. They must not be answered by the office-lookup
  // pipeline — let the intent-router's QUESTION_GENERALE path handle them
  // so the KB can provide the answer.
  if (/مهام|اختصاصات|دور\s|وظائف|تاسيس|تأسيس|تشكيل|تنظيم\s+(?:المكتب|اللجنه|اللجنة|المجلس|النقابه)/i.test(normQ)) {
    return null;
  }

  // General legal, status, administrative, and pedagogical questions must NEVER trigger an office contact
  if (
    /(?:المادة|مادة|مرسوم|قرار|وضعية|ترقية|تقاعد|رخصة|مباراة|مفتش|استاذ|أستاذ|نظام\s*اساسي|قانون\s*اساسي)/i.test(normQ) &&
    !/(?:هاتف|نمرة|أرقام|تواصل مع|اتصال بـ?)/i.test(normQ)
  ) {
    return null;
  }

  const intent = classifyQueryIntent(query);
  const isOfficeContact = intent === "office_contact";

  // Strict bureau query detection: require explicit bureau keywords with modifiers,
  // NOT isolated words like "اقليم" or "وطني" which appear in "المديرية الإقليمية" or "وزارة التربية الوطنية".
  const isBureauQuery =
    /(?:المكتب|مكتب|الكاتب|كاتب|مقرات|مقر|فروع|فرع)\s+(?:الإقليمي|الاقليمي|الجهوي|المحلي|الوطني|النقابي|التنفيذي)/i.test(normQ) ||
    /(?:الكاتب|امين المال|أمين المال)\s+(?:العام|الإقليمي|الاقليمي|الجهوي|المحلي|الوطني)/i.test(normQ) ||
    /(?:هاتف|نمرة|أرقام|تواصل مع|اتصال بـ?)\s+(?:المكتب|الكاتب|النقابة|الفرع|المسؤول النقابي|أمين المال|الجامعة)/i.test(normQ);

  const tokens = extractQueryTokens(normQ).filter((t) => t.length >= 3);
  if (tokens.length === 0 && !isBureauQuery && !isOfficeContact) return null;

  // Contact details are high-impact data: validate against the official local registry
  // before any fuzzy or remote lookup can return a possibly wrong province.
  const verifiedAnswer = await resolveVerifiedOffice(query, tokens, isOfficeContact);
  if (verifiedAnswer) return verifiedAnswer;

  // If this is not an explicit office contact query, do not continue to remote hub or fallback database scans
  if (!isOfficeContact && !isBureauQuery) {
    return null;
  }


  // Filter offices to only those matching ALL query tokens.
  // CRITICAL: Uses WORD-LEVEL matching (not substring) to prevent false positives.
  // Example: "فني" must NOT match as substring of "أصيلة" (Tanger) — it must match a complete word.
  function filterByAllTokens(offices: HubOffice[], allTokens: string[]): HubOffice[] {
    if (allTokens.length === 0) return offices;

    // Pre-compute skeletons for all tokens
    const tokenSkeletons = allTokens.map((t) => normalizeCitySkeleton(t));

    // Office-type/role tokens that should NOT be used as required matches.
    // These are words like "كاتب", "اقليمي", "جهوي" that appear in queries but not in office names.
    const ROLE_OR_LEVEL_TOKENS = new Set([
      "كاتب", "كاتبه", "الكاتب", "مسؤول", "المسؤول", "امين", "امينه", "امين المال",
      "اقليم", "اقليمي", "الاقليم", "الاقليمي", "اقليمية", "الاقليمية",
      "جهه", "جهوي", "الجهوي", "جهة", "الجهة",
      "محلي", "المحلي", "محلية", "المحلية",
      "وطني", "الوطني", "وطنية", "الوطنية",
      "مكتب", "المكتب", "مكاتبيه", "مكاتبي", "مكاتب",
      "فروع", "فرع", "الفرع", "الفروع",
      "هاتف", "الهاتف", "رقم", "الرقم", "نمره", "النمرة", "نمرتها", "نمرة", "اتصال", "تواصل",
      "مدير", "المدير", "منسق", "المنسق",
      "شباب", "اتحاد", "تعليم",
      "fne", "الجامعه", "النقابيه", "النقابه",
    ]);

    // For each office, split name into searchable words (split by spaces, dashes, parens, etc.)
    return offices.filter((o) => {
      const nameLower = o.name.toLowerCase();
      // Split name into words using multiple separators: space, dash, slash, parens, slash, dash, comma
      const nameWords = nameLower.split(/[\s\-\/\\\(\)\[\],،.\u060C\u061B\u061F]+/).filter((w) => w.length >= 2);
      const officeSkeleton = o.squeletteName || normalizeCitySkeleton(o.name);
      const skeletonWords = officeSkeleton.split(/[\s\-\/\\\(\)\[\],،.\u060C\u061B\u061F]+/).filter((w) => w.length >= 2);

      // Each MEANINGFUL token must match a complete word (not a substring within a word)
      return allTokens.every((token, idx) => {
        const tokenSkeleton = tokenSkeletons[idx];

        // Skip role/level tokens — they are not city names and shouldn't be required to match
        if (ROLE_OR_LEVEL_TOKENS.has(token) || ROLE_OR_LEVEL_TOKENS.has(tokenSkeleton)) {
          return true;
        }

        // Skip very short tokens (< 3 chars) for word-level matching
        // (they cause too many false positives)
        if (token.length < 3 && tokenSkeleton.length < 3) {
          return true;
        }

        // WORD-LEVEL EXACT MATCH: token must equal a complete word in the office name
        const wordExactMatch =
          token.length >= 3 &&
          nameWords.some((w) => {
            // Exact equality (handles "تيزنيت" == "تيزنيت")
            if (w === token.toLowerCase()) return true;
            // Token is the full word with prefix/suffix (e.g., "تيزنيت" matches "نيزنيت" — too aggressive, skip)
            return false;
          });

        // WORD-LEVEL SKELETON MATCH: token skeleton must equal a complete word skeleton
        const wordSkeletonMatch =
          tokenSkeleton.length >= 2 &&
          skeletonWords.some((sw) => {
            // Exact skeleton match
            if (sw === tokenSkeleton) return true;
            // Skeleton containment: shorter skeleton in longer skeleton (handles "تيزنيت" in "تيزنيت" type matches)
            // BUT only allow if both have same starting consonant (otherwise it's a false positive)
            if (sw.length >= 3 && tokenSkeleton.length >= 3 && sw.startsWith(tokenSkeleton[0])) {
              // Allow if the difference is <= 1 char
              if (Math.abs(sw.length - tokenSkeleton.length) <= 1) return true;
            }
            return false;
          });

        // FALLBACK: skeleton substring match (only if token has 4+ chars to reduce false positives)
        // This is needed for cases like "سيدي افني" matching "سيدي إفني" (different hamza/alef forms)
        const skeletonSubstringFallback =
          tokenSkeleton.length >= 4 &&
          officeSkeleton.includes(tokenSkeleton);

        return wordExactMatch || wordSkeletonMatch || skeletonSubstringFallback;
      });
    });
  }

  // PRIORITY 1: Fetch live data from hub.taalim.org (always up-to-date, handles all spelling variants)
  // Strategy: try joined city-like tokens first (most precise), then individual tokens as fallback.
  // Office-type tokens (كاتب, اقليمي, etc.) are filtered out in extractQueryTokens via OFFICE_ROLE_STOPWORDS.
  const searchAttempts: string[] = [];

  // Build joined search: combine all city-like tokens with " " separator
  // (e.g., "ايفني" for query "الكاتب الإقليمي إيفني" after stopword removal)
  if (tokens.length > 1) {
    searchAttempts.push(tokens.join(" "));
  }

  // Also add each token individually as fallback
  for (const t of tokens) {
    if (t.length >= 3) {
      searchAttempts.push(t);
    }
  }

  for (const searchTerm of searchAttempts) {
    const hubOffices = await fetchHubOffices(searchTerm);
    if (hubOffices.length > 0) {
      // Filter to offices matching ALL city tokens (prevents "سيدي" from returning all "سيدي X" offices)
      const filtered = filterByAllTokens(hubOffices, tokens);
      if (filtered.length > 0) {
        const hubResponse = formatHubOfficesResponse(filtered);
        if (hubResponse) {
          logger.info(`[buildOfficeDirectAnswer] Hub hit for search="${searchTerm}", found ${filtered.length} of ${hubOffices.length} offices after filtering`);
          return hubResponse;
        }
      } else {
        logger.info(`[buildOfficeDirectAnswer] Hub returned ${hubOffices.length} offices for "${searchTerm}" but filterByAllTokens excluded all`);
      }
    }
  }

  // PRIORITY 2: Fall back to local DB (only if hub is unreachable)
  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: [{ sourceId: "asc" }],
  });

  // Check if query is explicitly asking for national FNE secretary
  const queryIsNational = normQ.includes("الكاتب الوطني") || normQ.includes("المكتب الوطني") || (normQ.includes("وطني") && normQ.includes("fne"));
  if (queryIsNational) {
    const nationalOffice = offices.find((o) => o.level === "وطني" || o.name.includes("المكتب الوطني لـ FNE"))!;
    if (nationalOffice) {
      const lines: string[] = [];
      lines.push(`🏢 *${nationalOffice.name}:*`);
      if (nationalOffice.secretary) {
        const phone = nationalOffice.secretaryPhone ? ` (📞 ${nationalOffice.secretaryPhone})` : "";
        lines.push(`• الكاتب الوطني: الرفيق *${nationalOffice.secretary}*${phone}`);
      }
      if (nationalOffice.treasurer) {
        const tPhone = nationalOffice.treasurerPhone ? ` (📞 ${nationalOffice.treasurerPhone})` : "";
        lines.push(`• أمين المال: الرفيق *${nationalOffice.treasurer}*${tPhone}`);
      }
      return lines.join("\n");
    }
  }

  // Check if query is for Youth sector (اتحاد شباب التعليم)
  const isYouthQuery = normQ.includes("شباب");
  if (isYouthQuery) {
    const youthOffices = offices.filter((o) => o.name.includes("شباب"));
    // If a specific province is mentioned, prioritize that provincial youth branch
    const matchedYouth = youthOffices.find((o) => {
      const provNorm = normalizeForMatch(o.province);
      return provNorm && provNorm !== normalizeForMatch(o.name) && (normQ.includes(provNorm) || tokens.some((t) => provNorm.includes(t)));
    });

    const targetYouth = matchedYouth || youthOffices.find((o) => o.province === o.name) || youthOffices[0];
    if (targetYouth) {
      const lines: string[] = [];
      const provStr = targetYouth.province && targetYouth.province !== "—" ? ` (${targetYouth.province})` : "";
      lines.push(`🏢 *${targetYouth.name}${provStr}:*`);
      if (targetYouth.secretary) {
        const phone = targetYouth.secretaryPhone ? ` (📞 ${targetYouth.secretaryPhone})` : "";
        lines.push(`• الكاتب المسؤول: الرفيق *${targetYouth.secretary}*${phone}`);
      }
      if (targetYouth.treasurer) {
        const tPhone = targetYouth.treasurerPhone ? ` (📞 ${targetYouth.treasurerPhone})` : "";
        lines.push(`• أمين المال: الرفيق *${targetYouth.treasurer}*${tPhone}`);
      }
      return lines.join("\n");
    }
  }

  const ranked = offices
    .map((office) => {
      const isProv = office.level === "إقليمي" || office.name.includes("الإقليمي");
      const fields = [
        { value: normalizeForMatch(office.name), weight: 18 },
        { value: normalizeForMatch(office.province), weight: 26 },
        { value: normalizeForMatch(office.region), weight: 4 },
      ];
      const matchScore = tokens.reduce(
        (total, token) =>
          total +
          fields.reduce(
            (fieldScore, field) =>
              fieldScore +
              (field.value.includes(token) || (field.value.length >= 3 && token.includes(field.value))
                ? field.weight
                : 0),
            0,
          ),
        0,
      );

      const score = matchScore > 0 ? matchScore + (isProv ? 10 : 0) : 0;
      return { office, score };
    })
    .filter((item) => item.score >= 12)
    .sort((a, b) => b.score - a.score || a.office.sourceId - b.office.sourceId);

  // NOTE: Levenshtein fuzzy fallback REMOVED - too aggressive, matched "افني" to all "سيدي X" offices
  // Hub (fetchHubOffices) is authoritative and handles proper spelling variants
  if (!isOfficeContact) {
    return null;
  }

  if (ranked.length === 0) {
    return "لم أجد تطابقاً مؤكداً لاسم المكتب أو الإقليم. لتفادي عرض معلومات خاطئة، اكتب الاسم كاملاً أو استعمل قائمة المكاتب.";
  }

  // Primary matched office
  const top = ranked[0].office;

  // Parallel structure exact output (SNEP, SNAP, SNASE, SNAM)
  if (top.level === "موازي") {
    const orgAcronym = (top.name.match(/[A-Z]{4,}/i)?.[0] || "").toLowerCase();
    const isExplicitParallelQuery =
      (orgAcronym && normQ.toLowerCase().includes(orgAcronym)) ||
      normQ.includes("موازي") ||
      normQ.includes("الابتدائي") ||
      normQ.includes("المبرزين") ||
      normQ.includes("التوجيه والتخطيط") ||
      normQ.includes("الادارة التربوية");

    if (!isExplicitParallelQuery) {
      return null;
    }

    const lines: string[] = [];
    const provStr = top.province && top.province !== "—" ? ` (${top.province})` : "";
    lines.push(`🏢 *${top.name}${provStr}:*`);
    if (top.secretary) {
      const phone = top.secretaryPhone ? ` (📞 ${top.secretaryPhone})` : "";
      lines.push(`• الكاتب المسؤول: الرفيق *${top.secretary}*${phone}`);
    }
    if (top.treasurer) {
      const tPhone = top.treasurerPhone ? ` (📞 ${top.treasurerPhone})` : "";
      lines.push(`• أمين المال: الرفيق *${top.treasurer}*${tPhone}`);
    }
    return lines.join("\n");
  }

  const loc = normalizeForMatch(top.province || top.name);

  // Check if there are local offices under the same province
  const sameProvOffices = ranked
    .map((r) => r.office)
    .filter((o) => {
      const p = normalizeForMatch(o.province);
      const n = normalizeForMatch(o.name);
      return p.includes(loc) || n.includes(loc) || loc.includes(p) || loc.includes(n);
    });

  const provOffice = sameProvOffices.find((o) => o.level === "إقليمي" || o.name.includes("الإقليمي")) || top;
  const localOffices = sameProvOffices.filter((o) => o.id !== provOffice.id && o.level === "محلي");

  const lines: string[] = [];

  // Prov Office Block
  const titleLevel = provOffice.province && provOffice.province !== "—" ? ` (${provOffice.province})` : "";
  lines.push(`🏢 *${provOffice.name}${titleLevel}:*`);
  if (provOffice.secretary) {
    const phone = provOffice.secretaryPhone ? ` (📞 ${provOffice.secretaryPhone})` : "";
    const roleTitle = provOffice.level === "وطني" ? "الكاتب الوطني" : "الكاتب الإقليمي";
    lines.push(`• ${roleTitle}: الرفيق *${provOffice.secretary}*${phone}`);
  }
  if (provOffice.treasurer) {
    const tPhone = provOffice.treasurerPhone ? ` (📞 ${provOffice.treasurerPhone})` : "";
    lines.push(`• أمين المال: الرفيق *${provOffice.treasurer}*${tPhone}`);
  }

  // Local Offices if requested or found
  if (localOffices.length > 0) {
    lines.push("");
    for (const locOff of localOffices.slice(0, 3)) {
      lines.push(`🏢 *${locOff.name} (${locOff.level}):*`);
      if (locOff.secretary) {
        const phone = locOff.secretaryPhone ? ` (📞 ${locOff.secretaryPhone})` : "";
        lines.push(`• الكاتب المحلي: الرفيق *${locOff.secretary}*${phone}`);
      }
    }
  }

  return lines.join("\n");
}

function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

export function extractArticleNumber(query: string): number | null {
  const normalized = toWesternDigits(normalizeForMatch(query));
  // Only extract article number if explicitly preceded by article keywords (المادة, الفصل, article)
  const explicit = normalized.match(/(?:الفصل|ماده|مادة|article)\s*(\d{1,3})\b/i);
  if (!explicit?.[1]) return null;
  const value = Number.parseInt(explicit[1], 10);
  return Number.isFinite(value) && value >= 1 && value <= 200 ? value : null;
}

function isObjectivesQuery(query: string): boolean {
  const normalized = normalizeForMatch(query);
  return ["اهداف الجامعة", "اهداف", "objectifs"].some((phrase) =>
    normalized.includes(normalizeForMatch(phrase)),
  );
}

function detectPublicServiceTopic(query: string): "leaves" | "discipline" | null {
  const normalized = normalizeForMatch(query);
  if (["الرخص", "رخصة", "الرخصة", "اجازة", "إجازة", "congé", "conges"].some((word) => normalized.includes(normalizeForMatch(word)))) {
    return "leaves";
  }
  if (["العقوبات", "التأديبية", "تأديبية", "التاديبية", "انذار", "توبيخ", "التوبيخ", "sanction"].some((word) => normalized.includes(normalizeForMatch(word)))) {
    return "discipline";
  }
  return null;
}

function buildPublicServiceDirectAnswer(
  topic: "leaves" | "discipline" | null,
  knowledgeBase: KnowledgeItem[],
): string | null {
  if (!topic || knowledgeBase.length === 0) return null;

  if (topic === "leaves") {
    const source = knowledgeBase.find((item) => normalizeForMatch(item.content).includes("الفصل 39"));
    if (!source) return null;
    return [
      "حسب الفصل 39 من النظام الأساسي العام للوظيفة العمومية، هذه هي أنواع الرخص:",
      "1. الرخص الإدارية: الرخصة السنوية، الرخص الاستثنائية، والرخص بالتغيب.",
      "2. الرخص لأسباب صحية: مرض قصير الأمد، مرض متوسط الأمد، مرض طويل الأمد، وأمراض أو إصابات ناتجة عن مزاولة العمل.",
      "3. الرخص عن الولادة والأبوة والكفالة والرضاعة.",
      "4. الرخص بدون أجر.",
      "إلى بغيتي تفاصيل مدة أو شروط نوع معين، كتب ليا اسمو.",
    ].join("\n");
  }

  const source = knowledgeBase.find((item) => normalizeForMatch(item.content).includes("الفصل 66"));
  if (!source) return null;
  return [
    "حسب الفصل 66 من النظام الأساسي العام للوظيفة العمومية، العقوبات التأديبية مرتبة حسب الخطورة هي:",
    "1. الإنذار",
    "2. التوبيخ",
    "3. الحذف من لائحة الترقي",
    "4. الانحدار من الرتبة",
    "5. القهقرة من الدرجة",
    "6. العزل",
    "كاينين كذلك عقوبتان خصوصيتان: الحرمان المؤقت من الأجرة باستثناء التعويضات العائلية لمدة لا تتجاوز ستة أشهر، والإحالة الحتمية على التقاعد وفق شروط تشريع التقاعد.",
    "الإنذار والتوبيخ كيصدرو بمقرر معلل، أما العقوبات الأخرى فتتخذ بعد استشارة المجلس التأديبي.",
  ].join("\n");
}

function isLegalOrSensitiveQuery(query: string): boolean {
  const normalized = normalizeForMatch(query);
  const keywords = [
    "القانون الأساسي", "القانون الاساسي", "الفصل", "مادة", "المادة", "statut", "statuts",
    "حق", "حقوق", "نزاع", "شكوى", "قانون", "juridique", "legal", "droit", "litige",
    "sensible", "confidentiel", "confidential",
  ];
  return keywords.some((keyword) => normalized.includes(normalizeForMatch(keyword)));
}

function detectTargetCategories(query: string): string[] | null {
  const normalized = normalizeForMatch(toWesternDigits(query));

  for (const rule of CATEGORY_ROUTING_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(normalizeForMatch(keyword)))) {
      return rule.categories;
    }
  }

  return null;
}

function buildSystemPrompt(context: ConversationContext): string {
  const toneGuide: Record<string, string> = {
    friendly:
      "Be warm, approachable, and conversational. Use a casual but professional tone.",
    professional:
      "Be polished and business-like. Maintain a confident, competent tone while remaining personable.",
    formal:
      "Be professional, polished, and courteous. Use formal language and proper grammar.",
    technical:
      "Be precise and detailed. Use technical terminology when appropriate and provide thorough explanations.",
  };

  const todayDateStr = new Date().toISOString().slice(0, 10);
  const knowledgeSection =
    context.knowledgeBase.length > 0
      ? context.knowledgeBase
        .slice(0, 5)
        .map(
          (k) =>
            `[${k.category}] ${k.title}:\n${k.content.length > 1000 ? k.content.substring(0, 1000) + "..." : k.content}`
        )
        .join("\n\n---\n\n")
      : "No specific knowledge base entries available. Answer based on general knowledge about the business.";

  return `أنت المساعد الذكي للجامعة الوطنية للتعليم FNE بالمغرب.

## هويتك ومهمتك
أنت تتحدث باسم الجامعة الوطنية للتعليم FNE — نقابة المدرسين والمدرسات المغاربة.
الأشخاص الذين يتواصلون معك هم:
- **منخرطون/منخرطات** في الجامعة (أعضاء النقابة)
- **مناضلون/مناضلات** (militants) في صفوف التعليم
- **مدرسون/مدرسات** يبحثون عن معلومات نقابية، قانونية، أو إدارية

${context.businessDesc ? `معلومات عن الجامعة: ${context.businessDesc}` : ""}

## قواعد اللغة والأسلوب (إلزامية 100%)
${toneGuide[context.tone] || toneGuide.friendly}

### ❌ محظور تمامًا — لا تستخدم هذه الكلمات أبدًا:
- كلمات تجارية: "زبون"، "زبناء"، "عميل"، "عملاء"، "خدمة الزبناء"، "client"، "customer"
- كلمات مشرقية/مصرية/لبنانية: "حضرتك"، "إزيك"، "عايز"، "عاوز"، "بدك"، "علشان"، "عشان"، "ليه"، "حاضر يا فندم"، "يا باشا"، "حبيبي"، "تمام يا فندم"، "شو"

### 🤖 الهوية والجهة المطورة:
- أنت **المساعد الذكي الرسمي للجامعة الوطنية للتعليم FNE** (النقابة التعليمية الديمقراطية الأكثر تمثيلية لنساء ورجال التعليم بالمغرب).
- الكاتب الوطني للجامعة: الرفيق **عبد الله اغميمط**.
- إذا سألك المنخرط: "من قام بتطويرك؟" أو "من برمجك؟" أو "من صنعك؟":
  * أجب بفخر واعتزاز: **« أنا المساعد الذكي الرسمي للجامعة الوطنية للتعليم FNE، طُوِّرت هذه المنصة الرقمية وأُعدّت بالكامل من طرف الفريق التقني ونظم المعلومات للجامعة الوطنية للتعليم FNE لخدمة نساء ورجال التعليم »**.
  * **يُمنع منعاً باتاً ومطلقاً** ذكر أسماء شركات الذكاء الاصطناعي الأجنبية أو نماذج التأسيس التقني مثل (MiniMax أو OpenAI أو Anthropic أو غيرها). أنت نظام نقابي مغربي رسمي 100%.

### ⛔ حظر اختلاق الأسماء والهواتف نهائياً (Strict Zero-Hallucination):
- **ممنوع نهائياً ومطلقاً اختلاق أو تأليف أو تخمين أي أسماء لمسؤولي أو أعضاء الجامعة أو هواتفهم!**
- الكاتب الوطني للجامعة الوطنية للتعليم FNE هو حصراً: الرفيق **عبد الله اغميمط** (0662075277).
- الكاتب الإقليمي لـ **إنزكان - آيت ملول** هو حصراً: الرفيق **الكمراني سعيد** (0687665893)، وأمين المال هو الرفيق: **بوحشوش هشام** (0600197933).
- الكاتب الإقليمي لـ **تيزنيت** هو حصراً: الرفيق **هشام الكرطيط** (0666469305)، والكاتب المحلي لتيزنيت: الرفيق **مصطفى نحايلي** (0666918073).
- الكاتب الإقليمي لـ **أكادير إداوتنان** هو حصراً: الرفيق **نافع محمد** (0601831892)، وأمين المال: الرفيق **بصور مولود** (0677185172).
- الكاتب الإقليمي لـ **شتوكة آيت باها**: الرفيق **أمجوض محمد** (0672922260).
- الكاتب الإقليمي لـ **تارودانت**: الرفيق **أيت الحبيب بوبكر** (0638110572).
- الكاتب الإقليمي لـ **طاطا**: الرفيق **مصطفى بوشيت** (0624165070).
- **يُحظر تماماً ذكر أي أسماء أو أرقام هواتف وهمية من خيالك (مثل "محمد بن طاهر"، "لحسن غياث"، "الإخضر"، "المعروفي"... هذه أسماء وهمية محظورة قطعاً)!**
- أي اسم أو هاتف لمسؤول نقابي يجب أن يكون **مستخرجاً حرفياً 100% فقط من [قاعدة المعرفة المتاحة]** المرفقة أعلاه أو الأسماء المحددة هنا.
- إذا سأل المنخرط عن كاتب أو إقليم غير موجود في قاعدة المعرفة، قل فوراً:
  "المعلومة غير متوفرة لدي بدقة حالياً في قاعدة المعرفة، يمكنني فتح طلب لك مع المكتب المختص"
  ولا تسرد أبداً أي أسماء أو أرقام هواتف من خيالك!

### 🚫 قاعدة عدم التأليف عند غياب المعلومة (Zero-Fabrication Default):
- **إذا لم تجد المعلومة في [قاعدة المعرفة المتاحة] المرفقة أعلاه، يجب عليك الامتناع الكلي عن تأليف أو تخمين أي رقم أو تاريخ أو اسم أو محتوى!**
- **الاستجابة الإلزامية الوحيدة** في حالة عدم وجود المعلومة هي الجمل التالية حصراً:
  * "المعلومة غير متوفرة لدي بدقة حالياً في قاعدة المعرفة، يمكنني فتح طلب لك مع المكتب المختص."
  * "لا تتوفر لديّ معطيات مؤكدة عن هذه النقطة حالياً، أرجو التواصل مع المكتب الوطني أو الإقليمي للجامعة."
  * "المعلومة غير متوفرة في قاعدة المعرفة المرفقة، أنصحك بفتح تذكرة للحصول على إجابة رسمية من المكتب المختص."
- **ممنوع منعاً باتاً** قول "صدرت بتاريخ..." أو "تتعلق بـ..." أو "وهي من المراجع..." أو اختلاق أرقام مذكرات (مثل "061.26" أو "26-061") أو تواريخ هجرية وميلادية محددة، ما لم تكن واردة نصاً في قاعدة المعرفة المرفقة.
- **ممنوع منعاً باتاً** حشر أسماء مسؤولين أو أرقام هواتف من خارج قاعدة المعرفة في الرد، حتى لو كانت المحادثة السابقة قد ذكرت جهة أخرى.
- **ممنوع** التوسع والتطويل والتأليف المعرفي حين تكون قاعدة المعرفة فارغة أو لا تحوي إجابة للسؤال، بل اقتصر على جملة أو جملتين تنصح بفتح تذكرة أو زيارة الموقع الرسمي https://Taalim.org أو منصة الخدمات https://hub.taalim.org.
- **فحص ذاتي قبل الإجابة**: قبل إرسال ردك، اسأل نفسك: "هل هذه المعلومة بأكملها مستخرجة حرفياً من قاعدة المعرفة المرفقة؟" إذا كان الجواب لا، فلا ترسل الرد واعترف بعدم توفر المعلومة.

### 🌐 عدم حشر أسماء المكاتب الإقليمية أو المحلية في القضايا والمقالات الوطنية والعامة:
- عندما يسأل المنخرط عن **مقال صحفي، بيان وطني، شراكة وزارية أو دولية، مستجد عام، أو موضوع وطني عام**:
  * **يُمنع منعاً باتاً حشر أو اقتراح اسم كاتب إقليمي أو محلي (مثل تيزنيت أو إنزكان أو غيرهما) أو هاتفه في نهاية الجواب!**
  * لا تنقل سياق الأسئلة السابقة في المحادثة (كالحديث السابق عن تيزنيت أو مسؤول محلي) لتلصقه في موضوع وطني أو دولي جديد!
  * المكاتب الإقليمية والمحلية تُقترح **فقط وفقط إذا سأل المنخرط صراحةً عن ذلك الإقليم أو طلب جهة اتصال محلية**.
  * في القضايا والمقالات الوطنية، وجّه المنخرط حصراً إلى:
    - الموقع الرسمي للجامعة: https://Taalim.org
    - أو منصة الخدمات الرقمية: https://hub.taalim.org
    - أو بوابة مسؤولي الجامعة: https://hub.taalim.org/responsables-fne.php

### 🔗 ضوابط الروابط وعدم التكرار (Link Quality & Clean Anchors):
- **ممنوع نهائياً كتابة الرابط كعنوان مثل [https://Taalim.org](https://Taalim.org) أو [https://...](https://...)!**
- **ممنوع وضع الروابط داخل أقواس مثل (https://...) وممنوع إلصاق النجوم (*) بالروابط إطلاقاً مثل url* أو *url*.**
- اذكر عنوان الوثيقة أو الرابط بنص عربي واضح، واجعل الرابط دائماً في سطر مستقل ونظيف بدون أقواس ولا نجوم ملتصقة:
  مثال:
  📄 *تحميل المذكرة الرسمية (PDF):*
  https://...
- **عدم تكرار رابط taalim.org**: يُمنع تكرار رابط موقع الجامعة أكثر من مرة واحدة في نفس الرد. إذا ورد في متن الجواب لا تعد ذكره في الخاتمة.
- **حظر تام لاختلاق أي روابط أو مسارات وهمية (Strict Zero Fabricated URLs):**
  * يُمنع منعاً كلياً وباتاً اختلاق أو تخمين أي رابط إلكتروني أو مسار صفحة غير معتمد (مثل /guide_debutant أو أي رابط آخر خارج قاعدة المعرفة المرفقة)!
  * الروابط المسموح بذكرها حصراً هي العناوين المعتمدة رسمياً:
    - https://Taalim.org
    - https://hub.taalim.org
    - https://hub.taalim.org/responsables-fne.php
    - https://hub.taalim.org/adherer
    - https://hub.taalim.org/calc_promotion_points.php
    - https://hub.taalim.org/generate_request.php
    - https://hub.taalim.org/milaf
    - https://hub.taalim.org/participation_form.php
    - https://hub.taalim.org/carte_scolaire.php
  * إذا سأل المنخرط عن دليل أو وثيقة أو استمارة غير موجودة في قاعدة المعرفة المرفقة، لا تخترع لها رابطاً إطلاقاً على منصة hub.taalim.org، بل صرّح مباشرة بعدم توفر الدليل واعرض عليه فتح تذكرة مع المكتب المختص.


### 👤 حظر انتحال شخصية أي مسؤول نقابي أو التحدث باسمه (Strict No-Impersonation):
- **أنت المساعد الذكي الرقمي الرسمي للجامعة، ولست شخصاً حقيقياً ولا مسؤولاً نقابياً بعينه!**
- **ممنوع نهائياً ومطلقاً التحدث بلسان أو بصفة الكاتب الوطني عبد الله اغميمط، أو التوقيع باسمه، أو القول: "أنا عبد الله اغميمط" أو "بصفتي الكاتب الوطني" أو التحدث بضمير المتكلم نيابة عن قيادة الجامعة!**
- عبد الله اغميمط هو الكاتب الوطني الفعلي للجامعة، وتتحدث عنه دائماً **بضمير الغائب وباحترام نضالي**: (مثال: *"الكاتب الوطني للجامعة هو الرفيق عبد الله اغميمط..."* أو *"للتواصل مع الكاتب الوطني عبد الله اغميمط..."*).
- هويتك وصفتك الثابتة في كل ردودك دون استثناء هي: **« المساعد الذكي للجامعة الوطنية للتعليم FNE »**.

### 🛡️ الصمود أمام ضغط المستخدم وعدم الانجرار وراء التأكيد الكاذب (Anti-Sycophancy Guardrail):
- حتى لو أصرّ المستخدم، أو عاتبك بحزم، أو قال لك: *"ما هذا الجواب؟"*، *"لديك كل المعطيات"*، *"أنت تكذب"*، *"ابحث جيداً لديك الأسماء كلها"*:
  * **إياك ثم إياك أن ترتبك أو تتراجع وتختلق أسماء أو هواتف غير واردة في قاعدة المعرفة المرفقة أعلاه!**
  * لا تستبدل الأسماء الحقيقية المسجلة لديك (مثل نافع محمد بأكادير) بأسماء وهمية خيالية (مثل محمد بن يحيى أو أحمد أوناصر أو غيرهم)!
  * أجب بثبات واحترام نقابي: وضّح له الأسماء المسجلة رسمياً لديك، وبيّن أن الأقاليم الأخرى لم تُدرج بياناتها بعد في النظام، واعرض عليه فوراً فتح تذكرة تواصل مع المكتب الجهوي أو الوطني لتأكيد وتحديث المعطيات.

### ✅ استخدم دائمًا المعجم النقابي باللغة العربية الفصحى:
- بدل "زبون/عميل" → **"المنخرط"** أو **"المناضل"** أو **"الرفيق/الرفيقة"**
- للترحيب: "مرحباً بك رفيقي/رفيقتي"، "أهلاً بك في الجامعة الوطنية للتعليم"
- للمساعدة: "كيف يمكنني مساعدتك؟"، "الجامعة هنا لخدمة المنخرطين"
- للتأسف: "المعلومة غير متوفرة لدي بدقة حالياً، يمكنني فتح طلب لك مع المكتب المختص"

### اللغة المطلوبة:
${context.language !== "auto" ? `دائمًا أجب بـ: ${context.language}` : "أجب دائماً باللغة العربية الفصحى (Modern Standard Arabic) وبشكل احترافي. تجنب الدارجة تماماً. إذا تواصل معك المستخدم بالفرنسية، يمكنك الإجابة بالفرنسية."}

### 📝 تنسيق الإجابات والمقالات في شكل فقرات متماسكة ومبررة (Paragraphs Format):
- اكتب إجاباتك وعروض المقالات والبيانات في شكل **فقرات متماسكة، مسترسلة ومترابطة** (Flowing, coherent paragraphs) تملأ عرض الشاشة كفقرات مبررة على تطبيق واتساب والهواتف الذكية.
- لا تقطّع الكلام أو نصوص المقالات إلى أسطر متفرقة أو جمل قصيرة مبتورة، بل ادمج الجمل في فقرات غنية وواضحة.
- اترك سطراً فارغاً بين كل فقرة والتي تليها لإضفاء راحة بصرية وترتيب أنيق.
- عند تقديم أسماء المكاتب أو الشروط القانونية أو المواد، رتبها في نقاط موجزة ومضبوطة.

### 🚫 حظر تام للخطوط الأفقية وأشرطة الفصل التزيينية (No Horizontal Divider Lines):
- **يُمنع منعاً باتاً ومطلقاً وضع خطوط أفقية أو شرطات أو فواصل ممتدة** مثل (──────── أو ━━━━━━━━ أو ══════ أو ------- أو ______ أو ***) في أي مكان داخل ردك!
- هذه الخطوط تشوه مظهر الرسائل تماماً على واتساب وتكسر اتجاه النص العربي (RTL) وتتداخل مع الروابط.
- للفصل بين المحاور أو الفقرات، استخدم **فقط سطراً فارغاً عادياً** مع عنوان فرعي واضح مسبوق برمز تعبيري (مثال: 📌 *عنوان المحور*).

## قاعدة المعرفة المتاحة
استخدم المعلومات التالية للإجابة على أسئلة المنخرطين بدقة:

${knowledgeSection}

## التاريخ الحالي والمقالات والبيانات المنشورة على الموقع (https://Taalim.org):
- تاريخ اليوم: ${todayDateStr}
- مقالات وبيانات ومستجدات الموقع الرسمي للجامعة متوفرة ومدرجة في قاعدة المعرفة المرفقة أعلاه تحت تصنيف [الموقع الإلكتروني للجامعة].
- عندما يسأل المنخرط عن **آخر مقال منشور على الموقع** أو **أحدث مقال** أو **آخر الأخبار والمستجدات** أو **بيانات وبلاغات الجامعة**:
  * **ممنوع نهائياً** أن تقول "لا أملك إمكانية التصفح المباشر" أو "ادخل للموقع لتعرف"! بل قدّم له فوراً وبشكل مباشر عنوان ومضمون **أحدث مقال متوفر في قاعدة المعرفة المرفقة أعلاه** (وهو المقال الأول في القائمة).
  * اذكر عنوان المقال بوضوح، ولخّص له أهم النقط والمحاور والمطالب الواردة فيه بنبرة نقابية مسؤولة.
  * **قاعدة حظر التكرار (Anti-Duplication)**: اذكر رابط الموقع https://Taalim.org مرة واحدة فقط. تجنب تماماً إدراج فقرات نصائح مكررة مثل "للحصول على آخر بيان ننصحك بـ: 1. زيارة الموقع 2. متابعة صفحات التواصل"، لأنك قد قدمت البيان/المقال الفعلي بالفعل! لا تكرر الروابط ولا النصائح النمطية في نفس الجواب.
  * استعرض كذلك عند الحاجة أحدث البيانات والبلاغات والرسائل الصادرة عن الجامعة والمكتب الوطني.

## معالجة المساطر الإدارية وتدبير الفائض والخصاص:
- عند السؤال عن **تدبير الفائض والخصاص**، **تحديد الأستاذ الفائض**، أو **التكليفات**:
  * استند مباشرة إلى الدليل الإجرائي الميداني المفصل (المراحل الثلاث: 1- حصر الفائض والخصاص بالمؤسسة، 2- تعبئة بطاقة الرغبات وترتيب المؤسسات الشاغرة، 3- معالجة الطلبات باللجنة الإقليمية وفق الأولويات الجغرافية: داخل الجماعة، الجماعات المجاورة، ثم التكليف التلقائي).
  * اذكر بوضوح **الوضعية القانونية والضمانات للأستاذ المكلف** (التكليف مؤقت ينتهي بنهاية الموسم الدراسي، الاحتفاظ بالمنصب الأصلي، استمرار الأقدمية والمشاركة في الحركة الانتقالية، احترام الحصيص الساعي).
  * **ممنوع الاكتفاء بالعموميات والشعارات الإدارية**، بل ركّز على الشرح العملي والميداني للخطوات التي تهم الأستاذ وتصون حقوقه.

## إرشادات أساسية
- **أنت مساعد رقمي للجامعة الوطنية للتعليم FNE**: تتحدث بنبرة محترمة ودافئة، وتقدم معلومات دقيقة ومفيدة.
- **التكامل بين النصوص الرسمية والمواكبة النقابية (المرجع الإداري والقانوني والدعم النقابي)**:
  * في الأسئلة الإدارية والمهنية (الحركة الانتقالية، الاستيداع، الإلحاق، التقاعد، الترقية، الرخص):
    1. **السند القانوني والإداري الرسمي**: قدّم الشروط، الآجال، والمساطر الرسمية الدقيقة المعتمدة لدى الوزارة (مذكرات men.gov.ma) والنصوص المؤطرة (فصول النظام الأساسي للوظيفة العمومية).
    2. **التوجيه العملي والمواكبة النقابية**: وجّه المنخرط بكيفية إعداد ملفه والضمانات التي تحميه، مع إرشاده إلى منصة خدمات الجامعة https://hub.taalim.org (لحساب النقط، توليد الطلبات، أو إيداع الملفات الترافعية).
    3. **المواقف والبيانات النضالية**: اقتصر على الجواب الإداري والقانوني العملي المباشر، ولا تقحم بيانات الإضراب أو المواقف الاحتجاجية إلا إذا سأل المنخرط صراحةً عن موقف أو تقييم الجامعة.
  * اشرح للمنخرط حقوقه القانونية وسبل الترافع النقابي عبر https://Taalim.org ومنصة الخدمات https://hub.taalim.org عند الحاجة.
- استخدم أداة create_ticket عندما يحتاج المنخرط تدخلًا من المكتب النقابي أو متابعة إدارية شخصية
- استخدم send_internal_email لإخبار المسؤولين بالقضايا العاجلة
- عندما تود الإشارة إلى الموقع الرسمي الخاص بالنقابة (الجامعة الوطنية للتعليم FNE)، استخدم الرابط: https://Taalim.org. انتبه: هذا الرابط خاص بنقابتنا وليس موقع الوزارة أو مسار
- عند وجود فصل قانوني أو مقتضى نظامي متعلق بالسؤال، اذكره مباشرة
- الجواب يكون وافياً، منظمًا، ومباشراً باللغة العربية الفصحى
- قناة التواصل الحالية: ${context.channel}
${context.customerName !== "Unknown" ? `- المنخرط/ة: ${context.customerName}` : ""}

## منصة التدبير الرقمي والخدمات الإلكترونية للجامعة (https://hub.taalim.org)
تضع الجامعة رهن إشارة نساء ورجال التعليم منصة رقمية متطورة تتيح خدمات حصرية، ويجب عليك إرشاد المنخرطين والزملاء إليها بروابطها المباشرة في الحالات التالية:
1. **الانخراط وتجديد العضوية النقابية**:
   - عندما يسأل المنخرط/ة عن كيفية الانخراط، شروط العضوية، الحصول على بطاقة النقابة أو تجديدها:
   - قدّم له رابط استمارة الانخراط الإلكترونية المباشر: https://hub.taalim.org/adherer
   - واذكر له أيضاً إمكانية التواصل مع المكتب الإقليمي في إقليمه لاستلام بطاقته والتنسيق المباشر.
2. **حساب وتدقيق نقط الترقية**:
   - عندما يسأل عن الترقية في الدرجة أو الرتبة (بالاختيار أو بالامتحان) أو كيفية احتساب النقط والمسار المهني:
   - بعد الإجابة القانونية الوافية، اقترح عليه استخدام حاسبة الترقية الرسمية للجامعة: https://hub.taalim.org/calc_promotion_points.php
3. **توليد الطلبات والمراسلات الإدارية**:
   - عندما يطلب نموذج طلب إداري، تظلم، طعن، استئناف، أو رخصة:
   - أرشده إلى مولّد الطلبات الإدارية لإنشاء وثيقته بصيغة قانونية جاهزة للطباعة: https://hub.taalim.org/generate_request.php
4. **الملف النقابي والتبليغ عن الخروقات**:
   - عندما يعرض مشكلة إدارية، تظلماً، شططاً في السلطة أو خرقاً في ملفه:
   - أرشده لإيداع ملفه النقابي للترافع عنه لدى مسؤولي الجامعة: https://hub.taalim.org/milaf واستمارة التبليغ: https://hub.taalim.org/participation_form.php
5. **الخريطة المدرسية والتخطيط التربوي**:
   - للأسئلة المتعلقة بالمعطيات المجالية والتخطيط المدرسي: https://hub.taalim.org/carte_scolaire.php

## ضوابط صارمة ومباشرة لمعلومات المكاتب والتواصل التنظيمي (إلزامية ومطلقة):
1. **الإيجاز والدقة المباشرة (بدون حشو ولا كلام زائد):**
   - عندما يسأل المنخرط عن كاتب إقليمي أو محلي أو رقم هاتف أو مسؤول في إقليم/مدينة معينة:
     * **أجب مباشرة وموجزاً**: اذكر اسم المسؤول وصفته ورقم هاتفه فوراً وبشكل محدد وواضح ونقطي.
     * **ممنوع نهائياً الإطالة أو الحشو أو كتابة فقرات طويلة إنشائية لا فائدة منها.**
     * مثال: إذا سأل: "ما هو رقم الكاتب الإقليمي لتيزنيت؟" أو "الكاتب الإقليمي لتطوان":
       أجب مباشرة:
       🏢 **المكتب الإقليمي لتيزنيت:**
       • الكاتب الإقليمي: الرفيق **هشام الكرطيط** (📞 0666469305)
       • أمين المال: الرفيق **عبد الله أوراي** (📞 0662657351)
       (ولا تضف أي كلام إضافي غير مفيد!).
2. **تمثيل فئات التعليم**: في الجامعة الوطنية للتعليم FNE، **المكتب الإقليمي والمكاتب المحلية** في أي إقليم يمثلون **كافة نساء ورجال التعليم بمختلف فئاتهم وأسلاكهم** (أساتذة التعليم الابتدائي، الإعدادي، الثانوي التأهيلي، أطر الإدارة والدعم، المساعدين، إلخ).
3. **أولوية ودقة المكتب الإقليمي والمحلي**:
   - في كافة الأقاليم (تطوان، تيزنيت، أكادير، طنجة، فاس، مراكش، وغيرها):
   - قدم الكاتب المسؤول ورقم هاتفه المطابق 100% لقاعدة المعرفة المرفقة.
   - إذا كان هناك مكتب محلي لنفس المدينة (مثل المكتب المحلي لتيزنيت: الرفيق **مصطفى نحايلي** 0666918073)، اذكره بنقطة موجزة إضافية.
4. **الدقة الجغرافية التامة ومنع الخلط أو اختلاق الأسماء نهائياً**:
   - إذا سأل عن "تطوان": الكاتب الإقليمي هو **عزيز بوفرحي** (0659584133).
   - إذا سأل عن "تيزنيت": الكاتب الإقليمي هو **هشام الكرطيط** (0666469305).
   - إذا سأل عن "طنجة": الكاتب الإقليمي هو **بندحمان الصياد** (0667505173).
   - إذا سأل عن "إنزكان آيت ملول": الكاتب الإقليمي هو **الكمراني سعيد** (0687665893).
   - ممنوع إعطاء بيانات إقليم آخر إطلاقاً. التزم بالأسماء والهواتف المسجلة حرفياً.

## التقويم المدرسي ومواعيد الدخول المدرسي 2026/2027 (معلومات رسمية ومؤكدة بالكامل):
الموسم الدراسي الجاري والمعتمد رسمياً في قاعدة بيانات الجامعة هو **الموسم الدراسي 2026/2027**، استناداً إلى **مقرر وزير التربية الوطنية والتعليم الأولي والرياضة رقم 047.26 بشأن تنظيم السنة الدراسية 2026/2027** وبلاغ التذكير الرسمي.
عندما يسأل المنخرط عن مواعيد أو تفاصيل الدخول المدرسي، قدّم له الجدولة الزمنية الكاملة والتفصيلية التالية:

1. **التحاق أطر وموظفي الوزارة وتوقيع محاضر الدخول (استئناف العمل):**
   - • **الثلاثاء 1 شتنبر 2026:** التحاق أطر وموظفي هيئة الإدارة التربوية والتدبير، وهيئة التفتيش والتأطير والمراقبة والتقييم، وهيئة متصرفي التربية الوطنية، وأطر التسيير المادي والمالي، والأطر المشتركة بمقرات عملهم لتوقيع محاضر الدخول.
   - • **الأربعاء 2 شتنبر 2026:** التحاق أطر وموظفي هيئة التربية والتعليم (هيئة التدريس بمختلف الأسلاك: الابتدائي، الإعدادي، الثانوي التأهيلي) وهيئة الأساتذة الباحثين في التربية والتكوين بمقرات عملهم لتوقيع محاضر الدخول.

2. **التحاق التلميذات والتلاميذ وانطلاق الدراسة الفعلية حسب الأسلاك والمستويات:**
   - • **الخميس 3 شتنبر 2026:** التحاق أطفال التعليم الأولي، وتلاميذ السنتين الأولى والثانية ابتدائي، والسنة الأولى من سلك الثانوي الإعدادي، والجذوع المشتركة من سلك الثانوي التأهيلي.
   - • **الجمعة 4 شتنبر 2026:** التحاق تلاميذ السنتين الثالثة والرابعة ابتدائي، والسنة الثانية من سلك الثانوي الإعدادي، والسنة الأولى بكالوريا.
   - • **السبت 5 شتنبر 2026:** التحاق تلاميذ السنتين الخامسة والسادسة ابتدائي، والسنة الثالثة من سلك الثانوي الإعدادي، والسنة الثانية بكالوريا.
   - • **الإثنين 7 شتنبر 2026:** الانطلاقة الفعلية والإلزامية للدراسة بكافة الأسلاك والمستويات التعليمية وتخصيص الفترة لتشخيص المكتسبات والدعم الاستدراكي.
   - • **الإثنين 5 أكتوبر 2026:** انطلاق الدراسة بالنسبة لأقسام التربية غير النظامية والفرصة الثانية.

3. **توقيع محاضر الخروج ونهاية السنة:** ابتداءً من **10 يوليوز 2027** لأطر وهيئة التدريس.
⚠️ **تنبيه حاسم:** لا تختصر التواريخ ولا تقل أبداً إن موعد الدخول غير محدد، بل اعرض دائماً هذه التفاصيل الكاملة والدقيقة!

## تاريخ التواصل
${context.customerHistory.length > 0 ? context.customerHistory.join("\n") : "أول تواصل لهذا المنخرط/ة مع الجامعة."}`;
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
  if (startIndex < 0 || text[startIndex] !== "{") return null;

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

function hasInlineCreateTicketDirective(text: string): boolean {
  return /create[\s_-]*ticket/i.test(text);
}

function extractTextToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
  const directiveRegex = /create[\s_-]*ticket/gi;
  const matches = text.matchAll(directiveRegex);

  for (const match of matches) {
    const matchStart = match.index ?? -1;
    if (matchStart < 0) continue;

    const searchStart = matchStart + match[0].length;
    const jsonStart = text.indexOf("{", searchStart);
    if (jsonStart < 0) continue;

    const rawJson = extractBalancedJsonObject(text, jsonStart);
    if (!rawJson) continue;

    try {
      const rawArgs = JSON.parse(rawJson) as Record<string, unknown>;
      return {
        name: "create_ticket",
        args: {
          ...rawArgs,
          title: rawArgs.title || rawArgs.subject || rawArgs.issue_title,
          description: rawArgs.description || rawArgs.issue_description,
          priority: rawArgs.priority === "normal" ? "medium" : rawArgs.priority,
        },
      };
    } catch {
      continue;
    }
  }

  return null;
}

export type CannedResponseRecord = {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string;
  isActive: boolean;
  usageCount?: number;
};

export type AutomationRuleRecord = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  isActive: boolean;
  priority?: number | null;
  conditions: Array<{ field: string; operator: string; value: string }>;
  actions: Array<{ type: string; value: string }>;
};

export function findMatchingAutomationReply(
  query: string,
  channel: string,
  customerName: string,
  rules: AutomationRuleRecord[],
): string | null {
  const normalizedQuery = normalizeForMatch(query);
  if (!normalizedQuery) return null;

  let bestRule: { rule: AutomationRuleRecord; score: number } | null = null;

  for (const rule of rules.filter((item) => item.isActive && item.type === "auto_reply")) {
    let score = 0;

    for (const condition of rule.conditions ?? []) {
      const field = condition.field;
      const operator = condition.operator;
      const value = condition.value ?? "";
      const normalizedValue = normalizeForMatch(value);

      if (field === "message_content") {
        const haystack = normalizedQuery;
        if (operator === "contains" && haystack.includes(normalizedValue)) score += 20;
        if (operator === "equals" && haystack === normalizedValue) score += 30;
        if (operator === "starts_with" && haystack.startsWith(normalizedValue)) score += 25;
      }

      if (field === "channel") {
        if (operator === "equals" && normalizeForMatch(channel) === normalizeForMatch(value)) score += 10;
        if (operator === "contains" && normalizeForMatch(channel).includes(normalizeForMatch(value))) score += 10;
      }

      if (field === "customer_name") {
        if (operator === "equals" && normalizeForMatch(customerName) === normalizeForMatch(value)) score += 10;
        if (operator === "contains" && normalizeForMatch(customerName).includes(normalizeForMatch(value))) score += 10;
      }
    }

    if (rule.priority && rule.priority > 0) score += rule.priority;

    if (score > 0 && (!bestRule || score > bestRule.score)) {
      bestRule = { rule, score };
    }
  }

  if (!bestRule) return null;

  const replyAction = bestRule.rule.actions?.find((action) => action.type === "auto_reply" || action.type === bestRule!.rule.type);
  return replyAction?.value?.trim() || null;
}

export function findMatchingCannedResponse(
  query: string,
  responses: CannedResponseRecord[],
  selectedMenuChoice?: string | null,
): CannedResponseRecord | null {
  const normalizedQuery = normalizeForMatch(query);
  if (!normalizedQuery) return null;

  const menuCategories: Record<string, string[]> = {
    "1": ["Offices", "المكاتب", "المكاتب - إقليمي", "المكاتب - جهوي", "المكاتب - وطني"],
    "2": ["Statuts FNE", "القانون الأساسي", "statuts"],
    "3": ["مقرر السنة الدراسية 2026-2027", "السنة الدراسية"],
    "4": ["النظام الأساسي للوظيفة العمومية", "وظيفة عمومية", "fonction publique"],
  };

  const generalWebsiteHints = [
    "موقع", "رابط", "رابط إلكتروني", "رابط الكتروني", "website", "site", "official", "officiel", "url", "link",
  ];

  let bestMatch: { response: CannedResponseRecord; score: number } | null = null;

  for (const response of responses.filter((item) => item.isActive)) {
    const candidateText = `${response.title} ${response.content} ${response.category} ${response.shortcut}`;
    const normalizedCandidate = normalizeForMatch(candidateText);
    const normalizedTitle = normalizeForMatch(response.title || "");
    const normalizedShortcut = normalizeForMatch(response.shortcut || "");
    const normalizedCategory = normalizeForMatch(response.category || "");
    const queryTokens = extractQueryTokens(query)
      .filter((token) => token.length >= 2)
      .map((token) => token.trim());

    if (queryTokens.length === 0) continue;

    let score = 0;
    for (const token of queryTokens) {
      if (normalizedCandidate.includes(token)) score += 5;
      if (normalizedTitle.includes(token)) score += 2;
      if (normalizedShortcut.includes(token)) score += 4;
    }

    if (selectedMenuChoice) {
      const allowedCategories = menuCategories[selectedMenuChoice] ?? [];
      const isCategoryMatch = allowedCategories.length === 0 ||
        allowedCategories.some((category) => normalizeForMatch(category) === normalizedCategory || normalizedCategory.includes(normalizeForMatch(category)) || normalizeForMatch(category).includes(normalizedCategory));
      if (isCategoryMatch && score > 0) score += 3;
    }

    const hasWebsiteIntent = generalWebsiteHints.some((hint) => normalizedQuery.includes(normalizeForMatch(hint)));
    if (hasWebsiteIntent && (normalizedTitle.includes("موقع") || normalizedTitle.includes("رابط") || normalizedCandidate.includes("موقع") || normalizedCandidate.includes("رابط") || normalizedCandidate.includes("website") || normalizedCandidate.includes("site") || normalizedCandidate.includes("url") || normalizedCandidate.includes("link"))) {
      score += 12;
    }

    const isDirectMatch =
      (response.title && normalizedTitle === normalizedQuery) ||
      (response.shortcut && normalizedShortcut === normalizedQuery) ||
      (response.title && normalizedQuery.includes(normalizedTitle) && normalizedTitle.length >= 8);

    if ((isDirectMatch || score >= 14) && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { response, score };
    }
  }

  return bestMatch?.response ?? null;
}

export function findMatchingHoldingResponse(
  query: string,
  holdings: CannedResponseRecord[]
): CannedResponseRecord | null {
  const normQuery = normalizeForMatch(query).replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (!normQuery) return null;

  const queryTokens = normQuery.split(/\s+/).filter((t) => t.length >= 3);

  for (const h of holdings.filter((item) => item.isActive)) {
    const normTitle = normalizeForMatch(h.title || "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    const normShortcut = normalizeForMatch(h.shortcut || "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();

    // 1. Exact equality with title or shortcut
    if (normQuery === normTitle || (normShortcut && normQuery === normShortcut)) {
      return h;
    }

    // 2. Substring containment
    if (normTitle.length >= 8 && (normQuery.includes(normTitle) || normTitle.includes(normQuery))) {
      return h;
    }

    // 3. Keyword / token intersection
    const titleTokens = normTitle.split(/\s+/).filter((t) => t.length >= 3);
    if (titleTokens.length >= 2 && queryTokens.length >= 2) {
      const matchCount = titleTokens.filter((t) =>
        queryTokens.some((qt) => qt === t || qt.includes(t) || t.includes(qt))
      ).length;
      const minLength = Math.min(titleTokens.length, queryTokens.length);
      if (matchCount >= 2 && (matchCount / minLength >= 0.6 || matchCount >= 3)) {
        return h;
      }
    }
  }

  return null;
}

export async function getKnowledgeBase(query?: string): Promise<KnowledgeItem[]> {
  const targetCategories = query && query.trim().length > 0 ? detectTargetCategories(query) : null;

  // Collect office matches if query relates to offices/locations
  let officeMatches: KnowledgeItem[] = [];
  if (query && targetCategories?.includes("Offices")) {
    officeMatches = await findOfficeMatches(query);
  }

  // Load all active knowledge entries across all categories for intelligent cross-referencing
  const entries = await prisma.knowledgeEntry.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });

  const activeEntries = entries;

  if (query && query.trim().length > 0 && activeEntries.length > 0) {
    const normQ = normalizeForMatch(query);
    const isLatestNewsQuery =
      normQ.includes("اخر بيان") ||
      normQ.includes("احدث بيان") ||
      normQ.includes("اخر البيانات") ||
      normQ.includes("احدث البيانات") ||
      normQ.includes("اخر المستجدات") ||
      normQ.includes("احدث المستجدات") ||
      normQ.includes("اخر مقال") ||
      normQ.includes("احدث مقال") ||
      normQ.includes("اخر المقالات") ||
      normQ.includes("احدث المقالات") ||
      normQ.includes("المقال المنشور") ||
      normQ.includes("مقال منشور") ||
      normQ.includes("منشور على الموقع") ||
      normQ.includes("منشور علي الموقع") ||
      normQ.includes("نشر على الموقع") ||
      normQ.includes("نشر علي الموقع") ||
      normQ.includes("اخر ما نشر") ||
      normQ.includes("اخر ما نزل") ||
      normQ.includes("جديد الموقع") ||
      normQ.includes("مستجدات الموقع") ||
      normQ.includes("اخبار الموقع") ||
      normQ.includes("اخر الاخبار") ||
      normQ.includes("احدث الاخبار") ||
      (normQ.includes("مقال") && (normQ.includes("اخر") || normQ.includes("جديد") || normQ.includes("موقع") || normQ.includes("منشور"))) ||
      (normQ.includes("موقع") && (normQ.includes("اخر") || normQ.includes("جديد") || normQ.includes("نشر") || normQ.includes("منشور") || normQ.includes("مقال"))) ||
      (normQ.includes("بيان") && (normQ.includes("اخر") || normQ.includes("جديد") || normQ.includes("موقع"))) ||
      normQ.includes("بيان المكتب الوطني") ||
      normQ.includes("بيانات المكتب الوطني") ||
      normQ.includes("رسالة المكتب الوطني");

    if (isLatestNewsQuery) {
      try {
        const websiteCat = await prisma.category.findFirst({
          where: { name: { contains: "الموقع الإلكتروني للجامعة", mode: "insensitive" } },
        });

        const newestWebsiteEntries = await prisma.knowledgeEntry.findMany({
          where: {
            isActive: true,
            OR: [
              ...(websiteCat ? [{ categoryId: websiteCat.id }] : []),
              { title: { contains: "بيان" } },
              { title: { contains: "بلاغ" } },
              { title: { contains: "كلمة" } },
              { title: { contains: "رسالة" } },
            ],
          },
          include: { category: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        });

        if (newestWebsiteEntries.length > 0) {
          return newestWebsiteEntries.map((entry, idx) => ({
            category: entry.category.name,
            title: entry.title,
            content: entry.content,
            priority: 3500 - idx * 100,
          }));
        }
      } catch (err) {
        logger.warn("[getKnowledgeBase] Failed to fetch latest website entries:", { error: String(err) });
      }
    }
    if (targetCategories?.includes("النظام الأساسي للوظيفة العمومية")) {
      const topic = detectPublicServiceTopic(query);
      if (topic) {
        const topicTerms = topic === "leaves"
          ? ["الرخص", "الرخصة", "الرخص الصحية", "الرخصة السنوية", "الفصل 39", "الفصل 40", "الفصل 41", "الفصل 42", "الفصل 46"]
          : ["العقوبات", "التأديبية", "التاديبية", "الفصل 65", "الفصل 66", "الفصل 67", "الفصل 68", "الفصل 69", "الفصل 70"];
        const topicEntries = activeEntries
          .map((entry) => {
            const content = normalizeForMatch(entry.content);
            const score = topicTerms.reduce((total, term) => total + (content.includes(normalizeForMatch(term)) ? 1 : 0), 0);
            return { entry, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (topicEntries.length > 0) {
          return topicEntries.map(({ entry }) => ({
            category: entry.category.name,
            title: entry.title,
            content: entry.content,
            priority: Math.max(entry.priority, 1800),
          }));
        }
      }
    }

    if (isObjectivesQuery(query) && targetCategories?.includes("Statuts FNE")) {
      const objectivesEntries = activeEntries.filter((entry) => {
        const metadata = entry.metadata as Record<string, unknown> | null;
        const articleNumber = typeof metadata?.articleNumber === "number"
          ? metadata.articleNumber
          : Number.parseInt(String(metadata?.articleNumber || ""), 10);
        return articleNumber >= 3 && articleNumber <= 12;
      });

      if (objectivesEntries.length > 0) {
        return objectivesEntries.map((entry) => ({
          category: entry.category.name,
          title: entry.title,
          content: entry.content,
          priority: Math.max(entry.priority, 1500),
        }));
      }
    }

    const articleNumber = extractArticleNumber(query);
    if (articleNumber !== null) {
      const exactArticleEntries = activeEntries.filter((entry) => {
        const metadata = entry.metadata as Record<string, unknown> | null;
        const metaNumber = typeof metadata?.articleNumber === "number"
          ? metadata.articleNumber
          : typeof metadata?.articleNumber === "string"
            ? Number.parseInt(metadata.articleNumber, 10)
            : null;

        if (metaNumber === articleNumber) return true;

        const title = normalizeForMatch(entry.title);
        const content = normalizeForMatch(entry.content);
        return (
          title.includes(`article ${articleNumber}`) ||
          content.includes(`article ${articleNumber}`) ||
          content.includes(`الفصل ${articleNumber}`)
        );
      });

      if (exactArticleEntries.length > 0) {
        return exactArticleEntries
          .sort((a, b) => b.priority - a.priority)
          .slice(0, 4)
          .map((entry) => ({
            category: entry.category.name,
            title: entry.title,
            content: entry.content,
            priority: Math.max(entry.priority, 1000),
          }));
      }
    }
  }

  if (query && query.trim().length > 0 && activeEntries.length > 0) {
    const tokens = extractQueryTokens(query);
    if (tokens.length > 0) {
      const ranked = activeEntries
        .map((entry) => {
          const title = normalizeForMatch(entry.title);
          const category = normalizeForMatch(entry.category?.name || "");
          const content = normalizeForMatch(entry.content);

          let score = 0;
          const normQ = normalizeForMatch(query);

          // Exact and high phrase match boost
          if (normQ.length > 5 && (title.includes(normQ) || normQ.includes(title))) {
            score += 70;
          }
          if (normQ.length > 5 && (content.includes(normQ) || normQ.includes(content))) {
            score += 40;
          }

          for (const token of tokens) {
            if (title.includes(token)) score += 12;
            if (category.includes(token)) score += 4;
            if (content.includes(token)) score += 3;
          }

          // Direct priority weighting bonus (higher priority entries dominate)
          if (entry.priority > 0) {
            score += Math.min(entry.priority, 30);
          }

          // Recency boost: entries added or updated recently get a quick bonus to be answered immediately
          const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
          if (ageMs < 14 * 86400000) {
            score += 15;
          }

          // Strong affinity bonus for target categories matched by intent
          if (targetCategories && targetCategories.includes(entry.category?.name || "")) {
            score += 35;
          }

          const metadata = entry.metadata as Record<string, unknown> | null;
          if (metadata?.quality === "high") {
            score += 4;
          }

          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.entry.priority - a.entry.priority);

      // Intelligent Cross-Referencing: Ensure diverse representation across categories
      // (e.g. Ministry official text + Union stance + Legal statutes simultaneously)
      const isOfficeQuery = /مكتب|مكاتب|جهة|جهات|إقليم|أقاليم|كاتب|كتاب|أعضاء|تشكيلة|سوس|تيزنيت|تارودانت/i.test(query);
      const maxPerCat = isOfficeQuery ? 10 : 4;
      const maxTotal = isOfficeQuery ? 10 : 8;

      const selected: typeof ranked = [];
      const categoryCounts = new Map<string, number>();

      for (const item of ranked) {
        const catName = item.entry.category?.name || "Other";
        const currentCount = categoryCounts.get(catName) || 0;
        if (currentCount < maxPerCat) {
          selected.push(item);
          categoryCounts.set(catName, currentCount + 1);
          if (selected.length >= maxTotal) break;
        }
      }

      // If slots remain, fill with next best matches regardless of category
      if (selected.length < maxTotal) {
        for (const item of ranked) {
          if (!selected.includes(item)) {
            selected.push(item);
            if (selected.length >= maxTotal) break;
          }
        }
      }

      if (selected.length > 0) {
        let kbResults = selected.map(({ entry, score }) => ({
          category: entry.category?.name || "عام",
          title: entry.title,
          content: entry.content,
          priority: Math.max(entry.priority, score),
        }));

        // ─── Semantic boost ────────────────────────────────────────────────────
        // Also query the embedding-based index and merge high-similarity entries
        // that the keyword scoring missed (e.g. short entries or entries using
        // synonyms that don't match exact tokens). This is a *boost*, not a
        // replacement: keyword results always dominate, but well-ranked
        // semantic hits get added.
        try {
          const semanticResults = await searchKnowledgeBase(query, 8);
          if (semanticResults && semanticResults.length > 0) {
            const existingIds = new Set(kbResults.map((r) => r.title));
            const boosts: typeof kbResults = [];
            for (const item of semanticResults) {
              // Only consider semantic hits above 0.25 cosine similarity
              // (translates to priority ≥ 25 below).
              if (item.score < 0.25) continue;
              if (existingIds.has(item.title)) {
                // Already in keyword results: bump its priority so it dominates.
                const existing = kbResults.find((r) => r.title === item.title);
                if (existing) {
                  existing.priority += Math.round(item.score * 100);
                }
              } else {
                // Add new entry from semantic search.
                boosts.push({
                  category: item.category,
                  title: item.title,
                  content: item.content,
                  priority: Math.round(item.score * 100),
                });
                existingIds.add(item.title);
              }
            }
            if (boosts.length > 0) {
              kbResults = [...kbResults, ...boosts];
              // Re-sort by priority descending after merge
              kbResults.sort((a, b) => b.priority - a.priority);
            }
          }
        } catch (_error) {
          // If semantic search fails, keep keyword results.
        }

        if (officeMatches.length > 0) {
          return [...kbResults, ...officeMatches.slice(0, 3)].slice(0, 10);
        }
        return kbResults;
      }

      if (officeMatches.length > 0) {
        return officeMatches;
      }
    }
  }

  // Cross-category semantic retrieval fallback
  if (query && query.trim().length > 0) {
    try {
      const semanticResults = await searchKnowledgeBase(query, 5);
      if (semanticResults && semanticResults.length > 0) {
        return semanticResults.map((item) => ({
          category: item.category,
          title: item.title,
          content: item.content,
          priority: Math.round(item.score * 100),
        }));
      }
    } catch (_error) {
      // Fallback to priority-based retrieval below.
    }
  }

  return activeEntries.slice(0, 5).map((e: { category: { name: string }; title: string; content: string; priority: number }) => ({
    category: e.category.name,
    title: e.title,
    content: e.content,
    priority: e.priority,
  }));
}

export async function getAIConfig(): Promise<AIConfig & ConversationContext> {
  let settings = await prisma.settings.findFirst();
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: "default" } });
  }

  return {
    provider: settings.aiProvider,
    model: settings.aiModel,
    apiKey: settings.aiApiKey,
    apiKeys: [settings.aiApiKey, settings.aiApiKeySecondary].filter((key) => String(key || "").trim().length > 0),
    fallbackProvider: settings.fallbackProvider,
    fallbackModel: settings.fallbackModel,
    fallbackApiKey: settings.fallbackApiKey,
    externalAiEnabled: (settings as any).externalAiEnabled ?? false,
    externalAiProvider: (settings as any).externalAiProvider || "groq",
    externalAiModel: (settings as any).externalAiModel || "llama-3.3-70b-versatile",
    externalAiApiKey: (settings as any).externalAiApiKey || "",
    externalAiPrompt: (settings as any).externalAiPrompt || "",
    externalAiAuditPolicy: (settings as any).externalAiAuditPolicy || "always",
    maxTokens: settings.maxTokens,
    temperature: settings.temperature,
    businessName: settings.businessName,
    businessDesc: settings.businessDesc,
    welcomeMessage: settings.welcomeMessage,
    tone: settings.tone,
    language: settings.language,
    knowledgeBase: [],
    customerName: "",
    customerHistory: [],
    channel: "",
  };
}

export const DEFAULT_EXTERNAL_AI_PROMPT = `Tu es un assistant d'information pour les enseignants de l'éducation nationale au Maroc (وزارة التربية الوطنية والتعليم الأولي والرياضة).
1. Cadre d'intervention : Réponds dans le cadre strict des lois, statuts, mutuelles (CNOPS/MGEN) et pratiques de l'enseignement au Maroc.
2. Délais et procédures : Précise toujours les délais réglementaires exacts applicables aux fonctionnaires de l'éducation au Maroc (ex: pour le dépôt des dossiers ordinaires de soins CNOPS/MGEN, le délai réglementaire de dépôt est de 60 jours à compter du premier acte médical).
3. Clarté : Fournis une réponse structurée, complète et sans t'arrêter en cours de phrase.`;

export async function callExternalAiFallback(
  config: AIConfig,
  userMessage: string,
  history: Array<{ role: string; content: string }> = []
): Promise<string | null> {
  const apiKey = (config.externalAiApiKey || config.apiKey || config.fallbackApiKey || "").trim();
  if (!apiKey) {
    logger.warn("[ExternalAI] No API key available for external AI fallback");
    return null;
  }

  const systemPrompt = (config.externalAiPrompt && config.externalAiPrompt.trim().length > 0)
    ? config.externalAiPrompt.trim()
    : DEFAULT_EXTERNAL_AI_PROMPT;

  const provider = config.externalAiProvider || "groq";

  // Build resilient model candidates.
  const preferredModel = (config.externalAiModel && config.externalAiModel !== "llama-3.3-70b-versatile")
    ? config.externalAiModel
    : (provider === "gemini" ? "gemini-3.6-flash" : "openai/gpt-oss-120b");

  const candidateModels = provider === "groq"
    ? Array.from(new Set([preferredModel, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]))
    : provider === "gemini"
    ? Array.from(new Set([preferredModel, "gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro"]))
    : [preferredModel];

  let baseURL = "https://api.groq.com/openai/v1";
  if (provider === "openai") baseURL = "https://api.openai.com/v1";
  if (provider === "gemini") baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";

  const client = new OpenAI({ apiKey, baseURL });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const h of history.slice(-4)) {
    if (h.role === "customer" || h.role === "user") {
      messages.push({ role: "user", content: h.content });
    } else if (h.role === "assistant") {
      messages.push({ role: "assistant", content: h.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  let answer: string | undefined;

  for (const model of candidateModels) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 2500,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        answer = text;
        logger.info(`[ExternalAI] Successfully generated answer using model ${model}`);
        break;
      }
    } catch (err: any) {
      logger.warn(`[ExternalAI] Model ${model} failed (${err?.status || err?.message}), trying next candidate...`);
    }
  }

  if (!answer) {
    logger.error("[ExternalAI] All candidate models failed to generate an answer");
    return null;
  }

  // Detect language: Arabic vs French/Other
  const hasArabic = /[\u0600-\u06FF]/.test(userMessage);
  const disclaimer = hasArabic
    ? "\n\n> ⚠️ **تنبيه:** هذه المعطيات استرشادية، يُرجى مراجعة إدارتك أو التنسيق مع المسؤول الإقليمي للنقابة لتدقيق وضعيتك الإدارية."
    : "\n\n> ⚠️ **Avertissement :** Ces données sont fournies à titre indicatif. Veuillez consulter votre administration ou vous coordonner avec le responsable provincial du syndicat pour vérifier votre situation administrative.";

  if (!answer.includes("هذه المعطيات استرشادية") && !answer.includes("Ces données sont fournies à titre indicatif")) {
    answer += disclaimer;
  }

  return answer;
}

// ─── Keyword Triggers ────────────────────────────────────────────────────────
// Check if the incoming message exactly matches a keyword trigger.
// Returns the fixed response string if matched, null otherwise.
// Triggers are loaded from AutomationRule rows with type="keyword_trigger".
export async function checkKeywordTriggers(message: string): Promise<string | null> {
  try {
    const triggers = await prisma.automationRule.findMany({
      where: { isActive: true, type: "keyword_trigger" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    const normalized = message.trim().toLowerCase();

    for (const trigger of triggers) {
      const conditions = trigger.conditions as Array<{ keyword?: string }>;
      const actions = trigger.actions as Array<{ type?: string; value?: string }>;

      const keyword = conditions?.[0]?.keyword ?? "";
      if (!keyword) continue;

      if (keyword.toLowerCase() === normalized) {
        const replyAction = actions.find((a) => a.type === "reply");
        const reply = replyAction?.value ?? "";
        if (reply) {
          // Increment triggerCount
          await prisma.automationRule.update({
            where: { id: trigger.id },
            data: { triggerCount: { increment: 1 } },
          }).catch(() => { }); // fire-and-forget, don't block the reply
          return reply;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export async function chat(
  conversationId: string,
  userMessage: string,
  options?: { disableExternalAi?: boolean }
): Promise<string> {
  const config = await getAIConfig();

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      // Pull the latest messages first to avoid stale context from old conversations.
      messages: { orderBy: { createdAt: "desc" }, take: 6 },
    },
  });

  if (!conversation) {
    return "Conversation not found.";
  }

  const conversationMetadata = (conversation.metadata ?? {}) as Record<string, unknown>;
  const selectedMenuChoice = typeof conversationMetadata.selectedMenuChoice === "string"
    ? conversationMetadata.selectedMenuChoice
    : null;
  const pendingOfficeCandidate = typeof conversationMetadata.pendingOfficeCandidate === "string"
    ? conversationMetadata.pendingOfficeCandidate
    : null;

  // ─── AGENTS.md compliance layer ────────────────────────────────────────────
  // Step 1: Reconstruct persisted state and clear stale state for free-form
  // questions. This is the rule that prevents a menu selection or office
  // clarification from leaking into an unrelated global question.
  const persistedState = conversationMetadata.conversationState as Partial<StateContext> | undefined;
  const ctx: StateContext =
    persistedState && typeof persistedState === "object" && typeof persistedState.state === "string"
      ? {
        state: persistedState.state as StateContext["state"],
        lastActivity: persistedState.lastActivity
          ? new Date(String(persistedState.lastActivity))
          : new Date(),
        payload: (persistedState.payload as Record<string, unknown> | undefined) ?? {},
      }
      : createIdleState();

  // A free-form question is any non-numeric, non-ticket-confirmation input.
  const isNumericMenu = /^[0-9]$/.test(userMessage.trim());
  const isFreeFormQuestion = !isNumericMenu && !isTicketConfirmation(userMessage);
  const clearedCtx = clearStaleState(ctx, isFreeFormQuestion);

  // Persist the cleared state back so the next message sees a consistent view.
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      metadata: {
        ...(conversationMetadata as Prisma.InputJsonValue as Record<string, unknown>),
        conversationState: {
          state: clearedCtx.state,
          lastActivity: clearedCtx.lastActivity.toISOString(),
          payload: clearedCtx.payload ?? {},
        },
      } as Prisma.InputJsonValue,
    },
  }).catch(() => { /* fire-and-forget */ });

  // Step 2: Classify the intent BEFORE any retrieval. The normalized text is
  // the single entry point that goes through normalizeArabic — never a custom
  // regex.
  const normalizedUserMessage = normalizeArabic(userMessage);
  const classification = classifyIntent(normalizedUserMessage);
  const detectedIntent: Intent = classification.intent;

  // Step 3: Gate AI generation through decideAnswer. The refusal path is the
  // data-contract guard: if no allowed source exists for this intent, we MUST
  // refuse rather than guess.
  const availableSources: ReadonlyArray<SourceType> =
    detectedIntent === INTENT.CONTACT_BUREAU ? ["office_registry"] :
      detectedIntent === INTENT.ORGANE_OFFICIEL ? ["official_roster"] :
        detectedIntent === INTENT.POSITION_NATIONALE ? ["union_communique", "union_site"] :
          detectedIntent === INTENT.TICKET_REQUEST ? ["ticket_system"] :
            ["knowledge_base"];

  // hasOfficialRoster is false until a dated roster is registered. Until then
  // we MUST refuse the ORGANE_OFFICIEL intent.
  const hasOfficialRoster = false;
  const decision = decideAnswer({
    intent: detectedIntent,
    classification,
    availableSources,
    hasOfficialRoster,
  });

  if (decision.kind === "refuse") {
    trackRefusal(decision.intent, decision.reason);
    logAnswer({
      intent: decision.intent,
      sourceType: "none",
      confidence: classification.confidence,
      decision: "refuse",
      reason: decision.reason,
      channel: conversation.channel,
      conversationId,
      requiredClarification: false,
      toolCallExecuted: false,
    });
    return decision.reason;
  }
  // ───────────────────────────────────────────────────────────────────────────

  const officeConfirmation = pendingOfficeCandidate && isTicketConfirmation(userMessage)
    ? await buildOfficeDirectAnswer(pendingOfficeCandidate)
    : null;
  if (officeConfirmation) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: {
          ...conversationMetadata,
          pendingOfficeCandidate: null,
          pendingTicket: null,
        },
      },
    });
  }
  const pendingTicketConfirmation = !pendingOfficeCandidate && conversationMetadata.pendingTicket && isTicketConfirmation(userMessage)
    ? await confirmPendingTicket(conversationId)
    : null;

  const trimmedMsg = userMessage.trim();
  const isDisclaimerQuery =
    trimmedMsg === "7" ||
    trimmedMsg === "ميثاق" ||
    /ميثاق\s*(ال)?استخدام/.test(trimmedMsg) ||
    /توجيه\s*تنظيمي/.test(trimmedMsg) ||
    userMessage.includes("إخلاء مسؤولية") ||
    userMessage.includes("إخلاء المسؤولية") ||
    userMessage.includes("توجيه تنظيمي وإخلاء مسؤولية");

  if (isDisclaimerQuery) {
    return [
      "⚖️ **توجيه تنظيمي وإخلاء مسؤولية**",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "يندرج هذا **المساعد الرقمي التفاعلي** ضمن المبادرات والخدمات الرقمية الحديثة التي تضعها الجامعة الوطنية للتعليم FNE رهن إشارة نساء ورجال التعليم، بهدف **تيسير الولوج السريع للمعلومة وتقديم التوجيه النقابي والإداري الأولي**.",
      "",
      "وحرصاً على الدقة والانضباط المسطري، يُرجى الانتباه إلى المبادئ التالية:",
      "",
      "1. **طبيعة الخدمة التوجيهية**: صُممت هذه المنصة لتقديم معطيات إرشادية وتوجيهية عامة للاستئناس، ولا تُغني عن استشارة النصوص التشريعية والتنظيمية الجاري بها العمل.",
      "",
      "2. **حجية النصوص والمقررات**: تظل النصوص القانونية الصادرة في الجريدة الرسمية، والبلاغات والبيانات والمذكرات الصادرة عن الأجهزة التقريرية والتنفيذية للجامعة، هي المرجع المعتمد والملزم نقابياً وإدارياً.",
      "",
      "3. **حدود المسؤولية**: لا تترتب على الجامعة الوطنية للتعليم FNE أي مسؤولية قانونية أو إدارية بخصوص أي إجراء أو قرار يُتخذ بناءً على توجيهات أولية دون الرجوع إلى النصوص الأصلية أو استشارة الهياكل المختصة.",
      "",
      "4. **المواكبة النقابية المباشرة**: في الملفات الفردية الدقيقة أو النزاعات الإدارية المعقدة، ندعو الرفيقات والرفاق دوماً إلى:",
      "• مراجعة المنشورات والوثائق الرسمية الصادرة عن الجامعة.",
      "• التواصل المباشر مع مكاتب الجامعة (المحلية، الإقليمية، الجهوية، أو الوطنية).",
      "• طلب فتح تذكرة عبر هذا الشات لإحالة الملف على المسؤول النقابي المختص.",
      "",
      "💡 **تجربة أكثر سلاسة:** لتجربة تفاعلية سريعة ومتقدمة بأزرار مرنة، يمكنكم أيضاً استخدام المساعد عبر تيليغرام: https://t.me/askfne_bot",
    ].join("\n");
  }

  if (!config.apiKey && !config.fallbackApiKey && !pendingTicketConfirmation) {
    return "AI is not configured. Please add your API key in Settings > AI Configuration.";
  }

  const categoryHintByMenuChoice: Record<string, string> = {
    "1": "organisation bureaux المكاتب",
    "2": "القانون الأساسي statuts fne",
    "3": "مقرر السنة الدراسية",
    "4": "النظام الأساسي للوظيفة العمومية fonction publique",
    "5": "الدخول المدرسي إجراءات التسجيل rentrée scolaire",
    "6": "الموقع الإلكتروني بيانات بلاغات",
    "7": "توجيه تنظيمي إخلاء مسؤولية",
  };

  const isDigitChoice = /^[0-9]$/.test(userMessage.trim());
  let retrievalQuery = isDigitChoice && selectedMenuChoice && categoryHintByMenuChoice[selectedMenuChoice]
    ? categoryHintByMenuChoice[selectedMenuChoice]
    : userMessage;

  // Contextual expansion for short follow-up questions (e.g. "اللائحة", "الأسماء", "من هم", "التشكيلة")
  // Only apply if the previous message was sent recently (within 15 minutes) to avoid cross-session pollution.
  if (userMessage.trim().length <= 25) {
    const now = Date.now();
    const recentCustMsg = conversation.messages.find(
      (m) =>
        (m.role === "customer" || m.role === "user") &&
        m.content.trim() !== userMessage.trim() &&
        (now - new Date(m.createdAt).getTime()) < 15 * 60 * 1000
    );
    if (recentCustMsg && recentCustMsg.content) {
      retrievalQuery = `${recentCustMsg.content.trim()} ${userMessage.trim()}`;
    }
  }

  const [cannedResponses, automationRules] = await Promise.all([
    prisma.cannedResponse.findMany({
      where: { isActive: true },
      orderBy: { usageCount: "asc" },
    }),
    prisma.automationRule.findMany({
      where: { isActive: true, type: "auto_reply" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  // Holding Disclaimers Interceptor: Check if query matches any holding disclaimer for an erroneous/pending question
  const holdingResponses = (cannedResponses || []).filter(
    (item) => item.category === "unanswered_holding"
  ) as unknown as CannedResponseRecord[];
  const normalCannedResponses = (cannedResponses || []).filter(
    (item) => item.category !== "unanswered_holding"
  ) as unknown as CannedResponseRecord[];

  const matchingHoldingResponse = findMatchingHoldingResponse(userMessage, holdingResponses);
  if (matchingHoldingResponse) {
    await prisma.cannedResponse.update({
      where: { id: matchingHoldingResponse.id },
      data: { usageCount: { increment: 1 } },
    }).catch(() => {});
    logger.info(`[Engine] Intercepted query with holding disclaimer (id: ${matchingHoldingResponse.id})`);
    return matchingHoldingResponse.content;
  }

  const matchingAutomationReply = findMatchingAutomationReply(
    userMessage,
    conversation.channel,
    conversation.customerName,
    (automationRules || []) as unknown as AutomationRuleRecord[],
  );
  const matchingCannedResponse = findMatchingCannedResponse(userMessage, normalCannedResponses, selectedMenuChoice);

  const knowledgeBase = await getKnowledgeBase(retrievalQuery);
  const directPublicServiceAnswer = selectedMenuChoice === "4"
    ? buildPublicServiceDirectAnswer(detectPublicServiceTopic(userMessage), knowledgeBase)
    : null;

  const responseConfig = isLegalOrSensitiveQuery(userMessage) && config.fallbackProvider === "claude"
    ? {
      ...config,
      provider: config.fallbackProvider,
      model: config.fallbackModel || "claude-sonnet-5",
      apiKey: config.fallbackApiKey || "",
      apiKeys: [],
      fallbackProvider: "groq",
      fallbackModel: config.model,
      fallbackApiKey: config.apiKey,
    }
    : config;

  const context: ConversationContext = {
    ...config,
    knowledgeBase,
    customerName: conversation.customerName,
    channel: conversation.channel,
    customerHistory: [],
  };

  // Build message history (compact to stay well under token limits)
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(context) },
  ];

  for (const msg of [...conversation.messages].slice(0, 4).reverse()) {
    if (msg.role === "customer") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  // Guardrails: check if human approval needed
  const approval = requiresHumanApproval(userMessage);
  if (approval.required) {
    const sentiment = analyzeSentiment(userMessage);
    const intent = detectIntent(userMessage);

    // Store metadata for dashboard visibility
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: {
          escalationReason: approval.reason,
          sentiment: sentiment.sentiment,
          intent: intent.intent,
        },
      },
    });
  }

  // Save user message
  const savedUserMsg = await prisma.message.create({
    data: {
      conversationId,
      role: "customer",
      content: userMessage || "[Empty Message]",
    },
  });
  emitNewMessage(conversationId, { id: savedUserMsg.id, role: "customer", content: userMessage || "[Empty Message]" });

  // Contact lookups are strictly gated by detectedIntent and classifyQueryIntent.
  // A free-form general question must never trigger an office contact lookup or hijack the response.
  const isContactIntent =
    detectedIntent === INTENT.CONTACT_BUREAU ||
    classifyQueryIntent(userMessage) === "office_contact";

  const directOfficeAnswer = isContactIntent
    ? await buildOfficeDirectAnswer(userMessage)
    : null;
  const officeSuggestion = directOfficeAnswer?.match(/هل تقصد:\n•\s*([^\n]+)/)?.[1]?.trim() || null;
  if (officeSuggestion) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: {
          ...conversationMetadata,
          pendingOfficeCandidate: officeSuggestion,
          pendingTicket: null,
        },
      },
    });
  }

  let response =
    officeConfirmation ||
    pendingTicketConfirmation ||
    directOfficeAnswer ||
    directPublicServiceAnswer ||
    (matchingCannedResponse ? matchingCannedResponse.content : null) ||
    matchingAutomationReply;

  if (!response) {
    response = await callAI(responseConfig, messages, conversationId);
  }

  if (matchingAutomationReply) {
    const matchedRule = automationRules.find((rule) =>
      rule.isActive &&
      rule.type === "auto_reply" &&
      findMatchingAutomationReply(userMessage, conversation.channel, conversation.customerName, [rule as unknown as AutomationRuleRecord]) === matchingAutomationReply
    );

    if (matchedRule) {
      await prisma.automationRule.update({
        where: { id: matchedRule.id },
        data: { triggerCount: { increment: 1 } },
      });
    }
  }

  if (matchingCannedResponse) {
    await prisma.cannedResponse.update({
      where: { id: matchingCannedResponse.id },
      data: { usageCount: { increment: 1 } },
    });
  }

  // Confidence scoring, hallucination detection, and unanswered question flagging
  let isRefusal = isAssistantRefusal(response);
  const confidence = estimateConfidenceDetailed(
    response,
    knowledgeBase.length,
    false,
    knowledgeBase,
    userMessage
  );

  // HALLUCINATION GUARD: If the AI fabricated confident claims or invented URLs not backed by KB,
  // replace the response with a safe refusal message BEFORE saving/sending.
  if (confidence.hallucinationPenalty && confidence.hallucinationPenalty >= 0.4 && !isRefusal) {
    logger.warn("[chat] Hallucination detected, replacing response with safe refusal", {
      penalty: confidence.hallucinationPenalty,
      reason: confidence.hallucinationReason,
      userMessage: userMessage.substring(0, 100),
    });

    response = [
      "⚠️ **تنبيه بخصوص الدقة**",
      "",
      "المعلومة أو الوثيقة المطلوبة غير متوفرة لدي بدقة كافية في قاعدة المعرفة المعتمدة حالياً، ولتجنب تقديم أي معطيات غير دقيقة أعتذر عن عدم تزويدك بتفاصيل غير مؤكدة.",
      "",
      "لتأكيد المعلومة بشكل رسمي والحصول على الوثائق المعتمدة، أقترح عليك:",
      "• **فتح تذكرة** مع المكتب النقابي المختص لمواكبة ملفك وتقديم الوثيقة الرسمية.",
      "• أو زيارة الموقع الرسمي للجامعة: https://Taalim.org",
      "• أو منصة الخدمات الرقمية الرسمية: https://hub.taalim.org",
      "",
      "هل تود أن أفتح لك تذكرة تواصل مع المكتب النقابي الآن؟",
    ].join("\n");

    // Re-evaluate refusal status after substitution
    isRefusal = isAssistantRefusal(response) || true;
  }

  // External AI Fallback (e.g. Groq Llama-3.3-70B) for teacher queries absent from internal KB
  if (
    !options?.disableExternalAi &&
    isRefusal &&
    config.externalAiEnabled &&
    detectedIntent !== INTENT.CONTACT_BUREAU &&
    detectedIntent !== INTENT.ORGANE_OFFICIEL &&
    !isTicketConfirmation(userMessage) &&
    !userMessage.trim().match(/^[0-9]$/)
  ) {
    try {
      logger.info("[chat] Primary response was refusal, triggering External AI Fallback for teacher query", {
        userMessage: userMessage.substring(0, 80),
      });
      const externalAnswer = await callExternalAiFallback(
        config,
        userMessage,
        conversation.messages
      );
      if (externalAnswer) {
        response = externalAnswer;
        isRefusal = false;

        const auditPolicy = config.externalAiAuditPolicy || "always";
        if (auditPolicy === "always") {
          try {
            const conv = await prisma.conversation.findUnique({
              where: { id: conversationId },
              select: { metadata: true },
            });
            const meta = ((conv?.metadata as Record<string, unknown>) || {});
            const existingList = Array.isArray(meta.unansweredQuestions)
              ? (meta.unansweredQuestions as Array<Record<string, unknown>>)
              : [];
            await prisma.conversation.update({
              where: { id: conversationId },
              data: {
                metadata: {
                  ...meta,
                  hasExternalAiFallback: true,
                  unansweredQuestions: [
                    ...existingList,
                    {
                      question: userMessage,
                      askedAt: new Date().toISOString(),
                      source: "external_ai",
                      externalAiAnswer: externalAnswer,
                    },
                  ],
                } as unknown as Prisma.InputJsonValue,
              },
            });
          } catch (_) {}
        } else if (auditPolicy === "negative_only") {
          try {
            const conv = await prisma.conversation.findUnique({
              where: { id: conversationId },
              select: { metadata: true },
            });
            const meta = ((conv?.metadata as Record<string, unknown>) || {});
            await prisma.conversation.update({
              where: { id: conversationId },
              data: {
                metadata: {
                  ...meta,
                  hasExternalAiFallback: true,
                  externalAiPendingAudit: {
                    question: userMessage,
                    askedAt: new Date().toISOString(),
                    source: "external_ai",
                    externalAiAnswer: externalAnswer,
                  },
                } as unknown as Prisma.InputJsonValue,
              },
            });
          } catch (_) {}
        }
      }
    } catch (err: any) {
      logger.error("[chat] External AI Fallback execution failed:", err?.message || err);
    }
  }

  // Save assistant message
  const savedMessage = await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: response,
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  if (confidence.shouldEscalate) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "escalated" },
    });
  }

  if (isRefusal) {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { metadata: true },
      });
      if (conv) {
        const meta = (conv.metadata || {}) as Record<string, unknown>;
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            metadata: {
              ...meta,
              hasUnanswered: true,
              lastUnansweredAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch (_) { }
  }

  emitNewMessage(conversationId, { id: savedMessage.id, role: "assistant", content: response });

  // ─── AGENTS.md observability + freshness annotation ────────────────────────
  // Track tool call usage and source authorization for audit.
  const toolCallExecuted =
    !!officeConfirmation ||
    !!pendingTicketConfirmation ||
    !!directOfficeAnswer ||
    !!directPublicServiceAnswer ||
    !!matchingAutomationReply;

  if (toolCallExecuted) {
    // Pick the actual source that was used so the audit log is accurate.
    const sourceType: SourceType | "none" =
      officeConfirmation || directOfficeAnswer
        ? "office_registry"
        : pendingTicketConfirmation
          ? "ticket_system"
          : directPublicServiceAnswer || matchingCannedResponse || matchingAutomationReply
            ? "knowledge_base"
            : "none";
    if (isSourceAllowed(detectedIntent, sourceType as SourceType)) {
      logAnswer({
        intent: detectedIntent,
        sourceType,
        confidence: classification.confidence,
        decision: "answer",
        channel: conversation.channel,
        conversationId,
        requiredClarification: false,
        toolCallExecuted: true,
      });
    }
  }

  return response;
}

export function buildAnthropicRequest(
  config: AIConfig,
  messages: AIMessage[]
): {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts: string[] = [];
  const payloadMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content) {
        systemParts.push(message.content);
      }
      continue;
    }

    const content = message.tool_calls?.length
      ? message.tool_calls
        .map((toolCall) => `Tool: ${toolCall.function.name}\nArguments: ${toolCall.function.arguments}`)
        .join("\n\n")
      : message.content;

    if (!content) continue;

    payloadMessages.push({
      role: message.role === "assistant" || message.role === "tool" ? "assistant" : "user",
      content,
    });
  }

  const request: {
    model: string;
    max_tokens: number;
    system?: string;
    temperature?: number;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  } = {
    model: config.model,
    max_tokens: config.maxTokens,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    messages: payloadMessages,
  };

  return request;
}

async function callAI(
  config: AIConfig,
  messages: AIMessage[],
  conversationId: string,
  depth = 0
): Promise<string> {
  const provider = config.provider.toLowerCase();

  // If provider is Groq and this is top-level user request (depth === 0), route through the smart rate-limiting queue
  if (provider === "groq" && depth === 0) {
    const fallbackFn =
      config.fallbackProvider && config.fallbackApiKey && config.fallbackModel
        ? () =>
          executeAIInternal(
            {
              ...config,
              provider: config.fallbackProvider || "",
              model: config.fallbackModel || "",
              apiKey: config.fallbackApiKey || "",
              apiKeys: [],
              fallbackProvider: "",
              fallbackModel: "",
              fallbackApiKey: "",
            },
            messages,
            conversationId,
            depth + 1
          )
        : undefined;

    return globalAIQueue.enqueue(
      () => executeAIInternal(config, messages, conversationId, depth),
      fallbackFn,
      `groq-conv-${conversationId.substring(0, 8)}`
    );
  }

  return executeAIInternal(config, messages, conversationId, depth);
}

async function executeAIInternal(
  config: AIConfig,
  messages: AIMessage[],
  conversationId: string,
  depth = 0
): Promise<string> {
  if (depth > 5) {
    return "I apologize, but I'm having trouble processing your request. Let me connect you with a team member.";
  }

  const provider = config.provider.toLowerCase();
  const callFallback = () => {
    if (!config.fallbackProvider || !config.fallbackModel || !config.fallbackApiKey) {
      return null;
    }
    return executeAIInternal(
      {
        ...config,
        provider: config.fallbackProvider || "",
        model: config.fallbackModel || "",
        apiKey: config.fallbackApiKey || "",
        apiKeys: [],
        fallbackProvider: "",
        fallbackModel: "",
        fallbackApiKey: "",
      },
      messages,
      conversationId,
      depth + 1,
    );
  };

  if (provider === "anthropic" || provider === "claude") {
    const requestBody = buildAnthropicRequest(config, messages);
    const apiKeys = config.apiKeys?.length ? config.apiKeys : [config.apiKey];

    try {
      const sendAnthropic = async (body: {
        model: string;
        max_tokens: number;
        system?: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
      }) => {
        return fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });
      };

      let response: Response | null = null;
      let lastError = "";

      for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
        const key = apiKeys[keyIndex];
        const sendWithKey = (body: typeof requestBody) => fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });

        response = await sendWithKey(requestBody);
        let errorText = "";
        if (!response.ok) errorText = await response.text();

        const shouldFallbackModel =
          response.status === 404 &&
          errorText.includes("not_found_error") &&
          errorText.includes("model:") &&
          requestBody.model !== "claude-sonnet-5";

        if (shouldFallbackModel) {
          console.warn(`[Anthropic API Warning] Model not found (${requestBody.model}), retrying with claude-sonnet-5`);
          response = await sendWithKey({ ...requestBody, model: "claude-sonnet-5" });
          if (!response.ok) errorText = await response.text();
        }

        if (response.ok) break;

        lastError = errorText;
        const canRotate = [401, 408, 429, 500, 502, 503, 529].includes(response.status);
        if (canRotate && keyIndex < apiKeys.length - 1) {
          console.warn(`[Anthropic API Warning] Key ${keyIndex + 1} failed with HTTP ${response.status}; trying key ${keyIndex + 2}`);
          continue;
        }
      }

      if (!response?.ok) {
        console.error("[Anthropic API Error]", lastError);
        return (await callFallback()) || "I'm temporarily unable to process your request. Please try again in a moment, or I can connect you with a team member.";
      }

      const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
      const text = data.content
        ?.map((part) => part.text ?? "")
        .filter(Boolean)
        .join("\n") || "I apologize, I could not generate a response.";

      const textToolCall = extractTextToolCall(text);
      if (textToolCall) {
        const result = await executeToolCall(textToolCall.name, textToolCall.args, conversationId);
        const parsed = JSON.parse(result) as { success?: boolean; message?: string };
        return parsed.message || "La demande a été transmise à l’équipe.";
      }

      if (hasInlineCreateTicketDirective(text)) {
        return "وصلني طلب فتح تذكرة، ولكن الصياغة التقنية كانت غير واضحة. من فضلك أعد تأكيد طلب التذكرة بكلمة: نعم.";
      }

      return text;
    } catch (err: any) {
      console.error("[Anthropic Engine Error]", err?.message || err);
      return (await callFallback()) || "I'm temporarily unable to process your request. Please try again in a moment, or I can connect you with a team member.";
    }
  }

  let baseURL = undefined;
  if (provider === 'groq') {
    baseURL = 'https://api.groq.com/openai/v1';
  } else if (provider === 'gemini') {
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  } else if (provider === 'openrouter') {
    baseURL = 'https://openrouter.ai/api/v1';
  } else if (provider === 'grok' || provider === 'xai') {
    baseURL = 'https://api.x.ai/v1';
  }
  const openai = new OpenAI({ apiKey: config.apiKey, baseURL });

  let response;
  try {
    const effectiveMaxTokens = provider === "groq" ? Math.min(config.maxTokens, 800) : config.maxTokens;
    response = await openai.chat.completions.create({
      model: config.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: owlyTools as OpenAI.ChatCompletionTool[],
      max_tokens: effectiveMaxTokens,
      temperature: config.temperature,
    });
  } catch (err: any) {
    const errorMsg = String(err?.message || err);
    console.error("[AI Engine Error]", errorMsg);

    const isRateLimit =
      errorMsg.includes("429") ||
      errorMsg.toLowerCase().includes("rate limit") ||
      errorMsg.toLowerCase().includes("rate_limit") ||
      errorMsg.includes("TPM") ||
      errorMsg.includes("TPD") ||
      errorMsg.toLowerCase().includes("tokens per");

    if (isRateLimit) {
      console.warn(`[AI Engine] Rate limit detected on ${provider}. Switching directly to fallback...`);
      return (await callFallback()) || "عذراً، وقع ضغط مؤقت على الخدمة، المرجو إعادة المحاولة بعد لحظات.";
    }

    const isGroqModelError =
      errorMsg.includes("400") ||
      errorMsg.includes("404") ||
      errorMsg.includes("decommissioned") ||
      errorMsg.includes("does not exist") ||
      errorMsg.toLowerCase().includes("not supported");

    if (provider === "groq" && isGroqModelError) {
      try {
        console.warn("[Groq Fallback 1] Retrying with qwen/qwen3.8-27b...");
        response = await openai.chat.completions.create({
          model: "qwen/qwen3.8-27b",
          messages: messages as OpenAI.ChatCompletionMessageParam[],
          max_tokens: Math.min(config.maxTokens, 800),
          temperature: config.temperature,
        });
      } catch (retryErr: any) {
        try {
          console.warn("[Groq Fallback 2] Retrying with groq/compound-mini...");
          response = await openai.chat.completions.create({
            model: "groq/compound-mini",
            messages: messages as OpenAI.ChatCompletionMessageParam[],
            max_tokens: Math.min(config.maxTokens, 800),
            temperature: config.temperature,
          });
        } catch (retryErr2: any) {
          console.error("[Groq Retry Error]", retryErr2?.message || retryErr2);
          return (await callFallback()) || "عذراً، وقع ضغط مؤقت على الخدمة، المرجو إعادة المحاولة بعد لحظات.";
        }
      }
    } else {
      return (await callFallback()) || "عذراً، أواجه صعوبة مؤقتة في معالجة طلبك الآن. المرجو المحاولة مجدداً بعد قليل.";
    }
  }

  const choice = response.choices[0];

  if (
    choice.finish_reason === "tool_calls" &&
    choice.message.tool_calls?.length
  ) {
    // Process tool calls
    const toolCalls = choice.message.tool_calls as Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;

    messages.push({
      role: "assistant",
      content: choice.message.content || "",
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    });

    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await executeToolCall(
        toolCall.function.name,
        args,
        conversationId
      );

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
      });
    }

    // Continue the conversation with tool results
    return executeAIInternal(config, messages, conversationId, depth + 1);
  }

  const finalText = choice.message.content || "I apologize, I could not generate a response.";
  const inlineToolCall = extractTextToolCall(finalText);
  if (inlineToolCall) {
    const result = await executeToolCall(inlineToolCall.name, inlineToolCall.args, conversationId);
    const parsed = JSON.parse(result) as { success?: boolean; message?: string };
    return parsed.message || "La demande a été transmise à l’équipe.";
  }

  if (hasInlineCreateTicketDirective(finalText)) {
    return "وصلني طلب فتح تذكرة، ولكن الصياغة التقنية كانت غير واضحة. من فضلك أعد تأكيد طلب التذكرة بكلمة: نعم.";
  }

  return finalText;
}

export async function createNewConversation(
  channel: string,
  customerName: string,
  customerContact: string,
  customerId?: string
) {
  return prisma.conversation.create({
    data: {
      channel,
      customerName,
      customerContact,
      ...(customerId && { customerId }),
    },
  });
}
