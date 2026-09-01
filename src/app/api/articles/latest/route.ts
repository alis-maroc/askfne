import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Find category for news / statements (بيانات ومستجدات)
    const newsCategories = await prisma.category.findMany({
      where: {
        OR: [
          { name: { contains: "بيان", mode: "insensitive" } },
          { name: { contains: "مستجد", mode: "insensitive" } },
          { name: { contains: "أخبار", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    const categoryIds = newsCategories.map((c) => c.id);

    const whereClause =
      categoryIds.length > 0
        ? { categoryId: { in: categoryIds }, isActive: true }
        : { isActive: true };

    const articles = await prisma.knowledgeEntry.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ articles });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch articles", articles: [] }, { status: 500 });
  }
}
