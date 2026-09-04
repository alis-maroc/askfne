import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type BaileysEventMap,
  Browsers,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import * as qrcode from "qrcode";
import { prisma } from "@/lib/prisma";
import { chat, checkKeywordTriggers, createNewConversation } from "@/lib/ai/engine";
import { transcribeAudioBuffer } from "@/lib/ai/speech";
import { isLegitimateKnowledgeQuestion } from "@/lib/ai/refusal-detector";
import { logger } from "@/lib/logger";
import { resolveCustomer } from "@/lib/customer-resolver";
import { getOrCreateShortLink } from "@/lib/short-links";
import {
  FORUM_TAG,
  FORUM_TAG_SLUG,
  BAYAN_OPTED_OUT_TAG,
  BAYAN_OPTED_OUT_SLUG,
  subscribeCustomerToForum,
  unsubscribeCustomerFromForum,
  getActiveForumTopic,
  submitForumPost,
} from "@/lib/forum/forum-service";
import { getCategoryArticles, getArticleById, cleanArticleBodyForChat, GUIDED_CATEGORY_QUESTIONS, MENU_CATEGORIES } from "./dynamic-menu";
import { recordGroupMessageWatch } from "./whatsapp-group-watch";
import {
  buildRootMenu,
  buildNationalMenu,
  buildRegionsMenu,
  buildProvincesMenu,
  buildParallelBranchesMenu,
  formatMenuText,
  formatOfficeContacts,
  getHubMenuState,
  setHubMenuState,
  clearHubMenuState,
  restoreHubMenuState,
  goBackHubMenu,
  parseSelection,
  HUB_MENU_META_KEY,
  type HubMenuItem,
  type HubMenuState,
} from "./hub-menu";
import {
  fetchRootOffices,
  fetchHubOffices,
  fetchOfficesByParentId,
  fetchParallelOrganizations,
  fetchParallelBranches,
  type HubOffice as HubOfficeType,
} from "@/lib/hub-offices";
import { cleanOfficeName } from "./hub-menu";
import {
  WIZARD_META_KEY,
  getRequestMenuText,
  parseTypeChoice,
  getCurrentQuestion,
  processAnswer,
  isComplete,
  buildDataSummary,
  detectRequestIntent,
  serializeWizardState,
  type WizardState,
} from "@/lib/requests/wizard";
import {
  PROMO_CALC_META_KEY,
  serializePromoCalcState,
  getPromoQuestion,
  processPromoAnswer,
  formatPromoSummary,
  type PromotionCalcState,
} from "@/lib/requests/promotion-calc";
import { generateAdminRequest, buildDeliveryMessage } from "@/lib/requests/generator";
import { generateRequestPdf } from "@/lib/requests/pdf-generator";
import { REQUEST_TYPES } from "@/lib/requests/types";
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
  isManuallyStopping: boolean;
  reconnectTimeout: NodeJS.Timeout | null;
  /** Track JIDs where logo has already been sent (persisted via Prisma conversation metadata) */
  logoSentTo: Set<string>;
  lastConnectedAt: number;
  lastDisconnectedAt: number;
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
    isManuallyStopping: false,
    reconnectTimeout: null,
    logoSentTo: new Set<string>(),
    lastConnectedAt: 0,
    lastDisconnectedAt: 0,
  };
}

const waState = g.__waState;

const MESSAGE_DEDUP_TTL_MS = 2 * 60 * 1000;
const processedInboundMessages = new Map<string, number>();

interface InboundQueueItem {
  jid: string;
  body: string;
  pushName?: string;
  messageId?: string;
  wasVoice: boolean;
  timestamp: number;
}

const inboundDebounceMap = new Map<
  string,
  {
    timer: NodeJS.Timeout;
    items: InboundQueueItem[];
  }
>();

/**
 * Send a one-off alert to the admin's Telegram chat when WhatsApp disconnects.
 * Uses the adminTelegramChatId from Settings table. Silent no-op if not set.
 */
async function alertAdminOnDisconnect(message: string): Promise<void> {
  try {
    const settings = (await prisma.settings.findFirst()) as {
      telegramBotToken?: string | null;
      adminTelegramChatId?: string | null;
    } | null;
    if (!settings?.telegramBotToken || !settings?.adminTelegramChatId) {
      logger.info("[WhatsApp/Baileys] Admin Telegram not configured — skipping disconnect alert");
      return;
    }
    const chatId = Number(settings.adminTelegramChatId);
    if (!Number.isFinite(chatId)) return;
    const text = [
      "⚠️ *تنبيه: FNE Bot WhatsApp*",
      "━━━━━━━━━━━━━━━━━━━━",
      message,
      "",
      `⏰ الوقت: ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" })}`,
    ].join("\n");
    const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
    if (data.ok) {
      logger.info(`[WhatsApp/Baileys] Disconnect alert sent to admin (chat ${chatId})`);
    } else {
      logger.warn("[WhatsApp/Baileys] Disconnect alert failed:", { response: JSON.stringify(data) });
    }
  } catch (err) {
    logger.warn("[WhatsApp/Baileys] alertAdminOnDisconnect error:", { error: String(err) });
  }
}

const MENU_LABELS: Record<string, string> = {
  "1": "المكاتب والتنظيم النقابي",
  "2": "القانون الأساسي للجامعة",
  "3": "مقرر السنة الدراسية والعطل",
  "4": "النظام الأساسي والوظيفة العمومية",
  "5": "الدخول المدرسي والحركة الانتقالية",
  "6": "آخر البيانات والمستجدات",
  "7": "الانخراط والخدمات الرقمية (Hub)",
  "8": "توليد الطلبات والمراسلات الإدارية",
  "9": "حساب وتدقيق نقط الترقية",
};

const WHATSAPP_CATEGORY_INFO: Record<string, { title: string; samples: string[] }> = {
  "1": {
    title: "🏢 *المكاتب والتنظيم النقابي للجامعة FNE*",
    samples: [
      "• للاطلاع على اللائحة الرسمية المباشرة والمحدثة للمسؤولين والمكاتب الجهوية والإقليمية والمحلية وأرقام هواتفهم:",
      "🔗 *https://hub.taalim.org/responsables-fne.php*",
      "",
      "💡 *توجيه:* يمكنك أيضاً البحث مباشرة هنا بكتابة اسم الإقليم أو المدينة (مثلاً: 'تيزنيت'، 'الدريوش'، 'طنجة'...) وسأعطيك معلومات الكاتب الإقليمي فوراً.",
    ],
  },
  "2": {
    title: "📜 *القانون الأساسي للجامعة FNE*",
    samples: [
      "• أهداف ومبادئ الجامعة التقريرية والتنفيذية",
      "• اختصاصات المجلس الوطني، المكتب الوطني والمؤتمر",
      "• مقتضيات الفصل 15 وشروط الانخراط والعضوية",
    ],
  },
  "3": {
    title: "📅 *مقرر السنة الدراسية والعطل*",
    samples: [
      "• موعد العطلة المدرسية القادمة وفترات توقف الدراسة",
      "• تواريخ الامتحانات الإشهادية (الباكالوريا، الإعدادي، الابتدائي)",
      "• تواريخ توقيع محاضر الدخول والخروج وفترات المراقبة المستمرة",
    ],
  },
  "4": {
    title: "⚖️ *النظام الأساسي والوظيفة العمومية*",
    samples: [
      "• الرخص الصحية، رخصة الولادة والرخص الإدارية",
      "• شروط الترقية في الرتبة والدرجة والامتحانات المهنية",
      "• العقوبات التأديبية والوضعيات الإدارية (الإلحاق والاستيداع)",
      "• شروط التقاعد النسبي وحد سن الإحالة على التقاعد",
    ],
  },
  "5": {
    title: "🎒 *الدخول المدرسي والحركة الانتقالية*",
    samples: [
      "• معايير وتدبير الفائض والخصاص وتوزيع الحصص",
      "• شروط الحركة الانتقالية الوطنية والجهوية والإقليمية",
      "• استئناف العمل والتكليفات الإدارية والتربوية",
    ],
  },
};

function buildGuidedQuestionsText(category: string): string {
  const info = WHATSAPP_CATEGORY_INFO[category];
  const questions = GUIDED_CATEGORY_QUESTIONS[category] || [];
  return [
    info?.title || "📌 أسئلة مقترحة",
    "هذه أسئلة مقترحة، ويمكنك أيضاً كتابة سؤالك الخاص مباشرة:",
    ...questions.map((question, index) => `${index + 1}️⃣ ${question}`),
    "0️⃣ للقائمة الرئيسية",
  ].join("\n");
}

export const HUB_SERVICES_TEXT = [
  "🤝 *الانخراط والخدمات الرقمية - منصة التدبير الرقمي FNE*",
  "━━━━━━━━━━━━━━━━━━━━",
  "تضع الجامعة الوطنية للتعليم FNE رهن إشارتكم منصة رقمية متكاملة لتقديم الخدمات النقابية والإدارية المباشرة:",
  "",
  "1️⃣ *الانخراط في النقابة وتجديد العضوية:*",
  "تقديم طلب الانخراط أو تجديد بطاقتك النقابية إلكترونياً وبكل سهولة:",
  "🔗 https://hub.taalim.org/adherer",
  "",
  "2️⃣ *حساب وتدقيق نقط الترقية:*",
  "تطبيق ذكي لضبط نقط الترقية وتتبع مسارك المهني بدقة:",
  "🔗 https://hub.taalim.org/calc_promotion_points.php",
  "",
  "3️⃣ *توليد الطلبات والمراسلات الإدارية:*",
  "إنشاء وتوليد مختلف الطلبات الإدارية والمراسلات بصيغة قانونية جاهزة للطباعة:",
  "🔗 https://hub.taalim.org/generate_request.php",
  "",
  "4️⃣ *الملف النقابي والتبليغ عن الخروقات:*",
  "إيداع المشكلات والملفات النقابية للترافع حولها من طرف مسؤولي الجامعة:",
  "🔗 https://hub.taalim.org/milaf",
  "🔗 https://hub.taalim.org/participation_form.php",
  "",
  "5️⃣ *الخريطة المدرسية والتخطيط التربوي:*",
  "🔗 https://hub.taalim.org/carte_scolaire.php",
  "",
  "💬 يمكنك أيضاً كتابة أي سؤال أو طلب التواصل مع مكتبك الإقليمي مباشرة!",
  "📋 للرجوع للقائمة الرئيسية أرسل *0*",
].join("\n");

export const PROMOTION_CALC_IN_PREP_TEXT = [
  "🧮 *خدمة حساب وتدقيق نقط الترقية*",
  "",
  "⏳ *هذه الخدمة التفاعلية في طور الإعداد والبرمجة داخل الشات حالياً.*",
  "",
  "💡 يمكنك في الوقت الراهن استخدام أداة الحساب الرسمية المتاحة عبر المنصة الرقمية:",
  "🔗 https://hub.taalim.org/calc_promotion_points.php",
  "",
  "📋 للرجوع للقائمة الرئيسية أرسل *0*",
].join("\n");

export const DISCLAIMER_TEXT = [
  "⚖️ *توجيه تنظيمي وإخلاء مسؤولية*",
  "",
  "يندرج هذا *المساعد الرقمي التفاعلي* ضمن المبادرات والخدمات الرقمية الحديثة التي تضعها الجامعة الوطنية للتعليم FNE رهن إشارة نساء ورجال التعليم، بهدف *تيسير الولوج السريع للمعلومة وتقديم التوجيه النقابي والإداري الأولي*.",
  "",
  "وحرصاً على الدقة والانضباط المسطري، يُرجى الانتباه إلى المبادئ التالية:",
  "",
  "1. *طبيعة الخدمة التوجيهية*: صُممت هذه المنصة لتقديم معطيات إرشادية وتوجيهية عامة للاستئناس، ولا تُغني عن استشارة النصوص التشريعية والتنظيمية الجاري بها العمل.",
  "",
  "2. *حجية النصوص والمقررات*: تظل النصوص القانونية الصادرة في الجريدة الرسمية، والبلاغات والبيانات والمذكرات الصادرة عن الأجهزة التقريرية والتنفيذية للجامعة، هي المرجع المعتمد والملزم نقابياً وإدارياً.",
  "",
  "3. *حدود المسؤولية*: لا تترتب على الجامعة الوطنية للتعليم FNE أي مسؤولية قانونية أو إدارية بخصوص أي إجراء أو قرار يُتخذ بناءً على توجيهات أولية دون الرجوع إلى النصوص الأصلية أو استشارة الهياكل المختصة.",
  "",
  "4. *المواكبة النقابية المباشرة*: في الملفات الفردية الدقيقة أو النزاعات الإدارية المعقدة، ندعو الرفيقات والرفاق دوماً إلى:",
  "• مراجعة المنشورات والوثائق الرسمية الصادرة عن الجامعة.",
  "• التواصل المباشر مع مكاتب الجامعة (المحلية، الإقليمية، الجهوية، أو الوطنية).",
  "• طلب فتح تذكرة عبر هذا الشات لإحالة الملف على المسؤول النقابي المختص.",
  "",
  "💡 *تجربة أكثر سلاسة:* لتجربة تفاعلية سريعة ومتقدمة بأزرار مرنة، يمكنكم أيضاً استخدام المساعد عبر تيليغرام: https://t.me/askfne_bot",
  "",
  "📋 للرجوع للقائمة الرئيسية أرسل *0*",
].join("\n");

