import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { classifyIntent, INTENT } from "../../src/lib/ai/intent-router";
import { buildOfficeDirectAnswer, extractArticleNumber } from "../../src/lib/ai/engine";
import { detectRequestIntent } from "../../src/lib/requests/wizard";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
mockPrisma.office ??= { findMany: vi.fn() };

describe("User-reported anomalies regression tests", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // Souss Massa regional office mock
        mockPrisma.office.findMany.mockResolvedValue([
            {
                id: "office-souss",
                sourceId: 10,
                isActive: true,
                level: "جهوي",
                name: "المكتب الجهوي لـ سوس ماسة",
                region: "سوس ماسة",
                province: "أكادير إداوتنان",
                parentOffice: "",
                secretary: "الضعيف حسن",
                secretaryPhone: "0699377818",
                treasurer: "الكمراني سعيد",
                treasurerPhone: "0687665893",
            },
            {
                id: "office-sale",
                sourceId: 11,
                isActive: true,
                level: "إقليمي",
                name: "المكتب الإقليمي لـ سلا",
                region: "الرباط سلا القنيطرة",
                province: "سلا",
                parentOffice: "",
                secretary: "مسؤول سلا",
                secretaryPhone: "0612345678",
                treasurer: "",
                treasurerPhone: "",
            },
        ]);
    });

    it("Question 'ما هي شروط التقاعد النسبي؟' does NOT trigger office lookup and routes to QUESTION_GENERALE", async () => {
        const query = "ما هي شروط التقاعد النسبي؟";
        const classification = classifyIntent(query);
        expect(classification.intent).toBe(INTENT.QUESTION_GENERALE);

        // buildOfficeDirectAnswer must return null so it proceeds to KB / LLM
        const directOfficeAnswer = await buildOfficeDirectAnswer(query);
        expect(directOfficeAnswer).toBeNull();
    });

    it("Greeting 'السلام عليكم' or 'سلام' does NOT match Salé ('سلا') as office", async () => {
        const queries = ["السلام عليكم", "سلام", "تحية نضالية"];
        for (const q of queries) {
            const answer = await buildOfficeDirectAnswer(q);
            expect(answer).toBeNull();
        }
    });

    it("Question 'ما هو رقم التأجير؟' does NOT hijack to office contact", async () => {
        const query = "ما هو رقم التأجير؟";
        const classification = classifyIntent(query);
        expect(classification.intent).toBe(INTENT.QUESTION_GENERALE);

        const answer = await buildOfficeDirectAnswer(query);
        expect(answer).toBeNull();
    });

    it("Seniority text 'عندي 15 سنة أقدمية' does NOT extract article 15", () => {
        const article = extractArticleNumber("عندي 15 سنة أقدمية ودرجة 2 سلم 10");
        expect(article).toBeNull();
    });

    it("Explicit legal article 'المادة 15' IS properly extracted", () => {
        const article = extractArticleNumber("ما جاء في المادة 15 من القانون الأساسي");
        expect(article).toBe(15);
    });

    it("Noun query 'رخصة مرض' does NOT trigger request wizard without action intent", () => {
        expect(detectRequestIntent("رخصة مرض")).toBe(false);
        expect(detectRequestIntent("شروط رخصة المرض")).toBe(false);
        // Action verbs should trigger
        expect(detectRequestIntent("طلب رخصة مرض")).toBe(true);
        expect(detectRequestIntent("نموذج طلب رخصة مرضية")).toBe(true);
    });
});
