import { describe, it, expect } from "vitest";
import { extractPdfLinksFromContent } from "@/lib/pdf-extractor";
import { cleanArabicExtractedPdf } from "@/lib/arabic-cleaner";

describe("PDF Link Extraction and Scraper Integration", () => {
  it("extracts markdown PDF links correctly", () => {
    const md = `
# بلاغ إخباري
يمكنكم الاطلاع على التفاصيل:
[تحميل المذكرة الوزارية بصيغة PDF](https://www.men.gov.ma/sites/default/files/2026-08/note126.pdf)
وأيضا وثيقة أخرى:
[مرفق 2](https://taalim.org/docs/annexe.pdf)
    `;
    const links = extractPdfLinksFromContent(md);
    expect(links).toHaveLength(2);
    expect(links[0]).toBe("https://www.men.gov.ma/sites/default/files/2026-08/note126.pdf");
    expect(links[1]).toBe("https://taalim.org/docs/annexe.pdf");
  });

  it("resolves relative PDF links when baseUrl is provided", () => {
    const html = `
      <div>
        <a href="/sites/default/files/notes/circular.pdf">Télécharger PDF</a>
      </div>
    `;
    const links = extractPdfLinksFromContent(html, "https://www.men.gov.ma/ar/notes");
    expect(links).toHaveLength(1);
    expect(links[0]).toBe("https://www.men.gov.ma/sites/default/files/notes/circular.pdf");
  });

  it("extracts raw PDF links in text", () => {
    const raw = "Consultez la circulaire sur https://www.men.gov.ma/docs/circulaire_2026.pdf pour les détails.";
    const links = extractPdfLinksFromContent(raw);
    expect(links).toHaveLength(1);
    expect(links[0]).toBe("https://www.men.gov.ma/docs/circulaire_2026.pdf");
  });
});

describe("Staff Relevance Filter", () => {
  it("filters out pupil sports, festivals and protocol", async () => {
    const { isRelevantForStaff } = await import("@/app/api/knowledge/sync-men/route");
    
    // Irrelevant items (pupil championships, festivals, protocols)
    expect(isRelevantForStaff("نتائج البطولة المدرسية للعدو الريفي", "https://men.gov.ma/ar/sports")).toBe(false);
    expect(isRelevantForStaff("المهرجان الوطني للفيلم التربوي لفائدة التلميذات", "https://men.gov.ma/ar/festival")).toBe(false);
    expect(isRelevantForStaff("مأدبة عشاء واستقبال سفير دولة شقيقة", "https://men.gov.ma/ar/protocol")).toBe(false);
    expect(isRelevantForStaff("البطولة الإفريقية للرياضة المدرسية", "https://men.gov.ma/ar/championnat")).toBe(false);

    // Relevant items (career, transfers, retirement, circulars, exams)
    expect(isRelevantForStaff("مذكرة وزارية في شأن الحركة الانتقالية لهيئة التدريس", "https://men.gov.ma/ar/mvt")).toBe(true);
    expect(isRelevantForStaff("شروط الاستيداع الإداري والتفرغ", "https://men.gov.ma/ar/dispo")).toBe(true);
    expect(isRelevantForStaff("لوائح المترشحين للامتحان المهني للترقية في الدرجة", "https://men.gov.ma/ar/exam")).toBe(true);
    expect(isRelevantForStaff("إجراءات الاستفادة من التقاعد النسبي", "https://men.gov.ma/ar/retraite")).toBe(true);
    expect(isRelevantForStaff("مقرر تنظيم السنة الدراسية وتوقيع محاضر الدخول", "https://men.gov.ma/ar/rentree")).toBe(true);
  });
});

