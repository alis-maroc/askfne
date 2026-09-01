/**
 * Hub Office Navigation Menu System
 * 
 * Manages interactive menu navigation for browsing the FNE office hierarchy
 * from hub.taalim.org on WhatsApp and Telegram.
 * 
 * Menu structure:
 * 1. Root: Leadership / Regional / Search
 * 2. National + Parallel Orgs / Regions / Search Results
 * 3. Provinces / Parallel Branches
 * 4. Local Offices
 */

import { HubOffice } from "@/lib/hub-offices";

export interface HubMenuItem {
    id: string;           // e.g., "reg:2", "prov:5", "parallel:SNEP"
    label: string;        // Display text: "🌍 الشرق"
    icon?: string;         // Emoji icon if available
    parentId?: number;    // For parent_id navigation
    searchTerm?: string;   // For search navigation
    isParallel?: boolean;  // true for parallel orgs
    officeName?: string;   // For direct office lookup
    office?: HubOffice;    // Exact office record for direct contact display
}

export type MenuLevel =
    | "root"
    | "national"
    | "regions"
    | "provinces"
    | "parallel"
    | "parallelBranches"
    | "local";

export type HubOfficeMenuMode = "regional" | "provincial" | "local" | "parallel" | "national";

export interface HubMenuState {
    conversationId: string;
    channel: "whatsapp" | "telegram";
    level: MenuLevel;
    parentId?: number;
    parentLabel?: string;
    searchTerm?: string;
    mode?: HubOfficeMenuMode;
    backState?: HubMenuState; // For "رجوع" navigation
    timestamp: number;
}

const STATE_TTL_MS = 1000 * 60 * 15; // 15 minutes
const states = new Map<string, HubMenuState>();
const lastMenuItems = new Map<string, HubMenuItem[]>(); // Cache last rendered menu for numeric selection

/** Metadata key used in conversation metadata to track in-db hub menu state (serialized JSON). */
export const HUB_MENU_META_KEY = "hubMenuState";

/**
 * Get current menu state for a conversation
 */
export function getHubMenuState(conversationId: string): HubMenuState | null {
    const state = states.get(conversationId);
    if (!state) return null;
    if (Date.now() - state.timestamp > STATE_TTL_MS) {
        states.delete(conversationId);
        return null;
    }
    return state;
}

/**
 * Store the last rendered menu items for numeric selection
 */
export function setLastMenuItems(conversationId: string, items: HubMenuItem[]): void {
    lastMenuItems.set(conversationId, items);
}

/**
 * Get the last rendered menu items
 */
export function getLastMenuItems(conversationId: string): HubMenuItem[] {
    return lastMenuItems.get(conversationId) || [];
}

/**
 * Set menu state for a conversation
 */
export function setHubMenuState(
    conversationId: string,
    channel: "whatsapp" | "telegram",
    level: MenuLevel,
    parentId?: number,
    parentLabel?: string,
    searchTerm?: string,
    backState?: HubMenuState
): HubMenuState {
    const state: HubMenuState = {
        conversationId,
        channel,
        level,
        parentId,
        parentLabel,
        searchTerm,
        backState,
        timestamp: Date.now(),
    };
    states.set(conversationId, state);
    return state;
}

/**
 * Clear menu state for a conversation
 */
export function clearHubMenuState(conversationId: string): void {
    states.delete(conversationId);
}

/**
 * Rebuild in-memory hub state from conversation metadata (survives process restarts).
 */
export function restoreHubMenuState(
    conversationId: string,
    channel: "whatsapp" | "telegram",
    raw: unknown
): HubMenuState | null {
    const existing = getHubMenuState(conversationId);
    if (existing) return existing;
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.level !== "string") return null;
    const state = setHubMenuState(
        conversationId,
        channel,
        rec.level as MenuLevel,
        typeof rec.parentId === "number" ? rec.parentId : undefined,
        typeof rec.parentLabel === "string" ? rec.parentLabel : undefined,
        typeof rec.searchTerm === "string" ? rec.searchTerm : undefined
    );
    if (typeof rec.mode === "string") {
        state.mode = rec.mode as HubOfficeMenuMode;
    }
    return state;
}

