"use client";

import { useEffect, useState, useCallback } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart, LineChart, DonutChart } from "@/components/ui/chart";
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  Star,
  Users,
  HelpCircle,
  Sparkles,
  Radio,
  Search,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ==================== TYPES ====================

interface TopQuestion {
  question: string;
  count: number;
  category: string;
  channels: string[];
  lastAskedAt: string;
  isUnanswered: boolean;
  unansweredCount: number;
}

interface AnalyticsData {
  conversationsPerDay: { date: string; count: number }[];
  channelBreakdown: { channel: string; count: number }[];
  hourlyActivity: { hour: string; count: number }[];
  avgResponseTime: number;
  resolutionRate: number;
  satisfactionAvg: number;
  ticketsByPriority: { priority: string; count: number }[];
  ticketsByStatus: { status: string; count: number }[];
  topCategories: { category: string; hitCount: number }[];
  teamPerformance: { member: string; ticketsResolved: number; avgTime: number }[];
  totalConversations: number;
  // Question Intelligence
  totalQuestionsCount: number;
  totalUnansweredQuestions: number;
  aiAnswerRate: number;
  questionsByCategory: { category: string; count: number }[];
  topQuestions: TopQuestion[];
}

type Period = "7d" | "30d" | "90d";

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "7 jours", value: "7d" },
  { label: "30 jours", value: "30d" },
  { label: "90 jours", value: "90d" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "#64748B",
  medium: "#F59E0B",
  high: "#C4956A",
  urgent: "#EF4444",
};

const STATUS_COLORS: Record<string, string> = {
  open: "#F59E0B",
  in_progress: "#4A7C9B",
  resolved: "#22C55E",
  closed: "#64748B",
  escalated: "#EF4444",
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "#22C55E",
  telegram: "#0284C7",
  web: "#8B5CF6",
  email: "#4A7C9B",
  phone: "#C4956A",
  chat: "#A8D0E6",
};

const CATEGORY_COLORS: Record<string, string> = {
  "النظام الأساسي للوظيفة العمومية": "#B51F2B",
  "مقرر السنة الدراسية": "#F59E0B",
  "المكاتب والتنظيم": "#0284C7",
  "القانون الأساسي للجامعة": "#10B981",
  "استفسارات عامة": "#64748B",
};

