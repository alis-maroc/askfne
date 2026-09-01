import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isAssistantRefusal } from "@/lib/ai/refusal-detector";

function normalizeQuestionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove Arabic tashkeel / diacritics
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    // 1. Fetch conversations with messages
    const conversations = await prisma.conversation.findMany({
      where: {
        messages: {
          some: {
            role: "assistant",
          },
        },
      },
      select: {
        id: true,
        channel: true,
        customerName: true,
        customerContact: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
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
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    // 2. Fetch negative user feedback ratings (👎)
    const negativeFeedbacks = await (prisma as any).messageFeedback.findMany({
      where: {
        rating: "negative",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const unansweredMap = new Map<
      string,
      {
        question: string;
        count: number;
        channels: Set<string>;
        firstAskedAt: Date;
        lastAskedAt: Date;
        lastResponse: string;
        conversationId: string;
        customerName: string;
      }
    >();

    // Process conversations and find refusal messages
    for (const conv of conversations) {
      const metadata = (conv.metadata || {}) as Record<string, unknown>;
      const dismissedList = Array.isArray(metadata.dismissedQuestions)
        ? (metadata.dismissedQuestions as string[])
        : [];

      const msgs = conv.messages;
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        if (msg.role === "assistant") {
          const content = msg.content || "";
          const isRefusal = isAssistantRefusal(content);

          if (isRefusal) {
            // Find the preceding customer message
            let customerMsg = null;
            for (let j = i - 1; j >= 0; j--) {
              if (msgs[j].role === "customer" || msgs[j].role === "user") {
                customerMsg = msgs[j];
                break;
              }
            }

            if (customerMsg && customerMsg.content.trim().length > 1) {
              const qText = customerMsg.content.trim();
              const normKey = normalizeQuestionKey(qText);

              // If dismissed by admin or is simple navigation choice, ignore
              if (
                dismissedList.includes(normKey) ||
                ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "نعم", "لا", "oui", "non"].includes(qText) ||
                normKey.length < 3
              ) {
                continue;
              }

              const existing = unansweredMap.get(normKey);
              if (existing) {
                existing.count += 1;
                existing.channels.add(conv.channel || "web");
                if (customerMsg.createdAt > existing.lastAskedAt) {
                  existing.lastAskedAt = customerMsg.createdAt;
                  existing.lastResponse = content;
                  existing.conversationId = conv.id;
                  existing.customerName = conv.customerName || "زائر";
                }
              } else {
                unansweredMap.set(normKey, {
                  question: qText,
                  count: 1,
                  channels: new Set([conv.channel || "web"]),
                  firstAskedAt: customerMsg.createdAt,
                  lastAskedAt: customerMsg.createdAt,
                  lastResponse: content,
                  conversationId: conv.id,
                  customerName: conv.customerName || "زائر",
                });
              }
            }
          }
        }
      }
    }

    // Process negative feedbacks (👎 rated messages by users)
    for (const fb of negativeFeedbacks) {
      const qText = (fb.question || "").trim();
      if (!qText || qText.length < 3) continue;

      const normKey = normalizeQuestionKey(qText);
      const existing = unansweredMap.get(normKey);
      if (existing) {
        existing.count += 1;
        existing.channels.add(fb.channel || "web");
        if (fb.createdAt > existing.lastAskedAt) {
          existing.lastAskedAt = fb.createdAt;
        }
      } else {
        unansweredMap.set(normKey, {
          question: qText,
          count: 1,
          channels: new Set([fb.channel || "web"]),
          firstAskedAt: fb.createdAt,
          lastAskedAt: fb.createdAt,
          lastResponse: "تم التقييم بسلبية من طرف المنخرط (غير كافٍ 👎)",
          conversationId: fb.conversationId || "",
          customerName: "منخرط",
        });
      }
    }

    const results = Array.from(unansweredMap.values())
      .map((item) => ({
        ...item,
        channels: Array.from(item.channels),
      }))
      .sort((a, b) => b.count - a.count || b.lastAskedAt.getTime() - a.lastAskedAt.getTime());

    return NextResponse.json({
      total: results.length,
      data: results,
    });
  } catch (error) {
    logger.error("Failed to fetch unanswered questions:", error);
    return NextResponse.json(
      { error: "Failed to fetch unanswered questions" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { question, conversationId } = await request.json();
    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const normKey = normalizeQuestionKey(question);

    // If conversationId is provided, dismiss in that conversation, or across all conversations
    if (conversationId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { metadata: true },
      });
      if (conv) {
        const metadata = (conv.metadata || {}) as Record<string, unknown>;
        const dismissed = Array.isArray(metadata.dismissedQuestions)
          ? (metadata.dismissedQuestions as string[])
          : [];
        if (!dismissed.includes(normKey)) {
          dismissed.push(normKey);
        }
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { metadata: { ...metadata, dismissedQuestions: dismissed } },
        });
      }
    } else {
      // Find all conversations containing this question
      const convs = await prisma.conversation.findMany({
        where: {
          messages: {
            some: {
              content: { contains: question },
            },
          },
        },
        select: { id: true, metadata: true },
      });

      for (const conv of convs) {
        const metadata = (conv.metadata || {}) as Record<string, unknown>;
        const dismissed = Array.isArray(metadata.dismissedQuestions)
          ? (metadata.dismissedQuestions as string[])
          : [];
        if (!dismissed.includes(normKey)) {
          dismissed.push(normKey);
        }
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { metadata: { ...metadata, dismissedQuestions: dismissed } },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to dismiss unanswered question:", error);
    return NextResponse.json(
      { error: "Failed to dismiss question" },
      { status: 500 }
    );
  }
}
