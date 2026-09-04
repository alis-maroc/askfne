export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerShutdownHandlers } = await import("@/lib/shutdown");
    registerShutdownHandlers();

    // Auto-start WhatsApp connection on server boot
    const { startWhatsAppInit } = await import("@/lib/channels/whatsapp");
    startWhatsAppInit(false);

    // Auto-start 48-hour background sync scheduler for MEN and taalim.org
    const { startAutoSyncScheduler } = await import("@/lib/services/auto-sync");
    startAutoSyncScheduler();
  }
}
