#!/usr/bin/env python3
"""Insert hub menu handler functions into WhatsApp channel file"""
import re

path = "src/lib/channels/whatsapp.ts"
with open(path) as f:
    content = f.read()

new_functions = r"""

/**
 * Handle Hub Office hierarchy menu (choice 1).
 * Returns true if the user input was handled by the hub menu system.
 * Routes the user through the 4-level hierarchy:
 *   1. Root: Leadership / Regional / Search
 *   2. National+Parallel / Regions
 *   3. Provinces / Parallel branches
 *   4. Local offices
 */
async function handleHubMenuCommand(
    jid: string,
    conversationId: string,
    messageContent: string,
    metadata: Record<string, unknown>,
    isInHubMenu: boolean
): Promise<boolean> {
    // We only intercept hub-menu inputs when the user is already in the hub menu
    // or when they explicitly selected "1" from the main menu (handled separately).
    if (!isInHubMenu) return false;

    const convId = conversationId;
    const currentState = getHubMenuState(convId);

    // If "رجوع" or "0" -> go back to root menu
    const trimmed = messageContent.trim();
    const isBack = trimmed === "0" || trimmed === "رجوع" || /^back$/i.test(trimmed);
    if (isBack && currentState?.backState) {
        setHubMenuState(convId, "whatsapp", currentState.backState.level, currentState.backState.parentId, currentState.backState.parentLabel, currentState.backState.searchTerm, currentState.backState.backState);
        await renderHubMenuText(jid, conversationId, messageContent, metadata);
        return true;
    }

    // If no state (rare) or root, just re-render root
    if (!currentState || currentState.level === "root") {
        await renderHubMenuText(jid, conversationId, messageContent, metadata);
        return true;
    }

    // Otherwise, parse selection against the current state's children
    // We need to fetch the appropriate list of items to select from
    const items = await getHubMenuItemsForState(currentState);
    if (items.length === 0) {
        await sendText(jid, "❌ تعذّر تحميل القائمة. حاول مرة أخرى.");
        clearHubMenuState(convId);
        return true;
    }

    const selected = parseSelection(trimmed, items);

    if (selected === null && isBack) {
        clearHubMenuState(convId);
        await renderHubMenuText(jid, conversationId, messageContent, metadata);
        return true;
    }

    if (!selected) {
        await sendText(jid, "⚠️ اختيار غير صحيح. حاول مرة أخرى.\n" + formatMenuText("اختر:", items));
        return true;
    }

    // Handle the selection
    await processHubMenuSelection(jid, conversationId, messageContent, currentState, selected);
    return true;
}

/**
 * Fetch the items list for a given hub menu state.
 */
async function getHubMenuItemsForState(state: HubMenuState): Promise<HubMenuItem[]> {
    if (state.level === "root") return buildRootMenu();
    if (state.level === "national") {
        const parallelOrgs = await fetchParallelOrganizations();
        return buildNationalMenu(parallelOrgs);
    }
    if (state.level === "regions") {
        const rootOffices = await fetchRootOffices();
        return buildRegionsMenu(rootOffices);
    }
    if (state.level === "provinces" && state.parentId !== undefined) {
        const offices = await fetchOfficesByParentId(state.parentId);
        return buildProvincesMenu(offices);
    }
    if (state.level === "parallelBranches" && state.searchTerm) {
        const branches = await fetchParallelBranches(state.searchTerm);
        return buildParallelBranchesMenu(branches);
    }
    if (state.level === "local" && state.searchTerm) {
        const offices = await fetchHubOfficesForLocal(state.searchTerm);
        return buildProvincesMenu(offices);
    }
    return [];
}

async function fetchHubOfficesForLocal(name: string) {
    const mod = await import("@/lib/hub-offices");
    return mod.fetchHubOffices(name);
}

/**
 * Process a hub menu selection and advance the state.
 */
async function processHubMenuSelection(
    jid: string,
    conversationId: string,
    userInput: string,
    currentState: HubMenuState,
    selected: HubMenuItem
): Promise<void> {
    const convId = conversationId;

    // If the selection has secretary info (already a contact), just display it
    if (selected.officeName && (selected.id.startsWith("prov:") || selected.id.startsWith("branch:"))) {
        // Fetch the actual office details
        const offices = await fetchHubOffices(selected.officeName);
        const office = offices.find((o) => cleanOfficeName(o.name) === selected.officeName || o.name === selected.officeName);
        if (office) {
            const text = formatOfficeContacts(office);
            clearHubMenuState(convId);
            await recordExchange(conversationId, userInput, text);
            await sendText(jid, text + "\n\n0️⃣ رجوع للقائمة الرئيسية");
            return;
        }
    }

    // Otherwise advance the menu level
    if (selected.id === "national") {
        setHubMenuState(convId, "whatsapp", "national", undefined, "القيادة الوطنية", undefined, currentState);
    } else if (selected.id === "regions") {
        setHubMenuState(convId, "whatsapp", "regions", undefined, "المكاتب الجهوية", undefined, currentState);
    } else if (selected.id === "search") {
        // Direct text search: clear menu state and let normal handler take over
        clearHubMenuState(convId);
        await sendText(jid, "✏️ أرسل اسم المكتب أو الإقليم للبحث عنه.");
        return;
    } else if (selected.id === "fne_national") {
        // FNE national contact
        const offices = await fetchHubOffices("FNE");
        const office = offices.find((o) => o.level === "وطني") || offices[0];
        const text = office ? formatOfficeContacts(office) : "🏛 المكتب الوطني لـ FNE\n\n(سيتم إضافة البيانات لاحقاً)";
        clearHubMenuState(convId);
        await recordExchange(conversationId, userInput, text);
        await sendText(jid, text + "\n\n0️⃣ رجوع للقائمة الرئيسية");
        return;
    } else if (selected.id.startsWith("parallel:")) {
        const orgName = selected.id.split(":")[1];
        setHubMenuState(convId, "whatsapp", "parallelBranches", undefined, selected.label, orgName, currentState);
    } else if (selected.id.startsWith("region:")) {
        // Find parentId for this region from root offices
        const rootOffices = await fetchRootOffices();
        const region = rootOffices.find((o) => cleanOfficeName(o.name) === selected.officeName || o.name === selected.officeName);
        const parentId = (region as { parentId?: number })?.parentId;
        if (parentId) {
            setHubMenuState(convId, "whatsapp", "provinces", parentId, selected.label, undefined, currentState);
        } else {
            // Fallback: just show contact if available
            await sendText(jid, "⚠️ تعذّر إيجاد المكاتب الإقليمية لهذه الجهة.");
            return;
        }
    } else if (selected.id.startsWith("branch:")) {
        // Show branch contact
        const branches = await fetchParallelBranches(currentState.searchTerm || "");
        const branch = branches.find((b) => cleanOfficeName(b.name) === selected.officeName || b.name === selected.officeName);
        if (branch) {
            const text = formatOfficeContacts(branch);
            await recordExchange(conversationId, userInput, text);
            await sendText(jid, text + "\n\n0️⃣ رجوع");
            return;
        }
    }

    await renderHubMenuText(jid, conversationId, userInput, {
        ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown>,
    });
}

/**
 * Render the current hub menu text to the user.
 */
async function renderHubMenuText(
    jid: string,
    conversationId: string,
    userInput: string,
    metadata: Record<string, unknown>
): Promise<void> {
    const convId = conversationId;
    const state = getHubMenuState(convId);
    if (!state) {
        // Default: root menu
        const items = buildRootMenu();
        const text = "🏛️ *مكاتب الجامعة الوطنية للتعليم FNE*\n\n" + formatMenuText("اختر:", items, false);
        clearHubMenuState(convId);
        setHubMenuState(convId, "whatsapp", "root");
        await recordExchange(conversationId, userInput, text);
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { metadata: { ...metadata, awaitingMenuChoice: false, activeCategory: null, [HUB_MENU_META_KEY]: { level: "root" } } },
        });
        await sendText(jid, text);
        return;
    }

    const items = await getHubMenuItemsForState(state);
    let title = "اختر:";
    if (state.level === "root") title = "🏛️ *مكاتب الجامعة الوطنية للتعليم FNE*";
    else if (state.level === "national") title = "🏛️ *القيادة الوطنية والتنظيمات الموازية*";
    else if (state.level === "regions") title = "🌍 *المكاتب الجهوية (12 جهة)*";
    else if (state.level === "provinces") title = `📍 *${state.parentLabel || "المكاتب الإقليمية"}*`;
    else if (state.level === "parallelBranches") title = `🏢 *${state.parentLabel || "فروع التنظيم"}*`;

    const text = formatMenuText(title, items, true);

    // Persist state in conversation metadata so it survives restarts
    const metaUpdate = { ...metadata, awaitingMenuChoice: false, activeCategory: null, [HUB_MENU_META_KEY]: { level: state.level, parentId: state.parentId, parentLabel: state.parentLabel, searchTerm: state.searchTerm } };
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { metadata: metaUpdate },
    });

    await recordExchange(conversationId, userInput, text);
    await sendText(jid, text);
}

"""

# Insert before "function recordExchange"
pattern = r'\n/\*\*\s*\n\s*\* Record a full user-bot message exchange'
match = re.search(pattern, content)
if match:
    insert_pos = match.start()
    new_content = content[:insert_pos] + new_functions + content[insert_pos:]
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Inserted hub menu handlers ({len(new_functions)} chars)")
else:
    print("ERROR: Could not find recordExchange comment!")
    exit(1)