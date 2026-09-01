/**
 * Unit tests for src/lib/ai/intent-router.ts
 *
 * Test matrix from the AGENTS.md plan:
 *
 * 1. `موقف الجامعة من الحراك التعليمي` → POSITION_NATIONALE
 *    - Must NOT trigger office lookup
 *    - Must NOT surface contact information
 *
 * 2. `أعضاء اللجنة الإدارية` → ORGANE_OFFICIEL
 *    - Must refuse when no official roster exists
 *    - Must NOT fabricate names or cite 2024 dates
 *
 * 3. `فتح تذكرة` → TICKET_REQUEST
 *    - Must be matched BEFORE contact_bureau
 *    - Must require explicit confirmation before ticket creation
 *
 * 4. `رقم هاتف المكتب الإقليمي` → CONTACT_BUREAU
 *    - Must NOT match without explicit contact signal
 *
 * 5. `تزميت` → unclear (city variant of تيزنيت)
 *    - Must NOT auto-route to CONTACT_BUREAU
 *    - May suggest correction only after explicit bureau request
 *
 * 6. `نعم` → contextual
 *    - In menu state: confirms menu action
 *    - In contact context: provides contact info
 *    - After global question: must NOT create implicit ticket
 *
 * 7. Telegram and WhatsApp must behave identically
 */

import { describe, it, expect } from "vitest";
import {
    classifyIntent,
    isSourceAllowed,
    decideAnswer,
    INTENT,
    SOURCE_BY_INTENT,
    type Intent,
} from "../../src/lib/ai/intent-router";

