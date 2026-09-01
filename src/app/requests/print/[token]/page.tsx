import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PrintClientToolbar } from "./PrintClient";
import { deduceRegion } from "@/lib/requests/generator";

interface PageProps {
  params: Promise<{ token: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  ta3n_admin: "طعن بخصوص النقطة الإدارية",
  ta3n_movement: "طعن في نتائج الحركة الانتقالية",
  demande_docs: "طلب وثيقة إدارية",
  taklif: "طلب تكليف",
  libre: "طلب إداري",
};

/** Clean body text without duplicated headers, salutations, or closing */
function resolveCleanBody(req: any, dateFormatted: string): string {
  const extra = (req.extraData as Record<string, string>) || {};
  if (extra.bodyText) {
    let t = extra.bodyText;
    t = t.replace(/وتقبلوا فائق التقدير والاحترام\.?\s*والسلام/g, "").trim();
    if (t.length >= 15) return t;
  }

  const subject = extra.subject || req.subject || "";

  switch (req.type) {
    case "ta3n_admin": {
      const details = subject || "نقطة المدير: 18، نقطة المفتش: 16، نقطة المدير الإقليمي: 18";
      return [
        `يشرفني أن أتقدم إليكم بهذا الطعن بخصوص النقطة الإدارية الممنوحة لي برسم الموسم الدراسي، والتي بلغت (${details})، حيث أعتبرها غير منصفة ولا تعكس مردودي المهني الحقيقي داخل المؤسسة.`,
        "",
        "وأود أن أوضح لكم أنني أؤدي مهامي التربوية والإدارية بانتظام وانضباط، وألتزم بواجباتي المهنية من مواظبة، واحترام للزمن المدرسي، والمشاركة في الأنشطة التربوية، والتعاون الإيجابي مع الإدارة وهيئة التدريس.",
        "",
        "وعليه، ألتمس منكم إعادة النظر في النقطة الإدارية الممنوحة لي، وإنصافي وفق ما تنص عليه المذكرات والتنظيمات الجاري بها العمل.",
      ].join("\n");
    }

    case "ta3n_movement":
      return [
        `يشرفني أن أرفع إلى سيادتكم هذا الطعن بخصوص نتائج الحركة الانتقالية، نظراً للحيثيات التالية: (${subject || "عدم مراعاة الاستحقاق والرغبات المعبر عنها"})، ملتمساً منكم التفضل بإعادة دراسة ملفي وإنصافي وفق الضوابط المعمول بها.`,
      ].join("\n");

    case "demande_docs":
      return `يشرفني أن أتقدم إليكم بهذا الطلب، راجياً منكم التفضل بتسليمي الوثيقة الإدارية : "${subject || "شهادة العمل"}"، وذلك للإدلاء بها لأغراض إدارية.`;

    case "taklif": {
      const reasons = extra.reasons || "دواعي اجتماعية وعائلية والتقارب الأسري، وتسهيل التنقل والاستقرار المهني لضمان مردودية تربوية أفضل.";
      const institutions = subject || "المؤسسات التعليمية الشاغرة بالمديرية";
      return [
        "يشرفني أن ألتمس منكم، بكل احترام، التفضل بالموافقة على منحي تكليفاً بمهام التدريس بإحدى المؤسسات التعليمية بمديريتكم برسم الموسم الدراسي الحالي.",
        "",
        `وأحيطكم علماً بالدوافع والأسباب الداعية لتقديم هذا الطلب والمتمثلة في "${reasons}"، وتجدون أسفله المؤسسات المرغوبة بالترتيب:`,
        "",
        institutions,
        "",
        "وفي انتظار تفضلكم بدراسة طلبي والموافقة عليه وفق ما تقتضيه المصلحة التربوية وضوابط تدبير الفائض والخصاص، تقبلوا فائق عبارات التقدير والاحترام.",
      ].join("\n");
    }

    case "libre":
    default:
      if (req.generatedText) {
        let extracted = req.generatedText;
        const salutationIdx = extracted.search(/وبعد[،:\s]/);
        if (salutationIdx !== -1) {
          extracted = extracted.substring(salutationIdx).replace(/^وبعد[،:\s]*/, "").trim();
        }
        extracted = extracted.replace(/وتقبلوا فائق التقدير والاحترام\.?\s*والسلام[\s\S]*$/i, "").trim();
        extracted = extracted.replace(/الإمضاء[:\s]*[\s\S]*$/i, "").trim();
        extracted = extracted.replace(/إمضاء[:\s]*[\s\S]*$/i, "").trim();
        if (!extracted.includes("الظهير الشريف") && extracted.length >= 20) {
          return extracted;
        }
      }

      return `يشرفني بكل احترام وتقدير أن أتوجه إلى عنايتكم الكريمة بهذا الطلب بخصوص: (${subject || "الموضوع المشار إليه أعلاه"})، راجياً منكم التفضل بالاطلاع عليه واتخاذ ما ترونه مناسباً لإنصافي.`;
  }
}

export default async function PrintPage({ params }: PageProps) {
  const { token } = await params;

  if (!token) {
    notFound();
  }

  const req = await (prisma as any).administrativeRequest.findUnique({
    where: { printToken: token },
  });

  if (!req) {
    notFound();
  }

  const extra = (req.extraData as Record<string, string>) || {};
  const fullName = extra.fullName || req.fullName || "";
  const grade = extra.grade || req.grade || "";
  const school = extra.school || req.school || "المؤسسة";
  const province = extra.province || req.province || "المديرية الإقليمية";
  const ppr = extra.ppr && extra.ppr !== "0" ? extra.ppr : null;
  const recipientLevel = extra.recipientLevel || req.recipientLevel || "province";
  const region = extra.region || deduceRegion(province);

  const createdAt = new Date(req.createdAt);
  const dateFormatted = createdAt.toLocaleDateString("ar-MA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const typeLabel = TYPE_LABELS[req.type] || req.type;
  const cleanBody = resolveCleanBody(req, dateFormatted);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Cairo', 'Traditional Arabic', Arial, sans-serif;
          background: #f4f7fb;
          direction: rtl;
          color: #1a1a1a;
        }

        .no-print { display: block; }

        /* Strict single-page A4 print rule */
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 15mm;
          }
          html, body {
            height: auto !important;
            min-height: auto !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
          }
          .no-print { display: none !important; }
          .page-wrapper { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .document {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
            max-height: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }

        .page-wrapper {
          max-width: 840px;
          margin: 0 auto;
          padding: 16px 12px;
        }

        /* Modern action toolbar */
        .toolbar {
          background: #1e293b;
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        .toolbar-brand {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
        }
        .toolbar-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .btn-print {
          background: #16a34a;
          color: white;
          border: none;
          padding: 9px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
          font-family: inherit;
        }
        .btn-print:hover { background: #15803d; }
        .btn-download-pdf {
          background: #2563eb;
          color: white;
          text-decoration: none;
          padding: 9px 18px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
          font-family: inherit;
        }
        .btn-download-pdf:hover { background: #1d4ed8; }

        /* The Document Paper — Compact, elegant single-page fit */
        .document {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.04);
          padding: 36px 48px;
          min-height: 250mm;
          line-height: 2.0;
          font-size: 15.5px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .doc-content {
          flex: 1;
        }

        /* Top date line */
        .doc-date {
          text-align: left;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 20px;
          font-size: 15px;
        }

        /* Header Grid: Sender (Right) & Recipient (Left/Center) */
        .header-grid {
          display: grid;
          grid-template-columns: 1.05fr 1.35fr;
          gap: 16px;
          align-items: start;
          margin-bottom: 24px;
        }
        .sender-info {
          text-align: right;
          line-height: 1.9;
        }
        .sender-info div { margin-bottom: 3px; }
        .sender-info strong { color: #0f172a; }

        .recipient-info {
          text-align: center;
          line-height: 1.75;
          padding-top: 4px;
        }
        .recipient-title {
          font-weight: 800;
          color: #0f172a;
          font-size: 15.5px;
          margin: 3px 0;
        }
        .recipient-step {
          font-size: 14.5px;
          color: #1e293b;
          margin-top: 2px;
        }
        .recipient-via {
          color: #334155;
          font-size: 14.5px;
          margin-top: 3px;
        }

        /* Subject banner */
        .subject-box {
          margin: 18px 0 22px;
          text-align: right;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .subject-label {
          background: #e8f5e9;
          color: #0b3d0b;
          font-weight: 800;
          padding: 5px 14px;
          border-radius: 6px;
          font-size: 14.5px;
        }
        .subject-text {
          font-weight: 800;
          color: #0f172a;
          font-size: 16px;
        }

        /* Salutation */
        .salutation {
          text-align: center;
          font-weight: 700;
          margin: 16px 0;
          color: #1e293b;
          font-size: 15.5px;
          line-height: 1.8;
        }

        /* Body text */
        .body-text {
          white-space: pre-wrap;
          word-break: break-word;
          text-align: justify;
          text-justify: inter-word;
          margin: 18px 0;
          line-height: 2.05;
          color: #1e293b;
          font-size: 15.5px;
          text-indent: 2em;
        }

        /* Centered Closing Salutation */
        .closing-salutation {
          text-align: center;
          font-weight: 700;
          margin: 24px 0 16px;
          color: #0f172a;
          font-size: 15.5px;
        }

        /* Signature block: perfectly balanced */
        .signature-box {
          margin-top: 24px;
          margin-bottom: 4px;
          text-align: left;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .signature-inner {
          display: inline-block;
          min-width: 200px;
          text-align: center;
        }
        .signature-inner strong {
          display: block;
          font-size: 15px;
          margin-bottom: 14px;
          color: #0f172a;
        }
        .signature-name {
          font-weight: 800;
          font-size: 16.5px;
          color: #0f172a;
        }
      `}</style>

      <div className="page-wrapper">
        <PrintClientToolbar token={token} />

        {/* The Printable Official Document */}
        <div className="document">
          <div className="doc-content">
            {/* Top date on left */}
            <div className="doc-date">
              {province} في: {dateFormatted}
            </div>

            {/* Sender (Right) & Recipient (Center/Left) */}
            <div className="header-grid">
              {/* Sender info */}
              <div className="sender-info">
                <div><strong>الاسم والنسب:</strong> {fullName}</div>
                {ppr && <div><strong>رقم التأجير:</strong> {ppr}</div>}
                <div><strong>الإطار:</strong> {grade}</div>
                <div><strong>المؤسسة:</strong> {school}</div>
                <div><strong>المديرية الإقليمية:</strong> {province}</div>
              </div>

              {/* Recipient Hierarchy */}
              <div className="recipient-info">
                {recipientLevel === "ministere" ? (
                  <>
                    <div>إلى السيد:</div>
                    <div className="recipient-title">وزير التربية الوطنية والتعليم الأولي والرياضة</div>
                    <div className="recipient-step">تحت إشراف السيد: مدير الأكاديمية الجهوية للتربية والتكوين - جهة {region}</div>
                    <div className="recipient-step">تحت إشراف السيد: المدير الإقليمي للأكاديمية الجهوية للتربية والتكوين جهة {region} - مديرية {province}</div>
                    <div className="recipient-via">على يد السيد(ة) مدير(ة) {school}</div>
                  </>
                ) : recipientLevel === "academie" ? (
                  <>
                    <div>إلى السيد:</div>
                    <div className="recipient-title">مدير الأكاديمية الجهوية للتربية والتكوين - جهة {region}</div>
                    <div className="recipient-step">تحت إشراف السيد: المدير الإقليمي للأكاديمية الجهوية للتربية والتكوين لمديرية {province}</div>
                    <div className="recipient-via">على يد السيد(ة) مدير(ة) {school}</div>
                  </>
                ) : (
                  <>
                    <div>إلى السيد(ة):</div>
                    <div className="recipient-title">المدير(ة) الإقليمي(ة) لوزارة التربية الوطنية والتعليم الأولي والرياضة بـ{province}</div>
                    <div className="recipient-via">على يد السيد(ة) مدير(ة) {school}</div>
                  </>
                )}
              </div>
            </div>

            {/* Subject banner */}
            <div className="subject-box">
              <span className="subject-label">الموضوع:</span>
              <span className="subject-text">
                {typeLabel}
              </span>
            </div>

            {/* Salutation */}
            <div className="salutation">
              سلام تام بوجود مولانا الإمام المؤيد بالله،
              <br />
              وبعد،
            </div>

            {/* Clean Concise Body */}
            <div className="body-text">
              {cleanBody}
            </div>

            {/* Centered Closing Salutation */}
            <div className="closing-salutation">
              وتقبلوا فائق التقدير والاحترام. والسلام
            </div>
          </div>

          {/* Signature block at bottom-left in bold */}
          <div className="signature-box">
            <div className="signature-inner">
              <strong>الإمضاء:</strong>
              <div className="signature-name">{fullName}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
