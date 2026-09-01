import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} from "@whiskeysockets/baileys";
import pino from "pino";

async function test() {
  console.log("Testing Baileys...");
  try {
    const { state, saveCreds } = await useMultiFileAuthState("/tmp/baileys_test_dir");
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(e => {
      console.log("fetchLatestBaileysVersion failed:", e.message);
      return { version: [2, 3000, 1015901307], isLatest: false };
    });
    console.log("Version:", version, "isLatest:", isLatest);

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "info" }),
      browser: Browsers.macOS("Desktop"),
      printQRInTerminal: true,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log("CONNECTION UPDATE:", {
        connection,
        hasQR: !!qr,
        statusCode: lastDisconnect?.error?.output?.statusCode,
        error: lastDisconnect?.error?.message
      });
      if (qr) {
        console.log(">>> QR RECEIVED SUCCESSFULLY! Length:", qr.length);
        process.exit(0);
      }
      if (connection === "close") {
        console.log("Connection closed with reason:", lastDisconnect?.error);
      }
    });
  } catch (err) {
    console.error("Crash:", err);
  }
}

test();
