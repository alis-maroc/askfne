import { NextRequest, NextResponse, after } from "next/server";
import { handleTelegramUpdate } from "@/lib/channels/telegram";
import { setupTelegramWebhook } from "@/lib/channels/telegram";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

export async function GET() {
  return NextResponse.json({
    service: "telegram-webhook",
    message: "Webhook Telegram actif. Cette URL reçoit les mises à jour en POST.",
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "setup") {
    const auth = await requireAuth(request, "channels:update");
    if (!isAuthenticated(auth)) return auth;
    const settings = await prisma.settings.findFirst();
    const token = settings?.telegramBotToken || String(body.token || "");
    if (!token) return NextResponse.json({ error: "Telegram bot token is required." }, { status: 400 });
    const configuredUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
    const webhookUrl =
      configuredUrl ||
      process.env.TELEGRAM_WEBHOOK_URL ||
      `${process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/api/channels/telegram`;
    const result = await setupTelegramWebhook(token, webhookUrl);
    await prisma.channel.upsert({
      where: { type: "telegram" },
      update: { isActive: result.ok, status: result.ok ? "connected" : "error", config: { webhookUrl } },
      create: { type: "telegram", isActive: result.ok, status: result.ok ? "connected" : "error", config: { webhookUrl } },
    });
    return NextResponse.json(
      { ...result, webhookUrl, status: result.ok ? "connected" : "error", tokenConfigured: true },
      { status: result.ok ? 200 : 502 }
    );
  }

  // Acknowledge Telegram immediately so the webhook is not disabled on slow AI replies.
  after(async () => {
    try {
      await handleTelegramUpdate(body);
    } catch (error) {
      logger.error("[Telegram] Webhook processing error:", error);
    }
  });
  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request, "channels:update");
  if (!isAuthenticated(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const config = body.config && typeof body.config === "object" ? body.config : {};
  const token = String(config.token || body.token || "").trim();
  const { token: _token, botToken: _botToken, ...safeConfig } = config as Record<string, unknown>;
  const channelConfig = JSON.parse(JSON.stringify(safeConfig));

  const existing = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: token ? { telegramBotToken: token } : {},
    create: { id: "default", telegramBotToken: token },
  });
  const storedToken = token || existing?.telegramBotToken || settings.telegramBotToken || "";

  const channel = await prisma.channel.upsert({
    where: { type: "telegram" },
    update: {
      isActive: Boolean(body.isActive),
      status: body.isActive ? "configured" : "disconnected",
      config: channelConfig,
    },
    create: {
      type: "telegram",
      isActive: Boolean(body.isActive),
      status: body.isActive ? "configured" : "disconnected",
      config: channelConfig,
    },
  });
  return NextResponse.json({ ...channel, tokenConfigured: Boolean(storedToken) });
}
