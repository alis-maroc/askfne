/**
 * POST /api/admin/send-request-pdf
 * Sends a previously-generated PDF (by printToken) to the customer's WhatsApp.
 * Uses the running WhatsApp Baileys socket.
 * Body: { printToken: string, jid: string, fullName?: string, label?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { generateRequestPdf } from "@/lib/requests/pdf-generator";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request, "admin:create");
    if (!isAuthenticated(auth)) return auth;

    let body: { printToken: string; jid: string; fullName?: string; label?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { printToken, jid, fullName = "إداري", label = "طلب إداري" } = body;

    if (!printToken || !jid) {
        return NextResponse.json(
            { error: "printToken and jid are required" },
            { status: 400 }
        );
    }

    // Access the running WhatsApp state via the module global
    // The Baileys socket is stored on globalThis.__waState
    const g = globalThis as unknown as {
        __waState?: { sock: any; connectionStatus: string };
    };
    const waState = g.__waState;

    if (!waState?.sock || waState.connectionStatus !== "connected") {
        return NextResponse.json(
            { error: "WhatsApp is not connected", status: waState?.connectionStatus },
            { status: 503 }
        );
    }

    // Generate PDF
    const pdfBuffer = await generateRequestPdf(printToken);
    if (!pdfBuffer) {
        return NextResponse.json(
            { error: "PDF generation failed" },
            { status: 500 }
        );
    }

    // Send via WhatsApp
    const safeName = `طلب_${fullName.replace(/\s+/g, "_")}.pdf`;
    const caption = `📄 وثيقة ${label} الرسمية جاهزة للتحميل والطباعة\nالمعني بالأمر: ${fullName}`;

    try {
        await waState.sock.sendMessage(jid, {
            document: pdfBuffer,
            mimetype: "application/pdf",
            fileName: safeName,
            caption,
        });

        logger.info(`[AdminAPI] PDF sent to ${jid} (${pdfBuffer.length} bytes)`);
        return NextResponse.json({
            success: true,
            bytes: pdfBuffer.length,
            jid,
            printToken,
        });
    } catch (err: any) {
        logger.error(`[AdminAPI] Failed to send PDF to ${jid}: ${err?.message}`);
        return NextResponse.json(
            { error: `Failed to send: ${err?.message}` },
            { status: 500 }
        );
    }
}
