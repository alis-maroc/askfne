/**
 * Test semantic search: verify ce913fce is returned for the user's query.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma } from "../src/generated/prisma/client";

const connectionString =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getApiKey(): Promise<string | null> {
    const s = await prisma.settings.findFirst({
        select: { aiApiKey: true, aiProvider: true, fallbackApiKey: true, fallbackProvider: true }
    });
    if (!s) return null;
    if (s.fallbackApiKey?.startsWith("sk-or-v1-")) return s.fallbackApiKey;
    if (s.aiApiKey?.startsWith("sk-or-v1-")) return s.aiApiKey;
    if (s.aiApiKey?.startsWith("sk-")) return s.aiApiKey;
    return null;
}

async function embed(text: string, key: string): Promise<number[]> {
    const r = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
            "HTTP-Referer": "https://owly.example.com",
            "X-Title": "Owly"
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text })
    });
    if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return d.data[0].embedding;
}

async function main() {
    const query = "جديد تدبير الفائض هاته السنة";
    console.log("Query:", query);
    console.log("");

    const key = await getApiKey();
    if (!key) { console.error("No API key"); process.exit(1); }
    console.log("API key prefix:", key.slice(0, 14) + "...");

    const qEmb = await embed(query, key);
    console.log("Query embedding dim:", qEmb.length);
    console.log("");

    const entries = await prisma.knowledgeEntry.findMany({
        where: { isActive: true },
        select: { id: true, title: true, content: true, metadata: true }
    });

    const results: { id: string; title: string; score: number; contentLen: number }[] = [];
    for (const e of entries) {
        const m = e.metadata as Prisma.JsonObject | null;
        if (!m) continue;
        const emb = m["embedding"];
        if (!Array.isArray(emb) || emb.length !== 1536) continue;
        const score = cosineSimilarity(qEmb, emb as unknown as number[]);
        results.push({ id: e.id, title: e.title, score, contentLen: e.content.length });
    }

    results.sort((a, b) => b.score - a.score);
    console.log("Total entries with valid embeddings:", results.length);
    console.log("");
    console.log("Top 10 semantic matches:");
    for (let i = 0; i < Math.min(10, results.length); i++) {
        const r = results[i];
        const tag = r.id === "ce913fce" ? "  <- TARGET" : "";
        console.log(`  #${i + 1}  ${r.score.toFixed(4)}  ${r.id}  (${r.contentLen}ch)${tag}`);
        console.log(`        ${r.title}`);
    }

    const target = results.find(r => r.id === "ce913fce");
    if (target) {
        const rank = results.indexOf(target) + 1;
        console.log("");
        console.log(`✅ ce913fce found at rank #${rank} with score ${target.score.toFixed(4)}`);
        console.log(`   Title: ${target.title}`);
        console.log(`   Will be boosted: ${target.score >= 0.25 ? "YES" : "NO (below threshold)"}`);
    } else {
        console.log("");
        console.log("❌ ce913fce NOT in results (likely no embedding yet)");
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => { console.error("FATAL:", e); process.exit(1); });
