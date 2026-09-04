import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { broadcastForumPost } from "@/lib/forum/forum-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get("topicId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (topicId) where.topicId = topicId;
    if (status) where.status = status;

    const posts = await prisma.forumPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        topic: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ posts });
  } catch (error) {
    logger.error("[Forum/Posts] Failed to fetch posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { postId, action } = body;

    if (!postId || !action) {
      return NextResponse.json({ error: "معرّف المشاركة والإجراء مطلوبان" }, { status: 400 });
    }

    const post = await prisma.forumPost.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ error: "المشاركة غير موجودة" }, { status: 404 });
    }

    if (action === "reject") {
      const updated = await prisma.forumPost.update({
        where: { id: postId },
        data: { status: "rejected" },
      });
      return NextResponse.json({ success: true, post: updated });
    }

    if (action === "approve") {
      const updated = await prisma.forumPost.update({
        where: { id: postId },
        data: { status: "approved" },
      });
      return NextResponse.json({ success: true, post: updated });
    }

    if (action === "broadcast") {
      const result = await broadcastForumPost(postId);
      const updated = await prisma.forumPost.findUnique({ where: { id: postId } });
      return NextResponse.json({ success: true, post: updated, result });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    logger.error("[Forum/Posts] Failed to update post:", error);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}
