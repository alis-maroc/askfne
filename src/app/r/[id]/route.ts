import { NextRequest, NextResponse } from "next/server";
import { resolveShortLink } from "@/lib/short-links";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const targetUrl = await resolveShortLink(id);

  if (!targetUrl) {
    return new NextResponse("الرابط غير موجود أو انتهت صلاحيته", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.redirect(targetUrl, 302);
}