function formatMinutes(mins: number): string {
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const hrs = Math.floor(mins / 60);
  const rem = Math.round(mins % 60);
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function StatCardSkeleton() {
  return (
    <div className="bg-owly-surface rounded-xl border border-owly-border p-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-owly-border/40 rounded" />
        <div className="h-9 w-9 bg-owly-border/40 rounded-lg" />
      </div>
      <div className="mt-3 h-7 w-16 bg-owly-border/40 rounded" />
    </div>
  );
}

function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div
      className="bg-owly-surface rounded-xl border border-owly-border p-5 animate-pulse flex flex-col"
      style={{ minHeight: height + 60 }}
    >
      <div className="h-4 w-36 bg-owly-border/40 rounded mb-4" />
      <div className="flex-1 bg-owly-border/20 rounded" />
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("7d");
  const [questionSearch, setQuestionSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredQuestions = (data?.topQuestions || []).filter((q) => {
    const matchesSearch = q.question
      .toLowerCase()
      .includes(questionSearch.toLowerCase());
    const matchesCat =
      selectedCategoryFilter === "all" ||
      q.category === selectedCategoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="flex-1 overflow-y-auto w-full p-6 space-y-6 max-w-[1400px] mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-owly-text">Analytics & Intelligence</h1>
          <p className="text-sm text-owly-text-light mt-1">
            Suivi des performances et analyse approfondie des questions des utilisateurs
          </p>
        </div>

        {/* Period selector */}
        <div className="flex bg-owly-surface border border-owly-border rounded-lg p-1 shadow-sm">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                period === opt.value
                  ? "bg-owly-primary text-white"
                  : "text-owly-text-light hover:text-owly-text"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Stat cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Questions Posées"
            value={data.totalQuestionsCount.toLocaleString()}
            icon={HelpCircle}
            iconColor="bg-blue-50 text-blue-600"
          />
          <StatCard
            title="Taux de Réponse IA"
            value={`${data.aiAnswerRate}%`}
            icon={Sparkles}
            iconColor="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            title="Temps Moyen de Réponse"
            value={formatMinutes(data.avgResponseTime)}
            icon={Clock}
            iconColor="bg-amber-50 text-amber-600"
          />
          <StatCard
            title="Conversations Totales"
            value={data.totalConversations.toLocaleString()}
            icon={MessageSquare}
            iconColor="bg-owly-primary-50 text-owly-primary"
          />
        </div>
      ) : null}

      {/* Row 2: Line chart + Donut chart */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <LineChart
            title="Volume des conversations dans le temps"
            data={data.conversationsPerDay.map((d) => ({
              label: d.date.slice(5),
              value: d.count,
            }))}
            height={300}
            className="lg:col-span-2"
          />
          <DonutChart
            title="Répartition par Canal"
            data={data.channelBreakdown.map((d) => ({
              label: capitalizeFirst(d.channel),
              value: d.count,
              color: CHANNEL_COLORS[d.channel] || undefined,
            }))}
            height={300}
          />
        </div>
      ) : null}

      {/* Row 3: Question Themes & Peak Hours */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartSkeleton height={260} />
          <ChartSkeleton height={260} />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BarChart
            title="Répartition des Questions par Thématique"
            data={data.questionsByCategory.map((d) => ({
              label: d.category.length > 22 ? d.category.slice(0, 20) + "..." : d.category,
              value: d.count,
              color: CATEGORY_COLORS[d.category] || undefined,
            }))}
            height={260}
          />
          <BarChart
            title="Pics d'Affluence (Heures de la journée)"
            data={data.hourlyActivity.map((d) => ({
              label: d.hour,
              value: d.count,
              color: "#4A7C9B",
            }))}
            height={260}
          />
        </div>
      ) : null}

      {/* Row 4: TOP 30 DES QUESTIONS POSÉES */}
      <div className="bg-owly-surface rounded-xl border border-owly-border p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-owly-primary-50 text-owly-primary rounded-lg">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-owly-text">
                Top 30 des Questions les Plus Posées (Question Intelligence)
              </h3>
              <p className="text-xs text-owly-text-light">
                Classement des 30 requêtes les plus récurrentes sur la période sélectionnée
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-owly-text-light" />
              <input
                type="text"
                placeholder="Filtrer les questions..."
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-owly-bg border border-owly-border rounded-lg outline-none text-owly-text placeholder:text-owly-text-light"
              />
            </div>

            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              aria-label="Filtrer par thématique"
              className="px-3 py-1.5 text-xs bg-owly-bg border border-owly-border rounded-lg outline-none text-owly-text"
            >
              <option value="all">Toutes les thématiques</option>
              <option value="النظام الأساسي للوظيفة العمومية">الوظيفة العمومية</option>
              <option value="مقرر السنة الدراسية">مقرر السنة الدراسية</option>
              <option value="المكاتب والتنظيم">المكاتب والتنظيم</option>
              <option value="القانون الأساسي للجامعة">القانون الأساسي</option>
              <option value="استفسارات عامة">عامة</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-owly-text-light animate-pulse">
            Chargement des questions...
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="py-12 text-center text-xs text-owly-text-light">
            Aucune question trouvée pour les critères sélectionnés.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-owly-border text-left">
                  <th className="pb-3 font-semibold text-owly-text-light w-12 text-center">#</th>
                  <th className="pb-3 font-semibold text-owly-text-light">Question Posée</th>
                  <th className="pb-3 font-semibold text-owly-text-light">Thématique</th>
                  <th className="pb-3 font-semibold text-owly-text-light">Canaux</th>
                  <th className="pb-3 font-semibold text-owly-text-light text-center">Fréquence</th>
                  <th className="pb-3 font-semibold text-owly-text-light text-center">Statut IA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-owly-border/50">
                {filteredQuestions.map((q, index) => (
                  <tr key={index} className="hover:bg-owly-bg/40 transition">
                    <td className="py-3 text-center text-xs font-bold text-owly-text-light">
                      {index + 1}
                    </td>
                    <td className="py-3 font-semibold text-owly-text max-w-md break-words">
                      {q.question}
                    </td>
                    <td className="py-3 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-owly-bg border border-owly-border text-owly-text">
                        {q.category}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-owly-text-light">
                      <div className="flex items-center gap-1">
                        {q.channels.map((ch) => (
                          <span
                            key={ch}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-owly-border/40 text-owly-text"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-owly-primary-50 text-owly-primary text-xs font-bold">
                        {q.count} {q.count > 1 ? "fois" : "fois"}
                      </span>
                    </td>
                    <td className="py-3 text-center text-xs">
                      {q.isUnanswered ? (
                        <Link
                          href="/knowledge/unanswered"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-semibold hover:bg-red-100 transition"
                        >
                          ⚠️ Sans réponse
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                          ✅ Répondu
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
