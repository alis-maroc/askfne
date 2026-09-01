import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const channel = await prisma.channel.findFirst({
      where: { type: "whatsapp" },
      select: { config: true },
    });

    const cfg = (channel?.config || {}) as Record<string, string>;

    // Priority: channel config phoneNumber > channel config phoneNumberId > fallback
    let waNumber = (cfg.phoneNumber || cfg.phoneNumberId || "212669305883")
      .replace(/[^0-9]/g, "");

    if (!waNumber || waNumber.length < 9) {
      waNumber = "212669305883";
    }

    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent("تحية نضالية")}`;
    return NextResponse.redirect(waUrl, { status: 307 });
  } catch (error) {
    return NextResponse.redirect("https://wa.me/212669305883?text=%D8%AA%D8%AD%D9%8A%D8%A9+%D9%86%D8%B6%D8%A7%D9%84%D9%8A%D8%A9", { status: 307 });
  }
}
