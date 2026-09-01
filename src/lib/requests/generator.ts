/**
 * FNE Smart Docs — Request Generator
 *
 * Generates concise personal Moroccan administrative requests.
 * Pure individual requests without FNE branding on the letter,
 * and without useless bloat, conforming strictly to official standards.
 * Self-contained without Hub dependencies.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  REQUEST_TYPES,
  getArabicDate,
  type RequestType,
} from "./types";
import type { WizardState } from "./wizard";
import crypto from "crypto";

interface GenerateResult {
  id: string;
  text: string;
  bodyText: string;
  printToken: string;
  printUrl: string;
}

/** Helper to detect / deduce Region from Province name in Morocco */
export function deduceRegion(province: string): string {
  const p = (province || "").trim();
  if (/تيزنيت|تزنيت|أكادير|اكادير|إنزكان|انزكان|أيت ملول|ايت ملول|تارودانت|شتوكة|طاطا/i.test(p)) {
    return "سوس - ماسة";
  }
  if (/مراكش|الحوز|شيشاوة|قلعة السراغنة|الصويرة|آسفي|اسفي|اليوسفية|الرحامنة/i.test(p)) {
    return "مراكش - آسفي";
  }
  if (/الرباط|سلا|الصخيرات|تمارة|القنيطرة|الخميسات|سيدي قاسم|سيدي سليمان/i.test(p)) {
    return "الرباط - سلا - القنيطرة";
  }
  if (/الدار البيضاء|سطات|الجديدة|برشيد|بنسليمان|مديونة|النواصر|المحمدية|سيدي بنور/i.test(p)) {
    return "الدار البيضاء - سطات";
  }
  if (/طنجة|تطوان|العرائش|الحسيمة|شفشاون|وزان|الفحص أنجرة|المضيق|الفنيدق/i.test(p)) {
    return "طنجة - تطوان - الحسيمة";
  }
  if (/فاس|مكناس|صفرو|إفران|افران|تاونات|تازة|بولمان|الحاجب/i.test(p)) {
    return "فاس - مكناس";
  }
  if (/بني ملال|أزيلال|ازيلال|الفقيه بن صالح|خنيفرة|خريبكة/i.test(p)) {
    return "بني ملال - خنيفرة";
  }
  if (/وجدة|الناظور|الدريوش|بركان|تاوريرت|جرادة|جرسيف|فكيك|بوعرفة/i.test(p)) {
    return "الشرق";
  }
  if (/الرشيدية|ميدلت|ورزازات|تنغير|زاكورة/i.test(p)) {
    return "درعة - تافيلالت";
  }
  if (/كلميم|سيدي إفني|سيدي افني|طانطان|آسا|الزاك/i.test(p)) {
    return "كلميم - واد نون";
  }
  if (/العيون|بوجدور|طرفاية|السمارة/i.test(p)) {
    return "العيون - الساقية الحمراء";
  }
  if (/الداخلة|وادي الذهب|أوسرد|اوسرد/i.test(p)) {
    return "الداخلة - وادي الذهب";
  }
  return "سوس - ماسة"; // Default Region
}

/** Build recipient hierarchy header block for official Moroccan education letters */
export function getRecipientBlock(recipientLevel: string, province: string, school: string): string[] {
  const prov = province || "المديرية الإقليمية";
  const sch = school || "المؤسسة التعليمية";
  const region = deduceRegion(prov);

  switch (recipientLevel) {
    case "ministere":
      return [
        "إلى السيد:",
        "وزير التربية الوطنية والتعليم الأولي والرياضة",
        "تحت إشراف السيد:",
        `مدير الأكاديمية الجهوية للتربية والتكوين - جهة ${region}`,
        "تحت إشراف السيد:",
        `المدير الإقليمي للأكاديمية الجهوية للتربية والتكوين جهة ${region} - مديرية ${prov}`,
        `على يد السيد(ة) مدير(ة) ${sch}`,
      ];

    case "academie":
      return [
        "إلى السيد:",
        `مدير الأكاديمية الجهوية للتربية والتكوين - جهة ${region}`,
        "تحت إشراف السيد:",
        `المدير الإقليمي للأكاديمية الجهوية للتربية والتكوين لمديرية ${prov}`,
        `على يد السيد(ة) مدير(ة) ${sch}`,
      ];

    case "province":
    default:
      return [
        "إلى السيد(ة):",
        `المدير(ة) الإقليمي(ة) لوزارة التربية الوطنية والتعليم الأولي والرياضة بـ${prov}`,
        `على يد السيد(ة) مدير(ة) ${sch}`,
      ];
  }
}

