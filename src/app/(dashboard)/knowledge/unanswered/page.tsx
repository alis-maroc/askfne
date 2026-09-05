"use client";

import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import {
  HelpCircle,
  Search,
  MessageSquare,
  Calendar,
  Loader2,
  BookPlus,
  X,
  Radio,
  Sparkles,
  RefreshCw,
  Trash2,
  Send,
  CheckCircle2,
  CheckSquare,
  Square,
  AlertTriangle,
  RotateCcw,
  Scale,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface UnansweredQuestion {
  question: string;
  count: number;
  channels: string[];
  firstAskedAt: string;
  lastAskedAt: string;
  lastResponse: string;
  conversationId: string;
  customerName: string;
  customerContact?: string | null;
  sourceType?: "manual" | "refusal" | "feedback" | "external_ai";
  externalAiAnswer?: string | null;
  isHeld?: boolean;
  holdingId?: string | null;
  holdingMessage?: string | null;
  holdingUpdatedAt?: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
  color: string;
}

export default function UnansweredQuestionsPage() {
  const [questions, setQuestions] = useState<UnansweredQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // "all" | "today" | "week" | "month"
  const [frequencyFilter, setFrequencyFilter] = useState("all"); // "all" | "multiple" | "high" | "single"
  const [sourceFilter, setSourceFilter] = useState("all"); // "all" | "manual" | "refusal" | "feedback"
  const [sortBy, setSortBy] = useState("count-desc"); // "count-desc" | "date-desc" | "date-asc" | "count-asc"

  // Bulk selection state
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Add / Draft Knowledge modal state
  const [selectedQuestion, setSelectedQuestion] = useState<UnansweredQuestion | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState(10);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

  // AI draft states
  const [draftingKey, setDraftingKey] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  // Re-check against Knowledge Base states
  const [recheckingKey, setRecheckingKey] = useState<string | null>(null);
  const [recheckResult, setRecheckResult] = useState<{
    question: UnansweredQuestion;
    answer: string;
    hasAnswer: boolean;
    message: string;
  } | null>(null);
  const [recheckResolving, setRecheckResolving] = useState(false);
  const [recheckNotifyWa, setRecheckNotifyWa] = useState(true);

  // Warning & Holding modal state
  const [warningQuestion, setWarningQuestion] = useState<UnansweredQuestion | null>(null);
  const [warnCustomerMessage, setWarnCustomerMessage] = useState("");
  const [holdingDisclaimerText, setHoldingDisclaimerText] = useState("");
  const [warnNotifyCustomer, setWarnNotifyCustomer] = useState(true);
  const [warnEnableHolding, setWarnEnableHolding] = useState(true);
  const [warnSubmitting, setWarnSubmitting] = useState(false);
  const [warnLifting, setWarnLifting] = useState(false);
  const [warnSuccess, setWarnSuccess] = useState("");

  // Controlled expand/collapse for long answers in unanswered list
  const [expandedResponseKeys, setExpandedResponseKeys] = useState<Set<string>>(new Set());

  function toggleExpandResponse(key: string) {
    setExpandedResponseKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Compare with/without External AI state
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareQuestion, setCompareQuestion] = useState("");
  const [compareTargetItem, setCompareTargetItem] = useState<UnansweredQuestion | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMode, setCompareMode] = useState<"both" | "local_only" | "external_only">("both");
  const [compareData, setCompareData] = useState<{
    question: string;
    local: {
      answer: string;
      hasAnswer: boolean;
      status: "found_in_kb" | "refusal";
      message: string;
    } | null;
    external: {
      answer: string;
      hasAnswer: boolean;
      provider: string;
      model: string;
      status: "generated" | "disabled" | "failed";
      message: string;
    } | null;
    differenceSummary: string;
  } | null>(null);

  function openCompareModal(item: UnansweredQuestion | null) {
    if (item) {
      setCompareTargetItem(item);
      setCompareQuestion(item.question);
      setCompareData(null);
      setCompareModalOpen(true);
      void runCompare(item.question, "both");
    } else {
      setCompareTargetItem(null);
      setCompareQuestion("");
      setCompareData(null);
      setCompareModalOpen(true);
    }
  }

  async function runCompare(questionToTest: string, mode: "both" | "local_only" | "external_only" = "both") {
    const q = questionToTest.trim();
    if (!q) return;

    setCompareLoading(true);
    setCompareMode(mode);
    try {
      const res = await fetch("/api/knowledge/unanswered/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, mode }),
      });

      if (res.ok) {
        const data = await res.json();
        setCompareData(data);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "تعذر إجراء اختبار المقارنة");
      }
    } catch (e) {
      console.error("Failed to run comparison:", e);
      alert("حدث خطأ أثناء إجراء المقارنة");
    } finally {
      setCompareLoading(false);
    }
  }

  function handleAdoptExternalAnswerToKnowledge() {
    if (!compareData?.external?.answer) return;

    const baseItem: UnansweredQuestion = compareTargetItem || {
      question: compareQuestion,
      count: 1,
      channels: ["web"],
      firstAskedAt: new Date().toISOString(),
      lastAskedAt: new Date().toISOString(),
      lastResponse: compareData.external.answer,
      conversationId: "",
      customerName: "اختبار مقارنة",
    };

    setCompareModalOpen(false);

    const cleanText = compareData.external.answer
      .replace(/\n\n> ⚠️ \*\*تنبيه:\*\* هذه المعطيات استرشادية[\s\S]*$/, "")
      .replace(/\n\n> ⚠️ \*\*Avertissement :\*\* Ces données sont fournies à titre indicatif[\s\S]*$/, "")
      .trim();

    setSelectedQuestion(baseItem);
    setTitle(compareQuestion.slice(0, 120));
    setContent(cleanText);
    setPriority(10);
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resQuestions, resCats] = await Promise.all([
        fetch("/api/knowledge/unanswered"),
        fetch("/api/knowledge/categories"),
      ]);

      if (resQuestions.ok) {
        const qData = await resQuestions.json();
        setQuestions(qData.data || []);
      }

      if (resCats.ok) {
        const cData = await resCats.json();
        const cats = Array.isArray(cData) ? cData : cData.data || [];
        setCategories(cats);
        if (cats.length > 0 && !categoryId) setCategoryId(cats[0].id);
      }
    } catch (err) {
      console.error("Failed to load unanswered questions:", err);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Toggle single question selection
  function toggleSelectQuestion(qText: string) {
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(qText)) next.delete(qText);
      else next.add(qText);
      return next;
    });
  }

  // Toggle select all visible
  function toggleSelectAll() {
    if (selectedQuestions.size === filtered.length && filtered.length > 0) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(filtered.map((q) => q.question)));
    }
  }

  // Bulk delete selected questions
  async function handleBulkDelete() {
    if (selectedQuestions.size === 0) return;
    const count = selectedQuestions.size;
    if (!confirm(`هل أنت متأكد من حذف وتجاهل (${count}) أسئلة محددة دفعة واحدة؟`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/knowledge/unanswered", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: Array.from(selectedQuestions) }),
      });

      if (res.ok) {
        setQuestions((prev) => prev.filter((q) => !selectedQuestions.has(q.question)));
        setSelectedQuestions(new Set());
      } else {
        alert("فشل حذف الأسئلة المحددة");
      }
    } catch (err) {
      console.error("Failed bulk delete:", err);
    } finally {
      setBulkDeleting(false);
    }
  }

  function openAddToKnowledgeModal(item: UnansweredQuestion) {
    setSelectedQuestion(item);
    setTitle(item.question);
    const prefill = item.externalAiAnswer || (item.sourceType === "external_ai" ? item.lastResponse : "");
    setContent(prefill ? prefill.replace(/\n\n> ⚠️ \*\*تنبيه:\*\*[\s\S]*$/, "").trim() : "");
    setPriority(10);
    setSuccessMessage("");
    setNotifyWhatsApp(item.channels.includes("whatsapp") && !!item.customerContact);
  }

  async function handleGenerateDraft(item: UnansweredQuestion) {
    setDraftingKey(item.question);
    try {
      const res = await fetch("/api/knowledge/unanswered/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: item.question,
          conversationId: item.conversationId,
        }),
      });

      if (res.ok) {
        const { draft } = await res.json();
        setSelectedQuestion(item);
        setTitle(draft.title || item.question);
        setContent(draft.content || "");
        if (draft.categoryId) setCategoryId(draft.categoryId);
        setPriority(draft.priority || 10);
        setNotifyWhatsApp(item.channels.includes("whatsapp") && !!item.customerContact);
        setSuccessMessage("");
      } else {
        openAddToKnowledgeModal(item);
      }
    } catch (err) {
      console.error("Failed to generate AI draft:", err);
      openAddToKnowledgeModal(item);
    } finally {
      setDraftingKey(null);
    }
  }

  async function handleRegenerateDraft() {
    if (!selectedQuestion) return;
    setIsGeneratingDraft(true);
    try {
      const res = await fetch("/api/knowledge/unanswered/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: selectedQuestion.question,
          conversationId: selectedQuestion.conversationId,
        }),
      });

      if (res.ok) {
        const { draft } = await res.json();
        setTitle(draft.title || selectedQuestion.question);
        setContent(draft.content || "");
        if (draft.categoryId) setCategoryId(draft.categoryId);
        setPriority(draft.priority || 10);
      }
    } catch (err) {
      console.error("Failed to re-generate AI draft:", err);
    } finally {
      setIsGeneratingDraft(false);
    }
  }

  // Re-check question against latest Knowledge Base
  async function handleRecheck(item: UnansweredQuestion) {
    setRecheckingKey(item.question);
    try {
      const res = await fetch("/api/knowledge/unanswered/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: item.question,
          conversationId: item.conversationId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRecheckResult({
          question: item,
          answer: data.answer || "",
          hasAnswer: data.hasAnswer === true,
          message: data.message || "",
        });
        setRecheckNotifyWa(item.channels.includes("whatsapp") && !!item.customerContact);
      } else {
        alert("تعذر إعادة اختبار السؤال، تأكد من اتصال الخادم.");
      }
    } catch (err) {
      console.error("Failed to recheck:", err);
    } finally {
      setRecheckingKey(null);
    }
  }

  // Approve rechecked answer and resolve question
  async function handleApproveRecheckResolution() {
    if (!recheckResult || !recheckResult.hasAnswer) return;

    setRecheckResolving(true);
    try {
      const res = await fetch("/api/knowledge/unanswered/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: recheckResult.question.question,
          title: recheckResult.question.question,
          content: recheckResult.answer,
          categoryId: categoryId || categories[0]?.id || "",
          priority: 10,
          conversationId: recheckResult.question.conversationId,
          notifyUser: recheckNotifyWa,
        }),
      });

      if (res.ok) {
        const answeredQ = recheckResult.question.question;
        setQuestions((prev) => prev.filter((q) => q.question !== answeredQ));
        setRecheckResult(null);
      } else {
        alert("تعذر اعتماد الجواب");
      }
    } catch (err) {
      console.error("Failed to resolve rechecked question:", err);
    } finally {
      setRecheckResolving(false);
    }
  }

  async function handleDismiss(item: UnansweredQuestion) {
    const key = item.question;
    setDismissingKey(key);
    try {
      const res = await fetch("/api/knowledge/unanswered", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: item.question, conversationId: item.conversationId }),
      });
      if (res.ok) {
        setQuestions((prev) => prev.filter((q) => q.question !== key));
        setSelectedQuestions((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to dismiss:", err);
    } finally {
      setDismissingKey(null);
    }
  }

  function openWarningModal(item: UnansweredQuestion) {
    setWarningQuestion(item);
    setWarnNotifyCustomer(Boolean(item.customerContact));
    setWarnEnableHolding(true);
    setWarnSuccess("");

    const customerGreeting =
      item.customerName && item.customerName !== "منخرط" && item.customerName !== "Unknown"
        ? ` ${item.customerName}`
        : "";

    const defaultMsg = [
      "⚠️ *تنبيه وتصويب هام من الجامعة الوطنية للتعليم FNE* 🕊️",
      "",
      `تحية نضالية رفيقي/رفيقتي${customerGreeting}،`,
      "نحيطكم علماً بأن الجواب الآلي الذي تم تقديمه سابقاً بخصوص استفساركم:",
      `« *${item.question.trim()}* »`,
      "هو جواب غير دقيق أو شابته بعض النواقص، ونرجو منكم التفضل بعدم الأخذ به أو الاعتماد عليه.",
      "",
      "📌 *المتابعة الجارية:*",
      "الموضوع قيد التدقيق والمراجعة الإدارية والنقابية مع الهياكل والمكاتب المختصة لضبط المعطيات الرسمية والنهائية، وبمجرد التوصل بالجواب الشامل والدقيق سنوافيكم به مباشرة هنا.",
      "",
      "نعتذر لكم عن هذا اللبس غير المقصود، ونحن دائماً في خدمتكم وإشارتكم!",
      "✊ عاشت الجامعة الوطنية للتعليم FNE صامدة ومناضلة.",
    ].join("\n");
    setWarnCustomerMessage(defaultMsg);

    const defaultHolding =
      item.holdingMessage ||
      [
        "⚠️ *تنبيه وتوضيح من الجامعة الوطنية للتعليم FNE* 🕊️",
        "",
        `بخصوص الاستفسار حول: « *${item.question.trim()}* »`,
        "",
        "نحيطكم علماً بأن هذا الموضوع قيد التدقيق والتحري الإداري والنقابي حالياً لضبط المعطيات الرسمية الدقيقة والمعتمدة من الهياكل المختصة.",
        "نرجو عدم اعتماد أي أجوبة سابقة أو غير رسمية، وسيتم تزويدكم بالجواب الرسمي الشامل فور نشره في قاعدة المعرفة.",
        "",
        "✊ الجامعة الوطنية للتعليم FNE في خدمتكم دائماً.",
      ].join("\n");
    setHoldingDisclaimerText(defaultHolding);
  }

  async function handleSendWarningAndHold(e: React.FormEvent) {
    e.preventDefault();
    if (!warningQuestion) return;

    setWarnSubmitting(true);
    setWarnSuccess("");

    try {
      const res = await fetch("/api/knowledge/unanswered/warn-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: warningQuestion.question,
          conversationId: warningQuestion.conversationId,
          customMessage: warnCustomerMessage,
          holdingDisclaimer: holdingDisclaimerText,
          notifyCustomer: warnNotifyCustomer,
          enableHolding: warnEnableHolding,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setWarnSuccess(data.message || "✅ تم إرسال الإشعار وتفعيل الرد التوقيفي بنجاح!");
        setQuestions((prev) =>
          prev.map((q) =>
            q.question === warningQuestion.question
              ? {
                  ...q,
                  isHeld: warnEnableHolding,
                  holdingMessage: warnEnableHolding ? holdingDisclaimerText : null,
                  holdingId: data.holdingId || q.holdingId,
                }
              : q
          )
        );
        setTimeout(() => {
          setWarningQuestion(null);
          setWarnSuccess("");
        }, 1600);
      } else {
        const err = await res.json().catch(() => ({ error: "فشل الإرسال" }));
        alert(err.error || "فشل إرسال الإشعار وتفعيل التجميد");
      }
    } catch (err) {
      console.error("Failed to send warning & hold:", err);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setWarnSubmitting(false);
    }
  }

  async function handleLiftHold() {
    if (!warningQuestion) return;
    if (!confirm("هل أنت متأكد من رغبتك في رفع التعليق وإلغاء الرد التوقيفي لهذا السؤال؟")) return;

    setWarnLifting(true);
    try {
      const res = await fetch("/api/knowledge/unanswered/warn-correction", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: warningQuestion.question,
          holdingId: warningQuestion.holdingId,
        }),
      });

      if (res.ok) {
        setQuestions((prev) =>
          prev.map((q) =>
            q.question === warningQuestion.question
              ? { ...q, isHeld: false, holdingMessage: null, holdingId: null }
              : q
          )
        );
        setWarningQuestion(null);
      } else {
        alert("تعذر رفع التعليق");
      }
    } catch (err) {
      console.error("Failed to lift hold:", err);
    } finally {
      setWarnLifting(false);
    }
  }

  async function handleSaveKnowledgeEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedQuestion || !title.trim() || !content.trim() || !categoryId) return;

    setSaving(true);
    try {
      const res = await fetch("/api/knowledge/unanswered/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: selectedQuestion.question,
          title: title.trim(),
          content: content.trim(),
          categoryId,
          priority,
          conversationId: selectedQuestion.conversationId,
          notifyUser: notifyWhatsApp,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.userNotified) {
          setSuccessMessage("✅ تم حفظ المقال في قاعدة المعرفة وإرسال الإشعار للمنخرط عبر واتساب بنجاح! 🕊️");
        } else {
          setSuccessMessage("✅ تمت إضافة المقال بنجاح إلى قاعدة المعرفة!");
        }

        const answeredQuestion = selectedQuestion.question;
        setTimeout(() => {
          setSelectedQuestion(null);
          setSuccessMessage("");
          setQuestions((prev) => prev.filter((q) => q.question !== answeredQuestion));
          setSelectedQuestions((prev) => {
            const next = new Set(prev);
            next.delete(answeredQuestion);
            return next;
          });
        }, 1500);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "تعذر حفظ المقال");
      }
    } catch (err) {
      console.error("Failed to add entry:", err);
    } finally {
      setSaving(false);
    }
  }

  const filtered = questions
    .filter((item) => {
      const matchesSearch =
        item.question.toLowerCase().includes(search.toLowerCase()) ||
        item.customerName.toLowerCase().includes(search.toLowerCase()) ||
        (item.customerContact && item.customerContact.toLowerCase().includes(search.toLowerCase()));

      const matchesChannel =
        channelFilter === "all" || item.channels.includes(channelFilter);

      // Date filter
      let matchesDate = true;
      if (dateFilter !== "all") {
        const askedDate = new Date(item.lastAskedAt).getTime();
        const now = Date.now();
        const diffHours = (now - askedDate) / (1000 * 60 * 60);

        if (dateFilter === "today") {
          matchesDate = diffHours <= 24;
        } else if (dateFilter === "week") {
          matchesDate = diffHours <= 24 * 7;
        } else if (dateFilter === "month") {
          matchesDate = diffHours <= 24 * 30;
        }
      }

      // Frequency filter (عدد المرات)
      let matchesFrequency = true;
      if (frequencyFilter === "multiple") {
        matchesFrequency = item.count >= 2;
      } else if (frequencyFilter === "high") {
        matchesFrequency = item.count >= 3;
      } else if (frequencyFilter === "single") {
        matchesFrequency = item.count === 1;
      }

      // Source filter
      let matchesSource = true;
      if (sourceFilter !== "all") {
        if (sourceFilter === "manual") {
          matchesSource = item.sourceType === "manual";
        } else if (sourceFilter === "refusal") {
          matchesSource = item.sourceType === "refusal" || !item.sourceType;
        } else if (sourceFilter === "feedback") {
          matchesSource = item.sourceType === "feedback";
        } else if (sourceFilter === "external_ai") {
          matchesSource = item.sourceType === "external_ai";
        }
      }

      return matchesSearch && matchesChannel && matchesDate && matchesFrequency && matchesSource;
    })
    .sort((a, b) => {
      if (sortBy === "count-desc") {
        return b.count - a.count || new Date(b.lastAskedAt).getTime() - new Date(a.lastAskedAt).getTime();
      }
      if (sortBy === "count-asc") {
        return a.count - b.count || new Date(b.lastAskedAt).getTime() - new Date(a.lastAskedAt).getTime();
      }
      if (sortBy === "date-desc") {
        return new Date(b.lastAskedAt).getTime() - new Date(a.lastAskedAt).getTime();
      }
      if (sortBy === "date-asc") {
        return new Date(a.lastAskedAt).getTime() - new Date(b.lastAskedAt).getTime();
      }
      return 0;
    });

  const totalOccurrences = questions.reduce((sum, q) => sum + q.count, 0);
  const externalAiQuestionsCount = questions.filter((q) => q.sourceType === "external_ai").length;
  const isAllSelected = filtered.length > 0 && selectedQuestions.size === filtered.length;
  const hasActiveFilters =
    dateFilter !== "all" ||
    frequencyFilter !== "all" ||
    sourceFilter !== "all" ||
    channelFilter !== "all" ||
    search !== "" ||
    sortBy !== "count-desc";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-owly-bg">
      <Header
        title="الأسئلة غير المجابة (Knowledge Gaps)"
        description="استكشف الأسئلة التي لم يجد لها المساعد الذكي إجابة، أعد اختبارها بعد تحديث قاعدة المعرفة أو ولّد إجاباتها واحذف المكرر بضغطة زر"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-owly-surface border border-owly-border rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
              <HelpCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-owly-text-light font-medium">أسئلة فريدة تحتاج تدقيقاً</p>
              <h3 className="text-2xl font-bold text-owly-text mt-0.5">
                {filtered.length}
                {filtered.length !== questions.length && (
                  <span className="text-xs font-normal text-owly-text-light mr-1.5">
                    من أصل {questions.length}
                  </span>
                )}
              </h3>
            </div>
          </div>

          <div
            onClick={() => setSourceFilter(sourceFilter === "external_ai" ? "all" : "external_ai")}
            className={cn(
              "bg-owly-surface border rounded-xl p-4 flex items-center gap-4 shadow-sm cursor-pointer transition",
              sourceFilter === "external_ai"
                ? "border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/10"
                : "border-owly-border hover:border-purple-400/50"
            )}
            title="انقر لتصفية أسئلة الذكاء الخارجي"
          >
            <div className="p-3 bg-purple-500/10 text-purple-600 rounded-xl">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-owly-text-light font-medium">إجابات الذكاء الخارجي (IA Externe)</p>
              <h3 className="text-2xl font-bold text-purple-600 mt-0.5">
                {externalAiQuestionsCount}
              </h3>
            </div>
          </div>

          <div className="bg-owly-surface border border-owly-border rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-red-500/10 text-red-600 rounded-xl">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-owly-text-light font-medium">إجمالي التكرار للمنخرطين</p>
              <h3 className="text-2xl font-bold text-owly-text mt-0.5">{totalOccurrences}</h3>
            </div>
          </div>

          <div className="bg-owly-surface border border-owly-border rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-owly-text-light font-medium">حالة التغطية وسرعة الرد</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-0.5">
                {questions.length > 0 ? "إعادة فحص + توليد متوفر ✨" : "مكتملة 100% 🕊️"}
              </h3>
            </div>
          </div>
        </div>

        {/* Toolbar & Multi-Criteria Filters */}
        <div className="bg-owly-surface border border-owly-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-owly-text-light" />
              <input
                type="text"
                placeholder="البحث في الأسئلة أو اسم المنخرط..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-owly-bg border border-owly-border rounded-lg outline-none focus:border-owly-primary transition text-owly-text placeholder:text-owly-text-light"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                aria-label="Filtrer par canal"
                className="px-3 py-2 text-sm bg-owly-bg border border-owly-border rounded-lg outline-none text-owly-text"
              >
                <option value="all">جميع القنوات (Channels)</option>
                <option value="web">Web Chat</option>
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearch("");
                    setChannelFilter("all");
                    setDateFilter("all");
                    setFrequencyFilter("all");
                    setSourceFilter("all");
                    setSortBy("count-desc");
                  }}
                  className="px-2.5 py-2 text-xs font-medium text-owly-text-light hover:text-owly-text border border-owly-border rounded-lg hover:bg-owly-bg transition"
                  title="إلغاء كل الفلاتر"
                >
                  إعادة ضبط
                </button>
              )}

              <button
                onClick={() => void fetchData()}
                disabled={loading}
                className="p-2 border border-owly-border hover:bg-owly-bg rounded-lg text-owly-text transition"
                title="تحديث"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </button>

              <button
                onClick={() => openCompareModal(null)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-sm transition"
                title="اختبار ومقارنة أي سؤال مع وبدون الذكاء الخارجي لرؤية الفرق مباشرة"
              >
                <Scale className="h-4 w-4" />
                <span className="hidden sm:inline">اختبار ومقارنة (مع/بدون IA)</span>
              </button>
            </div>
          </div>

          {/* Secondary Filters: Date, Frequency, Source, Sort */}
          <div className="pt-3 border-t border-owly-border grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-owly-text-light mb-1">
                📅 التاريخ
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                aria-label="Filtrer par date"
                className="w-full px-2.5 py-1.5 text-xs bg-owly-bg border border-owly-border rounded-lg outline-none text-owly-text focus:border-owly-primary transition"
              >
                <option value="all">كل التواريخ (All)</option>
                <option value="today">اليوم (آخر 24 ساعة)</option>
                <option value="week">آخر 7 أيام</option>
                <option value="month">آخر 30 يوماً</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-owly-text-light mb-1">
                🔢 عدد المرات (التكرار)
              </label>
              <select
                value={frequencyFilter}
                onChange={(e) => setFrequencyFilter(e.target.value)}
                aria-label="Filtrer par fréquence"
                className="w-full px-2.5 py-1.5 text-xs bg-owly-bg border border-owly-border rounded-lg outline-none text-owly-text focus:border-owly-primary transition"
              >
                <option value="all">كل التكرارات (All)</option>
                <option value="multiple">مكرر (≥ 2 مرات)</option>
                <option value="high">شديد التكرار (≥ 3 مرات)</option>
                <option value="single">مرة واحدة فقط (1)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-owly-text-light mb-1">
                🏷️ نوع ومصدر الرصد
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                aria-label="Filtrer par source"
                className="w-full px-2.5 py-1.5 text-xs bg-owly-bg border border-owly-border rounded-lg outline-none text-owly-text focus:border-owly-primary transition"
              >
                <option value="all">كل المصادر (All)</option>
                <option value="external_ai">✨ إجابات الذكاء الخارجي (IA Externe)</option>
                <option value="manual">✍️ تحويل يدوي فقط</option>
                <option value="refusal">🤖 غياب معلومة تلقائي</option>
                <option value="feedback">👎 تقييم سلبي من المنخرط</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-owly-text-light mb-1">
                ↕️ الترتيب
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Trier par"
                className="w-full px-2.5 py-1.5 text-xs bg-owly-bg border border-owly-border rounded-lg outline-none text-owly-text focus:border-owly-primary transition"
              >
                <option value="count-desc">الأكثر تكراراً أولاً</option>
                <option value="date-desc">الأحدث تاريخاً أولاً</option>
                <option value="date-asc">الأقدم تاريخاً أولاً</option>
                <option value="count-asc">الأقل تكراراً</option>
              </select>
            </div>
          </div>

          {/* Bulk Selection Action Bar */}
          {selectedQuestions.size > 0 && (
            <div className="pt-2 border-t border-owly-border flex items-center justify-between bg-red-500/5 px-3 py-2 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 text-xs font-bold text-owly-text">
                <CheckSquare className="h-4 w-4 text-owly-primary" />
                <span>تم تحديد ({selectedQuestions.size}) أسئلة</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedQuestions(new Set())}
                  className="px-2.5 py-1 text-xs text-owly-text-light hover:text-owly-text font-medium"
                >
                  إلغاء التحديد
                </button>
                <button
                  onClick={() => void handleBulkDelete()}
                  disabled={bulkDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span>حذف المحدد في دفعة واحدة ({selectedQuestions.size})</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Questions List */}
        <div className="bg-owly-surface border border-owly-border rounded-xl overflow-hidden shadow-sm">
          {/* Header Row with Select All */}
          {filtered.length > 0 && (
            <div className="p-3 px-4 sm:px-5 bg-owly-bg border-b border-owly-border flex items-center justify-between text-xs font-bold text-owly-text-light">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 hover:text-owly-text transition"
                >
                  {isAllSelected ? (
                    <CheckSquare className="h-4 w-4 text-owly-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-owly-text-light" />
                  )}
                  <span>{isAllSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}</span>
                </button>
                <span>({filtered.length} سؤال متاح)</span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-owly-primary" />
              <p className="text-sm text-owly-text-light">جاري استخراج وتصفية الأسئلة غير المجابة...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center px-4">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-60" />
              <h4 className="text-base font-semibold text-owly-text">لا توجد أسئلة معلقة بدون جواب</h4>
              <p className="text-xs text-owly-text-light mt-1 max-w-sm mx-auto">
                ممتاز! جميع الأسئلة المطروحة تمت معالجتها بدقة وتصفيتها من التحيات والعبارات المتكررة.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-owly-border">
              {filtered.map((item, idx) => {
                const isSelected = selectedQuestions.has(item.question);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "p-4 sm:p-5 hover:bg-owly-bg/40 transition flex flex-col gap-3.5",
                      isSelected && "bg-owly-primary/5"
                    )}
                  >
                    {/* 1. Header Row: Checkbox + Question + Badges + Primary Action Buttons */}
                    <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button
                          onClick={() => toggleSelectQuestion(item.question)}
                          className="mt-1 text-owly-text-light hover:text-owly-text transition shrink-0"
                          title={isSelected ? "إلغاء التحديد" : "تحديد"}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-owly-primary" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>

                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base text-owly-text break-words">
                              {item.question}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              {item.count} {item.count > 1 ? "مرات" : "مرة"}
                            </span>
                            {item.sourceType === "external_ai" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-800 shadow-xs">
                                ✨ إجابة ذكاء خارجي (IA Externe)
                              </span>
                            )}
                            {item.sourceType === "manual" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                ✍️ تحويل يدوي
                              </span>
                            )}
                            {item.sourceType === "feedback" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                👎 تقييم سلبي
                              </span>
                            )}
                            {item.sourceType === "refusal" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                🤖 غياب معلومة
                              </span>
                            )}
                            {item.customerContact && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {item.customerContact}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Top Right: Primary 1-Click Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => openAddToKnowledgeModal(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
                          title="إضافة واعتماد الإجابة في قاعدة المعرفة"
                        >
                          <BookPlus className="h-3.5 w-3.5" />
                          <span>إضافة للقاعدة</span>
                        </button>

                        <button
                          onClick={() => openCompareModal(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-sm transition"
                          title="مقارنة الجواب مع وبدون الذكاء الخارجي"
                        >
                          <Scale className="h-3.5 w-3.5 text-purple-600" />
                          <span>مقارنة (مع/بدون IA)</span>
                        </button>

                        <button
                          onClick={() => void handleDismiss(item)}
                          disabled={dismissingKey === item.question}
                          title="حذف / تجاهل هذا السؤال"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition disabled:opacity-50"
                        >
                          {dismissingKey === item.question ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 2. Full-Width Middle Row: AI Response Box (w-full, spacious, RTL formatted) */}
                    {item.lastResponse && (
                      <div className="w-full" dir="rtl">
                        <div className={cn(
                          "text-xs rounded-xl border overflow-hidden transition-all text-right",
                          item.sourceType === "external_ai"
                            ? "bg-purple-50/40 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/60"
                            : "bg-owly-bg border-owly-border/60"
                        )}>
                          {item.sourceType === "external_ai" ? (
                            <div>
                              <div className="px-3.5 py-2 bg-purple-100/60 dark:bg-purple-900/30 border-b border-purple-200/60 dark:border-purple-800/40 flex items-center justify-between gap-2 flex-wrap" dir="rtl">
                                <span className="font-bold text-[11px] text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                                  <span>الرد المقترح من الذكاء الخارجي (Gemini) :</span>
                                </span>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandResponse(item.question)}
                                    className="text-[11px] font-bold text-purple-700 hover:text-purple-900 dark:text-purple-300 inline-flex items-center gap-1 transition cursor-pointer"
                                  >
                                    {expandedResponseKeys.has(item.question) ? (
                                      <>
                                        <ChevronUp className="h-3.5 w-3.5" />
                                        <span>طي الرد (Réduire)</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-3.5 w-3.5" />
                                        <span>عرض الرد كاملاً (Afficher tout)</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openAddToKnowledgeModal(item)}
                                    className="px-2.5 py-1 text-[11px] font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-md shadow-xs transition inline-flex items-center gap-1"
                                    title="اعتماد هذا الجواب وحفظه في قاعدة المعرفة"
                                  >
                                    <BookPlus className="h-3 w-3" />
                                    <span>اعتماد في القاعدة</span>
                                  </button>
                                </div>
                              </div>

                              <div className="p-3.5 text-right" dir="rtl">
                                {expandedResponseKeys.has(item.question) ? (
                                  <div className="max-h-80 overflow-y-auto overflow-x-auto text-xs text-owly-text leading-relaxed whitespace-pre-wrap rounded-lg bg-owly-surface/90 border border-owly-border/50 p-4 shadow-inner font-sans text-right" dir="rtl">
                                    {item.lastResponse}
                                  </div>
                                ) : (
                                  <p className="text-xs leading-relaxed text-owly-text line-clamp-2 text-right" dir="rtl">
                                    {item.lastResponse}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="px-3.5 py-2 flex items-center justify-between gap-2 text-right" dir="rtl">
                              <p className="line-clamp-1 italic text-xs text-owly-text-light/80 text-right" dir="rtl">
                                جواب المساعد السابق: "{item.lastResponse}"
                              </p>
                              {item.lastResponse.length > 80 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandResponse(item.question)}
                                  className="text-[10px] text-owly-primary hover:underline shrink-0"
                                >
                                  {expandedResponseKeys.has(item.question) ? "طي" : "عرض"}
                                </button>
                              )}
                            </div>
                          )}

                          {item.sourceType !== "external_ai" && expandedResponseKeys.has(item.question) && (
                            <div className="p-3 pt-0 text-xs text-owly-text leading-6 whitespace-pre-wrap max-h-48 overflow-y-auto text-right" dir="rtl">
                              {item.lastResponse}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Holding Notice if active */}
                    {item.isHeld && (
                      <div className="flex items-center gap-2 text-xs bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-3.5 py-2 rounded-xl">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span className="font-semibold">
                          ⚠️ معلّق: تم إرسال تنبيه بتصويب الجواب، والرد التوقيفي مفعّل تلقائياً لأي سائل جديد حتى توفر الجواب الرسمي
                        </span>
                      </div>
                    )}

                    {/* 3. Bottom Row: Metadata & Secondary Tools */}
                    <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-owly-border/40 text-xs text-owly-text-light flex-wrap">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Radio className="h-3.5 w-3.5" />
                          {item.channels.join(", ")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          آخر سؤال: {new Date(item.lastAskedAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {item.conversationId && (
                          <Link
                            href={`/conversations?id=${item.conversationId}`}
                            className="text-owly-primary hover:underline font-semibold"
                          >
                            عرض المحادثة
                          </Link>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Secondary Tools: Warning/Hold, Recheck, AI Draft, Manual */}
                        <button
                          onClick={() => openWarningModal(item)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition border",
                            item.isHeld
                              ? "text-amber-900 bg-amber-100 hover:bg-amber-200 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                              : "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                          )}
                          title="تصويب الجواب أو تجميد السؤال"
                        >
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                          <span>{item.isHeld ? "معلّق (تعديل)" : "تصويب وتجميد"}</span>
                        </button>

                        <button
                          onClick={() => void handleRecheck(item)}
                          disabled={recheckingKey === item.question}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition disabled:opacity-50"
                          title="إعادة اختبار السؤال ضد قاعدة المعرفة"
                        >
                          {recheckingKey === item.question ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          <span>إعادة فحص</span>
                        </button>

                        <button
                          onClick={() => void handleGenerateDraft(item)}
                          disabled={draftingKey === item.question}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition disabled:opacity-50"
                          title="توليد مسودة بالذكاء الاصطناعي"
                        >
                          {draftingKey === item.question ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 text-amber-600" />
                          )}
                          <span>توليد مسودة</span>
                        </button>

                        <button
                          onClick={() => openAddToKnowledgeModal(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-owly-text-light hover:text-owly-text border border-owly-border rounded-lg transition"
                          title="كتابة إجابة يدوية"
                        >
                          <BookPlus className="h-3 w-3 text-owly-primary" />
                          <span>يدوي</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Re-check Result Modal */}
      {recheckResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-owly-surface border border-owly-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-owly-border flex items-center justify-between bg-owly-bg">
              <div className="flex items-center gap-2">
                {recheckResult.hasAnswer ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                <h3 className="font-bold text-base text-owly-text">
                  {recheckResult.hasAnswer
                    ? "🎉 تم العثور على إجابة في قاعدة المعرفة المحدثة!"
                    : "⚠️ لا تتوفر إجابة كافية في قاعدة المعرفة حتى الآن"}
                </h3>
              </div>
              <button
                onClick={() => setRecheckResult(null)}
                className="p-1 rounded-lg text-owly-text-light hover:text-owly-text hover:bg-owly-border/40 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="p-3 bg-owly-bg border border-owly-border rounded-xl">
                <span className="text-[11px] font-bold text-owly-text-light block mb-1">
                  السؤال الذي تمت إعادة اختباره:
                </span>
                <p className="text-sm font-bold text-owly-text">«{recheckResult.question.question}»</p>
                {recheckResult.question.customerContact && (
                  <span className="text-xs text-owly-text-light mt-1 block">
                    المستفسر: {recheckResult.question.customerName} ({recheckResult.question.customerContact})
                  </span>
                )}
              </div>

              {recheckResult.hasAnswer ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-emerald-700 mb-1">
                      الجواب المستخرج من قاعدة المعرفة المحدثة:
                    </label>
                    <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs text-owly-text leading-6 whitespace-pre-wrap font-normal">
                      {recheckResult.answer}
                    </div>
                  </div>

                  {/* Direct WhatsApp Follow-up Checkbox */}
                  {recheckResult.question.channels.includes("whatsapp") && recheckResult.question.customerContact && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="recheck-notify-wa"
                        checked={recheckNotifyWa}
                        onChange={(e) => setRecheckNotifyWa(e.target.checked)}
                        className="mt-1 h-4 w-4 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="recheck-notify-wa" className="text-xs text-owly-text leading-5 cursor-pointer flex-1">
                        <span className="font-bold text-emerald-800 block flex items-center gap-1.5">
                          <Send className="h-3.5 w-3.5" />
                          إرسال هذا الجواب فوراً للمستفسر عبر واتساب
                        </span>
                        <span className="text-owly-text-light text-[11px] block mt-0.5">
                          سيصل إشعار متابعة رسمي إلى ({recheckResult.question.customerContact}) بالجواب لغلق الاستفسار.
                        </span>
                      </label>
                    </div>
                  )}

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-owly-border">
                    <button
                      type="button"
                      onClick={() => setRecheckResult(null)}
                      className="px-4 py-2 text-xs font-semibold text-owly-text-light hover:text-owly-text rounded-lg transition"
                    >
                      إغلاق
                    </button>
                    <button
                      type="button"
                      disabled={recheckResolving}
                      onClick={() => void handleApproveRecheckResolution()}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {recheckResolving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>اعتماد وإغلاق السؤال (حذف من غير المجابة)</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-800 rounded-xl text-xs leading-6">
                    <p className="font-semibold">{recheckResult.message}</p>
                    <p className="mt-1 text-owly-text-light">
                      تم الحفاظ على السؤال في قائمة «الأسئلة غير المجابة». يمكنك استخدام زر «توليد ذكي (IA)» لصياغة مقال جديد وحفظه في قاعدة المعرفة.
                    </p>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-owly-border">
                    <button
                      type="button"
                      onClick={() => setRecheckResult(null)}
                      className="px-4 py-2 text-xs font-semibold text-owly-text-light hover:text-owly-text rounded-lg transition"
                    >
                      حسناً، إبقاء السؤال معلقاً
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const target = recheckResult.question;
                        setRecheckResult(null);
                        void handleGenerateDraft(target);
                      }}
                      className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>توليد إجابة ذكية بالـ IA الآن</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Approve Knowledge Entry Modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-owly-surface border border-owly-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-owly-border flex items-center justify-between bg-owly-bg">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-base text-owly-text">
                  اعتماد إجابة السؤال وإضافتها لقاعدة المعرفة
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuestion(null)}
                className="p-1 rounded-lg text-owly-text-light hover:text-owly-text hover:bg-owly-border/40 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveKnowledgeEntry} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              {successMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 rounded-xl text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Source question box */}
              <div className="p-3 bg-owly-bg border border-owly-border rounded-xl">
                <span className="text-[11px] font-bold text-owly-text-light block mb-1">
                  السؤال المطروح من طرف المنخرط:
                </span>
                <p className="text-sm font-bold text-owly-text">«{selectedQuestion.question}»</p>
                <div className="mt-1 flex items-center justify-between text-xs text-owly-text-light">
                  <span>المستفسر: {selectedQuestion.customerName} ({selectedQuestion.channels.join(", ")})</span>
                  <button
                    type="button"
                    onClick={() => void handleRegenerateDraft()}
                    disabled={isGeneratingDraft}
                    className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 font-semibold hover:underline"
                  >
                    <RefreshCw className={cn("h-3 w-3", isGeneratingDraft && "animate-spin")} />
                    <span>إعادة التوليد بالذكاء الاصطناعي</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-owly-text mb-1">
                  القسم / الفئة (Category)
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-owly-bg border border-owly-border rounded-lg outline-none focus:border-owly-primary text-owly-text"
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-owly-text mb-1">
                  عنوان السؤال أو الموضوع (Title)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-owly-bg border border-owly-border rounded-lg outline-none focus:border-owly-primary text-owly-text font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-owly-text mb-1">
                  الإجابة الرسمية المعتمدة (Content)
                </label>
                <textarea
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="اكتب هنا الإجابة أو راجع ما ولّده الذكاء الاصطناعي..."
                  className="w-full px-3 py-2 text-sm bg-owly-bg border border-owly-border rounded-lg outline-none focus:border-owly-primary text-owly-text leading-6 font-normal"
                  required
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="block text-xs font-bold text-owly-text mb-1">
                    الأولوية في محرك البحث (Priority)
                  </label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-24 px-3 py-1.5 text-sm bg-owly-bg border border-owly-border rounded-lg text-owly-text"
                  />
                </div>
              </div>

              {/* Direct WhatsApp Follow-up Checkbox */}
              {selectedQuestion.channels.includes("whatsapp") && selectedQuestion.customerContact && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="notify-wa"
                    checked={notifyWhatsApp}
                    onChange={(e) => setNotifyWhatsApp(e.target.checked)}
                    className="mt-1 h-4 w-4 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="notify-wa" className="text-xs text-owly-text leading-5 cursor-pointer flex-1">
                    <span className="font-bold text-emerald-800 block flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5" />
                      إرسال الإجابة فوراً للمستفسر عبر واتساب
                    </span>
                    <span className="text-owly-text-light text-[11px] block mt-0.5">
                      سيصل إشعار متابعة رسمي إلى ({selectedQuestion.customerContact}) متضمناً هذا الجواب لغلق الاستفسار.
                    </span>
                  </label>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-owly-border">
                <button
                  type="button"
                  onClick={() => setSelectedQuestion(null)}
                  className="px-4 py-2 text-xs font-semibold text-owly-text-light hover:text-owly-text rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || isGeneratingDraft}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-owly-primary hover:bg-owly-primary-dark rounded-xl shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>حفظ واعتماد الجواب</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Warning & Holding Modal */}
      {warningQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-owly-surface border border-owly-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-owly-border flex items-center justify-between bg-amber-50/50 dark:bg-amber-950/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-base text-owly-text">
                  إشعار المنخرط بتصويب الجواب وتجميد الاستفسار
                </h3>
              </div>
              <button
                onClick={() => setWarningQuestion(null)}
                className="p-1 rounded-lg text-owly-text-light hover:text-owly-text hover:bg-owly-border/40 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {warnSuccess ? (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto animate-bounce" />
                <p className="text-base font-bold text-owly-text">{warnSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleSendWarningAndHold} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* Target Question & Customer Info */}
                <div className="p-3 bg-owly-bg border border-owly-border rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-owly-text-light block">
                    السؤال المعني بالتصويب:
                  </span>
                  <p className="text-sm font-bold text-owly-text">«{warningQuestion.question}»</p>
                  <div className="flex items-center gap-3 pt-1 text-xs text-owly-text-light">
                    <span>
                      المستفسر: <strong className="text-owly-text">{warningQuestion.customerName}</strong>
                    </span>
                    {warningQuestion.customerContact && (
                      <span>
                        الجهة/الهاتف: <span dir="ltr" className="font-mono">{warningQuestion.customerContact}</span>
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-owly-surface border border-owly-border text-[11px]">
                      {warningQuestion.channels.join(", ")}
                    </span>
                  </div>
                </div>

                {/* Outbound Warning Message to Customer */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-owly-text">
                      1. الرسالة التنبيهية التي ستصل للمنخرط (قابلة للتعديل):
                    </label>
                    <span className="text-[11px] text-owly-text-light">اعتذار وتوضيح أن الجواب غير دقيق</span>
                  </div>
                  <textarea
                    rows={6}
                    value={warnCustomerMessage}
                    onChange={(e) => setWarnCustomerMessage(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-owly-bg border border-owly-border rounded-xl outline-none focus:border-amber-500 text-owly-text leading-5 font-normal"
                    required
                  />
                </div>

                {/* Notify Checkbox */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="warn-notify-cust"
                    checked={warnNotifyCustomer}
                    onChange={(e) => setWarnNotifyCustomer(e.target.checked)}
                    className="mt-1 h-4 w-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="warn-notify-cust" className="text-xs text-owly-text leading-5 cursor-pointer flex-1">
                    <span className="font-bold text-amber-800 dark:text-amber-300 block flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5" />
                      إرسال هذا الإشعار للمنخرط فوراً عبر {warningQuestion.channels.includes("whatsapp") ? "واتساب" : warningQuestion.channels.includes("telegram") ? "تيليغرام" : "المحادثة"}
                    </span>
                    <span className="text-owly-text-light text-[11px] block mt-0.5">
                      سيتم إرسال التنبيه مباشرة وتسجيله في المحادثة ليعلم المنخرط بعدم الأخذ بالإجابة السابقة.
                    </span>
                  </label>
                </div>

                {/* Holding Response for Future Inquiries */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-owly-text">
                      2. الرد التوقيفي التلقائي لأي شخص يطرح نفس السؤال مستقبلاً:
                    </label>
                    <span className="text-[11px] text-owly-text-light">يمنع الذكاء الاصطناعي من التأليف</span>
                  </div>
                  <textarea
                    rows={5}
                    value={holdingDisclaimerText}
                    onChange={(e) => setHoldingDisclaimerText(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-owly-bg border border-owly-border rounded-xl outline-none focus:border-amber-500 text-owly-text leading-5 font-normal"
                    required
                  />
                </div>

                {/* Enable Holding Checkbox */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="warn-enable-hold"
                    checked={warnEnableHolding}
                    onChange={(e) => setWarnEnableHolding(e.target.checked)}
                    className="mt-1 h-4 w-4 text-blue-600 rounded border-blue-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="warn-enable-hold" className="text-xs text-owly-text leading-5 cursor-pointer flex-1">
                    <span className="font-bold text-blue-800 dark:text-blue-300 block flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      تفعيل اعتراض السؤال والرد التلقائي المعلق على مدار الساعة
                    </span>
                    <span className="text-owly-text-light text-[11px] block mt-0.5">
                      إذا سأل أي شخص نفس هذا السؤال، سيرد عليه المساعد بهذا النص التوقيفي فوراً حتى تغذية المقال الصحيح.
                    </span>
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 flex items-center justify-between gap-2 border-t border-owly-border">
                  {warningQuestion.isHeld ? (
                    <button
                      type="button"
                      disabled={warnLifting}
                      onClick={() => void handleLiftHold()}
                      className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition disabled:opacity-50"
                    >
                      {warnLifting ? "جاري الرفع..." : "رفع التجميد وإلغاء الحظر"}
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWarningQuestion(null)}
                      className="px-4 py-2 text-xs font-semibold text-owly-text-light hover:text-owly-text rounded-lg transition"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={warnSubmitting}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {warnSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span>إرسال الإشعار وتفعيل التجميد</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Test & Compare (With/Without External AI) Modal */}
      {compareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-owly-surface border border-owly-border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-owly-border flex items-center justify-between bg-owly-bg">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 border border-purple-500/20">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-owly-text">
                    اختبار ومقارنة الإجابات (Test & Comparateur IA)
                  </h3>
                  <p className="text-xs text-owly-text-light">
                    قارن بين الجواب المعتمد من القاعدة المحلية والجواب المولد بالذكاء الخارجي (Gemini / Groq)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCompareModalOpen(false)}
                className="p-1.5 rounded-lg text-owly-text-light hover:text-owly-text hover:bg-owly-border/40 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Question Input Box */}
              <div className="p-4 bg-owly-bg border border-owly-border rounded-xl space-y-3">
                <label className="block text-xs font-bold text-owly-text flex items-center justify-between">
                  <span>نص السؤال المراد اختباره ومقارنته:</span>
                  {compareTargetItem && (
                    <span className="text-[11px] font-normal text-owly-text-light">
                      السائل: {compareTargetItem.customerName} {compareTargetItem.customerContact ? `(${compareTargetItem.customerContact})` : ""}
                    </span>
                  )}
                </label>
                <textarea
                  value={compareQuestion}
                  onChange={(e) => setCompareQuestion(e.target.value)}
                  placeholder="اكتب أو عدل السؤال المراد اختباره..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-owly-surface border border-owly-border rounded-lg outline-none text-owly-text focus:border-purple-500 transition resize-none font-medium"
                />

                {/* Test Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-owly-text-light ml-1">نوع الفحص:</span>
                    <button
                      type="button"
                      disabled={compareLoading || !compareQuestion.trim()}
                      onClick={() => void runCompare(compareQuestion, "both")}
                      className={cn(
                        "px-3 py-1.5 text-xs font-bold rounded-lg border transition inline-flex items-center gap-1",
                        compareMode === "both"
                          ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                          : "bg-owly-surface text-owly-text border-owly-border hover:bg-purple-50 dark:hover:bg-purple-950/20"
                      )}
                    >
                      <Scale className="h-3.5 w-3.5" />
                      <span>⚖️ مقارنة الاثنين معاً (Recommandé)</span>
                    </button>
                    <button
                      type="button"
                      disabled={compareLoading || !compareQuestion.trim()}
                      onClick={() => void runCompare(compareQuestion, "local_only")}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-lg border transition inline-flex items-center gap-1",
                        compareMode === "local_only"
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-owly-surface text-owly-text border-owly-border hover:bg-blue-50 dark:hover:bg-blue-950/20"
                      )}
                    >
                      <span>🏛️ بدون ذكاء خارجي فقط</span>
                    </button>
                    <button
                      type="button"
                      disabled={compareLoading || !compareQuestion.trim()}
                      onClick={() => void runCompare(compareQuestion, "external_only")}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-lg border transition inline-flex items-center gap-1",
                        compareMode === "external_only"
                          ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                          : "bg-owly-surface text-owly-text border-owly-border hover:bg-amber-50 dark:hover:bg-amber-950/20"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>✨ مع الذكاء الخارجي فقط</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={compareLoading || !compareQuestion.trim()}
                    onClick={() => void runCompare(compareQuestion, compareMode)}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {compareLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    <span>إعادة التشغيل</span>
                  </button>
                </div>
              </div>

              {/* Loading Indicator */}
              {compareLoading && (
                <div className="p-8 text-center bg-owly-bg/50 border border-owly-border rounded-xl space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto" />
                  <p className="text-xs font-bold text-owly-text">
                    جاري الاستعلام من قاعدة المعرفة المحلية ومحرك الذكاء الاصطناعي...
                  </p>
                  <p className="text-[11px] text-owly-text-light">
                    يتم تحليل السؤال بشكل متوازٍ لرصد الاختلاف في النتائج بدقة.
                  </p>
                </div>
              )}

              {/* Results View */}
              {!compareLoading && compareData && (
                <div className="space-y-4">
                  {/* Difference Summary Alert */}
                  {compareData.differenceSummary && (
                    <div className="p-3.5 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl flex items-start gap-3 shadow-sm">
                      <Scale className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-purple-900 dark:text-purple-300 block">
                          الخلاصة التحليلية للفرق:
                        </span>
                        <p className="text-xs text-owly-text leading-5 mt-0.5">
                          {compareData.differenceSummary}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Side-by-Side Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Card 1: Sans IA Externe (Local KB) */}
                    {compareData.local && (
                      <div className="border border-owly-border bg-owly-bg rounded-xl overflow-hidden flex flex-col shadow-sm">
                        <div className="px-4 py-3 border-b border-owly-border bg-owly-surface flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🏛️</span>
                            <div>
                              <h4 className="text-xs font-bold text-owly-text">
                                بدون ذكاء خارجي (Sans IA Externe)
                              </h4>
                              <p className="text-[10px] text-owly-text-light">
                                قاعدة المعرفة المحلية المعتمدة فقط
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-bold rounded-md border",
                              compareData.local.hasAnswer
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            )}
                          >
                            {compareData.local.hasAnswer ? "✅ إجابة متوفرة" : "❌ غير متوفر (اعتذار)"}
                          </span>
                        </div>

                        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="text-[11px] font-medium text-owly-text-light mb-1.5 flex items-center gap-1">
                              <span>الحالة:</span>
                              <span className="text-owly-text font-bold">{compareData.local.message}</span>
                            </div>
                            <div className={cn(
                              "p-3 rounded-lg text-xs leading-6 whitespace-pre-wrap font-normal border text-right",
                              compareData.local.hasAnswer
                                ? "bg-emerald-50/40 border-emerald-200 text-owly-text"
                                : "bg-red-50/30 border-red-200 text-red-900 dark:text-red-300"
                            )} dir="rtl">
                              {compareData.local.answer || "لم يتم إرجاع أي نص."}
                            </div>
                          </div>
                          <div className="pt-2 text-[11px] text-owly-text-light border-t border-owly-border/50 text-right" dir="rtl">
                            هذا هو الرد الذي سيتلقاه المنخرط في حال كانت ميزة الذكاء الخارجي معطلة.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Card 2: Avec IA Externe (Gemini / Groq) */}
                    {compareData.external && (
                      <div className="border border-purple-200 dark:border-purple-900/60 bg-purple-50/20 rounded-xl overflow-hidden flex flex-col shadow-sm">
                        <div className="px-4 py-3 border-b border-purple-200 dark:border-purple-900/60 bg-purple-500/10 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">✨</span>
                            <div>
                              <h4 className="text-xs font-bold text-purple-900 dark:text-purple-300">
                                مع الذكاء الخارجي (Avec IA Externe)
                              </h4>
                              <p className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">
                                {compareData.external.provider.toUpperCase()} ({compareData.external.model})
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-bold rounded-md border",
                              compareData.external.hasAnswer
                                ? "bg-purple-100 text-purple-800 border-purple-300"
                                : "bg-gray-100 text-gray-700 border-gray-300"
                            )}
                          >
                            {compareData.external.hasAnswer ? "✨ إجابة مولدة فورية" : "⚠️ غير متاح"}
                          </span>
                        </div>

                        <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="text-[11px] font-medium text-purple-900 dark:text-purple-300 mb-1.5 flex items-center gap-1">
                              <span>الحالة:</span>
                              <span className="font-bold">{compareData.external.message}</span>
                            </div>
                            <div className="p-3 bg-owly-surface border border-purple-200 dark:border-purple-800/50 rounded-lg text-xs text-owly-text leading-6 whitespace-pre-wrap font-normal max-h-64 overflow-y-auto text-right" dir="rtl">
                              {compareData.external.answer || "لا تتوفر إجابة مولدة."}
                            </div>
                          </div>

                          {compareData.external.hasAnswer && (
                            <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/40">
                              <button
                                type="button"
                                onClick={() => handleAdoptExternalAnswerToKnowledge()}
                                className="w-full py-2.5 px-3 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-sm transition inline-flex items-center justify-center gap-1.5"
                              >
                                <BookPlus className="h-4 w-4" />
                                <span>اعتماد هذه الإجابة وحفظها في قاعدة المعرفة (1-Click)</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-owly-border bg-owly-bg flex items-center justify-end">
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-owly-text-light hover:text-owly-text rounded-lg transition"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
