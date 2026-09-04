"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, ExternalLink, Globe, Link2, Loader2, Phone, RotateCcw, Send, UserRound, X } from "lucide-react";

type ChatMessage = {
  role: "customer" | "assistant";
  content: string;
};

function getHubUrlLabel(url: string): string {
  const clean = url.toLowerCase();
  if (clean.includes("/adherer")) return "منصة الانخراط الإلكتروني (hub.taalim.org)";
  if (clean.includes("calc_promotion_points")) return "حاسبة نقط الترقية الرسمية (hub.taalim.org)";
  if (clean.includes("generate_request")) return "مولّد الطلبات والمراسلات (hub.taalim.org)";
  if (clean.includes("/milaf")) return "إيداع الملف النقابي (hub.taalim.org)";
  if (clean.includes("carte_scolaire")) return "الخريطة المدرسية والتخطيط (hub.taalim.org)";
  if (clean.includes("hub.taalim.org")) return "بوابة خدمات Hub Taalim الرسمية";
  return url.replace(/^https?:\/\//, "");
}

function normalizeMessageContent(text: string): string {
  let res = text;
  // 1. Fix markdown links with spaces/newlines between brackets and parentheses:
  // e.g. [https://hub.taalim.org/carte_scolaire.php]\n(https://hub.taalim.org/carte_scolaire.php)
  res = res.replace(/\[([^\]]+)\]\s*\n*\s*\(\s*(https?:\/\/[^\s\)]+)\s*\)/g, "[$1]($2)");

  // 2. If the label is an identical or near-identical URL: [https://...](https://...) -> https://...
  res = res.replace(/\[https?:\/\/[^\]]+\]\((https?:\/\/[^\)]+)\)/g, "$1");

  // 3. Unwrap URLs enclosed in brackets: [https://...] -> https://...
  res = res.replace(/\[(https?:\/\/[^\]\s]+)\]/g, "$1");

  // 4. Unwrap URLs enclosed in parentheses: (https://...) -> https://...
  res = res.replace(/\((https?:\/\/[^\)\s]+)\)/g, "$1");

  // 5. Unwrap URLs wrapped in bold: **https://...** -> https://...
  res = res.replace(/\*\*(https?:\/\/[^\*\s]+)\*\*/g, "$1");

  return res;
}