function buildMenuText(): string {
  return [
    "مرحباً بك الرفيق/ة في المساعد الرقمي للجامعة الوطنية للتعليم FNE 👋",
    "💬 *اكتب سؤالك وسأجيبك فوراً!*",
    "📌 *أو اختر أحد المواضيع بإرسال رقمه:*",
    "1️⃣ 🏢 *المكاتب والتنظيم النقابي*",
    "2️⃣ 📜 *القانون الأساسي للجامعة*",
    "3️⃣ 📅 *السنة الدراسية والعطل*",
    "4️⃣ ⚖️ *النظام الأساسي*",
    "5️⃣ 🎒 *الدخول المدرسي*",
    "6️⃣ 📢 *آخر البيانات والمستجدات*",
    "7️⃣ 🤝 *الخدمات الرقمية (Hub)*",
    "8️⃣ 📄 *المراسلات الإدارية (PDF)*",
    "9️⃣ 🧮 *حساب نقط الترقية*",
    "📨 لإرسال ملاحظة اكتب *اقتراح*",
    "⚖️ لقراءة توجيه تنظيمي اكتب *ميثاق*",
  ].join("\n");
}

function normalizeDigitCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const westernDigits = trimmed
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
  const match = westernDigits.match(/^([0-9])$/);
  return match ? match[1] : null;
}

async function buildCategoryPageText(choice: string, page = 1): Promise<{ text: string; articleIds: string[]; currentPage: number; totalPages: number }> {
  const data = await getCategoryArticles(choice, page, 5);

  const lines: string[] = [
    `📌 *${data.icon} ${data.label}*`,
    `📄 صفحة ${data.currentPage} من ${data.totalPages}`,
  ];

  if (data.articles.length === 0) {
    lines.push("");
    lines.push("لا توجد مقالات مضافة حالياً في هذا القسم.");
  } else {
    data.articles.forEach((art, idx) => {
      // Each article: one title per line with elegant formatting
      const articleNumber = idx + 1;
      lines.push("");
      lines.push(`*${articleNumber}️⃣  ${art.shortTitle}*`);
    });
  }

  lines.push("");
  // Navigation row: all controls on ONE single line, well-spaced.
  // Reply with the article number to read it, 6 for next, 7 for previous, 0 for main menu.
  const navParts: string[] = [];
  if (data.articles.length > 0) {
    navParts.push(`📖 *1–${data.articles.length}* قراءة`);
  }
  if (data.currentPage < data.totalPages) {
    navParts.push("➡️ *6* التالي");
  }
  if (data.currentPage > 1) {
    navParts.push("⬅️ *7* السابق");
  }
  navParts.push("🔙 *0* القائمة");
  lines.push(navParts.join("   •   "));
  lines.push("💬 أو اكتب سؤالك في أي وقت!");

  return {
    text: lines.join("\n"),
    articleIds: data.articles.map((a) => a.id),
    currentPage: data.currentPage,
    totalPages: data.totalPages,
  };
}


/**
 * Handle Hub Office hierarchy menu (choice 1).
 * Returns true if the user input was handled by the hub menu system.
 * Routes the user through the 4-level hierarchy:
 *   1. Root: Leadership / Regional / Search
 *   2. National+Parallel / Regions
 *   3. Provinces / Parallel branches
 *   4. Local offices
 */
async function handleHubMenuCommand(
  jid: string,
  conversationId: string,
  messageContent: string,
  metadata: Record<string, unknown>,
  isInHubMenu: boolean
): Promise<boolean> {
  // We only intercept hub-menu inputs when the user is already in the hub menu
  // or when they explicitly selected "1" from the main menu (handled separately).
  if (!isInHubMenu) return false;

  const convId = conversationId;
  const currentState = getHubMenuState(convId);

  // If "رجوع" or "0" -> go back to root menu
  const trimmed = messageContent.trim();
  const isBack = trimmed === "0" || trimmed === "رجوع" || /^back$/i.test(trimmed);
  if (isBack && currentState?.backState) {
    setHubMenuState(convId, "whatsapp", currentState.backState.level, currentState.backState.parentId, currentState.backState.parentLabel, currentState.backState.searchTerm, currentState.backState.backState);
    await renderHubMenuText(jid, conversationId, messageContent, metadata);
    return true;
  }

  // If no state (rare) or at root level, process the selection
  if (!currentState || currentState.level === "root") {
    const rootItems = buildRootMenu();
    const selected = parseSelection(trimmed, rootItems);
    if (selected) {
      await processHubMenuSelection(jid, conversationId, messageContent, { level: "root", conversationId, channel: "whatsapp", timestamp: Date.now() }, selected);
      return true;
    }
    await renderHubMenuText(jid, conversationId, messageContent, metadata);
    return true;
  }

  // Otherwise, parse selection against the current state's children
  // We need to fetch the appropriate list of items to select from
  const items = await getHubMenuItemsForState(currentState);
  if (items.length === 0) {
    await sendText(jid, "❌ تعذّر تحميل القائمة. حاول مرة أخرى.");
    clearHubMenuState(convId);
    return true;
  }

  const selected = parseSelection(trimmed, items);

  if (selected === null && isBack) {
    clearHubMenuState(convId);
    await renderHubMenuText(jid, conversationId, messageContent, metadata);
    return true;
  }

  if (!selected) {
    await sendText(jid, "⚠️ اختيار غير صحيح. حاول مرة أخرى.\n" + formatMenuText("اختر:", items));
    return true;
  }

  // Handle the selection
  await processHubMenuSelection(jid, conversationId, messageContent, currentState, selected);
  return true;
}

/**
 * Fetch the items list for a given hub menu state.
 */
async function getHubMenuItemsForState(state: HubMenuState): Promise<HubMenuItem[]> {
  if (state.level === "root") return buildRootMenu();
  if (state.level === "national") {
    const parallelOrgs = await fetchParallelOrganizations();
    return buildNationalMenu(parallelOrgs);
  }
  if (state.level === "regions") {
    const rootOffices = await fetchRootOffices();
    return buildRegionsMenu(rootOffices);
  }
  if (state.level === "provinces" && state.parentId !== undefined) {
    const offices = await fetchOfficesByParentId(state.parentId);
    return buildProvincesMenu(offices);
  }
  if (state.level === "parallelBranches" && state.parentId !== undefined) {
    const branches = await fetchParallelBranches(state.parentId);
    const organizations = await fetchParallelOrganizations();
    const nationalOffice = organizations.find((office) => office.name.includes(state.searchTerm || ""));
    return buildParallelBranchesMenu(branches, nationalOffice);
  }
  if (state.level === "local" && state.parentId !== undefined) {
    const offices = await fetchOfficesByParentId(state.parentId);
    return buildProvincesMenu(offices, "🏠");
  }
  return [];
}

async function fetchHubOfficesForLocal(name: string) {
  const mod = await import("@/lib/hub-offices");
  return mod.fetchHubOffices(name);
}

/**
 * Process a hub menu selection and advance the state.
 */
async function processHubMenuSelection(
  jid: string,
  conversationId: string,
  userInput: string,
  currentState: HubMenuState,
  selected: HubMenuItem
): Promise<void> {
  const convId = conversationId;

  if (selected.id.startsWith("region:") && currentState.mode === "regional") {
    const region = selected.office || (await fetchRootOffices().catch(() => [])).find((office) => cleanOfficeName(office.name) === selected.officeName || office.name === selected.officeName);
    if (region) {
      const text = formatOfficeContacts(region);
      clearHubMenuState(convId);
      await recordExchange(conversationId, userInput, text);
      await sendText(jid, text + "\n\n0️⃣ رجوع للقائمة الرئيسية");
      return;
    }
  }

  if (selected.id.startsWith("prov:") && currentState.mode === "local" && currentState.level === "provinces") {
    if (!selected.parentId) {
      await sendText(jid, "⚠️ تعذّر إيجاد المكاتب المحلية لهذا الإقليم.");
      return;
    }
    const nextState = setHubMenuState(convId, "whatsapp", "local", selected.parentId, selected.label, undefined, currentState);
    nextState.mode = "local";
    await renderHubMenuText(jid, conversationId, userInput, { ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown> });
    return;
  }

  // If the selection has secretary info (already a contact), just display it
  if (selected.office && (selected.id === "parallel-national" || selected.id.startsWith("prov:") || selected.id.startsWith("branch:"))) {
    const office = selected.office;
    if (office) {
      const text = formatOfficeContacts(office);
      clearHubMenuState(convId);
      await recordExchange(conversationId, userInput, text);
      await sendText(jid, text + "\n\n0️⃣ رجوع للقائمة الرئيسية");
      return;
    }
  }

  if (selected.id === "national") {
    const offices = await fetchHubOffices("FNE");
    const office = offices.find((o) => o.level === "وطني") || offices[0];
    if (office) {
      const text = formatOfficeContacts(office);
      clearHubMenuState(convId);
      await recordExchange(conversationId, userInput, text);
      await sendText(jid, text + "\n\n0️⃣ رجوع للقائمة الرئيسية");
      return;
    }
    return;
  }

  if (selected.id === "regional") {
    const rootOffices = await fetchRootOffices().catch(() => []);
    const items = buildRegionsMenu(rootOffices);
    const nextState = setHubMenuState(convId, "whatsapp", "regions", undefined, "المكاتب الجهوية", undefined, currentState);
    nextState.mode = "regional";
    await renderHubMenuText(jid, conversationId, userInput, { ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown> });
    return;
  }

  if (selected.id === "provincial") {
    const rootOffices = await fetchRootOffices().catch(() => []);
    const regions = buildRegionsMenu(rootOffices);
    const nextState = setHubMenuState(convId, "whatsapp", "regions", undefined, "اختر جهة أولاً", undefined, currentState);
    nextState.mode = "provincial";
    await renderHubMenuText(jid, conversationId, userInput, { ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown> });
    return;
  }

  if (selected.id === "local") {
    const rootOffices = await fetchRootOffices().catch(() => []);
    const nextState = setHubMenuState(convId, "whatsapp", "regions", undefined, "اختر جهة أولاً", undefined, currentState);
    nextState.mode = "local";
    await renderHubMenuText(jid, conversationId, userInput, { ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown> });
    return;
  }

  if (selected.id === "parallel") {
    const parallelOrgs = await fetchParallelOrganizations().catch(() => []);
    const nextState = setHubMenuState(convId, "whatsapp", "national", undefined, "التنظيمات الموازية", undefined, currentState);
    nextState.mode = "parallel";
    await renderHubMenuText(jid, conversationId, userInput, { ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown> });
    return;
  }

  if (selected.id === "search") {
    clearHubMenuState(convId);
    await sendText(jid, "✏️ أرسل اسم المكتب أو الإقليم للبحث عنه.");
    return;
  }

  if (selected.id.startsWith("parallel:")) {
    if (selected.parentId) {
      const nextState = setHubMenuState(convId, "whatsapp", "parallelBranches", selected.parentId, selected.label, selected.searchTerm, currentState);
      nextState.mode = "parallel";
      await renderHubMenuText(jid, conversationId, userInput, { ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown> });
      return;
    }
    const organizations = await fetchParallelOrganizations().catch(() => []);
    const organization = organizations.find((office) => office.name.includes(selected.searchTerm || ""));
    if (organization) {
      const text = formatOfficeContacts(organization);
      await recordExchange(conversationId, userInput, text);
      await sendText(jid, text + "\n\n0️⃣ رجوع للقائمة الرئيسية");
      return;
    }
  } else if (selected.id.startsWith("region:")) {
    const rootOffices = await fetchRootOffices().catch(() => []);
    const region = rootOffices.find((o) => cleanOfficeName(o.name) === selected.officeName || o.name === selected.officeName);
    const parentId = (region as { parentId?: number })?.parentId;
    if (parentId) {
      const nextState = setHubMenuState(convId, "whatsapp", "provinces", parentId, selected.label, undefined, currentState);
      nextState.mode = currentState.mode || (selected.id.includes("provincial") ? "provincial" : "regional");
      await renderHubMenuText(jid, conversationId, userInput, { ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown> });
      return;
    } else {
      await sendText(jid, "⚠️ تعذّر إيجاد المكاتب الإقليمية لهذه الجهة.");
      return;
    }
  } else if (selected.id.startsWith("branch:")) {
    const branches = currentState.parentId ? await fetchParallelBranches(currentState.parentId) : [];
    const branch = selected.office || branches.find((entry) => cleanOfficeName(entry.name) === selected.officeName || entry.name === selected.officeName);
    if (branch) {
      const text = formatOfficeContacts(branch);
      await recordExchange(conversationId, userInput, text);
      await sendText(jid, text + "\n\n0️⃣ رجوع");
      return;
    }
  }

  await renderHubMenuText(jid, conversationId, userInput, {
    ...(await prisma.conversation.findUnique({ where: { id: conversationId } }))?.metadata as Record<string, unknown>,
  });
}

