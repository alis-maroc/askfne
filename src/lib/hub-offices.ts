/**
 * Real-time office data fetcher from hub.taalim.org
 * Fetches live data from the official source so we never have stale or wrong info.
 */

import { normalizeCitySkeleton } from "./arabic-skeleton";

const HUB_URL = "https://hub.taalim.org/responsables-fne.php";

export interface HubOffice {
    name: string;          // e.g. "تيزنيت" (إقليمي)
    level: "إقليمي" | "جهوي" | "محلي" | "وطني" | "موازي";
    secretary: string;
    secretaryPhone: string;
    treasurer: string;
    treasurerPhone: string;
    squeletteName?: string; // Computed skeleton of office name
    parentId?: number;     // For root-level offices (regions), their parent_id for navigation
}

// Simple in-memory cache with TTL
interface CacheEntry {
    data: HubOffice[];
    expiry: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function getCached(key: string): HubOffice[] | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCached(key: string, data: HubOffice[]): void {
    cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

/**
 * Normalize Arabic search term for hub search.
 * Removes harakat, hamza variations, and normalizes alef/taa marbuta variants.
 * This ensures "إيفني" and "إفني" both work with the hub.
 */
function normalizeForHubSearch(text: string): string {
    return text
        .replace(/[\u064B-\u065F\u0670]/g, "") // Remove harakat
        .replace(/[إأآ]/g, "ا")                // Normalize hamza to alef
        .replace(/ة/g, "ه")                     // Normalize ta marbuta
        .replace(/ى/g, "ي")                     // Normalize alef maqsura
        .trim();
}

/**
 * Generate search term variants for robust matching.
 * For Arabic city names, tries different normalizations.
 */
function generateSearchVariants(term: string): string[] {
    const variants = new Set<string>();
    variants.add(term);

    // Normalize to base form
    const normalized = normalizeForHubSearch(term);
    variants.add(normalized);

    // If it starts with alef variants, try without
    if (/^[إأآ]/.test(term)) {
        variants.add(term.slice(1));
        variants.add(normalized.slice(1));
    }

    // If short, try without diacritics only
    if (term.length <= 5) {
        variants.add(term.replace(/[\u064B-\u065F\u0670]/g, ""));
    }

    return Array.from(variants).filter((v) => v.length >= 2);
}

/**
 * Fetch offices matching a search term from hub.taalim.org.
 * Returns an empty array on any error (graceful fallback to local DB).
 *
 * Automatically tries multiple search variants for Arabic text:
 * - "إيفني" → tries "إيفني", "ايفني", "يفني"
 * - "تزنيت" → tries "تزنيت", "teznezte" (etc.)
 */
export async function fetchHubOffices(search: string): Promise<HubOffice[]> {
    if (!search || search.trim().length < 2) return [];
    const normalized = search.trim();
    const cacheKey = `search:${normalized}`;

    const cached = getCached(cacheKey);
    if (cached) return cached;

    // Try original search first
    let offices = await fetchHubOfficesSingle(normalized);
    if (offices.length > 0) {
        setCached(cacheKey, offices);
        return offices;
    }

    // If no results, try search variants for Arabic text
    const variants = generateSearchVariants(normalized);
    for (const variant of variants) {
        if (variant !== normalized) {
            offices = await fetchHubOfficesSingle(variant);
            if (offices.length > 0) {
                setCached(cacheKey, offices);
                return offices;
            }
        }
    }

    setCached(cacheKey, []);
    return [];
}


/**
 * Fetch the root-level offices from hub (national + regions).
 * Returns the FNE national office and 12 regional office entries.
 * Each entry includes parent_id for navigation.
 */
export async function fetchRootOffices(): Promise<HubOffice[]> {
    const cacheKey = "root";
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(HUB_URL, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; OwlyBot/1.0)", Accept: "text/html" },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const html = await res.text();
        const offices = parseRootOfficesHtml(html);
        setCached(cacheKey, offices);
        return offices;
    } catch (err) {
        console.warn("[hub-offices] fetchRootOffices failed:", String(err));
        return [];
    }
}

/**
 * Fetch offices for a specific parent_id from hub.
 * This returns provincial offices under a region.
 */
export async function fetchOfficesByParentId(parentId: number): Promise<HubOffice[]> {
    const cacheKey = `parent:${parentId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${HUB_URL}?parent_id=${parentId}`, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; OwlyBot/1.0)", Accept: "text/html" },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const html = await res.text();
        const offices = parseHubOfficesHtml(html);
        setCached(cacheKey, offices);
        return offices;
    } catch (err) {
        console.warn(`[hub-offices] fetchOfficesByParentId(${parentId}) failed:`, String(err));
        return [];
    }
}