function parseFormattedInline(text: string): React.ReactNode[] {
  const normalized = normalizeMessageContent(text);
  const tokenRegex = /(\[[^\]]+\]\s*\(\s*https?:\/\/[^\s\)]+\s*\)|https?:\/\/[^\s\)\<\>\"\'\]]+|\*\*[^*]+\*\*|\b(?:0[5-8]\d{8}|\+212[5-8]\d{8})\b)/g;
  const parts = normalized.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // 1. Markdown link: [label](url)
    const mdMatch = part.match(/^\[([^\]]+)\]\s*\(\s*(https?:\/\/[^\s\)]+)\s*\)$/);
    if (mdMatch) {
      const label = mdMatch[1];
      const url = mdMatch[2];
      const isHub = url.includes("hub.taalim.org");
      return (
        <a
          key={idx}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isHub
              ? "inline-flex items-center gap-1.5 my-1 px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-[#b51f2b] to-[#8d1822] hover:from-[#9c1924] hover:to-[#73131b] rounded-lg shadow-sm hover:shadow-md transition duration-150 no-underline"
              : "inline-flex items-center gap-1 font-semibold text-[#047857] hover:text-[#065f46] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2 py-0.5 rounded-md transition duration-150 no-underline"
          }
        >
          {isHub ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-amber-200" /> : <Globe className="h-3 w-3 shrink-0 text-[#059669]" />}
          <span>{label}</span>
          <span className="text-[10px] bg-white/20 px-1 rounded text-white/90">فتح ↗</span>
        </a>
      );
    }

    // 2. Raw URL (especially hub.taalim.org, taalim.org, etc.)
    if (/^https?:\/\//i.test(part)) {
      let cleanUrl = part;
      let trailingPunct = "";
      const punctMatch = part.match(/[.,;:!?،؛)\]]+$/);
      if (punctMatch) {
        trailingPunct = punctMatch[0];
        cleanUrl = part.slice(0, -trailingPunct.length);
      }

      const isHub = cleanUrl.includes("hub.taalim.org");
      const isWebsite = cleanUrl.toLowerCase().includes("taalim.org") && !isHub;
      const isTelegram = cleanUrl.includes("t.me/");

      if (isHub) {
        const hubLabel = getHubUrlLabel(cleanUrl);
        return (
          <span key={idx} className="inline-block my-1 align-middle">
            <a
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#b51f2b] via-[#a81a25] to-[#8d1822] hover:from-[#9c1924] hover:to-[#73131b] rounded-lg shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition duration-150 no-underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-amber-200" />
              <span>{hubLabel}</span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white/95">دخول ↗</span>
            </a>
            {trailingPunct}
          </span>
        );
      }

      return (
        <span key={idx} className="inline-block my-0.5 align-middle">
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#047857] hover:text-[#065f46] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2 py-0.5 rounded-md transition duration-150 no-underline"
          >
            {isWebsite ? (
              <Globe className="h-3 w-3 shrink-0 text-[#059669]" />
            ) : isTelegram ? (
              <span className="text-xs font-bold text-sky-600">✈️</span>
            ) : (
              <Link2 className="h-3 w-3 shrink-0 text-emerald-700" />
            )}
            <span dir="ltr" className="text-xs">{cleanUrl.replace(/^https?:\/\//, "")}</span>
            <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
          </a>
          {trailingPunct}
        </span>
      );
    }

    // 3. Bold text: **text**
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      if (/https?:\/\//i.test(boldMatch[1])) {
        return (
          <strong key={idx} className="font-bold text-[#1f1d1c]">
            {parseFormattedInline(boldMatch[1])}
          </strong>
        );
      }
      return (
        <strong key={idx} className="font-bold text-[#1f1d1c]">
          {boldMatch[1]}
        </strong>
      );
    }

    // 4. Moroccan Phone numbers: 0[5-8]XXXXXXXX or +212...
    if (/^(?:0[5-8]\d{8}|\+212[5-8]\d{8})$/.test(part)) {
      return (
        <a
          key={idx}
          href={`tel:${part}`}
          className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 px-1.5 py-0.5 rounded transition text-xs"
        >
          <Phone className="h-3 w-3 shrink-0 text-emerald-600" />
          <span dir="ltr">{part}</span>
        </a>
      );
    }

    // Normal text
    return <span key={idx}>{part}</span>;
  });
}