/**
 * Render the current hub menu text to the user.
 */
async function renderHubMenuText(
  jid: string,
  conversationId: string,
  userInput: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const convId = conversationId;
  const state = getHubMenuState(convId);
  if (!state) {
    // Default: root menu
    const items = buildRootMenu();
    const text = "🏛️ *مكاتب الجامعة الوطنية للتعليم FNE*\n\n" + formatMenuText("اختر:", items, false);
    clearHubMenuState(convId);
    setHubMenuState(convId, "whatsapp", "root");
    await recordExchange(conversationId, userInput, text);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { metadata: { ...metadata, awaitingMenuChoice: false, activeCategory: null, [HUB_MENU_META_KEY]: { level: "root" } } },
    });
    await sendText(jid, text);
    return;
  }

  const items = await getHubMenuItemsForState(state);
  let title = "اختر:";
  if (state.level === "root") title = "🏛️ *مكاتب الجامعة الوطنية للتعليم FNE*";
  else if (state.level === "national") title = "🏛️ *القيادة الوطنية والتنظيمات الموازية*";
  else if (state.level === "regions") title = "🌍 *المكاتب الجهوية (12 جهة)*";
  else if (state.level === "provinces") title = `📍 *${state.parentLabel || "المكاتب الإقليمية"}*`;
  else if (state.level === "parallelBranches") title = `🏢 *${state.parentLabel || "فروع التنظيم"}*`;

  const text = formatMenuText(title, items, true);

  // Persist state in conversation metadata so it survives restarts
  const metaUpdate = { ...metadata, awaitingMenuChoice: false, activeCategory: null, [HUB_MENU_META_KEY]: { level: state.level, parentId: state.parentId, parentLabel: state.parentLabel, searchTerm: state.searchTerm, mode: state.mode } };
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { metadata: metaUpdate },
  });

  await recordExchange(conversationId, userInput, text);
  await sendText(jid, text);
}


/**
 * Record a full user-bot message exchange in the PostgreSQL database
 * so the conversation history in the dashboard is always 100% complete.
 */
async function recordExchange(conversationId: string, userMsg: string, botReply: string): Promise<void> {
  try {
    if (userMsg) {
      await prisma.message.create({
        data: {
          conversationId,
          role: "customer",
          content: userMsg,
        },
      });
    }
    if (botReply) {
      await prisma.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: botReply,
        },
      });
    }
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    logger.warn("[WhatsApp/Baileys] Failed to record exchange:", { error: String(err) });
  }
}

async function sendArticleMessages(
  jid: string,
  article: { title: string; content: string },
  categoryChoice: string,
  conversationId?: string,
  userMsg?: string
): Promise<void> {
  const { dateStr, body } = cleanArticleBodyForChat(article.content, article.title);

  // Clean the body further: remove any residual links, category labels, and "read more" patterns
  let cleanBody = body.trim();
  // Remove residual [label](url) markdown links that cleanArticleBodyForChat may have missed
  cleanBody = cleanBody.replace(/\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g, "$1");
  // Remove standalone URLs
  cleanBody = cleanBody.replace(/https?:\/\/\S+/g, "");
  // Remove "read more" / "اقرأ المزيد" / "للمزيد" patterns that may have slipped through
  cleanBody = cleanBody.replace(/(?:Lire la suite|اقرأ المزيد|اقرأ المزيد|Lire suite|Read more|Read more...|اقرأ أكثر|للمزيد|للمزيد من التفاصيل).*/gi, "");
  // Trim any dangling punctuation or newlines at the end
  cleanBody = cleanBody.replace(/[\s\n\r]+$/, "");

  const header = [`📌 *${article.title}*`];
  if (dateStr) {
    header.push(`📅 *${dateStr}*`);
  }

  const footer = [
    "",
    `📋 للرجوع لمقالات هذا القسم أرسل *${categoryChoice}*`,
    "📋 للرجوع للقائمة الرئيسية أرسل *0*",
  ].join("\n");

  const finalMsg = `${header.join("\n")}\n${cleanBody}${footer}`;
  if (conversationId && userMsg) {
    await recordExchange(conversationId, userMsg, finalMsg);
  }
  // Send the entire article in one single message
  await sendText(jid, finalMsg);
}

function isMenuGreeting(input: string): boolean {
  const normalized = input.trim().toLowerCase().replace(/[!.،؟?]+$/g, "").replace(/\s+/g, " ");
  return ["hi", "hello", "hey", "bonjour", "salut", "salam", "سلام", "السلام عليكم", "السلامعليكم", "مرحبا", "أهلا", "اهلا", "تحية نضالية"].includes(normalized);
}

export function sanitizeWhatsAppMessage(text: string): string {
  if (!text) return "";
  let sanitized = text.replace(/\*\*(.*?)\*\*/g, "*$1*");
  sanitized = sanitized.replace(/^#+\s+(.+)$/gm, "📌 *$1*");

  // 1. Unwrap URLs wrapped in parentheses and/or asterisks like (https://...)* or *(https://...)*
  sanitized = sanitized.replace(/\(\s*(https?:\/\/[^\s\)]+)\s*\)\*?/gi, "$1");
  sanitized = sanitized.replace(/\*\s*(https?:\/\/[^\s\*]+)\s*\*+/gi, "$1");

  // 2. Clean markdown links with identical title/URL: [https://Taalim.org](https://Taalim.org) -> https://Taalim.org
  sanitized = sanitized.replace(/\[\s*(https?:\/\/[^\s\]]+)\s*\]\(\s*https?:\/\/[^\s\)]+\s*\)\*?/gi, "$1");

  // Convert descriptive markdown links [نص](url) into clean WhatsApp format with URL on its own line
  sanitized = sanitized.replace(/(?:•\s*)?\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)\*?/g, (_match, title, url) => {
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    if (cleanTitle.toLowerCase() === cleanUrl.toLowerCase() || /^https?:\/\//i.test(cleanTitle)) {
      return `\n${cleanUrl}`;
    }
    return `• *${cleanTitle}*\n${cleanUrl}`;
  });

  // 3. Strip trailing punctuation/asterisks/parentheses directly touching URLs (prevents broken link detection on WhatsApp)
  sanitized = sanitized.replace(/(https?:\/\/[^\s\)\*\]>]+)[\)\*\]>]+/gi, "$1");

  // 4. Deduplicate repeated links (e.g. multiple https://Taalim.org in same reply)
  const seenUrls = new Set<string>();
  sanitized = sanitized.replace(/(https?:\/\/[^\s\)\],]+)/gi, (fullUrl) => {
    const norm = fullUrl.toLowerCase().replace(/\/+$/, "");
    if (seenUrls.has(norm)) {
      return "";
    }
    seenUrls.add(norm);
    return fullUrl;
  });

  // Clean empty labels or dangling colons left by removed duplicate URLs
  sanitized = sanitized.replace(/(?:من خلال الموقع الرسمي للجامعة:\s*)+$/gm, "");
  sanitized = sanitized.replace(/:\s*:\s*/g, ": ");

  // 5. Strip all decorative horizontal lines/bars (───, ━━━, ═══, ----, _____, etc.)
  // These Unicode bars stretch across mobile screens, break RTL Arabic alignment, and deform text/URLs
  sanitized = sanitized.replace(/^[ \t]*[─━═—\-_]{3,}[ \t]*$/gm, "");
  sanitized = sanitized.replace(/^[ \t]*[─━═—\-_]{3,}\s*/gm, "");
  sanitized = sanitized.replace(/\s*[─━═—\-_]{3,}[ \t]*$/gm, "");
  sanitized = sanitized.replace(/[ \t]*[─━═—\-_]{3,}[ \t]*/g, " ");

  // 6. Ensure standalone URLs preceded by Arabic text or labels are placed cleanly on their own new line
  // Example: "📄 تحميل المذكرة: https://..." -> "📄 تحميل المذكرة:\nhttps://..."
  sanitized = sanitized.replace(/([^\n\s])\s+(https?:\/\/[^\s]+)/g, "$1\n$2");

  // Fix lone bullet on its own line: \n•\ntext -> \n• text
  sanitized = sanitized.replace(/\n\s*([•◦▪️▫️\-\*])\s*\n\s*/g, "\n$1 ");

  // Strip leading spaces/tabs on all lines
  sanitized = sanitized.replace(/^[ \t]+/gm, "");

  // Format tables cleanly for WhatsApp & Telegram
  const lines = sanitized.split("\n");
  const parsedLines: string[] = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      inTable = true;
      if (/^[\s|\-]+$/.test(trimmed)) continue;
      const cells = trimmed.split("|").filter((c) => c.trim() !== "").map((c) => c.trim());
      if (cells.length >= 2 && (cells[0].replace(/\*/g, "") === "العنصر" || cells[0].replace(/\*/g, "") === "الاسم")) continue;
      parsedLines.push(cells.length >= 2 ? `• *${cells[0]}:* ${cells.slice(1).join(" | ")}` : cells.join(" "));
    } else {
      if (inTable) {
        parsedLines.push("");
        inTable = false;
      }
      parsedLines.push(line);
    }
  }

  // Split by intentional paragraphs (separated by empty lines: \n\s*\n)
  const rawParagraphs = parsedLines.join("\n").split(/\n\s*\n+/);
  const formattedBlocks: string[] = [];

  const bulletRegex = /^([•◦▪️▫️\-\*]|(?:\(?\d+[\.\-\)]))\s*(.+)$/;

  for (const rawP of rawParagraphs) {
    const pTrimmed = rawP.trim();
    if (!pTrimmed) continue;

    // Drop decorative separator blocks (─── or ━━━) completely
    if (/^[─━═—\-_]{3,}$/.test(pTrimmed)) {
      continue;
    }

    const pLines = pTrimmed
      .split("\n")
      .map((l) => l.trim().replace(/^[─━═—\-_]{3,}\s*/, "").replace(/\s*[─━═—\-_]{3,}$/, ""))
      .filter((l) => Boolean(l) && !/^[─━═—\-_]{3,}$/.test(l));
    if (pLines.length === 0) continue;

    // Check if lines in this block are list items / phone numbers / metadata
    const hasBullets = pLines.some((l) => bulletRegex.test(l));

    if (hasBullets) {
      const listLines: string[] = [];
      for (const line of pLines) {
        const match = line.match(bulletRegex);
        if (match) {
          const prefix = match[1];
          const content = match[2].trim();
          if (/^\(?\d+[\.\-\)]/.test(prefix)) {
            listLines.push(`${prefix} ${content}`);
          } else {
            listLines.push(`• ${content}`);
          }
        } else if (/^(📞|الهاتف|هاتف|البريد|فاكس|WhatsApp|واتساب)/i.test(line) || /^0[5-7]\d{8}/.test(line)) {
          listLines.push(`  ${line}`);
        } else {
          // Continuation of previous bullet
          if (listLines.length > 0) {
            listLines[listLines.length - 1] += " " + line;
          } else {
            listLines.push(line);
          }
        }
      }
      formattedBlocks.push(listLines.join("\n"));
    } else if (
      pLines.length > 1 &&
      pLines.some((l) => /^(عن المكتب|الكاتب العام|الكاتب الوطني|عاشت|عاش|تحية|الرباط،|الدار البيضاء،|تيزنيت،)/.test(l))
    ) {
      formattedBlocks.push(pLines.join("\n"));
    } else if (pLines.length === 1 && pLines[0].startsWith("📌")) {
      formattedBlocks.push(pLines[0]);
    } else {
      // Normal narrative paragraph: join broken lines into continuous text
      formattedBlocks.push(pLines.join(" "));
    }
  }

  return formattedBlocks.join("\n\n").trim();
}

export const BAYAN_TAG = "مشتركو البيانات والمستجدات";
export const BAYAN_TAG_SLUG = "bayan_subscribers";

/**
 * Automatically shortens long or percent-encoded URLs in text (especially ministerial PDFs).
 */
