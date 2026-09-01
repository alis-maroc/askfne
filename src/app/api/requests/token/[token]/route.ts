import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const req = await (prisma as any).administrativeRequest.findUnique({
      where: { printToken: token },
    });

    if (!req) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Update status to printed if still generated
    if (req.status === "generated") {
      await (prisma as any).administrativeRequest.update({
        where: { printToken: token },
        data: { status: "printed" },
      });
    }

    return NextResponse.json(req);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
