"use client";
import { useEffect, useState, useCallback, useRef } from "react";

export default function WhatsAppSetupPage() {
  const [status, setStatus] = useState<string>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [qrAge, setQrAge] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/channels/whatsapp?_=${Date.now()}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) {
        if (r.status === 401) {
          setStatus("auth_required");
          setMessage("Session expirée. Merci de vous reconnecter.");
          setIsRefreshing(false);
        }
        return;
      }
      const d = await r.json();
      setStatus(d.status || "unknown");
      setMessage(d.message || "");
      setIsSyncing(Boolean(d.isSyncing));
      if (typeof d.qrAge === "number") setQrAge(d.qrAge);
      if (d.qr) {
        setQr(d.qr);
        setIsRefreshing(false);
      } else if (d.status === "connected") {
        setQr(null);
        setIsRefreshing(false);
      }
    } catch (_) {}
  }, []);

  const requestNewQR = useCallback(async (force = true) => {
    setIsRefreshing(true);
    setQr(null);
    setStatus("connecting");
    setMessage("Lancement d'une nouvelle session Chromium...");
    try {
      await fetch("/api/channels/whatsapp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconnect", force }),
      });
      
      setTimeout(poll, 1500);
    } catch (_) {
      setMessage("Impossible de demander un nouveau QR pour le moment.");
      setIsRefreshing(false);
    }
  }, [poll]);

  useEffect(() => {
    poll();
    pollIntervalRef.current = setInterval(poll, 1500);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [poll]);

  const isConnected = status === "connected";
  const isExpired = qrAge > 3600 && status === "qr_ready" && !isSyncing;

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      maxWidth: 540,
      margin: "40px auto",
      padding: "32px 24px",
      background: "#ffffff",
      borderRadius: 16,
      boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      textAlign: "center",
      border: "1px solid #eaeaea"
    }}>
      <div style={{ fontSize: 42, marginBottom: 12 }}>💬</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px", color: "#111827" }}>
        Connexion WhatsApp Agent
      </h1>
      <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
        Scannez le QR code ci-dessous avec WhatsApp pour activer l'agent intelligent sur votre numéro.
      </p>

      {/* QR Code Frame */}
      <div style={{
        width: 290,
        height: 290,
        margin: "0 auto 20px",
        border: `3px solid ${isConnected ? "#22c55e" : isSyncing ? "#3b82f6" : isExpired ? "#ef4444" : "#25D366"}`,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isConnected ? "#f0fdf4" : isSyncing ? "#eff6ff" : "#f9fafb",
        position: "relative",
        overflow: "hidden"
      }}>
        {isConnected ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 64, color: "#22c55e", marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>Connecté avec succès !</div>
            <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>L'agent répond désormais à vos clients.</div>
          </div>
        ) : isSyncing ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{
              width: 44,
              height: 44,
              border: "4px solid #dbeafe",
              borderTopColor: "#3b82f6",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 12px"
            }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1d4ed8" }}>Authentification réussie !</div>
            <div style={{ fontSize: 13, color: "#3b82f6", marginTop: 6, lineHeight: 1.4 }}>
              Synchronisation des discussions en cours...<br />
              <strong>Ne fermez pas cette page (10–15s).</strong>
            </div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : isRefreshing || !qr ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{
              width: 36,
              height: 36,
              border: "3px solid #e5e7eb",
              borderTopColor: "#25D366",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 12px"
            }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Génération du QR Code...</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Environ 1 heure</div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img
              src={qr}
              alt="WhatsApp QR Code"
              style={{
                width: "92%",
                height: "92%",
                objectFit: "contain",
                opacity: isExpired ? 0.35 : 1,
                transition: "opacity 0.2s"
              }}
            />
            {isExpired && (
              <div style={{
                position: "absolute",
                background: "rgba(17, 24, 39, 0.85)",
                color: "#ffffff",
                padding: "10px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600
              }}>
                ⏳ QR Expiré — Cliquez ci-dessous
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status indicator badge */}
      <div style={{ marginBottom: 16 }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          borderRadius: 9999,
          fontSize: 13,
          fontWeight: 600,
          background: isConnected ? "#dcfce7" : isSyncing ? "#dbeafe" : status === "qr_ready" ? "#fef3c7" : "#f3f4f6",
          color: isConnected ? "#15803d" : isSyncing ? "#1d4ed8" : status === "qr_ready" ? "#b45309" : "#4b5563",
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isConnected ? "#22c55e" : isSyncing ? "#3b82f6" : status === "qr_ready" ? "#f59e0b" : "#9ca3af"
          }} />
          {isConnected
            ? "Connecté & Actif"
            : isSyncing
            ? "Synchronisation des discussions..."
            : status === "qr_ready"
            ? `QR Prêt (actif depuis ${qrAge}s)`
            : status === "connecting"
            ? "Initialisation..."
            : status}
        </span>
      </div>

      {message && (
        <p style={{ color: "#4b5563", fontSize: 13, margin: "0 0 20px" }}>
          {message}
        </p>
      )}

      {/* Action Buttons */}
      {!isConnected && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => requestNewQR(true)}
            disabled={isRefreshing || isSyncing}
            style={{
              background: isSyncing ? "#9ca3af" : "#25D366",
              color: "#ffffff",
              border: "none",
              padding: "12px 24px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: (isRefreshing || isSyncing) ? "not-allowed" : "pointer",
              opacity: (isRefreshing || isSyncing) ? 0.6 : 1,
              boxShadow: isSyncing ? "none" : "0 2px 8px rgba(37, 211, 102, 0.3)",
              transition: "all 0.15s ease"
            }}
          >
            {isSyncing ? "⏳ Synchronisation en cours..." : isRefreshing ? "⏳ Génération..." : "🔄 Obtenir un nouveau QR code"}
          </button>
        </div>
      )}

      <div style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: "1px solid #f3f4f6",
        fontSize: 12,
        color: "#9ca3af",
        textAlign: "left",
        lineHeight: 1.6
      }}>
        <strong style={{ color: "#4b5563" }}>Instructions :</strong>
        <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>Ouvrez <strong>WhatsApp</strong> sur votre téléphone</li>
          <li>Allez dans <strong>Paramètres</strong> &gt; <strong>Appareils connectés</strong></li>
          <li>Touchez <strong>Connecter un appareil</strong> et pointez la caméra sur le QR code ci-dessus</li>
          <li>Dès le scan, <strong>laissez la page se synchroniser</strong> sans cliquer sur Nouveau QR</li>
        </ol>
      </div>
    </div>
  );
}
