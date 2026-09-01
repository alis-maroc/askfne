export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerShutdownHandlers } = await import("@/lib/shutdown");
    registerShutdownHandlers();

    // Auto-start WhatsApp connection on server boot
    const { startWhatsAppInit } = await import("@/lib/channels/whatsapp");
    startWhatsAppInit(false);
  }
}
