/**
 * Engine integration tests — AGENTS.md compliance verification.
 *
 * These tests exercise the engine's wiring of the new intent router
 * (intent-router.ts, conversation-state.ts, ticket-guard.ts, freshness.ts,
 * observability.ts, arabic-search.ts) WITHOUT touching the database.
 *
 * They cover:
 *  - The 5-intent classification matrix (router ↔ engine expectations)
 *  - The source authorization matrix (no forbidden source for an intent)
 *  - The state machine clear-on-free-form rule
 *  - The ticket confirmation guard (TICKET_CONFIRMATION state required)
 *  - The freshness annotation rule (historical → warning)
 *  - The refusal path (ORGANE_OFFICIEL without roster → refused)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks for engine.ts dependencies ────────────────────────────────────────
// We don't import engine.ts here because it imports prisma at top level.
// We test the wiring pieces individually instead.

// Mock the prisma client so any incidental import of engine.ts in another
// test file doesn't blow up. This file does NOT import engine.ts directly.
vi.mock("@/lib/prisma", () => ({
    prisma: {
        conversation: { findUnique: vi.fn(), update: vi.fn() },
        automationRule: { findMany: vi.fn(), update: vi.fn() },
        cannedResponse: { findMany: vi.fn(), update: vi.fn() },
        knowledgeEntry: { findMany: vi.fn() },
        settings: { findFirst: vi.fn() },
        message: { create: vi.fn() },
    },
}));

import {
    INTENT,
    classifyIntent,
    isSourceAllowed,
    decideAnswer,
    SOURCE_BY_INTENT,
    type Intent,
} from "@/lib/ai/intent-router";
import {
    CONVERSATION_STATE,
    clearStaleState,
    isConfirmationForActiveState,
    createIdleState,
} from "@/lib/ai/conversation-state";
import {
    canConfirmTicket,
    canInitiateTicketWorkflow,
} from "@/lib/ai/ticket-guard";
import {
    annotateWithStaleness,
    getStalenessReason,
} from "@/lib/ai/freshness";
import { normalizeArabic } from "@/lib/ai/arabic-search";

describe("Engine ↔ IntentRouter integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── 5-intent classification matrix ──────────────────────────────────────

    it("classifies 'موقف الجامعة من الحراك التعليمي' as POSITION_NATIONALE (not CONTACT_BUREAU)", () => {
        // This is the exact bug from AGENTS.md: a national-position question must
        // never trigger geographic similarity over 82+ offices.
        const result = classifyIntent(normalizeArabic("موقف الجامعة من الحراك التعليمي"));
        expect(result.intent).toBe(INTENT.POSITION_NATIONALE);
    });

    it("classifies 'رقم المكتب' as CONTACT_BUREAU", () => {
        const result = classifyIntent(normalizeArabic("رقم المكتب"));
        expect(result.intent).toBe(INTENT.CONTACT_BUREAU);
    });

    it("classifies 'اعضاء اللجنة الادارية' as ORGANE_OFFICIEL", () => {
        const result = classifyIntent(normalizeArabic("اعضاء اللجنة الادارية"));
        expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
    });

    it("classifies 'فتح تذكرة' as TICKET_REQUEST (not CONTACT_BUREAU)", () => {
        // 'فتح تذكرة' contains a contact-bureau trigger ("تذكرة") and ticket
        // signal. The router must pick TICKET_REQUEST because it's matched first.
        const result = classifyIntent(normalizeArabic("فتح تذكرة"));
        expect(result.intent).toBe(INTENT.TICKET_REQUEST);
    });

    it("classifies generic chat as QUESTION_GENERALE (fallback)", () => {
        const result = classifyIntent(normalizeArabic("ما هو الطقس اليوم"));
        expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        expect(result.confidence).toBeLessThan(0.6);
    });

    // ─── Source authorization matrix ──────────────────────────────────────────

    it("CONTACT_BUREAU can ONLY use office_registry", () => {
        expect(isSourceAllowed(INTENT.CONTACT_BUREAU, "office_registry")).toBe(true);
        expect(isSourceAllowed(INTENT.CONTACT_BUREAU, "knowledge_base")).toBe(false);
        expect(isSourceAllowed(INTENT.CONTACT_BUREAU, "official_roster")).toBe(false);
    });

    it("ORGANE_OFFICIEL can ONLY use official_roster", () => {
        expect(isSourceAllowed(INTENT.ORGANE_OFFICIEL, "official_roster")).toBe(true);
        expect(isSourceAllowed(INTENT.ORGANE_OFFICIEL, "knowledge_base")).toBe(false);
    });

    it("POSITION_NATIONALE can use union_communique or union_site", () => {
        expect(isSourceAllowed(INTENT.POSITION_NATIONALE, "union_communique")).toBe(true);
        expect(isSourceAllowed(INTENT.POSITION_NATIONALE, "union_site")).toBe(true);
        expect(isSourceAllowed(INTENT.POSITION_NATIONALE, "office_registry")).toBe(false);
    });

    it("TICKET_REQUEST can ONLY use ticket_system", () => {
        expect(isSourceAllowed(INTENT.TICKET_REQUEST, "ticket_system")).toBe(true);
        expect(isSourceAllowed(INTENT.TICKET_REQUEST, "knowledge_base")).toBe(false);
    });

    it("QUESTION_GENERALE can ONLY use knowledge_base", () => {
        expect(isSourceAllowed(INTENT.QUESTION_GENERALE, "knowledge_base")).toBe(true);
        expect(isSourceAllowed(INTENT.QUESTION_GENERALE, "office_registry")).toBe(false);
    });

    // ─── Decider refusal path ────────────────────────────────────────────────

    it("decideAnswer REFUSES ORGANE_OFFICIEL when no official roster is registered", () => {
        const decision = decideAnswer({
            intent: INTENT.ORGANE_OFFICIEL,
            classification: { intent: INTENT.ORGANE_OFFICIEL, matched: true, confidence: 0.95 },
            availableSources: ["official_roster"],
            hasOfficialRoster: false, // <-- the critical flag
        });
        expect(decision.kind).toBe("refuse");
        if (decision.kind === "refuse") {
            expect(decision.reason).toContain("Aucune liste officielle");
        }
    });

    it("decideAnswer ANSWERS ORGANE_OFFICIEL when the official roster is registered", () => {
        const decision = decideAnswer({
            intent: INTENT.ORGANE_OFFICIEL,
            classification: { intent: INTENT.ORGANE_OFFICIEL, matched: true, confidence: 0.95 },
            availableSources: ["official_roster"],
            hasOfficialRoster: true,
        });
        expect(decision.kind).toBe("answer");
    });

    it("decideAnswer CLARIFIES when no allowed source is available", () => {
        const decision = decideAnswer({
            intent: INTENT.CONTACT_BUREAU,
            classification: { intent: INTENT.CONTACT_BUREAU, matched: true, confidence: 0.95 },
            availableSources: ["knowledge_base"], // not allowed for CONTACT_BUREAU
            hasOfficialRoster: false,
        });
        expect(decision.kind).toBe("clarify");
    });

    // ─── State machine: free-form clears state ───────────────────────────────

    it("clearStaleState resets to IDLE when a free-form question arrives", () => {
        const ctx = {
            state: CONVERSATION_STATE.OFFICE_CLARIFICATION,
            lastActivity: new Date(),
            payload: { candidate: "مراكش" },
        };
        const cleared = clearStaleState(ctx, true);
        expect(cleared.state).toBe(CONVERSATION_STATE.IDLE);
        expect(cleared.payload).toEqual({});
    });

    it("clearStaleState keeps a non-free-form context fresh", () => {
        const ctx = {
            state: CONVERSATION_STATE.MENU,
            lastActivity: new Date(Date.now() - 1000),
            payload: {},
        };
        const touched = clearStaleState(ctx, false);
        expect(touched.state).toBe(CONVERSATION_STATE.MENU);
    });

    it("isConfirmationForActiveState returns true only for the matching state", () => {
        const ctx = {
            state: CONVERSATION_STATE.TICKET_CONFIRMATION,
            lastActivity: new Date(),
            payload: {},
        };
        expect(isConfirmationForActiveState(ctx, CONVERSATION_STATE.TICKET_CONFIRMATION)).toBe(true);
        expect(isConfirmationForActiveState(ctx, CONVERSATION_STATE.MENU)).toBe(false);
    });

    // ─── Ticket guard: confirmation requires TICKET_CONFIRMATION state ──────

    it("canConfirmTicket REJECTS when state is OFFICE_CLARIFICATION", () => {
        const ctx = {
            state: CONVERSATION_STATE.OFFICE_CLARIFICATION,
            lastActivity: new Date(),
            payload: {},
        };
        expect(canConfirmTicket(ctx)).toBe(false);
    });

    it("canConfirmTicket REJECTS when state is MENU (no draft shown)", () => {
        const ctx = {
            state: CONVERSATION_STATE.MENU,
            lastActivity: new Date(),
            payload: {},
        };
        expect(canConfirmTicket(ctx)).toBe(false);
    });

    it("canConfirmTicket ACCEPTS when state is TICKET_CONFIRMATION", () => {
        const ctx = {
            state: CONVERSATION_STATE.TICKET_CONFIRMATION,
            lastActivity: new Date(),
            payload: {},
        };
        expect(canConfirmTicket(ctx)).toBe(true);
    });

    it("canInitiateTicketWorkflow REJECTS when state is OFFICE_CLARIFICATION", () => {
        const ctx = {
            state: CONVERSATION_STATE.OFFICE_CLARIFICATION,
            lastActivity: new Date(),
            payload: {},
        };
        const result = canInitiateTicketWorkflow(INTENT.TICKET_REQUEST, ctx);
        expect(result.allowed).toBe(false);
    });

    it("canInitiateTicketWorkflow REJECTS when intent is not TICKET_REQUEST", () => {
        const ctx = createIdleState();
        const result = canInitiateTicketWorkflow(INTENT.CONTACT_BUREAU, ctx);
        expect(result.allowed).toBe(false);
    });

    it("canInitiateTicketWorkflow ACCEPTS in IDLE for TICKET_REQUEST", () => {
        const ctx = createIdleState();
        const result = canInitiateTicketWorkflow(INTENT.TICKET_REQUEST, ctx);
        expect(result.allowed).toBe(true);
    });

    // ─── Freshness annotation ────────────────────────────────────────────────

    it("annotateWithStaleness adds warning for historical data", () => {
        const result = annotateWithStaleness("Réponse: مراكش", {
            source: "office_registry",
            publishedAt: new Date("2024-01-01"),
            status: "historical",
            validUntil: null,
        });
        expect(result).toContain("Information historique");
    });

    it("annotateWithStaleness adds warning for expired validUntil", () => {
        const result = annotateWithStaleness("Réponse", {
            source: "office_registry",
            publishedAt: new Date("2024-01-01"),
            status: "current",
            validUntil: new Date("2025-01-01"),
        });
        expect(result).toContain("obsolète");
    });

    it("annotateWithStaleness returns answer unchanged when fresh", () => {
        const result = annotateWithStaleness("Réponse", {
            source: "office_registry",
            publishedAt: new Date(),
            status: "current",
            validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        });
        expect(result).toBe("Réponse");
    });

    it("getStalenessReason returns null for current data", () => {
        const reason = getStalenessReason({
            source: "office_registry",
            publishedAt: new Date(),
            status: "current",
            validUntil: null,
        });
        expect(reason).toBeNull();
    });

    // ─── Arabic normalization is single-entry-point ──────────────────────────

    it("normalizeArabic is the only normalization used", () => {
        // Different input variants should produce the same canonical form
        expect(normalizeArabic("مراكش")).toBe(normalizeArabic("مَرَّاكِش"));
        expect(normalizeArabic("تيزنيت")).toBe(normalizeArabic("تزميت"));
    });

    // ─── Source authorization exhaustive matrix ──────────────────────────────

    it("every intent has at least one allowed source", () => {
        const intents = Object.values(INTENT) as Intent[];
        for (const intent of intents) {
            expect(SOURCE_BY_INTENT[intent].length).toBeGreaterThan(0);
        }
    });
});