/** Build concise body text for a request */
export function buildConciseBody(
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
      return [
        `يشرفني أن أرفع إلى سيادتكم هذا الطعن بخصوص نتائج الحركة الانتقالية، نظراً للحيثيات التالية: (${subject || "عدم مراعاة الاستحقاق والرغبات المعبر عنها"})، ملتمساً منكم التفضل بإعادة دراسة ملفي وإنصافي وفق الضوابط المعمول بها.`,
      ].join("\n");

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

/** Build full document text (used for WhatsApp/Telegram delivery) */
export function buildFullDocumentText(
  type: RequestType,
  data: Record<string, string>,
  bodyText: string
): string {
  const config = REQUEST_TYPES[type];
  const date = getArabicDate();
  const fullName = data.fullName || "المعني بالأمر";
  const ppr = data.ppr && data.ppr !== "0" ? `رقم التأجير: ${data.ppr}` : "";
  const grade = data.grade || "أستاذ(ة)";
  const school = data.school || "المؤسسة التعليمية";
  const province = data.province || "المديرية الإقليمية";
  const recipientLines = getRecipientBlock(data.recipientLevel || config.recipientDefault, province, school);

  return [
    `${province} في: ${date}`,
    "",
    `الاسم والنسب: ${fullName}`,
    ppr,
    `الإطار: ${grade}`,
    `المؤسسة: ${school}`,
    `المديرية الإقليمية: ${province}`,
    "",
    ...recipientLines,
    "",
    `الموضوع: ${config.label}`,
    "",
    "سلام تام بوجود مولانا الإمام المؤيد بالله،",
    "وبعد،",
    "",
    bodyText,
    "",
    "وتقبلوا فائق التقدير والاحترام. والسلام",
    "",
    "الإمضاء:",
    fullName,
  ].filter(Boolean).join("\n");
}

/** Build prompt for AI if custom adaptation is needed, strictly enforcing brevity */
function buildGenerationPrompt(type: RequestType, data: Record<string, string>): string {
  const config = REQUEST_TYPES[type];
  const subject = data.subject || config.label;

  return `أنت محرر إداري مغربي متخصص في المراسلات والطلبات الشخصية لقطاع التربية الوطنية.
المطلوب صياغة فقرة الطلب الإداري فقط (نص الطلب فقط بدون ترويسة، بدون اسم المرسل إليه، بدون تاريخ، وبدون توقيع).

شروط صارمة:
1. ممنوع كلياً ذكر أي مرجع قانوني أو ظهير أو مرسوم أو قانون.
2. لا تذكر أي كلام زائد أو حشو. صغ فقرة واحدة فقط مباشرة ومحترمة تطلب المطلوب بدقة.
3. لا تضف عبارة الختام والسلام في نهايتها.

نوع الطلب: ${config.label}
موضوع / تفاصيل الطلب: ${subject}`;
}

/** Call LLM with provider routing and fallback */
async function callLLM(prompt: string): Promise<string | null> {
  const settings = await prisma.settings.findFirst({
    select: {
      aiApiKey: true,
      aiModel: true,
      aiProvider: true,
      fallbackProvider: true,
      fallbackModel: true,
      fallbackApiKey: true,
    },
  });

  const primaryProvider = (settings?.aiProvider || "groq").toLowerCase();
  const primaryKey = settings?.aiApiKey || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || "";
  const primaryModel = settings?.aiModel || "qwen/qwen3.8-27b";

  function getBaseUrl(provider: string): string {
    switch (provider) {
      case "groq":
        return "https://api.groq.com/openai/v1/chat/completions";
      case "openrouter":
        return "https://openrouter.ai/api/v1/chat/completions";
      case "gemini":
        return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      case "openai":
      default:
        return "https://api.openai.com/v1/chat/completions";
    }
  }

  // 1. Try Primary AI Provider
  if (primaryKey) {
    try {
      const url = getBaseUrl(primaryProvider);
      logger.info(`[RequestGenerator] Calling primary LLM (${primaryProvider} / ${primaryModel})`);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${primaryKey}`,
        },
        body: JSON.stringify({
          model: primaryModel,
          messages: [
            {
              role: "system",
              content:
                "أنت محرر إداري مغربي. تصوغ فقرة الطلب فقط بدون ترويسة وبدون مراجع وبدون حشو.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 300,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text && text.length >= 30 && text.length <= 800) {
          if (!text.includes("الظهير الشريف") && !text.includes("المادة") && !text.includes("المرسوم")) {
            return text;
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[RequestGenerator] Primary LLM error: ${err?.message || err}`);
    }
  }

  // 2. Try Fallback AI Provider
  const fallbackProvider = (settings?.fallbackProvider || "").toLowerCase();
  const fallbackKey = settings?.fallbackApiKey || "";
  const fallbackModel = settings?.fallbackModel || "minimax/minimax-m3:free";

  if (fallbackProvider && fallbackKey) {
    try {
      const url = getBaseUrl(fallbackProvider);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fallbackKey}`,
        },
        body: JSON.stringify({
          model: fallbackModel,
          messages: [
            {
              role: "system",
              content:
                "أنت محرر إداري مغربي. تصوغ فقرة الطلب فقط بدون مراجع وبدون حشو.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 300,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text && text.length >= 30 && text.length <= 800) {
          if (!text.includes("الظهير الشريف") && !text.includes("المادة") && !text.includes("المرسوم")) {
            return text;
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[RequestGenerator] Fallback LLM error: ${err?.message || err}`);
    }
  }

  return null;
}

