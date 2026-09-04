import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

// Mock OpenAI
const mockOpenAICreateFn = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockOpenAICreateFn,
        },
      };
    },
  };
});

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
mockPrisma.office ??= { findMany: vi.fn() };

describe("AI Engine", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockOpenAICreateFn.mockReset();

    // Default settings
    mockPrisma.settings.findFirst.mockResolvedValue({
      id: "default",
      businessName: "Test Biz",
      businessDesc: "A test business",
      welcomeMessage: "Hello!",
      tone: "friendly",
      language: "auto",
      aiProvider: "openai",
      aiModel: "gpt-4",
      aiApiKey: "sk-test",
      maxTokens: 1000,
      temperature: 0.7,
    });

    mockPrisma.settings.create.mockResolvedValue({
      id: "default",
      aiApiKey: "",
    });

    // Default knowledge base
    mockPrisma.knowledgeEntry.findMany.mockResolvedValue([]);
    mockPrisma.office.findMany.mockResolvedValue([]);

    // Default conversation
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: "conv-1",
      channel: "whatsapp",
      customerName: "John",
      customerContact: "+1555",
      status: "active",
      messages: [
        { role: "customer", content: "Hi", createdAt: new Date() },
      ],
    });

    // Default canned responses and automation rules (needed by the holding interceptor in chat())
    mockPrisma.cannedResponse.findMany.mockResolvedValue([]);
    mockPrisma.automationRule.findMany.mockResolvedValue([]);

    // Default message creation
    mockPrisma.message.create.mockResolvedValue({ id: "msg-new" });
    mockPrisma.conversation.update.mockResolvedValue({});
  });

  it("should return fallback when AI API key is not configured", async () => {
    mockPrisma.settings.findFirst.mockResolvedValue({
      id: "default",
      aiApiKey: "",
      aiProvider: "openai",
      aiModel: "gpt-4",
      maxTokens: 1000,
      temperature: 0.7,
      businessName: "Test",
      businessDesc: "",
      welcomeMessage: "",
      tone: "friendly",
      language: "auto",
    });

    const { chat } = await import("@/lib/ai/engine");
    const response = await chat("conv-1", "Hello");

    expect(response).toContain("AI is not configured");
  });

  it("should return error when conversation not found", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);

    const { chat } = await import("@/lib/ai/engine");
    const response = await chat("nonexistent", "Hello");

    expect(response).toBe("Conversation not found.");
  });

  it("returns verified contacts for an Arabic spelling variant of one province", async () => {
    mockPrisma.office.findMany.mockResolvedValue([
      {
        id: "office-ifni",
        sourceId: 1,
        isActive: true,
        level: "إقليمي",
        name: "المكتب الإقليمي لـ سيدي إفني",
        region: "كلميم واد نون",
        province: "سيدي إفني",
        parentOffice: "",
        secretary: "حسن لفت",
        secretaryPhone: "0612345678",
        treasurer: "",
        treasurerPhone: "",
      },
    ]);

    const { buildOfficeDirectAnswer } = await import("@/lib/ai/engine");
    const response = await buildOfficeDirectAnswer("الكاتب الإقليمي افني");

    expect(response).toContain("حسن لفت");
    expect(response).toContain("0612345678");
  });

  it("asks for clarification instead of returning contacts for an ambiguous location", async () => {
    mockPrisma.office.findMany.mockResolvedValue([
      {
        id: "office-qasim",
        sourceId: 1,
        isActive: true,
        level: "إقليمي",
        name: "المكتب الإقليمي لـ سيدي قاسم",
        region: "الرباط سلا القنيطرة",
        province: "سيدي قاسم",
        parentOffice: "",
        secretary: "اسم أول",
        secretaryPhone: "0611111111",
        treasurer: "",
        treasurerPhone: "",
      },
      {
        id: "office-slimane",
        sourceId: 2,
        isActive: true,
        level: "إقليمي",
        name: "المكتب الإقليمي لـ سيدي سليمان",
        region: "الرباط سلا القنيطرة",
        province: "سيدي سليمان",
        parentOffice: "",
        secretary: "اسم ثان",
        secretaryPhone: "0622222222",
        treasurer: "",
        treasurerPhone: "",
      },
    ]);

    const { buildOfficeDirectAnswer } = await import("@/lib/ai/engine");
    const response = await buildOfficeDirectAnswer("هاتف المكتب الإقليمي سيدي");

    expect(response).toContain("لم أستطع تحديد المكتب بدقة");
    expect(response).not.toContain("0611111111");
    expect(response).not.toContain("0622222222");
  });

  it("uses a verified Arabic spelling alias for a known province typo", async () => {
    mockPrisma.office.findMany.mockResolvedValue([
      {
        id: "office-tiznit",
        sourceId: 1,
        isActive: true,
        level: "إقليمي",
        name: "المكتب الإقليمي لـ تيزنيت",
        region: "سوس ماسة",
        province: "تيزنيت",
        parentOffice: "",
        secretary: "هشام الكرطيط",
        secretaryPhone: "0666469305",
        treasurer: "المدني الذهبي",
        treasurerPhone: "0668699235",
      },
    ]);

    const { buildOfficeDirectAnswer } = await import("@/lib/ai/engine");
    const response = await buildOfficeDirectAnswer("تزميت");

    expect(response).toContain("هشام الكرطيط");
    expect(response).toContain("0666469305");
    expect(response).toContain("المدني الذهبي");
    expect(response).toContain("0668699235");
  });

  it("confirms an office suggestion before any stale ticket confirmation", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: "conv-1",
      channel: "whatsapp",
      customerName: "John",
      metadata: {
        pendingOfficeCandidate: "تيزنيت",
        pendingTicket: { title: "Ancien ticket", description: "Ne pas créer", priority: "medium" },
      },
      messages: [],
    });
    mockPrisma.office.findMany.mockResolvedValue([
      {
        id: "office-tiznit",
        sourceId: 1,
        isActive: true,
        level: "إقليمي",
        name: "المكتب الإقليمي لـ تيزنيت",
        region: "سوس ماسة",
        province: "تيزنيت",
        parentOffice: "",
        secretary: "هشام الكرطيط",
        secretaryPhone: "0666469305",
        treasurer: "المدني الذهبي",
        treasurerPhone: "0668699235",
      },
    ]);

    const { chat } = await import("@/lib/ai/engine");
    const response = await chat("conv-1", "نعم");

    expect(response).toContain("هشام الكرطيط");
    expect(response).not.toContain("تذكرتك");
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: expect.objectContaining({ pendingOfficeCandidate: null, pendingTicket: null }) }),
    }));
  });

  it("should call OpenAI with correct parameters", async () => {
    mockOpenAICreateFn.mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "Hello! How can I help?" },
        },
      ],
    });

    const { chat } = await import("@/lib/ai/engine");
    const response = await chat("conv-1", "I need help");

    expect(response).toBe("Hello! How can I help?");
    expect(mockOpenAICreateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4",
        max_tokens: 1000,
        temperature: 0.7,
      })
    );
  });

  it("should save user and assistant messages", async () => {
    mockOpenAICreateFn.mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "I can help with that." },
        },
      ],
    });

    const { chat } = await import("@/lib/ai/engine");
    await chat("conv-1", "Help me");

    // User message saved
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv-1",
          role: "customer",
          content: "Help me",
        }),
      })
    );

    // Assistant message saved
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv-1",
          role: "assistant",
          content: "I can help with that.",
        }),
      })
    );
  });

  it("should include knowledge base in system prompt", async () => {
    mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
      {
        category: { name: "FAQ" },
        title: "Return Policy",
        content: "30-day returns allowed",
        priority: 10,
      },
    ]);

    mockOpenAICreateFn.mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "Our return policy..." },
        },
      ],
    });

    const { chat } = await import("@/lib/ai/engine");
    await chat("conv-1", "What is your return policy?");

    const callArgs = mockOpenAICreateFn.mock.calls[0][0];
    const systemMessage = callArgs.messages[0];
    expect(systemMessage.content).toContain("Return Policy");
    expect(systemMessage.content).toContain("30-day returns allowed");
  });

  it("should handle tool calls and recurse", async () => {
    // First call returns tool_calls
    mockOpenAICreateFn
      .mockResolvedValueOnce({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "get_customer_history",
                    arguments: JSON.stringify({ customerContact: "+1555" }),
                  },
                },
              ],
            },
          },
        ],
      })
      // Second call returns final response
      .mockResolvedValueOnce({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "Based on your history, I can see...",
            },
          },
        ],
      });

    // Mock the customer history tool
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    const { chat } = await import("@/lib/ai/engine");
    const response = await chat("conv-1", "Do you know me?");

    expect(response).toBe("Based on your history, I can see...");
    expect(mockOpenAICreateFn).toHaveBeenCalledTimes(2);
  });

  it("should return fallback message when content is empty", async () => {
    mockOpenAICreateFn.mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "" },
        },
      ],
    });

    const { chat } = await import("@/lib/ai/engine");
    const response = await chat("conv-1", "Hello");

    expect(response).toContain("could not generate a response");
  });
});