export async function shortenMessageUrls(text: string): Promise<string> {
  if (!text) return "";
  const urlRegex = /(https?:\/\/[^\s\)\*\]>]+)/gi;
  const matches = Array.from(new Set(text.match(urlRegex) || []));
  let result = text;
  for (const rawUrl of matches) {
    if (rawUrl.length > 45 || rawUrl.includes("%")) {
      try {
        const shortUrl = await getOrCreateShortLink(rawUrl);
        result = result.split(rawUrl).join(shortUrl);
      } catch (_) {}
    }
  }
  return result;
}

export async function sanitizeWhatsAppMessageAsync(text: string): Promise<string> {
  const shortened = await shortenMessageUrls(text);
  return sanitizeWhatsAppMessage(shortened);
}

export async function subscribeCustomerToBayan(
  customerId: string,
  contact: string,
  convId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      const existingTags = (customer.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
      const filtered = existingTags.filter((t) => t !== BAYAN_OPTED_OUT_TAG && t !== BAYAN_OPTED_OUT_SLUG);
      if (!filtered.includes(BAYAN_TAG)) filtered.push(BAYAN_TAG);
      if (!filtered.includes(BAYAN_TAG_SLUG)) filtered.push(BAYAN_TAG_SLUG);
      await prisma.customer.update({
        where: { id: customerId },
        data: { tags: filtered.join(", ") },
      });
    }
    await prisma.conversation.update({
      where: { id: convId },
      data: {
        metadata: {
          ...metadata,
          bayanSubscribed: true,
          bayanDeclined: false,
          awaitingBayanOptIn: false,
          bayanOptInPrompted: true,
        },
      },
    });
    logger.info(`[WhatsApp/OptIn] Customer ${contact} subscribed to Bayan updates`);
  } catch (err) {
    logger.error("[WhatsApp/OptIn] Error subscribing customer:", { error: String(err) });
  }
}

export async function unsubscribeCustomerFromBayan(
  customerId: string,
  convId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      const existingTags = (customer.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
      const filtered = existingTags.filter((t) => t !== BAYAN_TAG && t !== BAYAN_TAG_SLUG);
      if (!filtered.includes(BAYAN_OPTED_OUT_TAG)) filtered.push(BAYAN_OPTED_OUT_TAG);
      if (!filtered.includes(BAYAN_OPTED_OUT_SLUG)) filtered.push(BAYAN_OPTED_OUT_SLUG);
      await prisma.customer.update({
        where: { id: customerId },
        data: { tags: filtered.join(", ") },
      });
    }
    await prisma.conversation.update({
      where: { id: convId },
      data: {
        metadata: {
          ...metadata,
          bayanSubscribed: false,
          bayanDeclined: true,
          awaitingBayanOptIn: false,
          bayanOptInPrompted: true,
        },
      },
    });
    logger.info(`[WhatsApp/OptIn] Customer ${customerId} unsubscribed from Bayan updates`);
  } catch (err) {
    logger.error("[WhatsApp/OptIn] Error unsubscribing customer:", { error: String(err) });
  }
}

function isDuplicate(key?: string): boolean {
  if (!key) return false;
  const now = Date.now();
  for (const [k, ts] of processedInboundMessages) {
    if (now - ts > MESSAGE_DEDUP_TTL_MS) processedInboundMessages.delete(k);
  }
  if (processedInboundMessages.has(key)) return true;
  processedInboundMessages.set(key, now);
  return false;
}

// Outbound anti-ban safeguards: pacing and typing simulation
let lastSendTimestamp = 0;
const MIN_GAP_BETWEEN_MESSAGES_MS = 650;

async function sendText(jid: string, text: string): Promise<void> {
  if (!waState.sock || !text) return;

  try {
    // 1. Simulate human typing (presenceUpdate "composing")
    await waState.sock.sendPresenceUpdate("composing", jid).catch(() => { });

    // 2. Natural human typing delay based on message length (800ms - 2200ms)
    const typingDuration = Math.min(2200, Math.max(800, text.length * 6));
    await new Promise((resolve) => setTimeout(resolve, typingDuration));

    // 3. Spacing guard: ensure consecutive outbound messages don't burst concurrently
    const now = Date.now();
    const timeSinceLast = now - lastSendTimestamp;
    if (timeSinceLast < MIN_GAP_BETWEEN_MESSAGES_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_GAP_BETWEEN_MESSAGES_MS - timeSinceLast));
    }
    lastSendTimestamp = Date.now();

    // 4. Reset typing status and send message
    await waState.sock.sendPresenceUpdate("paused", jid).catch(() => { });
    const sendRes = await waState.sock.sendMessage(jid, { text }, { linkPreview: null } as any);
    logger.info(`[WhatsApp/Baileys] Message dispatched to ${jid}, id: ${sendRes?.key?.id || "unknown"}`);
  } catch (err) {
    logger.error(`[WhatsApp/Baileys] sendText error to ${jid}:`, { error: String(err) });
  }
}

import sharp from "sharp";

const FNE_LOGO_PATH = path.join(process.cwd(), "public", "logo_fne.gif");
const FNE_LOGO_FIRST_SIZE = 100; // pixels — small but readable logo, sent only on first menu display

/**
 * Read the FNE logo, resize it to a small width, and send it as a standalone message.
 * Returns true if the logo was sent, false otherwise (missing file, sharp fail, etc).
 */
async function sendLogoIcon(jid: string, size: number = FNE_LOGO_FIRST_SIZE): Promise<boolean> {
  if (!waState.sock) return false;
  try {
    const raw = fs.readFileSync(FNE_LOGO_PATH);
    const buffer = await sharp(raw)
      .resize({ width: size, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    if (!buffer || buffer.length === 0) return false;

    // Spacing guard
    const now = Date.now();
    const timeSinceLast = now - lastSendTimestamp;
    if (timeSinceLast < MIN_GAP_BETWEEN_MESSAGES_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_GAP_BETWEEN_MESSAGES_MS - timeSinceLast));
    }
    lastSendTimestamp = Date.now();

    await waState.sock!.sendPresenceUpdate("composing", jid).catch(() => { });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await waState.sock!.sendPresenceUpdate("paused", jid).catch(() => { });

    const sendRes = await waState.sock!.sendMessage(jid, {
      image: buffer,
      mimetype: "image/jpeg",
    });
    logger.info(`[WhatsApp/Baileys] Logo (${size}px, ${buffer.length} bytes) sent to ${jid}, id: ${sendRes?.key?.id || "unknown"}`);
    return true;
  } catch (err) {
    logger.warn("[WhatsApp/Baileys] sendLogoIcon error:", { error: String(err) });
    return false;
  }
}

/**
 * Send the menu text as plain text message.
 */
async function sendMenuText(jid: string, text: string): Promise<boolean> {
  if (!waState.sock) {
    await sendText(jid, text);
    return false;
  }
  // Simulate typing
  await waState.sock.sendPresenceUpdate("composing", jid).catch(() => { });
  const typingDuration = Math.min(2200, Math.max(800, text.length * 6));
  await new Promise((resolve) => setTimeout(resolve, typingDuration));

  // Spacing guard
  const now = Date.now();
  const timeSinceLast = now - lastSendTimestamp;
  if (timeSinceLast < MIN_GAP_BETWEEN_MESSAGES_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_GAP_BETWEEN_MESSAGES_MS - timeSinceLast)
    );
  }
  lastSendTimestamp = Date.now();

  await waState.sock.sendPresenceUpdate("paused", jid).catch(() => { });
  await sendText(jid, text);
  return true;
}

/**
 * Send the menu text. If this is the FIRST time we send a menu to this jid,
 * the FNE logo (100px) is sent first as a separate image. Subsequent menu
 * displays in the same conversation send text only.
 * Logo-sent state is persisted in the conversation metadata so it survives
 * Docker restarts.
 */
async function sendMenuWithLogo(jid: string, caption: string): Promise<boolean> {
  // Look up the conversation to check/save fneLogoSent in metadata
  const conv = await prisma.conversation.findFirst({
    where: {
      channel: "whatsapp",
      customerContact: jid,
      status: { in: ["active", "escalated"] },
    },
    select: { id: true, metadata: true },
  });

  const meta = (conv?.metadata as Record<string, unknown>) || {};
  const logoAlreadySent = Boolean(meta.fneLogoSent);

  if (!waState.sock) {
    await sendText(jid, caption);
    return false;
  }

  // First time only: send the logo as a small standalone image
  if (!logoAlreadySent) {
    const sent = await sendLogoIcon(jid, FNE_LOGO_FIRST_SIZE);
    if (sent) {
      // Persist flag in conversation metadata AND in-memory Set
      waState.logoSentTo.add(jid);
      if (conv) {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { metadata: { ...meta, fneLogoSent: true } },
        }).catch(() => {/* non-fatal */ });
      }
      // Small pause between logo and text
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  // Send menu text
  await sendMenuText(jid, caption);
  logger.info(`[WhatsApp/Baileys] Menu sent to ${jid} (logo: ${logoAlreadySent ? "no (already sent)" : "yes (first)"})`);
  return true;
}

function extractMessageContent(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  let m = (msg as { message?: Record<string, unknown> }).message;
  if (!m) return "";

  for (const wrapper of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"]) {
    if (typeof m[wrapper] === "object" && m[wrapper] && "message" in (m[wrapper] as object)) {
      m = (m[wrapper] as { message: Record<string, unknown> }).message;
    }
  }

  const conv = typeof m.conversation === "string" ? m.conversation : "";
  const ext = typeof (m.extendedTextMessage as { text?: string })?.text === "string" ? (m.extendedTextMessage as { text: string }).text : "";
  const img = typeof (m.imageMessage as { caption?: string })?.caption === "string" ? (m.imageMessage as { caption: string }).caption : "";
  const vid = typeof (m.videoMessage as { caption?: string })?.caption === "string" ? (m.videoMessage as { caption: string }).caption : "";
  const doc = typeof (m.documentMessage as { caption?: string })?.caption === "string" ? (m.documentMessage as { caption: string }).caption : "";

  return conv || ext || img || vid || doc || "";
}

// Feedback footer appended to every AI response on WhatsApp
const WA_FEEDBACK_FOOTER = "\n💬 هل أفادك هذا الجواب؟ تفاعل بـ 👍 أو 👎";

