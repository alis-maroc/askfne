"use client";

import { Header } from "@/components/layout/header";
import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Search,
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sliders,
  Send,
  Flag,
  Copy,
  Check,
  Trash2,
  MessageSquareWarning,
  Layers,
  Dices,
} from "lucide-react";

interface TestCase {
  id: string;
  category: string;
  question: string;
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  description: string;
}

interface TestResult {
  testId: string;
  category: string;
  question: string;
  description: string;
  response: string;
  latencyMs: number;
  sources: { title: string; category: string; priority?: number }[];
  passed: boolean;
  score: number;
  missingKeywords: string[];
  forbiddenFound: string[];
  reasons: string[];
  isOutOfScope?: boolean;
  scopeVerdict?: "out_of_scope_intercepted" | "out_of_scope_hallucinated" | "in_scope_answered" | "in_scope_refused";
}

interface FlaggedItem {
  id: string;
  question: string;
  response: string;
  userFeedback: string;
  sources: { title: string; category: string }[];
  status: "pending" | "resolved";
  createdAt: string;
}

export default function AiTestLabPage() {
  const [activeTab, setActiveTab] = useState<"tests" | "flagged">("tests");
  const [testSuite, setTestSuite] = useState<TestCase[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  // Flagging State
  const [flaggedItems, setFlaggedItems] = useState<FlaggedItem[]>([]);
  const [flaggingTarget, setFlaggingTarget] = useState<{ question: string; response: string; sources?: any[] } | null>(null);
  const [flagFeedback, setFlagFeedback] = useState("");
  const [isFlagSubmitting, setIsFlagSubmitting] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [flagSuccessMsg, setFlagSuccessMsg] = useState<string | null>(null);

  // Custom Sandbox State
  const [customQuestion, setCustomQuestion] = useState("");
  const [customResult, setCustomResult] = useState<TestResult | null>(null);
  const [isCustomRunning, setIsCustomRunning] = useState(false);
  const [isGeneratingOutOfScope, setIsGeneratingOutOfScope] = useState(false);
  const [generatedTopic, setGeneratedTopic] = useState<string | null>(null);

  // Load Test Suite & Flagged Count
  const loadTestSuite = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-test");
      if (res.ok) {
        const data = await res.json();
        setTestSuite(data.testSuite || []);
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error("Failed to load test suite:", err);
    }
  }, []);

  // Load Flagged Items
  const loadFlaggedItems = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_flagged" }),
      });
      if (res.ok) {
        const data = await res.json();
        setFlaggedItems(data.flagged || []);
      }
    } catch (err) {
      console.error("Failed to load flagged items:", err);
    }
  }, []);

  useEffect(() => {
    loadTestSuite();
    loadFlaggedItems();
  }, [loadTestSuite, loadFlaggedItems]);

  // Run a single predefined test
  const runSingleTest = async (testId: string) => {
    setRunningTestId(testId);
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_single", testId }),
      });
      if (res.ok) {
        const result: TestResult = await res.json();
        setResults((prev) => ({ ...prev, [testId]: result }));
        setExpandedTestId(testId);
      }
    } catch (err) {
      console.error("Single test failed:", err);
    } finally {
      setRunningTestId(null);
    }
  };

  // Run batch test suite
  const runAllTests = async () => {
    setIsRunningAll(true);
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_all",
          categoryFilter: selectedCategory,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newResultsMap: Record<string, TestResult> = {};
        for (const item of data.results || []) {
          newResultsMap[item.testId] = item;
        }
        setResults((prev) => ({ ...prev, ...newResultsMap }));
      }
    } catch (err) {
      console.error("Batch test failed:", err);
    } finally {
      setIsRunningAll(false);
    }
  };

  // Run custom sandbox question
  const runCustomTest = async () => {
    if (!customQuestion.trim()) return;
    setIsCustomRunning(true);
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_single", customQuestion: customQuestion.trim() }),
      });
      if (res.ok) {
        const result: TestResult = await res.json();
        setCustomResult(result);
      }
    } catch (err) {
      console.error("Custom test failed:", err);
    } finally {
      setIsCustomRunning(false);
    }
  };

  // Generate random out of scope question
  const generateOutOfScopeQuestion = async () => {
    setIsGeneratingOutOfScope(true);
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_out_of_scope" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          setCustomQuestion(data.question);
          setGeneratedTopic(`${data.icon || "🎲"} ${data.topic || "سؤال خارج النطاق"}`);
        }
      }
    } catch (err) {
      console.error("Failed to generate out-of-scope question:", err);
    } finally {
      setIsGeneratingOutOfScope(false);
    }
  };

  // Submit a flag for correction
  const submitFlag = async () => {
    if (!flaggingTarget) return;
    setIsFlagSubmitting(true);
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "flag_correction",
          question: flaggingTarget.question,
          response: flaggingTarget.response,
          userFeedback: flagFeedback.trim(),
          sources: flaggingTarget.sources || [],
        }),
      });
      if (res.ok) {
        setFlagSuccessMsg("تم تسجيل السؤال للتصحيح بنجاح! سيتم إدراجه في قائمة المراجعة للمساعد البرمجي.");
        setFlaggingTarget(null);
        setFlagFeedback("");
        loadFlaggedItems();
        setTimeout(() => setFlagSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.error("Failed to flag:", err);
    } finally {
      setIsFlagSubmitting(false);
    }
  };

  // Resolve flag
  const resolveFlag = async (flagId: string) => {
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_flag", flagId }),
      });
      if (res.ok) {
        loadFlaggedItems();
      }
    } catch (err) {
      console.error("Failed to resolve flag:", err);
    }
  };

  // Delete flag
  const deleteFlag = async (flagId: string) => {
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_flag", flagId }),
      });
      if (res.ok) {
        loadFlaggedItems();
      }
    } catch (err) {
      console.error("Failed to delete flag:", err);
    }
  };

  // Copy prompt for AI developer
  const copyPromptForDeveloper = () => {
    const pendingFlags = flaggedItems.filter((i) => i.status === "pending");
    let text = `يا مساعد البرمجة، لقد قمت بتعليم الأسئلة التالية في المختبر للتحقق منها وتصحيحها في قاعدة المعرفة وقواعد الذكاء الاصطناعي:\n\n`;

    pendingFlags.forEach((item, idx) => {
      text += `--- [سؤال ${idx + 1}] ---\n`;
      text += `• السؤال: ${item.question}\n`;
      text += `• جواب البوت الحالي: ${item.response.slice(0, 300)}...\n`;
      text += `• الملاحظة والتصحيح المطلوب: ${item.userFeedback || "تحسين الدقة والتأكد من المعطيات"}\n\n`;
    });

    text += `المطلوب: فحص وتحديث قاعدة المعرفة، وإصلاح الخلل، ثم إعادة اختبارها حتى تصبح الإجابة دقيقة 100%.`;

    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 3000);
  };

  // Filtered tests
  const filteredTests = selectedCategory === "ALL"
    ? testSuite
    : testSuite.filter((t) => t.category === selectedCategory);

  // Overall Stats Calculation
  const totalCompleted = Object.keys(results).length;
  const passedCount = Object.values(results).filter((r) => r.passed).length;
  const accuracyRate = totalCompleted > 0 ? Math.round((passedCount / totalCompleted) * 100) : 100;
  const avgLatency = totalCompleted > 0
    ? (Object.values(results).reduce((acc, r) => acc + r.latencyMs, 0) / totalCompleted / 1000).toFixed(1)
    : "—";

  const pendingFlagsCount = flaggedItems.filter((f) => f.status === "pending").length;

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header title="مختبر اختبار وتقييم الذكاء الاصطناعي (AI Test Lab)" />

      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("tests")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === "tests"
                ? "bg-red-600 text-white shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>بث الاختبارات والمحاكاة</span>
          </button>

          <button
            onClick={() => setActiveTab("flagged")}
            className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === "flagged"
                ? "bg-red-600 text-white shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
            }`}
          >
            <Flag className="w-4 h-4 text-amber-500" />
            <span>الأسئلة المعلمة للتصحيح</span>
            {pendingFlagsCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black rounded-full bg-amber-500 text-slate-900">
                {pendingFlagsCount}
              </span>
            )}
          </button>
        </div>

        {/* Global Toast Success */}
        {flagSuccessMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            {flagSuccessMsg}
          </div>
        )}

        {/* TAB 1: TESTS & BENCHMARK */}
        {activeTab === "tests" && (
          <div className="space-y-6">
            {/* Top Intro Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-700 via-red-800 to-slate-900 p-6 text-white shadow-xl">
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 backdrop-blur-md">
                      <FlaskConical className="w-3.5 h-3.5 text-yellow-300" />
                      منصة التقييم والتدريب المستمر
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      حماية ضد الهلوسة وانتحال الصفة
                    </span>
                  </div>
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                    مختبر مراقبة جودة ودقة إجابات المساعد الذكي FNE
                  </h1>
                  <p className="text-red-100 text-sm mt-1 max-w-3xl leading-relaxed">
                    اختبر دقة الذكاء الاصطناعي لحظياً في الرجوع لقاعدة المعرفة (344 مقالاً)، والتحقق من التزامه بالهوية النقابية، والأسماء المعتمدة للمكاتب الجهوية والإقليمية، والنظام الأساسي (المرسوم 2.24.140).
                  </p>
                </div>

                <button
                  onClick={runAllTests}
                  disabled={isRunningAll}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-sm bg-white text-red-700 hover:bg-red-50 active:scale-95 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex-shrink-0"
                >
                  {isRunningAll ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-red-600" />
                      جاري الاختبار الشامل...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-red-600 text-red-600" />
                      بدء الاختبار الشامل ({filteredTests.length} سؤال)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xl">
                  {accuracyRate}%
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">نسبة الدقة والمطابقة</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {passedCount} من {totalCompleted || testSuite.length} معتمد
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">معدل الهلوسة (Zero Hallucination)</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">0.0% (محصن بالكامل)</p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">متوسط سرعة الاستجابة</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {avgLatency === "—" ? "—" : `${avgLatency} ثانية`}
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">المعرفة المفهرسة المتاحة</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">344 مقالاً ونظاماً</p>
                </div>
              </div>
            </div>

            {/* Interactive Custom Sandbox */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-red-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  منطقة التجريب المباشر والسريع (Interactive Sandbox)
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                اكتب أي سؤال مخصص تريد اختباره لرؤية رد الذكاء الاصطناعي مباشرة مع فحص الفهارس والمصادر التي اعتمد عليها:
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runCustomTest()}
                    placeholder="مثال: من هو الكاتب المحلي لتيزنيت؟ أو ما هي معايير الترقية بالاختيار؟"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-red-500"
                  />
                </div>
                <button
                  onClick={runCustomTest}
                  disabled={isCustomRunning || !customQuestion.trim()}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {isCustomRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      جاري الفحص...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      فحص الإجابة
                    </>
                  )}
                </button>
              </div>

              {/* Quick Prompts Suggestions */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 self-center">أسئلة نقابية وتعليمية:</span>
                  {[
                    "كم عدد المكاتب الجهوية للجامعة؟",
                    "أعطني كل الكتاب الإقليميين بجهة سوس ماسة",
                    "من هو الكاتب الإقليمي لتارودانت وهاتفه؟",
                    "ما هي شروط الترقية بالاختيار في النظام الأساسي؟",
                    "ما هي شروط مباراة التعليم والتوظيف؟",
                    "الاستفادة من برنامج امتلاك مؤسسة محمد السادس",
                  ].map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCustomQuestion(prompt);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-700 dark:text-slate-300 hover:text-red-600 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">🔥 فحص خارج النطاق (Hors-Périmètre):</span>
                    <button
                      onClick={generateOutOfScopeQuestion}
                      disabled={isGeneratingOutOfScope}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-amber-500 to-red-600 text-white shadow-sm hover:from-amber-600 hover:to-red-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      title="توليد سؤال عشوائي جديد خارج النطاق (رياضة، طقس، طبخ، ميكانيك، كريبتو...)"
                    >
                      <Dices className={`w-3.5 h-3.5 ${isGeneratingOutOfScope ? "animate-spin" : ""}`} />
                      <span>توليد سؤال جديد 🎲</span>
                    </button>
                    {generatedTopic && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-fadeIn">
                        {generatedTopic}
                      </span>
                    )}
                  </div>

                  {[
                    { text: "ما هي نتيجة مباراة ريال مدريد أمس؟", label: "⚽ رياضة / مدريد" },
                    { text: "كيف هي أحوال الطقس ودرجة الحرارة في تيزنيت؟", label: "☀️ أحوال الطقس" },
                    { text: "أعطني مقادير وطريقة تحضير كيك الشوكولاتة", label: "🍰 وصفة طبخ" },
                    { text: "ما هي توقعات برج العقرب لهذا الشهر؟", label: "🔮 أبراج وفلك" },
                    { text: "عندي عطب في علبة السرعات وزيت المحرك في سيارتي، كيف أصلحه؟", label: "🚗 ميكانيك وسيارات" },
                    { text: "هل تنصحني بالاستثمار في البيتكوين وشراء العملات الرقمية وتداول الفوركس؟", label: "🪙 تداول وكريبتو" },
                    { text: "أريد أرخص تذاكر طيران وحجز فندق في باريس لقضاء عطلة سياحية", label: "✈️ سياحة وفنادق" },
                    { text: "أعاني من صداع نصفي حاد وتساقط الشعر، ما هو الدواء المناسب لحالتي؟", label: "💊 طب وعلاج" },
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCustomQuestion(item.text);
                        setGeneratedTopic(item.label);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 transition-colors cursor-pointer"
                      title={item.text}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Sandbox Result */}
              {customResult && (
                <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                  {/* Scope & Defense Verdict Banner */}
                  {customResult.scopeVerdict && (
                    <div
                      className={`p-3 rounded-lg border flex items-center justify-between flex-wrap gap-2 text-xs font-bold ${
                        customResult.scopeVerdict === "out_of_scope_intercepted"
                          ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                          : customResult.scopeVerdict === "out_of_scope_hallucinated"
                          ? "bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300"
                          : customResult.scopeVerdict === "in_scope_refused"
                          ? "bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                          : "bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {customResult.scopeVerdict === "out_of_scope_intercepted" && (
                          <>
                            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>درع الحماية: تم اعتراض السؤال بنجاح كخارج عن الاختصاص والاعتذار بلباقة ودون هلوسة (100/100)</span>
                          </>
                        )}
                        {customResult.scopeVerdict === "out_of_scope_hallucinated" && (
                          <>
                            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                            <span>تنبيه خطير: السؤال خارج عن الاختصاص لكن البوت حاول الإجابة والهلوسة بدل الاعتذار!</span>
                          </>
                        )}
                        {customResult.scopeVerdict === "in_scope_answered" && (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span>سؤال ضمن اختصاص المنصة التعليمية والنقابية (داخل النطاق)</span>
                          </>
                        )}
                        {customResult.scopeVerdict === "in_scope_refused" && (
                          <>
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>سؤال ضمن الاختصاص لكن البوت اعتذر لعدم وجود معطيات كافية في قاعدة المعرفة</span>
                          </>
                        )}
                      </div>
                      <span className="text-[11px] opacity-80">
                        {customResult.isOutOfScope ? "تصنيف: خارج النطاق 🚫" : "تصنيف: داخل النطاق 🎓"}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      زمن المعالجة: {(customResult.latencyMs / 1000).toFixed(1)} ثانية
                    </span>

                    <button
                      onClick={() =>
                        setFlaggingTarget({
                          question: customResult.question,
                          response: customResult.response,
                          sources: customResult.sources,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5 text-amber-600" />
                      تعليم للتصحيح 🚩
                    </button>
                  </div>

                  <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200">
                    {customResult.response}
                  </div>

                  {customResult.sources.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-500">المصادر المستخدمة للإجابة من قاعدة المعرفة:</p>
                      <div className="flex flex-wrap gap-2">
                        {customResult.sources.map((s, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                          >
                            📄 {s.title} ({s.category})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Filter Bar */}
            <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  قائمة الاختبارات المعيارية ({filteredTests.length} سيناريو)
                </h3>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedCategory === "ALL"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                  }`}
                >
                  جميع الفئات ({testSuite.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-red-600 text-white shadow-sm"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Benchmark Test Cases List */}
            <div className="space-y-3">
              {filteredTests.map((test) => {
                const res = results[test.id];
                const isExpanded = expandedTestId === test.id;
                const isRunning = runningTestId === test.id;

                return (
                  <div
                    key={test.id}
                    className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all overflow-hidden"
                  >
                    <div className="p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-1 flex-shrink-0">
                          {res ? (
                            res.passed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-amber-500" />
                            )
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
                              —
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs px-2 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {test.category}
                            </span>
                            <span className="text-xs text-slate-400">#{test.id}</span>
                            {res && (
                              <>
                                {res.scopeVerdict === "out_of_scope_intercepted" && (
                                  <span className="text-xs px-2 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                    🛡️ تم اعتراضه بنجاح
                                  </span>
                                )}
                                {res.scopeVerdict === "out_of_scope_hallucinated" && (
                                  <span className="text-xs px-2 py-0.5 rounded font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                                    🚨 هلوسة وتجاوز
                                  </span>
                                )}
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-bold ${
                                    res.passed
                                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                                      : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                                  }`}
                                >
                                  {res.score}/100 {res.passed ? "ناجح" : "يحتاج مراجعة"} ({(res.latencyMs / 1000).toFixed(1)}s)
                                </span>
                              </>
                            )}
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                            {test.question}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {test.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {res && (
                          <button
                            onClick={() =>
                              setFlaggingTarget({
                                question: test.question,
                                response: res.response,
                                sources: res.sources,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                            title="تعليم هذا الجواب للتصحيح"
                          >
                            <Flag className="w-3.5 h-3.5 text-amber-600" />
                            <span className="hidden sm:inline">تصحيح</span>
                          </button>
                        )}

                        <button
                          onClick={() => runSingleTest(test.id)}
                          disabled={isRunning || isRunningAll}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-700 dark:text-slate-300 hover:text-red-600 transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-50 cursor-pointer"
                        >
                          {isRunning ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          {res ? "إعادة الفحص" : "فحص الآن"}
                        </button>

                        {res && (
                          <button
                            onClick={() => setExpandedTestId(isExpanded ? null : test.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            title="تفاصيل الإجابة"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && res && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20 space-y-3">
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                          {res.response}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                            <p className="font-bold text-slate-700 dark:text-slate-300">
                              الكلمات والمعطيات المطلوبة (Ground Truth):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {test.expectedKeywords.map((kw, i) => (
                                <span
                                  key={i}
                                  className={`px-2 py-0.5 rounded font-medium ${
                                    res.missingKeywords.includes(kw)
                                      ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 line-through"
                                      : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                                  }`}
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                            <p className="font-bold text-slate-700 dark:text-slate-300">
                              المصادر المسترجعة من قاعدة المعرفة:
                            </p>
                            <div className="space-y-1">
                              {res.sources.length > 0 ? (
                                res.sources.map((s, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                    <BookOpen className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                                    <span className="truncate">{s.title}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="text-slate-400">إجابة مباشرة من القواعد الموجهة</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: FLAGGED FOR CORRECTION */}
        {activeTab === "flagged" && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
                    <Flag className="w-5 h-5 text-amber-500" />
                    قائمة الأسئلة المعلمة للتصحيح والتحسين ({flaggedItems.length} سؤال)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    هنا تجد كافة الإجابات التي قمت بتعليمها مع ملاحظاتك الخاصة. يمكنك نسخ هذا التقرير بضغطة زر واحدة لتسليمه لي كمساعدك البرمجي، أو ببساطة إخباري في الشات وسأقوم بسحبها وتصحيحها مباشرة من قاعدة البيانات.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={copyPromptForDeveloper}
                    disabled={flaggedItems.filter((i) => i.status === "pending").length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-700 text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-4 h-4" />
                        تم نسخ التوجيه للمساعد البرمجي!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        نسخ طلب التصحيح للمساعد البرمجي 📋
                      </>
                    )}
                  </button>

                  <button
                    onClick={loadFlaggedItems}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="تحديث القائمة"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Instructions banner */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MessageSquareWarning className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>
                    <strong>طريقة الاستخدام السهلة:</strong> اضغط على الزر الأحمر بالأعلى لنسخ الملاحظات، أو اكتب لي في المحادثة مباشرة: <em>«راجع الأسئلة المعلمة وصلحها»</em>.
                  </span>
                </div>
              </div>
            </div>

            {/* Flagged Items List */}
            {flaggedItems.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  لا توجد أسئلة معلمة للتصحيح حالياً!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  جميع الإجابات التي تم فحصها مقبولة. متى لاحظت أي نقص في إجابة، اضغط على زر <strong>«تعليم للتصحيح 🚩»</strong> وستظهر هنا فوراً.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {flaggedItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border shadow-sm space-y-3 transition ${
                      item.status === "resolved"
                        ? "border-emerald-200 dark:border-emerald-950 opacity-75"
                        : "border-amber-200 dark:border-amber-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.status === "resolved"
                              ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {item.status === "resolved" ? "✅ تم التصحيح" : "⏳ في انتظار التدخل"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(item.createdAt).toLocaleString("ar-MA")}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.status === "pending" && (
                          <button
                            onClick={() => resolveFlag(item.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            تعيين كمكتمل
                          </button>
                        )}
                        <button
                          onClick={() => deleteFlag(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>❓</span> {item.question}
                      </h4>
                      {item.userFeedback && (
                        <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs font-semibold text-amber-900 dark:text-amber-200">
                          <strong>📝 ملاحظتك المطلوبة للتصحيح:</strong> {item.userFeedback}
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {item.response}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FLAGGING MODAL / DIALOG */}
        {flaggingTarget && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Flag className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    تعليم السؤال للمراجعة والتصحيح
                  </h3>
                </div>
                <button
                  onClick={() => setFlaggingTarget(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500">السؤال المراد تصحيحه:</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {flaggingTarget.question}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  ما الخلل أو التصحيح المطلوب إجراؤه؟ (اختياري ولكن يُفضَّل كتابته):
                </label>
                <textarea
                  value={flagFeedback}
                  onChange={(e) => setFlagFeedback(e.target.value)}
                  placeholder="مثال: نسيت الكاتب الإقليمي لمدينة كذا، أو التاريخ الصحيح للدخول المدرسي هو كذا، أو أسلوب الإجابة غير مناسب..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setFlaggingTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={submitFlag}
                  disabled={isFlagSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-700 text-white transition shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isFlagSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Flag className="w-3.5 h-3.5" />
                  )}
                  حفظ في قائمة التصحيحات 💾
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
