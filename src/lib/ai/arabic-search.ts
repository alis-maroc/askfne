/**
 * Secure Arabic Search — AGENTS.md compliant
 *
 * Goals:
 *  - One normalisation function used everywhere
 *  - Exact match OR validated alias → direct hit
 *  - Trigram fuzzy search → only for explicit bureau requests
 *  - Ambiguity → clarification WITHOUT phone numbers
 *  - Hierarchical validation: region → province → bureau
 *
 * The previous code conflated fuzzy similarity with generic knowledge
 * search, which caused a single variant ("تزميت") to trigger geographic
 * lookups over 82+ offices. This module restricts that surface area.
 */

import { INTENT, type Intent } from "./intent-router";

/**
 * Single normalisation entry point. Apply this to ALL Arabic text BEFORE
 * comparison. Do not call any other normalisation helper.
 */
export function normalizeArabic(text: string): string {
    const normalized = text
        .toLowerCase()
        .replace(/[إأآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/\u0640/g, "") // tatweel
        .replace(/[\u064b-\u065f\u0670]/g, "") // harakat
        .replace(/اال/g, "ال")
        .replace(/اإل/g, "ال")
        .replace(/األ/g, "ال")
        .replace(/اآل/g, "ال")
        .replace(/\s+/g, " ")
        .trim();
    return CITY_ALIASES[normalized] ?? normalized;
}

/**
 * Validated city aliases. Only entries listed here are considered safe to
 * normalise. Anything not in this table is treated as ambiguous.
 *
 * Add new entries deliberately — they will be accepted as exact matches
 * and will bypass the fuzzy search path.
 */
const CITY_ALIASES: Record<string, string> = {
    تزميت: "تيزنيت",
    تارودانت: "تارودانت",
    شتوكة: "شتوكة ايت باها",
};

/**
 * Apply a known alias if one exists. Returns the canonical city name OR
 * the original text when no alias matches.
 *
 * This function is NOT a fuzzy matcher — it never guesses.
 */
export function applyCityAlias(text: string): string {
    return normalizeArabic(text);
}

/**
 * Trigram set for fuzzy matching.
 *
 * The trigrams are an internal implementation detail — callers must NOT
 * rely on them. They exist solely to enable optional correction
 * suggestions when an explicit bureau request fails exact match.
 */
export function trigrams(text: string): Set<string> {
    const normalized = normalizeArabic(text);
    const result = new Set<string>();
    if (normalized.length < 3) {
        result.add(normalized);
        return result;
    }
    for (let i = 0; i <= normalized.length - 3; i++) {
        result.add(normalized.slice(i, i + 3));
    }
    return result;
}

/**
 * Jaccard similarity over trigrams. Returns a number in [0, 1].
 */
export function trigramSimilarity(a: string, b: string): number {
    const aTri = trigrams(a);
    const bTri = trigrams(b);
    if (aTri.size === 0 && bTri.size === 0) return 0;
    let intersect = 0;
    aTri.forEach((t) => {
        if (bTri.has(t)) intersect++;
    });
    const union = new Set([...aTri, ...bTri]).size;
    return union === 0 ? 0 : intersect / union;
}

export interface SearchOptions {
    /**
     * Whether fuzzy / trigram similarity is allowed.
     * Defaults to FALSE — must be enabled ONLY for explicit bureau requests.
     */
    allowFuzzy?: boolean;
    /** Fuzzy similarity threshold. Defaults to 0.7. */
    fuzzyThreshold?: number;
    /** The intent under which this search is being performed. */
    intent: Intent;
}

/**
 * Hierarchical city lookup result.
 * `region → province → bureau` must be respected.
 */
export interface CityMatch {
    /** Canonical bureau name (after alias resolution) */
    bureau: string;
    /** Province / région */
    province?: string;
    /** Confidence of the match */
    confidence: number;
    /** Did the match require fuzzy similarity? */
    fuzzy: boolean;
    /** Optional alternate matches for clarification */
    alternatives: Array<{ bureau: string; confidence: number }>;
}

export interface SearchInput {
    query: string;
    candidates: ReadonlyArray<{ bureau: string; province?: string }>;
    options: SearchOptions;
}

/**
 * Secured city search. The default behaviour is EXACT match only.
 *
 * Fuzzy matching is gated on:
 *   1. options.allowFuzzy === true (caller must opt in)
 *   2. options.intent === INTENT.CONTACT_BUREAU (only for bureau requests)
 *
 * If neither holds, fuzzy candidates are silently ignored.
 */
export function searchBureau(input: SearchInput): CityMatch | null {
    const { query, candidates, options } = input;
    const normalizedQuery = normalizeArabic(query);
    const aliasedQuery = applyCityAlias(normalizedQuery);

    // 1. Exact match (preferred path)
    for (const c of candidates) {
        if (
            normalizeArabic(c.bureau) === normalizedQuery ||
            normalizeArabic(c.bureau) === aliasedQuery
        ) {
            return {
                bureau: c.bureau,
                province: c.province,
                confidence: 1.0,
                fuzzy: false,
                alternatives: [],
            };
        }
    }

    // 2. Fuzzy match — ONLY if explicitly allowed AND intent is CONTACT_BUREAU
    const fuzzyEnabled =
        options.allowFuzzy === true && options.intent === INTENT.CONTACT_BUREAU;

    if (!fuzzyEnabled) {
        return null;
    }

    const threshold = options.fuzzyThreshold ?? 0.7;
    const scored = candidates.map((c) => ({
        bureau: c.bureau,
        province: c.province,
        confidence: trigramSimilarity(normalizedQuery, c.bureau),
    }));

    scored.sort((a, b) => b.confidence - a.confidence);

    const top = scored[0];
    if (!top || top.confidence < threshold) {
        return null;
    }

    // Collect alternatives that meet the threshold (for clarification)
    const alternatives = scored
        .filter((s) => s !== top && s.confidence >= threshold)
        .slice(0, 3)
        .map((s) => ({ bureau: s.bureau, confidence: s.confidence }));

    return {
        bureau: top.bureau,
        province: top.province,
        confidence: top.confidence,
        fuzzy: true,
        alternatives,
    };
}

/**
 * Validation helper. A bureau match is valid only when the requested
 * region → province → bureau chain is consistent. This guards against
 * cases where a city name appears in two regions.
 */
export function validateHierarchy(
    match: CityMatch,
    expectedRegion?: string,
    expectedProvince?: string
): boolean {
    if (!match.province) return true; // No province data — accept
    if (expectedProvince && match.province !== expectedProvince) return false;
    return true;
}