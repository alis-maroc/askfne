# Plan: Navigation Menu for Hub Office Hierarchy

## Context

The user wants to replace the current "1️⃣ المكاتب والتنظيم" menu choice (which shows knowledge articles) with an **interactive navigation menu** for browsing the official FNE office hierarchy directly from the hub.

**Current behavior:**
- User presses "1" → shows KB articles under "المكاتب والتنظيم" category
- For office queries → chatbot responds with direct answer from hub

**Desired behavior:**
- User presses "1" → shows **interactive navigation menu** with 3 branches:
  - **القيادة الوطنية** (FNE national + parallel organizations: SNEP, SNASE, SNAM, SNAP, UFEM, UJES)
  - **المكاتب الجهوية** (12 régions)
  - **البحث بالاسم** (recherche directe)
- Each branch leads to a 2-3 level hierarchy
- User navigates by pressing numbers
- Selected office → show contacts (no ℹ️ footnote)

**Scope:** WhatsApp + Telegram only. Web chat keeps existing behavior.

---

## Hub Structure (Discovered)

### National Level (root URL, no params)
Returns 13 entries: 1 FNE national office + 12 regions

### Parallel Organizations (`?parallel=1`)
Returns 6 organizations:
1. SNEP (النقابة الوطنية للتعليم الإبتدائي)
2. SNASE (النقابة الوطنية للمتصرفين)
3. SNAM (النقابة الوطنية للمبرزين)
4. SNAP (النقابة الوطنية للمساعدين)
5. UFEM (اتحاد نساء التعليم)
6. UJES (اتحاد شباب التعليم)

### Hierarchical (`?parent_id=N`)
- `parent_id=1` returns 13 root offices (12 regions)
- `parent_id={region_id}` returns provincial offices
- `parent_id={province_id}` returns local offices

### Direct Search (`?search=NAME`)
Returns matching office with secretary + treasurer + phone

### Parallel Branches (`?parallel=1&search=SNEP`)
Returns branches of a parallel organization

---

## User Flow

```
1️⃣ المكاتب والتنظيم
   │
   ├── 1️⃣ القيادة الوطنية
   │   ├── 1️⃣ المكتب الوطني FNE → contacts
   │   ├── 2️⃣ SNEP → branches list → select → contacts
   │   ├── 3️⃣ SNASE → contacts
   │   ├── 4️⃣ SNAM → contacts
   │   ├── 5️⃣ SNAP → branches list → select → contacts
   │   ├── 6️⃣ UFEM → contacts
   │   └── 7️⃣ UJES → branches list → select → contacts
   │
   ├── 2️⃣ المكاتب الجهوية (12 regions)
   │   ├── 1️⃣ طنجة تطوان الحسيمة → provinces (10) → select province → contacts
   │   ├── 2️⃣ الشرق → provinces (8) → select → contacts
   │   ├── 3️⃣ فاس مكناس → provinces (9) → select → contacts
   │   └── ... (12 regions total)
   │
   └── 3️⃣ البحث بالاسم (مثال: تيزنيت)
       └── → contacts

0️⃣ رجوع للقائمة الرئيسية (at each sub-level)
```

---

## Implementation Steps

### 1. Extend `src/lib/hub-offices.ts`

Add new functions:

```typescript
export interface HubMenuItem {
  id: string;            // e.g., "reg:1", "prov:3", "parallel:SNEP"
  label: string;         // Display text: "🌍 الشرق"
  hubParentId?: number;  // For parent_id navigation
  searchTerm?: string;   // For search navigation
  isParallel?: boolean;  // true for parallel orgs
  parallelSearch?: string; // For parallel branch lookup
}

// Fetch all root offices (national + 12 regions, parallel=0)
export async function fetchRootOffices(): Promise<HubOffice[]>

// Fetch children of any parent_id
export async function fetchOfficesByParentId(parentId: number): Promise<HubOffice[]>

// Fetch all 6 parallel organizations
export async function fetchParallelOrganizations(): Promise<HubOffice[]>

// Fetch branches of a specific parallel org
export async function fetchParallelBranches(orgName: string): Promise<HubOffice[]>
```

