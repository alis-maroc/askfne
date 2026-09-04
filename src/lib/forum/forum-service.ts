import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { sendTelegramMessage } from "@/lib/channels/telegram";

export const FORUM_TAG = "مشتركو منتدى النقاش";
export const FORUM_TAG_SLUG = "forum_subscribers";

export const BAYAN_OPTED_OUT_TAG = "رافضو خدمة البيانات";
export const BAYAN_OPTED_OUT_SLUG = "bayan_opted_out";

/**
 * Format the debate prompt message sent to customers.
 */
export function formatForumTopicBroadcast(title: string, promptQuestion: string): string {
  return [
    "📢 *منتدى النقاش التفاعلي — الجامعة الوطنية للتعليم FNE*",
    "",
    `📌 *موضوع النقاش:* ${title}`,
    "",
    promptQuestion,
    "",
    "✍️ *للمشاركة برأيك أو مقترحك في هذا النقاش:*",
    "أرسل الرقم *55* للدخول للمنتدى وإرسال تعقيبك مباشرة.",
    "",
    "────────────────────",
    "🤖 *للعودة إلى المساعد الآلي لطرح الأسئلة العادية:* أرسل الرقم *0*",
    "⛔ *لإلغاء الاشتراك من المنتدى:* أرسل الرقم *99*",
  ].join("\n");
}

/**
 * Format an approved participant contribution to be broadcast to all members.
 */
export function formatForumPostBroadcast(topicTitle: string, authorName: string, content: string): string {
  return [
    "💬 *تعقيب جديد في منتدى النقاش — FNE*",
    `📌 *الموضوع:* ${topicTitle}`,
    "",
    `👤 *مشاركة الزميل/ة (${authorName}):*`,
    `« ${content} »`,
    "",
    "────────────────────",
    "✍️ *للتعليق أو كتابة رأيك:* أرسل *55*",
    "🤖 *للعودة إلى المساعد الآلي لطرح الأسئلة:* أرسل الرقم *0*",
    "⛔ *لإلغاء الاشتراك:* أرسل الرقم *99*",
  ].join("\n");
}

/**
 * Subscribe a customer to the forum (triggered by sending '55').
 */
export async function subscribeCustomerToForum(
  customerId: string,
  contact: string,
  convId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      const existingTags = (customer.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
      if (!existingTags.includes(FORUM_TAG)) existingTags.push(FORUM_TAG);
      if (!existingTags.includes(FORUM_TAG_SLUG)) existingTags.push(FORUM_TAG_SLUG);
      await prisma.customer.update({
        where: { id: customerId },
        data: { tags: existingTags.join(", ") },
      });
    }

    // Automatically enroll in active topic if one exists
    const activeTopic = await getActiveForumTopic();
    if (activeTopic) {
      const currentTargetIds = activeTopic.targetCustomerIds || [];
      if (!currentTargetIds.includes(customerId)) {
        await prisma.forumTopic.update({
          where: { id: activeTopic.id },
          data: {
            targetCustomerIds: { push: customerId },
            subscribersCount: { increment: 1 },
          },
        });
        logger.info(`[Forum/OptIn] Customer ${customerId} enrolled into active topic ${activeTopic.id}`);
      }
    }

    if (convId) {
      await prisma.conversation.update({
        where: { id: convId },
        data: {
          metadata: {
            ...(metadata || {}),
            forumSubscribed: true,
            inForumMode: true,
            awaitingForumAnswer: true,
            activeForumTopicId: activeTopic?.id || null,
          },
        },
      });
    }
    logger.info(`[Forum/OptIn] Customer ${contact} subscribed to Forum via code 55`);
  } catch (err) {
    logger.error("[Forum/OptIn] Error subscribing customer to Forum:", { error: String(err) });
  }
}

/**
 * Unsubscribe a customer from the forum (triggered by sending '99').
 */
export async function unsubscribeCustomerFromForum(
  customerId: string,
  convId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      const existingTags = (customer.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
      const filtered = existingTags.filter(
        (t) =>
          t !== FORUM_TAG &&
          t !== FORUM_TAG_SLUG &&
          t !== "forum_subscriber" &&
          t !== "forum-subscriber" &&
          t !== "مشترك في المنتدى" &&
          !t.includes("منتدى")
      );
      await prisma.customer.update({
        where: { id: customerId },
        data: { tags: filtered.join(", ") },
      });
    }

    const activeTopic = await getActiveForumTopic();
    if (activeTopic) {
      const currentTargetIds = activeTopic.targetCustomerIds || [];
      if (currentTargetIds.includes(customerId)) {
        const filteredIds = currentTargetIds.filter((id) => id !== customerId);
        await prisma.forumTopic.update({
          where: { id: activeTopic.id },
          data: {
            targetCustomerIds: filteredIds,
            subscribersCount: Math.max(0, activeTopic.subscribersCount - 1),
          },
        });
      }
    }

    if (convId) {
      await prisma.conversation.update({
        where: { id: convId },
        data: {
          metadata: {
            ...(metadata || {}),
            forumSubscribed: false,
            inForumMode: false,
            awaitingForumAnswer: false,
            activeForumTopicId: null,
          },
        },
      });
    }
    logger.info(`[Forum/OptOut] Customer ${customerId} unsubscribed from Forum via code 99`);
  } catch (err) {
    logger.error("[Forum/OptOut] Error unsubscribing customer from Forum:", { error: String(err) });
  }
}

