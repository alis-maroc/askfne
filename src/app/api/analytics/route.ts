import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "7d":
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

import { isAssistantRefusal } from "@/lib/ai/refusal-detector";

function classifyQuestionCategory(text: string): string {
  const lower = text.toLowerCase();
  if (
    [
      "ترقية", "ترقي", "رتبة", "درجة", "سلم", "تنقيط", "رخصة", "رخص", "مرض",
      "عقوبة", "عقوبات", "تأديب", "إلحاق", "استيداع", "تقاعد", "أجرة", "وظيفة", "موظف"
    ].some((k) => lower.includes(k))
  ) {
    return "النظام الأساسي للوظيفة العمومية";
  }
  if (
    [
      "عطلة", "عطل", "امتحان", "امتحانات", "مراقبة مستمرة", "دخول مدرسي",
      "سنة دراسية", "مقرر", "تاريخ"
    ].some((k) => lower.includes(k))
  ) {
    return "مقرر السنة الدراسية";
  }
  if (
    [
      "مكتب", "مكاتب", "كاتب", "إقليمي", "جهوي", "وطني", "تأسيس",
      "انخراط", "هاتف", "رقم", "تيزنيت", "فاس", "الرباط", "الدار البيضاء"
    ].some((k) => lower.includes(k))
  ) {
    return "المكاتب والتنظيم";
  }
  if (
    [
      "قانون", "أساسي", "أهداف", "فصل", "مادة", "مؤتمر", "مجلس وطني",
      "لجنة إدارية", "جامعة"
    ].some((k) => lower.includes(k))
  ) {
    return "القانون الأساسي للجامعة";
  }
  return "استفسارات عامة";
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "analytics:read");
  if (!isAuthenticated(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "7d";
  const periodStart = getPeriodStart(period);

  const [
    conversations,
    allConversations,
    channelGroups,
    ticketsByPriority,
    ticketsByStatus,
    categories,
    teamMembers,
    messages,
    periodConversationsWithMessages,
  ] = await Promise.all([
    // Conversations in period
    prisma.conversation.findMany({
      where: { createdAt: { gte: periodStart } },
      select: { id: true, createdAt: true, satisfaction: true, status: true, channel: true },
    }),

    // All conversations (for resolution rate)
    prisma.conversation.findMany({
      select: { status: true },
    }),

    // Channel breakdown in period
    prisma.conversation.groupBy({
      by: ["channel"],
      where: { createdAt: { gte: periodStart } },
      _count: { id: true },
    }),

    // Tickets by priority in period
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { createdAt: { gte: periodStart } },
      _count: { id: true },
    }),

    // Tickets by status in period
    prisma.ticket.groupBy({
      by: ["status"],
      where: { createdAt: { gte: periodStart } },
      _count: { id: true },
    }),

    // Top categories by entry count
    prisma.category.findMany({
      select: { name: true, _count: { select: { entries: true } } },
      orderBy: { entries: { _count: "desc" } },
      take: 8,
    }),

    // Team members with their resolved tickets in period
    prisma.teamMember.findMany({
      select: {
        name: true,
        tickets: {
          where: {
            createdAt: { gte: periodStart },
          },
          select: { status: true, createdAt: true, updatedAt: true },
        },
      },
    }),

    // Messages in period for response time estimation
    prisma.message.findMany({
      where: { createdAt: { gte: periodStart } },
      select: {
        conversationId: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),

    // Detailed conversation messages for question mining
    prisma.conversation.findMany({
      where: { createdAt: { gte: periodStart } },
      select: {
        id: true,
        channel: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
      take: 500,
    }),
  ]);

  // -- Conversations per day --
  const dayMap: Record<string, number> = {};
  const dayCount = period === "90d" ? 90 : period === "30d" ? 30 : 7;
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(periodStart.getTime() + i * 24 * 60 * 60 * 1000);
    dayMap[formatDateKey(d)] = 0;
  }
  for (const c of conversations) {
    const key = formatDateKey(new Date(c.createdAt));
    if (key in dayMap) dayMap[key]++;
  }
  const conversationsPerDay = Object.entries(dayMap).map(([date, count]) => ({
    date,
    count,
  }));

  // -- Channel breakdown --
  const channelBreakdown = channelGroups.map((g) => ({
    channel: g.channel,
    count: g._count.id,
  }));

  // -- Hourly Activity (Peak Hours: 0 to 23) --
  const hourMap: number[] = new Array(24).fill(0);
  for (const m of messages) {
    const hour = new Date(m.createdAt).getHours();
    hourMap[hour]++;
  }
  const hourlyActivity = hourMap.map((count, hour) => ({
    hour: `${hour.toString().padStart(2, "0")}:00`,
    count,
  }));

  // -- Avg response time --
  const convFirstResponse: Record<string, number> = {};
  const convStart: Record<string, Date> = {};
  for (const m of messages) {
    if ((m.role === "user" || m.role === "customer") && !convStart[m.conversationId]) {
      convStart[m.conversationId] = new Date(m.createdAt);
    }
    if (
      m.role === "assistant" &&
      convStart[m.conversationId] &&
      !convFirstResponse[m.conversationId]
    ) {
      const diffMs =
        new Date(m.createdAt).getTime() -
        convStart[m.conversationId].getTime();
      convFirstResponse[m.conversationId] = diffMs / 60000;
    }
  }
  const responseTimes = Object.values(convFirstResponse);
  const avgResponseTime =
    responseTimes.length > 0
      ? Math.round(
          (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) *
            10
        ) / 10
      : 0;

  // -- Resolution rate --
  const resolved = allConversations.filter(
    (c) => c.status === "resolved" || c.status === "closed"
  ).length;
  const resolutionRate =
    allConversations.length > 0
      ? Math.round((resolved / allConversations.length) * 100)
      : 0;

  // -- Satisfaction average --
  const rated = conversations.filter((c) => c.satisfaction != null);
  const satisfactionAvg =
    rated.length > 0
      ? Math.round(
          (rated.reduce((sum, c) => sum + (c.satisfaction ?? 0), 0) /
            rated.length) *
            10
        ) / 10
      : 0;

  // -- Question Analytics & Top 30 Questions --
  const questionMap = new Map<
    string,
    {
      question: string;
      count: number;
      category: string;
      channels: Set<string>;
      lastAskedAt: Date;
      isUnanswered: boolean;
      unansweredCount: number;
    }
  >();

  const categoryCountMap: Record<string, number> = {
    "النظام الأساسي للوظيفة العمومية": 0,
    "مقرر السنة الدراسية": 0,
    "المكاتب والتنظيم": 0,
    "القانون الأساسي للجامعة": 0,
    "استفسارات عامة": 0,
  };

  let totalQuestionsCount = 0;
  let totalUnansweredQuestions = 0;

  for (const conv of periodConversationsWithMessages) {
    const msgs = conv.messages;
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role === "customer" || msg.role === "user") {
        const text = msg.content.trim();
        // Ignore single-digit navigation choices or greetings
        if (["0", "1", "2", "3", "4"].includes(text) || text.length < 3) continue;

        totalQuestionsCount++;
        const category = classifyQuestionCategory(text);
        categoryCountMap[category] = (categoryCountMap[category] || 0) + 1;

        // Check the assistant's immediate response
        let isUnanswered = false;
        if (i + 1 < msgs.length && msgs[i + 1].role === "assistant") {
          const reply = msgs[i + 1].content || "";
          isUnanswered = isAssistantRefusal(reply);
        }

        if (isUnanswered) totalUnansweredQuestions++;

        const normKey = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        const existing = questionMap.get(normKey);
        if (existing) {
          existing.count++;
          existing.channels.add(conv.channel || "web");
          if (isUnanswered) existing.unansweredCount++;
          if (msg.createdAt > existing.lastAskedAt) {
            existing.lastAskedAt = msg.createdAt;
            existing.isUnanswered = isUnanswered;
          }
        } else {
          questionMap.set(normKey, {
            question: text,
            count: 1,
            category,
            channels: new Set([conv.channel || "web"]),
            lastAskedAt: msg.createdAt,
            isUnanswered,
            unansweredCount: isUnanswered ? 1 : 0,
          });
        }
      }
    }
  }

  // Extract Top 30 questions
  const topQuestions = Array.from(questionMap.values())
    .map((item) => ({
      ...item,
      channels: Array.from(item.channels),
    }))
    .sort((a, b) => b.count - a.count || b.lastAskedAt.getTime() - a.lastAskedAt.getTime())
    .slice(0, 30);

  const questionsByCategory = Object.entries(categoryCountMap)
    .filter(([_, count]) => count > 0)
    .map(([category, count]) => ({
      category,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const topCategories = categories.map((c) => ({
    category: c.name,
    hitCount: c._count.entries,
  }));

  const teamPerformance = teamMembers
    .map((tm) => {
      const resolvedTickets = tm.tickets.filter(
        (t) => t.status === "resolved" || t.status === "closed"
      );
      const times = resolvedTickets.map(
        (t) =>
          (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) /
          60000
      );
      const avg =
        times.length > 0
          ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
          : 0;
      return {
        member: tm.name,
        ticketsResolved: resolvedTickets.length,
        avgTime: avg,
      };
    })
    .filter((t) => t.ticketsResolved > 0)
    .sort((a, b) => b.ticketsResolved - a.ticketsResolved);

  return NextResponse.json({
    conversationsPerDay,
    channelBreakdown,
    hourlyActivity,
    avgResponseTime,
    resolutionRate,
    satisfactionAvg,
    ticketsByPriority: ticketsByPriority.map((g) => ({
      priority: g.priority,
      count: g._count.id,
    })),
    ticketsByStatus: ticketsByStatus.map((g) => ({
      status: g.status,
      count: g._count.id,
    })),
    topCategories,
    teamPerformance,
    totalConversations: conversations.length,
    // Question intelligence
    totalQuestionsCount,
    totalUnansweredQuestions,
    aiAnswerRate:
      totalQuestionsCount > 0
        ? Math.round(
            ((totalQuestionsCount - totalUnansweredQuestions) /
              totalQuestionsCount) *
              100
          )
        : 100,
    questionsByCategory,
    topQuestions,
  });
}