/**
 * Build the root menu choices for office navigation.
 */
export function buildRootMenu(): HubMenuItem[] {
    return [
        {
            id: "regional",
            label: "🌍 المكاتب الجهوية",
        },
        {
            id: "provincial",
            label: "📍 المكاتب الإقليمية",
        },
        {
            id: "local",
            label: "🏠 المكاتب المحلية",
        },
        {
            id: "parallel",
            label: "🏢 التنظيمات الموازية",
        },
        {
            id: "national",
            label: "🏛️ المكتب الوطني FNE",
        },
        {
            id: "search",
            label: "🔍 البحث بالاسم",
        },
    ];
}

/**
 * Build national + parallel organizations menu
 */
export function buildNationalMenu(parallelOrgs: HubOffice[]): HubMenuItem[] {
    const items: HubMenuItem[] = [];

    const addedOrganizations = new Set<string>();
    for (const org of parallelOrgs) {
        const shortName = extractShortOrgName(org.name);
        if (addedOrganizations.has(shortName)) continue;
        addedOrganizations.add(shortName);
        items.push({
            id: `parallel:${shortName}`,
            label: `🏢 ${shortName}`,
            isParallel: true,
            searchTerm: shortName,
            parentId: org.parentId,
            office: org,
        });
    }

    return items;
}

/**
 * Build regions list from root offices
 * Root returns 13 entries: 1 national FNE + 12 regions
 */
export function buildRegionsMenu(rootOffices: HubOffice[]): HubMenuItem[] {
    const items: HubMenuItem[] = [];

    // Filter to keep only regional offices (جهوي level) which have parentId
    const regions = rootOffices.filter((o) => o.level === "جهوي" && o.parentId);

    for (let i = 0; i < regions.length; i++) {
        const office = regions[i];
        items.push({
            id: `region:${office.parentId}`,
            label: `🌍 ${office.name}`,
            officeName: office.name,
            parentId: office.parentId,
            office,
        });
    }

    return items;
}

/**
 * Build provinces list from regional children
 */
export function buildProvincesMenu(offices: HubOffice[], icon = "📍"): HubMenuItem[] {
    const items: HubMenuItem[] = [];

    for (let i = 0; i < offices.length; i++) {
        const office = offices[i];
        const cleanName = office.name.trim();
        items.push({
            id: `prov:${i}`,
            label: `${icon} ${cleanName}`,
            officeName: cleanName,
            parentId: office.parentId,
            office,
        });
    }

    return items;
}

/**
 * Build parallel organization branches list
 */
export function buildParallelBranchesMenu(branches: HubOffice[], nationalOffice?: HubOffice): HubMenuItem[] {
    const items: HubMenuItem[] = [];

    if (nationalOffice) {
        items.push({
            id: "parallel-national",
            label: "🏛️ المكتب الوطني",
            officeName: nationalOffice.name,
            office: nationalOffice,
        });
    }

    for (let i = 0; i < branches.length; i++) {
        const office = branches[i];
        const cleanName = office.name.trim();
        items.push({
            id: `branch:${i}`,
            label: `🏢 ${cleanName}`,
            officeName: cleanName,
            office,
        });
    }

    return items;
}

/**
 * Build provinces under a specific region
 * We need to fetch these based on parent_id
 */
export function buildProvincesForRegion(
    regionName: string,
    provinces: HubOffice[]
): HubMenuItem[] {
    const items: HubMenuItem[] = [];

    for (const office of provinces) {
        const cleanName = office.name.replace(/📍\s*/, "").trim();
        items.push({
            id: `prov:${cleanName}`,
            label: `📍 ${cleanName}`,
            officeName: cleanName,
        });
    }

    return items;
}

