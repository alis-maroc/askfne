import type { Metadata } from "next";
import { Cairo } from "next/font/google";

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "المساعد الذكي للجامعة الوطنية للتعليم FNE",
  description: "المساعد الذكي للجامعة الوطنية للتعليم FNE",
  openGraph: {
    title: "المساعد الذكي للجامعة الوطنية للتعليم FNE",
    description: "المساعد الذكي للجامعة الوطنية للتعليم FNE",
    url: "https://hub.taalim.org/askfne",
    siteName: "الجامعة الوطنية للتعليم FNE",
    type: "website",
    images: [
      {
        url: "https://flowise.taalim.org/fne-wa-thumb.jpg",
        width: 1200,
        height: 630,
        alt: "المساعد الذكي للجامعة الوطنية للتعليم FNE",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "المساعد الذكي للجامعة الوطنية للتعليم FNE",
    description: "المساعد الذكي للجامعة الوطنية للتعليم FNE",
    images: ["https://flowise.taalim.org/fne-wa-thumb.jpg"],
  },
};

export default function WebChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <head>
        <meta property="og:title" content="المساعد الذكي للجامعة الوطنية للتعليم FNE" />
        <meta property="og:description" content="المساعد الذكي للجامعة الوطنية للتعليم FNE" />
        <meta property="og:url" content="https://hub.taalim.org/askfne" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="الجامعة الوطنية للتعليم FNE" />
        <meta property="og:image" content="https://flowise.taalim.org/fne-wa-thumb.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="المساعد الذكي للجامعة الوطنية للتعليم FNE" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="المساعد الذكي للجامعة الوطنية للتعليم FNE" />
        <meta name="twitter:description" content="المساعد الذكي للجامعة الوطنية للتعليم FNE" />
        <meta name="twitter:image" content="https://flowise.taalim.org/fne-wa-thumb.jpg" />
      </head>
      <div className={cairo.className}>{children}</div>
    </>
  );
}
