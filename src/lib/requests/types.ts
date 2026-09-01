/**
 * FNE Smart Docs — Request Types & Configuration
 *
 * Defines all supported personal administrative request types:
 * - Direct personal requests (strictly individual)
 * - Required PPR (رقم التأجير) on every request type
 * - "Autre" option for document requests with custom input
 * - Self-contained without external Hub dependency
 */

export type RequestType =
  | "ta3n_admin"
  | "ta3n_movement"
  | "demande_docs"
  | "taklif"
  | "libre";

export type RecipientLevel = "province" | "academie" | "ministere" | "member";

export interface WizardStep {
  key: string;
  question: string;
  hint?: string;
  isOptional?: boolean;
}

export interface RequestTypeConfig {
  label: string;
  emoji: string;
  recipientDefault: RecipientLevel;
  steps: WizardStep[];
  intro: string;
}

export const REQUEST_TYPES: Record<RequestType, RequestTypeConfig> = {
  ta3n_admin: {
    label: "طعن بخصوص النقطة الإدارية",
    emoji: "📊",
    recipientDefault: "province",
    intro: "طعن شخصي بخصوص النقطة الإدارية الممنوحة للأستاذ برسم الموسم الدراسي.",
    steps: [
      { key: "fullName", question: "ما هو اسمك الكامل (الاسم والنسب)؟" },
      { key: "ppr", question: "ما هو رقم التأجير (PPR) الخاص بك؟" },
      {
        key: "grade",
        question: "ما هو إطارك؟ (مثال: أستاذ التعليم الابتدائي، أستاذ الثانوي التأهيلي...)",
      },
      { key: "school", question: "ما هو مقر عملك (المؤسسة)؟" },
      { key: "province", question: "ما هي مديريتك الإقليمية؟" },
      {
        key: "subject",
        question: "ما هي النقط الممنوحة لك برسم السنة؟ (مثال: نقطة المدير 18، نقطة المفتش 16، نقطة المدير الإقليمي 18)",
      },
    ],
  },

  ta3n_movement: {
    label: "طعن في نتائج الحركة الانتقالية",
    emoji: "🔄",
    recipientDefault: "province",
    intro: "طعن شخصي بخصوص نتائج الحركة الانتقالية.",
    steps: [
      { key: "fullName", question: "ما هو اسمك الكامل (الاسم والنسب)؟" },
      { key: "ppr", question: "ما هو رقم التأجير (PPR) الخاص بك؟" },
      { key: "grade", question: "ما هو إطارك؟" },
      { key: "school", question: "ما هو مقر عملك (المؤسسة)؟" },
      { key: "province", question: "ما هي مديريتك الإقليمية؟" },
      {
        key: "subject",
        question: "ما هو سبب ومبررات الطعن في نتائج الحركة الانتقالية؟ (مثال: أسبقية نقط الاستحقاق، عدم تلبية الرغبات المعبر عنها)",
      },
    ],
  },

  demande_docs: {
    label: "طلب وثيقة إدارية",
    emoji: "📃",
    recipientDefault: "province",
    intro: "طلب شخصي للحصول على وثيقة إدارية من الإدارة.",
    steps: [
      { key: "fullName", question: "ما هو اسمك الكامل (الاسم والنسب)؟" },
      { key: "ppr", question: "ما هو رقم التأجير (PPR) الخاص بك؟" },
      { key: "grade", question: "ما هو إطارك؟ (مثال: أستاذ التعليم الابتدائي)" },
      { key: "school", question: "ما هو مقر عملك (المؤسسة)؟" },
      { key: "province", question: "ما هي مديريتك الإقليمية؟" },
      {
        key: "subject",
        question: [
          "ما هي الوثيقة الإدارية المطلوبة؟",
          "1️⃣ شهادة العمل",
          "2️⃣ شهادة الأجرة",
          "3️⃣ بيان الخدمات",
          "4️⃣ نسخة من قرار التعيين",
          "5️⃣ نسخة من قرار الترسيم",
          "6️⃣ نسخة من قرار الترقية",
          "7️⃣ وثيقة أخرى (أرسل 7 لكتابة اسم وثيقة أخرى)",
          "",
          "_(أرسل رقم الاختيار أو اكتب اسم الوثيقة مباشرة)_",
        ].join("\n"),
      },
    ],
  },

  taklif: {
    label: "طلب تكليف",
    emoji: "🏫",
    recipientDefault: "province",
    intro: "طلب تكليف بمهام التدريس بإحدى المؤسسات التعليمية بالمديرية.",
    steps: [
      { key: "fullName", question: "ما هو اسمك الكامل (الاسم والنسب)؟" },
      { key: "ppr", question: "ما هو رقم التأجير (PPR) الخاص بك؟" },
      { key: "grade", question: "ما هو إطارك وسلك التدريس؟" },
      { key: "school", question: "ما هو مقر عملك الحالي (المؤسسة الأصلية)؟" },
      { key: "province", question: "ما هي المديرية الإقليمية المرغوب التكليف بها؟" },
      {
        key: "subject",
        question: "ما هي المؤسسات المرغوبة بالترتيب؟ (مثال:\nالرغبة الأولى: مدرسة النور\nالرغبة الثانية: مدرسة النجاح\nالرغبة الثالثة: مدرسة الأمل)",
      },
      {
        key: "reasons",
        question: "ما هي المبررات والدواعي لطلب التكليف؟ (مثال: دواعي اجتماعية وعائلية والتقارب الأسري، دواعي صحية...)",
        isOptional: true,
      },
    ],
  },

  libre: {
    label: "طلب إداري",
    emoji: "✍️",
    recipientDefault: "province",
    intro: "مراسلة وطلب إداري شخصي عام موجه إلى الإدارة.",
    steps: [
      { key: "fullName", question: "ما هو اسمك الكامل (الاسم والنسب)؟" },
      { key: "ppr", question: "ما هو رقم التأجير (PPR) الخاص بك؟" },
      { key: "grade", question: "ما هو إطارك؟" },
      { key: "school", question: "ما هو مقر عملك (المؤسسة)؟" },
      { key: "province", question: "ما هي مديريتك الإقليمية؟" },
      {
        key: "subject",
        question: "ما هو موضوع مراسلتك والتفاصيل الأساسية؟",
      },
    ],
  },
};