function FormattedMessage({ content, isCustomer }: { content: string; isCustomer: boolean }) {
  if (isCustomer) {
    return (
      <div className="text-justify [text-align-last:right] [text-justify:inter-word] leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    );
  }

  const normalized = normalizeMessageContent(content);
  // Fix lone bullet on its own line: \n•\ntext -> \n• text
  const fixedBullets = normalized.replace(/\n\s*([•◦▪️▫️\-\*])\s*\n\s*/g, "\n$1 ");

  // Split by intentional paragraphs (double newlines)
  const paragraphs = fixedBullets.split(/\n\s*\n+/);
  const bulletRegex = /^([•◦▪️▫️\-\*]|(?:\(?\d+[\.\-\)]))\s*(.+)$/;

  return (
    <div className="space-y-2 text-[#3d302c] leading-relaxed">
      {paragraphs.map((p, pIdx) => {
        const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) return null;

        // Check if decorative separator line
        if (lines.length === 1 && /^[─━═\-_]{3,}$/.test(lines[0])) {
          return <hr key={pIdx} className="my-2 border-[#e8dcd5]" />;
        }

        // Check if list block
        const hasBullets = lines.some((l) => bulletRegex.test(l));
        if (hasBullets) {
          return (
            <div key={pIdx} className="space-y-1.5 my-1.5">
              {lines.map((line, lIdx) => {
                const match = line.match(bulletRegex);
                if (match) {
                  const prefix = match[1];
                  const body = match[2].trim();
                  return (
                    <div
                      key={lIdx}
                      className="flex items-start gap-2 text-justify [text-align-last:right] [text-justify:inter-word]"
                    >
                      <span className="font-bold text-[#b51f2b] shrink-0 text-xs mt-1 select-none">
                        {/^\(?\d+[\.\-\)]/.test(prefix) ? prefix : "•"}
                      </span>
                      <div className="flex-1">
                        {parseFormattedInline(body)}
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={lIdx}
                    className="text-justify [text-align-last:right] [text-justify:inter-word] pr-4 text-xs opacity-90"
                  >
                    {parseFormattedInline(line)}
                  </div>
                );
              })}
            </div>
          );
        }

        // Check if heading or section label
        if (
          lines.length === 1 &&
          (lines[0].startsWith("📌") ||
            lines[0].startsWith("🟢") ||
            lines[0].startsWith("🏢") ||
            lines[0].startsWith("🤝") ||
            lines[0].startsWith("🏛️") ||
            lines[0].startsWith("📜") ||
            lines[0].startsWith("📅") ||
            lines[0].startsWith("⚖️") ||
            lines[0].startsWith("🎒") ||
            lines[0].startsWith("📢"))
        ) {
          return (
            <div key={pIdx} className="font-bold text-[#1f1d1c] my-1.5 text-right">
              {parseFormattedInline(lines[0])}
            </div>
          );
        }

        // Check if signature / slogan lines (keep each on separate line)
        if (
          lines.length > 1 &&
          lines.some((l) => /^(عن المكتب|الكاتب العام|الكاتب الوطني|عاشت|عاش|تحية|الرباط،|الدار البيضاء،|تيزنيت،)/.test(l))
        ) {
          return (
            <div key={pIdx} className="space-y-0.5 my-1.5 text-right font-medium text-[#2d2624]">
              {lines.map((sigLine, sIdx) => (
                <div key={sIdx}>{parseFormattedInline(sigLine)}</div>
              ))}
            </div>
          );
        }

        // Normal narrative paragraph: join broken lines into continuous text so CSS text-align: justify applies across the entire paragraph
        const paragraphText = lines.join(" ");
        return (
          <p
            key={pIdx}
            className="text-justify [text-align-last:right] [text-justify:inter-word] leading-relaxed my-1.5"
          >
            {parseFormattedInline(paragraphText)}
          </p>
        );
      })}
    </div>
  );
}

const conversationStorageKey = "fne-web-conversation";
const visitorStorageKey = "fne-web-visitor";

function createVisitorContact(): string {
  return `web:${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const MENU_CATEGORIES = [
  {
    id: "1",
    label: "🏢 1 - المكاتب والتنظيم",
    questions: [
      "رقم الكاتب الإقليمي تيزنيت",
      "معلومات المكتب الجهوي سوس ماسة",
      "الكاتب الوطني للجامعة الوطنية للتعليم FNE",
      "من هو الكاتب المحلي أكلو المعدر",
      "الكاتب الإقليمي اتحاد شباب التعليم اشتوكة ايت باها",
      "هاتف الكاتب الجهوي لسوس ماسة",
    ],
  },
  {
    id: "2",
    label: "📜 2 - القانون الأساسي",
    questions: [
      "ما هي أهداف الجامعة الوطنية للتعليم",
      "ما هي اختصاصات المجلس الوطني",
      "ماذا ينص الفصل 15 من القانون الأساسي",
      "كيف يتشكل المكتب الوطني للجامعة",
      "ما هو دور المؤتمر الوطني",
      "شروط العضوية في الجامعة",
      "ما هي مهام المكتب الوطني",
      "كم عدد أعضاء المجلس الوطني",
    ],
  },
  {
    id: "3",
    label: "📅 3 - مقرر السنة الدراسية",
    questions: [
      "متى تكون العطلة المدرسية القادمة",
      "ما هي تواريخ الامتحانات الإشهادية",
      "متى موعد الدخول المدرسي",
      "تواريخ فروض المراقبة المستمرة",
      "موعد عطلة الربيع",
      "تواريخ توقيع محاضر الخروج",
      "موعد عطلة منتصف السنة الدراسية",
      "تاريخ إجراء امتحانات البكالوريا",
    ],
  },
  {
    id: "4",
    label: "⚖️ 4 - الوظيفة العمومية",
    questions: [
      "ما هي أنواع الرخص الصحية",
      "ما هي شروط الترقية في الدرجة",
      "ما هي العقوبات التأديبية في الوظيفة العمومية",
      "حالات الإلحاق والاستيداع",
      "كم مدة رخصة الولادة والكفالة",
      "شروط التقاعد النسبي وحد السن",
      "حقوق وضمانات الموظف العمومي",
      "مسطرة التأديب أمام المجلس التأديبي",
    ],
  },
  {
    id: "5",
    label: "🎒 5 - الدخول المدرسي",
    questions: [
      "ما هي إجراءات الدخول المدرسي",
      "كيفية تدبير الفائض والخصاص",
      "معايير الحركة الانتقالية للموارد البشرية",
      "معايير إسناد الأقسام وتوزيع الحصص",
      "إجراءات وتواريخ استئناف العمل",
    ],
  },
  {
    id: "6",
    label: "📢 6 - بيانات ومستجدات",
    questions: [
      "ما موقف الجامعة من مطلب تخفيض ساعات العمل",
      "موقف FNE من فرض رسوم التسجيل بالجامعات",
      "بيان الجامعة بخصوص منظومة مسار+",
      "بيان حول أجور ومعاشات نساء ورجال التعليم",
      "برنامج نضالي للمساعدين التربويين",
      "آخر بلاغات ومستجدات المكتب الوطني",
    ],
  },
  {
    id: "7",
    label: "🤝 7 - الانخراط والخدمات الرقمية (Hub)",
    questions: [
      "كيف أقدّم طلب الانخراط أو تجديد البطاقة النقابية؟",
      "كيف أحسب وأدقق نقط الترقية في الدرجة والرتبة؟",
      "أريد توليد نموذج طلب إداري أو طعن جاهز للطباعة",
      "كيف أودع ملفاً نقابياً لمتابعة تظلمي مع مسؤولي الجامعة؟",
      "كيف أرسل مستجدات أو أبلغ عن خروقات ميدانية؟",
      "أريد الاطلاع على الخريطة المدرسية والتخطيط التربوي",
    ],
  },
  {
    id: "8",
    label: "📄 8 - توليد الطلبات الإدارية",
    questions: [
      "أريد صياغة طعن بخصوص النقطة الإدارية",
      "أريد صياغة طعن في نتائج الحركة الانتقالية",
      "أريد طلب وثيقة إدارية (شهادة العمل، بيان الخدمات...)",
      "أريد صياغة طلب تكليف",
      "أريد صياغة طلب ومراسلة إدارية عامة",
    ],
  },
  {
    id: "9",
    label: "🧮 9 - حساب نقط الترقية",
    questions: [
      "كيف يتم حساب نقط الترقية بالاختيار؟",
      "ما هي معايير الترقي بالشهادة أو الامتحان المهني؟",
      "أريد فتح رابط حاسبة نقط الترقية الرسمية FNE",
    ],
  },
  {
    id: "10",
    label: "📨 10 - ملاحظات واقتراحات",
    questions: [
      "اكتب ملاحظتك أو اقتراحك",
      "قم بإرسال فكرة لتحسين الخدمة",
      "اشرح مشكلة واجهتك",
    ],
  },
];


function WebChatContent() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams?.get("embed") === "true";
  const visibleCategories = isEmbed
    ? MENU_CATEGORIES.filter((c) => c.id !== "7")
    : MENU_CATEGORIES;

  const [conversationId, setConversationId] = useState("");
  const [visitorContact, setVisitorContact] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "مرحبا بكم في مساعد الجامعة الوطنية للتعليم FNE\nكيف يمكنني مساعدتكم اليوم؟" },
  ]);
  const [sending, setSending] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(true);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [error, setError] = useState("");
  const [newsArticles, setNewsArticles] = useState<Array<{ id: string; title: string; content?: string }>>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  // feedback: maps message index -> "positive" | "negative" | "sent"
  const [feedbackState, setFeedbackState] = useState<Record<number, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch latest articles for Category 6
    fetch("/api/articles/latest")
      .then((res) => res.json())
      .then((data) => {
        if (data.articles && Array.isArray(data.articles)) {
          setNewsArticles(data.articles);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    setConversationId(window.localStorage.getItem(conversationStorageKey) || "");
    setVisitorContact(window.localStorage.getItem(visitorStorageKey) || createVisitorContact());
  }, []);

  useEffect(() => {
    if (visitorContact) window.localStorage.setItem(visitorStorageKey, visitorContact);
  }, [visitorContact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function resetConversation() {
    window.localStorage.removeItem(conversationStorageKey);
    setConversationId("");
    setActiveCategory(null);
    setMessages([
      { role: "assistant", content: "مرحبا بكم في مساعد الجامعة الوطنية للتعليم FNE\nكيف يمكنني مساعدتكم اليوم؟" },
    ]);
  }

  async function sendMessage(nextMessage: string) {
    const trimmedMessage = nextMessage.trim();
    if (!trimmedMessage || sending) return;

    setActiveCategory(null);
    setMessage("");
    setError("");
    setMessages((current) => [...current, { role: "customer", content: trimmedMessage }]);
    setSending(true);

    try {
      const chatEndpoint = window.location.pathname === "/askfne"
        ? "/askfne-api/chat"
        : "/api/chat";
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          message: trimmedMessage,
          conversationId: conversationId || undefined,
          channel: "web",
          customerName: customerName.trim() || "زائر الموقع",
          customerContact: visitorContact || createVisitorContact(),
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("تعذر الاتصال بخدمة المحادثة. يرجى إعادة تحميل الصفحة والمحاولة مرة أخرى.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الرسالة");

      if (data.conversationId) {
        setConversationId(data.conversationId);
        window.localStorage.setItem(conversationStorageKey, data.conversationId);
      }
      setMessages((current) => [...current, { role: "assistant", content: data.response }]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(message);
  }

  async function sendFeedback(msgIndex: number, rating: "positive" | "negative") {
    if (feedbackState[msgIndex]) return; // already voted
    setFeedbackState((prev) => ({ ...prev, [msgIndex]: rating }));

    let questionText = "";
    for (let k = msgIndex - 1; k >= 0; k--) {
      if (messages[k]?.role === "customer") {
        questionText = messages[k].content;
        break;
      }
    }

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "webchat",
          conversationId: conversationId || null,
          rating,
          question: questionText,
        }),
      });
    } catch {
      // Silent fail — feedback is best-effort
    }
  }

  return (
    <main dir="rtl" className={isEmbed ? "h-[100dvh] w-full bg-white flex flex-col font-sans overflow-hidden" : "h-[100dvh] w-full bg-[#f9f7f5] text-[#262322] selection:bg-[#b51f2b]/20 font-sans overflow-hidden"}>
      {!isEmbed && <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(#e8ddd8_1px,transparent_1px),linear-gradient(90deg,#e8ddd8_1px,transparent_1px)] [background-size:44px_44px]" />}
      <div className={isEmbed ? "flex flex-col h-full w-full" : "relative mx-auto flex h-[100dvh] w-full max-w-5xl flex-col sm:px-3 sm:py-3 lg:px-6"}>
        <section className="flex min-h-0 flex-1 flex-col">
          <section className={isEmbed ? "flex h-full min-h-0 w-full flex-col bg-white" : "mx-auto flex h-[100dvh] min-h-0 w-full max-w-5xl flex-col bg-white sm:h-[min(880px,calc(100vh-2rem))] sm:rounded-[1.5rem] sm:border sm:border-[#e8d8d4] sm:shadow-[0_24px_70px_rgba(108,43,43,0.16)]"}>
            {/* Header with modern green-to-red FNE gradient */}
            <div className="flex items-center justify-between gap-2.5 bg-gradient-to-r from-[#059669] via-[#047857] to-[#b51f2b] px-3.5 py-2.5 text-white shadow-sm sm:gap-3 sm:px-6 sm:py-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="rounded-full bg-white/20 p-1.5 backdrop-blur-xs shrink-0"><Bot className="h-4 w-4 sm:h-5 sm:w-5" /></div>
                <div className="min-w-0">
                  <h2 className="truncate text-xs sm:text-base font-extrabold">المساعد الذكي للجامعة الوطنية للتعليم FNE</h2>
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-emerald-100 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8ee2ae] shadow-[0_0_0_3px_rgba(142,226,174,0.3)] animate-pulse" />
                    <span>متصل الآن • رهن إشارتكم 24/7</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={resetConversation}
                  title="محادثة جديدة"
                  className="flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25 transition text-white cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">جديد</span>
                </button>
                {isEmbed && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        window.parent.postMessage({ type: "fne-chat-close" }, "*");
                      } catch (_) { }
                    }}
                    title="تصغير / إغلاق"
                    className="p-1 rounded-lg bg-white/15 hover:bg-white/30 transition text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#fffaf8] px-3 py-4 [background-image:radial-gradient(#eadbd7_0.7px,transparent_0.7px)] [background-size:18px_18px] sm:space-y-4 sm:px-8 sm:py-6 [scrollbar-width:thin] [scrollbar-color:#b51f2b_#f8edeb]">
              <div className="text-center text-[11px] font-semibold text-[#b19f99]">اليوم</div>
              {messages.map((item, index) => (
                <div key={`${item.role}-${index}`} className={`flex items-start gap-2 ${item.role === "customer" ? "justify-start" : "justify-end"}`}>
                  {item.role === "customer" && <UserRound className="mt-1.5 h-4 w-4 shrink-0 text-[#b51f2b] sm:h-5 sm:w-5" />}
                  <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm sm:max-w-[82%] sm:px-5 sm:py-3.5 sm:text-[15px] sm:leading-7 text-justify ${item.role === "customer" ? "rounded-tl-md bg-[#b51f2b] text-white whitespace-pre-wrap" : "rounded-tr-md border border-[#eee2df] bg-white text-[#4f3d39]"}`}>
                    <FormattedMessage content={item.content} isCustomer={item.role === "customer"} />
                    {/* Feedback buttons for assistant messages (skip the welcome message at index 0) */}
                    {item.role === "assistant" && index > 0 && (
                      <div className="mt-2.5 flex items-center gap-2 border-t border-[#f0e8e5] pt-2">
                        {feedbackState[index] ? (
                          <span className="text-[11px] text-[#9b8078]">
                            {feedbackState[index] === "positive" ? "✨ شكراً على تقييمك!" : "💪 شكراً، سنعمل على تحسينه."}
                          </span>
                        ) : (
                          <>
                            <span className="text-[11px] text-[#9b8078]">هل أفادك هذا الجواب؟</span>
                            <button
                              type="button"
                              onClick={() => void sendFeedback(index, "positive")}
                              className="rounded-full border border-[#d6e8d0] bg-[#f4fbf2] px-2 py-0.5 text-[12px] transition hover:bg-[#c9eebd] hover:scale-105"
                              title="مفيد"
                            >
                              👍
                            </button>
                            <button
                              type="button"
                              onClick={() => void sendFeedback(index, "negative")}
                              className="rounded-full border border-[#f0dede] bg-[#fff4f4] px-2 py-0.5 text-[12px] transition hover:bg-[#ffd6d6] hover:scale-105"
                              title="غير كافٍ"
                            >
                              👎
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {item.role === "assistant" && <Bot className="mt-1.5 h-4 w-4 shrink-0 text-[#b51f2b] sm:h-5 sm:w-5" />}
                </div>
              ))}
              {sending && <div className="flex items-center justify-end gap-2.5 text-sm text-[#8b7771]"><Loader2 className="h-4 w-4 animate-spin text-[#b51f2b]" />جاري إعداد الجواب...</div>}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-[#eee2df] bg-white px-3 py-2 sm:p-4 shrink-0">
              {error && <p className="mb-2 text-sm text-[#b51f2b]">{error}</p>}

              {/* Raccourcis permanents : catégories ou questions de la catégorie active en 2 colonnes centrées */}
              <div className="mb-2 sm:mb-2.5 w-full">
                {!showShortcuts ? (
                  <div className="flex items-center justify-center pb-0.5">
                    <button
                      type="button"
                      onClick={() => setShowShortcuts(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#eddcd8] bg-[#fff8f7] px-3 py-1 text-[11px] font-medium text-[#a71928] shadow-2xs hover:bg-[#b51f2b] hover:text-white transition cursor-pointer"
                    >
                      💡 إظهار الاقتراحات والأسئلة الشائعة
                    </button>
                  </div>
                ) : !activeCategory ? (
                  <div>
                    <div className="flex items-center justify-between pb-1 px-1">
                      <span className="text-[11px] text-[#8b7771] font-medium">اختر موضوعاً أو اطرح سؤالك مباشرة:</span>
                      <button
                        type="button"
                        onClick={() => setShowShortcuts(false)}
                        className="text-[11px] text-[#8b7771] hover:text-[#b51f2b] transition cursor-pointer"
                        title="إخفاء الاقتراحات"
                      >
                        إخفاء ✕
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-h-[115px] sm:max-h-[140px] overflow-y-auto px-1 py-0.5 [scrollbar-width:thin] [scrollbar-color:#b51f2b_#f8edeb]">
                      {visibleCategories.map((cat) => (
                        <button
                          key={`chip-cat-${cat.id}`}
                          type="button"
                          onClick={() => {
                            setActiveCategory(cat.id);
                          }}
                          className={`inline-flex items-center justify-center text-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold shadow-xs transition cursor-pointer ${cat.id === "7"
                            ? "border-[#b51f2b] bg-[#b51f2b] text-white hover:bg-[#941a25] shadow-sm"
                            : "border-[#e7c7c5] bg-[#fff8f7] text-[#a71928] hover:bg-[#b51f2b] hover:text-white"
                            }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col w-full gap-2 max-h-[180px] sm:max-h-[240px] overflow-y-auto overscroll-contain px-0.5 py-0.5 [scrollbar-width:thin] [scrollbar-color:#b51f2b_#f8edeb]">
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-1.5 w-full bg-white/95 pb-0.5 backdrop-blur-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCategory(null);
                        }}
                        className="flex-1 justify-center text-center inline-flex items-center gap-1.5 rounded-full bg-[#b51f2b] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#941a25] cursor-pointer"
                      >
                        🔙 القائمة الرئيسية ({MENU_CATEGORIES.find((c) => c.id === activeCategory)?.label})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCategory(null);
                        }}
                        title="إغلاق قائمة الأسئلة"
                        aria-label="إغلاق قائمة الأسئلة"
                        className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-[#b51f2b] transition cursor-pointer text-xs font-bold shrink-0"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Questions & Articles grid on 2 columns - Centered and Responsive */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 w-full">
                      {activeCategory === "6" && newsArticles.length > 0
                        ? newsArticles.map((art, idx) => {
                          const isAlt = (Math.floor(idx / 2) + (idx % 2)) % 2 === 1;
                          const titleClean = art.title.replace(/^•\s*/, "");
                          return (
                            <button
                              key={`chip-art-${art.id || idx}`}
                              type="button"
                              onClick={() => {
                                setActiveCategory(null);
                                void sendMessage(`ما هي تفاصيل بيان: ${titleClean}`);
                              }}
                              disabled={sending}
                              className={`flex items-center justify-start text-right gap-1.5 rounded-xl border p-2 sm:p-2.5 text-[10.5px] sm:text-xs font-semibold leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:scale-[1.01] hover:border-[#b51f2b] hover:bg-[#fff2f0] hover:text-[#b51f2b] disabled:opacity-50 cursor-pointer ${isAlt
                                ? "bg-[#fcf5f3] border-[#eddcd8] text-[#4f3d39]"
                                : "bg-white border-[#e5d8d4] text-[#3d2f2c]"
                                }`}
                            >
                              <span className="text-[#b51f2b] text-xs shrink-0">📌</span>
                              <span className="text-right leading-normal line-clamp-2">{titleClean}</span>
                            </button>
                          );
                        })
                        : MENU_CATEGORIES.find((c) => c.id === activeCategory)?.questions.map((q, idx) => {
                          const isAlt = (Math.floor(idx / 2) + (idx % 2)) % 2 === 1;
                          return (
                            <button
                              key={`chip-q-${idx}`}
                              type="button"
                              onClick={() => {
                                setActiveCategory(null);
                                void sendMessage(activeCategory === "10" ? "10" : q);
                              }}
                              disabled={sending}
                              className={`flex items-center justify-center text-center gap-1 sm:gap-1.5 rounded-xl border p-2 sm:p-2.5 text-[10.5px] sm:text-xs font-semibold leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:scale-[1.01] hover:border-[#b51f2b] hover:bg-[#fff2f0] hover:text-[#b51f2b] disabled:opacity-50 cursor-pointer ${isAlt
                                ? "bg-[#fcf5f3] border-[#eddcd8] text-[#4f3d39]"
                                : "bg-white border-[#e5d8d4] text-[#3d2f2c]"
                                }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isAlt ? "bg-[#b51f2b]" : "bg-[#8c1922]"}`} />
                              <span className="text-center leading-normal">{q}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(message);
                    }
                  }}
                  rows={1}
                  maxLength={10000}
                  placeholder="اكتبوا سؤالكم هنا أو اضغطوا على الاختيارات..."
                  className="min-h-11 flex-1 resize-none rounded-xl border border-[#dfd0cc] px-3 py-2.5 text-sm leading-6 outline-none transition placeholder:text-[#b6a5a0] focus:border-[#b51f2b] focus:ring-2 focus:ring-[#b51f2b]/15 sm:min-h-12 sm:px-4 sm:py-3"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage(message)}
                  disabled={sending}
                  title="إرسال الرسالة"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#b51f2b] text-white shadow-sm transition hover:bg-[#941a25] disabled:cursor-wait disabled:opacity-60 sm:h-12 sm:w-12"
                >
                  <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </form>

              {/* Footer disclaimer and Telegram link */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0e4e1] pt-2 text-[11px] text-[#8b7771]">
                <button
                  type="button"
                  onClick={() => setShowDisclaimer((prev) => !prev)}
                  className="inline-flex items-center gap-1 font-semibold text-[#a71928] hover:underline"
                >
                  <span>⚖️</span>
                  <span>توجيه تنظيمي وإخلاء مسؤولية</span>
                </button>
                <div className="inline-flex items-center gap-1 text-[11px] text-[#78615c]">
                  <span>💡 لتجربة أكثر سلاسة:</span>
                  <a
                    href="https://t.me/askfne_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[#b51f2b] underline hover:text-[#7d121c]"
                  >
                    تيليغرام
                  </a>
                </div>
              </div>

              {showDisclaimer && (
                <div className="mt-2 rounded-xl border border-[#ecd7d3] bg-[#fff8f7] p-3 text-xs leading-5 text-[#5e4b47] shadow-sm text-justify">
                  <div className="font-bold text-[#b51f2b] mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span>⚖️</span>
                      <span>توجيه تنظيمي وإخلاء مسؤولية:</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDisclaimer(false)}
                      className="text-[#a71928] hover:text-black font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="mb-2">
                    يندرج هذا المساعد الرقمي التفاعلي ضمن الخدمات الرقمية الحديثة للجامعة الوطنية للتعليم FNE لتيسير الولوج السريع للمعلومة وتقديم التوجيه النقابي والإداري الأولي للاستئناس. وتظل النصوص القانونية الصادرة في الجريدة الرسمية، والبلاغات والبيانات والمذكرات الصادرة عن الأجهزة التقريرية والتنفيذية للجامعة، هي المرجع المعتمد والملزم نقابياً وإدارياً.
                  </p>
                  <p className="text-[11px] text-[#78615c]">
                    في الملفات الفردية الدقيقة، يُرجى مراجعة منشورات الجامعة والتواصل المباشر مع مكاتبها النقابية أو طلب فتح تذكرة عبر هذا الشات.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>

      </div>
    </main>
  );
}

export default function WebChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center bg-[#fffaf8]">
          <Loader2 className="h-8 w-8 animate-spin text-[#059669]" />
        </div>
      }
    >
      <WebChatContent />
    </Suspense>
  );
}
