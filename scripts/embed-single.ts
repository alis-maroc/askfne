/**
 * Re-embed a specific KB entry for semantic search.
 * Usage: npx tsx scripts/embed-single.ts <entry_id>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { indexKnowledgeEntry } from "../src/lib/ai/semantic-search";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/owly";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    const entryId = process.argv[2];
    if (!entryId) {
        console.error("Usage: npx tsx scripts/embed-single.ts <entry_id>");
        process.exit(1);
    }

    console.log(`Re-embedding entry: ${entryId}`);
    const success = await indexKnowledgeEntry(entryId);
    if (success) {
        console.log(`✅ Successfully embedded entry ${entryId}`);
    } else {
        console.error(`❌ Failed to embed entry ${entryId}`);
        process.exit(1);
    }
}

main().finally(() => prisma.$disconnect());
