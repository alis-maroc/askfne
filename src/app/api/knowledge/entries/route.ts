import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { indexKnowledgeEntry } from "@/lib/ai/semantic-search";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const categoryId = searchParams.get("categoryId");

    const where = categoryId ? { categoryId } : {};

    const [entries, total] = await Promise.all([
      prisma.knowledgeEntry.findMany({
        where,
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        skip,
        take,
        include: {
          category: {
            select: { id: true, name: true, color: true, icon: true },
          },
        },
      }),
      prisma.knowledgeEntry.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(entries, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch entries" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { categoryId, title, content, priority } = body;

    if (!categoryId) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    const entry = await prisma.knowledgeEntry.create({
      data: {
        categoryId,
        title: title.trim(),
        content: content?.trim() || "",
        priority: typeof priority === "number" ? priority : 0,
      },
      include: {
        category: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    });

    // Fire-and-forget embedding indexing so future semantic queries find this entry.
    // Failure is logged but does not block the API response.
    void (async () => {
      try {
        const settings = await prisma.settings.findUnique({
          where: { id: "default" },
          select: { aiApiKey: true, aiProvider: true },
        });
        if (
          settings?.aiProvider === "openai" &&
          settings.aiApiKey?.startsWith("sk-")
        ) {
          const ok = await indexKnowledgeEntry(entry.id, settings.aiApiKey);
          if (!ok) {
            logger.warn("Failed to index new knowledge entry", {
              id: entry.id,
              title: entry.title,
            });
          }
        }
      } catch (err) {
        logger.warn("Embedding indexing threw for new entry", {
          id: entry.id,
          err: (err as Error).message,
        });
      }
    })();

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    logger.error("Failed to create entry:", error);
    return NextResponse.json(
      { error: "Failed to create entry" },
      { status: 500 }
    );
  }
}
