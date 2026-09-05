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

  // 7. Out-of-scope refusal
  /مخصص\s*حصرياً\s*(?:لقضايا|للمجال|للشأن)/i,
  /خارج\s*(?:هذا\s*)?(?:الاختصاص|النطاق)/i,
  /لا\s*يمكنني\s*تقديم\s*(?:معطيات|إجابات)\s*حول\s*مواضيع\s*خارج/i,
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

  // IMPORTANT: Welcome menus, standard feature listings, and interactive menus are NOT refusals!
  if (
    /القائمة الرئيسية|اختر من القائمة|اختر رقماً|أهلاً بك رفيقي|مرحباً بك في المنصة|الجامعة الوطنية للتعليم FNE|المكاتب والتنظيم النقابي|المقرر الوزاري|مقرر السنة الدراسية/i.test(
      trimmed
    )
  ) {
    return false;
  }

  for (const pattern of ARABIC_REFUSAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  for (const pattern of MULTILINGUAL_REFUSAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

/**
 * Filter words used to strip common pleasantries, greetings, and address terms
 * to check if there is any substantive inquiry left.
 */
const GREETING_FILLER_WORDS = new Set([
  "مرحبا",
  "اهلا",
  "اهلين",
  "سلام",
  "السلام",
  "السلامه",
  "سلامه",
  "مع",
  "عليكم",
  "ورحمة",
  "الله",
  "وبركاته",
  "صباح",
  "مساء",
  "الخير",
  "النور",
  "اخي",
  "اختي",
  "رفيقي",
  "رفيقتي",
  "استاذ",
  "استاذي",
  "استاذه",
  "سيدي",
  "كريم",
  "الكريمة",
  "العزيز",
  "العزيزة",
  "شكرا",
  "جزيلا",
  "مشكور",
  "بارك",
  "فيك",
  "يجازيك",
  "يحفظك",
  "يرحم",
  "الوالدين",
  "بخير",
  "وداعا",
  "باي",
  "الحمد",
  "لله",
  "تمام",
  "عافاك",
  "bonjour",
  "bonsoir",
  "salut",
  "merci",
  "beaucoup",
  "au",
  "revoir",
  "bye",
  "coucou",
  "salam",
  "slm",
  "cv",
  "labas",
  "لاباس",
  "ca",
  "va",
  "svp",
  "stp",
  "please",
]);

/**
 * Detects whether a user question is completely out of scope for the FNE educational & trade-union chatbot
 * (e.g. sports/football matches, weather/météo, horoscopes/entertainment, cooking recipes).
 * Safely preserves legitimate educational, statutaire, and social queries (e.g. مباراة التعليم, مباراة الترقية, Fondation Mohammed VI, CNOPS, CMR).
 * Also respects the dynamic scopeWhitelist configured by administrators.
 */
export function isOutOfScopeQuery(
  text: string | null | undefined,
  dynamicWhitelist: string[] = []
): boolean {
  if (!text) return false;
  const raw = text.toLowerCase().trim();

  // Dynamic Whitelist check (from Settings / reclassified items)
  if (Array.isArray(dynamicWhitelist) && dynamicWhitelist.length > 0) {
    for (const term of dynamicWhitelist) {
      if (!term || typeof term !== "string") continue;
      const cleanTerm = term.toLowerCase().trim();
      if (cleanTerm && raw.includes(cleanTerm)) {
        return false;
      }
    }
  }

  // If it mentions education or union keywords, civil service, or teacher social works, it's ALWAYS in-scope
  const isEducational = /(?:تعليم|تربية|ترقية|وزارة|أستاذ|مدرس|تلميذ|مدرسة|ثانوي|إعدادي|ابتدائي|أكاديمية|مديرية|تفتيش|إدارة تربوية|مركز جهوي|crmef|متصرف|ملحق|نظام أساسي|نقابة|fne|منخرط|شهادة|تقاعد|رخصة|استيداع|تعاقد|تعويض|أجرة|راتب|اقتطاع|مؤسسة محمد السادس|fm6|imtilak|امتلاك|نافذة|nafida|كنوبس|cnops|امفام|mgen|تعاضدية|تأمين صحي|تغطية صحية|ملف مرضي|cmr|صندوق المغربي للتقاعد|تقاعد نسبي|حد السن|معاش|تخفيض القطار|oncf|سلف|قرض سكن|ضريبة على الدخل|حركة انتقالية|تبادل|مذكرة وزارية|مجلس انضباطي|عقوبة تأديبية|تظلم)/i.test(raw);
  if (isEducational) return false;

  // 1. Weather / Météo (e.g. حالة الطقس في تيزنيت, météo, درجة الحرارة)
  const isWeather = /(?:حالة الطقس|أحوال الطقس|الأحوال الجوية|درجة الحرارة|درجات الحرارة|توقعات الطقس|أمطار اليوم|الطقس في|طقس اليوم|طقس غدا|طقس أمس|météo|meteo\b|weather\b|forecast)/i.test(raw);
  if (isWeather) return true;

  // 2. Football & Sports (e.g. نتيجة مباراة ريال مدريد, برشلونة, دوري أبطال أوروبا, كرة القدم)
  const isSports = /(?:ريال مدريد|برشلونة|مانشستر|ليفربول|بايرن|كرة القدم|دوري أبطال|كأس العالم|المنتخب الوطني|كأس إفريقيا|كأس العرش|كلاسيكو|ديربي|أهداف مباراة|نتيجة مباراة|ماتش البارح|ماتش اليوم|ترتيب البطولة|ترتيب الدوري|الدوري الإسباني|الدوري الإنجليزي|champions league|real madrid|fc barcelona)/i.test(raw);
  if (isSports) return true;

  // If "مباراة" or "ماتش" is used with sports/match terms
  if (/(?:مباراة|مباريات|ماتش)/i.test(raw) && /(?:أمس|اليوم|غدا|البارح|كرة|فريق|دوري|أهداف|شوط|لاعب|كأس|بطولة|ريال|كيرات)/i.test(raw)) {
    return true;
  }

  // 3. Horoscope & Astrology
  const isAstrology = /(?:حظك اليوم|الأبراج اليومية|برج الحمل|برج الثور|برج الجوزاء|برج السرطان|برج الأسد|برج العذراء|برج الميزان|برج العقرب|برج القوس|برج الجدي|برج الدلو|برج الحوت|horoscope)/i.test(raw);
  if (isAstrology) return true;

  // 4. Recipes & Cooking
  const isCooking = /(?:طريقة تحضير|وصفة طبخ|طريقة عمل كيك|مقادير كيك|شهيوات|طبخ مغربي|طريقة طهي|cuisine|recette\b)/i.test(raw);
  if (isCooking) return true;

  // 5. Entertainment, Cinema & Celebrity gossip
  const isEntertainment = /(?:أخبار الفنانين|أخبار المشاهير|أغاني جديدة|مسلسلات رمضان|فيلم هندي|نتفليكس|netflix|سينما|شاهد نت)/i.test(raw);
  if (isEntertainment) return true;

  // 6. Automotive & Mechanics (e.g. زيت المحرك، علبة السرعات، عطب السيارة)
  const isAutomotive = /(?:عطب في السيارة|زيت المحرك|علبة السرعات|ميكانيك السيارات|فرامل السيارة|شراء سيارة مستعملة|vidange|panne voiture)/i.test(raw);
  if (isAutomotive) return true;

  // 7. Cryptocurrencies & Forex Trading (e.g. بيتكوين، تداول، عملات رقمية)
  const isCryptoFinance = /(?:البيتكوين|bitcoin|تداول العملات|العملات الرقمية|فوركس|forex|شراء إيثريوم|كريبتو|crypto)/i.test(raw);
  if (isCryptoFinance) return true;

  // 8. General Tourism, International Visas & Flights (non-union)
  const isGeneralTourism = /(?:حجز فندق في باريس|تأشيرة شينغن|فيزا سياحية إلى فرنسا|عطلة في تركيا|تذاكر طيران رخيصة)/i.test(raw);
  if (isGeneralTourism) return true;

  // 9. General Medical & Disease Diagnosis (non-administrative, non-CNOPS)
  const isMedicalDiagnosis = /(?:علاج تساقط الشعر|أعراض مرض السكري|علاج ألم الأسنان في المنزل|دواء الصداع النصفي)/i.test(raw);
  if (isMedicalDiagnosis) return true;

  return false;
}

/**
 * Determines whether a user message represents a legitimate, substantive knowledge question,
 * filtering out greetings, pleasantries, navigation commands, digits, thanks, and technical noise.
 */
export function isLegitimateKnowledgeQuestion(
  text: string | null | undefined,
  dynamicWhitelist: string[] = []
): boolean {
  if (!text) return false;
  const raw = text.trim();
  if (raw.length < 3) return false;

  // Filter out non-educational out-of-scope topics (sports, weather, astrology)
  if (isOutOfScopeQuery(raw, dynamicWhitelist)) {
    return false;
  }

  // Normalize for checks
  const normalized = raw
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // tashkeel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < 3) return false;

  // 1. Navigation digits & single word commands
  if (/^(\d{1,3}|menu|قائمه|القائمه|رجوع|retour|annuler|الغاء|خروج|quitter)$/i.test(normalized)) {
    return false;
  }

  // 2. Affirmation / Negation / Quick replies
  if (/^(نعم|لا|oui|non|ok|d[' ]?accord|واخا|صافي|مزيان|سير|اييه|اجل|كلا)$/i.test(normalized)) {
    return false;
  }

  // 3. Test inputs / gibberish / repetition
  if (/^(test|تجربه|تست|testing|asdf|qwerty|[a-z]{1,4}|\d+)$/i.test(normalized)) {
    return false;
  }
  if (/^(.)\1{3,}$/.test(normalized)) {
    return false;
  }

  // 4. Developer tokens / API keys / URLs alone / emails / phone numbers
  if (
    /^(sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]{20,})$/.test(raw) ||
    /^https?:\/\/\S+$/i.test(raw) ||
    /^\+?\d{9,15}$/.test(raw) ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
  ) {
    return false;
  }

  // 5. Check if the message is purely composed of greetings and pleasantries
  const rawWords = normalized.split(/\s+/).filter(Boolean);
  const nonGreetingWords = rawWords.filter((w) => !GREETING_FILLER_WORDS.has(w));

  // If after removing greetings/thanks nothing remains, it is a pure greeting or pleasantry
  if (nonGreetingWords.length === 0) {
    return false;
  }

  // 6. Substantive content check:
  // Must have at least 2 substantive words, OR contain a known educational/union domain topic
  if (nonGreetingWords.length < 2) {
    const singleWordDomainKeywords = [
      "ترقيه",
      "تقاعد",
      "حركه",
      "مباراه",
      "تعويضات",
      "تعاقد",
      "استيداع",
      "رخصه",
      "عطله",
      "تفتيش",
      "تنسيقيه",
      "اضراب",
      "تعويض",
      "سكن",
      "انتقال",
      "منصب",
      "شهاده",
      "تأهيل",
      "اقتطاع",
    ];
    const hasDomainKeyword = singleWordDomainKeywords.some((k) =>
      normalized.includes(k)
    );
    if (!hasDomainKeyword) {
      return false;
    }
  }

  return true;
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
  // Only penalize moderately — legal articles from general Moroccan law (Fonction Publique)
  // should not single-handedly destroy an otherwise valid response.
  const articleCitations = normalizedResponse.match(/(?:المادة|الفصل|Matière|Article)\s+(\d+)/gi);
  if (articleCitations) {
    const kbText = knowledgeBase.map((k) => k.content).join(" ");
    let articlePenalty = 0;
    for (const citation of articleCitations) {
      const num = citation.match(/\d+/)?.[0];
      if (num) {
        // Check if article exists in KB
        const articlePattern = new RegExp(`(المادة|الفصل|Article|Matière)\\s+${num}\\b`, "i");
        if (!articlePattern.test(kbText)) {
          articlePenalty += 0.12;
          reasons.push(`FABRICATED_ARTICLE_REF: المادة ${num} غير موجودة في KB`);
        }
      }
    }
    // Cap article citation penalty at 0.25 so legitimate answers citing law aren't destroyed
    confidencePenalty += Math.min(articlePenalty, 0.25);
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

  // 7. Check for unverified / fabricated URLs
  // Any URL mentioned in the response MUST either:
  // - Be in the strict whitelist of official FNE / MEN pages
  // - OR be present in the retrieved KnowledgeBase chunks
  const urlMatches = normalizedResponse.match(/https?:\/\/[^\s\)\*\]<>"]+/gi);
  if (urlMatches) {
    const ALLOWED_STATIC_URLS = new Set([
      "https://taalim.org",
      "https://www.taalim.org",
      "https://hub.taalim.org",
      "https://hub.taalim.org/responsables-fne.php",
      "https://hub.taalim.org/adherer",
      "https://hub.taalim.org/calc_promotion_points.php",
      "https://hub.taalim.org/generate_request.php",
      "https://hub.taalim.org/milaf",
      "https://hub.taalim.org/participation_form.php",
      "https://hub.taalim.org/carte_scolaire.php",
      "https://t.me/askfne_bot",
      "https://men.gov.ma",
      "https://www.men.gov.ma",
    ]);

    const kbText = knowledgeBase.map((k) => `${k.title} ${k.content}`).join(" ");

    for (const rawUrl of urlMatches) {
      // Clean trailing punctuation
      const cleanUrl = rawUrl.replace(/[.,;:!?'")*]+$/, "");
      const cleanNorm = cleanUrl.toLowerCase().replace(/\/$/, "");

      const isWhitelisted =
        ALLOWED_STATIC_URLS.has(cleanNorm) ||
        cleanNorm.startsWith("https://taalim.org/") ||
        cleanNorm.startsWith("https://www.taalim.org/") ||
        cleanNorm.startsWith("https://men.gov.ma/") ||
        cleanNorm.startsWith("https://www.men.gov.ma/");

      // Check if URL is explicitly cited in the retrieved KB documents
      const existsInKB =
        kbText.toLowerCase().includes(cleanNorm) ||
        kbText.toLowerCase().includes(cleanUrl.toLowerCase());

      if (!isWhitelisted && !existsInKB) {
        confidencePenalty += 0.8;
        reasons.push(`FABRICATED_URL: الرابط المولد (${cleanUrl}) غير موجود في قاعدة المعرفة ولا في القائمة المعتمدة`);
      }
    }
  }

  return {
    isHallucination: confidencePenalty >= 0.4,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    confidencePenalty: Math.min(confidencePenalty, 1.0),
  };
}
