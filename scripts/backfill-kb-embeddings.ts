/**
 * Backfill embeddings for all active knowledge base entries.
 *
 * Problem: indexKnowledgeEntry() was never called after entry create/update,
 * so NONE of the 478 entries have embeddings stored in metadata.
 *
 * This script generates OpenAI text-embedding-3-small vectors for every
 * active entry and stores them in metadata->'embedding'.
 *
 * Run: npx ts-node scripts/backfill-kb-embeddings.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma } from "../src/generated/prisma/client";

const connectionString =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/** Throttle: wait `ms` milliseconds before proceeding. */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Detect OpenRouter key (sk-or-v1-*) — OpenRouter exposes OpenAI-compatible embeddings. */
function isOpenRouterKey(apiKey: string): boolean {
    return apiKey.startsWith("sk-or-v1-");
}

/** Generate embedding via OpenAI or OpenRouter (auto-detected). */
async function generateEmbedding(
    text: string,
    apiKey: string
): Promise<number[] | null> {
    const useOpenRouter = isOpenRouterKey(apiKey);
    const endpoint = useOpenRouter
        ? "https://openrouter.ai/api/v1/embeddings"
        : "https://api.openai.com/v1/embeddings";

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
    };
    if (useOpenRouter) {
        headers["HTTP-Referer"] = "https://owly.example.com";
        headers["X-Title"] = "Owly Knowledge Base Backfill";
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: "text-embedding-3-small",
                input: text.substring(0, 8000),
            }),
        });

        if (!response.ok) {
            console.error(
                `  ${useOpenRouter ? "OpenRouter" : "OpenAI"} error ${response.status}: ${await response.text()}`
            );
            return null;
        }

        const data = (await response.json()) as { data?: { embedding?: number[] }[] };
        return data.data?.[0]?.embedding ?? null;
    } catch (err) {
        console.error("  Network error generating embedding:", err);
        return null;
    }
}

async function main() {
    console.log("🔄 Starting knowledge base embedding backfill...\n");

    // 1. Fetch API key from settings — same resolution as semantic-search.ts getEmbeddingApiKey()
    const settings = await prisma.settings.findFirst({
        select: {
            aiApiKey: true,
            aiProvider: true,
            fallbackApiKey: true,
            fallbackProvider: true,
        },
    });

    if (!settings) {
        console.error("❌ No settings found in database. Cannot generate embeddings.");
        process.exit(1);
    }

    // Resolve best embedding-capable key (mirrors getEmbeddingApiKey() in semantic-search.ts)
    let apiKey: string | null = null;
    let provider = "unknown";

    if (settings.aiProvider === "openai" && settings.aiApiKey?.startsWith("sk-")) {
        apiKey = settings.aiApiKey;
        provider = "openai";
    } else if (isOpenRouterKey(settings.fallbackApiKey)) {
        apiKey = settings.fallbackApiKey;
        provider = "openrouter (fallbackApiKey)";
    } else if (isOpenRouterKey(settings.aiApiKey)) {
        apiKey = settings.aiApiKey;
        provider = "openrouter (aiApiKey)";
    }

    if (!apiKey) {
        console.error(
            "❌ No usable embedding key found in settings.\n" +
            "  Primary  : " +
            (settings.aiProvider ?? "null") +
            " / " +
            (settings.aiApiKey ? settings.aiApiKey.substring(0, 10) + "..." : "null") +
            "\n" +
            "  Fallback : " +
            (settings.fallbackProvider ?? "null") +
            " / " +
            (settings.fallbackApiKey ? settings.fallbackApiKey.substring(0, 10) + "..." : "null")
        );
        process.exit(1);
    }

    console.log(`✅ Using provider: ${provider}`);
    console.log(`   Key prefix: ${apiKey.substring(0, 12)}...\n`);

    // 2. Fetch all active entries that need indexing
    const entries = await prisma.knowledgeEntry.findMany({
        where: { isActive: true },
        select: {
            id: true,
            title: true,
            content: true,
            metadata: true,
        },
    });

    console.log(`Found ${entries.length} active entries\n`);

    const toProcess = entries.filter((e) => {
        const meta = e.metadata as Record<string, unknown> | null;
        return !Array.isArray(meta?.embedding);
    });

    console.log(
        `  → ${toProcess.length} need embeddings\n` +
        `  → ${entries.length - toProcess.length} already have embeddings\n`
    );

    if (toProcess.length === 0) {
        console.log("✅ Nothing to do — all entries already indexed.");
        await prisma.$disconnect();
        return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const now = new Date();

    for (let i = 0; i < toProcess.length; i++) {
        const entry = toProcess[i];
        const progress = `[${i + 1}/${toProcess.length}]`;

        process.stdout.write(
            `${progress} Indexing "${entry.title.substring(0, 60)}"... `
        );

        try {
            const text = `${entry.title}\n${entry.content}`;
            const embedding = await generateEmbedding(text, apiKey);

            if (!embedding) {
                console.log("❌ FAILED (API error)");
                errors++;
                // Still sleep to respect rate limits
                await sleep(250);
                continue;
            }

            const currentMeta =
                (entry.metadata as Record<string, unknown>) || {};

            await prisma.knowledgeEntry.update({
                where: { id: entry.id },
                data: {
                    metadata: {
                        ...currentMeta,
                        embedding,
                    } as Prisma.InputJsonValue,
                },
            });

            console.log(`✅ (vector len=${embedding.length})`);
            updated++;
        } catch (err) {
            console.error(`❌ ERROR:`, err);
            errors++;
        }

        // Throttle: ~5 requests/second (200ms between calls) to stay well under
        // OpenAI's 3000 req/min limit for embeddings.
        if (i < toProcess.length - 1) {
            await sleep(200);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated:  ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors:  ${errors}`);
    console.log(`   Total:   ${toProcess.length}`);
    console.log(
        `\n✅ Backfill complete. ${updated} entries now have embeddings.`
    );

    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
