/**
 * Import statute text as one KB entry per article.
 *
 * Usage:
 *   npx tsx scripts/import-statuts-articles.ts --file ./imports/status_fne_clean.txt --category "Statuts FNE"
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Options = {
  filePath: string;
  categoryName: string;
  priority: number;
};

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function parseArgs(argv: string[]): Options {
  const getArg = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };

  const fileArg = getArg("--file");
  if (!fileArg) throw new Error("Missing --file <path>");

  const priorityRaw = getArg("--priority");
  const priority = priorityRaw ? Number.parseInt(priorityRaw, 10) : 120;
  if (!Number.isFinite(priority)) throw new Error("Invalid --priority value");

  return {
    filePath: path.resolve(process.cwd(), fileArg),
    categoryName: getArg("--category")?.trim() || "Statuts FNE",
    priority,
  };
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .replace(/ +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseArticles(text: string): Array<{ number: number; body: string }> {
  const lines = text.split("\n");
  const articles: Array<{ number: number; body: string }> = [];
  let currentNumber: number | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentNumber !== null && currentBody.length > 0) {
      articles.push({
        number: currentNumber,
        body: normalize(currentBody.join("\n")),
      });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentNumber !== null) currentBody.push("");
      continue;
    }

    const match = line.match(/^(\d{1,3})\s*[\.)]\s*(.*)$/);
    if (match) {
      flush();
      currentNumber = Number.parseInt(match[1], 10);
      currentBody = [match[2] || ""];
      continue;
    }

    if (currentNumber !== null) {
      currentBody.push(line);
    }
  }

  flush();
  return articles.filter((a) => a.number >= 1 && a.number <= 200 && a.body.length > 0);
}

async function ensureCategory(name: string) {
  const existing = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return existing;

  const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
  return prisma.category.create({
    data: {
      name,
      description: "Structured statute articles",
      icon: "book-open",
      color: "#0F766E",
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.filePath)) {
    throw new Error(`File not found: ${options.filePath}`);
  }

  const fullText = normalize(fs.readFileSync(options.filePath, "utf8"));
  const articles = parseArticles(fullText);
  if (articles.length === 0) {
    throw new Error("No numbered articles found. Expected lines like '20. ...'");
  }

  const category = await ensureCategory(options.categoryName);
  console.log(`Using category: ${category.name} (${category.id})`);

  await prisma.knowledgeEntry.deleteMany({ where: { categoryId: category.id } });

  for (const article of articles) {
    await prisma.knowledgeEntry.create({
      data: {
        categoryId: category.id,
        title: `Statuts FNE - Article ${article.number}`,
        content: `Article ${article.number}\n${article.body}`,
        priority: options.priority,
        isActive: true,
        metadata: {
          sourceType: "manual",
          source: path.basename(options.filePath),
          structure: "article",
          articleNumber: article.number,
          quality: "high",
        },
      },
    });
  }

  console.log(`Imported ${articles.length} structured article entries.`);
}

main()
  .catch((err) => {
    console.error("Structured statute import failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
