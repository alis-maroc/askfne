import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { title, content, priority, isActive, categoryId } = body;

    const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    const entry = await prisma.knowledgeEntry.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content: content.trim() }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
        ...(categoryId !== undefined && { categoryId }),
        version: { increment: 1 },
      },
      include: {
        category: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    logger.error("Failed to update entry:", error);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    // If this entry was imported from WordPress, mark it as 'deleted' in WpProcessedPost
    // so that future imports will NEVER re-import it!
    const metadata = existing.metadata as Record<string, unknown> | null;
    const wpPostId = typeof metadata?.wpPostId === "number" ? metadata.wpPostId : null;
    if (wpPostId) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "WpProcessedPost" ("wpPostId", "title", "status", "updatedAt") 
         VALUES ($1, $2, 'deleted', NOW()) 
         ON CONFLICT ("wpPostId") DO UPDATE SET "status" = 'deleted', "updatedAt" = NOW()`,
        wpPostId,
        existing.title
      ).catch((e) => logger.warn("Failed to mark post as deleted in WpProcessedPost:", e));
    }

    // If this entry was imported from men.gov.ma, mark it as 'deleted' in MenProcessedItem
    // so that future syncs will NEVER re-import it!
    const menItemId = typeof metadata?.menItemId === "string" ? metadata.menItemId : null;
    if (menItemId) {
      const menUrl = typeof metadata?.url === "string" ? metadata.url : "";
      await prisma.$executeRawUnsafe(
        `INSERT INTO "MenProcessedItem" ("id", "url", "title", "status", "updatedAt") 
         VALUES ($1, $2, $3, 'deleted', NOW()) 
         ON CONFLICT ("id") DO UPDATE SET "status" = 'deleted', "updatedAt" = NOW()`,
        menItemId,
        menUrl,
        existing.title
      ).catch((e) => logger.warn("Failed to mark post as deleted in MenProcessedItem:", e));
    }

    await prisma.knowledgeEntry.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
