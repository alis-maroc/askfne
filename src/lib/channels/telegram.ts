import { prisma } from "@/lib/prisma";
import { chat, createNewConversation } from "@/lib/ai/engine";
import { resolveCustomer } from "@/lib/customer-resolver";
import { logger } from "@/lib/logger";
import {
  buildRootMenu,
  buildNationalMenu,
  buildRegionsMenu,
  buildProvincesMenu,
  buildParallelBranchesMenu,
  formatMenuText,
  formatMenuAsTelegramKeyboard,
  formatOfficeContacts,
  getHubMenuState,
  setHubMenuState,
  clearHubMenuState,
  restoreHubMenuState,
  cleanOfficeName,
  goBackHubMenu,
  parseSelection,
  getLastMenuItems,
  setLastMenuItems,
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
} from "@/lib/hub-offices";
import { cleanArticleBodyForChat, getArticleById, getCategoryArticles, GUIDED_CATEGORY_QUESTIONS, MENU_CATEGORIES } from "./dynamic-menu";
import { getCurrentQuestion, processAnswer, isComplete, serializeWizardState, type WizardState } from "@/lib/requests/wizard";
import { REQUEST_TYPES, type RequestType } from "@/lib/requests/types";
import { buildDeliveryMessage, generateAdminRequest } from "@/lib/requests/generator";
import { generateRequestPdf } from "@/lib/requests/pdf-generator";
import {
  processPromoAnswer,
  getPromoQuestion,
  formatPromoSummary,
  serializePromoCalcState,
  type PromotionCalcState,
} from "@/lib/requests/promotion-calc";

const PROMO_CALC_META_KEY = "promoCalcState";

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramSenderChat {
  id: number;
  type?: string;
  title?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramSenderChat;
  chat: TelegramChat;
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
}

const TELEGRAM_TEXT_LIMIT = 4096;
const TELEGRAM_CATEGORY_META_KEY = "telegramCategory";
const TELEGRAM_DOCUMENT_META_KEY = "telegramDocumentWizard";

function telegramWelcomeText(): string {
  return [
    "مرحباً بك الرفيق/ة في المساعد الرقمي للجامعة الوطنية للتعليم FNE 👋",
    "",
    "💬 اكتب سؤالك مباشرة في أي وقت وسأجيبك فوراً!",
    "",
    "📌 أو أرسل *1* لاستعراض المكاتب والتنظيم النقابي",
    "🏠 لإعادة هذه القائمة اضغط الزر أدناه أو أرسل /start",
  ].join("\n");
}

const TELEGRAM_SERVICE_MENU: HubMenuItem[] = [
  { id: "service:offices", label: "🏢 المكاتب والتنظيم النقابي" },
  { id: "service:statutes", label: "📜 القانون الأساسي للجامعة FNE" },
  { id: "service:calendar", label: "📅 مقرر السنة الدراسية والعطل" },
  { id: "service:public-service", label: "⚖️ النظام الأساسي والوظيفة العمومية" },
  { id: "service:school", label: "🎒 الدخول المدرسي والحركة الانتقالية" },
  { id: "service:news", label: "📢 آخر البيانات والمستجدات" },
  { id: "service:hub", label: "🤝 الانخراط والخدمات الرقمية (Hub)" },
  { id: "service:documents", label: "📄 توليد المراسلات والطلبات الإدارية (PDF)" },
  { id: "service:promotion", label: "🧮 حساب وتدقيق نقط الترقية" },
  { id: "service:suggestion", label: "📨 ملاحظة أو اقتراح للجامعة" },
];

const TELEGRAM_SERVICE_PROMPTS: Record<string, string> = {
  "service:documents": "📄 توليد المراسلات والطلبات الإدارية\n\nاكتب نوع الطلب أو المراسلة التي تريد إعدادها.",
  "service:suggestion": "📨 اكتب ملاحظتك أو اقتراحك للجامعة مباشرة.",
};

const TELEGRAM_CATEGORY_SERVICES: Record<string, string> = {
  "service:statutes": "2",
  "service:calendar": "3",
  "service:public-service": "4",
  "service:school": "5",
  "service:news": "6",
};

async function renderTelegramServiceMenu(token: string, chatId: number): Promise<void> {
  const welcomeText = [
    "🏛️ *المساعد الرقمي للجامعة الوطنية للتعليم FNE*",
    "━━━━━━━━━━━━━━━━━━━━",
    "مرحباً بك الرفيق/ة 👋",
    "",
    "رهن إشارتكم لتسهيل الوصول للمعلومات والنصوص القانونية والتوجيهات النقابية.",
    "",
    "💬 *اكتب سؤالك مباشرة* وسأجيبك فوراً!",
    "",
    "📌 *أو اختر أحد الخدمات أدناه:*",
  ].join("\n");

  await sendTelegramMessageWithKeyboard(
    token,
    chatId,
    welcomeText,
    formatMenuAsTelegramKeyboard(TELEGRAM_SERVICE_MENU)
  );
}

