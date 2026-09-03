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
import { logger } from "@/lib/logger";
import { resolveCustomer } from "@/lib/customer-resolver";
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
  };
}

const waState = g.__waState;

const MESSAGE_DEDUP_TTL_MS = 2 * 60 * 1000;
const processedInboundMessages = new Map<string, number>();

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
  "────────────────",
  "💬 يمكنك أيضاً كتابة أي سؤال أو طلب التواصل مع مكتبك الإقليمي مباشرة!",
  "📋 للرجوع للقائمة الرئيسية أرسل *0*",
].join("\n");

export const PROMOTION_CALC_IN_PREP_TEXT = [
  "🧮 *خدمة حساب وتدقيق نقط الترقية*",
  "━━━━━━━━━━━━━━━━━━━━",
  "⏳ *هذه الخدمة التفاعلية في طور الإعداد والبرمجة داخل الشات حالياً.*",
  "",
  "💡 يمكنك في الوقت الراهن استخدام أداة الحساب الرسمية المتاحة عبر المنصة الرقمية:",
  "🔗 https://hub.taalim.org/calc_promotion_points.php",
  "",
  "────────────────",
  "📋 للرجوع للقائمة الرئيسية أرسل *0*",
].join("\n");

export const DISCLAIMER_TEXT = [
  "⚖️ *توجيه تنظيمي وإخلاء مسؤولية*",
  "━━━━━━━━━━━━━━━━━━━━",
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
  "────────────────",
  "📋 للرجوع للقائمة الرئيسية أرسل *0*",
].join("\n");