async function handleIncomingMessage(
  jid: string,
  body: string,
  pushName?: string,
  messageId?: string,
  wasVoice: boolean = false,
  reconnectNotice: string = ""
): Promise<void> {
  try {
    if (jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid === "status@broadcast") return;

    const messageContent = body.trim();
    if (!messageContent) return;

    let noticeAttached = false;
    const attachNotice = (text: string): string => {
      if (!noticeAttached && reconnectNotice) {
        noticeAttached = true;
        return `${reconnectNotice}${text}`;
      }
      return text;
    };

    logger.info(`[WhatsApp/Baileys] Received from ${jid}: "${messageContent}"`);

    // Only deduplicate duplicate packet deliveries with the exact same messageId
    if (messageId && isDuplicate(messageId)) {
      logger.info(`[WhatsApp/Baileys] Duplicate network packet ignored for messageId: ${messageId}`);
      return;
    }

    // ── Feedback detection: user replied with 👍 or 👎 ──────────────────────
    const feedbackEmoji = messageContent.trim();
    if (feedbackEmoji === "👍" || feedbackEmoji === "👎") {
      const rating = feedbackEmoji === "👍" ? "positive" : "negative";
      logger.info(`[WhatsApp/Baileys] Feedback received from ${jid}: ${feedbackEmoji}`);
      try {
        // Find the active conversation to link the feedback
        const conv = await prisma.conversation.findFirst({
          where: { channel: "whatsapp", status: { in: ["active", "escalated"] }, customerContact: jid },
          select: { id: true },
        });
        let lastQuestion = "";
        if (conv) {
          const lastCust = await prisma.message.findFirst({
            where: { conversationId: conv.id, role: { in: ["customer", "user"] } },
            orderBy: { createdAt: "desc" },
            select: { content: true },
          });
          lastQuestion = lastCust?.content ? lastCust.content.trim() : "";
        }
        await (prisma as any).messageFeedback.create({
          data: {
            channel: "whatsapp",
            conversationId: conv?.id ?? null,
            rating,
            question: lastQuestion,
          },
        });
      } catch (fbErr) {
        logger.warn("[WhatsApp/Baileys] Failed to save feedback:", { error: String(fbErr) });
      }
      // No reply needed — the reaction is self-explanatory
      return;
    }
    // ── End feedback detection ───────────────────────────────────────────────

    // ── Suggestion flow detection ────────────────────────────────────────────
    const isSuggestionTrigger = messageContent.trim() === "اقتراح" || messageContent.trim() === "ملاحظة";
    // ── End suggestion trigger ───────────────────────────────────────────────

    const directDigit = normalizeDigitCommand(messageContent);

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
    const activeCategory = (metadata.activeCategory as string) || null;
    const categoryPage = Number(metadata.categoryPage) || 1;
    const pageArticleIds = (metadata.pageArticleIds as string[]) || [];

    logger.info(`[WhatsApp/Baileys] State for ${jid}: menuShown=${menuShown}, isNewConversation=${isNewConversation}, activeCategory=${activeCategory}, page=${categoryPage}, directDigit=${directDigit}`);

    // ── Promotion Calculation Wizard (choice 9) ────────────────────────────
    const promoCalcState = metadata[PROMO_CALC_META_KEY] as PromotionCalcState | undefined;
    if (promoCalcState?.active) {
      if (directDigit === "0") {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [PROMO_CALC_META_KEY]: null, menuShown: true, awaitingMenuChoice: true, activeCategory: null } },
        });
        const menuText = buildMenuText();
        await recordExchange(conversation.id, messageContent, menuText);
        await sendMenuWithLogo(jid, menuText);
        return;
      }

      const { state: updatedPromo, isDone, error } = processPromoAnswer(promoCalcState, messageContent);
      if (error) {
        await sendText(jid, `${error}\n\n${getPromoQuestion(promoCalcState)}`);
        return;
      }

      if (isDone) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [PROMO_CALC_META_KEY]: null, menuShown: true, awaitingMenuChoice: false } },
        });
        const summary = formatPromoSummary(updatedPromo);
        await recordExchange(conversation.id, messageContent, summary);
        await sendText(jid, summary);
        return;
      }

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, [PROMO_CALC_META_KEY]: serializePromoCalcState(updatedPromo) } },
      });
      const nextQ = getPromoQuestion(updatedPromo);
      await recordExchange(conversation.id, messageContent, nextQ);
      await sendText(jid, nextQ);
      return;
    }

    // ── Request Wizard (choice 8 — hidden from public menu) ─────────────────
    const wizardState = metadata[WIZARD_META_KEY] as WizardState | undefined;

    // If wizard is active, route ALL input through it (unless user cancels with 0 or 00)
    if (wizardState?.active) {
      // Cancellation back to Main Menu (0)
      if (directDigit === "0") {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [WIZARD_META_KEY]: null, menuShown: true, awaitingMenuChoice: true, activeCategory: null } },
        });
        const menuText = buildMenuText();
        await recordExchange(conversation.id, messageContent, menuText);
        await sendMenuWithLogo(jid, menuText);
        return;
      }

      // Cancellation / Back to Documents Menu (00)
      if (messageContent.trim() === "00") {
        const subWizard: WizardState = {
          active: true,
          type: "ta3n_admin",
          step: 0,
          data: {},
          subMenu: true,
        };
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [WIZARD_META_KEY]: serializeWizardState(subWizard), activeCategory: "docs" } },
        });
        const docMenuText = getRequestMenuText();
        await recordExchange(conversation.id, messageContent, docMenuText);
        await sendText(jid, docMenuText);
        return;
      }

      // Sub-menu: user selecting a request type (1–6)
      if (wizardState.subMenu) {
        const reqType = parseTypeChoice(messageContent.trim());
        if (!reqType) {
          await sendText(jid, `الرجاء إرسال رقم بين 1 و 6، أو أرسل *0* للإلغاء.\n\n${getRequestMenuText()}`);
          return;
        }
        const savedProfile = (metadata.userProfile as any) || null;
        const hasSavedProfile = Boolean(savedProfile && savedProfile.fullName);

        const newWizard: WizardState = {
          active: true,
          type: reqType,
          step: 0,
          data: {},
          subMenu: false,
          awaitingProfileReuse: hasSavedProfile,
          savedProfile: hasSavedProfile ? savedProfile : undefined,
        };

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [WIZARD_META_KEY]: serializeWizardState(newWizard) } },
        });
        const firstQ = getCurrentQuestion(newWizard);
        const config = REQUEST_TYPES[reqType];
        const reassuranceNote =
          "💡 *ملاحظة هامة:* هذه المعلومات نطلبها منك لمرة واحدة فقط لملء طلبك بدقة، وسيتم حفظها تلقائياً لتوليد جميع طلباتك ومراسلاتك المستقبلية بضغطة زر واحدة دون إعادة إدخالها.";
        const intro = hasSavedProfile
          ? `✅ اخترت: *${config.emoji} ${config.label}*\n\n${firstQ}`
          : `✅ اخترت: *${config.emoji} ${config.label}*\n\n${reassuranceNote}\n\nسأطرح عليك ${config.steps.length} أسئلة قصيرة لتوليد الوثيقة:\n\n${firstQ}`;
        await recordExchange(conversation.id, messageContent, intro);
        await sendText(jid, intro);
        return;
      }

      // Wizard step: collect answer
      const updatedWizard = processAnswer(wizardState, messageContent);

      if (isComplete(updatedWizard)) {
        // All data collected — generate document
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [WIZARD_META_KEY]: serializeWizardState(updatedWizard) } },
        });
        const summary = buildDataSummary(updatedWizard);
        await recordExchange(conversation.id, messageContent, summary);
        await sendText(jid, summary);

        try {
          const result = await generateAdminRequest(updatedWizard, conversation.id, "whatsapp");
          const config = REQUEST_TYPES[updatedWizard.type];
          const delivery = buildDeliveryMessage(result, `${config.emoji} ${config.label}`, "whatsapp");

          // Save userProfile in metadata for subsequent requests & clear wizard
          const updatedUserProfile = {
            fullName: updatedWizard.data.fullName || (metadata.userProfile as any)?.fullName,
            ppr: updatedWizard.data.ppr || (metadata.userProfile as any)?.ppr,
            grade: updatedWizard.data.grade || (metadata.userProfile as any)?.grade,
            school: updatedWizard.data.school || (metadata.userProfile as any)?.school,
            province: updatedWizard.data.province || (metadata.userProfile as any)?.province,
          };

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              metadata: {
                ...metadata,
                userProfile: updatedUserProfile,
                [WIZARD_META_KEY]: null,
                menuShown: true,
                awaitingMenuChoice: false,
              },
            },
          });
          await recordExchange(conversation.id, "", delivery);
          await sendText(jid, delivery);

          // Send native PDF document attachment directly into WhatsApp chat
          let pdfSent = false;
          try {
            const pdfBuffer = await generateRequestPdf(result.printToken);
            if (pdfBuffer && waState.sock) {
              const safeName = `طلب_${(updatedWizard.data.fullName || "إداري").replace(/\s+/g, "_")}.pdf`;
              await waState.sock.sendMessage(jid, {
                document: pdfBuffer,
                mimetype: "application/pdf",
                fileName: safeName,
                caption: `📄 وثيقة ${config.label} الرسمية جاهزة للتحميل والطباعة\nالمعني بالأمر: ${updatedWizard.data.fullName || ""}`,
              });
              logger.info(`[WhatsApp/RequestWizard] Native PDF sent to ${jid}`);
              pdfSent = true;
            }
          } catch (pdfErr) {
            logger.warn(`[WhatsApp/RequestWizard] Failed to send native PDF:`, { err: String(pdfErr) });
          }

          // If PDF could not be sent, inform the user and provide the download link
          if (!pdfSent) {
            const fallbackNote = `\n\n⚠️ للأسف لم نتمكن من إرسال ملف PDF مباشرة. يمكنك تحميله من الرابط التالي:\n${result.printUrl}`;
            await recordExchange(conversation.id, "", fallbackNote);
            await sendText(jid, fallbackNote);
          }
        } catch (genErr: any) {
          logger.error("[WhatsApp/RequestWizard] Generation error: " + (genErr?.stack || genErr?.message || String(genErr)));
          await sendText(jid, "⚠️ حدث خطأ أثناء توليد الوثيقة. يرجى المحاولة مجدداً أو كتابة *0* للقائمة الرئيسية.");
        }
        return;
      }

      // Next step
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, [WIZARD_META_KEY]: serializeWizardState(updatedWizard) } },
      });
      const nextQ = getCurrentQuestion(updatedWizard);
      await recordExchange(conversation.id, messageContent, nextQ);
      await sendText(jid, nextQ);
      return;
    }
    // ── End wizard block ─────────────────────────────────────────────────────

    // ── Ticket description awaiting ─────────────────────────────────────────
    // Intercept ticket content BEFORE it reaches the AI engine to prevent
    // false matches (e.g. "تدبير الدعم التربوي" matching SNAP office).
    if (metadata.awaitingTicketDescription === true) {
      if (messageContent.trim() === "0") {
        // Cancel ticket creation
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, awaitingTicketDescription: false, menuShown: true, awaitingMenuChoice: true } },
        });
        await recordExchange(conversation.id, messageContent, "");
        await sendText(jid, "✅ تم إلغاء التذكرة بنجاح.\n\nأرسل *0* للرجوع للقائمة الرئيسية.");
        return;
      }
      // Create a real ticket with the user's description
      try {
        const ticket = await prisma.ticket.create({
          data: {
            title: `تذكرة من واتساب — ${customerName}`,
            description: messageContent.trim(),
            status: "open",
            priority: "medium",
            type: "support",
            conversationId: conversation.id,
          },
        });
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, awaitingTicketDescription: false, menuShown: true, awaitingMenuChoice: false } },
        });
        const ackMsg = `✅ تم فتح التذكرة بنجاح!

🔢 رقم التذكرة: ${ticket.id}
📝 الموضوع: ${messageContent.trim()}

سيتم التواصل معك قريباً.

أرسل *0* للرجوع للقائمة الرئيسية.`;
        await recordExchange(conversation.id, messageContent, ackMsg);
        await sendText(jid, ackMsg);
        return;
      } catch (tickErr) {
        logger.warn("[WhatsApp] Failed to create ticket:", { error: String(tickErr) });
      }
      // Fall through to clear state even on error
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, awaitingTicketDescription: false } },
      });
    }

    // ── Suggestion / رemark awaiting ────────────────────────────────────────
    if (metadata.awaitingSuggestion === true && messageContent.trim() !== "اقتراح" && messageContent.trim() !== "ملاحظة") {
      // Save the suggestion as a ticket in the dashboard
      try {
        await (prisma as any).ticket.create({
          data: {
            title: `💡 اقتراح / ملاحظة — واتساب (${customerName})`,
            description: messageContent.trim(),
            status: "open",
            priority: "low",
            type: "suggestion",
            conversationId: conversation.id,
          },
        });
      } catch (sugErr) {
        logger.warn("[WhatsApp] Failed to save suggestion as ticket:", { error: String(sugErr) });
      }
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, awaitingSuggestion: false, menuShown: true, awaitingMenuChoice: true } },
      });
      const ackMsg = "✅ شكراً جزيلاً على ملاحظتك واقتراحك! تم تسجيلها وسيطلع عليها المسؤولون في أقرب وقت.\n\nأرسل *0* للرجوع للقائمة الرئيسية.";
      await recordExchange(conversation.id, messageContent, ackMsg);
      await sendText(jid, ackMsg);
      return;
    }

    // ── Suggestion trigger ───────────────────────────────────────────────────
    if (isSuggestionTrigger) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, awaitingSuggestion: true, menuShown: true, awaitingMenuChoice: false } },
      });
      const askMsg = "📨 *اقتراح / ملاحظة*\n\nشكراً لرغبتك في المشاركة! الرجاء كتابة ملاحظتك أو اقتراحك بشكل واضح وسنطلع عليها ونأخذها بعين الاعتبار:\n\n_(أرسل *0* للإلغاء والرجوع للقائمة)_";
      await recordExchange(conversation.id, messageContent, askMsg);
      await sendText(jid, askMsg);
      return;
    }
    // ── Bayan Newsletter Opt-in / Unsubscribe Handler ─────────────────────
    const normMsg = messageContent.trim().toLowerCase().replace(/[!.،؟?]+$/g, "");
    if (
      normMsg === "اشتراك" ||
      normMsg === "تفعيل البيانات" ||
      (metadata.awaitingBayanOptIn === true && ["نعم", "موافق", "اه", "اييه", "oui", "yes", "ok", "1"].includes(normMsg))
    ) {
      await subscribeCustomerToBayan(customerId, customerContact, conversation.id, metadata);
      const confirmText = [
        "✅ *تم تسجيلك بنجاح في خدمة مستجدات وبيانات الجامعة الوطنية للتعليم FNE!* 🕊️",
        "",
        "ستصلك أهم البيانات والبلاغات والمذكرات الوزارية فور صدورها.",
        "💡 _يمكنك إلغاء الاشتراك في أي وقت بإرسال كلمة: إلغاء الاشتراك._",
        "",
        "💬 اكتب سؤالك مباشرة أو أرسل *0* لاستعراض القائمة الرئيسية.",
      ].join("\n");
      await recordExchange(conversation.id, messageContent, confirmText);
      await sendText(jid, confirmText);
      return;
    }

    if (
      normMsg === "إلغاء الاشتراك" ||
      normMsg === "الغاء الاشتراك" ||
      (metadata.awaitingBayanOptIn === true && ["لا", "تخطي", "non", "no", "2"].includes(normMsg))
    ) {
      await unsubscribeCustomerFromBayan(customerId, conversation.id, metadata);
      const cancelText = normMsg.includes("الغاء") || normMsg.includes("إلغاء")
        ? "✅ تم إلغاء اشتراكك في خدمة البيانات بنجاح. لن تتلقى رسائل البث الإخبارية.\n\n💬 يمكنك سؤالي عن أي موضوع وسأجيبك فوراً!"
        : "👍 تم، لن يتم إرسال بيانات إخبارية. يمكنك الاستفادة من جميع خدمات المساعد وسؤاله في أي وقت!\n\n💬 اكتب سؤالك أو أرسل *0* للقائمة الرئيسية.";
      await recordExchange(conversation.id, messageContent, cancelText);
      await sendText(jid, cancelText);
      return;
    }

    // ── Forum Opt-in (55) / Opt-out (99) & Contribution Handler ──────────
    if (normMsg === "55") {
      await subscribeCustomerToForum(customerId, customerContact, conversation.id, {
        ...metadata,
        inForumMode: true,
        awaitingForumAnswer: true,
      });
      const activeTopic = await getActiveForumTopic();
      const topicDetails = activeTopic
        ? [
            `📌 *الموضوع الحالي المطروح للنقاش:*`,
            `« *${activeTopic.title}* »`,
            activeTopic.promptQuestion ? `\n${activeTopic.promptQuestion}\n` : "",
            `✍️ *للمشاركة برأيك:* أرسل تعقيبك أو مقترحك هنا مباشرة وسيتم تسجيله لمراجعته وتعميمه.`,
          ].filter(Boolean).join("\n")
        : "💡 تم تسجيل دخولك، ولكن لا يوجد موضوع مفتوح للنقاش حالياً. سنخبرك فور إطلاق نقاش جديد!";

      const forumOptInText = [
        "✅ *أهلاً بك في منتدى النقاش التفاعلي FNE!* 🕊️",
        "",
        topicDetails,
        "",
        "────────────────────",
        "🤖 *للخروج والعودة لطرح الأسئلة على المساعد الآلي:* أرسل الرقم *0* في أي وقت.",
        "⛔ *لإلغاء الاشتراك:* أرسل الرقم *99*.",
      ].join("\n");
      await recordExchange(conversation.id, messageContent, forumOptInText);
      await sendText(jid, forumOptInText);
      return;
    }

    if (normMsg === "99") {
      await unsubscribeCustomerFromForum(customerId, conversation.id, {
        ...metadata,
        inForumMode: false,
        awaitingForumAnswer: false,
      });
      const forumOptOutText = [
        "✅ *تم إلغاء اشتراكك في منتدى النقاش بنجاح.* ❌",
        "",
        "لن تصلك رسائل نقاشات المنتدى بعد الآن.",
        "💡 _يمكنك إعادة الاشتراك في أي وقت بإرسال الرقم 55._",
        "",
        "💬 يمكنك الاستمرار في استخدام مساعد FNE لطرح أي سؤال أو طلب إداري!",
      ].join("\n");
      await recordExchange(conversation.id, messageContent, forumOptOutText);
      await sendText(jid, forumOptOutText);
      return;
    }

    // Capture forum response if an active topic exists and user is responding to it
    const activeForum = await getActiveForumTopic();
    const isExplicitForumMsg =
      messageContent.includes("#منتدى") ||
      messageContent.includes("#نقاش") ||
      metadata.inForumMode === true ||
      metadata.awaitingForumAnswer === true;

    if (activeForum && isExplicitForumMsg && !directDigit && !greeting) {
      const cleanContent = messageContent.replace(/#منتدى|#نقاش/g, "").trim();
      if (cleanContent.length >= 2) {
        await submitForumPost({
          topicId: activeForum.id,
          customerId,
          authorName: customerName || "أحد الأساتذة",
          authorContact: customerContact,
          channel: "whatsapp",
          content: cleanContent,
        });
        const ackText = [
          "🤝 *شكراً لمشاركتك القيّمة في منتدى النقاش!*",
          `📌 حول موضوع: *${activeForum.title}*`,
          "",
          "✅ تم تسجيل تعقيبك بنجاح وهو قيد المراجعة قبل نشره للزملاء. 💬",
          "",
          "✍️ يمكنك إرسال تعقيب إضافي، أو:",
          "🤖 *للخروج والعودة لطرح الأسئلة على المساعد الآلي:* أرسل الرقم *0*.",
          "⛔ *لإلغاء الاشتراك:* أرسل الرقم *99*.",
        ].join("\n");
        await recordExchange(conversation.id, messageContent, ackText);
        await sendText(jid, ackText);
        return;
      }
    }

    const isDirectQuestion = !greeting && !directDigit && messageContent.trim().length > 3;

    if (isDirectQuestion && metadata.awaitingBayanOptIn) {
      metadata.awaitingBayanOptIn = false;
    }

    if ((!menuShown || greeting || isNewConversation) && !isDirectQuestion) {
      const shouldPromptBayan = metadata.bayanOptInPrompted !== true;
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...metadata,
            menuShown: true,
            awaitingMenuChoice: true,
            activeCategory: null,
            categoryPage: 1,
            pageArticleIds: [],
            awaitingBayanOptIn: shouldPromptBayan,
            bayanOptInPrompted: true,
          },
        },
      });
      let menuText = buildMenuText();
      if (shouldPromptBayan) {
        menuText += "\n\n📰 *مستجدات وبيانات FNE:*\nهل ترغب في التوصل بآخر البيانات والمستجدات عبر واتساب؟\nأرسل *نعم* للاشتراك، أو *لا* للتخطي.";
      }
      await recordExchange(conversation.id, messageContent, menuText);
      // Always send the FNE logo with the menu text as the caption (on every menu display)
      await sendMenuWithLogo(jid, attachNotice(menuText));
      logger.info(`[WhatsApp/Baileys] Menu (with logo) sent to ${customerContact}`);
      return;
    }


    if (directDigit === "0") {
      // If user was in forum mode, explicitly exit forum mode
      if (metadata.inForumMode === true) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              inForumMode: false,
              awaitingForumAnswer: false,
              menuShown: true,
              awaitingMenuChoice: true,
            },
          },
        });
        const exitText = "🔙 *تم الخروج من منتدى النقاش والعودة إلى المساعد الآلي.* 🕊️\n\n💬 يمكنك الآن طرح أي سؤال وسأجيبك فوراً، أو أرسل *0* لاستعراض القائمة الرئيسية.";
        await recordExchange(conversation.id, messageContent, exitText);
        await sendText(jid, exitText);
        return;
      }

      // Always leave the hub menu and return to the main service menu.
      if (metadata[HUB_MENU_META_KEY]) {
        clearHubMenuState(conversation.id);
      }
      logger.info(`[WhatsApp/Baileys] Back to menu requested by ${jid}`);
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...metadata,
            inForumMode: false,
            awaitingForumAnswer: false,
            menuShown: true,
            awaitingMenuChoice: true,
            activeCategory: null,
            categoryPage: 1,
            pageArticleIds: [],
            guidedCategory: null,
            guidedAnswerShown: false,
            [WIZARD_META_KEY]: null,
            [HUB_MENU_META_KEY]: null,
          },
        },
      });
      const menuText = buildMenuText();
      await recordExchange(conversation.id, messageContent, menuText);
      await sendMenuWithLogo(jid, attachNotice(menuText));
      return;
    }

    const guidedCategory = String(metadata.guidedCategory || "");
    const guidedQuestions = GUIDED_CATEGORY_QUESTIONS[guidedCategory];
    if (guidedQuestions && /^(رجوع|أسئلة|اسئلة)$/i.test(messageContent.trim())) {
      const questionsText = buildGuidedQuestionsText(guidedCategory);
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, guidedAnswerShown: false } },
      });
      await recordExchange(conversation.id, messageContent, questionsText);
      await sendText(jid, questionsText);
      return;
    }
    if (guidedQuestions && metadata.guidedAnswerShown === true && directDigit === guidedCategory) {
      const questionsText = buildGuidedQuestionsText(guidedCategory);
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, guidedAnswerShown: false } },
      });
      await recordExchange(conversation.id, messageContent, questionsText);
      await sendText(jid, questionsText);
      return;
    }
    if (guidedQuestions && directDigit && Number(directDigit) >= 1 && Number(directDigit) <= guidedQuestions.length) {
      const question = guidedQuestions[Number(directDigit) - 1];
      const answer = await sanitizeWhatsAppMessageAsync(await chat(conversation.id, question));
      const reply = `📌 *${question}*\n\n${answer}\n\n0️⃣ للقائمة الرئيسية\n↩️ أرسل *${guidedCategory}* للرجوع إلى أسئلة هذا القسم`;
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, guidedAnswerShown: true } },
      });
      await recordExchange(conversation.id, messageContent, reply);
      await sendText(jid, reply);
      return;
    }
    if (guidedQuestions && !directDigit && messageContent.trim()) {
      const answer = await sanitizeWhatsAppMessageAsync(await chat(conversation.id, messageContent));
      const reply = `${answer}\n\n0️⃣ للقائمة الرئيسية\n↩️ أرسل *${guidedCategory}* للرجوع إلى أسئلة هذا القسم`;
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...metadata,
            guidedCategory: null,
            guidedAnswerShown: false,
            selectedMenuChoice: null,
          },
        },
      });
      await recordExchange(conversation.id, messageContent, reply);
      await sendText(jid, reply);
      return;
    }

    if (metadata[HUB_MENU_META_KEY] && directDigit === "5") {
      restoreHubMenuState(conversation.id, "whatsapp", metadata[HUB_MENU_META_KEY]);
      const state = getHubMenuState(conversation.id);
      if (state && goBackHubMenu(conversation.id, state)) {
        await renderHubMenuText(jid, conversation.id, messageContent, metadata);
        return;
      }
    }

    // If user is in hub menu and sends a numeric selection, handle it
    if (metadata[HUB_MENU_META_KEY] && (directDigit || /^[A-Za-z]\.?$/.test(messageContent.trim()))) {
      restoreHubMenuState(conversation.id, "whatsapp", metadata[HUB_MENU_META_KEY]);
      const handled = await handleHubMenuCommand(jid, conversation.id, messageContent, metadata, true);
      if (handled) return;
    }

    // ── Choice 8: توليد الطلبات (hidden, for testing) ───────────────────────
    if (directDigit === "8") {
      logger.info(`[WhatsApp/Baileys] Request wizard triggered by ${jid}`);
      const initWizard: WizardState = { active: true, type: "ta3n_admin", step: 0, data: {}, subMenu: true };
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: false, activeCategory: null, [WIZARD_META_KEY]: serializeWizardState(initWizard) } },
      });
      const menuMsg = getRequestMenuText();
      await recordExchange(conversation.id, messageContent, menuMsg);
      await sendText(jid, menuMsg);
      return;
    }
    // ── End choice 8 ─────────────────────────────────────────────────────────

    if (!directDigit) {
      // A free-form question starts a new global context; stale state must not steer it.
      if (activeCategory || metadata.selectedMenuChoice || metadata.guidedCategory || metadata.pendingOfficeCandidate || metadata.pendingTicket) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              activeCategory: null,
              selectedMenuChoice: null,
              categoryPage: 1,
              pageArticleIds: [],
              guidedCategory: null,
              guidedAnswerShown: false,
              pendingOfficeCandidate: null,
              pendingTicket: null,
            },
          },
        });
      }
    } else if (activeCategory) {
      const trimmedLower = messageContent.trim().toLowerCase();
      // Numeric pagination: 6=next page, 7=previous page (shown in article list UI)
      const isNextPage = trimmedLower === "التالي" || trimmedLower === "next" || trimmedLower === ">" || trimmedLower === ">>" || directDigit === "6";
      const isPrevPage = trimmedLower === "السابق" || trimmedLower === "prev" || trimmedLower === "<" || trimmedLower === "<<" || directDigit === "7";

      // Next page
      if (isNextPage) {
        const nextPage = categoryPage + 1;
        const pageData = await buildCategoryPageText(activeCategory, nextPage);
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              categoryPage: pageData.currentPage,
              pageArticleIds: pageData.articleIds,
            },
          },
        });
        await recordExchange(conversation.id, messageContent, pageData.text);
        await sendText(jid, pageData.text);
        return;
      }

      // Previous page
      if (isPrevPage) {
        const prevPage = Math.max(1, categoryPage - 1);
        const pageData = await buildCategoryPageText(activeCategory, prevPage);
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              categoryPage: pageData.currentPage,
              pageArticleIds: pageData.articleIds,
            },
          },
        });
        await recordExchange(conversation.id, messageContent, pageData.text);
        await sendText(jid, pageData.text);
        return;
      }

      // 1 to 5: Select an article from current page
      if (directDigit && ["1", "2", "3", "4", "5"].includes(directDigit)) {
        const idx = Number(directDigit) - 1;
        if (pageArticleIds[idx]) {
          const article = await getArticleById(pageArticleIds[idx]);
          if (article) {
            await sendArticleMessages(jid, article, activeCategory, conversation.id, messageContent);
            return;
          }
        }
      }

      // If user sends 8 inside category -> trigger Request Wizard
      if (directDigit === "8") {
        logger.info(`[WhatsApp/Baileys] Request wizard triggered by ${jid}`);
        const initWizard: WizardState = { active: true, type: "ta3n_admin", step: 0, data: {}, subMenu: true };
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: false, activeCategory: null, [WIZARD_META_KEY]: serializeWizardState(initWizard) } },
        });
        const menuMsg = getRequestMenuText();
        await recordExchange(conversation.id, messageContent, menuMsg);
        await sendText(jid, menuMsg);
        return;
      }

      // If user sends 9 inside category -> show calc promotion notice
      if (directDigit === "9") {
        const promoText = PROMOTION_CALC_IN_PREP_TEXT;
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              activeCategory: null,
              categoryPage: 1,
              pageArticleIds: [],
              selectedMenuChoice: "9",
              selectedMenuLabel: MENU_LABELS["9"],
            },
          },
        });
        await recordExchange(conversation.id, messageContent, promoText);
        await sendText(jid, promoText);
        return;
      }

      // 6 and 7 are now used for pagination (next/prev page) — handled above via isNextPage/isPrevPage
    } else {
      // At Main Menu: 9 is Promotion calculation wizard
      if (directDigit === "9") {
        const initPromo: PromotionCalcState = {
          active: true,
          step: 0,
          data: {},
        };
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              menuShown: true,
              awaitingMenuChoice: false,
              activeCategory: null,
              categoryPage: 1,
              pageArticleIds: [],
              selectedMenuChoice: "9",
              selectedMenuLabel: MENU_LABELS["9"],
              [PROMO_CALC_META_KEY]: serializePromoCalcState(initPromo),
            },
          },
        });
        const firstQ = getPromoQuestion(initPromo);
        await recordExchange(conversation.id, messageContent, firstQ);
        await sendText(jid, firstQ);
        return;
      }

      // At Main Menu: 7 is Hub Digital Services & Adhesion
      if (directDigit === "7") {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              menuShown: true,
              activeCategory: null,
              categoryPage: 1,
              pageArticleIds: [],
              selectedMenuChoice: "7",
              selectedMenuLabel: MENU_LABELS["7"],
            },
          },
        });
        await recordExchange(conversation.id, messageContent, HUB_SERVICES_TEXT);
        await sendText(jid, HUB_SERVICES_TEXT);
        return;
      }

      // At Main Menu: 6 is ONLY category for dynamic news & articles
      if (directDigit === "6") {
        const pageData = await buildCategoryPageText("6", 1);
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              menuShown: true,
              activeCategory: "6",
              categoryPage: 1,
              pageArticleIds: pageData.articleIds,
              selectedMenuChoice: "6",
              selectedMenuLabel: MENU_LABELS["6"],
            },
          },
        });
        await recordExchange(conversation.id, messageContent, pageData.text);
        await sendText(jid, pageData.text);
        return;
      }

      // At Main Menu: 1 -> Hub Office Hierarchy Menu (overrides old category behavior)
      if (directDigit === "1") {
        clearHubMenuState(conversation.id);
        await renderHubMenuText(jid, conversation.id, messageContent, metadata);
        return;
      }
      // At Main Menu: categories 2 to 5 (Standard Knowledge & FAQ guidance)
      if (directDigit && ["2", "3", "4", "5"].includes(directDigit)) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...metadata,
              menuShown: true,
              activeCategory: null,
              guidedCategory: directDigit,
              guidedAnswerShown: false,
              categoryPage: 1,
              pageArticleIds: [],
              selectedMenuChoice: directDigit,
              selectedMenuLabel: MENU_LABELS[directDigit],
            },
          },
        });

        const replyText = buildGuidedQuestionsText(directDigit);
        await recordExchange(conversation.id, messageContent, replyText);
        await sendText(jid, replyText);
        return;
      }
    }

    logger.info(`[WhatsApp/Baileys] Question from ${customerName}: ${messageContent}`);

    // Check keyword triggers first — bypass AI for fixed keyword replies.
    const triggerReply = await checkKeywordTriggers(messageContent);
    if (triggerReply) {
      logger.info(`[WhatsApp/Baileys] Keyword trigger matched for "${messageContent}"`);
      await recordExchange(conversation.id, messageContent, triggerReply);
      await sendText(jid, attachNotice(triggerReply));
      return;
    }

    // Detect natural intent to generate a request (even without typing "8")
    if (!directDigit && detectRequestIntent(messageContent)) {
      logger.info(`[WhatsApp/Baileys] Request intent detected from free text for ${jid}`);
      const initWizard: WizardState = { active: true, type: "ta3n_admin", step: 0, data: {}, subMenu: true };
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, menuShown: true, awaitingMenuChoice: false, activeCategory: null, [WIZARD_META_KEY]: serializeWizardState(initWizard) } },
      });

      const menuMsg = getRequestMenuText();
      await recordExchange(conversation.id, messageContent, menuMsg);
      await sendText(jid, attachNotice(menuMsg));
      return;
    }

    const aiResponse = await chat(conversation.id, messageContent);
    const cleanResponse = await sanitizeWhatsAppMessageAsync(aiResponse);

    // If the AI asks for ticket description, set the awaitingTicketDescription state
    // so the next message goes directly to ticket creation (not office matching).
    if (/الرجاء وصف|وصف (?:مشكلتك|طلبك)|أرسل تفاصيل|ما هو طلبك/i.test(cleanResponse)) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, awaitingTicketDescription: true } },
      });
    }

    const cleanVoiceQuestion = messageContent.replace(/^[«"'\s*]+|[»"'\s*]+$/g, "").trim();
    const voicePrefix = wasVoice && cleanVoiceQuestion ? `*${cleanVoiceQuestion}*\n\n` : "";
    const fullReply = attachNotice(`${voicePrefix}${cleanResponse}\n\n📋 للرجوع للقائمة الرئيسية أرسل *0*${WA_FEEDBACK_FOOTER}`);
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

  const silentLogger = pino({ level: "info" });

  const socket = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS("Desktop"),
    logger: silentLogger,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  waState.sock = socket;

  const welcomedGroupsCache = new Set<string>();

  async function handleGroupWelcome(groupJid: string, groupSubject?: string) {
    if (!groupJid || !groupJid.endsWith("@g.us")) return;
    if (welcomedGroupsCache.has(groupJid)) return;

    try {
      let conv = await prisma.conversation.findFirst({
        where: { channel: "whatsapp", customerContact: groupJid },
      });

      if (conv?.metadata && (conv.metadata as Record<string, unknown>).welcomed === true) {
        welcomedGroupsCache.add(groupJid);
        return;
      }

      welcomedGroupsCache.add(groupJid);
      logger.info(`[WhatsApp/Group] Group ${groupJid} (${groupSubject || "No Subject"}) needs welcome message. Sending...`);

      const myJid = socket?.user?.id || "";
      const myNumber = myJid.split(":")[0].replace(/[^0-9]/g, "") || "212669305883";

      const welcomeText = `تحية نضالية لجميع الرفيقات والرفاق الأعزاء 🇲🇦🌹

يسرّنا إخباركم بأن هذا الرقم هو *المساعد الرقمي للجامعة الوطنية للتعليم FNE* 🤖

📌 *خدماتنا المتاحة رهن إشارتكم على مدار الساعة (24/7) :*
▫️ الاستفسارات الإدارية، النظام الأساسي، ومساطر الترقية.
▫️ الدخول المدرسي، وتدبير الفائض والخصاص.
▫️ توليد وتحميل المراسلات والطلبات الإدارية (PDF).
▫️ التواصل مع المكاتب الإقليمية والجهوية للجامعة وهواتف مسؤوليها.
▫️ الاطلاع الفوري على آخر البيانات والمقالات ومستجدات الساحة التعليمية.

💬 *للتواصل والاستفادة من الخدمات بشكل فردي ودون إزعاج المجموعة :*
يرجى مراسلتي مباشرة في *الخاص (Privé)* عبر الضغط على الرابط التالي :
👉 https://wa.me/${myNumber}

_عاشت الجامعة الوطنية للتعليم FNE نقابة مناضلة، ديمقراطية ومستقلة._`;

      await sendText(groupJid, welcomeText);
      logger.info(`[WhatsApp/Group] Welcome message successfully sent to ${groupJid}`);

      let groupName = groupSubject;
      if (!groupName) {
        try {
          if (socket && typeof (socket as any).groupMetadata === "function") {
            const meta = await (socket as any).groupMetadata(groupJid);
            if (meta?.subject) groupName = meta.subject;
          }
        } catch (_) { }
      }
      groupName = groupName || "مجموعة واتساب / Groupe FNE";

      if (!conv) {
        conv = await prisma.conversation.create({
          data: {
            channel: "whatsapp",
            customerName: groupName,
            customerContact: groupJid,
            status: "active",
            metadata: { isGroup: true, welcomed: true, welcomedAt: new Date().toISOString() },
          },
        });
      } else {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            customerName: groupName,
            metadata: { ...((conv.metadata as Record<string, unknown>) || {}), isGroup: true, welcomed: true, welcomedAt: new Date().toISOString() },
          },
        });
      }

      await prisma.message.create({
        data: {
          conversationId: conv.id,
          role: "assistant",
          content: welcomeText,
        },
      });
    } catch (grpErr) {
      logger.error("[WhatsApp/Group] Failed to send group welcome message:", { error: String(grpErr) });
    }
  }

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
      waState.lastConnectedAt = Date.now();
      logger.info(`[WhatsApp/Baileys] Connected at ${new Date(waState.lastConnectedAt).toISOString()}`);

      // Hydrate logoSentTo Set from conversation metadata so we don't
      // re-send the logo after Docker restarts.
      try {
        const sentConvs = await prisma.conversation.findMany({
          where: {
            channel: "whatsapp",
            metadata: { path: ["fneLogoSent"], equals: true },
          },
          select: { customerContact: true },
        });
        sentConvs.forEach((c) => {
          if (c.customerContact) waState.logoSentTo.add(c.customerContact);
        });
        logger.info(`[WhatsApp/Baileys] Hydrated logoSentTo for ${sentConvs.length} conversations`);
      } catch (err) {
        logger.warn("[WhatsApp/Baileys] Failed to hydrate logoSentTo:", { error: String(err) });
      }
      waState.isStarting = false;
      logger.info("[WhatsApp/Baileys] Connected successfully!");

      try {
        await prisma.channel.upsert({
          where: { type: "whatsapp" },
          update: { isActive: true, status: "connected" },
          create: { type: "whatsapp", isActive: true, status: "connected" },
        });
      } catch (_) { }

      // Scan all participating groups to welcome any newly joined groups
      setTimeout(async () => {
        try {
          if (socket && typeof socket.groupFetchAllParticipating === "function") {
            const groups = await socket.groupFetchAllParticipating();
            const groupJids = Object.keys(groups || {});
            logger.info(`[WhatsApp/Baileys] Found ${groupJids.length} participating groups on connect.`);
            for (const gJid of groupJids) {
              await handleGroupWelcome(gJid, groups[gJid]?.subject);
            }
          }
        } catch (grpErr) {
          logger.warn("[WhatsApp/Baileys] Group scan error on connect:", { error: String(grpErr) });
        }
      }, 4000);
    }

    if (connection === "close") {
      waState.lastDisconnectedAt = Date.now();
      logger.info(`[WhatsApp/Baileys] Disconnected at ${new Date(waState.lastDisconnectedAt).toISOString()}`);
      const error = lastDisconnect?.error as Boom | undefined;
      const statusCode = error?.output?.statusCode;
      // In Baileys, 401 = loggedOut (device unlinked from phone).
      // 403 = forbidden (account banned by Meta).
      // 428 = connectionClosed (normal socket drop / network glitch) -> MUST RECONNECT, NEVER delete session!
      // 408 = connectionLost / timedOut -> reconnect.
      // 515 = restartRequired -> reconnect.
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
      const isBanned = statusCode === 403;
      const shouldReconnect = !isLoggedOut && !isBanned;

      logger.info(
        `[WhatsApp/Baileys] Connection closed. statusCode=${statusCode}, shouldReconnect=${shouldReconnect}`
      );
      waState.connectionStatus = "disconnected";
      waState.statusMessage = "Disconnected";
      waState.sock = null;

      // If we are manually stopping (force reconnect), do NOT auto-reconnect here.
      // startWhatsAppInit will launch its own fresh startBaileys call.
      if (waState.isManuallyStopping) {
        logger.info("[WhatsApp/Baileys] Manual stop in progress — skipping auto-reconnect");
        return;
      }

      // Specific guidance for banned / logged-out accounts
      if (isBanned) {
        waState.statusMessage = "BLOQUÉ: compte WhatsApp banni (403). Faites appel sur https://www.whatsapp.com/contact/";
      } else if (isLoggedOut) {
        waState.statusMessage = "Session expirée (déconnecté depuis le téléphone). Reconnectez-vous depuis le tableau de bord.";
      } else {
        waState.statusMessage = "Connexion fermée temporairement. Reconnexion en cours...";
      }

      try {
        await prisma.channel.upsert({
          where: { type: "whatsapp" },
          update: { isActive: false, status: "disconnected" },
          create: { type: "whatsapp", isActive: false, status: "disconnected" },
        });
      } catch (_) { }

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
        } catch (_) { }
        waState.isStarting = false;
        waState.connectionStatus = "disconnected";
        waState.statusMessage = "Logged out. Please reconnect from the dashboard.";
        await alertAdminOnDisconnect("Session WhatsApp expirée ou invalidée. Veuillez rescan le QR depuis le tableau de bord.");
      } else {
        waState.isStarting = false;
        waState.connectionStatus = "error";
        waState.statusMessage = "Failed to reconnect after multiple attempts.";
        await alertAdminOnDisconnect("Échec de reconnexion WhatsApp après plusieurs tentatives. Vérifiez le serveur.");
      }
    }
  });

  // Synchronize past chat history when phone connects/syncs
  socket.ev.on("messaging-history.set", async (historyPayload: any) => {
    const historyMsgs = historyPayload?.messages;
    logger.info(`[WhatsApp/Baileys] History sync received: ${historyMsgs?.length ?? 0} messages`);
    if (!historyMsgs || !Array.isArray(historyMsgs)) return;
    for (const msg of historyMsgs) {
      try {
        const jid = msg.key?.remoteJid;
        if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid === "status@broadcast") continue;
        const body = extractMessageContent(msg);
        if (!body) continue;

        let conv = await prisma.conversation.findFirst({
          where: { channel: "whatsapp", customerContact: jid },
        });
        if (!conv) {
          const name = msg.pushName || "WhatsApp User";
          conv = await prisma.conversation.create({
            data: { channel: "whatsapp", customerName: name, customerContact: jid, status: "active" },
          });
        }
        const existing = await prisma.message.findFirst({
          where: { conversationId: conv.id, content: body },
        });
        if (!existing) {
          await prisma.message.create({
            data: {
              conversationId: conv.id,
              role: msg.key?.fromMe ? "admin" : "customer",
              content: body,
              createdAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
            },
          });
        }
      } catch (_) { }
    }
  });

  // Send polite one-time introduction when bot is added to a WhatsApp group
  socket.ev.on("group-participants.update", async (event: any) => {
    try {
      const { id: groupJid, participants, action } = event;
      if (action !== "add" || !Array.isArray(participants)) return;

      const myJid = socket?.user?.id || "";
      const myNumber = myJid.split(":")[0].replace(/[^0-9]/g, "") || "212669305883";
      const myLid = (socket?.user as any)?.lid?.split(":")[0]?.replace(/[^0-9]/g, "") || "";

      // Check both phone number JID and LID format
      const isBotAdded = participants.some((p: string) => {
        const cleaned = p.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
        return (myNumber && cleaned === myNumber) || (myLid && cleaned === myLid) || (myJid && p.startsWith(myJid.split(":")[0]));
      });

      if (isBotAdded) {
        logger.info(`[WhatsApp/Group] Bot was added to group ${groupJid}! Triggering welcome...`);
        await handleGroupWelcome(groupJid);
      }
    } catch (grpErr) {
      logger.error("[WhatsApp/Group] Error in group-participants.update:", grpErr);
    }
  });

  socket.ev.on("messages.upsert", async (payload) => {
    const { messages: msgs, type } = payload;
    logger.info(`[WhatsApp/Baileys] UPSERT EVENT RECEIVED. Type: ${type}, Msgs: ${msgs.length}`);
    for (const msg of msgs) {
      const jid = msg.key?.remoteJid;
      if (!jid) continue;

      // Group interception: Silent Watch Mode (learn from group chatter without sending any message)
      if (jid.endsWith("@g.us")) {
        try {
          await handleGroupWelcome(jid);
          if (!msg.key.fromMe && msg.message) {
            const body = extractMessageContent(msg);
            if (body) {
              const senderJid = (msg.key as any)?.participant || jid;
              const senderName = msg.pushName || "Unknown";

              let groupName = "مجموعة واتساب";
              try {
                if (socket && typeof (socket as any).groupMetadata === "function") {
                  const meta = await (socket as any).groupMetadata(jid);
                  if (meta?.subject) groupName = meta.subject;
                }
              } catch (_) { }

              await recordGroupMessageWatch({
                groupJid: jid,
                groupName,
                senderJid,
                senderName,
                content: body,
              });
            }
          }
        } catch (grpErr) {
          logger.warn("[WhatsApp/GroupWatch] Error processing group message:", { error: String(grpErr) });
        }
        continue;
      }

      if (jid.endsWith("@broadcast") || jid === "status@broadcast") continue;
      if (!msg.message) continue;

      let body = extractMessageContent(msg);
      let wasVoice = false;

      // Check if message is a voice / audio note
      const mObj = msg.message as any;
      const isAudio = Boolean(
        mObj?.audioMessage ||
        mObj?.ephemeralMessage?.message?.audioMessage ||
        mObj?.viewOnceMessage?.message?.audioMessage ||
        mObj?.viewOnceMessageV2?.message?.audioMessage
      );

      if (!body && isAudio && !msg.key.fromMe) {
        try {
          logger.info(`[WhatsApp/Voice] Incoming voice note from ${jid}, downloading media...`);
          const audioBuffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
              logger: logger as any,
              reuploadRequest: (socket as any).updateMediaMessage,
            }
          );
          if (audioBuffer && audioBuffer.length > 0) {
            logger.info(`[WhatsApp/Voice] Downloaded ${audioBuffer.length} bytes, transcribing with Groq Whisper...`);
            const transcribed = await transcribeAudioBuffer(audioBuffer, "audio/ogg");
            if (transcribed && transcribed.trim()) {
              body = transcribed.trim();
              wasVoice = true;
              logger.info(`[WhatsApp/Voice] Voice transcribed for ${jid}: "${body}"`);
            }
          }
        } catch (vErr) {
          logger.error(`[WhatsApp/Voice] Error transcribing voice note from ${jid}:`, { error: String(vErr) });
          await sendText(jid, "عذراً رفيقي/رفيقتي، تعذر تفريغ الرسالة الصوتية بوضوح. يُرجى التفضل بإعادة إرسال الصوت أو كتابة استفساركم نصياً وسنجيبكم فوراً.");
          continue;
        }
      }

      if (!body) continue;

      // When the admin sends a message to the user from the WhatsApp phone app
      if (msg.key.fromMe) {
        logger.info(`[WhatsApp/Baileys] Outbound message from phone to ${jid}: "${body.substring(0, 50)}"`);
        try {
          const conv = await prisma.conversation.findFirst({
            where: { channel: "whatsapp", customerContact: jid },
            orderBy: { updatedAt: "desc" },
          });
          if (conv) {
            const existing = await prisma.message.findFirst({
              where: { conversationId: conv.id, content: body },
            });
            if (!existing) {
              await prisma.message.create({
                data: {
                  conversationId: conv.id,
                  role: "admin",
                  content: body,
                  createdAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
                },
              });
              await prisma.conversation.update({
                where: { id: conv.id },
                data: { updatedAt: new Date() },
              });
            }
          }
        } catch (e) {
          logger.warn("[WhatsApp/Baileys] Failed to save outbound phone message:", { error: String(e) });
        }
        continue;
      }

      // Incoming customer message
      const pushName = msg.pushName ?? undefined;
      const messageId = msg.key.id ?? undefined;

      if (type === "notify") {
        const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
        const queueItem: InboundQueueItem = {
          jid,
          body,
          pushName,
          messageId,
          wasVoice,
          timestamp: msgTime,
        };

        const isRecentlyConnected =
          waState.lastConnectedAt > 0 && Date.now() - waState.lastConnectedAt < 30000;
        const debounceMs = isRecentlyConnected ? 2500 : 1200;

        const existingQueue = inboundDebounceMap.get(jid);
        if (existingQueue) {
          clearTimeout(existingQueue.timer);
          existingQueue.items.push(queueItem);
          existingQueue.timer = setTimeout(
            () => void processDebouncedInbound(jid),
            debounceMs
          );
        } else {
          inboundDebounceMap.set(jid, {
            items: [queueItem],
            timer: setTimeout(
              () => void processDebouncedInbound(jid),
              debounceMs
            ),
          });
        }
      } else if (type === "append") {
        // Appended history message: record without re-triggering AI
        try {
          const conv = await prisma.conversation.findFirst({
            where: { channel: "whatsapp", customerContact: jid },
            orderBy: { updatedAt: "desc" },
          });
          if (conv) {
            const existing = await prisma.message.findFirst({
              where: { conversationId: conv.id, content: body },
            });
            if (!existing) {
              await prisma.message.create({
                data: {
                  conversationId: conv.id,
                  role: "customer",
                  content: body,
                  createdAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
                },
              });
            }
          }
        } catch (_) { }
      }
    }
  });
}

