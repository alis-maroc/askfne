/**
 * Semantic Search for Knowledge Base
 *
 * Uses OpenAI embeddings for vector similarity search.
 * Falls back to keyword matching when embeddings are unavailable.
 *
 * Embeddings are stored in the KnowledgeEntry metadata field as JSON.
 * For production with pgvector, store in a dedicated vector column.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { cacheGet, cacheSet } from "@/lib/cache";

interface SearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  score: number;
}

/**
 * Detect whether an API key belongs to OpenRouter (sk-or-v1-*).
 * OpenRouter exposes OpenAI-compatible embedding models with the same key.
 */
function isOpenRouterKey(apiKey: string | null | undefined): boolean {
  return typeof apiKey === "string" && apiKey.startsWith("sk-or-v1-");
}

/**
 * Generate embedding for a text using OpenAI or OpenRouter (auto-detected).
 *
 * - `sk-...` keys  → https://api.openai.com/v1/embeddings (text-embedding-3-small)
 * - `sk-or-v1-...` → https://openrouter.ai/api/v1/embeddings (text-embedding-3-small)
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const useOpenRouter = isOpenRouterKey(apiKey);
    const endpoint = useOpenRouter
      ? "https://openrouter.ai/api/v1/embeddings"
      : "https://api.openai.com/v1/embeddings";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    // OpenRouter requires these attribution headers per their docs.
    if (useOpenRouter) {
      headers["HTTP-Referer"] = "https://owly.example.com";
      headers["X-Title"] = "Owly Knowledge Base";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.substring(0, 8000),
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.warn(`Embedding API error ${response.status}: ${errText.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (error) {
    logger.error("Failed to generate embedding:", error);
    return null;
  }
}

/**
 * Pick the best available API key for embeddings.
 *
 * Prefers an OpenAI key on the primary slot, falls back to an OpenRouter key
 * (typically stored in fallbackApiKey when primary is Groq).
 */
async function getEmbeddingApiKey(): Promise<string | null> {
  const settings = await prisma.settings.findFirst({
    select: { aiApiKey: true, aiProvider: true, fallbackApiKey: true, fallbackProvider: true },
  });
  if (!settings) return null;

  // Prefer primary when it's an OpenAI-compatible key.
  if (settings.aiProvider === "openai" && settings.aiApiKey?.startsWith("sk-")) {
    return settings.aiApiKey;
  }
  // OpenRouter keys can drive embeddings even when primary provider is Groq.
  if (isOpenRouterKey(settings.fallbackApiKey)) {
    return settings.fallbackApiKey;
  }
  // Or if primary itself is OpenRouter (rare config).
  if (isOpenRouterKey(settings.aiApiKey)) {
    return settings.aiApiKey;
  }
  return null;
}

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Keyword-based search fallback.
 */
function keywordScore(query: string, text: string): number {
  const normQuery = query.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").trim();
  const normText = text.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "");

  if (normQuery.length > 5 && (normText.includes(normQuery) || normQuery.includes(normText))) return 1.0;

  const queryWords = normQuery.split(/\s+/).filter((w) => w.length >= 3);
  if (queryWords.length === 0) return 0;

  let matches = 0;
  for (const word of queryWords) {
    if (normText.includes(word)) matches++;
  }

  return matches / queryWords.length;
}

/**
 * Search the knowledge base semantically.
 * Uses embeddings when available, falls back to keyword matching.
 */
export async function searchKnowledgeBase(
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { isActive: true },
    include: { category: { select: { name: true } } },
  });

  if (entries.length === 0) return [];

  // Try to get API key for embeddings (OpenAI or OpenRouter, both work).
  const apiKey = await getEmbeddingApiKey();

  let results: SearchResult[];

  if (apiKey) {
    // Try semantic search with embeddings
    const cacheKey = `embedding:${Buffer.from(query).toString("base64").substring(0, 50)}`;
    let queryEmbedding: number[] | null = null;

    const cached = await cacheGet(cacheKey);
    if (cached) {
      queryEmbedding = JSON.parse(cached);
    } else {
      queryEmbedding = await generateEmbedding(query, apiKey);
      if (queryEmbedding) {
        await cacheSet(cacheKey, JSON.stringify(queryEmbedding), 3600);
      }
    }

    if (queryEmbedding) {
      // Score entries using embeddings (stored in metadata) + keyword fallback
      results = entries.map((entry) => {
        const metadata = entry.metadata as Record<string, unknown> | null;
        const entryEmbedding = metadata?.embedding as number[] | null;

        let score: number;
        if (entryEmbedding) {
          score = cosineSimilarity(queryEmbedding!, entryEmbedding);
        } else {
          // Fallback to keyword matching for entries without embeddings
          score = keywordScore(query, `${entry.title} ${entry.content}`);
        }

        return {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          category: entry.category.name,
          score,
        };
      });
    } else {
      // Embedding generation failed, use keyword search
      results = keywordSearch(entries, query);
    }
  } else {
    // No API key, use keyword search
    results = keywordSearch(entries, query);
  }

  return results
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function keywordSearch(
  entries: Array<{
    id: string;
    title: string;
    content: string;
    category: { name: string };
  }>,
  query: string
): SearchResult[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    category: entry.category.name,
    score: keywordScore(query, `${entry.title} ${entry.content}`),
  }));
}

/**
 * Generate and store embedding for a knowledge entry.
 *
 * Accepts an explicit apiKey for backward compatibility. If the key is not
 * suitable (e.g. it's a Groq key), the function falls back to the best
 * embedding-capable key from Settings (OpenRouter fallbackApiKey, etc.).
 */
export async function indexKnowledgeEntry(
  entryId: string,
  apiKey?: string
): Promise<boolean> {
  const entry = await prisma.knowledgeEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry) return false;

  // Resolve a usable key: explicit OpenAI/OpenRouter key wins,
  // otherwise we look up the best embedding key from Settings.
  const effectiveKey =
    apiKey && (apiKey.startsWith("sk-") || apiKey.startsWith("sk-or-v1-"))
      ? apiKey
      : await getEmbeddingApiKey();

  if (!effectiveKey) {
    logger.warn("indexKnowledgeEntry: no usable embedding key found");
    return false;
  }

  const text = `${entry.title}\n${entry.content}`;
  const embedding = await generateEmbedding(text, effectiveKey);

  if (!embedding) return false;

  const currentMetadata = (entry.metadata as Record<string, unknown>) || {};

  await prisma.knowledgeEntry.update({
    where: { id: entryId },
    data: {
      metadata: { ...currentMetadata, embedding },
    },
  });

  return true;
}