function buildMenuText(): string {
  return [
    "مرحباً بك الرفيق/ة في المساعد الرقمي للجامعة الوطنية للتعليم FNE 👋",
    "رهن إشارتك لتسهيل وصولك للمعلومات، التوجيه النقابي والإداري، وتوليد وثائقك الرسمية على مدار الساعة.",
    "💬 *اكتب سؤالك مباشرة في أي وقت وسأجيبك فوراً!*",
    "📌 *أو اختر أحد المواضيع بإرسال رقمه:*",
    "1️⃣ 🏢 *المكاتب والتنظيم النقابي*",
    "2️⃣ 📜 *القانون الأساسي للجامعة FNE*",
    "3️⃣ 📅 *مقرر السنة الدراسية والعطل*",
    "4️⃣ ⚖️ *النظام الأساسي والوظيفة العمومية*",
    "5️⃣ 🎒 *الدخول المدرسي والحركة الانتقالية*",
    "6️⃣ 📢 *آخر البيانات والمستجدات*",
    "7️⃣ 🤝 *الانخراط والخدمات الرقمية (Hub)*",
    "8️⃣ 📄 *توليد المراسلات والطلبات الإدارية (PDF)*",
    "9️⃣ 🧮 *حساب وتدقيق نقط الترقية*",
    "📨 لإرسال *ملاحظة أو اقتراح* للجامعة اكتب *اقتراح*",
    "⚖️ لقراءة *توجيه تنظيمي وإخلاء مسؤولية* اكتب *ميثاق*",
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
    "━━━━━━━━━━━━━━━━━━━━",
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
  lines.push("─────────────────────");
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
  header.push("━━━━━━━━━━━━━━━━━━━━");

  const footer = [
    "",
    "────────────────",
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

    // Check if this block is a decorative separator (─── or ━━━)
    if (/^[─━═\-_]{3,}$/.test(pTrimmed)) {
      formattedBlocks.push(pTrimmed);
      continue;
    }

    const pLines = pTrimmed.split("\n").map((l) => l.trim()).filter(Boolean);
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
const FNE_LOGO_MAX_WIDTH = 280; // pixels — small, discreet logo for the menu header

/**
 * Read the FNE logo, resize it to a small width, and send it with the menu text as caption.
 * Falls back to a plain-text menu if the logo file is missing, sharp fails, or send errors.
 */
async function sendMenuWithLogo(jid: string, caption: string): Promise<boolean> {
  if (!waState.sock) {
    await sendText(jid, caption);
    return false;
  }
  try {
    let buffer: Buffer | null = null;
    try {
      const raw = fs.readFileSync(FNE_LOGO_PATH);
      // Resize to a small, discreet header logo (preserves aspect ratio)
      buffer = await sharp(raw)
        .resize({ width: FNE_LOGO_MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (imgErr) {
      logger.warn("[WhatsApp/Baileys] FNE logo unavailable, sending menu as plain text:", {
        path: FNE_LOGO_PATH,
        error: String(imgErr),
      });
      await sendText(jid, caption);
      return false;
    }
    if (!buffer || buffer.length === 0) {
      await sendText(jid, caption);
      return false;
    }

    // Simulate typing
    await waState.sock.sendPresenceUpdate("composing", jid).catch(() => { });
    const typingDuration = Math.min(2200, Math.max(800, caption.length * 6));
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
    const sendRes = await waState.sock.sendMessage(jid, {
      image: buffer,
      caption,
      mimetype: "image/jpeg",
    });
    logger.info(`[WhatsApp/Baileys] Menu+logo (${buffer.length} bytes) sent to ${jid}, id: ${sendRes?.key?.id || "unknown"}`);
    return true;
  } catch (err) {
    logger.error(`[WhatsApp/Baileys] sendMenuWithLogo error to ${jid}:`, { error: String(err) });
    // Fallback to plain text menu
    await sendText(jid, caption);
    return false;
  }
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
const WA_FEEDBACK_FOOTER = "\n━━━━━━━━━━━━━━━━━━━\n💬 هل أفادك هذا الجواب؟ تفاعل بـ 👍 أو 👎";

async function handleIncomingMessage(jid: string, body: string, pushName?: string, messageId?: string, wasVoice: boolean = false): Promise<void> {
  try {
    if (jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid === "status@broadcast") return;

    const messageContent = body.trim();
    if (!messageContent) return;

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
    // ── End suggestion flow ──────────────────────────────────────────────────

    if (!menuShown || greeting || isNewConversation) {
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
          },
        },
      });
      const menuText = buildMenuText();
      await recordExchange(conversation.id, messageContent, menuText);
      // Always send the FNE logo with the menu text as the caption (on every menu display)
      await sendMenuWithLogo(jid, menuText);
      logger.info(`[WhatsApp/Baileys] Menu (with logo) sent to ${customerContact}`);
      return;
    }

    if (directDigit === "0") {
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
      await sendMenuWithLogo(jid, menuText);
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
      const answer = sanitizeWhatsAppMessage(await chat(conversation.id, question));
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
      const answer = sanitizeWhatsAppMessage(await chat(conversation.id, messageContent));
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
      await sendText(jid, triggerReply);
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
      await sendText(jid, menuMsg);
      return;
    }

    const aiResponse = await chat(conversation.id, messageContent);
    const cleanResponse = sanitizeWhatsAppMessage(aiResponse);
    const cleanVoiceQuestion = messageContent.replace(/^[«"'\s*]+|[»"'\s*]+$/g, "").trim();
    const voicePrefix = wasVoice && cleanVoiceQuestion ? `*${cleanVoiceQuestion}*\n\n` : "";
    const fullReply = `${voicePrefix}${cleanResponse}\n\n────────────────\n📋 للرجوع للقائمة الرئيسية أرسل *0*${WA_FEEDBACK_FOOTER}`;
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
      const error = lastDisconnect?.error as Boom | undefined;
      const statusCode = error?.output?.statusCode;
      // 403 = Forbidden = account banned by WhatsApp/Meta. Do NOT retry — manual intervention required.
      // 401 = Unauthorized = session invalid. Also requires manual reconnect.
      // 428 = Something went wrong, possibly device removed from phone.
      const isBannedOrLoggedOut = statusCode === DisconnectReason.loggedOut
        || statusCode === 403
        || statusCode === 401
        || statusCode === 428;
      const shouldReconnect = !isBannedOrLoggedOut;

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
      if (isBannedOrLoggedOut) {
        if (statusCode === 403) {
          waState.statusMessage = "BLOQUÉ: compte WhatsApp banni (403). Faites appel sur https://www.whatsapp.com/contact/";
        } else if (statusCode === 401) {
          waState.statusMessage = "Session expirée. Reconnectez-vous depuis le tableau de bord.";
        } else if (statusCode === 428) {
          waState.statusMessage = "Connexion perdue. Reconnectez-vous depuis le tableau de bord.";
        } else {
          waState.statusMessage = "Déconnecté. Reconnectez-vous depuis le tableau de bord.";
        }
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
      } else {
        waState.isStarting = false;
        waState.connectionStatus = "error";
        waState.statusMessage = "Failed to reconnect after multiple attempts.";
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
        await handleIncomingMessage(jid, body, pushName, messageId, wasVoice);
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
  const cleanResponse = sanitizeWhatsAppMessage(message);
  await sendText(jid, cleanResponse);
  return true;
}
