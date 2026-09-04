import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

const VALID_ROLES = ["admin", "supervisor", "agent", "viewer"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "admin:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, role, password, isActive, permissions } = body;

    const existing = await prisma.admin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (role !== undefined && VALID_ROLES.includes(role)) updateData.role = role;
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (password && typeof password === "string" && password.length >= 6) {
      updateData.password = await hashPassword(password);
    }

    const user = await prisma.admin.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, name: true, role: true, isActive: true, permissions: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error("Failed to update admin user:", error);
    return NextResponse.json({ error: "Failed to update admin user" }, { status: 500 });
  }
}

// Keep PUT for backward compatibility
export { PATCH as PUT };

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "admin:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.admin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.admin.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete admin user:", error);
    return NextResponse.json({ error: "Failed to delete admin user" }, { status: 500 });
  }
}
