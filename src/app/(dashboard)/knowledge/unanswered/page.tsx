"use client";

import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import {
  HelpCircle,
  Search,
  Plus,
  MessageSquare,
  Calendar,
  Loader2,
  BookPlus,
  X,
  Radio,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Trash2,
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

  // Add to Knowledge modal state
  const [selectedQuestion, setSelectedQuestion] = useState<UnansweredQuestion | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState(10);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

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
        if (cats.length > 0) setCategoryId(cats[0].id);
      }
    } catch (err) {
      console.error("Failed to load unanswered questions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function openAddToKnowledgeModal(item: UnansweredQuestion) {
    setSelectedQuestion(item);
    setTitle(item.question);
    setContent("");
    setPriority(10);
    setSuccessMessage("");
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
      }
    } catch (err) {
      console.error("Failed to dismiss:", err);
    } finally {
      setDismissingKey(null);
    }
  }

  async function handleSaveKnowledgeEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !categoryId) return;

    setSaving(true);
    try {
      const res = await fetch("/api/knowledge/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          title: title.trim(),
          content: content.trim(),
          priority,
        }),
      });

      if (res.ok) {
        setSuccessMessage("تمت إضافة المقال بنجاح إلى قاعدة المعرفة!");
        setTimeout(() => {
          setSelectedQuestion(null);
          setSuccessMessage("");
          void fetchData();
        }, 1200);
      }
    } catch (err) {
      console.error("Failed to add entry:", err);
    } finally {
      setSaving(false);
    }
  }

  const filtered = questions.filter((item) => {
    const matchesSearch =
      item.question.toLowerCase().includes(search.toLowerCase()) ||
      item.customerName.toLowerCase().includes(search.toLowerCase());
    const matchesChannel =
      channelFilter === "all" || item.channels.includes(channelFilter);
    return matchesSearch && matchesChannel;
  });

  const totalOccurrences = questions.reduce((sum, q) => sum + q.count, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-owly-bg">
      <Header
        title="الأسئلة غير المجابة (Knowledge Gaps)"
        description="استكشف الأسئلة التي لم يجد لها المساعد الذكي إجابة دقيقة، وأضف إجاباتها لتعزيز قاعدة المعرفة"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-owly-surface border border-owly-border rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
              <HelpCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-owly-text-light font-medium">أسئلة فريدة بدون جواب</p>
              <h3 className="text-2xl font-bold text-owly-text mt-0.5">{questions.length}</h3>
            </div>
          </div>

          <div className="bg-owly-surface border border-owly-border rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-red-500/10 text-red-600 rounded-xl">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-owly-text-light font-medium">إجمالي مرات التكرار</p>
              <h3 className="text-2xl font-bold text-owly-text mt-0.5">{totalOccurrences}</h3>
            </div>
          </div>

          <div className="bg-owly-surface border border-owly-border rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-owly-text-light font-medium">فرص التحسين المتاحة</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-0.5">
                {questions.length > 0 ? "مطلوبة" : "مكتملة ✨"}
              </h3>
            </div>
          </div>
        </div>

        {/* Toolbar (Search & Filter) */}
        <div className="bg-owly-surface border border-owly-border rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-owly-text-light" />
            <input
              type="text"
              placeholder="البحث في الأسئلة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-owly-bg border border-owly-border rounded-lg outline-none focus:border-owly-primary transition text-owly-text placeholder:text-owly-text-light"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
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

            <button
              onClick={() => void fetchData()}
              disabled={loading}
              className="p-2 border border-owly-border hover:bg-owly-bg rounded-lg text-owly-text transition"
              title="تحديث"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Questions List */}
        <div className="bg-owly-surface border border-owly-border rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-owly-primary" />
              <p className="text-sm text-owly-text-light">جاري استخراج الأسئلة غير المجابة...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center px-4">
              <HelpCircle className="h-12 w-12 mx-auto mb-3 text-owly-text-light opacity-30" />
              <h4 className="text-base font-semibold text-owly-text">لا توجد أسئلة بدون إجابة</h4>
              <p className="text-xs text-owly-text-light mt-1 max-w-sm mx-auto">
                ممتاز! جميع الأسئلة المطروحة حتى الآن تمت معالجتها وإيجاد إجابات لها في قاعدة المعرفة.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-owly-border">
              {filtered.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 sm:p-5 hover:bg-owly-bg/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base text-owly-text break-words">
                        {item.question}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                        {item.count} {item.count > 1 ? "مرات" : "مرة"}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-owly-text-light flex-wrap">
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
                      <Link
                        href={`/conversations?id=${item.conversationId}`}
                        className="text-owly-primary hover:underline"
                      >
                        عرض المحادثة
                      </Link>
                    </div>

                    {item.lastResponse && (
                      <p className="text-xs text-owly-text-light/80 line-clamp-1 italic bg-owly-bg px-2.5 py-1 rounded border border-owly-border/50 mt-1">
                        جواب المساعد: "{item.lastResponse}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openAddToKnowledgeModal(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-owly-primary hover:bg-owly-primary-dark rounded-lg shadow-sm transition"
                    >
                      <BookPlus className="h-4 w-4" />
                      <span>إضافة إلى قاعدة المعرفة</span>
                    </button>
                    <button
                      onClick={() => void handleDismiss(item)}
                      disabled={dismissingKey === item.question}
                      title="حذف / تجاهل هذا السؤال"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition disabled:opacity-50"
                    >
                      {dismissingKey === item.question
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add to Knowledge Entry Modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-owly-surface border border-owly-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-owly-border flex items-center justify-between bg-owly-bg">
              <div className="flex items-center gap-2">
                <BookPlus className="h-5 w-5 text-owly-primary" />
                <h3 className="font-bold text-base text-owly-text">
                  إضافة إجابة إلى قاعدة المعرفة
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuestion(null)}
                className="p-1 rounded-lg text-owly-text-light hover:text-owly-text hover:bg-owly-border/40 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveKnowledgeEntry} className="p-6 space-y-4">
              {successMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-lg text-sm font-semibold">
                  {successMessage}
                </div>
              )}

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
                  الإجابة والمعلومات الدقيقة (Content)
                </label>
                <textarea
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="اكتب هنا الإجابة التفصيلية التي يجب أن يستخدمها الذكاء الاصطناعي..."
                  className="w-full px-3 py-2 text-sm bg-owly-bg border border-owly-border rounded-lg outline-none focus:border-owly-primary text-owly-text leading-6"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-owly-text mb-1">
                  الأولوية (Priority)
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 text-sm bg-owly-bg border border-owly-border rounded-lg text-owly-text"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-owly-border">
                <button
                  type="button"
                  onClick={() => setSelectedQuestion(null)}
                  className="px-4 py-2 text-xs font-semibold text-owly-text-light hover:text-owly-text rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-white bg-owly-primary hover:bg-owly-primary-dark rounded-lg shadow-sm transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>حفظ المقال في قاعدة المعرفة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
