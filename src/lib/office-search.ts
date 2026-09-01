/**
 * Office search functions using Arabic consonantal skeleton matching.
 * 
 * Provides robust city name matching for Moroccan locations despite
 * spelling variants (alef variants, ta marbuta, prepositions, etc.)
 */

import { prisma } from "./prisma";
import { normalizeCitySkeleton } from "./arabic-skeleton";

// Import the Prisma Office type
type Office = NonNullable<Awaited<ReturnType<typeof prisma.office.findFirst>>>;

/**
 * Find offices by exact skeleton match.
 * Fast lookup for exact city name matches.
 */
export async function findOfficesBySkeleton(skeleton: string): Promise<Office[]> {
    if (!skeleton || skeleton.length < 2) return [];

    // Using type cast since squeletteVille field requires prisma generate to be run
    const offices = await prisma.office.findMany({
        where: {
            isActive: true,
            squeletteVille: skeleton,
        } as Record<string, unknown>,
        orderBy: [
            { level: "asc" },  // وطني first, then جهوي, إقليمي, then المحلي
            { sourceId: "asc" },
        ],
    });

    return offices;
}

/**
 * Find offices by skeleton matching against the query.
 * Extracts skeleton from query and matches against stored skeletons.
 */
export async function findOfficesByQuery(query: string): Promise<Office[]> {
    if (!query || query.length < 2) return [];

    // Extract skeleton from the query
    const querySkeleton = normalizeCitySkeleton(query);
    if (!querySkeleton || querySkeleton.length < 2) return [];

    // Try exact skeleton match first
    const exactMatches = await findOfficesBySkeleton(querySkeleton);
    if (exactMatches.length > 0) {
        return exactMatches;
    }

    // Fall back to trigram similarity search
    return findOfficesBySimilarity(query, 0.3);
}

/**
 * Find offices by trigram similarity.
 * Fallback for handling typos and approximate matches.
 */
export async function findOfficesBySimilarity(
    query: string,
    minSimilarity: number = 0.3
): Promise<Office[]> {
    if (!query || query.length < 2) return [];

    // Get skeleton for similarity comparison
    const querySkeleton = normalizeCitySkeleton(query);

    // Get all offices with skeletons
    const offices = await prisma.office.findMany({
        where: {
            isActive: true,
            squeletteVille: {
                not: null,
            },
        } as Record<string, unknown>,
        orderBy: [
            { level: "asc" },
            { sourceId: "asc" },
        ],
    });

    if (offices.length === 0) return [];

    // Calculate similarity scores using Levenshtein distance
    const scored = offices.map((office) => {
        // Cast to access squeletteVille field which exists in DB but not yet in generated types
        const officeRecord = office as unknown as { squeletteVille?: string };
        const officeSkeleton = officeRecord.squeletteVille || "";
        const similarity = calculateSimilarity(querySkeleton, officeSkeleton);
        return { office, similarity };
    });

    // Filter by minimum similarity and sort by score
    return scored
        .filter((item) => item.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .map((item) => item.office);
}

/**
 * Calculate similarity between two strings (0-1 scale).
 * Uses Levenshtein distance normalized by string length.
 */
function calculateSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;

    const distance = levenshteinDistance(a, b);
    return 1 - distance / maxLen;
}

/**
 * Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    // Use row-major order for better memory locality
    let prev = Array(n + 1).fill(0).map((_, i) => i);
    let curr = Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,      // deletion
                curr[j - 1] + 1, // insertion
                prev[j - 1] + cost // substitution
            );
        }
        [prev, curr] = [curr, prev];
    }

    return prev[n];
}

/**
 * Find the best matching office for a query.
 * Used by buildOfficeDirectAnswer in engine.ts.
 */
export async function findBestOfficeMatch(query: string): Promise<Office | null> {
    if (!query || query.length < 2) return null;

    // First try skeleton matching
    const skeletonMatches = await findOfficesByQuery(query);
    if (skeletonMatches.length > 0) {
        return skeletonMatches[0];
    }

    // Fall back to substring matching in name/province
    const normalizedQuery = normalizeCitySkeleton(query);
    const offices = await prisma.office.findMany({
        where: {
            isActive: true,
            OR: [
                { name: { contains: normalizedQuery } },
                { province: { contains: normalizedQuery } },
            ],
        },
        orderBy: [
            { level: "asc" },
            { sourceId: "asc" },
        ],
    });

    return offices.length > 0 ? offices[0] : null;
}

/**
 * Update squeletteVille for all offices.
 * Used during backfill operation.
 */
export async function updateAllOfficeSkeletons(): Promise<{ updated: number; errors: number }> {
    const offices = await prisma.office.findMany({
        where: { isActive: true },
    });

    let updated = 0;
    let errors = 0;

    for (const office of offices) {
        try {
            // Generate skeleton from province or name
            const cityName = office.province || office.name;
            const skeleton = normalizeCitySkeleton(cityName);

            await prisma.office.update({
                where: { id: office.id },
                data: { squeletteVille: skeleton } as Record<string, unknown>,
            });
            updated++;
        } catch (err) {
            console.error(`Error updating office ${office.id}:`, err);
            errors++;
        }
    }

    return { updated, errors };
}

/**
 * Compute and return skeleton for a city name.
 * Useful for debugging and testing.
 */
export function getSkeletonForCity(cityName: string): string {
    return normalizeCitySkeleton(cityName);
}