async function processDebouncedInbound(jid: string): Promise<void> {
  const queue = inboundDebounceMap.get(jid);
  inboundDebounceMap.delete(jid);
  if (!queue || queue.items.length === 0) return;

  const items = queue.items;

  // Determine if this batch contains catch-up messages from disconnection or network delay
  const isCatchUp = items.some((it) => {
    const isLagged = Date.now() - it.timestamp > 30000;
    const duringDowntime =
      waState.lastConnectedAt > 0 &&
      it.timestamp < waState.lastConnectedAt - 2000 &&
      Date.now() - waState.lastConnectedAt < 60000;
    return isLagged || duringDowntime;
  });

  // 1. Ensure ALL intermediate messages in the batch are saved to Prisma message history
  for (const it of items) {
    try {
      const cId = await resolveCustomer("whatsapp", jid, it.pushName || "Unknown");
      let conv = await prisma.conversation.findFirst({
        where: { channel: "whatsapp", customerContact: jid },
      });
      if (!conv) {
        conv = await createNewConversation("whatsapp", it.pushName || "Unknown", jid, cId);
      }
      const existingMsg = await prisma.message.findFirst({
        where: { conversationId: conv.id, content: it.body },
      });
      if (!existingMsg) {
        await prisma.message.create({
          data: {
            conversationId: conv.id,
            role: "customer",
            content: it.body,
            createdAt: new Date(it.timestamp),
          },
        });
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { updatedAt: new Date() },
        });
      }
    } catch (dbErr) {
      logger.warn("[WhatsApp/Debounce] Failed to persist buffered message:", { error: String(dbErr) });
    }
  }

  // 2. Select target message to answer:
  // If multiple messages, prioritize the latest substantive inquiry, else the last message
  let target = items[items.length - 1];
  if (items.length > 1) {
    const substantive = items
      .slice()
      .reverse()
      .find((it) => isLegitimateKnowledgeQuestion(it.body));
    if (substantive) {
      target = substantive;
    }
  }

  // 3. Prepare reconnect reassurance banner if caught up after a disconnection
  const reconnectNotice = isCatchUp
    ? "🔄 *مرحباً بك رفيقي/رفيقتي.. تم استرجاع الاتصال بنجاح ونعتذر عن هذا التأخر المؤقت.* 🕊️\n\n"
    : "";

  try {
    await handleIncomingMessage(
      target.jid,
      target.body,
      target.pushName,
      target.messageId,
      target.wasVoice,
      reconnectNotice
    );
  } catch (err) {
    logger.error("[WhatsApp/Debounce] Error handling debounced message:", { error: String(err) });
  }
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
    waState.isManuallyStopping = true;
    try {
      waState.sock.end(undefined as unknown as Error);
    } catch (_) { }
    waState.sock = null;
  }
  if (waState.reconnectTimeout) {
    clearTimeout(waState.reconnectTimeout);
    waState.reconnectTimeout = null;
  }

  waState.isStarting = true;
  waState.isManuallyStopping = false;
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
    } catch (_) { }
    waState.sock = null;
  }
  waState.connectionStatus = "disconnected";
  waState.statusMessage = "Disconnected";
}

export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  if (!waState.sock || waState.connectionStatus !== "connected") return false;
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  const cleanResponse = await sanitizeWhatsAppMessageAsync(message);
  await sendText(jid, cleanResponse);
  return true;
}