async function sendTelegramScreen(token: string, chatId: number, text: string): Promise<void> {
  await sendTelegramMessageWithKeyboard(token, chatId, text, [[{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }]]);
}

async function renderTelegramDocumentMenu(token: string, chatId: number): Promise<void> {
  const items: HubMenuItem[] = (Object.keys(REQUEST_TYPES) as RequestType[]).map((type) => ({
    id: `document:type:${type}`,
    label: `${REQUEST_TYPES[type].emoji} ${REQUEST_TYPES[type].label}`,
  }));
  await sendTelegramMessageWithKeyboard(token, chatId, "📄 توليد المراسلات والطلبات الإدارية\nاختر نوع الوثيقة:", [
    ...formatMenuAsTelegramKeyboard(items),
    [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
  ]);
}

async function getTelegramToken(): Promise<string> {
  const settings = await prisma.settings.findFirst({
    select: { telegramBotToken: true },
  });
  if (settings?.telegramBotToken) return settings.telegramBotToken;
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;

  const channel = await prisma.channel.findUnique({
    where: { type: "telegram" },
    select: { config: true },
  });
  const config = (channel?.config || {}) as Record<string, unknown>;
  const fromConfig = config.token || config.botToken;
  return typeof fromConfig === "string" ? fromConfig : "";
}

function isTelegramInHubMenu(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  const raw = metadata[HUB_MENU_META_KEY];
  return raw != null && typeof raw === "object";
}

function normalizeDigitCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const western = trimmed
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
  const match = western.match(/^([0-9])$/);
  return match ? match[1] : null;
}

function isHubMenuTrigger(text: string): boolean {
  const trimmed = text.trim();
  if (normalizeDigitCommand(trimmed) === "1") return true;
  if (/^(المكاتب|التنظيم|مكاتب|قائمة المكاتب|hub|فروع|جهوي|إقليمي|محلي)$/i.test(trimmed)) return true;
  return false;
}

function isStartCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === "/start" ||
    trimmed.startsWith("/start ") ||
    trimmed === "start" ||
    trimmed === "قائمة" ||
    trimmed === "menu" ||
    trimmed === "0" ||
    trimmed === "٠" ||  // Arabic-indic zero
    trimmed === "۰" ||  // Eastern Arabic-indic zero
    normalizeDigitCommand(text) === "0"
  );
}

function isHubNavigationInput(text: string): boolean {
  if (normalizeDigitCommand(text) !== null) return true;
  const trimmed = text.trim();
  if (trimmed === "رجوع" || /^back$/i.test(trimmed)) return true;
  if (/^(hub:back|menu:main|regional|provincial|local|parallel|national|search|fne_national|region:\d+|prov:\d+|branch:\d+|parallel:[^\s]+)$/.test(trimmed)) return true;
  return isHubMenuTrigger(text);
}

async function persistHubMetadata(
  conversationId: string,
  metadata: Record<string, unknown>,
  hubState: Record<string, unknown> | null
): Promise<void> {
  try {
    const nextMeta: Record<string, unknown> = {
      ...metadata,
      telegramChatId: metadata.telegramChatId,
    };
    if (hubState) {
      nextMeta[HUB_MENU_META_KEY] = hubState;
    } else {
      nextMeta[HUB_MENU_META_KEY] = null;
    }
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { metadata: JSON.parse(JSON.stringify(nextMeta)) },
    });
  } catch (err) {
    logger.warn("[Telegram] Failed to persist hub menu state:", { error: String(err) });
  }
}

async function exitHubMenu(conversationId: string, metadata: Record<string, unknown>): Promise<void> {
  clearHubMenuState(conversationId);
  await persistHubMetadata(conversationId, metadata, null);
}

async function getHubMenuItemsForStateTelegram(state: HubMenuState): Promise<HubMenuItem[]> {
  if (state.level === "root") return buildRootMenu();
  if (state.level === "national") {
    const parallelOrgs = await fetchParallelOrganizations().catch(() => []);
    return buildNationalMenu(parallelOrgs);
  }
  if (state.level === "regions") {
    const rootOffices = await fetchRootOffices().catch(() => []);
    return buildRegionsMenu(rootOffices);
  }
  if (state.level === "provinces" && state.parentId !== undefined) {
    const offices = await fetchOfficesByParentId(state.parentId).catch(() => []);
    return buildProvincesMenu(offices);
  }
  if (state.level === "parallelBranches" && state.parentId !== undefined) {
    const branches = await fetchParallelBranches(state.parentId).catch(() => []);
    const organizations = await fetchParallelOrganizations().catch(() => []);
    const nationalOffice = organizations.find((office) => office.name.includes(state.searchTerm || ""));
    return buildParallelBranchesMenu(branches, nationalOffice);
  }
  if (state.level === "local" && state.parentId !== undefined) {
    const offices = await fetchOfficesByParentId(state.parentId).catch(() => []);
    return buildProvincesMenu(offices, "🏠");
  }
  return [];
}

