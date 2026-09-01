const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const deact = await prisma.knowledgeEntry.updateMany({
    where: { id: "61bef001-d22a-49f9-a35a-e4d65e2ad5f7" },
    data: { isActive: false },
  });
  console.log("Deactivated redundant entry count:", deact.count);

  const boost = await prisma.knowledgeEntry.updateMany({
    where: { id: "7b59cbd0-e481-4a72-b75f-a36103122844" },
    data: { priority: 100, isActive: true },
  });
  console.log("Boosted practical entry count:", boost.count);
}

main().catch(console.error).finally(() => prisma.$disconnect());
