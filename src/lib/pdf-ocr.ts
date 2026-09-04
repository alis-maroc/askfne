/**
 * OCR fallback for scanned/image-based PDFs.
 * When pdftotext returns empty/insufficient text, this module:
 *   1. Converts each PDF page to a PNG image using pdftoppm
 *   2. Runs Tesseract OCR (Arabic + French) on each image
 *   3. Concatenates results with form-feed page separators
 *
 * Requirements: poppler-utils (pdftoppm), tesseract-ocr, tesseract-ocr-ara, tesseract-ocr-fra
 */

import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const execAsync = promisify(exec);

const OCR_TMP_PREFIX = "/tmp/ocr";
const OCR_LANGS = "ara+fra"; // Arabic + French (MEN docs are bilingual)
const OCR_TIMEOUT_MS = 60_000; // 60s per page max
const OCR_MIN_CHARS_PER_PAGE = 10;
const OCR_DPI = 200; // balance quality vs speed

/**
 * Extract text from a PDF file using OCR (Tesseract).
 * Returns empty string on failure.
 *
 * @param pdfPath Absolute path to the PDF file
 * @returns Concatenated OCR text with "\n\n" between pages
 */
export async function extractTextWithOcr(pdfPath: string): Promise<string> {
    if (!existsSync(pdfPath)) return "";

    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const imageDir = `${OCR_TMP_PREFIX}_${sessionId}`;
    const imagePrefix = `${imageDir}/page`;

    try {
        // 1. Convert first 5 PDF pages to PNG images asynchronously (never block Node event loop / WhatsApp)
        await execAsync(
            `mkdir -p "${imageDir}" && /usr/bin/pdftoppm -f 1 -l 5 -r 150 -png "${pdfPath}" "${imagePrefix}"`,
            { timeout: 35_000 }
        );

        // 2. List generated images
        const files = readdirSync(imageDir)
            .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
            .sort()
            .slice(0, 5);

        if (files.length === 0) return "";

        // 3. Run Tesseract on each page (psm 3 handles full pages with headers/stamps much better)
        const pageTexts: string[] = [];
        for (const file of files) {
            const imagePath = join(imageDir, file);
            const baseOut = join(imageDir, file.replace(".png", ""));
            try {
                await execAsync(
                    `/usr/bin/tesseract "${imagePath}" "${baseOut}" -l ${OCR_LANGS} --psm 3`,
                    { timeout: 30_000 }
                );
                const txtPath = `${baseOut}.txt`;
                if (existsSync(txtPath)) {
                    const text = readFileSync(txtPath, "utf-8").trim();
                    if (text.length >= OCR_MIN_CHARS_PER_PAGE) {
                        pageTexts.push(text);
                    }
                }
            } catch {
                // Skip failed pages, continue with others
            }
        }

        return pageTexts.join("\n\n");
    } catch {
        return "";
    } finally {
        // Cleanup: remove temp directory
        try {
            const files = readdirSync(imageDir);
            for (const f of files) {
                try { unlinkSync(join(imageDir, f)); } catch { }
            }
            execSync(`rmdir "${imageDir}" 2>/dev/null || rm -rf "${imageDir}"`, { stdio: "pipe" });
        } catch {
            // best effort cleanup
        }
    }
}

/**
 * Quick check: does the container have Tesseract + pdftoppm available?
 * Used to skip OCR step entirely when tools are missing.
 */
let ocrAvailableCache: boolean | null = null;
export function isOcrAvailable(): boolean {
    if (ocrAvailableCache !== null) return ocrAvailableCache;
    try {
        execSync("which tesseract && which pdftoppm", { stdio: "pipe" });
        ocrAvailableCache = true;
    } catch {
        ocrAvailableCache = false;
    }
    return ocrAvailableCache;
}
