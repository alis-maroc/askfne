import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import {
  getWhatsAppStatus,
  startWhatsAppInit,
  disconnectWhatsApp,
  getWhatsAppDiagnostics,
} from "@/lib/channels/whatsapp";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shareToken = searchParams.get("share");
  const isShareRequest = Boolean(shareToken) && shareToken === process.env.WHATSAPP_SHARE_TOKEN;
  if (shareToken && !isShareRequest) {
    return NextResponse.json({ error: "Invalid share link" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (searchParams.get("diag") === "1") {
    const diag = await getWhatsAppDiagnostics();
    return NextResponse.json(diag, { headers: { "Cache-Control": "no-store" } });
  }
  const status = getWhatsAppStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request, "channels:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { isActive, config, status } = body;

    const channel = await prisma.channel.upsert({
      where: { type: "whatsapp" },
      update: {
        isActive: typeof isActive === "boolean" ? isActive : undefined,
        config: config ?? undefined,
        status: status ?? (config?.mode === "api" ? "connected" : undefined),
      },
      create: {
        type: "whatsapp",
        isActive: typeof isActive === "boolean" ? isActive : false,
        config: config ?? {},
        status: status ?? (config?.mode === "api" ? "connected" : "disconnected"),
      },
    });

    return NextResponse.json(channel);
  } catch (error) {
    logger.error("Failed to update WhatsApp channel:", error);
    return NextResponse.json(
      { error: "Failed to update WhatsApp channel" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action, force } = body;

  if (action === "connect" || action === "reconnect") {
    startWhatsAppInit(Boolean(force || action === "reconnect"));
    const status = getWhatsAppStatus();
    return NextResponse.json(status);
  }

  if (action === "disconnect") {
    await disconnectWhatsApp();
    return NextResponse.json({ status: "disconnected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
