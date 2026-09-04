import { describe, it, expect } from "vitest";
import {
  isAssistantRefusal,
  isLegitimateKnowledgeQuestion,
} from "../../src/lib/ai/refusal-detector";

describe("Unanswered Questions Filter & Refusal Detector", () => {
  it("should reject common greetings and pleasantries", () => {
    expect(isLegitimateKnowledgeQuestion("مرحبا")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("السلام عليكم")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("مرحبا السلام عليكم")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("السلام عليكم ورحمة الله وبركاته")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("صباح الخير")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("مساء الخير")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("سلام أخي")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("bonjour")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("salut")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("ca va")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("لاباس")).toBe(false);
  });

  it("should reject gratitude, closings, and blessings", () => {
    expect(isLegitimateKnowledgeQuestion("شكرا")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("شكرا جزيلا وبارك الله فيك")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("الله يرحم الوالدين")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("الله يجازيك بخير")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("merci beaucoup")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("مع السلامة")).toBe(false);
  });

  it("should reject navigation numbers, menus, and short words", () => {
    expect(isLegitimateKnowledgeQuestion("0")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("1")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("8")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("menu")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("قائمة")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("رجوع")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("نعم")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("لا")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("oui")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("non")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("ok")).toBe(false);
  });

  it("should reject noise, developer keys, and test strings", () => {
    expect(isLegitimateKnowledgeQuestion("test")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("تجربة")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("aaaaaaa")).toBe(false);
    expect(isLegitimateKnowledgeQuestion(".......")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("sk-12345678901234567890123456")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("https://example.com")).toBe(false);
    expect(isLegitimateKnowledgeQuestion("+212661234567")).toBe(false);
  });

  it("should ACCEPT legitimate substantive questions", () => {
    expect(isLegitimateKnowledgeQuestion("ما هي شروط الترقية بالشهادة؟")).toBe(true);
    expect(isLegitimateKnowledgeQuestion("متى تخرج نتائج الحركة الانتقالية؟")).toBe(true);
    expect(isLegitimateKnowledgeQuestion("السلام عليكم، متى تصرف تعويضات الترقية بالرتبة؟")).toBe(true);
    expect(isLegitimateKnowledgeQuestion("كيفية الاستفادة من رخصة مرضية متوسطة الأمد؟")).toBe(true);
    expect(isLegitimateKnowledgeQuestion("معلومات عن النظام الأساسي الجديد")).toBe(true);
    expect(isLegitimateKnowledgeQuestion("الترقية بالشهادات")).toBe(true);
    expect(isLegitimateKnowledgeQuestion("ملف التقاعد النسبي")).toBe(true);
  });

  it("should not consider standard welcome menus as refusals", () => {
    const welcomeMenu = `🏛️ *الجامعة الوطنية للتعليم FNE*
اختر من القائمة:
1 - المكاتب والتنظيم النقابي
2 - القانون الأساسي
0 - رجوع`;
    expect(isAssistantRefusal(welcomeMenu)).toBe(false);
  });

  it("should correctly detect true assistant refusals", () => {
    expect(
      isAssistantRefusal("للأسف لا تتوفر لدي حالياً أي معطيات أو تفاصيل حول هذا الموضوع في قاعدة المعرفة.")
    ).toBe(true);
    expect(
      isAssistantRefusal("لم أتمكن من العثور على وثيقة رسمية بخصوص هذا السؤال.")
    ).toBe(true);
    expect(
      isAssistantRefusal("هاد المعلومة ما عنديش دابا في قاعدة المعرفة.")
    ).toBe(true);
  });
});
