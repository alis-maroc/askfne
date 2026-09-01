موقف الجامعة من الحراك التعليمي/**
 * Unit tests for the AGENTS.md compliance modules:
 *   - src/lib/ai/freshness.ts
 *   - src/lib/ai/observability.ts
 *   - src/lib/ai/arabic-search.ts
 *   - src/lib/ai/conversation-state.ts
 *   - src/lib/ai/ticket-guard.ts
 *
 * Test matrix from the AGENTS.md plan (cross-channel parity).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the logger so observability tests do not write to stdout
vi.mock("../../src/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import {
    annotateWithStaleness,
    getStalenessReason,
    getDataAge,
    UNKNOWN_FRESHNESS,
    type FreshnessMetadata,
} from "../../src/lib/ai/freshness";

import {
    logAnswer,
    trackClarification,
    trackRefusal,
    trackToolCall,
} from "../../src/lib/ai/observability";

import { logger } from "../../src/lib/logger";

import {
    normalizeArabic,
    applyCityAlias,
    searchBureau,
    trigramSimilarity,
    validateHierarchy,
} from "../../src/lib/ai/arabic-search";

import {
    CONVERSATION_STATE,
    createIdleState,
    touchState,
    clearStaleState,
    canCreateTicketFromState,
    isStateExpired,
} from "../../src/lib/ai/conversation-state";

import {
    INTENT,
} from "../../src/lib/ai/intent-router";

import {
    canInitiateTicketWorkflow,
    canConfirmTicket,
    formatTicketDraft,
} from "../../src/lib/ai/ticket-guard";

describe("freshness", () => {
    it("flags historical data", () => {
        const historical: FreshnessMetadata = {
            source: "Réunion 2024",
            publishedAt: new Date("2024-01-01"),
            status: "historical",
        };
        expect(getStalenessReason(historical)).toContain("historique");
    });

    it("flags expired data", () => {
        const expired: FreshnessMetadata = {
            source: "Statut",
            publishedAt: new Date("2020-01-01"),
            status: "current",
            validUntil: new Date("2024-01-01"),
        };
        const reason = getStalenessReason(expired, new Date("2026-01-01"));
        expect(reason).toContain("expirée");
    });

    it("does not flag current data", () => {
        const current: FreshnessMetadata = {
            source: "Site officiel",
            publishedAt: new Date("2026-09-01"),
            status: "current",
        };
        expect(getStalenessReason(current, new Date("2026-09-02"))).toBeNull();
    });

    it("annotates stale answers", () => {
        const answer = "Liste des membres 2024";
        const result = annotateWithStaleness(answer, {
            source: "Archive",
            publishedAt: new Date("2024-01-01"),
            status: "historical",
        });
        expect(result).toContain("⚠️");
        expect(result).toContain("2024");
    });

    it("UNKNOWN_FRESHNESS is always stale", () => {
        const reason = getStalenessReason(UNKNOWN_FRESHNESS, new Date());
        expect(reason).not.toBeNull();
    });

    it("computes age correctly", () => {
        const now = new Date("2026-09-01");
        expect(getDataAge(new Date("2026-09-01"), now)).toBe("aujourd'hui");
        expect(getDataAge(new Date("2026-08-31"), now)).toBe("hier");
        expect(getDataAge(new Date("2025-09-01"), now)).toContain("an");
    });
});

describe("observability", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("logs answer without leaking phone numbers", () => {
        logAnswer({
            intent: INTENT.CONTACT_BUREAU,
            sourceType: "office_registry",
            confidence: 0.95,
            decision: "answer",
            reason: "Office at +212600000000 is open",
            channel: "telegram",
            requiredClarification: false,
            toolCallExecuted: false,
        });

        expect(logger.info).toHaveBeenCalled();
        const lastCall = (logger.info as any).mock.calls.at(-1);
        const args = lastCall[1];
        expect(args.reason).not.toContain("+212600000000");
        expect(args.reason).toContain("[TÉLÉPHONE]");
    });

    it("tracks clarifications", () => {
        trackClarification(INTENT.QUESTION_GENERALE);
        expect(logger.info).toHaveBeenCalled();
    });

    it("tracks refusals", () => {
        trackRefusal(INTENT.ORGANE_OFFICIEL, "no roster");
        expect(logger.info).toHaveBeenCalled();
    });

    it("tracks tool calls", () => {
        trackToolCall(INTENT.TICKET_REQUEST, "create_ticket");
        expect(logger.info).toHaveBeenCalled();
    });

    it("never includes phone-like strings even when passed", () => {
        logAnswer({
            intent: INTENT.CONTACT_BUREAU,
            sourceType: "office_registry",
            confidence: 0.9,
            decision: "answer",
            reason: "06 12 34 56 78 is the number",
            requiredClarification: false,
            toolCallExecuted: false,
        });

        const lastCall = (logger.info as any).mock.calls.at(-1);
        const args = lastCall[1];
        expect(args.reason).not.toMatch(/06\s?12/);
    });
});

describe("arabic-search", () => {
    describe("normalizeArabic", () => {
        it("normalises alef variants to bare alef", () => {
            expect(normalizeArabic("أحمد")).toBe("احمد");
            expect(normalizeArabic("إبراهيم")).toBe("ابراهيم");
        });

        it("normalises hamza variants", () => {
            expect(normalizeArabic("آمين")).toBe("امين");
        });

        it("replaces ة with ه", () => {
            expect(normalizeArabic("مدرسة")).toBe("مدرسه");
        });

        it("replaces ى with ي", () => {
            expect(normalizeArabic("على")).toBe("علي");
        });

        it("strips harakat", () => {
            expect(normalizeArabic("مَرْحَبًا")).toBe("مرحبا");
        });

        it("strips tatweel", () => {
            expect(normalizeArabic("مــــدرسة")).toBe("مدرسه");
        });

        it("handles alif-wasla doublings", () => {
            expect(normalizeArabic("االكتاب")).toBe("الكتاب");
        });
    });

    describe("applyCityAlias", () => {
        it("maps تزميت to تيزنيت", () => {
            expect(applyCityAlias("تزميت")).toBe("تيزنيت");
        });

        it("returns original text when no alias matches", () => {
            expect(applyCityAlias("مراكش")).toBe("مراكش");
        });

        it("does NOT invent unknown variants", () => {
            expect(applyCityAlias("غيرمعروف")).toBe("غيرمعروف");
        });
    });

    describe("searchBureau", () => {
        const candidates = [
            { bureau: "تيزنيت", province: "سوس ماسة" },
            { bureau: "تارودانت", province: "سوس ماسة" },
            { bureau: "أكادير", province: "سوس ماسة" },
        ];

        it("returns exact match", () => {
            const result = searchBureau({
                query: "تيزنيت",
                candidates,
                options: { intent: INTENT.CONTACT_BUREAU },
            });
            expect(result?.bureau).toBe("تيزنيت");
            expect(result?.fuzzy).toBe(false);
            expect(result?.confidence).toBe(1.0);
        });

        it("resolves alias then exact matches", () => {
            const result = searchBureau({
                query: "تزميت",
                candidates,
                options: { intent: INTENT.CONTACT_BUREAU },
            });
            expect(result?.bureau).toBe("تيزنيت");
            expect(result?.fuzzy).toBe(false);
        });

        it("blocks fuzzy when intent is not CONTACT_BUREAU", () => {
            const result = searchBureau({
                query: "تيزنيت قريب",
                candidates,
                options: { intent: INTENT.QUESTION_GENERALE, allowFuzzy: true },
            });
            expect(result).toBeNull();
        });

        it("blocks fuzzy when allowFuzzy is false", () => {
            const result = searchBureau({
                query: "تيزنيت قريب",
                candidates,
                options: { intent: INTENT.CONTACT_BUREAU, allowFuzzy: false },
            });
            expect(result).toBeNull();
        });

        it("returns null for completely unknown queries", () => {
            const result = searchBureau({
                query: "مدينة غير موجودة",
                candidates,
                options: { intent: INTENT.CONTACT_BUREAU },
            });
            expect(result).toBeNull();
        });
    });

    describe("validateHierarchy", () => {
        it("accepts when province matches", () => {
            const match = { bureau: "تيزنيت", province: "سوس ماسة", confidence: 1, fuzzy: false, alternatives: [] };
            expect(validateHierarchy(match, undefined, "سوس ماسة")).toBe(true);
        });

        it("rejects when province mismatches", () => {
            const match = { bureau: "تيزنيت", province: "سوس ماسة", confidence: 1, fuzzy: false, alternatives: [] };
            expect(validateHierarchy(match, undefined, "الرباط")).toBe(false);
        });

        it("accepts when no province data", () => {
            const match = { bureau: "تيزنيت", confidence: 1, fuzzy: false, alternatives: [] };
            expect(validateHierarchy(match)).toBe(true);
        });
    });
});

describe("conversation-state", () => {
    it("creates an idle state by default", () => {
        const state = createIdleState();
        expect(state.state).toBe(CONVERSATION_STATE.IDLE);
    });

    it("free-form question clears stale state", () => {
        const state = {
            state: CONVERSATION_STATE.MENU as any,
            lastActivity: new Date(),
        };
        const cleared = clearStaleState(state, true);
        expect(cleared.state).toBe(CONVERSATION_STATE.IDLE);
    });

    it("numeric menu selection does NOT clear state", () => {
        const state = {
            state: CONVERSATION_STATE.MENU as any,
            lastActivity: new Date(),
        };
        const after = clearStaleState(state, false);
        expect(after.state).toBe(CONVERSATION_STATE.MENU);
    });

    it("office_clarification can NEVER create a ticket", () => {
        const state = {
            state: CONVERSATION_STATE.OFFICE_CLARIFICATION as any,
            lastActivity: new Date(),
        };
        expect(canCreateTicketFromState(state)).toBe(false);
    });

    it("ticket_confirmation can create a ticket (if not expired)", () => {
        const state = {
            state: CONVERSATION_STATE.TICKET_CONFIRMATION as any,
            lastActivity: new Date(),
        };
        expect(canCreateTicketFromState(state)).toBe(true);
    });

    it("idle state cannot directly create a ticket", () => {
        const state = createIdleState();
        expect(canCreateTicketFromState(state)).toBe(false);
    });

    it("touch updates timestamp", () => {
        const state = createIdleState();
        const touched = touchState(state);
        expect(touched.lastActivity.getTime()).toBeGreaterThanOrEqual(state.lastActivity.getTime());
    });

    it("expired state is detected", () => {
        const old = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
        const state = {
            state: CONVERSATION_STATE.MENU as any,
            lastActivity: old,
        };
        expect(isStateExpired(state)).toBe(true);
    });
});

describe("ticket-guard", () => {
    it("allows ticket workflow on explicit request", () => {
        const state = createIdleState();
        const result = canInitiateTicketWorkflow(INTENT.TICKET_REQUEST, state);
        expect(result.allowed).toBe(true);
    });

    it("blocks ticket workflow on implicit intents", () => {
        const state = createIdleState();
        expect(canInitiateTicketWorkflow(INTENT.POSITION_NATIONALE, state).allowed).toBe(false);
        expect(canInitiateTicketWorkflow(INTENT.QUESTION_GENERALE, state).allowed).toBe(false);
        expect(canInitiateTicketWorkflow(INTENT.CONTACT_BUREAU, state).allowed).toBe(false);
    });

    it("blocks ticket workflow from office_clarification state", () => {
        const state = {
            state: CONVERSATION_STATE.OFFICE_CLARIFICATION as any,
            lastActivity: new Date(),
        };
        const result = canInitiateTicketWorkflow(INTENT.TICKET_REQUEST, state);
        expect(result.allowed).toBe(false);
    });

    it("confirmation only valid in TICKET_CONFIRMATION state", () => {
        const state = {
            state: CONVERSATION_STATE.TICKET_CONFIRMATION as any,
            lastActivity: new Date(),
        };
        expect(canConfirmTicket(state)).toBe(true);
    });

    it("confirmation blocked in IDLE state", () => {
        const state = createIdleState();
        expect(canConfirmTicket(state)).toBe(false);
    });

    it("formats a draft ticket without creating one", () => {
        const draft = formatTicketDraft({
            title: "Test ticket",
            description: "Test description",
            channel: "telegram",
        });
        expect(draft).toContain("Test ticket");
        expect(draft).toContain("نعم");
    });
});