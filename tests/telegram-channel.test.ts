import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleTelegramUpdate } from "@/lib/channels/telegram";
import { parseSelection } from "@/lib/channels/hub-menu";
import { resolveCustomer } from "@/lib/customer-resolver";
import { chat, createNewConversation } from "@/lib/ai/engine";

const { prismaMock, resolveCustomerMock, chatMock, createNewConversationMock } = vi.hoisted(() => ({
  prismaMock: {
    settings: { findFirst: vi.fn() },
    conversation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    forumTopic: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
  resolveCustomerMock: vi.fn(),
  chatMock: vi.fn(),
  createNewConversationMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/customer-resolver", () => ({
  resolveCustomer: resolveCustomerMock,
}));
vi.mock("@/lib/ai/engine", () => ({
  chat: chatMock,
  createNewConversation: createNewConversationMock,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Telegram webhook update handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.settings.findFirst.mockResolvedValue({ telegramBotToken: "TEST_TOKEN" });
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    // findUnique is called by renderTelegramServiceMenu to check fneLogoSent flag
    prismaMock.conversation.findUnique = vi.fn().mockResolvedValue({ id: "conv-123", metadata: {} });
    prismaMock.conversation.update.mockResolvedValue({});
    resolveCustomerMock.mockResolvedValue("customer-123");
    createNewConversationMock.mockResolvedValue({ id: "conv-123", metadata: null } as any);
    chatMock.mockResolvedValue("Réponse Telegram");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
      text: vi.fn().mockResolvedValue(""),
    }) as any;
  });

  it("handles Telegram channel posts sent via channel_post payload", async () => {
    const result = await handleTelegramUpdate({
      update_id: 1,
      channel_post: {
        message_id: 7,
        chat: { id: -100123, type: "channel" },
        sender_chat: { id: -100123, title: "Mon canal" },
        text: "bonjour",
        date: 1700000000,
      },
    } as any);

    expect(result).toBe("Réponse Telegram");
    expect(chatMock).toHaveBeenCalledWith("conv-123", "bonjour");
    expect(resolveCustomerMock).toHaveBeenCalledWith("telegram", "-100123", "Mon canal");
  });

  it("shows the service menu with clickable buttons when the user sends /start", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
      text: vi.fn().mockResolvedValue(""),
    });
    global.fetch = fetchMock as any;

    const result = await handleTelegramUpdate({
      update_id: 2,
      message: {
        message_id: 8,
        chat: { id: 123456789, type: "private" },
        from: { id: 123456789, first_name: "Test", last_name: "User", username: "testuser" },
        text: "/start",
        date: 1700000000,
      },
    } as any);

    const sendMessageCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/sendMessage"));
    expect(result).toBeNull();
    expect(sendMessageCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/sendMessage"))![1].body));
    // The menu text uses "اختر أحد الخدمات" (actual welcome message text)
    expect(body.text).toContain("الخدمات");
    const buttons = body.reply_markup.inline_keyboard.flat();
    expect(buttons).toContainEqual(expect.objectContaining({ callback_data: "service:offices" }));
    expect(buttons).toContainEqual(expect.objectContaining({ callback_data: "service:promotion" }));
    expect(buttons).toContainEqual(expect.objectContaining({ callback_data: "service:suggestion" }));
  });

  it("accepts Telegram callback IDs as menu choices", () => {
    const selection = parseSelection("region:11", [{ id: "region:11", label: "🌍 كلميم واد نون" }]);
    expect(selection?.id).toBe("region:11");
  });

  it("cancels an active document wizard when the main-menu button is clicked", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: "conv-123",
      metadata: { telegramDocumentWizard: { active: true, type: "libre", step: 1, data: {} } },
    });

    await handleTelegramUpdate({
      update_id: 3,
      callback_query: {
        id: "callback-1",
        from: { id: 123456789, first_name: "Test", username: "testuser" },
        message: { message_id: 9, chat: { id: 123456789, type: "private" }, date: 1700000000 },
        data: "menu:main",
      },
    } as any);

    expect(prismaMock.conversation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: expect.objectContaining({ telegramDocumentWizard: null }) }),
    }));
    const sendBody = JSON.parse(String((global.fetch as any).mock.calls.find(([url]: [string]) => url.includes("/sendMessage"))[1].body));
    // The menu text uses "الخدمات" (actual welcome message text)
    expect(sendBody.text).toContain("الخدمات");
  });
});