/**
 * Fetch the 6 parallel organization entries from hub.
 * Returns SNEP, SNASE, SNAM, SNAP, UFEM, UJES.
 */
export async function fetchParallelOrganizations(): Promise<HubOffice[]> {
    const cacheKey = "parallel:orgs";
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${HUB_URL}?parallel=1`, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; OwlyBot/1.0)", Accept: "text/html" },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const html = await res.text();
        const offices = parseParallelOrgsHtml(html);
        setCached(cacheKey, offices);
        return offices;
    } catch (err) {
        console.warn("[hub-offices] fetchParallelOrganizations failed:", String(err));
        return [];
    }
}

/**
 * Fetch branches of a parallel organization by name.
 * e.g., "SNEP" -> branches of SNEP across Morocco.
 */
export async function fetchParallelBranches(parentId: number): Promise<HubOffice[]> {
    if (!Number.isInteger(parentId)) return [];
    const cacheKey = `parallel:${parentId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${HUB_URL}?parallel=1&parent_id=${parentId}`, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; OwlyBot/1.0)", Accept: "text/html" },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const html = await res.text();
        const offices = parseHubOfficesHtml(html);
        setCached(cacheKey, offices);
        return offices;
    } catch (err) {
        console.warn(`[hub-offices] fetchParallelBranches(${parentId}) failed:`, String(err));
        return [];
    }
}

/**
 * Parse root-level HTML (national + regions with parent_id links).
 */
function parseRootOfficesHtml(html: string): HubOffice[] {
    const offices: HubOffice[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            const cellText = cellMatch[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/&nbsp;/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            cells.push(cellText);
        }
        if (cells.length < 1) continue;

        const nameRaw = cells[0] || "";
        let name = nameRaw
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!name || name.length < 2) continue;
        if (name.includes("اسم المكتب")) continue;

        const parentIdMatch = rowHtml.match(/parent_id[=](\d+)/);
        const parentId = parentIdMatch ? parseInt(parentIdMatch[1]) : undefined;

        const isNational = nameRaw.includes("🏛") || name.includes("المكتب الوطني") || name.includes("FNE");
        const isRegional = nameRaw.includes("🌍") && parentId !== undefined;

        if (!isNational && !isRegional) continue;

        const phoneRegex = /\b0[567]\d{8}\b/g;
        const phones = cells.join(" ").match(phoneRegex) || [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const office: any = {
            name,
            level: isNational ? "وطني" : "جهوي",
            secretary: cells[1] || "",
            secretaryPhone: phones[0] || "",
            treasurer: cells[3] || "",
            treasurerPhone: phones[1] || "",
            squeletteName: normalizeCitySkeleton(name),
        };
        if (parentId !== undefined) office.parentId = parentId;
        offices.push(office);
    }
    return offices;
}

/**
 * Parse parallel organizations HTML.
 */
function parseParallelOrgsHtml(html: string): HubOffice[] {
    const offices: HubOffice[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            const cellText = cellMatch[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/&nbsp;/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            cells.push(cellText);
        }
        if (cells.length < 1) continue;

        const nameRaw = cells[0] || "";
        const name = nameRaw
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!name || name.length < 2) continue;
        if (name.includes("اسم")) continue;

        const phoneRegex = /\b0[567]\d{8}\b/g;
        const phones = cells.join(" ").match(phoneRegex) || [];
        const parentIdMatch = rowHtml.match(/parent_id[=](\d+)/);
        const parentId = parentIdMatch ? parseInt(parentIdMatch[1], 10) : undefined;
        const office: HubOffice = {
            name,
            level: "موازي",
            secretary: cells[1] || "",
            secretaryPhone: phones[0] || "",
            treasurer: cells[3] || "",
            treasurerPhone: phones[1] || "",
            squeletteName: normalizeCitySkeleton(name),
        };
        if (parentId !== undefined) office.parentId = parentId;
        offices.push(office);
    }
    return offices;
}


/**
 * Single hub fetch (internal).
 */
async function fetchHubOfficesSingle(normalized: string): Promise<HubOffice[]> {
    try {
        const url = `${HUB_URL}?search=${encodeURIComponent(normalized)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; OwlyBot/1.0)",
                Accept: "text/html,application/xhtml+xml",
            },
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[hub-offices] HTTP ${res.status} for search="${normalized}"`);
            return [];
        }

        const html = await res.text();
        return parseHubOfficesHtml(html);
    } catch (err) {
        console.warn(`[hub-offices] Fetch failed for "${normalized}":`, String(err));
        return [];
    }
}

/**
 * Parse the hub.taalim.org HTML page and extract office records.
 * The table structure has rows like:
 *   <tr>
 *     <td class="office-name">📍<strong>تيزنيت</strong></td>
 *     <td>هشام الكرطيط</td>
 *     <td dir="ltr">0666469305</td>
 *     <td>المدني الذهبي</td>
 *     <td dir="ltr">0668699235</td>
 *   </tr>
 */
function parseHubOfficesHtml(html: string): HubOffice[] {
    const offices: HubOffice[] = [];

    // Match each <tr>...</tr> row in the results table
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];

        // Extract cells
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            // Strip HTML tags and trim
            const cellText = cellMatch[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/&nbsp;/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            cells.push(cellText);
        }

        if (cells.length < 4) continue;

        // First cell is office name with icon, then secretary, phone, treasurer, phone
        // Strip emoji icons from name
        const nameRaw = cells[0] || "";
        let name = nameRaw
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, "")
            .replace(/\s+/g, " ")
            .trim();

        if (!name || name.length < 2) continue;
        // Skip header rows
        if (name.includes("اسم المكتب") || name.includes("الكاتب")) continue;

        // Detect level by emoji
        let level: HubOffice["level"] = "إقليمي";
        if (nameRaw.includes("🏛")) level = "وطني";
        else if (nameRaw.includes("📍")) level = "إقليمي";
        else if (nameRaw.includes("🏠")) level = "محلي";
        else if (nameRaw.includes("🌍") || nameRaw.includes("🌐")) level = "جهوي";

        // Phone numbers in the row
        const phoneRegex = /\b0[567]\d{8}\b/g;
        const phones = cells.join(" ").match(phoneRegex) || [];
        const parentIdMatch = rowHtml.match(/parent_id[=](\d+)/);
        const parentId = parentIdMatch ? parseInt(parentIdMatch[1], 10) : undefined;

        const isParallelBranch = cells.length >= 7 && nameRaw.includes("🏢");
        if (isParallelBranch) {
            const region = cells[1] || "";
            const province = cells[2] || "";
            name = [name, region, province].filter(Boolean).join(" - ");
        }

        // Compute skeleton for robust matching
        const squeletteName = normalizeCitySkeleton(name);

        const office: HubOffice = {
            name,
            level: isParallelBranch ? "موازي" : level,
            secretary: isParallelBranch ? cells[3] || "" : cells[1] || "",
            secretaryPhone: phones[0] || "",
            treasurer: isParallelBranch ? cells[5] || "" : cells[3] || "",
            treasurerPhone: phones[1] || "",
            squeletteName,
        };
        if (parentId !== undefined) office.parentId = parentId;
        offices.push(office);
    }

    return offices;
}

/**
 * Build a human-readable response for a list of offices.
 */
export function formatHubOfficesResponse(offices: HubOffice[]): string | null {
    if (offices.length === 0) return null;

    const lines: string[] = [];

    // Group by level
    const provOffices = offices.filter((o) => o.level === "إقليمي");
    const localOffices = offices.filter((o) => o.level === "محلي");
    const natOffices = offices.filter((o) => o.level === "وطني");

    for (const o of natOffices) {
        lines.push(`🏛 *${o.name}:*`);
        if (o.secretary) lines.push(`• الكاتب الوطني: الرفيق *${o.secretary}*${o.secretaryPhone ? ` (📞 ${o.secretaryPhone})` : ""}`);
        if (o.treasurer) lines.push(`• أمين المال: الرفيق *${o.treasurer}*${o.treasurerPhone ? ` (📞 ${o.treasurerPhone})` : ""}`);
        lines.push("");
    }

    for (const o of provOffices) {
        lines.push(`🏢 *${o.name} (إقليمي):*`);
        if (o.secretary) lines.push(`• الكاتب الإقليمي: الرفيق *${o.secretary}*${o.secretaryPhone ? ` (📞 ${o.secretaryPhone})` : ""}`);
        if (o.treasurer) lines.push(`• أمين المال: الرفيق *${o.treasurer}*${o.treasurerPhone ? ` (📞 ${o.treasurerPhone})` : ""}`);
        lines.push("");
    }

    for (const o of localOffices) {
        lines.push(`🏠 *${o.name} (محلي):*`);
        if (o.secretary) lines.push(`• الكاتب المحلي: الرفيق *${o.secretary}*${o.secretaryPhone ? ` (📞 ${o.secretaryPhone})` : ""}`);
        if (o.treasurer) lines.push(`• أمين المال: الرفيق *${o.treasurer}*${o.treasurerPhone ? ` (📞 ${o.treasurerPhone})` : ""}`);
        lines.push("");
    }

    // Footer removed (per user request 2026-08-31) - data source is implicit since we always fetch live from hub.

    return lines.join("\n").trim();
}
