import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { FORUM_TAG, FORUM_TAG_SLUG } from "@/lib/forum/forum-service";
import { BAYAN_TAG, BAYAN_TAG_SLUG } from "@/lib/channels/whatsapp";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const channelsParam = searchParams.get("channels");
    const activeChannels = channelsParam
      ? channelsParam.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean)
      : ["whatsapp", "telegram"];

    const [customers, telegramConvs] = await Promise.all([
      prisma.customer.findMany({
        where: { isBlocked: false },
        orderBy: { lastContact: "desc" },
        select: {
          id: true,
          name: true,
          phone: true,
          whatsapp: true,
          tags: true,
          metadata: true,
          lastContact: true,
        },
      }),
      prisma.conversation.findMany({
        where: { channel: "telegram", customerId: { not: null } },
        select: {
          customerId: true,
          customerContact: true,
        },
      }),
    ]);

    // Build telegram contact map by customerId
    const tgContactMap = new Map<string, string>();
    for (const conv of telegramConvs) {
      if (conv.customerId && conv.customerContact && !tgContactMap.has(conv.customerId)) {
        tgContactMap.set(conv.customerId, conv.customerContact);
      }
    }

    let totalWhatsappCount = 0;
    let totalTelegramCount = 0;
    let totalCombinedCount = 0;
    let totalForumSubscribersCount = 0;

    const allMapped = customers.map((c) => {
      const tagsList = (c.tags || "").split(",").map((t) => t.trim());
      const isForumSub =
        tagsList.includes(FORUM_TAG_SLUG) ||
        tagsList.includes(FORUM_TAG) ||
        tagsList.includes("forum_subscribers") ||
        tagsList.includes("forum_subscriber") ||
        tagsList.includes("forum-subscriber") ||
        tagsList.includes("مشتركو منتدى النقاش") ||
        tagsList.includes("مشترك في المنتدى") ||
        tagsList.some((t) => t.includes("منتدى"));
      const isBayanSub = tagsList.includes(BAYAN_TAG_SLUG) || tagsList.includes(BAYAN_TAG);
      const isBayanDeclined =
        tagsList.includes("bayan_opted_out") || tagsList.includes("رافضو خدمة البيانات");

      const meta = (c.metadata as Record<string, unknown> | null) || {};
      const tgHandle = (meta.telegram as string) || tgContactMap.get(c.id) || "";

      const hasWa = Boolean(c.whatsapp?.trim() || c.phone?.trim());
      const hasTg = Boolean(tgHandle.trim());

      if (hasWa) totalWhatsappCount++;
      if (hasTg) totalTelegramCount++;
      if (hasWa || hasTg) totalCombinedCount++;
      if (isForumSub) totalForumSubscribersCount++;

      const channels: string[] = [];
      if (hasWa) channels.push("whatsapp");
      if (hasTg) channels.push("telegram");

      const displayContact = c.whatsapp || c.phone || tgHandle || "";

      return {
        id: c.id,
        name: c.name || (hasTg ? `تيليغرام - ${tgHandle}` : "مستخدم بدون اسم"),
        phone: displayContact,
        telegramHandle: tgHandle,
        channels,
        hasWa,
        hasTg,
        isForumSub,
        isBayanSub,
        isBayanDeclined,
        lastContact: c.lastContact,
      };
    });

    // Filter candidates by requested activeChannels
    const candidates = allMapped.filter((c) => {
      // Must have at least one channel
      if (c.channels.length === 0) return false;

      const wantsWa = activeChannels.includes("whatsapp");
      const wantsTg = activeChannels.includes("telegram");

      if (wantsWa && wantsTg) {
        return c.hasWa || c.hasTg;
      }
      if (wantsWa) {
        return c.hasWa;
      }
      if (wantsTg) {
        return c.hasTg;
      }
      return true;
    });

    return NextResponse.json({
      candidates,
      counts: {
        whatsapp: totalWhatsappCount,
        telegram: totalTelegramCount,
        combined: totalCombinedCount,
        filtered: candidates.length,
        forumSubscribers: totalForumSubscribersCount,
      },
      forumSubscribersCount: totalForumSubscribersCount,
      telegramUsersCount: totalTelegramCount,
      totalCustomers: totalCombinedCount,
    });
  } catch (error) {
    logger.error("[Forum/Subscribers] Failed to fetch subscribers:", error);
    return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 });
  }
}
