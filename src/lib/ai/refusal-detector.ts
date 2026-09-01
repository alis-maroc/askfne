/**
 * Comprehensive refusal and lack-of-knowledge detector for Arabic, French, and English assistant responses.
 * Detects when the AI assistant cannot answer or lacks information in its knowledge base.
 */

export const ARABIC_REFUSAL_PATTERNS: RegExp[] = [
  // 1. Availability / Negation with details / info / data
  /(?:لا\s*(?:تتوفر|يتوفر|أتوفر|نتوفر)|غير\s*متوفر(?:ة)?|ليست?\s*(?:لدي|عندي))\s*(?:لديّ?|عندي|عندنا)?\s*(?:حالياً|بدقة)?\s*(?:أي\s*)?(?:معطيات|معلومات|وثائق|نصوص|تفاصيل)/i,
  /(?:معلومة|معلومات|معطيات|تفاصيل)\s*غير\s*متوفر(?:ة)?/i,
  /غير\s*متوفر(?:ة)?\s*(?:لدي|لديّ|عندنا|لدينا|حالياً)/i,
  /لا\s*(?:تتوفر|يتوفر)\s*(?:لدي|لديّ|عندنا|لدينا)/i,

  // 2. Ownership / Possession of knowledge
  /لا\s*(?:أملك|نملك|أتوفر\s*على|نحصل\s*على)\s*(?:حالياً|بدقة)?\s*(?:معطيات|معلومات|وثائق|تفاصيل)/i,
  /لست\s*أملك\s*(?:في\s*قاعدة\s*المعرفة)?/i,
  /لا\s*(?:أملك|نملك)\s*معلومات\s*(?:كافية|دقيقة|مؤكدة)/i,

  // 3. Search failures in knowledge base
  /لم\s*(?:أجد|نجد|أعثر|نعثر|أتمكن\s*من\s*العثور)/i,
  /غير\s*(?:موجود|موجودة|مدرج|مدرجة)\s*في\s*قاعدة\s*المعرفة/i,
  /في\s*قاعدة\s*المعرفة\s*المرفقة.*?(?:لست\s*أملك|لا\s*توجد|غير\s*متوفر|لا\s*تتوفر)/i,

  // 4. Ticket escalation & referral to office due to missing info
  /(?:فتح|أفتح|نفتح)\s*(?:لك|ليك|لكم)?\s*(?:طلباً|طلب|تذكرة)/i,
  /(?:تذكرة|طلب)\s*(?:لفريقنا|لدى\s*المكتب|للمكتب|للمسؤولين)/i,
  /تزويدكم\s*بالمعلومة\s*المؤكدة.*?هل\s*تودون/i,
  /يمكنني\s*فتح\s*طلب\s*لدى\s*المكتب/i,

  // 5. Darija expressions
  /هاد\s*المعلومة\s*ما\s*عندي/i,
  /ما\s*عندي(?:ش)?\s*(?:دابا|حاليا)/i,
  /المعلومة\s*ما\s*(?:متوفراش|كايناش)/i,
  /ما\s*كايناش\s*(?:دابا|في\s*قاعدة)/i,

  // 6. Referral due to inability to browse or confirm
  /لا\s*أملك\s*(?:إمكانية\s*التصفح|القدرة\s*على\s*التأكد)/i,
];

export const MULTILINGUAL_REFUSAL_PATTERNS: RegExp[] = [
  /unable to process your request/i,
  /could not generate a response/i,
  /i do not have (?:enough |any )?(?:information|data)/i,
  /beyond my (?:knowledge|capabilities)/i,
  /je ne dispose pas de(?: ces)? informations/i,
  /information non disponible/i,
  /je n'ai pas cette information/i,
];

/**
 * Checks whether an assistant message is an admission of lack of knowledge or refusal to answer.
 */
