import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface ProcessGroupMessageParams {
  groupJid: string;
  groupName?: string;
  senderJid: string;
  senderName?: string;
  content: string;
}

const QUESTION_INDICATORS = [
  "؟",
  "?",
  "شنو",
  "واش",
  "كيفاش",
  "علاش",
  "شكون",
  "شحال",
  "فين",
  "وقتاش",
  "هل",
  "متى",
  "كم",
  "أين",
  "كيف",
  "ما هو",
  "ما هي",
  "لماذا",
  "هل يمكن",
  "هل صحيح",
  "من يعرف",
  "أحد عنده فكرة",
  "ممكن استفسار",
  "سؤال من فضلكم",
  "استفسار عاجل",
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  "ترقية وامتحانات مهنية": ["ترقية", "امتحان مهني", "كفاءة", "سلم 11", "سلم 10", "خارج السلم", "رتبة", "نقطة التفتيش", "ملف الترقية"],
  "حركة انتقالية وفائض": ["حركة انتقالية", "فائض", "خصاص", "تكليف", "استيداع", "تبادل", "مؤسسة مستقبلة", "طرد تعسفي", "إعادة انتشار"],
  "رخص وغياب واقتطاعات": ["رخصة مرضية", "رخصة ولادة", "شهادة طبية", "غياب مبرر", "اقتطاع من الأجر", "اقتطاعات", "رخصة استثنائية", "عطلة"],
  "تقاعد وتعويضات مالية": ["تقاعد", "معاش", "تعويضات تكميلية", "منحة التميز", "تسوية مالية", "مخلفات مالية", "صندوق المغربي للتقاعد", "cmr"],
  "نظام أساسي وقوانين": ["نظام أساسي", "مرسوم", "مقرر وزيري", "عقوبة تأديبية", "مجلس الانضباط", "تفتيش", "استفسار إداري"],
  "أنشطة ونضال نقابي": ["بيان", "إضراب", "وقفة احتجاجية", "مجلس وطني", "مكتب إقليمي", "مكتب وطني", "انخراط", "fne", "بطاقة نقابية"],
  "دخول مدرسي وتدريس": ["دخول مدرسي", "استعمال الزمن", "جدول الحصص", "ساعات العمل", "توقيع المحضر", "إسناد الأقسام", "اكتظاظ"],
};

export function classifyGroupMessage(text: string): {
  isQuestion: boolean;
  topic: string;
  keywords: string[];
  sentiment: string;
} {
  const clean = text.toLowerCase();

  // 1. Detect if it's a question
  const isQuestion = QUESTION_INDICATORS.some((q) => clean.includes(q.toLowerCase()));

  // 2. Detect topic and keywords
  let matchedTopic = "نقاش ومستجدات عامة";
  const matchedKeywords: string[] = [];

  for (const [topicName, kwList] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of kwList) {
      if (clean.includes(kw.toLowerCase())) {
        matchedKeywords.push(kw);
        if (matchedTopic === "نقاش ومستجدات عامة") {
          matchedTopic = topicName;
        }
      }
    }
  }

  // 3. Detect sentiment / urgency
  let sentiment = "neutral";
  if (
    clean.includes("عاجل") ||
    clean.includes("شطط") ||
    clean.includes("ظلم") ||
    clean.includes("ضروري") ||
    clean.includes("كارثة") ||
    clean.includes("حكرة")
  ) {
    sentiment = "urgent";
  } else if (isQuestion) {
    sentiment = "inquiry";
  }

  return {
    isQuestion,
    topic: matchedTopic,
    keywords: matchedKeywords.slice(0, 5),
    sentiment,
  };
}

export function maskPhoneNumber(jid: string): string {
  const phone = jid.split("@")[0].replace(/\D/g, "");
  if (phone.length <= 6) return phone;
  const start = phone.slice(0, 4);
  const end = phone.slice(-2);
  return `${start}•••${end}`;
}

export async function recordGroupMessageWatch(params: ProcessGroupMessageParams): Promise<void> {
  const { groupJid, groupName, senderJid, senderName, content } = params;

  const trimmed = content.trim();
  // Skip trivial spam/short reactions like "ok", "merci", "نعم", emojis only
  if (trimmed.length < 5 || /^[\p{Emoji}\s.,!?-]+$/u.test(trimmed)) {
    return;
  }

  try {
    const { isQuestion, topic, keywords, sentiment } = classifyGroupMessage(trimmed);

    const displayName = senderName && senderName !== "Unknown" ? senderName : maskPhoneNumber(senderJid);

    await (prisma as any).groupWatchMessage.create({
      data: {
        groupJid,
        groupName: groupName || "مجموعة واتساب",
        senderName: displayName,
        senderJid: maskPhoneNumber(senderJid),
        content: trimmed,
        isQuestion,
        topic,
        keywords,
        sentiment,
      },
    });

    logger.info(`[WhatsApp/GroupWatch] Intercepted from ${displayName} in ${groupName || groupJid}: [${topic}] "${trimmed.substring(0, 40)}..."`);
  } catch (err) {
    logger.warn("[WhatsApp/GroupWatch] Failed to record group message:", { error: String(err) });
  }
}
