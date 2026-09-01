import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

const SOURCE_URL = "https://hub.taalim.org/Office/export_offices_html.php";

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
        .replace(/&/gi, "&")
        .replace(/"/gi, '"')
        .replace(/'|'/gi, "'")
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

async function syncOffices(): Promise<{ offices: number; regional: number; errors: string[] }> {
    const errors: string[] = [];
    let officesCount = 0;
    let regionalCount = 0;

    // 1. Fetch and parse offices
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
        throw new Error(`Hub returned HTTP ${response.status}`);
    }
    const html = await response.text();
    const offices = parseOffices(html);

    if (offices.length === 0) {
        throw new Error("No offices found in hub export");
    }

    // 2. Get or create category
    let category = await prisma.category.findFirst({
        where: { name: { in: ["Offices", "الأجهزة والمكاتب", "المكاتب والتنظيم"] } },
    });
    if (!category) {
        category = await prisma.category.create({
            data: { name: "الأجهزة والمكاتب", description: "الهيكلة التنظيمية والمكاتب" },
        });
    }

    // 3. Upsert offices
    for (const o of offices) {
        try {
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
            officesCount++;
        } catch (err) {
            errors.push(`Office ${o.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // 4. Delete old auto-generated entries
    await prisma.knowledgeEntry.deleteMany({
        where: {
            categoryId: category.id,
            metadata: { path: ["source"], equals: "export_offices_hierarchical" },
        },
    });

    // 5. Generate national summary
    const regionalBureaus = offices.filter((o) => o.level === "جهوي");
    const provincialBureaus = offices.filter((o) => o.level === "إقليمي");
    const localBureaus = offices.filter((o) => o.level === "محلي");
    const parallelBureaus = offices.filter((o) => o.level === "موازي");

    let nationalContent = `تضم الهيكلة التنظيمية الرسمية للجامعة الوطنية للتعليم FNE اثنا عشر (12) مكتباً جهوياً يغطون كافة جهات المملكة، إضافة إلى المكاتب الإقليمية والمحلية والتنظيمات الموازية، وفق المعطيات الرسمية لمنصة التدبير Hub Taalim:\n\n`;
    nationalContent += `### 🏛️ القيادة الوطنية:\n`;
    nationalContent += `- **الكاتب الوطني للجامعة:** الرفيق **عبد الله اغميمط** (الهاتف: **0662075277**)\n`;
    nationalContent += `- **أمين المال الوطني:** الرفيق **أحمد السباعي** (الهاتف: **0671716559**)\n`;
    nationalContent += `- **الموقع الرسمي:** https://Taalim.org\n\n`;
    nationalContent += `### 📊 إحصائيات الهيكلة التنظيمية:\n`;
    nationalContent += `- **المكاتب الجهوية:** 12 مكتباً جهوياً\n`;
    nationalContent += `- **المكاتب الإقليمية:** ${provincialBureaus.length} مكتباً إقليمياً\n`;
    nationalContent += `- **المكاتب المحلية:** ${localBureaus.length} مكتباً محلياً\n`;
    nationalContent += `- **التنظيمات الموازية:** ${parallelBureaus.length} مكتباً موازياً\n\n`;
    nationalContent += `### 🌍 لائحة المكاتب الجهوية والكتاب الجهويين (12 جهة):\n\n`;
    nationalContent += `| الرقم | الجهة | الكاتب الجهوي المسؤول | هاتف الكاتب | أمين المال | هاتف الأمين |\n`;
    nationalContent += `|---|---|---|---|---|---|\n`;

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

    // 6. Generate regional dossiers
    const regions = Array.from(
        new Set(
            offices
                .map((o) => o.region)
                .filter((r) => r && r !== "—" && r !== "الوطني"),
        ),
    ).sort();

    for (const reg of regions) {
        try {
            const regBureaus = offices.filter((o) => o.region === reg);
            const rb = regBureaus.find((o) => o.level === "جهوي");
            const pbs = regBureaus.filter((o) => o.level === "إقليمي");
            const lbs = regBureaus.filter((o) => o.level === "محلي");
            const parBs = regBureaus.filter((o) => o.level === "موازي");

            let regContent = `# الهيكلة التنظيمية لجهة ${reg} (FNE)\n\n`;
            regContent += `تضم جهة **${reg}** تنظيماً نقابياً متكاملاً يشمل المكتب الجهوي، المكاتب الإقليمية، والمكاتب المحلية والموازية التالية:\n\n`;

            if (rb) {
                regContent += `## 🌍 1. المكتب الجهوي لـ ${reg}:\n`;
                regContent += `- **الكاتب الجهوي:** ${rb.secretary} (📞 ${rb.secretaryPhone})\n`;
                regContent += `- **أمين المال الجهوي:** ${rb.treasurer} (📞 ${rb.treasurerPhone})\n\n`;
            }

            if (pbs.length > 0) {
                regContent += `## 📍 2. المكاتب الإقليمية بالجهة (${pbs.length} أقاليم/عمالات):\n\n`;
                regContent += `| الإقليم / العمالة | الكاتب الإقليمي المسؤول | هاتف الكاتب | أمين المال | هاتف الأمين |\n`;
                regContent += `|---|---|---|---|---|\n`;
                pbs.forEach((pb) => {
                    const provName = pb.province.replace("المكتب الإقليمي لـ ", "");
                    regContent += `| **${provName}** | ${pb.secretary} | ${pb.secretaryPhone} | ${pb.treasurer} | ${pb.treasurerPhone} |\n`;
                });
                regContent += `\n`;
            }

            if (lbs.length > 0) {
                regContent += `## 🏠 3. المكاتب المحلية بالجهة (${lbs.length} مكاتب):\n\n`;
                regContent += `| المكتب المحلي | الإقليم التابع له | الكاتب المسؤول | هاتف الكاتب | أمين المال | هاتف الأمين |\n`;
                regContent += `|---|---|---|---|---|---|\n`;
                lbs.forEach((lb) => {
                    regContent += `| **${lb.name}** | ${lb.province} | ${lb.secretary} | ${lb.secretaryPhone} | ${lb.treasurer} | ${lb.treasurerPhone} |\n`;
                });
                regContent += `\n`;
            }

            if (parBs.length > 0) {
                regContent += `## ⚡ 4. التنظيمات الموازية بالجهة (${parBs.length}):\n\n`;
                parBs.forEach((parB) => {
                    regContent += `- **${parB.name}:** ${parB.secretary} (📞 ${parB.secretaryPhone}) / ${parB.treasurer} (📞 ${parB.treasurerPhone})\n`;
                });
                regContent += `\n`;
            }

            regContent += `---\n`;
            regContent += `- **الكاتب الوطني للجامعة الوطنية للتعليم FNE:** الرفيق **عبد الله اغميمط** (📞 0662075277).\n`;
            regContent += `- **بوابة المسؤولين والهيكلة الكاملة:** https://hub.taalim.org/responsables-fne.php\n`;

            await prisma.knowledgeEntry.create({
                data: {
                    categoryId: category.id,
                    title: `مكاتب الجامعة الوطنية للتعليم FNE بجهة ${reg}: المكتب الجهوي، المكاتب الإقليمية، المكاتب المحلية والكتاب المسؤولون`,
                    content: regContent,
                    priority: 230,
                    isActive: true,
                    metadata: { source: "export_offices_hierarchical", region: reg },
                },
            });
            regionalCount++;
        } catch (err) {
            errors.push(`Region ${reg}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return { offices: officesCount, regional: regionalCount, errors };
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request, "admin:create");
    if (!isAuthenticated(auth)) return auth;

    try {
        logger.info("[sync/offices] Starting office sync from hub.taalim.org");

        const result = await syncOffices();

        logger.info(`[sync/offices] Sync complete: ${result.offices} offices, ${result.regional} regional dossiers`);

        return NextResponse.json({
            success: true,
            message: `تم تحديث ${result.offices} مكتب و ${result.regional} مقال جهوي`,
            offices: result.offices,
            regional: result.regional,
            errors: result.errors,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[sync/offices] Sync failed:", message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
