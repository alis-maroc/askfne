import { describe, it, expect } from "vitest";
import { findMatchingCannedResponse } from "@/lib/ai/engine";

describe("findMatchingCannedResponse", () => {
  it("matches a public-service leave question to the canned response", () => {
    const matches = [
      { id: "1", title: "أنواع الرخص", category: "النظام الأساسي للوظيفة العمومية", shortcut: "rukhsa", content: "الرخص الإدارية والصحية والولادة بدون أجر", isActive: true },
    ];

    const result = findMatchingCannedResponse("انواع الرخص", matches as any, "4");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("أنواع الرخص");
  });

  it("returns null when no canned response matches the query", () => {
    const matches = [
      { id: "1", title: "أنواع الرخص", category: "النظام الأساسي للوظيفة العمومية", shortcut: "rukhsa", content: "الأجر", isActive: true },
    ];

    expect(findMatchingCannedResponse("ماهو اسم المكتب؟", matches as any, "1")).toBeNull();
  });
});
