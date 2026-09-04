import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import {
  formatForumTopicBroadcast,
  FORUM_TAG,
  FORUM_TAG_SLUG,
} from "@/lib/forum/forum-service";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { sendTelegramMessage } from "@/lib/channels/telegram";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const topics = await prisma.forumTopic.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { posts: true },
        },
        posts: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    return NextResponse.json({ topics });
  } catch (error) {
    logger.error("[Forum/Topics] Failed to list topics:", error);
    return NextResponse.json({ error: "Failed to fetch topics" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const {
      title,
      promptQuestion,
      channels = ["whatsapp", "telegram"],
      targetAudience = "manual",
      targetCustomerIds = [],
      moderationMode = true,
      broadcastImmediately = true,
    } = body;

    if (!title?.trim() || !promptQuestion?.trim()) {
      return NextResponse.json({ error: "عنوان السؤال والمحتوى مطلوبان" }, { status: 400 });
    }

    // Strict rule: Only ONE active topic at a time. Must be closed/archived first.
    const existingActive = await prisma.forumTopic.findFirst({
      where: { status: "active" },
    });
    if (existingActive) {
      return NextResponse.json(
        {
          error: `يوجد حالياً موضوع نقاش نشط (« ${existingActive.title} »). يجب إغلاقه وأرشفته أولاً قبل فتح موضوع جديد.`,
        },
        { status: 400 }
      );
    }

    // Create new topic
    const topic = await prisma.forumTopic.create({
      data: {
        title: title.trim(),
        promptQuestion: promptQuestion.trim(),
        channels,
        targetAudience,
        targetCustomerIds: Array.isArray(targetCustomerIds) ? targetCustomerIds : [],
        moderationMode: Boolean(moderationMode),
        status: "active",
      },
    });

    let broadcastResult = { sentWa: 0, sentTg: 0 };

    if (broadcastImmediately) {
      const messageText = formatForumTopicBroadcast(topic.title, topic.promptQuestion);

      // Determine recipients
      let customersToBroadcast: Array<{ id: string; phone?: string | null; whatsapp?: string | null; name?: string | null }> = [];

      if (targetAudience === "manual" && targetCustomerIds.length > 0) {
        customersToBroadcast = await prisma.customer.findMany({
          where: { id: { in: targetCustomerIds }, isBlocked: false },
          select: { id: true, phone: true, whatsapp: true, name: true },
        });
      } else if (targetAudience === "subscribers") {
        customersToBroadcast = await prisma.customer.findMany({
          where: {
            OR: [
              { tags: { contains: FORUM_TAG_SLUG } },
              { tags: { contains: FORUM_TAG } },
            ],
            isBlocked: false,
          },
          select: { id: true, phone: true, whatsapp: true, name: true },
        });
      } else {
        // All contacts
        customersToBroadcast = await prisma.customer.findMany({
          where: { isBlocked: false },
          select: { id: true, phone: true, whatsapp: true, name: true },
        });
      }

      // WhatsApp broadcast with safe rate limiting
      if (channels.includes("whatsapp")) {
        for (const cust of customersToBroadcast) {
          const raw = cust.whatsapp || cust.phone || "";
          const contact = raw.endsWith("@lid") ? raw : raw.replace(/[^\d+]/g, "");
          if (!contact || (!contact.endsWith("@lid") && contact.length < 8)) continue;
          try {
            const sent = await sendWhatsAppMessage(contact, messageText);
            if (sent) {
              broadcastResult.sentWa++;
              // Mark conversation as awaiting forum response
              await prisma.conversation.updateMany({
                where: { customerContact: { contains: contact.slice(-8) }, channel: "whatsapp" },
                data: {
                  metadata: {
                    activeForumTopicId: topic.id,
                    awaitingForumAnswer: true,
                  },
                },
              });
            }
            await new Promise((r) => setTimeout(r, 1200));
          } catch (waErr) {
            logger.warn(`[Forum/Topics] WA send error for ${contact}:`, { error: String(waErr) });
          }
        }
      }

      // Telegram broadcast
      if (channels.includes("telegram")) {
        const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
        if (settings?.telegramBotToken) {
          const tgWhere: Record<string, unknown> = { channel: "telegram" };
          if (targetAudience === "manual" && targetCustomerIds.length > 0) {
            tgWhere.customerId = { in: targetCustomerIds };
          } else if (targetAudience === "subscribers") {
            tgWhere.customer = {
              OR: [
                { tags: { contains: FORUM_TAG_SLUG } },
                { tags: { contains: FORUM_TAG } },
              ],
            };
          }

          const tgConvs = await prisma.conversation.findMany({
            where: tgWhere,
            select: { id: true, customerContact: true, metadata: true },
            distinct: ["customerContact"],
          });

          for (const conv of tgConvs) {
            const meta = (conv.metadata as Record<string, unknown>) || {};
            const rawChatId = meta.telegramChatId || conv.customerContact;
            const chatId = Number(rawChatId);
            if (!Number.isFinite(chatId)) continue;
            try {
              await sendTelegramMessage(settings.telegramBotToken, chatId, messageText);
              broadcastResult.sentTg++;
              await prisma.conversation.update({
                where: { id: conv.id },
                data: {
                  metadata: {
                    ...meta,
                    activeForumTopicId: topic.id,
                    awaitingForumAnswer: true,
                  },
                },
              });
              await new Promise((r) => setTimeout(r, 400));
            } catch (tgErr) {
              logger.warn(`[Forum/Topics] TG send error for ${chatId}:`, { error: String(tgErr) });
            }
          }
        }
      }

      // Update topic subscribers count
      await prisma.forumTopic.update({
        where: { id: topic.id },
        data: { subscribersCount: broadcastResult.sentWa + broadcastResult.sentTg },
      });
    }

    return NextResponse.json({
      success: true,
      topic,
      broadcastResult,
    });
  } catch (error) {
    logger.error("[Forum/Topics] Failed to create topic:", error);
    return NextResponse.json({ error: "Failed to create topic" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { id, action, targetCustomerIds = [], channels = ["whatsapp", "telegram"] } = body;

    if (!id) {
      return NextResponse.json({ error: "معرّف الموضوع مطلوب" }, { status: 400 });
    }

    const topic = await prisma.forumTopic.findUnique({ where: { id } });
    if (!topic) {
      return NextResponse.json({ error: "الموضوع غير موجود" }, { status: 404 });
    }

    if (action === "close") {
      const updated = await prisma.forumTopic.update({
        where: { id },
        data: { status: "closed", closedAt: new Date() },
      });
      return NextResponse.json({ success: true, topic: updated, message: "تم إغلاق وأرشفة الموضوع بنجاح" });
    }

    if (action === "add_participants") {
      if (!Array.isArray(targetCustomerIds) || targetCustomerIds.length === 0) {
        return NextResponse.json({ error: "يرجى تحديد المشاركين الجدد" }, { status: 400 });
      }

      const existingSet = new Set(topic.targetCustomerIds);
      const newIds = targetCustomerIds.filter((cid: string) => !existingSet.has(cid));

      if (newIds.length === 0) {
        return NextResponse.json({ success: true, message: "جميع المشاركين المحددين مسجلون بالفعل في هذا الموضوع" });
      }

      const messageText = formatForumTopicBroadcast(topic.title, topic.promptQuestion);
      let sentWa = 0;
      let sentTg = 0;

      const customersToBroadcast = await prisma.customer.findMany({
        where: { id: { in: newIds }, isBlocked: false },
        select: { id: true, phone: true, whatsapp: true, name: true },
      });

      // Send via WhatsApp
      if (channels.includes("whatsapp")) {
        for (const cust of customersToBroadcast) {
          const raw = cust.whatsapp || cust.phone || "";
          const contact = raw.endsWith("@lid") ? raw : raw.replace(/[^\d+]/g, "");
          if (!contact || (!contact.endsWith("@lid") && contact.length < 8)) continue;
          try {
            const sent = await sendWhatsAppMessage(contact, messageText);
            if (sent) {
              sentWa++;
              await prisma.conversation.updateMany({
                where: { customerContact: { contains: contact.slice(-8) }, channel: "whatsapp" },
                data: {
                  metadata: {
                    activeForumTopicId: topic.id,
                    awaitingForumAnswer: true,
                  },
                },
              });
            }
            await new Promise((r) => setTimeout(r, 1200));
          } catch (waErr) {
            logger.warn(`[Forum/Topics] WA send error for new participant ${contact}:`, { error: String(waErr) });
          }
        }
      }

      // Send via Telegram
      if (channels.includes("telegram")) {
        const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
        if (settings?.telegramBotToken) {
          const tgConvs = await prisma.conversation.findMany({
            where: { channel: "telegram", customerId: { in: newIds } },
            select: { id: true, customerContact: true, metadata: true },
            distinct: ["customerContact"],
          });

          for (const conv of tgConvs) {
            const meta = (conv.metadata as Record<string, unknown>) || {};
            const rawChatId = meta.telegramChatId || conv.customerContact;
            const chatId = Number(rawChatId);
            if (!Number.isFinite(chatId)) continue;
            try {
              await sendTelegramMessage(settings.telegramBotToken, chatId, messageText);
              sentTg++;
              await prisma.conversation.update({
                where: { id: conv.id },
                data: {
                  metadata: {
                    ...meta,
                    activeForumTopicId: topic.id,
                    awaitingForumAnswer: true,
                  },
                },
              });
              await new Promise((r) => setTimeout(r, 400));
            } catch (tgErr) {
              logger.warn(`[Forum/Topics] TG send error for new participant ${chatId}:`, { error: String(tgErr) });
            }
          }
        }
      }

      const updatedIds = Array.from(new Set([...topic.targetCustomerIds, ...newIds]));
      const updated = await prisma.forumTopic.update({
        where: { id },
        data: {
          targetCustomerIds: updatedIds,
          subscribersCount: { increment: sentWa + sentTg },
        },
      });

      return NextResponse.json({
        success: true,
        topic: updated,
        sentWa,
        sentTg,
        totalNewAdded: newIds.length,
      });
    }

    return NextResponse.json({ error: "الإجراء غير معروف" }, { status: 400 });
  } catch (error) {
    logger.error("[Forum/Topics] Failed to update topic:", error);
    return NextResponse.json({ error: "Failed to update topic" }, { status: 500 });
  }
}
