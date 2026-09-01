import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type BaileysEventMap,
  Browsers,
} from "@whiskeysockets/baileys";
import * as qrcode from "qrcode";
import { prisma } from "@/lib/prisma";
import { chat, createNewConversation } from "@/lib/ai/engine";
import { logger } from "@/lib/logger";
import { resolveCustomer } from "@/lib/customer-resolver";
import fs from "fs";
import path from "path";
import { Boom } from "@hapi/boom";
import pino from "pino";

const AUTH_DIR = path.join(process.cwd(), ".wwebjs_auth", "baileys_auth");

interface GlobalWhatsAppState {
  sock: WASocket | null;
  currentQR: string | null;
  qrTimestamp: number;
  connectionStatus: "disconnected" | "qr_ready" | "connecting" | "connected" | "error";
  statusMessage: string;
  isStarting: boolean;
  reconnectTimeout: NodeJS.Timeout | null;
}

const g = globalThis as unknown as { __waState?: GlobalWhatsAppState };
if (!g.__waState) {
  g.__waState = {
    sock: null,
    currentQR: null,
    qrTimestamp: 0,
    connectionStatus: "disconnected",
    statusMessage: "",
    isStarting: false,
    reconnectTimeout: null,
  };
}

const waState = g.__waState;

const MESSAGE_DEDUP_TTL_MS = 2 * 60 * 1000;
const processedInboundMessages = new Map<string, number>();

const MENU_LABELS: Record<string, string> = {
  "1": "المكاتب والتنظيم",
  "2": "القانون الأساسي للجامعة",
  "3": "مقرر السنة الدراسية",
  "4": "الوظيفة العمومية",
};

const MENU_HINTS: Record<string, string> = {
  "1": "مثلا: رقم الكاتب الإقليمي تيزنيت، معلومات المكتب الجهوي سوس ماسة، معلومات نقابة SNEP...",
  "2": "مثلا: أهداف الجامعة، اختصاصات المجلس الوطني، شروط العضوية...",
  "3": "مثلا: العطلة القادمة، بداية السنة الدراسية، تواريخ الامتحانات...",
  "4": "مثلا: الرخص الصحية، شروط الترقية، رخصة الولادة، شروط التقاعد...",
};

function buildMenuText(): string {
  return [
    "السلام عليكم! مرحبا بك في المساعد الذكي للجامعة الوطنية للتعليم FNE 👋",
    "",
    "📌 *اختر أحد المواضيع التالية بإرسال رقمه:*",
    "1️⃣ 🏢 *المكاتب والتنظيم*",
    "2️⃣ 📜 *القانون الأساسي للجامعة*",
    "3️⃣ 📅 *مقرر السنة الدراسية*",
    "4️⃣ ⚖️ *الوظيفة العمومية*",
    "",
    "💬 أو اكتب سؤالك مباشرة في أي وقت!",
  ].join("\n");
}

function normalizeMenuChoice(input: string): "0" | "1" | "2" | "3" | "4" | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const westernDigits = trimmed
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
  const match = westernDigits.match(/^([01234])$/);
  const value = match?.[1];
  return value === "0" || value === "1" || value === "2" || value === "3" || value === "4" ? value : null;
}

function isMenuGreeting(input: string): boolean {
  const normalized = input.trim().toLowerCase().replace(/[!.،؟?]+$/g, "").replace(/\s+/g, " ");
  return ["hi", "hello", "hey", "bonjour", "salut", "salam", "سلام", "السلام عليكم", "السلامعليكم", "مرحبا", "أهلا", "اهلا"].includes(normalized);
}

function sanitizeWhatsAppMessage(text: string): string {
  if (!text) return "";
  let sanitized = text.replace(/\*\*(.*?)\*\*/g, "*$1*");
  sanitized = sanitized.replace(/^#+\s+(.+)$/gm, "*$1*");
  const lines = sanitized.split("\n");
  const parsedLines: string[] = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      inTable = true;
      if (/^[\s|\-]+$/.test(trimmed)) continue;
      const cells = trimmed.split("|").filter((c) => c.trim() !== "").map((c) => c.trim());
      if (cells.length >= 2 && cells[0].replace(/\*/g, "") === "العنصر") continue;
      parsedLines.push(cells.length >= 2 ? `${cells[0]}: ${cells.slice(1).join(" ")}` : cells.join(" "));
    } else {
      if (inTable) {
        parsedLines.push("");
        inTable = false;
      }
      parsedLines.push(trimmed);
    }
  }
  return parsedLines.join("\n").trim();
}

