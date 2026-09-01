const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  console.log("Total active entries:", entries.length);

  const query = "ما هو آخر بيان للمكتب الوطني؟";
  
  function normalizeForMatch(text) {
    return text
      .toLowerCase()
      .replace(/[إأآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[\u064b-\u065f\u0670]/g, "")
      .replace(/[\u0640]/g, "")
      .replace(/اال/g, "ال")
      .replace(/اإل/g, "ال")
      .replace(/األ/g, "ال")
      .replace(/اآل/g, "ال")
      .replace(/بالغ/g, "بلاغ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const normQ = normalizeForMatch(query);
  console.log("Normalized query:", normQ);

  const isLatestNewsQuery =
    normQ.includes("اخر بيان") ||
    normQ.includes("احدث بيان") ||
    normQ.includes("اخر البيانات") ||
    normQ.includes("احدث البيانات") ||
    normQ.includes("اخر المستجدات") ||
    normQ.includes("احدث المستجدات") ||
    normQ.includes("بيان المكتب الوطني") ||
    normQ.includes("بيانات المكتب الوطني") ||
    normQ.includes("رسالة المكتب الوطني") ||
    (normQ.includes("بيان") && normQ.includes("اخر")) ||
    (normQ.includes("بيان") && normQ.includes("جديد"));

  console.log("isLatestNewsQuery:", isLatestNewsQuery);

  const newsEntries = entries
    .filter(
      (entry) =>
        entry.category.name === "الموقع الإلكتروني للجامعة" ||
        entry.title.includes("بيان") ||
        entry.title.includes("بلاغ") ||
        entry.title.includes("المكتب الوطني") ||
        entry.content.includes("المكتب الوطني")
    )
    .slice(0, 6);

  console.log("Found news entries:", newsEntries.length);
  for (const n of newsEntries) {
    console.log("-", n.title, `(${n.category.name})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
