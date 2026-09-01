const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const category = await prisma.category.findFirst({ where: { name: 'Statuts FNE' } });
  if (!category) return console.log("Category not found");

  const entries = await prisma.knowledgeEntry.findMany({
    where: { categoryId: category.id }
  });

  // Sort entries by article number
  entries.sort((a, b) => {
    const numA = parseInt(a.title.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.title.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });

  console.log("Total entries:", entries.length);
  
  // Let's identify broken articles that are very short and clearly continuations
  let fullText = "";
  for (const entry of entries) {
    let content = entry.content.replace(/^Article \d+\s*/, '').trim();
    fullText += "\n\n" + entry.title + "\n" + content;
  }
  
  const fs = require('fs');
  fs.writeFileSync('/app/statuts_full.md', fullText);
  console.log("Exported full text to /app/statuts_full.md");
}

run().finally(() => prisma.$disconnect());
