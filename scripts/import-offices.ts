/**
 * Import active offices from the public HTML export.
 *
 * Usage:
 *   npx tsx scripts/import-offices.ts
 *   npx tsx scripts/import-offices.ts --file ./imports/offices.html
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SOURCE_URL = "https://hub.taalim.org/Office/export_offices_html.php";
const SOURCE_NAME = "export_offices_html.php";
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type Office = {
  id: number;
  level: string;
  name: string;
  region: string;
  province: string;
  parentOffice: string;
  secretary: string;
  secretaryPhone: string;
  treasurer: string;
  treasurerPhone: string;
  foundedAt: string;
  renewalAt: string;
  renewalDuration: string;
  updatedAt: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOffices(html: string): Office[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const offices: Office[] = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      decodeHtml(match[1]),
    );
    if (cells.length !== 14 || !/^\d+$/.test(cells[0])) continue;

    offices.push({
      id: Number(cells[0]),
      level: cells[1],
      name: cells[2],
      region: cells[3],
      province: cells[4],
      parentOffice: cells[5],
      secretary: cells[6],
      secretaryPhone: cells[7],
      treasurer: cells[8],
      treasurerPhone: cells[9],
      foundedAt: cells[10],
      renewalAt: cells[11],
      renewalDuration: cells[12],
      updatedAt: cells[13],
    });
  }

  return offices;
}

async function loadHtml(): Promise<string> {
  const fileArg = process.argv[process.argv.indexOf("--file") + 1];
  if (process.argv.includes("--file") && fileArg && fs.existsSync(path.resolve(fileArg))) {
    return fs.readFileSync(path.resolve(fileArg), "utf8");
  }

  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const offices = parseOffices(await loadHtml());
  if (offices.length === 0) throw new Error("No office rows found in source HTML");

  const category = await prisma.category.findFirst({
    where: { name: { equals: "Offices", mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
  if (!category) throw new Error('Category "Offices" does not exist');

  await prisma.office.updateMany({ data: { isActive: false } });

  await prisma.knowledgeEntry.deleteMany({
    where: { categoryId: category.id, metadata: { path: ["source"], equals: SOURCE_NAME } },
  });

  for (const office of offices) {
    await prisma.office.upsert({
      where: { sourceId: office.id },
      update: {
        level: office.level,
        name: office.name,
        region: office.region,
        province: office.province,
        parentOffice: office.parentOffice,
        secretary: office.secretary,
        secretaryPhone: office.secretaryPhone,
        treasurer: office.treasurer,
        treasurerPhone: office.treasurerPhone,
        foundedAt: office.foundedAt,
        renewalAt: office.renewalAt,
        renewalDuration: office.renewalDuration,
        sourceUpdatedAt: office.updatedAt,
        sourceUrl: SOURCE_URL,
        isActive: true,
      },
      create: {
        sourceId: office.id,
        level: office.level,
        name: office.name,
        region: office.region,
        province: office.province,
        parentOffice: office.parentOffice,
        secretary: office.secretary,
        secretaryPhone: office.secretaryPhone,
        treasurer: office.treasurer,
        treasurerPhone: office.treasurerPhone,
        foundedAt: office.foundedAt,
        renewalAt: office.renewalAt,
        renewalDuration: office.renewalDuration,
        sourceUpdatedAt: office.updatedAt,
        sourceUrl: SOURCE_URL,
        isActive: true,
      },
    });

    await prisma.knowledgeEntry.create({
      data: {
        categoryId: category.id,
        title: `${office.name} (${office.level})`,
        content: [
          `المكتب: ${office.name}`,
          `المستوى: ${office.level}`,
          `الجهة: ${office.region}`,
          `الإقليم: ${office.province}`,
          `المكتب الأب: ${office.parentOffice}`,
          `الكاتب المسؤول: ${office.secretary}`,
          `هاتف الكاتب: ${office.secretaryPhone}`,
          `أمين المال: ${office.treasurer}`,
          `هاتف الأمين: ${office.treasurerPhone}`,
          `تاريخ التأسيس: ${office.foundedAt}`,
          `التجديد المقبل: ${office.renewalAt}`,
          `مدة التجديد: ${office.renewalDuration}`,
        ].join("\n"),
        priority: 120,
        isActive: true,
        metadata: { source: SOURCE_NAME, sourceUrl: SOURCE_URL, sourceId: office.id, updatedAt: office.updatedAt },
      },
    });
  }

  console.log(`Imported ${offices.length} offices into ${category.name}.`);
}

main()
  .catch((error) => {
    console.error("Office import failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());