async function processHubMenuSelectionTelegram(
  chatId: number,
  conversationId: string,
  messageText: string,
  currentState: HubMenuState,
  selected: HubMenuItem,
  metadata: Record<string, unknown>
): Promise<void> {
  const convId = conversationId;
  const token = await getTelegramToken();
  if (!token) {
    logger.error("[Telegram] No token available for hub menu");
    return;
  }

  if (selected.id.startsWith("region:") && currentState.mode === "regional") {
    const region = selected.office || (await fetchRootOffices().catch(() => [])).find((office) => office.name === selected.officeName);
    if (region) {
      await sendTelegramMessage(token, chatId, formatOfficeContacts(region));
      return;
    }
  }

  if (selected.id.startsWith("prov:") && currentState.mode === "local" && currentState.level === "provinces") {
    if (!selected.parentId) {
      await sendTelegramMessage(token, chatId, "⚠️ تعذّر إيجاد المكاتب المحلية لهذا الإقليم.");
      return;
    }
    const nextState = setHubMenuState(
      convId,
      "telegram",
      "local",
      selected.parentId,
      selected.label,
      undefined,
      currentState
    );
    nextState.mode = "local";
    await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
    return;
  }

  if (selected.office && (selected.id === "parallel-national" || selected.id.startsWith("prov:") || selected.id.startsWith("branch:"))) {
    const office = selected.office;
    if (office) {
      const text = formatOfficeContacts(office);
      await sendTelegramMessageWithKeyboard(token, chatId, text, [
        [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
      ]);
      return;
    }
  }

  if (selected.id === "national") {
    const offices = await fetchHubOffices("FNE").catch(() => []);
    const office = offices.find((o) => o.level === "وطني") || offices[0];
    if (office) {
      const text = formatOfficeContacts(office);
      await sendTelegramMessageWithKeyboard(token, chatId, text, [
        [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
      ]);
      return;
    }
  } else if (selected.id === "regional") {
    const nextState = setHubMenuState(convId, "telegram", "regions", undefined, "المكاتب الجهوية", undefined, currentState);
    nextState.mode = "regional";
    await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
    return;
  } else if (selected.id === "provincial") {
    const nextState = setHubMenuState(convId, "telegram", "regions", undefined, "اختر جهة أولاً", undefined, currentState);
    nextState.mode = "provincial";
    await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
    return;
  } else if (selected.id === "local") {
    const nextState = setHubMenuState(convId, "telegram", "regions", undefined, "اختر جهة أولاً", undefined, currentState);
    nextState.mode = "local";
    await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
    return;
  } else if (selected.id === "parallel") {
    const nextState = setHubMenuState(convId, "telegram", "national", undefined, "التنظيمات الموازية", undefined, currentState);
    nextState.mode = "parallel";
    await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
    return;
  } else if (selected.id === "search") {
    await exitHubMenu(convId, metadata);
    await sendTelegramMessage(token, chatId, "✏️ أرسل اسم المكتب أو الإقليم للبحث عنه.");
    return;
  } else if (selected.id.startsWith("parallel:")) {
    if (selected.parentId) {
      const nextState = setHubMenuState(convId, "telegram", "parallelBranches", selected.parentId, selected.label, selected.searchTerm, currentState);
      nextState.mode = "parallel";
      await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
      return;
    }
    const organizations = await fetchParallelOrganizations().catch(() => []);
    const organization = organizations.find((office) => office.name.includes(selected.searchTerm || ""));
    if (organization) {
      await sendTelegramMessage(token, chatId, formatOfficeContacts(organization));
      return;
    }
  } else if (selected.id.startsWith("region:")) {
    const rootOffices = await fetchRootOffices().catch(() => []);
    const region = rootOffices.find((office) => office.name === selected.officeName);
    if (!region?.parentId) {
      await sendTelegramMessage(token, chatId, "⚠️ تعذّر إيجاد المكاتب الإقليمية لهذه الجهة.");
      return;
    }
    const nextState = setHubMenuState(convId, "telegram", "provinces", region.parentId, selected.label, undefined, currentState);
    nextState.mode = currentState.mode || "provincial";
    await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
    return;
  } else if (selected.id.startsWith("branch:")) {
    const branches = currentState.parentId ? await fetchParallelBranches(currentState.parentId).catch(() => []) : [];
    const branch = selected.office || branches.find((entry) => entry.name === selected.officeName);
    if (branch) {
      const text = formatOfficeContacts(branch);
      await sendTelegramMessage(token, chatId, text);
      return;
    }
  }

  await renderHubMenuTextTelegram(chatId, conversationId, messageText, metadata);
}

async function handleHubMenuCommandTelegram(
  chatId: number,
  conversationId: string,
  messageContent: string,
  metadata: Record<string, unknown>,
  isInHubMenu: boolean
): Promise<boolean> {
  // "0" always returns to main menu, even if not in hub menu
  const trimmed = messageContent.trim();
  if (trimmed === "0" || normalizeDigitCommand(trimmed) === "0") {
    await exitHubMenu(conversationId, metadata);
    const token = await getTelegramToken();
    if (token) await sendTelegramMessageWithKeyboard(token, chatId, telegramWelcomeText(), [
      [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
    ]);
    return true;
  }

  if (!isInHubMenu && !isHubMenuTrigger(messageContent)) return false;

  const convId = conversationId;
  restoreHubMenuState(convId, "telegram", metadata[HUB_MENU_META_KEY]);
  const currentState = getHubMenuState(convId);

  // "0" or "رجوع" always returns to main menu (not just one level back)
  const isMainMenuTrigger = trimmed === "0" || trimmed === "رجوع" || /^back$/i.test(trimmed) || normalizeDigitCommand(trimmed) === "0";
  if (isMainMenuTrigger) {
    await exitHubMenu(convId, metadata);
    const token = await getTelegramToken();
    if (token) await sendTelegramMessageWithKeyboard(token, chatId, telegramWelcomeText(), [
      [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
    ]);
    return true;
  }

  if (trimmed === "hub:back" && currentState?.backState) {
    setHubMenuState(
      convId,
      "telegram",
      currentState.backState.level,
      currentState.backState.parentId,
      currentState.backState.parentLabel,
      currentState.backState.searchTerm,
      currentState.backState.backState
    ).mode = currentState.backState.mode;
    await renderHubMenuTextTelegram(chatId, conversationId, messageContent, metadata);
    return true;
  }

  if (!currentState || currentState.level === "root") {
    // At root level: parse as a root menu selection
    const rootItems = buildRootMenu();
    const selected = parseSelection(trimmed, rootItems);
    if (selected) {
      await processHubMenuSelectionTelegram(
        chatId,
        conversationId,
        messageContent,
        { level: "root", conversationId, channel: "telegram", timestamp: Date.now() },
        selected,
        metadata
      );
      return true;
    }
    // Invalid selection at root, just re-render
    await renderHubMenuTextTelegram(chatId, conversationId, messageContent, metadata);
    return true;
  }

  // Deeper menu level: get items for current state
  const items = await getHubMenuItemsForStateTelegram(currentState);
  if (items.length === 0) {
    const token = await getTelegramToken();
    if (token) {
      await sendTelegramMessage(token, chatId, "❌ تعذّر تحميل القائمة. حاول مرة أخرى.");
    }
    await exitHubMenu(convId, metadata);
    return true;
  }

  const selected = parseSelection(trimmed, items);

  if (!selected) {
    const token = await getTelegramToken();
    if (token) {
      await sendTelegramMessageWithKeyboard(token, chatId, "⚠️ اختيار غير صحيح. اختر أحد الأزرار الظاهرة.", [
        [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
      ]);
    }
    return true;
  }

  await processHubMenuSelectionTelegram(chatId, conversationId, messageContent, currentState, selected, metadata);
  return true;
}

async function renderHubMenuTextTelegram(
  chatId: number,
  conversationId: string,
  _userInput: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const convId = conversationId;
  const token = await getTelegramToken();
  if (!token) {
    logger.error("[Telegram] No token available for hub menu");
    return;
  }

  let state = getHubMenuState(convId);
  if (!state) {
    clearHubMenuState(convId);
    state = setHubMenuState(convId, "telegram", "root");
    const items = buildRootMenu();
    setLastMenuItems(convId, items);
    const text = "مكاتب الجامعة الوطنية للتعليم FNE\nاختر القسم:";
    const keyboard = formatMenuAsTelegramKeyboard(items);
    keyboard.push([{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }]);
    await sendTelegramMessageWithKeyboard(token, chatId, text, keyboard);
    await persistHubMetadata(convId, metadata, { level: "root" });
    return;
  }

  const items = await getHubMenuItemsForStateTelegram(state);
  setLastMenuItems(convId, items);
  let title = "اختر:";
  if (state.level === "root") title = "مكاتب الجامعة الوطنية للتعليم FNE";
  else if (state.level === "national") title = "القيادة الوطنية والتنظيمات الموازية";
  else if (state.level === "regions") title = "المكاتب الجهوية (12 جهة)";
  else if (state.level === "provinces") title = state.parentLabel || "المكاتب الإقليمية";
  else if (state.level === "parallelBranches") title = state.parentLabel || "فروع التنظيم";

  // Note: "🏠 القائمة الرئيسية" button is already added to keyboard below
  const text = title;
  const keyboard = formatMenuAsTelegramKeyboard(items);
  if (state.backState) {
    keyboard.push([
      { text: "⬅️ رجوع", callback_data: "hub:back" },
      { text: "🏠 القائمة الرئيسية", callback_data: "menu:main" },
    ]);
  } else {
    keyboard.push([{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }]);
  }
  await sendTelegramMessageWithKeyboard(token, chatId, text, keyboard);
  await persistHubMetadata(convId, metadata, {
    level: state.level,
    parentId: state.parentId,
    parentLabel: state.parentLabel,
    searchTerm: state.searchTerm,
    mode: state.mode,
  });
}

function extractIncomingMessage(update: TelegramUpdate): {
  chatId: number;
  user: TelegramUser;
  text: string;
} | null {
  if (update.callback_query?.data) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id ?? cq.from.id;
    const data = cq.data || "";
    return { chatId, user: cq.from, text: data };
  }

  const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
  if (!message?.text) return null;

  const sender = message.from ?? {
    id: message.sender_chat?.id ?? message.chat.id,
    first_name: message.sender_chat?.title || message.sender_chat?.username || "Channel",
    username: message.sender_chat?.username,
  };

  if (!sender) return null;
  return { chatId: message.chat.id, user: sender, text: message.text };
}

/**
 * Handle incoming Telegram webhook update.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
  const incoming = extractIncomingMessage(update);
  if (!incoming) return null;

  try {
    const { chatId, user, text: messageText } = incoming;
    const userName = [user.first_name, user.last_name].filter(Boolean).join(" ");
    const contact = user.username ? `@${user.username}` : String(chatId);

    const token = await getTelegramToken();
    if (!token) {
      logger.error("[Telegram] Bot token missing — cannot reply");
      return null;
    }

    await sendTelegramChatAction(token, chatId, "typing");

    const customerId = await resolveCustomer("telegram", contact, userName);

    let conversation = await prisma.conversation.findFirst({
      where: {
        channel: "telegram",
        status: { in: ["active", "escalated"] },
        OR: [{ customerId }, { customerContact: contact }, { customerContact: String(chatId) }],
      },
    });

    if (!conversation) {
      conversation = await createNewConversation("telegram", userName, contact, customerId);
    }

    const metadata: Record<string, unknown> = {
      ...((conversation.metadata as Record<string, unknown> | null) || {}),
      telegramChatId: chatId,
    };
    if (metadata.telegramChatId !== (conversation.metadata as Record<string, unknown> | null)?.telegramChatId) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: JSON.parse(JSON.stringify(metadata)) },
      }).catch(() => undefined);
    }

    if (isStartCommand(messageText)) {
      await exitHubMenu(conversation.id, metadata);
      await renderTelegramServiceMenu(token, chatId);
      return null;
    }

    if (messageText === "menu:main") {
      await exitHubMenu(conversation.id, metadata);
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, [TELEGRAM_DOCUMENT_META_KEY]: null } },
      });
      await renderTelegramServiceMenu(token, chatId);
      return null;
    }

    if (messageText === "service:offices") {
      await exitHubMenu(conversation.id, metadata);
      await renderHubMenuTextTelegram(chatId, conversation.id, messageText, metadata);
      return null;
    }
    if (messageText === "service:hub") {
      await sendTelegramMessage(token, chatId, "🤝 خدمات الانخراط والمنصة الرقمية:\nhttps://hub.taalim.org/adherer");
      return null;
    }
    if (messageText === "service:documents") {
      await renderTelegramDocumentMenu(token, chatId);
      return null;
    }
    if (messageText === "service:promotion") {
      const initPromo: PromotionCalcState = {
        active: true,
        step: 0,
        data: {},
      };
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, [PROMO_CALC_META_KEY]: serializePromoCalcState(initPromo) } },
      });
      const firstQ = getPromoQuestion(initPromo);
      await sendTelegramMessageWithKeyboard(token, chatId, firstQ, [
        [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
      ]);
      return null;
    }
    if (messageText.startsWith("document:type:")) {
      const type = messageText.slice("document:type:".length) as RequestType;
      const config = REQUEST_TYPES[type];
      if (config) {
        const savedProfile = (metadata.userProfile as WizardState["savedProfile"] | undefined);
        const wizard: WizardState = {
          active: true,
          type,
          step: 0,
          data: {},
          awaitingProfileReuse: Boolean(savedProfile?.fullName),
          savedProfile,
        };
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [TELEGRAM_DOCUMENT_META_KEY]: serializeWizardState(wizard) } },
        });
        await sendTelegramScreen(token, chatId, `📄 ${config.label}\n\n${getCurrentQuestion(wizard)}`);
      }
      return null;
    }

    const documentWizard = metadata[TELEGRAM_DOCUMENT_META_KEY] as WizardState | undefined;
    if (documentWizard?.active) {
      const updatedWizard = processAnswer(documentWizard, messageText);
      if (isComplete(updatedWizard)) {
        const result = await generateAdminRequest(updatedWizard, conversation.id, "telegram");
        const config = REQUEST_TYPES[updatedWizard.type];
        const delivery = buildDeliveryMessage(result, `${config.emoji} ${config.label}`, "telegram");
        const userProfile = {
          fullName: updatedWizard.data.fullName || (metadata.userProfile as Record<string, string> | undefined)?.fullName,
          ppr: updatedWizard.data.ppr || (metadata.userProfile as Record<string, string> | undefined)?.ppr,
          grade: updatedWizard.data.grade || (metadata.userProfile as Record<string, string> | undefined)?.grade,
          school: updatedWizard.data.school || (metadata.userProfile as Record<string, string> | undefined)?.school,
          province: updatedWizard.data.province || (metadata.userProfile as Record<string, string> | undefined)?.province,
        };
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, userProfile, [TELEGRAM_DOCUMENT_META_KEY]: null } },
        });
        await sendTelegramScreen(token, chatId, delivery);

        // Send native PDF document to Telegram
        let pdfSent = false;
        try {
          const pdfBuffer = await generateRequestPdf(result.printToken);
          if (pdfBuffer) {
            const safeName = `طلب_${(updatedWizard.data.fullName || "إداري").replace(/\s+/g, "_")}.pdf`;
            const caption = `📄 وثيقة ${config.label} الرسمية جاهزة للطباعة\nالمعني بالأمر: ${updatedWizard.data.fullName || ""}`;
            pdfSent = await sendTelegramDocument(token, chatId, pdfBuffer, safeName, caption);
          }
        } catch (pdfErr: any) {
          logger.warn(`[Telegram/RequestWizard] Failed to send PDF:`, { err: String(pdfErr?.message || pdfErr) });
        }

        // If PDF could not be sent, inform the user with the download link
        if (!pdfSent) {
          const fallbackNote = `⚠️ للأسف لم نتمكن من إرسال ملف PDF مباشرة.\n\n📥 يمكنك تحميله من الرابط التالي:\n${result.printUrl}`;
          await sendTelegramMessage(token, chatId, fallbackNote);
        }
      } else {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [TELEGRAM_DOCUMENT_META_KEY]: serializeWizardState(updatedWizard) } },
        });
        await sendTelegramScreen(token, chatId, getCurrentQuestion(updatedWizard));
      }
      return null;
    }
    const categoryChoice = TELEGRAM_CATEGORY_SERVICES[messageText];
    if (categoryChoice) {
      if (GUIDED_CATEGORY_QUESTIONS[categoryChoice]) {
        await renderTelegramGuidedQuestions(token, chatId, categoryChoice);
      } else {
        await renderTelegramCategory(chatId, conversation.id, token, metadata, categoryChoice, 1);
      }
      return null;
    }
    if (messageText.startsWith("guided:questions:")) {
      await renderTelegramGuidedQuestions(token, chatId, messageText.slice("guided:questions:".length));
      return null;
    }
    if (messageText.startsWith("guided:question:")) {
      const [, , category, questionIndex] = messageText.split(":");
      const question = GUIDED_CATEGORY_QUESTIONS[category]?.[Number(questionIndex)];
      if (question) {
        const answer = await chat(conversation.id, question);
        await sendTelegramMessageWithKeyboard(token, chatId, `📌 *${question}*\n\n${answer}`, [
          [{ text: "⬅️ الأسئلة المقترحة", callback_data: `guided:questions:${category}` }],
          [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
        ]);
      }
      return null;
    }
    if (messageText.startsWith("category:page:")) {
      const [, , choice, pageText] = messageText.split(":");
      const page = Number(pageText);
      await renderTelegramCategory(chatId, conversation.id, token, metadata, choice, Number.isInteger(page) ? page : 1);
      return null;
    }
    if (messageText.startsWith("category:article:")) {
      const article = await getArticleById(messageText.slice("category:article:".length));
      if (article) {
        const { dateStr, body } = cleanArticleBodyForChat(article.content, article.title);
        const date = dateStr ? `\n📅 ${dateStr}` : "";
        await sendTelegramScreen(token, chatId, `📌 *${article.title}*${date}\n\n${body}`);
      }
      return null;
    }
    // ── Promotion Calculation Wizard ─────────────────────────────────────────
    const promoCalcState = metadata[PROMO_CALC_META_KEY] as PromotionCalcState | undefined;
    if (promoCalcState?.active) {
      if (messageText.trim() === "0") {
        // Cancel and return to main menu
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [PROMO_CALC_META_KEY]: null } },
        });
        await renderTelegramServiceMenu(token, chatId);
        return null;
      }

      const { state: updatedPromo, isDone, error } = processPromoAnswer(promoCalcState, messageText);
      if (error) {
        await sendTelegramMessageWithKeyboard(token, chatId, `${error}\n\n${getPromoQuestion(promoCalcState)}`, [
          [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
        ]);
        return null;
      }

      if (isDone) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { metadata: { ...metadata, [PROMO_CALC_META_KEY]: null } },
        });
        const summary = formatPromoSummary(updatedPromo);
        await sendTelegramMessageWithKeyboard(token, chatId, summary, [
          [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
        ]);
        return null;
      }

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: { ...metadata, [PROMO_CALC_META_KEY]: serializePromoCalcState(updatedPromo) } },
      });
      const nextQ = getPromoQuestion(updatedPromo);
      await sendTelegramMessageWithKeyboard(token, chatId, nextQ, [
        [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
      ]);
      return null;
    }

    if (TELEGRAM_SERVICE_PROMPTS[messageText]) {
      await sendTelegramScreen(token, chatId, TELEGRAM_SERVICE_PROMPTS[messageText]);
      return null;
    }

    const inHubMenu = isTelegramInHubMenu(metadata);
    if (inHubMenu) {
      const metaRecord = metadata as Record<string, unknown>;
      restoreHubMenuState(conversation.id, "telegram", metaRecord[HUB_MENU_META_KEY]);
      if (isHubNavigationInput(messageText)) {
        await handleHubMenuCommandTelegram(chatId, conversation.id, messageText, metadata, true);
        return null;
      }
      await exitHubMenu(conversation.id, metadata);
    } else if (isHubMenuTrigger(messageText)) {
      await handleHubMenuCommandTelegram(chatId, conversation.id, messageText, metadata, false);
      return null;
    }

    // A written question is global unless it is an explicit menu callback.
    // Clear stale navigation and confirmation state before retrieval.
    if (!messageText.startsWith("service:") && !messageText.startsWith("category:") && !messageText.startsWith("guided:")) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...metadata,
            selectedMenuChoice: null,
            activeCategory: null,
            guidedCategory: null,
            guidedAnswerShown: false,
            pendingOfficeCandidate: null,
            pendingTicket: null,
          },
        },
      });
    }

    const aiResponse = await chat(conversation.id, messageText);
    await sendTelegramMessage(token, chatId, aiResponse);
    return aiResponse;
  } catch (error) {
    logger.error("[Telegram] Failed to process update:", error);
    try {
      const token = await getTelegramToken();
      const incomingRetry = extractIncomingMessage(update);
      if (token && incomingRetry) {
        await sendTelegramMessage(
          token,
          incomingRetry.chatId,
          "⚠️ حدث خطأ مؤقت. أرسل /start ثم أعد المحاولة."
        );
      }
    } catch {
      // ignore secondary send failure
    }
    return null;
  }
}

async function renderTelegramGuidedQuestions(token: string, chatId: number, category: string): Promise<void> {
  const questions = GUIDED_CATEGORY_QUESTIONS[category];
  const menu = MENU_CATEGORIES[category];
  if (!questions || !menu) return;
  const items: HubMenuItem[] = questions.map((question, index) => ({
    id: `guided:question:${category}:${index}`,
    label: question,
  }));
  await sendTelegramMessageWithKeyboard(token, chatId, `${menu.icon} ${menu.label}\nاختر سؤالاً مقترحاً أو اكتب سؤالك الخاص:`, [
    ...formatMenuAsTelegramKeyboard(items),
    [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }],
  ]);
}

async function renderTelegramCategory(
  chatId: number,
  conversationId: string,
  token: string,
  metadata: Record<string, unknown>,
  choice: string,
  page: number
): Promise<void> {
  const data = await getCategoryArticles(choice, page, 6);
  const items: HubMenuItem[] = data.articles.map((article) => ({
    id: `category:article:${article.id}`,
    label: `📄 ${article.shortTitle}`,
  }));
  const navigation: HubMenuItem[] = [];
  if (data.currentPage > 1) navigation.push({ id: `category:page:${choice}:${data.currentPage - 1}`, label: "⬅️ السابق" });
  if (data.currentPage < data.totalPages) navigation.push({ id: `category:page:${choice}:${data.currentPage + 1}`, label: "التالي ➡️" });
  await sendTelegramMessageWithKeyboard(
    token,
    chatId,
    `${data.icon} ${data.label}\nالصفحة ${data.currentPage} من ${data.totalPages}`,
    [...formatMenuAsTelegramKeyboard(items), ...formatMenuAsTelegramKeyboard(navigation), [{ text: "🏠 القائمة الرئيسية", callback_data: "menu:main" }]]
  );
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { metadata: { ...metadata, [TELEGRAM_CATEGORY_META_KEY]: { choice, page: data.currentPage } } },
  }).catch(() => undefined);
}

function splitTelegramText(text: string): string[] {
  if (text.length <= TELEGRAM_TEXT_LIMIT) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_TEXT_LIMIT) {
    let cut = remaining.lastIndexOf("\n", TELEGRAM_TEXT_LIMIT);
    if (cut < TELEGRAM_TEXT_LIMIT / 2) cut = TELEGRAM_TEXT_LIMIT;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendTelegramPayload(
  token: string,
  chatId: number,
  text: string,
  parseMode?: "Markdown"
): Promise<{ ok: boolean; description?: string }> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  return { ok: data.ok === true, description: data.description };
}

/**
 * Send a message via Telegram Bot API.
 * Falls back to plain text when Markdown is rejected (very common with Arabic + * / _).
 */
export async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string
): Promise<boolean> {
  try {
    const chunks = splitTelegramText(text || " ");
    let allOk = true;
    for (const chunk of chunks) {
      const markdown = await sendTelegramPayload(token, chatId, chunk, "Markdown");
      if (markdown.ok) continue;
      logger.warn("[Telegram] Markdown send failed, retrying as plain text:", {
        description: markdown.description,
      });
      const plain = await sendTelegramPayload(token, chatId, chunk);
      if (!plain.ok) {
        allOk = false;
        logger.error("[Telegram] Failed to send message:", undefined, {
          description: plain.description,
        });
      }
    }
    return allOk;
  } catch (error) {
    logger.error("[Telegram] Failed to send message:", error);
    return false;
  }
}

/**
 * Send a message with inline keyboard buttons to Telegram.
 * Chunks long text (>4096 chars): first chunk with keyboard, rest as plain messages.
 */
async function sendTelegramMessageWithKeyboard(
  token: string,
  chatId: number,
  text: string,
  keyboard: Array<Array<{ text: string; callback_data: string }>>
): Promise<boolean> {
  try {
    // Always chunk to prevent "message is too long" errors
    const chunks = splitTelegramText(text || " ");

    // Send first chunk with keyboard buttons
    const first = await sendTelegramPayloadWithKeyboard(token, chatId, chunks[0], keyboard);
    if (!first.ok) {
      // If keyboard send fails (e.g. still too long after split), try plain fallback
      logger.warn("[Telegram] Keyboard send failed, falling back to plain text:", {
        description: first.description,
      });
      const plain = await sendTelegramPayload(token, chatId, chunks[0]);
      if (!plain.ok) {
        logger.error("[Telegram] Failed to send first chunk:", undefined, {
          description: plain.description,
        });
        return false;
      }
    }

    // Send remaining chunks as plain messages (no keyboard)
    for (let i = 1; i < chunks.length; i++) {
      const result = await sendTelegramPayload(token, chatId, chunks[i]);
      if (!result.ok) {
        logger.error(`[Telegram] Failed to send chunk ${i + 1}/${chunks.length}:`, undefined, {
          description: result.description,
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error("[Telegram] sendTelegramMessageWithKeyboard failed:", error);
    return false;
  }
}

async function sendTelegramPayloadWithKeyboard(
  token: string,
  chatId: number,
  text: string,
  keyboard: Array<Array<{ text: string; callback_data: string }>>
): Promise<{ ok: boolean; description?: string }> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: keyboard,
      },
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  return { ok: data.ok === true, description: data.description };
}

async function sendTelegramChatAction(
  token: string,
  chatId: number,
  action: "typing"
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // non-fatal
  }
}

/**
 * Send a PDF document to Telegram via multipart/form-data.
 * Returns true if sent successfully.
 */
export async function sendTelegramDocument(
  token: string,
  chatId: number,
  pdfBuffer: Buffer,
  fileName: string,
  caption?: string
): Promise<boolean> {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), fileName);
    if (caption) form.append("caption", caption);

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    if (data.ok) {
      logger.info(`[Telegram] Document sent to ${chatId} (${pdfBuffer.length} bytes)`);
      return true;
    }
    logger.warn(`[Telegram] sendDocument failed: ${data.description}`);
    return false;
  } catch (error) {
    logger.error("[Telegram] sendDocument error:", error);
    return false;
  }
}

/**
 * Set up Telegram webhook URL.
 */
export async function setupTelegramWebhook(
  botToken: string,
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post", "callback_query"],
        drop_pending_updates: true,
      }),
    });

    const data = await response.json();
    return { ok: data.ok === true, error: data.description };
  } catch (error) {
    logger.error("[Telegram] Failed to set webhook:", error);
    return { ok: false, error: String(error) };
  }
}

export async function getTelegramWebhookInfo(botToken: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const data = await response.json();
    if (data.ok) return data.result as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}
