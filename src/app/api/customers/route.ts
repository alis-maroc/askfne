import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "customers:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const search = searchParams.get("search");
    const isBlocked = searchParams.get("isBlocked");
    const optIn = searchParams.get("optIn");

    const conditions: Array<Record<string, unknown>> = [];

    if (search && search.trim()) {
      conditions.push({
        OR: [
          { name: { contains: search.trim(), mode: "insensitive" } },
          { email: { contains: search.trim(), mode: "insensitive" } },
          { phone: { contains: search.trim(), mode: "insensitive" } },
          { whatsapp: { contains: search.trim(), mode: "insensitive" } },
        ],
      });
    }

    if (isBlocked === "true") {
      conditions.push({ isBlocked: true });
    } else if (isBlocked === "false") {
      conditions.push({ isBlocked: false });
    }

    if (optIn === "bayan_sub") {
      conditions.push({
        OR: [
          { tags: { contains: "bayan_subscribers" } },
          { tags: { contains: "مشتركو البيانات والمستجدات" } },
        ],
      });
    } else if (optIn === "bayan_declined") {
      conditions.push({
        OR: [
          { tags: { contains: "bayan_opted_out" } },
          { tags: { contains: "رافضو خدمة البيانات" } },
        ],
      });
    } else if (optIn === "forum_sub") {
      conditions.push({
        OR: [
          { tags: { contains: "forum_subscribers" } },
          { tags: { contains: "forum_subscriber" } },
          { tags: { contains: "forum-subscriber" } },
          { tags: { contains: "مشتركو منتدى النقاش" } },
          { tags: { contains: "مشترك في المنتدى" } },
          { tags: { contains: "منتدى" } },
        ],
      });
    } else if (optIn === "not_asked") {
      conditions.push({
        AND: [
          { NOT: { tags: { contains: "bayan_subscribers" } } },
          { NOT: { tags: { contains: "مشتركو البيانات والمستجدات" } } },
          { NOT: { tags: { contains: "bayan_opted_out" } } },
          { NOT: { tags: { contains: "رافضو خدمة البيانات" } } },
        ],
      });
    }

    const where: Record<string, unknown> = conditions.length > 0 ? { AND: conditions } : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { lastContact: "desc" },
        skip,
        take,
        include: {
          _count: {
            select: { notes: true },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(customers, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch customers:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "customers:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { name, email, phone, whatsapp, tags, notes, metadata } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: email?.trim() || "",
        phone: phone?.trim() || "",
        whatsapp: whatsapp?.trim() || "",
        tags: tags?.trim() || "",
        metadata: metadata || {},
        ...(notes
          ? {
              notes: {
                create: { content: notes.trim(), authorName: "Admin" },
              },
            }
          : {}),
      },
      include: {
        notes: true,
        _count: { select: { notes: true } },
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    logger.error("Failed to create customer:", error);
    return NextResponse.json(
      { error: "Failed to create customer" },
      { status: 500 }
    );
  }
}
