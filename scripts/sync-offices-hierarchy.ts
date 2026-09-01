/**
 * Intelligent Hierarchical Sync for FNE Offices
 * 
 * Fetches the complete official directory from hub.taalim.org,
 * updates the Office table, and generates:
 * 1. National Overview Article (12 regions, counts, totals)
 * 2. 12 Comprehensive Regional Dossiers (every region with its regional bureau, all provincial bureaus, and local bureaus)
 * 3. Individual office entries for targeted lookups.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SOURCE_URL = "https://hub.taalim.org/Office/export_offices_html.php";
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

async function main() {
  console.log(`Fetching offices from ${SOURCE_URL}...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const offices = parseOffices(html);
  console.log(`Parsed ${offices.length} offices.`);

  if (offices.length === 0) throw new Error("No offices found!");

  let category = await prisma.category.findFirst({
    where: { name: { in: ["Offices", "الأجهزة والمكاتب", "المكاتب والتنظيم"] } },
  });
  if (!category) {
    category = await prisma.category.create({
      data: { name: "الأجهزة والمكاتب", description: "الهيكلة التنظيمية والمكاتب" },
    });
  }

  // 1. Upsert all into Office table
  for (const o of offices) {
    await prisma.office.upsert({
      where: { sourceId: o.id },
      update: {
        level: o.level,
        name: o.name,
        region: o.region,
        province: o.province,
        parentOffice: o.parentOffice,
        secretary: o.secretary,
        secretaryPhone: o.secretaryPhone,
        treasurer: o.treasurer,
        treasurerPhone: o.treasurerPhone,
        foundedAt: o.foundedAt,
        renewalAt: o.renewalAt,
        renewalDuration: o.renewalDuration,
        sourceUpdatedAt: o.updatedAt,
        isActive: true,
      },
      create: {
        sourceId: o.id,
        level: o.level,
        name: o.name,
        region: o.region,
        province: o.province,
        parentOffice: o.parentOffice,
        secretary: o.secretary,
        secretaryPhone: o.secretaryPhone,
        treasurer: o.treasurer,
        treasurerPhone: o.treasurerPhone,
        foundedAt: o.foundedAt,
        renewalAt: o.renewalAt,
        renewalDuration: o.renewalDuration,
        sourceUpdatedAt: o.updatedAt,
        sourceUrl: SOURCE_URL,
        isActive: true,
      },
    });
  }

  // Clear previous auto-generated office KnowledgeEntries
  await prisma.knowledgeEntry.deleteMany({
    where: {
      categoryId: category.id,
      metadata: { path: ["source"], equals: "export_offices_hierarchical" },
    },
  });

  // Group offices by Region
  const regionalBureaus = offices.filter((o) => o.level === "جهوي");
  const provincialBureaus = offices.filter((o) => o.level === "إقليمي");
  const localBureaus = offices.filter((o) => o.level === "محلي");
  const parallelBureaus = offices.filter((o) => o.level === "موازي");

  // Distinct regions
  const regions = Array.from(
    new Set(
      offices
        .map((o) => o.region)
        .filter((r) => r && r !== "—" && r !== "الوطني")
    )
  ).sort();

  console.log(`Found ${regions.length} regions.`);

  // 2. Generate National Overview
  let nationalContent = `تضم الهيكلة التنظيمية الرسمية للجامعة الوطنية للتعليم FNE اثنا عشر (12) مكتباً جهوياً يغطون كافة جهات المملكة، إضافة إلى المكاتب الإقليمية والمحلية والتنظيمات الموازية، وفق المعطيات الرسمية لمنصة التدبير Hub Taalim:\n\n`;
  nationalContent += `### 🏛️ القيادة الوطنية:\n- **الكاتب الوطني للجامعة:** الرفيق **عبد الله اغميمط** (الهاتف: **0662075277**)\n- **أمين المال الوطني:** الرفيق **أحمد السباعي** (الهاتف: **0671716559**)\n- **الموقع الرسمي:** https://Taalim.org\n\n`;
  nationalContent += `### 📊 إحصائيات الهيكلة التنظيمية:\n- **المكاتب الجهوية:** 12 مكتباً جهوياً\n- **المكاتب الإقليمية:** ${provincialBureaus.length} مكتباً إقليمياً\n- **المكاتب المحلية:** ${localBureaus.length} مكتباً محلياً\n- **التنظيمات الموازية:** ${parallelBureaus.length} مكتباً موازياً\n\n`;
  nationalContent += `### 🌍 لائحة المكاتب الجهوية والكتاب الجهويين (12 جهة):\n\n| الرقم | الجهة | الكاتب الجهوي المسؤول | هاتف الكاتب | أمين المال | هاتف الأمين |\n|---|---|---|---|---|---|\n`;

  regionalBureaus.forEach((rb, idx) => {
    const regName = rb.name.replace("المكتب الجهوي لـ ", "");
    nationalContent += `| ${idx + 1} | **جهة ${regName}** | ${rb.secretary} | ${rb.secretaryPhone} | ${rb.treasurer} | ${rb.treasurerPhone} |\n`;
  });

  await prisma.knowledgeEntry.create({
    data: {
      categoryId: category.id,
      title: `الهيكلة التنظيمية للجامعة الوطنية للتعليم FNE: عدد المكاتب الجهوية (12 جهة)، الإقليمية والمحلية والموقع الرسمي`,
      content: nationalContent,
      priority: 250,
      isActive: true,
      metadata: { source: "export_offices_hierarchical", type: "national_summary" },
    },
  });

  // 3. Generate Regional Dossier for EACH Region
  for (const reg of regions) {
    const regBureaus = offices.filter((o) => o.region === reg);
    const rb = regBureaus.find((o) => o.level === "جهوي");
    const pbs = regBureaus.filter((o) => o.level === "إقليمي");
    const lbs = regBureaus.filter((o) => o.level === "محلي");
    const parBs = regBureaus.filter((o) => o.level === "موازي");

    let regContent = `# الهيكلة التنظيمية لجهة ${reg} (FNE)\n\n`;
    regContent += `تضم جهة **${reg}** تنظيماً نقابياً متكاملاً يشمل المكتب الجهوي، المكاتب الإقليمية، والمكاتب المحلية والموازية التالية:\n\n`;

    if (rb) {
      regContent += `## 🌍 1. المكتب الجهوي لـ ${reg}:\n`;
      regContent += `- **الكاتب الجهوي المسؤول:** ${rb.secretary} (📞 **${rb.secretaryPhone}**)\n`;
      regContent += `- **أمين المال الجهوي:** ${rb.treasurer} (📞 ${rb.treasurerPhone})\n`;
      regContent += `- **تاريخ التأسيس / التجديد:** ${rb.foundedAt} | التجديد المقبل: ${rb.renewalAt}\n\n`;
    }

    if (pbs.length > 0) {
      regContent += `## 📍 2. المكاتب الإقليمية بالجهة (${pbs.length} أقاليم/عمالات):\n\n`;
      regContent += `| الإقليم / العمالة | الكاتب الإقليمي المسؤول | هاتف الكاتب | أمين المال | هاتف الأمين |\n|---|---|---|---|---|\n`;
      for (const pb of pbs) {
        const provName = pb.name.replace("المكتب الإقليمي لـ ", "");
        regContent += `| **${provName}** | ${pb.secretary} | ${pb.secretaryPhone} | ${pb.treasurer} | ${pb.treasurerPhone} |\n`;
      }
      regContent += `\n`;
    }

    if (lbs.length > 0) {
      regContent += `## 🏠 3. المكاتب المحلية بالجهة (${lbs.length} مكاتب):\n\n`;
      regContent += `| المكتب المحلي | الإقليم التابع له | الكاتب المسؤول | هاتف الكاتب | أمين المال | هاتف الأمين |\n|---|---|---|---|---|---|\n`;
      for (const lb of lbs) {
        regContent += `| **${lb.name}** | ${lb.province || "—"} | ${lb.secretary} | ${lb.secretaryPhone} | ${lb.treasurer} | ${lb.treasurerPhone} |\n`;
      }
      regContent += `\n`;
    }

    if (parBs.length > 0) {
      regContent += `## 🤝 4. التنظيمات الموازية بالجهة:\n\n`;
      for (const par of parBs) {
        regContent += `- **${par.name}** (${par.province || reg}): الكاتب المسؤول: ${par.secretary} (📞 ${par.secretaryPhone})\n`;
      }
      regContent += `\n`;
    }

    regContent += `---\n`;
    regContent += `- **الكاتب الوطني للجامعة الوطنية للتعليم FNE:** الرفيق **عبد الله اغميمط** (📞 0662075277).\n`;
    regContent += `- **بوابة المسؤولين والهيكلة الكاملة:** https://hub.taalim.org/responsables-fne.php\n`;

    const title = `مكاتب الجامعة الوطنية للتعليم FNE بجهة ${reg}: المكتب الجهوي، المكاتب الإقليمية، المكاتب المحلية والكتاب المسؤولون`;

    await prisma.knowledgeEntry.create({
      data: {
        categoryId: category.id,
        title,
        content: regContent,
        priority: 220,
        isActive: true,
        metadata: { source: "export_offices_hierarchical", region: reg },
      },
    });

    console.log(`Created regional dossier for ${reg} (${pbs.length} prov, ${lbs.length} local).`);
  }

  console.log("Successfully synced all offices and hierarchical regional dossiers!");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
