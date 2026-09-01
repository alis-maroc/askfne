import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * POST /api/feedback
 * Records user feedback (👍 positive / 👎 negative) for a bot response.
 * Called from WhatsApp, Telegram, and Web Chat channels.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { channel, messageId, conversationId, rating, question } = body;

    if (!channel || !rating) {
      return NextResponse.json(
        { error: "Missing required fields: channel, rating" },
        { status: 400 }
      );
    }

    if (!["positive", "negative"].includes(rating)) {
      return NextResponse.json(
        { error: "rating must be 'positive' or 'negative'" },
        { status: 400 }
      );
    }

    let resolvedQuestion = question ? String(question).trim() : "";

    // If question was not provided in payload, look up preceding customer message from conversation
    if (!resolvedQuestion && conversationId) {
      const lastCust = await prisma.message.findFirst({
        where: {
          conversationId: String(conversationId),
          role: { in: ["customer", "user"] },
        },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      });
      if (lastCust && lastCust.content) {
        resolvedQuestion = lastCust.content.trim();
      }
    }

    const feedback = await (prisma as any).messageFeedback.create({
      data: {
        channel: String(channel),
        messageId: messageId ? String(messageId) : null,
        conversationId: conversationId ? String(conversationId) : null,
        question: resolvedQuestion ? resolvedQuestion.substring(0, 1000) : "",
        rating: String(rating),
      },
    });

    logger.info(
      `[Feedback] ${rating === "positive" ? "👍" : "👎"} received on ${channel}` +
        (resolvedQuestion ? ` — "${resolvedQuestion.substring(0, 80)}"` : "")
    );

    return NextResponse.json({ success: true, id: feedback.id });
  } catch (err) {
    logger.error("[Feedback] Error saving feedback:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/feedback
 * Returns recent feedback entries for the Dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const channel = searchParams.get("channel");
    const rating = searchParams.get("rating");
    const unreviewed = searchParams.get("unreviewed") === "true";

    const where: Record<string, unknown> = {};
    if (channel) where.channel = channel;
    if (rating) where.rating = rating;
    if (unreviewed) where.reviewed = false;

    const [rawItems, total, positiveCount, negativeCount] = await Promise.all([
      (prisma as any).messageFeedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      (prisma as any).messageFeedback.count({ where }),
      (prisma as any).messageFeedback.count({ where: { ...where, rating: "positive" } }),
      (prisma as any).messageFeedback.count({ where: { ...where, rating: "negative" } }),
    ]);

    // Backfill any items that have empty question by looking up linked conversation
    const items = await Promise.all(
      rawItems.map(async (item: any) => {
        if (!item.question && item.conversationId) {
          try {
            const lastCust = await prisma.message.findFirst({
              where: {
                conversationId: item.conversationId,
                role: { in: ["customer", "user"] },
              },
              orderBy: { createdAt: "desc" },
              select: { content: true },
            });
            if (lastCust && lastCust.content) {
              item.question = lastCust.content.trim();
            }
          } catch (_) {}
        }
        return item;
      })
    );

    return NextResponse.json({
      items,
      total,
      positiveCount,
      negativeCount,
      satisfactionRate:
        total > 0 ? Math.round((positiveCount / total) * 100) : null,
    });
  } catch (err) {
    logger.error("[Feedback] Error fetching feedback:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/feedback
 * Mark a feedback as reviewed.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await (prisma as any).messageFeedback.update({
      where: { id },
      data: { reviewed: true },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[Feedback] Error marking feedback reviewed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
