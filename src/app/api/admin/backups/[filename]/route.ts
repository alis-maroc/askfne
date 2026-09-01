import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import fs from "fs";
import path from "path";

function getBackupsDir(): string {
  const dirs = [
    path.join(process.cwd(), "backups"),
    "/app/backups",
    "/root/owly/backups",
  ];
  for (const d of dirs) {
    if (fs.existsSync(d)) return d;
  }
  return path.join(process.cwd(), "backups");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = await requireAuth(request, "admin:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { filename } = await params;
    // Security check: prevent directory traversal
    const safeName = path.basename(filename);
    if (!safeName.endsWith(".tar.gz") || !safeName.startsWith("owly-")) {
      return NextResponse.json({ error: "Invalid backup file name" }, { status: 400 });
    }

    const backupDir = getBackupsDir();
    const filePath = path.join(backupDir, safeName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch (error) {
    logger.error("Failed to download backup:", error);
    return NextResponse.json(
      { error: "Failed to download backup" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = await requireAuth(request, "admin:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { filename } = await params;
    const safeName = path.basename(filename);
    if (!safeName.endsWith(".tar.gz") || !safeName.startsWith("owly-")) {
      return NextResponse.json({ error: "Invalid backup file name" }, { status: 400 });
    }

    const backupDir = getBackupsDir();
    const filePath = path.join(backupDir, safeName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }

    fs.unlinkSync(filePath);
    logger.info(`[Backup] Deleted backup file: ${safeName}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete backup:", error);
    return NextResponse.json(
      { error: "Failed to delete backup" },
      { status: 500 }
    );
  }
}
