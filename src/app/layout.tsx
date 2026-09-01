import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { Providers } from "@/components/providers";
import { ThemeInit } from "@/components/theme-init";
import "./globals.css";

export const dynamic = "force-dynamic";

const cairo = Cairo({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "المساعد الذكي - الجامعة الوطنية للتعليم FNE",
  description: "المنصة الرقمية التفاعلية للجامعة الوطنية للتعليم FNE",
  icons: {
    icon: "/owly.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cairo.variable} h-full antialiased`}>
      <body className="h-full">
          <Providers>
            <ThemeInit />
            {children}
          </Providers>
        </body>
    </html>
  );
}
