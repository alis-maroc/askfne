#!/usr/bin/env python3
"""Add hierarchy fetch functions to hub-offices.ts"""
import re

path = "src/lib/hub-offices.ts"
with open(path) as f:
    content = f.read()

new_functions = r"""

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
export async function fetchParallelBranches(orgName: string): Promise<HubOffice[]> {
    if (!orgName) return [];
    const cacheKey = `parallel:${orgName}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${HUB_URL}?parallel=1&search=${encodeURIComponent(orgName)}`, {
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
        console.warn(`[hub-offices] fetchParallelBranches(${orgName}) failed:`, String(err));
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
        const name = nameRaw
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

        offices.push({
            name,
            level: "موازي",
            secretary: cells[1] || "",
            secretaryPhone: "",
            treasurer: "",
            treasurerPhone: "",
            squeletteName: normalizeCitySkeleton(name),
        });
    }
    return offices;
}

"""

# Find the position of the fetchHubOfficesSingle comment
pattern = r'\n/\*\*\s*\n\s*\* Single hub fetch'
match = re.search(pattern, content)
if match:
    insert_pos = match.start()
    new_content = content[:insert_pos] + new_functions + content[insert_pos:]
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Inserted {len(new_functions)} chars at position {insert_pos}")
else:
    print("ERROR: Could not find insertion point for new functions!")
    print("Looking for pattern: /**\\n * Single hub fetch")
    exit(1)
