import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "صياغة وطباعة المراسلات الإدارية",
  description: "خدمة صياغة وطباعة المراسلات والطلبات الإدارية الرسمية",
  robots: "noindex,nofollow",
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return children;
}