Each function:
- Fetches from hub with appropriate URL params (`parent_id=N`, `parallel=1`, `parallel=1&search=NAME`)
- Caches result for 1 hour (reuse existing cache)
- Returns `HubOffice[]`

### 2. Create `src/lib/channels/hub-menu.ts`

New module for building navigation menus and managing state:

```typescript
// State per conversation: stored in DB or in-memory
export interface HubMenuState {
  conversationId: string;
  level: "root" | "region" | "province" | "parallel" | "branch" | "office";
  parentId?: number;
  searchTerm?: string;
  breadcrumb: string[];  // For "رجوع" navigation
}

// State management (in-memory Map with TTL)
const states = new Map<string, HubMenuState>();

// Build root menu (3 choices: national, regions, search)
export function buildRootMenu(): HubMenuItem[]

// Build national office + parallel orgs menu
export function buildNationalMenu(
  parallelOrgs: HubOffice[]
): HubMenuItem[]

// Build regions list
export function buildRegionsMenu(rootOffices: HubOffice[]): HubMenuItem[]

// Build provinces under a region
export function buildProvincesMenu(provinces: HubOffice[]): HubMenuItem[]

// Build parallel branches
export function buildParallelBranchesMenu(branches: HubOffice[]): HubMenuItem[]

// Format contact info for a selected office (no ℹ️ footnote)
export function formatOfficeContacts(office: HubOffice): string
```

### 3. Update `src/lib/channels/whatsapp.ts`

Modify `handleIncomingMessage()` to route "1" to the new menu:

```typescript
// Detect "1" or hub menu selection
if (normalizeDigitCommand(body) === "1" && !currentHubMenuState(jid)) {
  // First time: show root menu (3 choices)
  const menu = buildRootMenu();
  await sendHubMenu(jid, menu, "root", "المكاتب والتنظيم");
  return;
}
```

Handle selections based on current state:
- Root + "1" → show national + parallel
- Root + "2" → show 12 regions
- Root + "3" → ask for search term
- National + number → show office contacts or parallel branches
- Region + number → show provinces
- Province + number → show office contacts

### 4. Update `src/lib/channels/telegram.ts`

Same pattern as WhatsApp but using Telegram inline keyboards.

### 5. Update `src/lib/channels/dynamic-menu.ts`

Remove the "المكاتب والتنظيم" article category OR change the label to "ابحث عن مكتب محدد" (replaced by the new menu). Or simply add the new behavior to the existing "1" handler.

### 6. Remove ℹ️ footnote from contact display

Update `formatHubOfficesResponse()` in `hub-offices.ts` to NOT include:
```
ℹ️ هذه البيانات مستخرجة مباشرة من المصدر الرسمي: https://hub.taalim.org/responsables-fne.php
```

This is only for the direct-query flow. The menu flow will use a new `formatOfficeContacts()` without the footnote.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/hub-offices.ts` | Modify | Add hierarchy fetch functions |
| `src/lib/channels/hub-menu.ts` | Create | Menu state + builders |
| `src/lib/channels/whatsapp.ts` | Modify | Route "1" to hub menu |
| `src/lib/channels/telegram.ts` | Modify | Route "1" to hub menu |
| `src/lib/channels/dynamic-menu.ts` | Modify | Update label or behavior |
| `src/lib/ai/engine.ts` | Modify | Remove ℹ️ footnote (optional) |

---

## Testing Plan

1. Send "1" on WhatsApp → root menu (3 choices)
2. Select "1" (القيادة الوطنية) → national + parallel orgs list
3. Select SNEP → branches or contacts
4. Select region → provinces list
5. Select province → contacts (no footnote)
6. Press "0" → back navigation
7. Type office name directly → search results
8. Test on Telegram → same flow
9. Web chat "1" → unchanged
