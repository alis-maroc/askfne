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
  const defaultDir = path.join(process.cwd(), "backups");
  fs.mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "admin:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const backupDir = getBackupsDir();
    if (!fs.existsSync(backupDir)) {
      return NextResponse.json({
        backups: [],
        schedule: "Tous les 2 jours à 03:00",
        retention: "7 derniers backups conservés",
        totalSizeBytes: 0,
        totalSizeFormatted: "0 B",
      });
    }

    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith(".tar.gz") && f.startsWith("owly-"))
      .map((f) => {
        const fullPath = path.join(backupDir, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          createdAt: stat.mtime.toISOString(),
          timestamp: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    const totalSizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

    return NextResponse.json({
      backups: files,
      schedule: "Tous les 2 jours à 03:00",
      retention: "7 derniers backups conservés",
      totalSizeBytes,
      totalSizeFormatted: formatBytes(totalSizeBytes),
      latestBackup: files[0] || null,
    });
  } catch (error) {
    logger.error("Failed to list backups:", error);
    return NextResponse.json(
      { error: "Failed to list backups: " + String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "admin:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const backupDir = getBackupsDir();
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "") + "Z";
    const archiveName = `owly-${stamp}.tar.gz`;
    const archivePath = path.join(backupDir, archiveName);

    const tmpWorkDir = path.join("/tmp", `owly-backup-${Date.now()}`);
    fs.mkdirSync(tmpWorkDir, { recursive: true });

    const rawDbUrl = process.env.DATABASE_URL;
    if (!rawDbUrl) {
      return NextResponse.json({ error: "DATABASE_URL is not defined" }, { status: 500 });
    }
    // Strip ?schema=public or other Prisma query parameters that cause pg_dump to fail
    const dbUrl = rawDbUrl.split("?")[0];

    // 1. Dump database via pg_dump
    logger.info(`[Backup] Dumping PostgreSQL database to ${tmpWorkDir}/database.sql`);
    await execAsync(`pg_dump "${dbUrl}" --no-owner --no-privileges > "${tmpWorkDir}/database.sql"`);

    // 2. Compress WhatsApp auth if present
    const waAuthDirs = ["/app/.wwebjs_auth", path.join(process.cwd(), ".wwebjs_auth")];
    let waAuthFound = false;
    for (const w of waAuthDirs) {
      if (fs.existsSync(w) && fs.readdirSync(w).length > 0) {
        logger.info(`[Backup] Archiving WhatsApp auth from ${w}`);
        await execAsync(`tar --warning=no-file-changed -czf "${tmpWorkDir}/whatsapp-auth.tar.gz" -C "${w}" .`);
        waAuthFound = true;
        break;
      }
    }

    // 3. Write manifest
    const manifest = `created_at=${stamp}\nwhatsapp_auth=${waAuthFound}\n`;
    fs.writeFileSync(path.join(tmpWorkDir, "manifest.txt"), manifest, "utf-8");

    // 4. Create final archive
    logger.info(`[Backup] Creating final archive: ${archivePath}`);
    await execAsync(`tar -czf "${archivePath}" -C "${tmpWorkDir}" .`);
    fs.chmodSync(archivePath, 0o644);

    // 5. Cleanup temporary work directory
    fs.rmSync(tmpWorkDir, { recursive: true, force: true });

    // 6. Enforce retention limit: keep latest 7 backups
    const KEEP = 7;
    const existing = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith(".tar.gz") && f.startsWith("owly-"))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(backupDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    if (existing.length > KEEP) {
      const toDelete = existing.slice(KEEP);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(path.join(backupDir, item.name));
          logger.info(`[Backup] Removed old backup for retention: ${item.name}`);
        } catch (_) { }
      }
    }

    const stat = fs.statSync(archivePath);
    return NextResponse.json({
      success: true,
      backup: {
        filename: archiveName,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        createdAt: stat.mtime.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to create backup:", error);
    return NextResponse.json(
      { error: "Failed to create backup: " + String(error) },
      { status: 500 }
    );
  }
}
