"use client";

import { Header } from "@/components/layout/header";
import { FileText, Filter, RefreshCw, MessageCircle, Bot, Globe, MapPin, BarChart3, TrendingUp, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { formatRelativeTime } from "@/lib/utils";

interface AdminRequest {
  id: string;
  channel: string;
  type: string;
  recipientLevel: string;
  grade: string;
  province: string;
  printToken: string;
  status: string;
  createdAt: string;
}

interface DocStats {
  totalDocs: number;
  byType: Array<{ type: string; count: number }>;
  byProvince: Array<{ province: string; count: number }>;
  byChannel: Array<{ channel: string; count: number }>;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  ta3n_admin: { label: "طعن بخصوص النقطة الإدارية", emoji: "📊", color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800" },
  ta3n_movement: { label: "طعن في نتائج الحركة الانتقالية", emoji: "🔄", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
  demande_docs: { label: "طلب وثيقة إدارية", emoji: "📃", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
  conge_maladie: { label: "طلب رخصة المرض العادية", emoji: "🏥", color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
  taklif: { label: "طلب تسهيل مهمة نقابية", emoji: "🤝", color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800" },
  libre: { label: "طلب إداري", emoji: "✍️", color: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
};

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  whatsapp: MessageCircle,
  telegram: Bot,
  webchat: Globe,
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "واتساب (WhatsApp)",
  telegram: "تلغرام (Telegram)",
  webchat: "شات الويب",
};

export default function AdminRequestsPage() {
  const [rows, setRows] = useState<AdminRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<DocStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (filterChannel !== "all") params.set("channel", filterChannel);
      if (filterType !== "all") params.set("type", filterType);

      const res = await fetch(`/api/requests?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
      if (data.stats) setStats(data.stats);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalDocsCount = stats?.totalDocs || total;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header title="إحصائيات المراسلات والطلبات الإدارية" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-red-600" />
              لوحة إحصائيات المراسلات الإدارية
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              إحصائيات مدمجة حسب نوع الوثيقة والمديريات الإقليمية وقنوات الاستخدام (حماية تامة لخصوصية المنخرطين)
            </p>
          </div>

          <button
            onClick={fetchData}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-red-600" : ""}`} />
            تحديث البيانات
          </button>
        </div>

        {/* Global Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">إجمالي الوثائق المنشأة</div>
              <div className="text-3xl font-extrabold text-gray-900 dark:text-white">{totalDocsCount}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-600">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">عبر تطبيق واتساب</div>
              <div className="text-3xl font-extrabold text-green-600">
                {stats?.byChannel.find((c) => c.channel === "whatsapp")?.count || 0}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-950/50 flex items-center justify-center text-green-600">
              <MessageCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">أكثر المديريات تفاعلاً</div>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400 truncate max-w-[180px]">
                {stats?.byProvince[0]?.province || "—"}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600">
              <MapPin className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Section 1: Types & Provinces breakdown side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Document Types Ranking */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
              <TrendingUp className="w-5 h-5 text-red-600" />
              الوثائق الأكثر طلباً حسب النوع
            </h2>

            <div className="space-y-3">
              {stats?.byType && stats.byType.length > 0 ? (
                stats.byType.map((item) => {
                  const meta = TYPE_LABELS[item.type] || { label: item.type, emoji: "📄", color: "bg-gray-100 text-gray-700" };
                  const pct = totalDocsCount > 0 ? Math.round((item.count / totalDocsCount) * 100) : 0;
                  return (
                    <div key={item.type} className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-900/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{meta.emoji}</span>
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{meta.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                            {item.count} طلب
                          </span>
                          <span className="text-xs text-gray-400 font-medium">{pct}%</span>
                        </div>
                      </div>
                      {/* Visual progress bar */}
                      <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div className="bg-red-600 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">لا توجد بيانات مسجلة حالياً</div>
              )}
            </div>
          </div>

          {/* Regional / Province Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
              <MapPin className="w-5 h-5 text-blue-600" />
              توزيع الطلبات حسب المديريات الإقليمية
            </h2>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {stats?.byProvince && stats.byProvince.length > 0 ? (
                stats.byProvince.map((item, idx) => {
                  const pct = totalDocsCount > 0 ? Math.round((item.count / totalDocsCount) * 100) : 0;
                  return (
                    <div key={item.province} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-900/30">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.province}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {item.count} وثيقة
                        </span>
                        <span className="text-xs text-gray-400 font-medium min-w-[32px] text-left">{pct}%</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">لا توجد بيانات مسجلة حالياً</div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Recent Activity Summary (Anonymized & Clean) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              سجل التوليد الأخير (ملخص النشاط)
            </h2>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">القناة:</span>
                <select
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value)}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  <option value="all">الكل</option>
                  <option value="whatsapp">واتساب</option>
                  <option value="telegram">تلغرام</option>
                  <option value="webchat">شات الويب</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">النوع:</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  <option value="all">جميع الأنواع</option>
                  <option value="ta3n_admin">طعن في النقطة الإدارية</option>
                  <option value="ta3n_movement">طعن في الحركة الانتقالية</option>
                  <option value="demande_docs">طلب وثيقة إدارية</option>
                  <option value="conge_maladie">طلب رخصة مرض</option>
                  <option value="taklif">تسهيل مهمة نقابية</option>
                  <option value="libre">طلب إداري</option>
                </select>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {rows.length > 0 ? (
              rows.map((req) => {
                const meta = TYPE_LABELS[req.type] || { label: req.type, emoji: "📄", color: "bg-gray-100 text-gray-700" };
                const Icon = CHANNEL_ICONS[req.channel] || Globe;
                return (
                  <div key={req.id} className="p-4 flex items-center justify-between hover:bg-gray-50/70 dark:hover:bg-gray-900/30 transition">
                    <div className="flex items-center gap-3.5">
                      <span className="text-xl p-2 rounded-xl bg-gray-100 dark:bg-gray-700/50">{meta.emoji}</span>
                      <div>
                        <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{meta.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                          <span>المديرية: <strong className="text-gray-700 dark:text-gray-300">{req.province || "غير محددة"}</strong></span>
                          {req.grade && <span>• الإطار: {req.grade}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 font-medium">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{req.channel === "whatsapp" ? "WhatsApp" : req.channel === "telegram" ? "Telegram" : "Web"}</span>
                      </div>
                      <span className="text-gray-400 hidden sm:inline">{formatRelativeTime(req.createdAt)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-gray-400 text-sm">لا توجد طلبات تطابق الفلتر المحدد</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
