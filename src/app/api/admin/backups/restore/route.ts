import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "admin:create");
  if (!isAuthenticated(auth)) return auth;

  const tmpWorkDir = path.join("/tmp", `owly-restore-${Date.now()}`);
  fs.mkdirSync(tmpWorkDir, { recursive: true });

  try {
    let archivePath = "";
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // File upload mode
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No backup file uploaded" }, { status: 400 });
      }
      archivePath = path.join(tmpWorkDir, "uploaded-backup.tar.gz");
      const bytes = await file.arrayBuffer();
      fs.writeFileSync(archivePath, Buffer.from(bytes));
    } else {
      // Filename mode (existing backup from list)
      const body = await request.json();
      const { filename } = body;
      if (!filename) {
        return NextResponse.json({ error: "Filename is required" }, { status: 400 });
      }
      const safeName = path.basename(filename);
      const backupDir = getBackupsDir();
      archivePath = path.join(backupDir, safeName);
      if (!fs.existsSync(archivePath)) {
        return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
      }
    }

    const rawDbUrl = process.env.DATABASE_URL;
    if (!rawDbUrl) {
      return NextResponse.json({ error: "DATABASE_URL is not defined" }, { status: 500 });
    }
    // Strip ?schema=public or other query parameters
    const dbUrl = rawDbUrl.split("?")[0];

    // 1. Extract archive
    logger.info(`[Restore] Extracting archive: ${archivePath}`);
    await execAsync(`tar -xzf "${archivePath}" -C "${tmpWorkDir}"`);

    const sqlFile = path.join(tmpWorkDir, "database.sql");
    if (!fs.existsSync(sqlFile)) {
      return NextResponse.json({ error: "Corrupted backup: database.sql not found inside archive" }, { status: 400 });
    }

    // 2. Drop and restore PostgreSQL schema
    logger.info("[Restore] Resetting PostgreSQL public schema...");
    await execAsync(`psql "${dbUrl}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`);

    logger.info(`[Restore] Restoring database from ${sqlFile}...`);
    await execAsync(`psql "${dbUrl}" < "${sqlFile}"`);

    // 3. Restore WhatsApp session if present in the archive
    const waArchive = path.join(tmpWorkDir, "whatsapp-auth.tar.gz");
    if (fs.existsSync(waArchive)) {
      const waAuthDirs = ["/app/.wwebjs_auth", path.join(process.cwd(), ".wwebjs_auth")];
      for (const targetDir of waAuthDirs) {
        if (fs.existsSync(targetDir)) {
          logger.info(`[Restore] Restoring WhatsApp authentication to ${targetDir}`);
          try {
            await execAsync(`tar -xzf "${waArchive}" -C "${targetDir}"`);
          } catch (waErr) {
            logger.warn("[Restore] WhatsApp auth extraction warning:", { error: String(waErr) });
          }
          break;
        }
      }
    }

    // 4. Cleanup
    fs.rmSync(tmpWorkDir, { recursive: true, force: true });

    logger.info("[Restore] Completed successfully!");
    return NextResponse.json({
      success: true,
      message: "تمت استعادة النسخة الاحتياطية بنجاح! / Restauration effectuée avec succès.",
    });
  } catch (error) {
    logger.error("Failed to restore backup:", error);
    try {
      fs.rmSync(tmpWorkDir, { recursive: true, force: true });
    } catch (_) {}
    return NextResponse.json(
      { error: "Failed to restore backup: " + String(error) },
      { status: 500 }
    );
  }
}
