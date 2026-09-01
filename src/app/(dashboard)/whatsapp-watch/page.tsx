"use client";

import { Header } from "@/components/layout/header";
import {
  Users,
  MessageSquare,
  HelpCircle,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  Star,
  BookPlus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Eye,
  Tag,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

interface WatchMessage {
  id: string;
  groupJid: string;
  groupName: string;
  senderName: string;
  senderJid: string;
  content: string;
  isQuestion: boolean;
  topic: string;
  keywords: string[];
  sentiment: string;
  starred: boolean;
  convertedToKb: boolean;
  createdAt: string;
}

interface GroupInfo {
  groupJid: string;
  groupName: string;
  count: number;
}

interface TopicStat {
  name: string;
  count: number;
}

interface WatchData {
  items: WatchMessage[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats: {
    totalMessages: number;
    totalQuestions: number;
    totalGroups: number;
    topTopics: TopicStat[];
    topKeywords: { name: string; count: number }[];
  };
  groups: GroupInfo[];
}

export default function WhatsAppWatchPage() {
  const [data, setData] = useState<WatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTopic, setFilterTopic] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterQuestionsOnly, setFilterQuestionsOnly] = useState(false);
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTopic !== "all") params.set("topic", filterTopic);
      if (filterGroup !== "all") params.set("groupJid", filterGroup);
      if (filterQuestionsOnly) params.set("isQuestion", "true");
      if (filterStarredOnly) params.set("starred", "true");
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("page", String(page));
      params.set("limit", "30");

      const res = await fetch(`/api/whatsapp-watch?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load group watch data:", err);
    } finally {
      setLoading(false);
    }
  }, [filterTopic, filterGroup, filterQuestionsOnly, filterStarredOnly, searchQuery, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleStar = async (id: string, currentStarred: boolean) => {
    try {
      await fetch("/api/whatsapp-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_star", id, starred: !currentStarred }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === id ? { ...item, starred: !currentStarred } : item
          ),
        };
      });
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الرسالة من سجل الرصد؟")) return;
    try {
      await fetch("/api/whatsapp-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.filter((item) => item.id !== id),
        };
      });
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  const totalCaptured = data?.stats.totalMessages ?? 0;
  const totalQuestions = data?.stats.totalQuestions ?? 0;
  const totalGroups = data?.stats.totalGroups ?? 0;
  const topTopic = data?.stats.topTopics?.[0]?.name ?? "في انتظار الرصد...";

  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header title="Veille Groupes WhatsApp 👥" />

      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Banner: Mode status */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-[#1e293b] rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Mode Veille Silencieuse Actif (Écoute Seule)
                </span>
                <span className="text-xs text-white/70">0 Spam • Aucune intrusion</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                رصد ذكي لمجموعات واتساب التابعة للجامعة FNE
              </h2>
              <p className="text-sm text-white/80 max-w-2xl leading-relaxed">
                يقوم النظام بالتقاط وتحليل الأسئلة والاهتمامات النقابية والإدارية المطروحة في المجموعات بهدوء، لمساعدتكم في معرفة انشغالات المناضلين وإثراء قاعدة المعرفة بالمواضيع الأكثر طلباً.
              </p>
            </div>
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition border border-white/15 backdrop-blur-sm self-start md:self-auto"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span>تحديث البيانات</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">الرسائل المرصودة</span>
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-800">{totalCaptured}</div>
              <p className="text-xs text-slate-500 mt-0.5">محادثات تم التقاطها وتحليلها</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">الأسئلة والاستفسارات</span>
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-amber-600">{totalQuestions}</div>
              <p className="text-xs text-slate-500 mt-0.5">سؤال بحاجة لمقالات رسمية</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">المجموعات المتصلة</span>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-800">{totalGroups}</div>
              <p className="text-xs text-slate-500 mt-0.5">مجموعة تحت المتابعة</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">الموضوع الأكثر تداولاً</span>
              <div className="w-9 h-9 rounded-lg bg-rose-50 text-[#b51f2b] flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-slate-800 truncate" title={topTopic}>
                {topTopic}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">اهتمام ميداني بارز هذا الأسبوع</p>
            </div>
          </div>
        </div>

        {/* Hot Topic Chips */}
        {data?.stats.topTopics && data.stats.topTopics.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">المواضيع الأكثر نقاشاً (اضغط للتصفية):</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setFilterTopic("all"); setPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  filterTopic === "all"
                    ? "bg-[#b51f2b] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                الكل ({data.stats.totalMessages})
              </button>
              {data.stats.topTopics.map((top) => (
                <button
                  key={top.name}
                  type="button"
                  onClick={() => { setFilterTopic(top.name); setPage(1); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                    filterTopic === top.name
                      ? "bg-[#b51f2b] text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <span>{top.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterTopic === top.name ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                  }`}>
                    {top.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters Bar */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search */}
            <div className="relative md:col-span-4">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="بحث في محتوى الرسائل أو الكلمات المفتاحية..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full pl-3 pr-9 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/20 focus:border-[#b51f2b]"
              />
            </div>

            {/* Filter by Group */}
            <div className="md:col-span-3">
              <select
                value={filterGroup}
                onChange={(e) => { setFilterGroup(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/20 focus:border-[#b51f2b]"
              >
                <option value="all">كافة المجموعات ({data?.groups.length || 0})</option>
                {data?.groups.map((g) => (
                  <option key={g.groupJid} value={g.groupJid}>
                    {g.groupName} ({g.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div className="md:col-span-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setFilterQuestionsOnly(!filterQuestionsOnly); setPage(1); }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                  filterQuestionsOnly
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>الأسئلة فقط ❓</span>
              </button>

              <button
                type="button"
                onClick={() => { setFilterStarredOnly(!filterStarredOnly); setPage(1); }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                  filterStarredOnly
                    ? "bg-amber-100 text-amber-900 border-amber-300 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${filterStarredOnly ? "fill-amber-500 text-amber-500" : ""}`} />
                <span>المميزة ⭐</span>
              </button>
            </div>
          </div>
        </div>

        {/* Message Feed / Table */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-600" />
              <span>سجل الرصد المباشر</span>
              <span className="text-xs font-normal text-slate-400">
                (يظهر {data?.items.length || 0} من أصل {data?.pagination.total || 0})
              </span>
            </h3>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#b51f2b]" />
              <p className="text-sm">جاري تحميل سجل الرصد...</p>
            </div>
          ) : !data?.items || data.items.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Radio className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-600">لا توجد رسائل مسجلة مطابقة للبحث</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                بمجرد وصول رسائل أو نقاشات في مجموعات واتساب التي يتواجد بها رقم المجيب الآلي، سيتم تحليلها وتصنيفها وعرضها هنا فوراً.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <div
                  key={item.id}
                  className="p-5 hover:bg-slate-50/70 transition flex flex-col md:flex-row items-start justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    {/* Header: Group, Sender, Tags */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-500" />
                        <span>{item.groupName}</span>
                      </span>

                      <span className="text-slate-500 font-medium">
                        بواسطة {item.senderName}
                      </span>

                      <span className="text-slate-400 text-[11px]">
                        • {formatRelativeTime(item.createdAt)}
                      </span>

                      <span className="bg-blue-50 text-blue-700 border border-blue-200/60 px-2 py-0.5 rounded text-[11px] font-semibold">
                        {item.topic}
                      </span>

                      {item.isQuestion && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-bold">
                          ❓ استفسار
                        </span>
                      )}

                      {item.sentiment === "urgent" && (
                        <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          ⚠️ استعجال
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <p className="text-sm text-slate-800 leading-relaxed font-normal whitespace-pre-wrap text-justify">
                      {item.content}
                    </p>

                    {/* Keywords */}
                    {item.keywords && item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {item.keywords.map((kw, i) => (
                          <span
                            key={i}
                            className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => toggleStar(item.id, item.starred)}
                      title={item.starred ? "إزالة من المفضلة" : "تمييز بنجمة"}
                      className={`p-2 rounded-lg border transition ${
                        item.starred
                          ? "bg-amber-50 border-amber-200 text-amber-500"
                          : "border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      }`}
                    >
                      <Star className={`w-4 h-4 ${item.starred ? "fill-amber-400" : ""}`} />
                    </button>

                    <Link
                      href={`/knowledge?new=1&title=${encodeURIComponent(item.content.slice(0, 90))}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#b51f2b] hover:bg-[#9c1924] text-white text-xs font-bold rounded-lg shadow-sm transition"
                      title="تحويل لسؤال في قاعدة المعرفة"
                    >
                      <BookPlus className="w-3.5 h-3.5" />
                      <span>إضافة لقاعدة المعرفة</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => deleteMessage(item.id)}
                      title="حذف"
                      className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>صفحة {data.pagination.page} من {data.pagination.totalPages}</span>
              <div className="flex gap-1">
                <button
                  disabled={data.pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 font-medium"
                >
                  السابق
                </button>
                <button
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 font-medium"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
