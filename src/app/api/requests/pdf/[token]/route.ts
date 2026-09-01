import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRequestPdf } from "@/lib/requests/pdf-generator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const record = await (prisma as any).administrativeRequest.findUnique({
    where: { printToken: token },
  });

  if (!record) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const pdfBuffer = await generateRequestPdf(token);
  if (!pdfBuffer) {
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  const safeName = encodeURIComponent((record.fullName || "طلب_إداري").replace(/\s+/g, "_"));

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"; filename*=UTF-8''${safeName}.pdf`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
