import { describe, it, expect } from "vitest";
import { isOutOfScopeQuery, isLegitimateKnowledgeQuestion } from "@/lib/ai/refusal-detector";

describe("Out-of-scope query guardrail", () => {
  it("detects sports and football match queries as out of scope", () => {
    expect(isOutOfScopeQuery("نتيجة مباراة ريال مدريد أمس (4 شتنبر 2026)")).toBe(true);
    expect(isOutOfScopeQuery("أهداف مباراة برشلونة البارح")).toBe(true);
    expect(isOutOfScopeQuery("شكون ربح في ماتش البارح؟")).toBe(true);
    expect(isOutOfScopeQuery("ترتيب الدوري الإسباني")).toBe(true);
    expect(isOutOfScopeQuery("champions league real madrid")).toBe(true);
    expect(isOutOfScopeQuery("أخبار منتخب المغرب في كرة القدم")).toBe(true);
  });

  it("detects weather and meteo queries as out of scope", () => {
    expect(isOutOfScopeQuery("حالة الطقس في تيزنيت – اليوم الجمعة 5 شتنبر 2026")).toBe(true);
    expect(isOutOfScopeQuery("أحوال الطقس في الرباط غدا")).toBe(true);
    expect(isOutOfScopeQuery("météo casablanca")).toBe(true);
    expect(isOutOfScopeQuery("درجة الحرارة في مراكش")).toBe(true);
  });

  it("detects horoscope as out of scope", () => {
    expect(isOutOfScopeQuery("حظك اليوم برج القوس")).toBe(true);
  });

  it("NEVER marks legitimate educational queries or competitions as out of scope", () => {
    // Crucial: "مباراة التعليم" contains the word "مباراة", but is a teacher recruitment exam!
    expect(isOutOfScopeQuery("شروط مباراة التعليم 2024")).toBe(false);
    expect(isOutOfScopeQuery("نتائج مباراة الترقية بالشهادات")).toBe(false);
    expect(isOutOfScopeQuery("مباراة التفتيش التربوي ومراكز التكوين crmef")).toBe(false);
    expect(isOutOfScopeQuery("مباراة الإدارة التربوية")).toBe(false);
    expect(isOutOfScopeQuery("كيفية الترشيح لمباراة التعليم بالتعاقد")).toBe(false);
    expect(isOutOfScopeQuery("ما هي شروط التقاعد النسبي؟")).toBe(false);
    expect(isOutOfScopeQuery("ملف التعويض عن المصاريف الطبية CNOPS")).toBe(false);
    expect(isOutOfScopeQuery("تيزنيت")).toBe(false); // Office search / general mention
  });

  it("ensures isLegitimateKnowledgeQuestion rejects out of scope queries so they do not pollute unanswered questions", () => {
    expect(isLegitimateKnowledgeQuestion("نتيجة مباراة ريال مدريد أمس")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("حالة الطقس في تيزنيت اليوم")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("شروط مباراة التعليم بالشهادات")).toBe(true);
  });
});
