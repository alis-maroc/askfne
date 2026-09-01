/**
 * Backfill squeletteVille for existing offices in the database.
 * 
 * This script computes and stores the Arabic consonantal skeleton
 * for all existing office city/province names.
 * 
 * NOTE: This script uses type casts because Prisma client hasn't been
 * regenerated with the new squeletteVille field. After running prisma generate,
 * the casts can be removed.
 * 
 * Run: npx ts-node scripts/backfill-office-skeletons.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeCitySkeleton } from "../src/lib/arabic-skeleton";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Type for office with squeletteVille (extended from Prisma)
type OfficeWithSkeleton = {
    id: string;
    name: string;
    province: string;
    squeletteVille: string | null;
};

async function main() {
    console.log("🔄 Starting office skeleton backfill...\n");

    // Cast the query result to include squeletteVille
    const offices = (await prisma.office.findMany({
        where: { isActive: true },
    })) as unknown as OfficeWithSkeleton[];

    console.log(`Found ${offices.length} active offices\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const office of offices) {
        try {
            // Generate skeleton from province or name
            const cityName = office.province || office.name;
            const skeleton = normalizeCitySkeleton(cityName);

            // Skip if already has the same skeleton
            if (office.squeletteVille === skeleton) {
                skipped++;
                continue;
            }

            // Cast the data to include squeletteVille
            await prisma.office.update({
                where: { id: office.id },
                data: { squeletteVille: skeleton } as Record<string, unknown>,
            });

            console.log(`✅ ${office.name} (${office.province || "no province"})`);
            console.log(`   → "${skeleton}"`);
            updated++;
        } catch (err) {
            console.error(`❌ Error updating office ${office.id}:`, err);
            errors++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors:  ${errors}`);
    console.log(`   Total:   ${offices.length}`);

    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