/**
 * Get the currently active forum topic (if any).
 */
export async function getActiveForumTopic() {
  return prisma.forumTopic.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { posts: true } },
    },
  });
}

/**
 * Record an inbound contribution from an adherent.
 */
export async function submitForumPost(params: {
  topicId: string;
  customerId?: string;
  authorName?: string;
  authorContact: string;
  channel: "whatsapp" | "telegram";
  content: string;
}) {
  const topic = await prisma.forumTopic.findUnique({ where: { id: params.topicId } });
  if (!topic || topic.status !== "active") return null;

  const initialStatus = topic.moderationMode ? "pending" : "approved";

  const post = await prisma.forumPost.create({
    data: {
      topicId: params.topicId,
      customerId: params.customerId,
      authorName: params.authorName || "أحد الأساتذة",
      authorContact: params.authorContact,
      channel: params.channel,
      content: params.content,
      status: initialStatus,
    },
  });

  await prisma.forumTopic.update({
    where: { id: params.topicId },
    data: { postsCount: { increment: 1 } },
  });

  // Auto-subscribe the participant if not already subscribed
  if (params.customerId) {
    await subscribeCustomerToForum(params.customerId, params.authorContact);
  }

  // If auto-approved (moderationMode false), broadcast immediately
  if (initialStatus === "approved") {
    void broadcastForumPost(post.id);
  }

  return post;
}

/**
 * Broadcast an approved forum post to other participants.
 */
export async function broadcastForumPost(postId: string): Promise<{ sentCount: number }> {
  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    include: { topic: true },
  });
  if (!post || !post.topic) return { sentCount: 0 };

  const messageText = formatForumPostBroadcast(post.topic.title, post.authorName, post.content);
  let sentCount = 0;

  // Determine recipients based on topic audience
  let recipientCustomers: Array<{ id: string; phone?: string | null; whatsapp?: string | null; metadata?: unknown }> = [];

  const forumTagFilter = [
    { tags: { contains: FORUM_TAG_SLUG } },
    { tags: { contains: FORUM_TAG } },
    { tags: { contains: "forum" } },
    { tags: { contains: "منتدى" } },
  ];

  if (post.topic.targetAudience === "manual") {
    recipientCustomers = await prisma.customer.findMany({
      where: {
        id: { in: post.topic.targetCustomerIds },
        isBlocked: false,
      },
      select: { id: true, phone: true, whatsapp: true, metadata: true },
    });
  } else if (post.topic.targetAudience === "subscribers") {
    recipientCustomers = await prisma.customer.findMany({
      where: {
        OR: forumTagFilter,
        isBlocked: false,
      },
      select: { id: true, phone: true, whatsapp: true, metadata: true },
    });
  } else {
    recipientCustomers = await prisma.customer.findMany({
      where: { isBlocked: false },
      select: { id: true, phone: true, whatsapp: true, metadata: true },
    });
  }

  // Broadcast via WhatsApp
  if (post.topic.channels.includes("whatsapp")) {
    for (const cust of recipientCustomers) {
      const raw = cust.whatsapp || cust.phone || "";
      const contact = raw.endsWith("@lid") ? raw : raw.replace(/[^\d+]/g, "");
      if (!contact || (!contact.endsWith("@lid") && contact.length < 8)) continue;

      try {
        const sent = await sendWhatsAppMessage(contact, messageText);
        if (sent) sentCount++;
        // Safe spacing
        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        logger.warn(`[Forum/Broadcast] Failed to send post to WA contact ${contact}:`, { error: String(err) });
      }
    }
  }

  // Broadcast via Telegram
  if (post.topic.channels.includes("telegram")) {
    const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
    if (settings?.telegramBotToken) {
      const tgWhere: Record<string, unknown> = { channel: "telegram" };
      if (post.topic.targetAudience === "manual") {
        tgWhere.customerId = { in: post.topic.targetCustomerIds };
      } else if (post.topic.targetAudience === "subscribers") {
        tgWhere.customer = {
          OR: forumTagFilter,
        };
      }

      const telegramConvs = await prisma.conversation.findMany({
        where: tgWhere,
        select: { customerContact: true, customerId: true, metadata: true },
        distinct: ["customerContact"],
      });

      for (const conv of telegramConvs) {
        const meta = (conv.metadata as Record<string, unknown>) || {};
        const rawChatId = meta.telegramChatId || conv.customerContact;
        const chatId = Number(rawChatId);
        if (!Number.isFinite(chatId)) continue;

        try {
          await sendTelegramMessage(settings.telegramBotToken, chatId, messageText);
          sentCount++;
          await new Promise((r) => setTimeout(r, 400));
        } catch (tgErr) {
          logger.warn(`[Forum/Broadcast] Failed to send post to Telegram chat ${chatId}:`, { error: String(tgErr) });
        }
      }
    }
  }

  // Mark post as broadcasted
  await prisma.forumPost.update({
    where: { id: postId },
    data: {
      status: "broadcasted",
      broadcastCount: sentCount,
      broadcastedAt: new Date(),
    },
  });

  return { sentCount };
}