export const REQUEST_MENU_TEXT = [
  "📄 *صياغة المراسلات والطلبات الإدارية*",
  "━━━━━━━━━━━━━━━━━━━━",
  "اختر نوع الوثيقة التي تريد إعدادها:",
  "",
  "1️⃣ 📊 *طعن بخصوص النقطة الإدارية*",
  "2️⃣ 🔄 *طعن في نتائج الحركة الانتقالية*",
  "3️⃣ 📃 *طلب وثيقة إدارية*",
  "4️⃣ 🏫 *طلب تكليف*",
  "5️⃣ ✍️ *طلب إداري عام*",
  "",
  "────────────────",
  "أرسل رقم الاختيار (من 1 إلى 5)",
  "أو أرسل *0* للرجوع للقائمة الرئيسية",
].join("\n");

export const REQUEST_TYPE_MENU: Record<string, RequestType> = {
  "1": "ta3n_admin",
  "2": "ta3n_movement",
  "3": "demande_docs",
  "4": "taklif",
  "5": "libre",
};

/** Standard document choices mapping */
export const DOC_CHOICES: Record<string, string> = {
  "1": "شهادة العمل",
  "2": "شهادة الأجرة",
  "3": "بيان الخدمات",
  "4": "نسخة من قرار التعيين",
  "5": "نسخة من قرار الترسيم",
  "6": "نسخة من قرار الترقية",
};

/** Arabic date formatted for official letters */
export function getArabicDate(): string {
  const d = new Date();
  const months: Record<number, string> = {
    0: "يناير", 1: "فبراير", 2: "مارس", 3: "أبريل",
    4: "ماي", 5: "يونيو", 6: "يوليوز", 7: "غشت",
    8: "شتنبر", 9: "أكتوبر", 10: "نونبر", 11: "دجنبر",
  };
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
