import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { OnboardingChecklist } from "@/components/ui/onboarding-checklist";
import { prisma } from "@/lib/prisma";
import {
  MessageSquare,
  Ticket,
  Phone,
  Mail,
  MessageCircle,
  CheckCircle,
  Clock,
  BookOpen,
  FileText,
  ExternalLink,
} from "lucide-react";
import { formatRelativeTime, getChannelLabel, getStatusColor } from "@/lib/utils";

async function getStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [
    totalConversations,
    activeConversations,
    totalTickets,
    openTickets,
    totalMessages,
    todayCount,
    last7DaysCount,
    recentConversations,
  ] = await Promise.all([
    prisma.conversation.count(),
    prisma.conversation.count({ where: { status: "active" } }),
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: "open" } }),
    prisma.message.count(),
    prisma.message.count({
      where: {
        role: "assistant",
        createdAt: { gte: startOfToday },
      },
    }),
    prisma.message.count({
      where: {
        role: "assistant",
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.conversation.findMany({
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { take: 1, orderBy: { createdAt: "desc" } },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  const resolvedConversations = await prisma.conversation.count({
    where: { status: "resolved" },
  });

  const resolutionRate =
    totalConversations > 0
      ? Math.round((resolvedConversations / totalConversations) * 100)
      : 0;

  return {
    totalConversations,
    activeConversations,
    totalTickets,
    openTickets,
    totalMessages,
    todayCount,
    last7DaysCount,
    resolutionRate,
    recentConversations,
  };
}

const channelIcons: Record<string, React.ElementType> = {
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
};

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <>
      <Header
        title="Dashboard"
        description="Overview of your customer support activity"
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* FNE Chatbot Guide Banner */}
        <div className="bg-gradient-to-r from-red-800 via-red-700 to-red-900 rounded-xl p-5 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b-4 border-amber-400">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 flex-shrink-0">
              <BookOpen className="h-6 w-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">دليل المجيب الآلي الذكي - FNE</h2>
                <span className="bg-amber-400/25 text-amber-200 border border-amber-400/40 text-[11px] px-2 py-0.5 rounded-full font-bold">
                  وثيقة رسمية
                </span>
              </div>
              <p className="text-white/80 text-xs mt-0.5">
                دليل تفصيلي شامل مصمم بالهوية النقابية (محاور الإجابة، الروابط الرقمية، والمصادر المعتمدة)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
            <a
              href="/guide-fne-chatbot.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-red-900 hover:bg-red-50 text-xs font-bold transition-all shadow-sm flex-1 md:flex-initial justify-center"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>تحميل ملف PDF</span>
            </a>
            <a
              href="/guide-fne-chatbot.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-all border border-white/20 flex-1 md:flex-initial justify-center"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>عرض صفحة الويب</span>
            </a>
            <a
              href="/web-chat"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-sm flex-1 md:flex-initial justify-center"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>تجربة الشات بوت</span>
            </a>
          </div>
        </div>

        <OnboardingChecklist />

        {/* API Tokens & Capacity Status Widget */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                🤖 État des Fournisseurs d'IA & Quotas de Tokens API
              </h3>
            </div>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full font-medium">
              Questions traitées aujourd'hui : <strong className="text-slate-900 dark:text-white">{stats.todayCount}</strong>
            </span>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full font-medium ml-4">
              Questions posées (7j) : <strong className="text-slate-900 dark:text-white">{stats.last7DaysCount}</strong>
            </span>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full font-medium ml-4">
              Questions posées (total) : <strong className="text-slate-900 dark:text-white">{stats.totalMessages}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Provider: Groq */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/20">
                    Fournisseur Principal
                  </span>
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200">Groq (Qwen 3.8-27B)</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
                  Actif 🟢
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pt-1">
                <div className="flex justify-between">
                  <span>Limite journalière (RPD) :</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">14 400 requêtes / jour</span>
                </div>
                <div className="flex justify-between">
                  <span>Tokens par minute (TPM) :</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">8 000 tokens / min</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-900 dark:text-white">Capacité restante aujourd'hui :</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">~{Math.max(0, 14400 - stats.todayCount).toLocaleString()} questions</span>
                </div>
              </div>
            </div>

            {/* Fallback Provider: OpenRouter */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs border border-blue-500/20">
                    Secours / Fallback
                  </span>
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200">OpenRouter (Minimax M3)</span>
                </div>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full">
                  Prêt 🔄
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pt-1">
                <div className="flex justify-between">
                  <span>Crédit / Type :</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Free Tier (Illimité)</span>
                </div>
                <div className="flex justify-between">
                  <span>Requêtes par minute (RPM) :</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">20 requêtes / min</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-900 dark:text-white">Coût supplémentaire :</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">0$ (100% Gratuit)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-center gap-2">
            <span>💡</span>
            <span>
              <strong>Note d'optimisation :</strong> Les requêtes sur les bureaux, l'organisation, les menus et formulaires administratifs sont exécutées <strong>directement via la base de données</strong> sans consommer de tokens API !
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Conversations"
            value={stats.totalConversations}
            icon={MessageSquare}
          />
          <StatCard
            title="Active Now"
            value={stats.activeConversations}
            icon={Clock}
            iconColor="bg-green-50 text-green-600"
          />
          <StatCard
            title="Open Tickets"
            value={stats.openTickets}
            icon={Ticket}
            iconColor="bg-orange-50 text-orange-600"
          />
          <StatCard
            title="Resolution Rate"
            value={`${stats.resolutionRate}%`}
            icon={CheckCircle}
            iconColor="bg-blue-50 text-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-owly-surface rounded-xl border border-owly-border">
            <div className="px-5 py-4 border-b border-owly-border">
              <h3 className="font-semibold text-owly-text">
                Recent Conversations
              </h3>
            </div>
            <div className="divide-y divide-owly-border">
              {stats.recentConversations.length === 0 ? (
                <div className="px-5 py-12 text-center text-owly-text-light">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No conversations yet</p>
                  <p className="text-sm mt-1">
                    Conversations will appear here once customers start reaching
                    out
                  </p>
                </div>
              ) : (
                stats.recentConversations.map((conv) => {
                  const ChannelIcon =
                    channelIcons[conv.channel] || MessageSquare;
                  const lastMessage = conv.messages[0];
                  return (
                    <div
                      key={conv.id}
                      className="px-5 py-3.5 hover:bg-owly-primary-50/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-owly-primary-50 text-owly-primary mt-0.5">
                          <ChannelIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm text-owly-text truncate">
                              {conv.customerName}
                            </p>
                            <span className="text-xs text-owly-text-light flex-shrink-0 ml-2">
                              {formatRelativeTime(conv.updatedAt)}
                            </span>
                          </div>
                          <p className="text-xs text-owly-text-light mt-0.5">
                            {getChannelLabel(conv.channel)} -{" "}
                            {conv._count.messages} messages
                          </p>
                          {lastMessage && (
                            <p className="text-sm text-owly-text-light mt-1 truncate">
                              {lastMessage.content}
                            </p>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(conv.status)}`}
                        >
                          {conv.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-owly-surface rounded-xl border border-owly-border">
              <div className="px-5 py-4 border-b border-owly-border">
                <h3 className="font-semibold text-owly-text">
                  Channel Overview
                </h3>
              </div>
              <div className="p-5 space-y-4">
                {[
                  {
                    name: "WhatsApp",
                    icon: MessageCircle,
                    color: "text-green-600",
                  },
                  { name: "Email", icon: Mail, color: "text-blue-600" },
                  { name: "Phone", icon: Phone, color: "text-purple-600" },
                ].map((channel) => (
                  <div
                    key={channel.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <channel.icon
                        className={`h-4 w-4 ${channel.color}`}
                      />
                      <span className="text-sm font-medium">
                        {channel.name}
                      </span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                      Disconnected
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-owly-surface rounded-xl border border-owly-border">
              <div className="px-5 py-4 border-b border-owly-border">
                <h3 className="font-semibold text-owly-text">Quick Stats</h3>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-owly-text-light">Total Messages</span>
                  <span className="font-medium">{stats.totalMessages}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-owly-text-light">Total Tickets</span>
                  <span className="font-medium">{stats.totalTickets}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-owly-text-light">
                    Avg. Resolution Rate
                  </span>
                  <span className="font-medium">{stats.resolutionRate}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
