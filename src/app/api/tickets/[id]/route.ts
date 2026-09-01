import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { sendTelegramMessage } from "@/lib/channels/telegram";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "tickets:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        conversation: {
          select: {
            id: true,
            customerName: true,
            customerContact: true,
            channel: true,
            status: true,
          },
        },
        department: {
          select: { id: true, name: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(ticket);
  } catch (error) {
    logger.error("Failed to fetch ticket:", error);
    return NextResponse.json(
      { error: "Failed to fetch ticket" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "tickets:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    if (body.action === "reply") {
      const reply = typeof body.message === "string" ? body.message.trim() : "";
      if (!reply) return NextResponse.json({ error: "Reply message is required" }, { status: 400 });

      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: { conversation: true },
      });
      if (!ticket?.conversation) return NextResponse.json({ error: "Ticket has no linked conversation" }, { status: 400 });
      if (!["telegram", "whatsapp"].includes(ticket.conversation.channel)) {
        return NextResponse.json({ error: "This action currently supports Telegram and WhatsApp tickets only" }, { status: 400 });
      }

      if (ticket.conversation.channel === "whatsapp") {
        const { sendWhatsAppMessage } = await import("@/lib/channels/whatsapp");
        const contact = ticket.conversation.customerContact;
        const delivered = await sendWhatsAppMessage(contact, reply);
        if (!delivered) {
          return NextResponse.json({ error: "Impossible d'envoyer le message WhatsApp (vérifiez que WhatsApp est connecté)." }, { status: 502 });
        }
      } else if (ticket.conversation.channel === "telegram") {
        const metadata = (ticket.conversation.metadata ?? {}) as Record<string, unknown>;
        const chatId = typeof metadata.telegramChatId === "string" ? metadata.telegramChatId : ticket.conversation.customerContact;
        if (!/^\d+$/.test(chatId)) return NextResponse.json({ error: "Telegram chat ID unavailable. Ask the customer to send a new message first." }, { status: 400 });

        const settings = await prisma.settings.findFirst({ select: { telegramBotToken: true } });
        if (!settings?.telegramBotToken) return NextResponse.json({ error: "Telegram bot token is not configured" }, { status: 400 });
        const delivered = await sendTelegramMessage(settings.telegramBotToken, Number(chatId), reply);
        if (!delivered) return NextResponse.json({ error: "Telegram refused the message" }, { status: 502 });
      }

      const message = await prisma.message.create({ data: { conversationId: ticket.conversation.id, role: "assistant", content: reply } });
      await prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
      return NextResponse.json({ success: true, message });
    }
    const {
      title,
      description,
      status,
      priority,
      resolution,
      departmentId,
      assignedToId,
      conversationId,
    } = body;

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(resolution !== undefined && { resolution: resolution.trim() }),
        ...(departmentId !== undefined && {
          departmentId: departmentId || null,
        }),
        ...(assignedToId !== undefined && {
          assignedToId: assignedToId || null,
        }),
        ...(conversationId !== undefined && {
          conversationId: conversationId || null,
        }),
      },
      include: {
        conversation: {
          select: {
            id: true,
            customerName: true,
            customerContact: true,
            channel: true,
            status: true,
          },
        },
        department: {
          select: { id: true, name: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(ticket);
  } catch (error) {
    logger.error("Failed to update ticket:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "tickets:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    await prisma.ticket.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete ticket:", error);
    return NextResponse.json(
      { error: "Failed to delete ticket" },
      { status: 500 }
    );
  }
}