/** Main generation function */
export async function generateAdminRequest(
  wizardState: WizardState,
  conversationId: string | null,
  channel: string
): Promise<GenerateResult> {
  const { type, data } = wizardState;
  const config = REQUEST_TYPES[type];
  const date = getArabicDate();

  logger.info(`[RequestGenerator] Generating personal request for ${type} (${data.fullName || "anonymous"})`);

  // 1. Generate concise body text (or use user-customized bodyText if provided)
  let bodyText = data.bodyText || buildConciseBody(type, data.subject || "", date, data);

  // If free text / custom request without manual bodyText, refine with AI if needed
  if (!data.bodyText && (type === "libre" || (type !== "ta3n_admin" && data.subject && data.subject.length > 50))) {
    const prompt = buildGenerationPrompt(type, data);
    const aiBody = await callLLM(prompt);
    if (aiBody) {
      bodyText = aiBody;
    }
  }

  // 2. Build full document text (used for WhatsApp delivery)
  const fullDocumentText = buildFullDocumentText(type, data, bodyText);

  // 3. Generate secure print token
  const printToken = crypto.randomBytes(20).toString("hex");

  // 4. Save minimal record to DB (Adherent details stored strictly in extraData for document rendering, not indexed for dashboard)
  const saved = await (prisma as any).administrativeRequest.create({
    data: {
      id: crypto.randomUUID(),
      conversationId: null, // Anonymize conversation link
      channel,
      type,
      recipientLevel: data.recipientLevel || config.recipientDefault,
      fullName: "", // Anonymized on main table to preserve adherent privacy in dashboard view
      grade: data.grade || "", // Kept only as cadre metric
      school: "", // Anonymized on main table
      province: data.province || "", // Kept as regional metric
      subject: "", // Anonymized on main table
      extraData: {
        ...data,
        bodyText, // Explicitly save pure body text
      },
      generatedText: "", // Do not store personal letter text in dashboard main columns
      printToken,
      status: "generated",
      updatedAt: new Date(),
    },
  });

  const appBase =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://ns516856.ip-158-69-24.net";

  const printUrl = `${appBase}/requests/print/${printToken}`;

  logger.info(`[RequestGenerator] Request ${saved.id} generated, printToken=${printToken}`);

  return {
    id: saved.id,
    text: fullDocumentText,
    bodyText,
    printToken,
    printUrl,
  };
}

/** Format the final delivery message for WhatsApp / Telegram */
export function buildDeliveryMessage(
  result: GenerateResult,
  typeLabel: string,
  channel: "whatsapp" | "telegram"
): string {
  const divider = "────────────────";

  if (channel === "telegram") {
    return [
      `✅ *تم إعداد ${typeLabel} بنجاح!*`,
      "",
      result.text,
      "",
      divider,
      "📥 تم إرفاق وثيقة الـ PDF الرسمية جاهزة للتحميل والطباعة مباشرة أعلاه.",
      "أرسل *0* للرجوع للقائمة الرئيسية",
    ].join("\n");
  }

  // WhatsApp
  return [
    `✅ *تم إعداد ${typeLabel} بنجاح!*`,
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    result.text,
    "",
    divider,
    "📥 تم إرفاق وثيقة الـ PDF الرسمية جاهزة للتحميل والطباعة مباشرة أعلاه.",
    "أرسل *0* للرجوع للقائمة الرئيسية",
  ].join("\n");
}
