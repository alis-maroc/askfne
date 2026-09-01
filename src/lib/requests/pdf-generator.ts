/**
 * FNE Smart Docs — Server-Side PDF Generator
 *
 * Uses headless Chromium to render the clean A4 print page
 * directly into a high-quality PDF Buffer.
 * Allows sending native PDF files on WhatsApp and Telegram.
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

export async function generateRequestPdf(printToken: string): Promise<Buffer | null> {
  const tmpFile = path.join("/tmp", `req_${printToken}_${Date.now()}.pdf`);
  const url = `http://localhost:3000/requests/print/${printToken}`;

  // Find chromium binary
  const candidates = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "chromium"];
  let chromiumPath = "";
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      chromiumPath = c;
      break;
    }
  }

  if (!chromiumPath) {
    chromiumPath = "chromium";
  }

  try {
    logger.info(`[PDFGenerator] Generating PDF for token ${printToken} via ${chromiumPath}`);

    await execFileAsync(
      chromiumPath,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        `--print-to-pdf=${tmpFile}`,
        url,
      ],
      { timeout: 15000 }
    );

    if (fs.existsSync(tmpFile)) {
      const buffer = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile); // Clean up temp file
      logger.info(`[PDFGenerator] PDF successfully generated: ${buffer.length} bytes`);
      return buffer;
    } else {
      logger.warn(`[PDFGenerator] Temp file not found after chromium run`);
      return null;
    }
  } catch (err: any) {
    logger.error(`[PDFGenerator] Failed to generate PDF: ${err?.message || err}`);
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    return null;
  }
}
