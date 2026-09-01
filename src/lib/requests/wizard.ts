/**
 * FNE Smart Docs — Wizard State Manager
 *
 * Manages the multi-step data collection wizard within a conversation's metadata.
 * Completely stateless — all state lives in `Conversation.metadata.requestWizard`.
 * Includes document choices with "Autre" custom input handling.
 */

import {
  REQUEST_TYPES,
  REQUEST_TYPE_MENU,
  REQUEST_MENU_TEXT,
  DOC_CHOICES,
  type RequestType,
} from "./types";

function getArabicDate(): string {
  return new Date().toLocaleDateString("ar-MA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildConcisePreview(
  type: RequestType,
  subject: string,
  date: string,
  extraData?: Record<string, string>
): string {
  switch (type) {
    case "ta3n_admin": {
      const details = subject || "نقطة المدير: 18، نقطة المفتش: 16، نقطة المدير الإقليمي: 18";
      return [
        `يشرفني أن أتقدم إليكم بهذا الطعن بخصوص النقطة الإدارية الممنوحة لي برسم الموسم الدراسي، والتي بلغت (${details})، حيث أعتبرها غير منصفة ولا تعكس مردودي المهني الحقيقي داخل المؤسسة.`,
        "",
        "وأود أن أوضح لكم أنني أؤدي مهامي التربوية والإدارية بانتظام وانضباط، وألتزم بواجباتي المهنية من مواظبة، واحترام للزمن المدرسي، والمشاركة في الأنشطة التربوية، والتعاون الإيجابي مع الإدارة وهيئة التدريس.",
        "",
        "وعليه، ألتمس منكم إعادة النظر في النقطة الإدارية الممنوحة لي، وإنصافي وفق ما تنص عليه المذكرات والتنظيمات الجاري بها العمل.",
      ].join("\n");
    }
    case "ta3n_movement":
      return `يشرفني أن أرفع إلى سيادتكم هذا الطعن بخصوص نتائج الحركة الانتقالية، نظراً للحيثيات التالية: (${subject || "عدم مراعاة الاستحقاق والرغبات المعبر عنها"})، ملتمساً منكم التفضل بإعادة دراسة ملفي وإنصافي وفق الضوابط المعمول بها.`;
    case "demande_docs":
      return `يشرفني أن أتقدم إليكم بهذا الطلب، راجياً منكم التفضل بتسليمي الوثيقة الإدارية : "${subject || "شهادة العمل"}"، وذلك للإدلاء بها لأغراض إدارية.`;
    case "taklif": {
      const reasons = extraData?.reasons || "دواعي اجتماعية وعائلية والتقارب الأسري، وتسهيل التنقل والاستقرار المهني لضمان مردودية تربوية أفضل.";
      const institutions = subject || "المؤسسات التعليمية الشاغرة بالمديرية";
      return [
        "يشرفني أن ألتمس منكم، بكل احترام، التفضل بالموافقة على منحي تكليفاً بمهام التدريس بإحدى المؤسسات التعليمية بمديريتكم برسم الموسم الدراسي الحالي.",
        "",
        `وأحيطكم علماً بالدوافع والأسباب الداعية لتقديم هذا الطلب والمتمثلة في "${reasons}"، وتجدون أسفله المؤسسات المرغوبة بالترتيب:`,
        "",
        institutions,
        "",
        "وفي انتظار تفضلكم بدراسة طلبي والموافقة عليه وفق ما تقتضيه المصلحة التربوية وضوابط تدبير الفائض والخصاص، تقبلوا فائق عبارات التقدير والاحترام.",
      ].join("\n");
    }
    case "libre":
    default:
      return `يشرفني بكل احترام وتقدير أن أتوجه إلى عنايتكم الكريمة بهذا الطلب بخصوص: (${subject || "الموضوع المشار إليه أعلاه"})، راجياً منكم التفضل بالاطلاع عليه واتخاذ ما ترونه مناسباً لإنصافي.`;
  }
}

export interface WizardState {
  active: boolean;
  type: RequestType;
  step: number; // 0-based index of the NEXT question to ask
  data: Record<string, string>; // collected data so far
  subMenu?: boolean; // true when we're in the type selection sub-menu
  awaitingCustomDoc?: boolean; // true when user chose 7 (Autre) and needs to type the doc name
  awaitingProfileReuse?: boolean; // true when asking user whether to reuse their saved profile or enter new info
  awaitingReviewChoice?: boolean; // true when showing preview and asking (1: Confirm, 2: Change recipient, 3: Edit body, 4: Edit subject)
  awaitingEditField?: "recipientLevel" | "subject" | "bodyText" | null;
  savedProfile?: {
    fullName?: string;
    ppr?: string;
    grade?: string;
    school?: string;
    province?: string;
  };
}

/**
 * Serialize wizard state to a plain JSON-compatible object for Prisma.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeWizardState(state: WizardState | null): any {
  if (state === null) return null;
  return JSON.parse(JSON.stringify(state));
}

/** Key used in Conversation.metadata */
export const WIZARD_META_KEY = "requestWizard";

/** Detect if the user's message expresses an intent to generate an admin document */
export function detectRequestIntent(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[أإآاٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

  const triggers = [
    "بغيت ندير طلب",
    "بغيت ندير مراسله",
    "بغيت ندير طعن",
    "بغيت توليد",
    "توليد طلب",
    "توليد مراسله",
    "توليد طعن",
    "توليد وثيقه",
    "طلب اداري",
    "صياغه طلب",
    "صياغه مراسله",
    "اريد صياغه",
    "اريد توليد",
    "اريد كتابه طلب",
    "اريد كتابه مراسله",
    "كيف ندير طلب",
    "كتابه طعن",
    "مراسله اداريه",
    "استعطاف",
    "تكليف بمهمه نقابيه",
    "رخصه ولاده",
    "رخصه مرض",
    "طلب وثيقه اداريه",
    "شهاده العمل",
    "شهاده الاجره",
    "بيان الخدمات",
    "نسخه من قرار",
  ];

  return triggers.some((t) => normalized.includes(t));
}

/** Get the current question to ask the user */
export function getCurrentQuestion(state: WizardState): string {
  if (state.awaitingProfileReuse && state.savedProfile) {
    const p = state.savedProfile;
    return [
      "👤 *توجد بيانات شخصية محفوظة سابقاً:*",
      `• الاسم: *${p.fullName || "-"}*`,
      p.ppr ? `• رقم التأجير: *${p.ppr}*` : null,
      p.grade ? `• الإطار: *${p.grade}*` : null,
      p.school ? `• المؤسسة: *${p.school}*` : null,
      p.province ? `• المديرية: *${p.province}*` : null,
      "",
      "1️⃣ *استخدام نفس البيانات المحفوظة*",
      "2️⃣ *إدخال بيانات جديدة*",
      "",
      "_(أرسل 1 أو 2، أو أرسل 00 لقائمة الوثائق، أو 0 للقائمة الرئيسية)_",
    ].filter(Boolean).join("\n");
  }

  if (state.awaitingCustomDoc) {
    return `📋 *يرجى كتابة اسم الوثيقة الإدارية المطلوبة:*\n\n_(أرسل *00* للرجوع لقائمة الوثائق، أو *0* للقائمة الرئيسية)_`;
  }

  if (state.awaitingEditField === "recipientLevel") {
    const prov = state.data.province || "المديرية الإقليمية";
    return [
      "🎯 *اختر الجهة الموجه إليها الطلب (السلم الإداري):*",
      "",
      `1️⃣ *المديرية الإقليمية* (إلى السيد(ة) المدير(ة) الإقليمي(ة) بـ${prov}... على يد مدير المؤسسة)`,
      `2️⃣ *الأكاديمية الجهوية* (إلى السيد مدير الأكاديمية الجهوية... تحت إشراف المدير الإقليمي لمديرية ${prov}... على يد مدير المؤسسة)`,
      `3️⃣ *الوزارة* (إلى السيد وزير التربية الوطنية... تحت إشراف مدير الأكاديمية... تحت إشراف المدير الإقليمي لمديرية ${prov}... على يد مدير المؤسسة)`,
      "",
      "_(أرسل 1 أو 2 أو 3)_",
    ].join("\n");
  }

  if (state.awaitingEditField === "subject") {
    return `✍️ *يرجى كتابة التفاصيل / النقط / المعطيات الجديدة لموضوع الطلب:*\n\n_(أرسل *00* للإلغاء والرجوع للمعاينة)_`;
  }

  if (state.awaitingEditField === "bodyText") {
    return `📝 *يرجى كتابة نص / فقرة الطلب الإداري المخصصة حسب رغبتك:*\n\n_(أرسل *00* للإلغاء والرجوع للمعاينة)_`;
  }

  if (state.awaitingReviewChoice) {
    const config = REQUEST_TYPES[state.type];
    const recLevel = state.data.recipientLevel || config.recipientDefault;
    const prov = state.data.province || "المديرية";
    const sch = state.data.school || "المؤسسة";
    const date = getArabicDate();
    const currentBody = state.data.bodyText || buildConcisePreview(state.type, state.data.subject || "", date, state.data);

    return [
      "📄 *نص المراسلة المولدة:*",
      "━━━━━━━━━━━━━━━━━━━━",
      `${prov} في: ${date}`,
      `الاسم والنسب: *${state.data.fullName || "-"}*`,
      state.data.ppr ? `رقم التأجير: *${state.data.ppr}*` : null,
      `الإطار: *${state.data.grade || "-"}*`,
      `المؤسسة: *${sch}*`,
      `المديرية الإقليمية: *${prov}*`,
      "",
      recLevel === "ministere"
        ? "إلى السيد: *وزير التربية الوطنية والتعليم الأولي والرياضة*\nتحت إشراف السيد: *مدير الأكاديمية الجهوية للتربية والتكوين*\nتحت إشراف السيد: *المدير الإقليمي للأكاديمية الجهوية للتربية والتكوين*\nعلى يد السيد(ة) مدير(ة) المؤسسة"
        : recLevel === "academie"
        ? "إلى السيد: *مدير الأكاديمية الجهوية للتربية والتكوين*\nتحت إشراف السيد: *المدير الإقليمي للأكاديمية الجهوية للتربية والتكوين*\nعلى يد السيد(ة) مدير(ة) المؤسسة"
        : `إلى السيد(ة): *المدير(ة) الإقليمي(ة) لوزارة التربية الوطنية بـ${prov}*\nعلى يد السيد(ة) مدير(ة) المؤسسة`,
      "",
      `الموضوع: *${config.label}*`,
      "",
      "سلام تام بوجود مولانا الإمام المؤيد بالله، وبعد:",
      "",
      currentBody,
      "",
      "وتقبلوا فائق التقدير والاحترام. والسلام",
      `الإمضاء: *${state.data.fullName || "-"}*`,
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "1️⃣ ✅ *تأكيد وتحميل وثيقة PDF الرسمية*",
      "2️⃣ 🎯 *تغيير الجهة الموجه إليها* (المديرية / الأكاديمية / الوزارة)",
      "3️⃣ ✏️ *تعديل تفاصيل / نقط الموضوع*",
      "4️⃣ 📝 *تعديل نص / فقرة الطلب*",
      "",
      "_(أرسل 1 للتأكيد واستخراج الـ PDF، أو 2/3/4 للتعديل، أو 00 لقائمة الوثائق، أو 0 للقائمة الرئيسية)_",
    ].filter(Boolean).join("\n");
  }

  const config = REQUEST_TYPES[state.type];
  if (!config) return "";
  const step = config.steps[state.step];
  if (!step) return "";
  const total = config.steps.length;
  const num = state.step + 1;
  const hint = step.hint ? `\n💡 ${step.hint}` : "";
  return `📋 *السؤال ${num}/${total}:*\n${step.question}${hint}\n\n_(أرسل *00* للرجوع لقائمة الوثائق، أو *0* للقائمة الرئيسية)_`;
}

/** Process a user answer — returns updated state */
export function processAnswer(state: WizardState, rawAnswer: string): WizardState {
  const answer = rawAnswer.trim();

  // If user cancelled back to review screen during field edit
  if ((answer === "00" || answer === "0") && state.awaitingEditField) {
    return {
      ...state,
      awaitingEditField: null,
      awaitingReviewChoice: true,
    };
  }

  // If editing recipientLevel
  if (state.awaitingEditField === "recipientLevel") {
    let rec: string = "province";
    if (answer === "2" || answer.includes("أكاديم") || answer.includes("اكاديم")) rec = "academie";
    else if (answer === "3" || answer.includes("وزار") || answer.includes("وزير")) rec = "ministere";

    const newData = { ...state.data, recipientLevel: rec };
    return {
      ...state,
      data: newData,
      awaitingEditField: null,
      awaitingReviewChoice: true,
    };
  }

  // If editing subject
  if (state.awaitingEditField === "subject") {
    const newData = { ...state.data, subject: answer };
    return {
      ...state,
      data: newData,
      awaitingEditField: null,
      awaitingReviewChoice: true,
    };
  }

  // If editing custom body text
  if (state.awaitingEditField === "bodyText") {
    const newData = { ...state.data, bodyText: answer };
    return {
      ...state,
      data: newData,
      awaitingEditField: null,
      awaitingReviewChoice: true,
    };
  }

  // If user is on the review screen
  if (state.awaitingReviewChoice) {
    if (answer === "1" || answer.includes("تأكيد") || answer.includes("نعم") || answer.includes("استخراج") || answer.includes("طباعة") || answer.includes("تحميل")) {
      const config = REQUEST_TYPES[state.type];
      return {
        ...state,
        step: config.steps.length,
        awaitingReviewChoice: false,
      };
    } else if (answer === "2" || answer.includes("الجهة") || answer.includes("جهة") || answer.includes("توجيه")) {
      return {
        ...state,
        awaitingEditField: "recipientLevel",
        awaitingReviewChoice: false,
      };
    } else if (answer === "3" || answer.includes("تفاصيل") || answer.includes("معطيات") || answer.includes("موضوع") || answer.includes("نقط")) {
      return {
        ...state,
        awaitingEditField: "subject",
        awaitingReviewChoice: false,
      };
    } else if (answer === "4" || answer.includes("نص") || answer.includes("فقرة")) {
      return {
        ...state,
        awaitingEditField: "bodyText",
        awaitingReviewChoice: false,
      };
    }
  }

  // If user was prompted to reuse saved profile or enter new
  if (state.awaitingProfileReuse && state.savedProfile) {
    if (answer === "1" || answer.includes("نفس") || answer.includes("السابق") || answer.includes("محفوظ")) {
      const config = REQUEST_TYPES[state.type];
      const p = state.savedProfile;
      const reusedData: Record<string, string> = {
        fullName: p.fullName || "",
        ppr: p.ppr || "",
        grade: p.grade || "",
        school: p.school || "",
        province: p.province || "",
      };
      const subjectStepIdx = config.steps.findIndex((s) => s.key === "subject");
      const nextStep = subjectStepIdx !== -1 ? subjectStepIdx : config.steps.length - 1;

      return {
        ...state,
        data: reusedData,
        step: nextStep,
        awaitingProfileReuse: false,
      };
    } else {
      return {
        ...state,
        data: {},
        step: 0,
        awaitingProfileReuse: false,
      };
    }
  }

  // If user was prompted to type custom document name
  if (state.awaitingCustomDoc) {
    const newData = { ...state.data, subject: answer };
    const nextStep = state.step + 1;
    const config = REQUEST_TYPES[state.type];
    const isLast = nextStep >= config.steps.length;

    return {
      ...state,
      data: newData,
      step: nextStep,
      awaitingCustomDoc: false,
      awaitingReviewChoice: isLast,
    };
  }

  const config = REQUEST_TYPES[state.type];
  const step = config.steps[state.step];
  if (!step) return state;

  // Special handling for demande_docs document choice
  if (state.type === "demande_docs" && step.key === "subject") {
    if (answer === "7" || answer.includes("أخرى") || answer.includes("اخرى") || answer.includes("آخر")) {
      return {
        ...state,
        awaitingCustomDoc: true,
      };
    }

    const mapped = DOC_CHOICES[answer];
    const finalValue = mapped || answer;
    const newData = { ...state.data, subject: finalValue };
    const nextStep = state.step + 1;
    const isLast = nextStep >= config.steps.length;

    return {
      ...state,
      data: newData,
      step: nextStep,
      awaitingReviewChoice: isLast,
    };
  }

  const newData = { ...state.data, [step.key]: answer };
  const nextStep = state.step + 1;
  const isLast = nextStep >= config.steps.length;

  return {
    ...state,
    data: newData,
    step: nextStep,
    awaitingReviewChoice: isLast,
  };
}

/** Check if wizard has collected all required data and confirmed */
export function isComplete(state: WizardState): boolean {
  if (state.awaitingProfileReuse) return false;
  if (state.awaitingCustomDoc) return false;
  if (state.awaitingReviewChoice) return false;
  if (state.awaitingEditField) return false;
  const config = REQUEST_TYPES[state.type];
  return state.step >= config.steps.length;
}

/** Build the type selection menu text */
export function getRequestMenuText(): string {
  return REQUEST_MENU_TEXT;
}

/** Parse a digit choice from the type selection menu */
export function parseTypeChoice(digit: string): RequestType | null {
  return REQUEST_TYPE_MENU[digit] || null;
}

/** Build a confirmation summary of collected data before generation */
export function buildDataSummary(state: WizardState): string {
  const config = REQUEST_TYPES[state.type];
  const lines = [
    `✅ *تأكيد البيانات — ${config.emoji} ${config.label}*`,
    "━━━━━━━━━━━━━━━━━━━━",
  ];
  for (const step of config.steps) {
    const value = state.data[step.key];
    if (value) {
      // Clean display question
      const cleanQ = step.question.split("\n")[0].replace("؟", "");
      lines.push(`• *${cleanQ}:* ${value}`);
    }
  }
  lines.push("");
  lines.push("⏳ جارٍ إعداد الوثيقة الرسمية...");
  return lines.join("\n");
}
