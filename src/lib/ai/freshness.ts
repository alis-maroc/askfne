/**
 * Data Freshness — AGENTS.md compliant
 *
 * Every institutional source must carry freshness metadata so that a 2024
 * reunion composition cannot answer a 2026 current-members question.
 *
 * The three required fields are:
 *   - source        : who published this data
 *   - publishedAt   : when it was published
 *   - status        : "current" | "historical"
 *
 * Optional:
 *   - validUntil    : expiry date (null = no expiry)
 *
 * Usage in prompts:
 *   If status === "historical" → append "[Information historique — vérifier la date]"
 *   If validUntil < now → append "[Information potentiellement obsolète]"
 */

export interface FreshnessMetadata {
    source: string;
    publishedAt: Date;
    /** "current" = valid for answering today, "historical" = only for historical queries */
    status: "current" | "historical";
    /** Optional expiry. null = no expiry. */
    validUntil?: Date | null;
}

/** Built-in fallback metadata for data without provenance. */
export const UNKNOWN_FRESHNESS: FreshnessMetadata = {
    source: "inconnu",
    publishedAt: new Date(0), // Unix epoch — deliberately ancient
    status: "historical",
    validUntil: null,
};

/**
 * Check whether a piece of data can be cited as current.
 * Returns a reason string if the data is stale, or null if it's usable.
 */
export function getStalenessReason(
    meta: FreshnessMetadata,
    now: Date = new Date()
): string | null {
    if (meta.status === "historical") {
        return "[Information historique — vérifier la date de validité]";
    }

    if (meta.validUntil && meta.validUntil < now) {
        return "[Information potentiellement obsolète — expirée]";
    }

    return null;
}

/**
 * Annotate a text answer with staleness warnings.
 * Only adds a warning when staleness is detected.
 */
export function annotateWithStaleness(
    answer: string,
    meta: FreshnessMetadata,
    now: Date = new Date()
): string {
    const reason = getStalenessReason(meta, now);
    if (!reason) return answer;
    return `${answer}\n\n⚠️ ${reason}`;
}

/**
 * Human-readable age of a piece of data.
 */
export function getDataAge(publishedAt: Date, now: Date = new Date()): string {
    const diffMs = now.getTime() - publishedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "aujourd'hui";
    if (diffDays === 1) return "hier";
    if (diffDays < 7) return `il y a ${diffDays} jours`;
    if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)} semaines`;
    if (diffDays < 365) return `il y a ${Math.floor(diffDays / 30)} mois`;
    return `il y a ${Math.floor(diffDays / 365)} ans`;
}