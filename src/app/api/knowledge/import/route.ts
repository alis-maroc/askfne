import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import crypto from "node:crypto";
import { PDFParse } from "pdf-parse";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { cleanArabicExtractedPdf } from "@/lib/arabic-cleaner";
import { extractTextWithOcr, isOcrAvailable } from "@/lib/pdf-ocr";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLongParagraph(paragraph: string, maxLength: number): string[] {
  if (paragraph.length <= maxLength) return [paragraph];
  const chunks: string[] = [];
  let current = "";
  for (const word of paragraph.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildChunks(text: string, maxLength = 1800): string[] {
  const paragraphs = normalizeText(text)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\n+/g, " ").trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, maxLength));

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// (cleanArabicExtractedPdf is now imported from @/lib/arabic-cleaner)

async function extractText(file: File): Promise<string> {
  const extension = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (extension === ".pdf") {
    // 1. Method 1: Poppler pdftotext (Highest quality for Arabic & formatting)
    try {
      const { execSync } = await import("child_process");
      const fs = await import("fs");
      const tmpPath = `/tmp/import_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
      fs.writeFileSync(tmpPath, buffer);
      try {
        // Use -raw for correct Arabic letter ordering (avoids RTL column swap issues in -layout mode)
        const text = execSync(`LANG=C.UTF-8 LC_ALL=C.UTF-8 /usr/bin/pdftotext -raw -enc UTF-8 "${tmpPath}" -`, {
          timeout: 20000,
          encoding: "utf-8",
          maxBuffer: 50 * 1024 * 1024,
        });
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        const pageMarkerPattern = /^(--\s*\d+\s*of\s*\d+\s*--\s*)+$/;
        if (text.trim().length > 40 && !pageMarkerPattern.test(text.trim())) {
          const cleaned = cleanArabicExtractedPdf(text);
          return normalizeText(cleaned);
        }
      } catch (cmdErr) {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        logger.warn("[Import] pdftotext CLI error:", {
          error: cmdErr instanceof Error ? cmdErr.message : String(cmdErr),
        });
      }
    } catch (popplerErr) {
      logger.warn("[Import] Poppler fallback trigger:", {
        error: popplerErr instanceof Error ? popplerErr.message : String(popplerErr),
      });
    }

    // 2. Method 2: PDFParse Javascript Engine
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text || "";
      // Only accept PDFParse output if it has real content (not just "-- 1 of N --" page markers)
      const pageMarkerPattern = /^(--\s*\d+\s*of\s*\d+\s*--\s*)+$/;
      if (text.trim().length > 50 && !pageMarkerPattern.test(text.trim())) {
        return normalizeText(cleanArabicExtractedPdf(text));
      }
    } catch (parseErr) {
      logger.warn("[Import] PDFParse fallback error:", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
    }

    // 3. Method 3: OCR fallback (Tesseract) for scanned/image-based PDFs
    if (isOcrAvailable()) {
      try {
        const { execSync } = await import("child_process");
        const fs = await import("fs");
        const tmpPath = `/tmp/ocr_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
        fs.writeFileSync(tmpPath, buffer);
        const ocrText = await extractTextWithOcr(tmpPath);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        if (ocrText && ocrText.trim().length > 20) {
          return normalizeText(cleanArabicExtractedPdf(ocrText));
        }
      } catch (ocrErr) {
        logger.warn("[Import] OCR fallback error:", {
          error: ocrErr instanceof Error ? ocrErr.message : String(ocrErr),
        });
      }
    }

    return "";
  }

  if (extension === ".txt" || extension === ".md") {
    return normalizeText(buffer.toString("utf8"));
  }

  throw new Error("Formats acceptés : PDF, TXT ou MD.");
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const categoryId = String(formData.get("categoryId") || "");
    const titlePrefix = String(formData.get("titlePrefix") || "").trim();

    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Le fichier dépasse 15 Mo." }, { status: 413 });
    if (!categoryId) return NextResponse.json({ error: "Catégorie requise." }, { status: 400 });

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 });

    const text = await extractText(file);
    const chunks = buildChunks(text);
    if (chunks.length === 0) return NextResponse.json({ error: "Aucun texte exploitable trouvé." }, { status: 422 });

    const sourceFile = file.name;
    await prisma.knowledgeEntry.deleteMany({
      where: { categoryId, metadata: { path: ["sourceFile"], equals: sourceFile } },
    });

    const prefix = titlePrefix || path.basename(sourceFile, path.extname(sourceFile));
    await prisma.knowledgeEntry.createMany({
      data: chunks.map((content, index) => ({
        categoryId,
        title: `[Import:${sourceFile}] ${prefix} - Partie ${index + 1}/${chunks.length}`,
        content,
        priority: 100,
        isActive: true,
        metadata: {
          sourceType: path.extname(sourceFile).slice(1),
          sourceFile,
          importedAt: new Date().toISOString(),
          part: index + 1,
          totalParts: chunks.length,
          hash: crypto.createHash("sha1").update(content).digest("hex"),
        },
      })),
    });

    return NextResponse.json({ imported: chunks.length, category: category.name, sourceFile });
  } catch (error) {
    logger.error("Knowledge file import failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import impossible." }, { status: 400 });
  }
}
