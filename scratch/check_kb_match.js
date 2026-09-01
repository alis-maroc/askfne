const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function normalizeForMatch(input) {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQueryTokens(query) {
  const normalized = normalizeForMatch(query);
  const rawTokens = normalized.split(" ").filter((t) => t.length >= 3);
  const tokens = [];

  for (const t of rawTokens) {
    tokens.push(t);
    if (t.length >= 4 && (t.startsWith("ب") || t.startsWith("ل") || t.startsWith("و") || t.startsWith("ف"))) {
      tokens.push(t.slice(1));
    }
    if (t.length >= 5 && t.startsWith("ال")) {
      tokens.push(t.slice(2));
    }
  }

  return Array.from(new Set(tokens.filter((t) => t.length >= 3)));
}

async function main() {
  const query1 = "كم عدد اعضاء المكتب الوطني";
  const query2 = "أعضاء وعضوات المكتب الوطني للجامعة الوطنية للتعليم FNE المنتخب اليوم الأحد 2 أكتوبر 2022 من طرف اللجنة الإدارية";

  const entries = await prisma.knowledgeEntry.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  for (const q of [query1, query2]) {
    console.log(`\n========================================`);
    console.log(`TESTING QUERY: "${q}"`);
    console.log(`========================================`);

    const tokens = extractQueryTokens(q);
    const normQ = normalizeForMatch(q);

    const ranked = entries.map((entry) => {
      const title = normalizeForMatch(entry.title);
      const category = normalizeForMatch(entry.category?.name || "");
      const content = normalizeForMatch(entry.content);

      let score = 0;
      if (normQ.length > 5 && (title.includes(normQ) || normQ.includes(title))) {
        score += 70;
      }
      if (normQ.length > 5 && (content.includes(normQ) || normQ.includes(content))) {
        score += 40;
      }

      for (const token of tokens) {
        if (title.includes(token)) score += 12;
        if (category.includes(token)) score += 4;
        if (content.includes(token)) score += 3;
      }

      const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
      if (ageMs < 14 * 86400000) {
        score += 15;
      }

      return { title: entry.title, content: entry.content.substring(0, 50), score, cat: entry.category?.name };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);

    console.log("Top 3 matches:");
    console.log(ranked.slice(0, 3));
  }
}

main().finally(() => prisma.$disconnect());