function isDuplicate(key: string): boolean {
  const now = Date.now();
  for (const [k, ts] of processedInboundMessages) {
    if (now - ts > MESSAGE_DEDUP_TTL_MS) processedInboundMessages.delete(k);
  }
  if (processedInboundMessages.has(key)) return true;
  processedInboundMessages.set(key, now);
  return false;
}

async function sendText(jid: string, text: string): Promise<void> {
  if (!waState.sock) return;
  await waState.sock.sendMessage(jid, { text });
}

async function handleIncomingMessage(jid: string, body: string, pushName?: string): Promise<void> {
  try {
    if (!jid.endsWith("@s.whatsapp.net")) return;

    const messageContent = body.trim();
    if (!messageContent) return;

    if (isDuplicate(`${jid}:${messageContent}`)) return;

    const customerName = pushName || "Unknown";
    const customerContact = jid;

    const customerId = await resolveCustomer("whatsapp", customerContact, customerName);

    let conversation = await prisma.conversation.findFirst({
      where: {
        channel: "whatsapp",
        status: { in: ["active", "escalated"] },
        OR: [{ customerId }, { customerContact }],
      },
    });

    const isNewConversation = !conversation;
    if (!conversation) {
      conversation = await createNewConversation("whatsapp", customerName, customerContact, customerId);
    }

    const freshConv = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { metadata: true },
    });
    const metadata = (freshConv?.metadata ?? {}) as Record<string, unknown>;
    const menuShown = metadata.menuShown === true;
    const awaitingMenuChoice = metadata.awaitingMenuChoice === true;
    const greeting = isMenuGreeting(messageContent);

    if (!menuShown || greeting || isNewConversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: true } },
      });
      await sendText(jid, buildMenuText());
      logger.info(`[WhatsApp/Baileys] Welcome menu sent to ${customerContact}`);
      return;
    }

    const directChoice = normalizeMenuChoice(messageContent);

    if (directChoice === "0") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: true } },
      });
      await sendText(jid, buildMenuText());
      return;
    }

    if (directChoice && ["1", "2", "3", "4"].includes(directChoice)) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...metadata,
            menuShown: true,
            awaitingMenuChoice: false,
            selectedMenuChoice: directChoice,
            selectedMenuLabel: MENU_LABELS[directChoice],
          },
        },
      });
      const choiceText = [
        `✅ اخترتي: *${MENU_LABELS[directChoice]}*`,
        "",
        `💡 ${MENU_HINTS[directChoice]}`,
        "",
        "✍️ اكتب سؤالك الآن، أو أرسل *0* للرجوع للقائمة الرئيسية 🔙",
      ].join("\n");
      await sendText(jid, choiceText);
      return;
    }

    logger.info(`[WhatsApp/Baileys] Question from ${customerName}: ${messageContent}`);
    const aiResponse = await chat(conversation.id, messageContent);
    const cleanResponse = sanitizeWhatsAppMessage(aiResponse);
    const fullReply = `${cleanResponse}\n\n────────────────\n📋 للرجوع للقائمة الرئيسية أرسل *0*`;
    await sendText(jid, fullReply);

    if (!menuShown || awaitingMenuChoice) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: false } },
      });
    }
  } catch (err) {
    logger.error("[WhatsApp/Baileys] Message handling error: " + String(err));
  }
}

