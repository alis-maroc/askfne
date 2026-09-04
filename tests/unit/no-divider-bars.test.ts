import { describe, it, expect } from "vitest";
import { sanitizeWhatsAppMessage } from "@/lib/channels/whatsapp";

describe("WhatsApp decorative bar removal & layout cleanliness", () => {
  it("strips out long horizontal divider bars from message and headers", () => {
    const rawMsg = `
📄 *الحركة الانتقالية الوطنية الخاصة بمديري الدراسة والنظار ومديري التعليم الابتدائي والحراس*
━━━━━━━━━━━━━━━━━━━━

🏛️ *مصدر رسمي: وزارة التربية الوطنية والتعليم الأولي والرياضة (men.gov.ma)*

📌 *التصنيف:* مذكرة وزارية / وثيقة رسمية (PDF)

تفتتح وزارة التربية الوطنية باب المشاركة في *الحركة الانتقالية الوطنية لسنة 2026* الخاصة بمديري الدراسة والنظار ومديري التعليم الابتدائي والحراس العامين ورؤساء الأشغال بمؤسسات التربية والتعليم العمومي، وذلك عبر *البوابة الإلكترونية*: 🌐 http://haraka.men.gov.ma

─────────────────────
📌 *أهم الشروط الخاصة بفئة التعليم الثانوي التأهيلي:*

• التباري على منصب *مدير الدراسة بالثانوية التأهيلية المحتضنة لأقسام تحضيرية لولوج المعاهد والمدارس العليا أو أقسام تحضير شهادة التقني العالي*.
• يُفتح الباب في وجه *المتصرفين التربويين* المزاولين لمهام مدير الدراسة أو ناظر، والذين قضوا *سنتين (2) على الأقل* من الخدمة بهذه الصفة في آخر منصب.
• كما يشمل المتصرفين التربويين المزاولين لمهام *حارس عام للخارجية أو حارس عام للداخلية* بالثانويات التأهيلية.

─────────────────────
📎 *تحميل المذكرة الرسمية كاملة بصيغة PDF:* https://askfne.taalim.org/r/26-067

─────────────────────
🛡️ *مواكبة نقابية:* للحصول على تفاصيل أكثر حول الملف الإداري أو الطعون، يمكنكم التواصل مع المكتب الإقليمي للجامعة الوطنية للتعليم FNE باقليمكم عبر: 🌐 https://hub.taalim.org/milaf

💬 *هل تريد/ين الاطلاع على شروط باقي الأسلاك أو فئة أخرى من هذه الحركة؟*

────────────────
📋 للرجوع للقائمة الرئيسية أرسل *0*
━━━━━━━━━━━━
💬 هل أفادك هذا الجواب؟ تفاعل بـ 👍 أو 👎
    `.trim();

    const sanitized = sanitizeWhatsAppMessage(rawMsg);

    // Verify NO decorative line characters exist
    expect(sanitized).not.toContain("─────────────────────");
    expect(sanitized).not.toContain("━━━━━━━━━━━━━━━━━━━━");
    expect(sanitized).not.toContain("────────────────");
    expect(sanitized).not.toContain("━━━━━━━━━━━━");
    expect(sanitized).not.toMatch(/[─━═—\-_]{3,}/);

    // Verify headers are intact
    expect(sanitized).toContain("📌 *أهم الشروط الخاصة بفئة التعليم الثانوي التأهيلي:*");
    expect(sanitized).toContain("📎 *تحميل المذكرة الرسمية كاملة بصيغة PDF:*");
    expect(sanitized).toContain("🛡️ *مواكبة نقابية:*");

    // Verify URLs are separated onto their own lines (not glued to Arabic text)
    expect(sanitized).toContain("https://askfne.taalim.org/r/26-067");
    expect(sanitized).toContain("https://hub.taalim.org/milaf");
  });
});
