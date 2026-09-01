/**
 * Import a PDF or text document into Owly Knowledge Base.
 *
 * Usage:
 *   npx tsx scripts/import-knowledge-pdf.ts --file ./docs/status.pdf --category "Statuts"
 *   npx tsx scripts/import-knowledge-pdf.ts --file ./imports/status.txt --category "Statuts"
 *
 * Optional flags:
 *   --priority 8
 *   --chunk-size 1800
 *   --title-prefix "Statut"
 *   --dry-run
 *   --no-embed
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFParse } from "pdf-parse";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Options = {
  filePath: string;
  categoryName: string;
  priority: number;
  chunkSize: number;
  titlePrefix: string;
  dryRun: boolean;
  noEmbed: boolean;
};

type SourceKind = "pdf" | "txt" | "md";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function printHelp(): void {
  console.log(`
Import PDF into knowledge base

Required:
  --file <path>            Absolute or relative path to PDF/TXT/MD

Optional:
  --category <name>        Category name (default: filename)
  --priority <int>         Entry priority (default: 6)
  --chunk-size <int>       Max characters per entry (default: 1800)
  --title-prefix <text>    Title prefix for generated entries
  --dry-run                Parse and preview only (no DB writes)
  --no-embed               Skip embedding index generation
  --help                   Show this help

Examples:
  npm run kb:import-pdf -- --file ./imports/statut.pdf --category "Statuts"
  npm run kb:import-pdf -- --file ./imports/status.pdf --dry-run
`);
}

function parseArgs(argv: string[]): Options {
  const getArg = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const fileArg = getArg("--file");
  if (!fileArg) {
    throw new Error("Missing required argument: --file <path>");
  }

  const resolvedFile = path.resolve(process.cwd(), fileArg);
  const fileBaseName = path.basename(resolvedFile, path.extname(resolvedFile));

  const categoryName = getArg("--category")?.trim() || fileBaseName;
  const titlePrefix = getArg("--title-prefix")?.trim() || fileBaseName;

  const priorityRaw = getArg("--priority");
  const priority = priorityRaw ? Number.parseInt(priorityRaw, 10) : 6;
  if (!Number.isFinite(priority)) {
    throw new Error("Invalid --priority value");
  }

  const chunkSizeRaw = getArg("--chunk-size");
  const chunkSize = chunkSizeRaw ? Number.parseInt(chunkSizeRaw, 10) : 1800;
  if (!Number.isFinite(chunkSize) || chunkSize < 500) {
    throw new Error("Invalid --chunk-size value (minimum: 500)");
  }

  return {
    filePath: resolvedFile,
    categoryName,
    priority,
    chunkSize,
    titlePrefix,
    dryRun: argv.includes("--dry-run"),
    noEmbed: argv.includes("--no-embed"),
  };
}

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

function getSourceKind(filePath: string): SourceKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".txt") return "txt";
  if (ext === ".md") return "md";
  throw new Error(`Unsupported file extension: ${ext}. Use .pdf, .txt, or .md`);
}

async function extractSourceText(filePath: string): Promise<{ text: string; kind: SourceKind }> {
  const kind = getSourceKind(filePath);

  if (kind === "pdf") {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return { text: normalizeText(parsed.text || ""), kind };
  }

  return { text: normalizeText(fs.readFileSync(filePath, "utf8")), kind };
}

function splitLongParagraph(paragraph: string, maxLen: number): string[] {
  if (paragraph.length <= maxLen) return [paragraph];

  const words = paragraph.split(/\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLen) {
      if (current) chunks.push(current);
      if (word.length > maxLen) {
        for (let i = 0; i < word.length; i += maxLen) {
          chunks.push(word.slice(i, i + maxLen));
        }
        current = "";
      } else {
        current = word;
      }
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function buildChunks(rawText: string, maxLen: number): string[] {
  const pages = rawText.split(/\f+/).map((p) => p.trim()).filter(Boolean);
  const sourceBlocks = pages.length > 0 ? pages : [rawText];

  const paragraphs = sourceBlocks
    .flatMap((block) => block.split(/\n\s*\n/))
    .map((p) => normalizeText(p.replace(/\n+/g, " ")))
    .filter((p) => p.length > 0)
    .flatMap((p) => splitLongParagraph(p, maxLen));

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxLen && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function findOrCreateCategory(categoryName: string, sourceFile: string) {
  const existing = await prisma.category.findFirst({
    where: { name: { equals: categoryName, mode: "insensitive" } },
  });

  if (existing) return existing;

  const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
  return prisma.category.create({
    data: {
      name: categoryName,
      description: `Imported from PDF: ${sourceFile}`,
      icon: "file-text",
      color: "#2563EB",
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(options.filePath)) {
    throw new Error(`Source file not found: ${options.filePath}`);
  }

  console.log(`Reading source: ${options.filePath}`);
  const extracted = await extractSourceText(options.filePath);
  const cleaned = extracted.text;
  if (!cleaned) {
    throw new Error("No readable text found in source file.");
  }

  const chunks = buildChunks(cleaned, options.chunkSize);
  if (chunks.length === 0) {
    throw new Error("No chunks generated from PDF content.");
  }

  console.log(`Source parsed (${extracted.kind}): ${chunks.length} chunk(s), ${cleaned.length} characters`);

  if (options.dryRun) {
    console.log("Dry-run mode enabled. No database write.");
    console.log("Preview:");
    for (let i = 0; i < Math.min(3, chunks.length); i++) {
      console.log(`\n[Chunk ${i + 1}] ${chunks[i].slice(0, 240)}...`);
    }
    return;
  }

  const sourceFile = path.basename(options.filePath);
  const sourceTag = `[PDF:${sourceFile}]`;
  const importedAt = new Date().toISOString();

  const category = await findOrCreateCategory(options.categoryName, sourceFile);
  console.log(`Using category: ${category.name} (${category.id})`);

  const removed = await prisma.knowledgeEntry.deleteMany({
    where: {
      categoryId: category.id,
      title: { startsWith: sourceTag },
    },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} previously imported chunk(s) for this PDF.`);
  }

  const createdIds: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const hash = crypto.createHash("sha1").update(chunk).digest("hex");
    const entry = await prisma.knowledgeEntry.create({
      data: {
        categoryId: category.id,
        title: `${sourceTag} ${options.titlePrefix} - Part ${i + 1}/${chunks.length}`,
        content: chunk,
        priority: options.priority,
        metadata: {
            sourceType: extracted.kind,
          sourceFile,
          importedAt,
          part: i + 1,
          totalParts: chunks.length,
          hash,
        },
      },
      select: { id: true },
    });
    createdIds.push(entry.id);
  }

  console.log(`Created ${createdIds.length} knowledge entry chunk(s).`);

  if (!options.noEmbed) {
    const settings = await prisma.settings.findFirst({ select: { aiApiKey: true } });
    if (settings?.aiApiKey) {
      const { indexKnowledgeEntry } = await import("../src/lib/ai/semantic-search");
      let ok = 0;
      for (const id of createdIds) {
        if (await indexKnowledgeEntry(id, settings.aiApiKey)) ok++;
      }
      console.log(`Embedding indexing completed: ${ok}/${createdIds.length}`);
    } else {
      console.log("Embedding indexing skipped: no AI API key configured in settings.");
    }
  } else {
    console.log("Embedding indexing disabled via --no-embed.");
  }

  console.log("PDF import completed successfully.");
}

main()
  .catch((error) => {
    console.error("PDF import failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