async function startBaileys(retry = 0): Promise<void> {
  if (waState.reconnectTimeout) {
    clearTimeout(waState.reconnectTimeout);
    waState.reconnectTimeout = null;
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1043857760] as [number, number, number],
    isLatest: true,
  }));

  const silentLogger = pino({ level: "silent" });

  const socket = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS("Desktop"),
    logger: silentLogger,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  waState.sock = socket;

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update: BaileysEventMap["connection.update"]) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        waState.currentQR = await qrcode.toDataURL(qr);
        waState.qrTimestamp = Date.now();
        waState.connectionStatus = "qr_ready";
        waState.statusMessage = "Scan the QR code with WhatsApp on your phone";
        logger.info("[WhatsApp/Baileys] QR code ready to scan");
      } catch (err) {
        logger.error("[WhatsApp/Baileys] QR generation error: " + String(err));
      }
    }

    if (connection === "open") {
      waState.currentQR = null;
      waState.qrTimestamp = 0;
      waState.connectionStatus = "connected";
      waState.statusMessage = "Connected to WhatsApp. Agent is active!";
      waState.isStarting = false;
      logger.info("[WhatsApp/Baileys] Connected successfully!");

      try {
        await prisma.channel.upsert({
          where: { type: "whatsapp" },
          update: { isActive: true, status: "connected" },
          create: { type: "whatsapp", isActive: true, status: "connected" },
        });
      } catch (_) {}
    }

    if (connection === "close") {
      const error = lastDisconnect?.error as Boom | undefined;
      const statusCode = error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.info(
        `[WhatsApp/Baileys] Connection closed. statusCode=${statusCode}, shouldReconnect=${shouldReconnect}`
      );
      waState.connectionStatus = "disconnected";
      waState.statusMessage = "Disconnected";
      waState.sock = null;

      try {
        await prisma.channel.upsert({
          where: { type: "whatsapp" },
          update: { isActive: false, status: "disconnected" },
          create: { type: "whatsapp", isActive: false, status: "disconnected" },
        });
      } catch (_) {}

      if (shouldReconnect && retry < 10) {
        const delay = Math.min(3000 * Math.pow(1.5, retry), 30000);
        logger.info(`[WhatsApp/Baileys] Reconnecting in ${Math.round(delay)}ms (attempt ${retry + 1})`);
        waState.reconnectTimeout = setTimeout(() => {
          startBaileys(retry + 1).catch((e) =>
            logger.error("[WhatsApp/Baileys] Reconnect error: " + String(e))
          );
        }, delay);
      } else if (!shouldReconnect) {
        logger.info("[WhatsApp/Baileys] Logged out, clearing session");
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (_) {}
        waState.isStarting = false;
        waState.connectionStatus = "disconnected";
        waState.statusMessage = "Logged out. Please reconnect from the dashboard.";
      } else {
        waState.isStarting = false;
        waState.connectionStatus = "error";
        waState.statusMessage = "Failed to reconnect after multiple attempts.";
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;
    for (const msg of msgs) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid) continue;
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        "";
      const pushName = msg.pushName ?? undefined;
      if (body) {
        await handleIncomingMessage(jid, body, pushName);
      }
    }
  });
}

export function getWhatsAppStatus() {
  const qrAgeSeconds =
    waState.qrTimestamp > 0 ? Math.round((Date.now() - waState.qrTimestamp) / 1000) : 0;

  // If not started yet, kick off init
  if (waState.connectionStatus === "disconnected" && !waState.isStarting && !waState.sock) {
    startWhatsAppInit(false);
  }

  return {
    status: waState.connectionStatus,
    qr: waState.currentQR,
    qrAge: qrAgeSeconds,
    isSyncing: false,
    message: waState.statusMessage,
  };
}

export async function getWhatsAppDiagnostics() {
  return {
    hasClient: !!waState.sock,
    status: waState.connectionStatus,
    isSyncing: false,
    engine: "baileys",
  };
}

export function startWhatsAppInit(force: boolean = false): void {
  if (waState.isStarting && !force) {
    logger.info("[WhatsApp/Baileys] Start already in progress");
    return;
  }
  if (waState.connectionStatus === "connected" && !force) {
    logger.info("[WhatsApp/Baileys] Already connected");
    return;
  }
  if (force && waState.sock) {
    try {
      waState.sock.end(undefined as unknown as Error);
    } catch (_) {}
    waState.sock = null;
  }
  if (waState.reconnectTimeout) {
    clearTimeout(waState.reconnectTimeout);
    waState.reconnectTimeout = null;
  }

  waState.isStarting = true;
  waState.connectionStatus = "connecting";
  waState.statusMessage = "Initializing Baileys connection...";

  startBaileys(0).catch((err) => {
    logger.error("[WhatsApp/Baileys] Init error: " + String(err));
    waState.isStarting = false;
    waState.connectionStatus = "error";
    waState.statusMessage = "Initialization failed: " + String(err);
  });
}

export async function forceReconnect(): Promise<void> {
  startWhatsAppInit(true);
}

export async function disconnectWhatsApp(): Promise<void> {
  waState.isStarting = false;
  if (waState.reconnectTimeout) {
    clearTimeout(waState.reconnectTimeout);
    waState.reconnectTimeout = null;
  }
  if (waState.sock) {
    try {
      waState.sock.end(undefined as unknown as Error);
    } catch (_) {}
    waState.sock = null;
  }
  waState.connectionStatus = "disconnected";
  waState.statusMessage = "Disconnected";
}

export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  if (!waState.sock || waState.connectionStatus !== "connected") return false;
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  const cleanResponse = sanitizeWhatsAppMessage(message);
  await waState.sock.sendMessage(jid, { text: cleanResponse });
  return true;
}
