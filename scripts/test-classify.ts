/**
 * Test the intent router against various descriptive bureau queries
 * to understand what gets blocked and what doesn't.
 */
import { classifyIntent, INTENT } from "../src/lib/ai/intent-router";

function normalizeForTest(text: string): string {
    return text
        .toLowerCase()
        .replace(/[إأآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/[\u064b-\u065f\u0670]/g, "")
        .replace(/[\u0640]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const queries = [
    "كيف يتم تأسيس وتنظيم المكاتب الجهوية والإقليمية؟",
    "كيفية تأسيس المكاتب",
    "ما هي اختصاصات المكتب الوطني",
    "ما هي مهام المكتب الجهوي",
    "ما هو دور الكاتب الإقليمي",
    "كيف يعمل المكتب الوطني",
    "ما هي تركيبة اللجنة التنفيذية",
    "من هو أمين المال",
    "ما هي صلاحيات المكتب",
    "كيف يتم انتخاب المكتب",
    "تنظيم المكاتب الجهوية",
    "تشكيلة المكتب الوطني",
    "من هم أعضاء المكتب الوطني",
    "ما هو المكتب الوطني",
    "ما هي النقابة الوطنية للتعليم",
    "أين مقر المكتب الوطني",
    "رقم هاتف المكتب الوطني",
    "تواصل مع المكتب",
];

for (const q of queries) {
    const n = normalizeForTest(q);
    const r = classifyIntent(n);
    console.log(`  [${r.intent.padEnd(18)}]  ${q}`);
}