/**
 * Format contact info for a selected office (no ℹ️ footnote)
 */
export function formatOfficeContacts(office: HubOffice): string {
    const lines: string[] = [];

    // Office name header
    lines.push(`🏢 *${office.name}:*`);

    // Secretary
    if (office.secretary) {
        const phone = office.secretaryPhone ? ` (📞 ${office.secretaryPhone})` : "";
        const roleTitle = office.level === "وطني"
            ? "الكاتب الوطني"
            : office.level === "إقليمي"
                ? "الكاتب الإقليمي"
                : office.level === "جهوي"
                    ? "الكاتب الجهوي"
                    : office.level === "محلي"
                        ? "الكاتب المحلي"
                        : office.level === "موازي"
                            ? "كاتب الفرع"
                        : "الكاتب المسؤول";
        lines.push(`• ${roleTitle}: الرفيق *${office.secretary}*${phone}`);
    }

    // Treasurer
    if (office.treasurer) {
        const phone = office.treasurerPhone ? ` (📞 ${office.treasurerPhone})` : "";
        lines.push(`• أمين المال: الرفيق *${office.treasurer}*${phone}`);
    }

    return lines.join("\n");
}

/**
 * Format a menu as numbered list text (for WhatsApp and text-based menus)
 */
export function formatMenuText(
    title: string,
    items: HubMenuItem[],
    includeBack: boolean = true,
    backLabel: string = "رجوع للقائمة الرئيسية"
): string {
    const lines: string[] = [];
    lines.push(`*${title}*`);
    lines.push("");

    for (let i = 0; i < items.length; i++) {
        const letter = String.fromCharCode(65 + i);
        lines.push(`\u200F【${letter}】 ${items[i].label}`);
    }

    if (includeBack) {
        lines.push("");
        lines.push("5️⃣ رجوع للخلف");
        lines.push(`0️⃣ ${backLabel}`);
    }

    return lines.join("\n");
}

/**
 * Convert menu items to Telegram inline keyboard buttons
 */
export function formatMenuAsTelegramKeyboard(items: HubMenuItem[]): Array<Array<{text: string; callback_data: string}>> {
    const keyboard: Array<Array<{text: string; callback_data: string}>> = [];
    for (const item of items) {
        const buttonText = Array.from(item.label).slice(0, 48).join("");
        const button = { text: buttonText, callback_data: item.id };
        const previousRow = keyboard[keyboard.length - 1];
        if (previousRow && previousRow.length === 1 && buttonText.length <= 28 && previousRow[0].text.length <= 28) {
            previousRow.push(button);
        } else {
            keyboard.push([button]);
        }
    }
    return keyboard;
}

/**
 * Extract short organization name from full name
 * e.g., "النقابة الوطنية لأستاذات وأساتذة التعليم الإبتدائي بالمغرب SNEP" → "SNEP"
 */
function extractShortOrgName(fullName: string): string {
    if (fullName.includes("اتحاد شباب التعليم")) return "JEM";

    // Try to find the official French acronyms.
    const match = fullName.match(/\b(SNEP|SNAP|SNASE|SNAM|UFEM|JEM|UJES)\b/i);
    if (match) return match[1].toUpperCase();

    // Fallback: use first meaningful word
    const words = fullName.split(/\s+/).filter(w => w.length > 2 && !w.includes("النقابة") && !w.includes("المغرب"));
    return words[0] || fullName.substring(0, 20);
}

/**
 * Clean office name by removing emoji prefixes
 */
export function cleanOfficeName(name: string): string {
    return name
        .replace(/🏛️\s*/g, "")
        .replace(/🏢\s*/g, "")
        .replace(/🌍\s*/g, "")
        .replace(/📍\s*/g, "")
        .replace(/🌍\s*/g, "")
        .trim();
}

/**
 * Determine if an office is the national FNE office
 */
export function isNationalOffice(name: string): boolean {
    return name.includes("المكتب الوطني") || name.includes("FNE");
}