export function isAssistantRefusal(content: string | null | undefined): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (trimmed.length < 5) return false;

  for (const pattern of ARABIC_REFUSAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  for (const pattern of MULTILINGUAL_REFUSAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

/**
 * Detects confident hallucinations — statements that look like facts but are fabricated.
 * Checks for:
 * - Very specific numbers/dates that are suspiciously precise
 * - Document IDs or reference numbers not found in the KB
 * - Specific names, phones, or details claimed to exist without KB evidence
 * - "Fake citation" patterns like "as stated in document X" for documents not in KB
 */
export interface HallucinationDetection {
  isHallucination: boolean;
  reason?: string;
  confidencePenalty: number;
}

export function detectHallucination(
  response: string,
  knowledgeBase: Array<{ title: string; content: string; category?: string }>,
  userQuery?: string
): HallucinationDetection {
  if (!response || response.trim().length < 20) {
    return { isHallucination: false, confidencePenalty: 0 };
  }

  const normalizedResponse = response.trim();
  let confidencePenalty = 0;
  const reasons: string[] = [];

  // 1. Check for suspicious specific number patterns that might be fabricated
  // e.g. "المذكرة رقم 061.26 بتاريخ 06 شعبان 1446هـ الموافق 05 فبراير 2025م"
  const suspiciousDatePattern = /\d{1,2}\s+(?:شعبان|رمضان|رجب|صفر|ربيع|ذو\s*القعدة|ذو\s*الحجة|محرم)\s+\d{4,5}ه\s*(?:الموافق|و)\s*\d{1,2}\s+(?:يناير|فبراير|مارس|أبريل|ماي|يونيو|يوليوز|غشت|شتنبر|أكتوبر|نونبر|دجنبر)\s+\d{4}م/i;
  if (suspiciousDatePattern.test(normalizedResponse)) {
    // Check if this specific circular/decree reference exists in KB
    const docRefMatch = normalizedResponse.match(/(?:مذكرة|decret|décret|قرار|مقرر|بلاغ)\s*(?:وزاري)?\s*(?:رقم|no\.?)\s*[:.]?\s*([\d.\-\/]+)/i);
    if (docRefMatch) {
      const docRef = docRefMatch[1];
      const foundInKB = knowledgeBase.some(
        (item) =>
          item.title.includes(docRef) ||
          item.content.includes(docRef) ||
          (item.content.includes("رقم") && item.content.includes(docRef.replace(/\./g, "")))
      );
      if (!foundInKB) {
        confidencePenalty += 0.5;
        reasons.push(`SUSPICIOUS_SPECIFIC_DATE: مقتنع بتاريخ محدد (${docRef}) لكن غير موجود في KB`);
      }
    }
  }

  // 2. Check for fabricated document reference numbers (e.g. "061.26", "26-061")
  const docNumbers = normalizedResponse.match(/\b\d{2}[.\-]\d{3}\b/g);
  if (docNumbers) {
    for (const num of docNumbers) {
      const foundInKB = knowledgeBase.some(
        (item) =>
          item.title.includes(num) ||
          item.content.includes(num.replace("-", "").replace(".", "")) ||
          item.content.includes(num.replace(".", "-"))
      );
      if (!foundInKB) {
        confidencePenalty += 0.4;
        reasons.push(`FABRICATED_DOC_NUMBER: رقم الوثيقة ${num} غير موجود في KB`);
      }
    }
  }

  // 3. Check for overly specific "fake citation" patterns
  // e.g. "كما ورد في المادة 15 من النظام الأساسي" when that article doesn't exist in KB
  const articleCitations = normalizedResponse.match(/(?:المادة|الفصل|Matière|Article)\s+(\d+)/gi);
  if (articleCitations) {
    const kbText = knowledgeBase.map((k) => k.content).join(" ");
    for (const citation of articleCitations) {
      const num = citation.match(/\d+/)?.[0];
      if (num) {
        // Check if article exists in KB
        const articlePattern = new RegExp(`(المادة|الفصل|Article|Matière)\\s+${num}\\b`, "i");
        if (!articlePattern.test(kbText)) {
          confidencePenalty += 0.35;
          reasons.push(`FABRICATED_ARTICLE_REF: المادة ${num} غير موجودة في KB`);
        }
      }
    }
  }

  // 4. Check for phone numbers or specific names that don't appear in KB
  const phoneNumbers = normalizedResponse.match(/\b0[67]\d{8}\b/g);
  if (phoneNumbers) {
    const kbText = knowledgeBase.map((k) => k.content).join(" ");
    for (const phone of phoneNumbers) {
      if (!kbText.includes(phone)) {
        // It's a phone number not in KB - check if it's being presented as fact
        // If it's near a name (fabricated pairing), that's worse
        const phoneIndex = normalizedResponse.indexOf(phone);
        const contextBefore = normalizedResponse.slice(Math.max(0, phoneIndex - 50), phoneIndex);
        const contextAfter = normalizedResponse.slice(phoneIndex + phone.length, phoneIndex + phone.length + 50);
        const nearName = /[الرفيق|السيد|الكاتب|الأمين]\s+\w+/i.test(contextBefore + contextAfter);
        if (nearName) {
          confidencePenalty += 0.45;
          reasons.push(`FABRICATED_NAME_PHONE_PAIR: الهاتف ${phone} مع اسم غير موجود في KB`);
        }
      }
    }
  }

  // 5. Detect "confident fabrication" tone - overly certain language about uncertain topics
  // This catches phrases like "صدرت بتاريخ" "تتعلق بـ" "وهي من المراجع" when no KB support
  const confidentFabricationPatterns = [
    /صدرت?\s+(?:ب)?(?:تاريخ|بتاريخ)\s+\d+/, // "صدرت بتاريخ X" without KB
    /و?هي?\s+من\s+(?:المراجع|الوثائق|النصوص)\s+ال?(?:التربوية|الإدارية)/, // "وهي من المراجع التربوية" without KB
    /و?تتعلق?\s+(?:ب)?\s*(?:تنظيم|إجراء|توجيه)/, // "وتتعلق بتنظيم" without KB
    /صدرت?\s+(?:في|from|بتاريخ)\s+(?:غشت|شتنبر|أكتوبر|نونبر|دجنبر|يناير|فبراير|مارس|أبريل|ماي|يونيو|يوليوز)/i, // specific months
  ];

  if (knowledgeBase.length === 0 || knowledgeBase.every((k) => k.content.length < 100)) {
    // KB is empty or very poor - any confident statement is suspicious
    for (const pattern of confidentFabricationPatterns) {
      if (pattern.test(normalizedResponse)) {
        confidencePenalty += 0.3;
        reasons.push(`CONFIDENT_STMT_NO_KB: جواب واثق لكن قاعدة المعرفة فارغة/فقيرة`);
        break;
      }
    }
  }

  // 6. Check for the specific pattern from the reported bug:
  // "المذكرة الوزارية رقم 061.26" with specific Hijri/Gregorian dates
  const hijriDatePattern = /\d{1,2}\s+(?:شعبان|رمضان|رجب|صفر|ربيع|ذو\s*القعدة|ذو\s*الحجة|محرم)\s+1[45]\d{2}ه/i;
  if (hijriDatePattern.test(normalizedResponse)) {
    const hasCircularNumber = /\d{2}[.\-]\d{3}/.test(normalizedResponse);
    if (hasCircularNumber) {
      // Check if this circular exists in KB
      const circMatch = normalizedResponse.match(/\d{2}[.\-]\d{3}/);
      if (circMatch) {
        const found = knowledgeBase.some(
          (k) =>
            k.title.includes(circMatch[0]) ||
            k.content.includes(circMatch[0].replace("-", "").replace(".", ""))
        );
        if (!found) {
          confidencePenalty += 0.6;
          reasons.push(`FABRICATED_HIJRI_CIRCULAR: تاريخ هجري + رقم مذكرة غير موجود في KB`);
        }
      }
    }
  }

  return {
    isHallucination: confidencePenalty >= 0.4,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    confidencePenalty: Math.min(confidencePenalty, 1.0),
  };
}
