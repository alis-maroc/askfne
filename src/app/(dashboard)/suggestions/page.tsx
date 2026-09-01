"use client";

import { Header } from "@/components/layout/header";
import {
    Ticket,
    Search,
    CheckCircle,
    Circle,
    Clock,
    AlertCircle,
    Loader2,
    MessageSquare,
    ChevronDown,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Suggestion {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    createdAt: string;
    conversation?: {
        customerName?: string;
        channel?: string;
    };
    conversationId?: string;
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
    open: { label: "Ouvert", icon: Circle, color: "text-blue-600 bg-blue-50 border-blue-200" },
    in_progress: { label: "En cours", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
    resolved: { label: "Résolu", icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
    closed: { label: "Fermé", icon: AlertCircle, color: "text-slate-600 bg-slate-50 border-slate-200" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
    low: { label: "Faible", color: "text-slate-600 bg-slate-100" },
    medium: { label: "Moyen", color: "text-amber-600 bg-amber-100" },
    high: { label: "Élevé", color: "text-orange-600 bg-orange-100" },
    urgent: { label: "Urgent", color: "text-red-600 bg-red-100" },
};

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-MA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return formatDate(dateStr);
}

export default function SuggestionsPage() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

    const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchSuggestions = useCallback(async () => {
        try {
            setFetchError(null);
            const params = new URLSearchParams();
            params.set("type", "suggestion");
            if (statusFilter !== "all") params.set("status", statusFilter);

            const res = await fetch(`/api/tickets?${params.toString()}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setSuggestions(Array.isArray(data) ? data : data.data || []);
        } catch {
            setFetchError("Échec du chargement des suggestions. Veuillez réessayer.");
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchSuggestions();
    }, [fetchSuggestions]);

    const handleUpdateStatus = async (id: string, status: string) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/tickets/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error("Failed to update");
            setSelectedSuggestion(null);
            fetchSuggestions();
            showToast("Statut mis à jour avec succès");
        } catch {
            showToast("Échec de la mise à jour du statut", "error");
        } finally {
            setSaving(false);
        }
    };

    const filteredSuggestions = suggestions.filter((s) => {
        const query = searchQuery.toLowerCase();
        return (
            s.title.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            s.conversation?.customerName?.toLowerCase().includes(query)
        );
    });

    const openCount = suggestions.filter((s) => s.status === "open").length;
    const inProgressCount = suggestions.filter((s) => s.status === "in_progress").length;
    const resolvedCount = suggestions.filter((s) => s.status === "resolved").length;

    const channelLabels: Record<string, string> = {
        telegram: "Telegram",
        whatsapp: "WhatsApp",
        web: "Web Chat",
        webchat: "Web Chat",
    };

    return (
        <>
            <Header
                title="💡 Suggestions & Remarques"
                description="Consultez et gérez les suggestions et remarques envoyées par les utilisateurs via Telegram, WhatsApp et Web Chat"
            />

            <div className="flex-1 overflow-auto p-6">
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-4xl">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100">
                            <Circle className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-blue-700">{openCount}</p>
                            <p className="text-xs text-blue-600 font-medium">Suggestions ouvertes</p>
                        </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-100">
                            <Clock className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-amber-700">{inProgressCount}</p>
                            <p className="text-xs text-amber-600 font-medium">En cours de traitement</p>
                        </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-100">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-green-700">{resolvedCount}</p>
                            <p className="text-xs text-green-600 font-medium">Suggestions traitées</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6 max-w-4xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-owly-text-light" />
                        <input
                            type="text"
                            placeholder="Rechercher dans les suggestions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary transition-colors"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2.5 text-sm border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
                    >
                        <option value="all">Tous les statuts</option>
                        <option value="open">Ouvert</option>
                        <option value="in_progress">En cours</option>
                        <option value="resolved">Résolu</option>
                        <option value="closed">Fermé</option>
                    </select>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-owly-primary" />
                    </div>
                ) : fetchError ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center max-w-4xl">
                        <AlertCircle className="h-10 w-10 text-owly-danger mb-3" />
                        <p className="font-medium text-owly-text">{fetchError}</p>
                        <button
                            onClick={() => { setLoading(true); fetchSuggestions(); }}
                            className="mt-3 px-4 py-2 text-sm font-medium text-white bg-owly-primary rounded-lg hover:bg-owly-primary/90 transition-colors"
                        >
                            Réessayer
                        </button>
                    </div>
                ) : filteredSuggestions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center max-w-4xl">
                        <div className="p-4 rounded-full bg-owly-primary-50 mb-4">
                            <Ticket className="h-8 w-8 text-owly-primary" />
                        </div>
                        <p className="font-medium text-owly-text">Aucune suggestion trouvée</p>
                        <p className="text-sm text-owly-text-light mt-1">
                            Les suggestions envoyées par les utilisateurs apparaîtront ici.
                        </p>
                    </div>
                ) : (
                    <div className="bg-owly-surface rounded-xl border border-owly-border overflow-hidden max-w-4xl">
                        <table className="w-full">
                            <thead className="bg-owly-bg border-b border-owly-border">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-owly-text-light uppercase tracking-wider">
                                        Suggestion
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-owly-text-light uppercase tracking-wider hidden md:table-cell">
                                        Canal
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-owly-text-light uppercase tracking-wider hidden sm:table-cell">
                                        Statut
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-owly-text-light uppercase tracking-wider hidden lg:table-cell">
                                        Priorité
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-owly-text-light uppercase tracking-wider">
                                        Date
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-owly-border">
                                {filteredSuggestions.map((suggestion) => {
                                    const statusInfo = statusConfig[suggestion.status] || statusConfig.open;
                                    const StatusIcon = statusInfo.icon;
                                    const priorityInfo = priorityConfig[suggestion.priority] || priorityConfig.low;
                                    const channelLabel = channelLabels[suggestion.conversation?.channel || ""] || suggestion.conversation?.channel || "—";

                                    return (
                                        <tr
                                            key={suggestion.id}
                                            onClick={() => setSelectedSuggestion(suggestion)}
                                            className="hover:bg-owly-primary-50/50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium text-owly-text truncate max-w-[300px]">
                                                    {suggestion.title}
                                                </p>
                                                <p className="text-xs text-owly-text-light mt-0.5 truncate max-w-[300px]">
                                                    {suggestion.conversation?.customerName || "Anonyme"}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <span className="text-sm text-owly-text-light">
                                                    {channelLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell">
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                                                        statusInfo.color
                                                    )}
                                                >
                                                    <StatusIcon className="h-3 w-3" />
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 hidden lg:table-cell">
                                                <span
                                                    className={cn(
                                                        "px-2 py-0.5 rounded-full text-xs font-medium",
                                                        priorityInfo.color
                                                    )}
                                                >
                                                    {priorityInfo.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs text-owly-text-light">
                                                    {formatRelativeTime(suggestion.createdAt)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Detail Panel */}
            {selectedSuggestion && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => setSelectedSuggestion(null)}
                    />
                    <div className="relative w-full max-w-md bg-owly-surface border-l border-owly-border overflow-y-auto">
                        <div className="sticky top-0 bg-owly-surface border-b border-owly-border px-6 py-4 flex items-center justify-between z-10">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-owly-primary" />
                                <h3 className="font-semibold text-owly-text text-lg">Détail de la suggestion</h3>
                            </div>
                            <button
                                onClick={() => setSelectedSuggestion(null)}
                                className="p-1.5 hover:bg-owly-primary-50 rounded-lg transition-colors text-owly-text-light hover:text-owly-text"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Title */}
                            <div>
                                <h4 className="text-lg font-semibold text-owly-text">
                                    {selectedSuggestion.title}
                                </h4>
                                <p className="text-xs text-owly-text-light mt-1">
                                    Reçue le {formatDate(selectedSuggestion.createdAt)}
                                </p>
                            </div>

                            {/* Channel & Customer */}
                            <div className="flex gap-2 flex-wrap">
                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                                    {channelLabels[selectedSuggestion.conversation?.channel || ""] || selectedSuggestion.conversation?.channel || "Web"}
                                </span>
                                {selectedSuggestion.conversation?.customerName && (
                                    <span className="px-2.5 py-1 bg-slate-50 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
                                        {selectedSuggestion.conversation.customerName}
                                    </span>
                                )}
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-xs font-medium text-owly-text-light mb-1.5">
                                    Statut
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedSuggestion.status}
                                        onChange={(e) => handleUpdateStatus(selectedSuggestion.id, e.target.value)}
                                        disabled={saving}
                                        className="w-full appearance-none px-3 py-2.5 text-sm border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary pr-10"
                                    >
                                        <option value="open">🔵 Ouvert</option>
                                        <option value="in_progress">🟡 En cours de traitement</option>
                                        <option value="resolved">🟢 Résolu</option>
                                        <option value="closed">⚫ Fermé</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-owly-text-light pointer-events-none" />
                                </div>
                            </div>

                            {/* Priority */}
                            <div>
                                <label className="block text-xs font-medium text-owly-text-light mb-1.5">
                                    Priorité
                                </label>
                                <span
                                    className={cn(
                                        "inline-block px-2.5 py-1 rounded-full text-xs font-medium",
                                        priorityConfig[selectedSuggestion.priority]?.color || "bg-slate-100 text-slate-600"
                                    )}
                                >
                                    {priorityConfig[selectedSuggestion.priority]?.label || selectedSuggestion.priority}
                                </span>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-medium text-owly-text-light mb-1.5">
                                    Contenu de la suggestion
                                </label>
                                <div className="p-4 bg-owly-bg rounded-lg border border-owly-border">
                                    <p className="text-sm text-owly-text whitespace-pre-wrap leading-relaxed">
                                        {selectedSuggestion.description}
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 border-t border-owly-border">
                                <button
                                    onClick={() => setSelectedSuggestion(null)}
                                    className="w-full px-4 py-2.5 text-sm font-medium bg-owly-primary text-white rounded-lg hover:bg-owly-primary-dark transition-colors"
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div
                    className={cn(
                        "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-in slide-in-from-bottom-4 duration-300",
                        toast.type === "success"
                            ? "bg-owly-success text-white"
                            : "bg-owly-danger text-white"
                    )}
                >
                    {toast.type === "success" ? (
                        <CheckCircle className="h-4 w-4" />
                    ) : (
                        <AlertCircle className="h-4 w-4" />
                    )}
                    {toast.message}
                </div>
            )}
        </>
    );
}