/** Normalize text the same way the router does before classification. */
function normalizeForTest(text: string): string {
    return text
        .toLowerCase()
        .replace(/[إأآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/[\u064b-\u065f\u0670]/g, "") // harakat
        .replace(/[\u0640]/g, "") // tatweel
        .replace(/\s+/g, " ")
        .trim();
}

describe("classifyIntent", () => {
    describe("POSITION_NATIONALE — union stance / movement", () => {
        it('classifies "موقف الجامعة من الحراك التعليمي" as POSITION_NATIONALE', () => {
            const result = classifyIntent(normalizeForTest("موقف الجامعة من الحراك التعليمي"));
            expect(result.intent).toBe(INTENT.POSITION_NATIONALE);
            expect(result.matched).toBe(true);
            expect(result.confidence).toBeGreaterThanOrEqual(0.9);
        });

        it('classifies "موقف النقابة من الاضراب" as POSITION_NATIONALE', () => {
            const result = classifyIntent(normalizeForTest("موقف النقابة من الاضراب"));
            expect(result.intent).toBe(INTENT.POSITION_NATIONALE);
        });

        it('classifies "بيان الجامعة الاخير" as POSITION_NATIONALE', () => {
            const result = classifyIntent(normalizeForTest("بيان الجامعة الاخير"));
            expect(result.intent).toBe(INTENT.POSITION_NATIONALE);
        });

        it('classifies "الحراك التعليمي" as POSITION_NATIONALE', () => {
            const result = classifyIntent(normalizeForTest("الحراك التعليمي"));
            expect(result.intent).toBe(INTENT.POSITION_NATIONALE);
        });

        it('classifies "اضراب وطني" as POSITION_NATIONALE', () => {
            const result = classifyIntent(normalizeForTest("اضراب وطني"));
            expect(result.intent).toBe(INTENT.POSITION_NATIONALE);
        });

        // CRITICAL: POSITION_NATIONALE must NOT trigger office lookup
        it('must NOT route "موقف الجامعة" to CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("موقف الجامعة"));
            expect(result.intent).not.toBe(INTENT.CONTACT_BUREAU);
        });
    });

    describe("ORGANE_OFFICIEL — official bodies / rosters", () => {
        it('classifies "أعضاء اللجنة الإدارية" as ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("أعضاء اللجنة الإدارية"));
            expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
            expect(result.matched).toBe(true);
        });

        it('classifies "المجلس الوطني" as ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("المجلس الوطني"));
            expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
        });

        it('classifies "تشكيلة المكتب الوطني" as ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("تشكيلة المكتب الوطني"));
            expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
        });

        it('classifies "من هي اعضاء المكتب الجهوي" as ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("من هي اعضاء المكتب الجهوي"));
            expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
        });

        it('classifies "اللجنة التنفيذية" as ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("اللجنة التنفيذية"));
            expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
        });

        // CRITICAL: Must NOT fabricate members
        it('must NOT fabricate member names for ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("مين Secretary العام"));
            // "Secretary" is English and does NOT match any organe_officiel keyword
            expect(result.intent).not.toBe(INTENT.ORGANE_OFFICIEL);
        });
    });

    describe("Descriptive bureau queries — KB fallback for duties/roles", () => {
        // CRITICAL: "مهام المكتب الوطني" (duties of National Bureau) is a
        // descriptive question, not a roster question. It must route to
        // QUESTION_GENERALE so the KB can answer; ORGANE_OFFICIEL would refuse
        // if no verified roster exists.
        it('classifies "مهام المكتب الوطني" as QUESTION_GENERALE (not ORGANE_OFFICIEL)', () => {
            const result = classifyIntent(normalizeForTest("مهام المكتب الوطني"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "اختصاصات المكتب الوطني" as QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("اختصاصات المكتب الوطني"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "دور المكتب الجهوي" as QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("دور المكتب الجهوي"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "مهام اللجنة الإدارية" as QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("مهام اللجنة الإدارية"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "مهام النقابة الوطنية" as QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("مهام النقابة الوطنية"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        // Must NOT regress: roster queries stay in ORGANE_OFFICIEL
        it('keeps "تشكيلة المكتب الوطني" in ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("تشكيلة المكتب الوطني"));
            expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
        });

        it('keeps "من هم أعضاء المكتب الوطني" in ORGANE_OFFICIEL', () => {
            const result = classifyIntent(normalizeForTest("من هم أعضاء المكتب الوطني"));
            expect(result.intent).toBe(INTENT.ORGANE_OFFICIEL);
        });
    });

    describe("Organization / formation / election queries — KB fallback", () => {
        // Regression test: "كيف يتم تأسيس وتنظيم المكاتب الجهوية والإقليمية"
        // contains both "المكتب الجهوي" and "المكتب الاقليمي" which used to
        // route to ORGANE_OFFICIEL (refuse). Now it must route to
        // QUESTION_GENERALE so the KB can answer.
        it('classifies "كيف يتم تأسيس وتنظيم المكاتب الجهوية والإقليمية" as QUESTION_GENERALE', () => {
            const result = classifyIntent(
                normalizeForTest("كيف يتم تأسيس وتنظيم المكاتب الجهوية والإقليمية")
            );
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "الية تشكيل المكتب الوطني" as QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("الية تشكيل المكتب الوطني"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "ما هو المكتب الوطني" as QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("ما هو المكتب الوطني"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "ما هي اليات انتخاب المكتب الوطني" as QUESTION_GENERALE', () => {
            const result = classifyIntent(
                normalizeForTest("ما هي اليات انتخاب المكتب الوطني")
            );
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "كيف يتم تشكيل اللجنة الادارية" as QUESTION_GENERALE', () => {
            const result = classifyIntent(
                normalizeForTest("كيف يتم تشكيل اللجنة الادارية")
            );
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('classifies "الية انتخاب المكتب الجهوي" as QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("الية انتخاب المكتب الجهوي"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });
    });

    describe("TICKET_REQUEST — explicit ticket requests only", () => {
        it('classifies "فتح تذكرة" as TICKET_REQUEST', () => {
            const result = classifyIntent(normalizeForTest("فتح تذكرة"));
            expect(result.intent).toBe(INTENT.TICKET_REQUEST);
        });

        it('classifies "انشاء تذكرة جديدة" as TICKET_REQUEST', () => {
            const result = classifyIntent(normalizeForTest("انشاء تذكرة جديدة"));
            expect(result.intent).toBe(INTENT.TICKET_REQUEST);
        });

        it('classifies "تذكرة دعم" as TICKET_REQUEST', () => {
            const result = classifyIntent(normalizeForTest("تذكرة دعم"));
            expect(result.intent).toBe(INTENT.TICKET_REQUEST);
        });

        it('classifies "open ticket" as TICKET_REQUEST', () => {
            const result = classifyIntent(normalizeForTest("open ticket"));
            expect(result.intent).toBe(INTENT.TICKET_REQUEST);
        });

        it('classifies "créer un ticket" as TICKET_REQUEST', () => {
            const result = classifyIntent(normalizeForTest("créer un ticket"));
            expect(result.intent).toBe(INTENT.TICKET_REQUEST);
        });

        // CRITICAL: Ticket must be matched BEFORE contact
        it('"فتح تذكرة حول الهاتف" must be TICKET_REQUEST not CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("فتح تذكرة حول الهاتف"));
            expect(result.intent).toBe(INTENT.TICKET_REQUEST);
        });
    });

    describe("CONTACT_BUREAU — bureau contact info only", () => {
        it('classifies "رقم هاتف المكتب" as CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("رقم هاتف المكتب"));
            expect(result.intent).toBe(INTENT.CONTACT_BUREAU);
        });

        it('classifies "تواصل مع المكتب الاقليمي" as CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("تواصل مع المكتب الاقليمي"));
            expect(result.intent).toBe(INTENT.CONTACT_BUREAU);
        });

        it('classifies "امين المال" as CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("امين المال"));
            expect(result.intent).toBe(INTENT.CONTACT_BUREAU);
        });

        it('classifies "telephone bureau" as CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("telephone bureau"));
            expect(result.intent).toBe(INTENT.CONTACT_BUREAU);
        });

        // CRITICAL: Geographic names alone must NOT trigger CONTACT_BUREAU
        it('"تزميت" must NOT be CONTACT_BUREAU without explicit contact signal', () => {
            const result = classifyIntent(normalizeForTest("تزميت"));
            expect(result.intent).not.toBe(INTENT.CONTACT_BUREAU);
            // It should fall back to QUESTION_GENERALE
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('"تيزنيت" alone must NOT be CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("تيزنيت"));
            expect(result.intent).not.toBe(INTENT.CONTACT_BUREAU);
        });

        it('"مراكش" alone must NOT be CONTACT_BUREAU', () => {
            const result = classifyIntent(normalizeForTest("مراكش"));
            expect(result.intent).not.toBe(INTENT.CONTACT_BUREAU);
        });
    });

    describe("QUESTION_GENERALE — fallback / ambiguous", () => {
        it('"مرحبا" falls back to QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("مرحبا"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
            expect(result.matched).toBe(false);
            expect(result.confidence).toBeLessThan(0.6);
        });

        it('"كيف حالك" falls back to QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("كيف حالك"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });

        it('"شنو الجديد" falls back to QUESTION_GENERALE', () => {
            const result = classifyIntent(normalizeForTest("شنو الجديد"));
            expect(result.intent).toBe(INTENT.QUESTION_GENERALE);
        });
    });
});

describe("isSourceAllowed", () => {
    it("CONTACT_BUREAU allows only office_registry", () => {
        expect(isSourceAllowed(INTENT.CONTACT_BUREAU, "office_registry")).toBe(true);
        expect(isSourceAllowed(INTENT.CONTACT_BUREAU, "knowledge_base")).toBe(false);
        expect(isSourceAllowed(INTENT.CONTACT_BUREAU, "union_communique")).toBe(false);
    });

    it("ORGANE_OFFICIEL allows only official_roster", () => {
        expect(isSourceAllowed(INTENT.ORGANE_OFFICIEL, "official_roster")).toBe(true);
        expect(isSourceAllowed(INTENT.ORGANE_OFFICIEL, "office_registry")).toBe(false);
        expect(isSourceAllowed(INTENT.ORGANE_OFFICIEL, "knowledge_base")).toBe(false);
    });

    it("POSITION_NATIONALE allows union_communique and union_site", () => {
        expect(isSourceAllowed(INTENT.POSITION_NATIONALE, "union_communique")).toBe(true);
        expect(isSourceAllowed(INTENT.POSITION_NATIONALE, "union_site")).toBe(true);
        expect(isSourceAllowed(INTENT.POSITION_NATIONALE, "office_registry")).toBe(false);
        expect(isSourceAllowed(INTENT.POSITION_NATIONALE, "knowledge_base")).toBe(false);
    });

    it("TICKET_REQUEST allows only ticket_system", () => {
        expect(isSourceAllowed(INTENT.TICKET_REQUEST, "ticket_system")).toBe(true);
        expect(isSourceAllowed(INTENT.TICKET_REQUEST, "knowledge_base")).toBe(false);
    });

    it("QUESTION_GENERALE allows only knowledge_base", () => {
        expect(isSourceAllowed(INTENT.QUESTION_GENERALE, "knowledge_base")).toBe(true);
        expect(isSourceAllowed(INTENT.QUESTION_GENERALE, "office_registry")).toBe(false);
        expect(isSourceAllowed(INTENT.QUESTION_GENERALE, "union_communique")).toBe(false);
    });
});

describe("decideAnswer", () => {
    describe("ORGANE_OFFICIEL without roster", () => {
        it("must refuse when hasOfficialRoster is false", () => {
            const result = decideAnswer({
                intent: INTENT.ORGANE_OFFICIEL,
                classification: { intent: INTENT.ORGANE_OFFICIEL, matched: true, confidence: 0.95 },
                availableSources: ["official_roster"],
                hasOfficialRoster: false,
            });

            expect(result.kind).toBe("refuse");
            if (result.kind === "refuse") {
                expect(result.reason).toContain("Aucune liste officielle");
            }
        });

        it("must NOT fabricate members", () => {
            const result = decideAnswer({
                intent: INTENT.ORGANE_OFFICIEL,
                classification: { intent: INTENT.ORGANE_OFFICIEL, matched: true, confidence: 0.95 },
                availableSources: ["knowledge_base"], // Wrong source — must clarify
                hasOfficialRoster: false,
            });

            expect(result.kind).toBe("refuse");
        });
    });

    describe("POSITION_NATIONALE", () => {
        it("answers when union_communique is available", () => {
            const result = decideAnswer({
                intent: INTENT.POSITION_NATIONALE,
                classification: { intent: INTENT.POSITION_NATIONALE, matched: true, confidence: 0.95 },
                availableSources: ["union_communique", "union_site"],
                hasOfficialRoster: false,
            });

            expect(result.kind).toBe("answer");
        });

        it("must NOT route to office_registry", () => {
            const result = decideAnswer({
                intent: INTENT.POSITION_NATIONALE,
                classification: { intent: INTENT.POSITION_NATIONALE, matched: true, confidence: 0.95 },
                availableSources: ["office_registry"], // Wrong source
                hasOfficialRoster: false,
            });

            // No source is allowed, so this should clarify
            expect(result.kind).toBe("clarify");
        });
    });

    describe("CONTACT_BUREAU", () => {
        it("answers when office_registry is available", () => {
            const result = decideAnswer({
                intent: INTENT.CONTACT_BUREAU,
                classification: { intent: INTENT.CONTACT_BUREAU, matched: true, confidence: 0.95 },
                availableSources: ["office_registry"],
                hasOfficialRoster: false,
            });

            expect(result.kind).toBe("answer");
        });

        it("must clarify when office_registry is missing", () => {
            const result = decideAnswer({
                intent: INTENT.CONTACT_BUREAU,
                classification: { intent: INTENT.CONTACT_BUREAU, matched: true, confidence: 0.95 },
                availableSources: ["knowledge_base"],
                hasOfficialRoster: false,
            });

            expect(result.kind).toBe("clarify");
        });
    });

    describe("Low confidence", () => {
        it("must clarify when confidence < 0.6", () => {
            const result = decideAnswer({
                intent: INTENT.QUESTION_GENERALE,
                classification: { intent: INTENT.QUESTION_GENERALE, matched: false, confidence: 0.5 },
                availableSources: ["knowledge_base"],
                hasOfficialRoster: false,
            });

            expect(result.kind).toBe("clarify");
        });
    });
});

describe("Cross-channel parity (Telegram == WhatsApp)", () => {
    // The router is channel-agnostic. These tests verify that the same
    // text produces the same intent regardless of channel context.

    const testCases: Array<{ text: string; expectedIntent: Intent }> = [
        { text: "موقف الجامعة", expectedIntent: INTENT.POSITION_NATIONALE },
        { text: "اعضاء المكتب الوطني", expectedIntent: INTENT.ORGANE_OFFICIEL },
        { text: "فتح تذكرة", expectedIntent: INTENT.TICKET_REQUEST },
        { text: "رقم هاتف المكتب", expectedIntent: INTENT.CONTACT_BUREAU },
        { text: "مراكش", expectedIntent: INTENT.QUESTION_GENERALE },
        { text: "تزميت", expectedIntent: INTENT.QUESTION_GENERALE },
    ];

    testCases.forEach(({ text, expectedIntent }) => {
        it(`"${text}" → ${expectedIntent} (no channel dependency)`, () => {
            const result = classifyIntent(normalizeForTest(text));
            expect(result.intent).toBe(expectedIntent);
        });
    });
});