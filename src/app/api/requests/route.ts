import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where: Record<string, unknown> = {};
    if (channel && channel !== "all") where.channel = channel;
    if (type && type !== "all") where.type = type;
    if (status && status !== "all") where.status = status;

    const [rows, total, allRecords] = await Promise.all([
      (prisma as any).administrativeRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).administrativeRequest.count({ where }),
      // Fetch compact aggregate metrics across all requests
      (prisma as any).administrativeRequest.findMany({
        select: {
          type: true,
          channel: true,
          province: true,
          status: true,
        },
      }),
    ]);

    // Aggregate by document type
    const byType: Record<string, number> = {};
    // Aggregate by province
    const byProvince: Record<string, number> = {};
    // Aggregate by channel
    const byChannel: Record<string, number> = {};

    for (const r of allRecords) {
      const t = r.type || "libre";
      byType[t] = (byType[t] || 0) + 1;

      const p = r.province?.trim() || "غير محدد";
      byProvince[p] = (byProvince[p] || 0) + 1;

      const c = r.channel || "whatsapp";
      byChannel[c] = (byChannel[c] || 0) + 1;
    }

    const typeStats = Object.entries(byType)
      .map(([key, count]) => ({ type: key, count }))
      .sort((a, b) => b.count - a.count);

    const provinceStats = Object.entries(byProvince)
      .map(([name, count]) => ({ province: name, count }))
      .sort((a, b) => b.count - a.count);

    const channelStats = Object.entries(byChannel)
      .map(([name, count]) => ({ channel: name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      rows,
      total,
      page,
      limit,
      stats: {
        totalDocs: allRecords.length,
        byType: typeStats,
        byProvince: provinceStats,
        byChannel: channelStats,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, conversationId, channel, type, recipientLevel, fullName, grade, school, province, subject, generatedText, printToken } = body;

    const saved = await (prisma as any).administrativeRequest.create({
      data: {
        id,
        conversationId: conversationId || null,
        channel: channel || "webchat",
        type: type || "libre",
        recipientLevel: recipientLevel || "province",
        fullName: fullName || "",
        grade: grade || "",
        school: school || "",
        province: province || "",
        subject: subject || "",
        extraData: body.extraData || {},
        generatedText: generatedText || "",
        printToken,
        status: "generated",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
