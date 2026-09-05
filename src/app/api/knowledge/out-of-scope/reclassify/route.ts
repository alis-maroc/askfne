import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/[؟?!\.,]/g, "")
    .replace(/\s+/g, " ");
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { question, conversationId, whitelistTerm } = body;

    if (!question || typeof question !== "string" || question.trim().length < 2) {
      return NextResponse.json({ error: "Invalid question provided" }, { status: 400 });
    }

    const cleanQuestion = question.trim();
    const normTarget = normalizeQuestion(cleanQuestion);

    // 1. Update scopeWhitelist in Settings if whitelistTerm is provided
    let updatedWhitelist: string[] = [];
    if (whitelistTerm && typeof whitelistTerm === "string" && whitelistTerm.trim().length >= 2) {
      const termToAdd = whitelistTerm.trim().toLowerCase();
      const settings = await prisma.settings.findFirst();
      const currentList: string[] = Array.isArray((settings as any)?.scopeWhitelist)
        ? ((settings as any).scopeWhitelist as string[])
        : [];

      if (!currentList.some((t) => t.toLowerCase() === termToAdd)) {
        updatedWhitelist = [...currentList, termToAdd];
        if (settings) {
          await prisma.settings.update({
            where: { id: settings.id },
            data: { scopeWhitelist: updatedWhitelist } as any,
          });
        }
      } else {
        updatedWhitelist = currentList;
      }
    }

    // 2. Find and update the conversation(s) containing this out-of-scope question
    const convsToUpdate = conversationId
      ? await prisma.conversation.findMany({ where: { id: conversationId } })
      : await prisma.conversation.findMany({
          where: {
            metadata: {
              path: ["hasOutOfScope"],
              equals: true,
            },
          },
          take: 50,
        });

    for (const conv of convsToUpdate) {
      const meta = (conv.metadata || {}) as Record<string, unknown>;
      const rawOutOfScope = Array.isArray(meta.outOfScopeQuestions)
        ? (meta.outOfScopeQuestions as Array<Record<string, unknown>>)
        : [];

      const remainingOutOfScope = rawOutOfScope.filter(
        (item) => normalizeQuestion(String(item.question || "")) !== normTarget
      );

      const existingUnanswered = Array.isArray(meta.unansweredQuestions)
        ? (meta.unansweredQuestions as Array<Record<string, unknown>>)
        : [];

      const alreadyInUnanswered = existingUnanswered.some(
        (u) => normalizeQuestion(String(u.question || "")) === normTarget
      );

      const newUnanswered = alreadyInUnanswered
        ? existingUnanswered
        : [
            ...existingUnanswered,
            {
              question: cleanQuestion,
              askedAt: new Date().toISOString(),
              source: "manual",
            },
          ];

      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          metadata: {
            ...meta,
            hasOutOfScope: remainingOutOfScope.length > 0,
            outOfScopeQuestions: remainingOutOfScope,
            hasUnanswered: true,
            lastUnansweredAt: new Date().toISOString(),
            unansweredQuestions: newUnanswered,
          } as any,
        },
      });
    }

    logger.info(`[Reclassify] Reclassified out-of-scope question as legitimate: "${cleanQuestion}"`, {
      whitelistTerm: whitelistTerm || null,
    });

    return NextResponse.json({
      success: true,
      question: cleanQuestion,
      whitelistTerm: whitelistTerm || null,
      scopeWhitelist: updatedWhitelist,
    });
  } catch (err: any) {
    logger.error("[Reclassify] Error reclassifying question:", err);
    return NextResponse.json(
      { error: "Failed to reclassify question" },
      { status: 500 }
    );
  }
}
