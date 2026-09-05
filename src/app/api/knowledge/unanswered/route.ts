import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isAssistantRefusal, isLegitimateKnowledgeQuestion } from "@/lib/ai/refusal-detector";

function normalizeQuestionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove Arabic tashkeel / diacritics
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isSystematicMenuOrGreeting(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return (
    t.includes("مرحباً بك الرفيق/ة في المساعد الرقمي") ||
    t.includes("اكتب سؤالك وسأجيبك فوراً") ||
    t.includes("1️⃣ 🏢 المكاتب والتنظيم النقابي") ||
    t.includes("2️⃣ 📜 القانون الأساسي") ||
    t.includes("مستجدات وبيانات FNE") ||
    t.includes("هل ترغب في التوصل بآخر البيانات") ||
    t.includes("الجامعة الوطنية للتعليم FNE 👋") ||
    t.includes("قائمة الخدمات الرقمية") ||
    t.includes("رجوع للقائمة الرئيسية")
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") || "unanswered";

    const settings = await prisma.settings.findFirst({ select: { scopeWhitelist: true } });
    const scopeWhitelist = Array.isArray(settings?.scopeWhitelist)
      ? (settings?.scopeWhitelist as string[])
      : [];

    // 1. Fetch conversations with messages
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { messages: { some: {} } },
          { status: "escalated" },
        ],
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
      take: 1000,
    });

    // 2. Fetch negative user feedback ratings (👎)
    const negativeFeedbacks = await (prisma as any).messageFeedback.findMany({
      where: {
        rating: "negative",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const outOfScopeMap = new Map<
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
        customerContact: string | null;
        sourceType: "out_of_scope";
      }
    >();

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
        customerContact: string | null;
        sourceType: "manual" | "refusal" | "feedback" | "external_ai";
        externalAiAnswer?: string | null;
      }
    >();

    // Process conversations and find refusal messages
    for (const conv of conversations) {
      const metadata = (conv.metadata || {}) as Record<string, unknown>;
      const dismissedList = Array.isArray(metadata.dismissedQuestions)
        ? (metadata.dismissedQuestions as string[])
        : [];

      // C. Handle questions flagged as out of scope
      if (Array.isArray(metadata.outOfScopeQuestions) && metadata.outOfScopeQuestions.length > 0) {
        for (const item of (metadata.outOfScopeQuestions as Array<Record<string, unknown>>)) {
          const qText = String(item.question || "").trim();
          if (!qText || qText.length < 2) continue;

          const normKey = normalizeQuestionKey(qText);
          if (dismissedList.includes(normKey)) continue;

          const askedDate = item.askedAt ? new Date(String(item.askedAt)) : conv.updatedAt;
          const existing = outOfScopeMap.get(normKey);
          if (existing) {
            existing.count += 1;
            existing.channels.add(conv.channel || "whatsapp");
            if (askedDate > existing.lastAskedAt) {
              existing.lastAskedAt = askedDate;
            }
          } else {
            outOfScopeMap.set(normKey, {
              question: qText,
              count: 1,
              channels: new Set([conv.channel || "whatsapp"]),
              firstAskedAt: askedDate,
              lastAskedAt: askedDate,
              lastResponse: "تم الاعتذار لكون السؤال خارج اختصاص قطاع التعليم والنقابة (رياضة/طقس/ترفيه).",
              conversationId: conv.id,
              customerName: conv.customerName || "منخرط",
              customerContact: conv.customerContact || null,
              sourceType: "out_of_scope",
            });
          }
        }
      }

      // A. Handle conversations manually marked as unanswered by admin or answered by external AI
      const isManual =
        metadata.isManuallyUnanswered === true ||
        metadata.isManuallyUnanswered === "true" ||
        Boolean(metadata.hasUnanswered) ||
        (Array.isArray(metadata.unansweredQuestions) && metadata.unansweredQuestions.length > 0) ||
        Boolean(metadata.unansweredQuestion);

      if (isManual) {
        const rawList: Array<{ question: string; messageId?: string; askedAt?: string; source?: string; externalAiAnswer?: string }> =
          Array.isArray(metadata.unansweredQuestions) && metadata.unansweredQuestions.length > 0
            ? (metadata.unansweredQuestions as Array<{ question: string; messageId?: string; askedAt?: string; source?: string; externalAiAnswer?: string }>)
            : metadata.unansweredQuestion
            ? [{ question: String(metadata.unansweredQuestion), askedAt: String(metadata.unansweredAt || "") }]
            : [];

        if (rawList.length === 0) {
          const lastCust = conv.messages
            .slice()
            .reverse()
            .find((m) => (m.role === "customer" || m.role === "user") && m.content && m.content.trim().length >= 2);
          if (lastCust) {
            rawList.push({ question: lastCust.content.trim(), askedAt: lastCust.createdAt.toISOString() });
          }
        }

        for (const item of rawList) {
          const manualQ = (item.question || "").trim();
          if (!manualQ || manualQ.length < 2) continue;

          const normKey = normalizeQuestionKey(manualQ);
          if (!dismissedList.includes(normKey)) {
            const existing = unansweredMap.get(normKey);
            const askedDate = item.askedAt ? new Date(item.askedAt) : conv.updatedAt;
            const isExternalAi = item.source === "external_ai";
            const lastResp = isExternalAi && item.externalAiAnswer
              ? item.externalAiAnswer
              : "⚠️ تم تحويل هذا السؤال يدوياً من المحادثة للمتابعة واعتماد إجابة.";

            if (!existing) {
              unansweredMap.set(normKey, {
                question: manualQ,
                count: 1,
                channels: new Set([conv.channel || "whatsapp"]),
                firstAskedAt: askedDate,
                lastAskedAt: askedDate,
                lastResponse: lastResp,
                conversationId: conv.id,
                customerName: conv.customerName || "منخرط",
                customerContact: conv.customerContact || null,
                sourceType: isExternalAi ? "external_ai" : "manual",
                externalAiAnswer: item.externalAiAnswer || null,
              });
            } else {
              existing.count += 1;
              if (isExternalAi) {
                existing.sourceType = "external_ai";
                existing.lastResponse = lastResp;
                existing.externalAiAnswer = item.externalAiAnswer || existing.externalAiAnswer;
              }
              if (askedDate > existing.lastAskedAt) {
                existing.lastAskedAt = askedDate;
              }
            }
          }
        }
      }

      // B. Scan messages for automatic refusal detection
      const msgs = conv.messages;
      const seenCustomerMsgIds = new Set<string>();

      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        if (msg.role === "assistant") {
          const content = msg.content || "";

          // Skip systematic menu displays or greetings
          if (isSystematicMenuOrGreeting(content)) continue;

          const isRefusal = isAssistantRefusal(content);
          if (isRefusal) {
            // Find the immediately preceding customer message
            let customerMsg = null;
            for (let j = i - 1; j >= 0; j--) {
              if (msgs[j].role === "customer" || msgs[j].role === "user") {
                customerMsg = msgs[j];
                break;
              }
            }

            // Avoid double counting the exact same customer message in this conversation
            if (customerMsg && !seenCustomerMsgIds.has(customerMsg.id) && isLegitimateKnowledgeQuestion(customerMsg.content)) {
              seenCustomerMsgIds.add(customerMsg.id);
              const qText = customerMsg.content.trim();
              const normKey = normalizeQuestionKey(qText);

              // If dismissed by admin or key too short, ignore
              if (dismissedList.includes(normKey) || normKey.length < 3) {
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
                  existing.customerContact = conv.customerContact || existing.customerContact;
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
                  customerContact: conv.customerContact || null,
                  sourceType: "refusal",
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
      if (!isLegitimateKnowledgeQuestion(qText)) continue;

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
          customerContact: null,
          sourceType: "feedback",
        });
      }
    }

    // Query active holding disclaimers to mark questions currently on hold
    const activeHoldings = await prisma.cannedResponse.findMany({
      where: {
        category: "unanswered_holding",
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        shortcut: true,
        content: true,
        updatedAt: true,
      },
    });

    const results = Array.from(unansweredMap.values())
      .map((item) => {
        const itemNormKey = normalizeQuestionKey(item.question);
        const matchingHold = activeHoldings.find((h) => {
          const hNormKey = normalizeQuestionKey(h.title);
          return (
            h.shortcut === `holding:${itemNormKey}` ||
            itemNormKey === hNormKey ||
            (hNormKey.length >= 8 && (itemNormKey.includes(hNormKey) || hNormKey.includes(itemNormKey)))
          );
        });

        return {
          ...item,
          channels: Array.from(item.channels),
          isHeld: Boolean(matchingHold),
          holdingId: matchingHold?.id || null,
          holdingMessage: matchingHold?.content || null,
          holdingUpdatedAt: matchingHold?.updatedAt || null,
        };
      })
      .sort((a, b) => b.count - a.count || b.lastAskedAt.getTime() - a.lastAskedAt.getTime());

    const outOfScopeResults = Array.from(outOfScopeMap.values())
      .map((item) => ({
        ...item,
        channels: Array.from(item.channels),
        isHeld: false,
        holdingId: null,
        holdingMessage: null,
        holdingUpdatedAt: null,
      }))
      .sort((a, b) => b.count - a.count || b.lastAskedAt.getTime() - a.lastAskedAt.getTime());

    return NextResponse.json({
      total: results.length,
      outOfScopeTotal: outOfScopeResults.length,
      data: tab === "out_of_scope" ? outOfScopeResults : results,
      scopeWhitelist,
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
    const body = await request.json();
    const { question, questions, all, conversationId } = body;

    let targetQuestions: string[] = [];
    if (Array.isArray(questions) && questions.length > 0) {
      targetQuestions = questions;
    } else if (question) {
      targetQuestions = [question];
    } else if (!all) {
      return NextResponse.json({ error: "Questions are required" }, { status: 400 });
    }

    const normKeys = targetQuestions.map((q) => normalizeQuestionKey(q));

    if (conversationId && normKeys.length === 1) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { metadata: true },
      });
      if (conv) {
        const metadata = (conv.metadata || {}) as Record<string, unknown>;
        const dismissed = Array.isArray(metadata.dismissedQuestions)
          ? (metadata.dismissedQuestions as string[])
          : [];
        for (const k of normKeys) {
          if (!dismissed.includes(k)) dismissed.push(k);
        }

        const rawList = Array.isArray(metadata.unansweredQuestions)
          ? (metadata.unansweredQuestions as Array<{ question: string }>)
          : [];
        const remainingList = rawList.filter(
          (item) => !normKeys.includes(normalizeQuestionKey(item.question))
        );

        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            metadata: {
              ...metadata,
              dismissedQuestions: dismissed,
              unansweredQuestions: remainingList,
              isManuallyUnanswered: remainingList.length > 0,
            },
          },
        });
      }
    } else {
      // Find conversations with assistant messages or marked as manually unanswered
      const convs = await prisma.conversation.findMany({
        where: {
          OR: [
            { messages: { some: { role: "assistant" } } },
            { metadata: { path: ["isManuallyUnanswered"], equals: true } },
          ],
        },
        select: { id: true, metadata: true },
        take: 500,
      });

      for (const conv of convs) {
        const metadata = (conv.metadata || {}) as Record<string, unknown>;
        const dismissed = Array.isArray(metadata.dismissedQuestions)
          ? (metadata.dismissedQuestions as string[])
          : [];
        let modified = false;

        for (const k of normKeys) {
          if (!dismissed.includes(k)) {
            dismissed.push(k);
            modified = true;
          }
        }

        const isManual = metadata.isManuallyUnanswered === true;
        const rawList = Array.isArray(metadata.unansweredQuestions)
          ? (metadata.unansweredQuestions as Array<{ question: string }>)
          : [];
        const remainingList = all
          ? []
          : rawList.filter((item) => !normKeys.includes(normalizeQuestionKey(item.question)));

        const shouldUpdateManual = isManual && (all || rawList.length !== remainingList.length);

        if (modified || shouldUpdateManual) {
          await prisma.conversation.update({
            where: { id: conv.id },
            data: {
              metadata: {
                ...metadata,
                dismissedQuestions: dismissed,
                unansweredQuestions: remainingList,
                isManuallyUnanswered: remainingList.length > 0,
              } as any,
            },
          });
        }
      }
    }


    return NextResponse.json({ success: true, count: targetQuestions.length });
  } catch (error) {
    logger.error("Failed to dismiss unanswered question(s):", error);
    return NextResponse.json(
      { error: "Failed to dismiss question(s)" },
      { status: 500 }
    );
  }
}