/**
 * Determine if an office is a regional office
 */
export function isRegionalOffice(name: string): boolean {
    // Regional offices are on the root page with 🌍 prefix
    // They don't have "المكتب الوطني" and have region names
    const regionNames = [
        "طنجة", "تطوان", "الحسيمة", "الشرق", "فاس", "مكناس",
        "الرباط", "سلا", "القنيطرة", "بني ملال", "خنيفرة",
        "الدار البيضاء", "سطات", "مراكش", "أسفي", "آسفي",
        "درعة", "تافيلالت", "سوس", "ماسة", "كلميم", "اد نون", "واد نون",
        "العيون", "الساقية", "الحمراء", "الداخلة", "الذهب", "وادي"
    ];

    // Check if name starts with a region-related emoji or text
    return name.includes("🌍") && !name.includes("المكتب الوطني");
}

/**
 * Get region parent_id mapping (from hub exploration)
 * These are the parent_ids that return provincial offices
 */
export function getRegionParentId(regionName: string): number | null {
    const mapping: Record<string, number> = {
        "طنجة تطوان الحسيمة": 2,
        "الشرق": 3,
        "فاس مكناس": 4,
        "الرباط سلا القنيطرة": 5,
        "بني ملال خنيفرة": 6,
        "الدار البيضاء سطات": 7,
        "مراكش أسفي": 8,
        "درعة تافيلالت": 9,
        "سوس ماسة": 10,
        "كلميم واد نون": 11,
        "العيون الساقية الحمراء": 12,
        "الداخلة وادي الذهب": 13,
    };

    return mapping[regionName] || null;
}

/**
 * Parse user selection and return corresponding menu item
 */
/**
 * Parse user input and extract the selected item number (1-based).
 * Returns the matching menu item or null if no match.
 */
export function parseSelection(userInput: string, items: HubMenuItem[]): HubMenuItem | null {
    const trimmed = userInput.trim();

    const itemById = items.find((item) => item.id === trimmed);
    if (itemById) return itemById;

    // Try numeric selection (1, 2, 3, etc.)
    const numMatch = trimmed.match(/^\d+/);
    if (numMatch) {
        const idx = parseInt(numMatch[0], 10) - 1; // Convert to 0-based
        if (idx >= 0 && idx < items.length) {
            return items[idx];
        }
    }

    // WhatsApp menus use letters to avoid ambiguous two-digit emoji rendering.
    const letterMatch = trimmed.match(/^([A-Za-z])\.?$/);
    if (letterMatch) {
        const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < items.length) return items[idx];
    }

    // Try matching label text (fallback)
    for (const item of items) {
        if (item.label.toLowerCase().includes(trimmed.toLowerCase())) {
            return item;
        }
    }

    return null;
}

/**
 * Navigate one step back in the hub menu hierarchy.
 * Returns true if a back step was taken, false if we are already at the root.
 */
export function goBackHubMenu(
    conversationId: string,
    currentState: { level?: string; parentId?: number; parentLabel?: string; searchTerm?: string }
): boolean {
    const state = getHubMenuState(conversationId);
    if (!state) return false;

    if (state.level === "root") return false;

    if (state.backState) {
        const next = setHubMenuState(
            conversationId,
            state.channel,
            state.backState.level,
            state.backState.parentId,
            state.backState.parentLabel,
            state.backState.searchTerm,
            state.backState.backState
        );
        next.mode = state.backState.mode;
        return true;
    }

    // Fallback: manually go up one level
    let newLevel: MenuLevel = "root";
    if (state.level === "national" || state.level === "regions" || state.level === "parallel") {
        newLevel = "root";
    } else if (state.level === "provinces") {
        newLevel = "regions";
    } else if (state.level === "parallelBranches") {
        newLevel = "national";
    } else if (state.level === "local") {
        newLevel = "provinces";
    }

    setHubMenuState(conversationId, state.channel, newLevel);
    return true;
}
