"use client";

interface PrintClientToolbarProps {
  token: string;
}

export function PrintClientToolbar({ token }: PrintClientToolbarProps) {
  return (
    <div className="toolbar no-print">
      <div className="toolbar-brand">
        📄 صياغة المراسلات والطلبات الإدارية
      </div>
      <div className="toolbar-actions">
        <a
          href={`/api/requests/pdf/${token}`}
          download
          className="btn-download-pdf"
        >
          📥 تنزيل PDF مباشرة
        </a>
        <button className="btn-print" onClick={() => window.print()}>
          🖨️ طباعة
        </button>
      </div>
    </div>
  );
}
