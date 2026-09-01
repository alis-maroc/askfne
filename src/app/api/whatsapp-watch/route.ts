import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topic = searchParams.get("topic") || "";
    const isQuestionOnly = searchParams.get("isQuestion") === "true";
    const starredOnly = searchParams.get("starred") === "true";
    const groupJid = searchParams.get("groupJid") || "";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "30", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (topic && topic !== "all") {
      where.topic = topic;
    }
    if (isQuestionOnly) {
      where.isQuestion = true;
    }
    if (starredOnly) {
      where.starred = true;
    }
    if (groupJid && groupJid !== "all") {
      where.groupJid = groupJid;
    }
    if (search.trim()) {
      where.content = { contains: search.trim(), mode: "insensitive" };
    }

    const [items, total, totalQuestions, allRows] = await Promise.all([
      (prisma as any).groupWatchMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      (prisma as any).groupWatchMessage.count({ where }),
      (prisma as any).groupWatchMessage.count({ where: { isQuestion: true } }),
      (prisma as any).groupWatchMessage.findMany({
        select: {
          groupJid: true,
          groupName: true,
          topic: true,
          keywords: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    ]);

    // Aggregate unique groups
    const groupsMap = new Map<string, { groupJid: string; groupName: string; count: number }>();
    const topicCounts: Record<string, number> = {};
    const keywordCounts: Record<string, number> = {};

    for (const row of allRows as Array<{ groupJid: string; groupName: string; topic: string; keywords?: string[] }>) {
      // Group count
      const existingGrp = groupsMap.get(row.groupJid) || {
        groupJid: row.groupJid,
        groupName: row.groupName || "مجموعة واتساب",
        count: 0,
      };
      existingGrp.count += 1;
      groupsMap.set(row.groupJid, existingGrp);

      // Topic count
      if (row.topic) {
        topicCounts[row.topic] = (topicCounts[row.topic] || 0) + 1;
      }

      // Keyword count
      if (Array.isArray(row.keywords)) {
        for (const kw of row.keywords) {
          if (kw) {
            keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
          }
        }
      }
    }

    const topTopics = Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const topKeywords = Object.entries(keywordCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const groups = Array.from(groupsMap.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalMessages: allRows.length,
        totalQuestions,
        totalGroups: groups.length,
        topTopics,
        topKeywords,
      },
      groups,
    });
  } catch (error) {
    logger.error("[API/whatsapp-watch] Error fetching watch messages:", { error: String(error) });
    return NextResponse.json({ error: "Failed to fetch group watch messages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, starred, convertedToKb } = body;

    if (!id && action !== "seed_demo") {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    if (action === "toggle_star") {
      const updated = await (prisma as any).groupWatchMessage.update({
        where: { id },
        data: { starred: Boolean(starred) },
      });
      return NextResponse.json({ success: true, updated });
    }

    if (action === "mark_converted") {
      const updated = await (prisma as any).groupWatchMessage.update({
        where: { id },
        data: { convertedToKb: Boolean(convertedToKb) },
      });
      return NextResponse.json({ success: true, updated });
    }

    if (action === "delete") {
      await (prisma as any).groupWatchMessage.delete({
        where: { id },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    logger.error("[API/whatsapp-watch] Action error:", { error: String(error) });
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
