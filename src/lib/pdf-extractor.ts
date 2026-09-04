import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { logger } from "@/lib/logger";
import { cleanArabicExtractedPdf } from "@/lib/arabic-cleaner";
import { extractTextWithOcr, isOcrAvailable } from "@/lib/pdf-ocr";

const execAsync = promisify(exec);

const MEN_HOST = "www.men.gov.ma";
const MEN_IP = "196.200.143.135";

/**
 * Downloads a PDF buffer from a URL, with built-in bypass for MEN DNS/firewall.
 */
export async function downloadPdfBuffer(url: string, timeoutSec = 50): Promise<Buffer | null> {
  try {
    const isMen = url.includes("men.gov.ma");

    // First attempt: standard fetch with realistic browser headers (give it 30s)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/pdf,*/*",
        },
      });
      clearTimeout(timer);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length > 500 && buf.subarray(0, 5).toString().includes("%PDF")) {
          return buf;
        }
      }
    } catch (fetchErr) {
      logger.debug(`[PDF-Extractor] Standard fetch failed for ${url}:`, {
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
    }

    // Second attempt: curl with direct IP resolve for men.gov.ma (allow up to timeoutSec asynchronously)
    try {
      const tmpOut = `/tmp/dl_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
      const resolveFlag = isMen ? `--resolve "${MEN_HOST}:443:${MEN_IP}"` : "";
      const curlCmd = `curl -sL -k --connect-timeout 15 --max-time ${timeoutSec} ${resolveFlag} -H "User-Agent: Mozilla/5.0" "${url}" -o "${tmpOut}"`;

      await execAsync(curlCmd, { timeout: (timeoutSec + 5) * 1000 });

      if (fs.existsSync(tmpOut)) {
        const buf = fs.readFileSync(tmpOut);
        try { fs.unlinkSync(tmpOut); } catch {}
        if (buf.length > 500 && buf.subarray(0, 5).toString().includes("%PDF")) {
          return buf;
        }
      }
    } catch (curlErr) {
      logger.warn(`[PDF-Extractor] Curl download failed for ${url}:`, {
        error: curlErr instanceof Error ? curlErr.message : String(curlErr),
      });
    }
  } catch (err) {
    logger.error(`[PDF-Extractor] Download error for ${url}:`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Robust multi-engine PDF text extractor.
 * Method 1: Poppler pdftotext -raw -enc UTF-8 (best Arabic character & word ordering)
 * Method 2: PDFParse (pure JavaScript fallback)
 * Method 3: Tesseract OCR (Arabic + French for scanned documents)
 */
export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length < 500) return "";

  // 1. Method 1: Poppler pdftotext CLI (asynchronous)
  try {
    const tmpPath = `/tmp/pdf_ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
    fs.writeFileSync(tmpPath, buffer);
    try {
      // Use -layout to preserve physical column layouts and natural Arabic character/word spacing.
      let text = "";
      try {
        const { stdout } = await execAsync(
          `LANG=C.UTF-8 LC_ALL=C.UTF-8 /usr/bin/pdftotext -layout -enc UTF-8 "${tmpPath}" -`,
          { timeout: 25000, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
        );
        text = stdout;
      } catch {
        // Fallback without -layout if poppler version doesn't support it
        const { stdout } = await execAsync(
          `LANG=C.UTF-8 LC_ALL=C.UTF-8 /usr/bin/pdftotext -enc UTF-8 "${tmpPath}" -`,
          { timeout: 25000, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
        );
        text = stdout;
      }
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

      const pageMarkerPattern = /^(--\s*\d+\s*of\s*\d+\s*--\s*)+$/;
      if (text.trim().length > 40 && !pageMarkerPattern.test(text.trim())) {
        const cleaned = cleanArabicExtractedPdf(text);
        if (cleaned.length > 40) return cleaned;
      }
    } catch (popplerCmdErr) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  } catch {
    // fallback to Method 2
  }

  // 2. Method 2: PDFParse JavaScript Engine
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();

    const rawText = (parsed.text || "").trim();
    const pageMarkerPattern = /^(--\s*\d+\s*of\s*\d+\s*--\s*)+$/;
    if (rawText.length > 50 && !pageMarkerPattern.test(rawText)) {
      const cleaned = cleanArabicExtractedPdf(rawText);
      if (cleaned.length > 40) return cleaned;
    }
  } catch {
    // fallback to Method 3
  }

  // 3. Method 3: OCR fallback for scanned images
  if (isOcrAvailable()) {
    try {
      const tmpPath = `/tmp/pdf_ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
      fs.writeFileSync(tmpPath, buffer);
      const ocrText = await extractTextWithOcr(tmpPath);
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

      if (ocrText && ocrText.trim().length > 30) {
        const cleaned = cleanArabicExtractedPdf(ocrText);
        if (cleaned.length > 30) return cleaned;
      }
    } catch (ocrErr) {
      logger.warn("[PDF-Extractor] OCR extraction fallback failed:", {
        error: ocrErr instanceof Error ? ocrErr.message : String(ocrErr),
      });
    }
  }

  return "";
}

/**
 * Downloads and extracts text from a PDF URL.
 */
export async function extractTextFromPdfUrl(url: string): Promise<string> {
  const buffer = await downloadPdfBuffer(url);
  if (!buffer) return "";
  return extractTextFromPdfBuffer(buffer);
}

/**
 * Scans markdown and HTML content to find all links pointing to .pdf files.
 */
export function extractPdfLinksFromContent(content: string, baseUrl?: string): string[] {
  const links: string[] = [];

  // Match markdown links: [Title](url)
  const mdRegex = /\[([^\]]*)\]\((https?:\/\/[^\s\)]+\.pdf[^\s\)]*|[^\s\)]+\.pdf[^\s\)]*)\)/gi;
  for (const m of content.matchAll(mdRegex)) {
    const raw = m[2];
    const full = resolvePdfUrl(raw, baseUrl);
    if (full && !links.includes(full)) links.push(full);
  }

  // Match HTML href: href="url"
  const htmlRegex = /href=["']([^"']+\.pdf[^"']*)["']/gi;
  for (const m of content.matchAll(htmlRegex)) {
    const raw = m[1];
    const full = resolvePdfUrl(raw, baseUrl);
    if (full && !links.includes(full)) links.push(full);
  }

  // Match raw URLs in text: https://...pdf
  const rawUrlRegex = /(https?:\/\/[^\s<>"'\)]+\.pdf[^\s<>"'\)]*)/gi;
  for (const m of content.matchAll(rawUrlRegex)) {
    const raw = m[1];
    const full = resolvePdfUrl(raw, baseUrl);
    if (full && !links.includes(full)) links.push(full);
  }

  return links;
}

function resolvePdfUrl(raw: string, baseUrl?: string): string | null {
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }
    if (baseUrl) {
      const base = new URL(baseUrl);
      const resolved = new URL(raw, base.origin);
      return resolved.href;
    }
    return null;
  } catch {
    return null;
  }
}
