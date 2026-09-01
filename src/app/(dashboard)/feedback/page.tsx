"use client";

import { Header } from "@/components/layout/header";
import { ThumbsUp, ThumbsDown, Filter, RefreshCw, CheckCircle, MessageCircle, Bot, Globe, BookPlus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

interface FeedbackItem {
  id: string;
  channel: string;
  conversationId: string | null;
  messageId: string | null;
  question: string;
  rating: "positive" | "negative";
  reviewed: boolean;
  createdAt: string;
}

interface FeedbackStats {
  items: FeedbackItem[];
  total: number;
  positiveCount: number;
  negativeCount: number;
  satisfactionRate: number | null;
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  whatsapp: MessageCircle,
  telegram: Bot,
  webchat: Globe,
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  webchat: "Web Chat",
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "text-green-700 bg-green-50 border-green-200",
  telegram: "text-blue-700 bg-blue-50 border-blue-200",
  webchat: "text-violet-700 bg-violet-50 border-violet-200",
};

export default function FeedbackPage() {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [filterUnreviewed, setFilterUnreviewed] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterChannel !== "all") params.set("channel", filterChannel);
      if (filterRating !== "all") params.set("rating", filterRating);
      if (filterUnreviewed) params.set("unreviewed", "true");

      const res = await fetch(`/api/feedback?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterRating, filterUnreviewed]);

  useEffect(() => {
    void fetchFeedback();
  }, [fetchFeedback]);

  const markReviewed = async (id: string) => {
    setMarkingId(id);
    try {
      await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await fetchFeedback();
    } finally {
      setMarkingId(null);
    }
  };

  const satisfactionPct = stats?.satisfactionRate ?? 0;
  const satisfactionColor =
    satisfactionPct >= 75
      ? "text-green-600"
      : satisfactionPct >= 50
      ? "text-amber-500"
      : "text-red-500";

  return (
    <div className="flex flex-col h-full">
      <Header title="Feedback Utilisateurs 👍👎" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Stats Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total</p>
            <p className="mt-1 text-3xl font-bold text-gray-800">{stats?.total ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-0.5">feedbacks reçus</p>
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-500">Positifs 👍</p>
            <p className="mt-1 text-3xl font-bold text-green-700">{stats?.positiveCount ?? "—"}</p>
            <p className="text-xs text-green-500 mt-0.5">réponses utiles</p>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Négatifs 👎</p>
            <p className="mt-1 text-3xl font-bold text-red-600">{stats?.negativeCount ?? "—"}</p>
            <p className="text-xs text-red-400 mt-0.5">à améliorer</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Satisfaction</p>
            <p className={`mt-1 text-3xl font-bold ${satisfactionColor}`}>
              {stats?.satisfactionRate !== null && stats?.satisfactionRate !== undefined
                ? `${stats.satisfactionRate}%`
                : "—"}
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  satisfactionPct >= 75 ? "bg-green-500" : satisfactionPct >= 50 ? "bg-amber-400" : "bg-red-400"
                }`}
                style={{ width: `${satisfactionPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Filters ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Filter className="h-4 w-4 text-gray-400 shrink-0" />

          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="all">Tous les canaux</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="webchat">Web Chat</option>
          </select>

          <select
            value={filterRating}
            onChange={(e) => setFilterRating(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="all">Toutes les notes</option>
            <option value="positive">👍 Positifs seulement</option>
            <option value="negative">👎 Négatifs seulement</option>
          </select>

          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
            <input
              type="checkbox"
              checked={filterUnreviewed}
              onChange={(e) => setFilterUnreviewed(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            />
            Non revus uniquement
          </label>

          <button
            onClick={() => void fetchFeedback()}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </button>
        </div>

        {/* ── Table ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Chargement...
            </div>
          ) : !stats?.items.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ThumbsUp className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Aucun feedback trouvé</p>
              <p className="text-xs mt-1">Les feedbacks des utilisateurs apparaîtront ici</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-left">Canal</th>
                  <th className="px-4 py-3 text-left">Question posée</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.items.map((item) => {
                  const ChannelIcon = CHANNEL_ICONS[item.channel] ?? MessageCircle;
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-gray-50 ${item.reviewed ? "opacity-50" : ""}`}
                    >
                      {/* Rating */}
                      <td className="px-4 py-3">
                        {item.rating === "positive" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                            <ThumbsUp className="h-3 w-3" /> مفيد
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                            <ThumbsDown className="h-3 w-3" /> غير كافٍ
                          </span>
                        )}
                      </td>

                      {/* Channel */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            CHANNEL_COLORS[item.channel] ?? "text-gray-600 bg-gray-50 border-gray-200"
                          }`}
                        >
                          <ChannelIcon className="h-3 w-3" />
                          {CHANNEL_LABELS[item.channel] ?? item.channel}
                        </span>
                      </td>

                      {/* Question */}
                      <td className="px-4 py-3 max-w-xs">
                        {item.question ? (
                          <p
                            dir="rtl"
                            className="text-gray-700 truncate text-right"
                            title={item.question}
                          >
                            {item.question}
                          </p>
                        ) : (
                          <span className="text-gray-300 italic text-xs">—</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {formatRelativeTime(item.createdAt)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {item.reviewed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                            Revu
                          </span>
                        ) : (
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" title="En attente de révision" />
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.question && (
                            <Link
                              href={`/knowledge?new=1&title=${encodeURIComponent(item.question)}`}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                              title="إنشاء مدخل جديد في قاعدة المعرفة لهذا السؤال"
                            >
                              <BookPlus className="h-3 w-3" />
                              <span>إضافة كـ Q/R</span>
                            </Link>
                          )}
                          {!item.reviewed && (
                            <button
                              onClick={() => void markReviewed(item.id)}
                              disabled={markingId === item.id}
                              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-40"
                            >
                              {markingId === item.id ? "..." : "Revu ✓"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Top problematic questions ────────────────────────── */}
        {(stats?.items ?? []).filter((i) => i.rating === "negative" && i.question).length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
              <ThumbsDown className="h-4 w-4" />
              Questions nécessitant amélioration ({stats!.items.filter((i) => i.rating === "negative" && i.question).length})
            </h3>
            <ul className="space-y-2">
              {stats!.items
                .filter((i) => i.rating === "negative" && i.question)
                .slice(0, 10)
                .map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm bg-white/70 p-2 rounded-lg border border-red-200">
                    <span className="text-red-400 shrink-0">•</span>
                    <span dir="rtl" className="text-red-900 font-medium text-right flex-1">
                      {item.question}
                    </span>
                    <span className="text-xs text-red-500 bg-red-100/60 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                      {CHANNEL_LABELS[item.channel] ?? item.channel}
                    </span>
                    <Link
                      href={`/knowledge?new=1&title=${encodeURIComponent(item.question)}`}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <BookPlus className="h-3 w-3" />
                      <span>🪄 إضافة كـ Q/R</span>
                    </Link>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-red-500">
              💡 Ces questions devraient être enrichies dans la base de connaissances pour améliorer les réponses futures.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
