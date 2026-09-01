"use client";

import { useEffect, useState } from "react";

type WhatsAppStatus = {
  status?: string;
  qr?: string | null;
  qrAge?: number;
  message?: string;
};

export default function WhatsAppSharePage() {
  const [data, setData] = useState<WhatsAppStatus>({});
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("share");
    if (!token) {
      setInvalid(true);
      return;
    }

    const poll = async () => {
      const response = await fetch(`/api/channels/whatsapp?share=${encodeURIComponent(token)}&_=${Date.now()}`, { cache: "no-store" });
      if (response.status === 403) {
        setInvalid(true);
        return;
      }
      if (response.ok) setData(await response.json());
    };

    poll();
    const interval = window.setInterval(poll, 1500);
    return () => window.clearInterval(interval);
  }, []);

  if (invalid) {
    return <main style={styles.main}><section style={styles.card}><h1>Lien invalide</h1><p>Ce lien de partage n’est plus valable.</p></section></main>;
  }

  const connected = data.status === "connected";
  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <h1>Connexion WhatsApp</h1>
        <p>{connected ? "WhatsApp est connecté." : "Scannez ce QR code avec WhatsApp sur votre téléphone."}</p>
        <div style={{ ...styles.qr, borderColor: connected ? "#16a34a" : "#25D366" }}>
          {connected ? <strong style={styles.success}>Connecté</strong> : data.qr ? <img src={data.qr} alt="QR code WhatsApp" style={styles.image} /> : <strong>Génération du QR code...</strong>}
        </div>
        {!connected && <small>{data.message || "En attente du QR code..."}{data.qrAge ? ` (${data.qrAge}s)` : ""}</small>}
      </section>
    </main>
  );
}

const styles = {
  main: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f3f4f6", padding: 20, fontFamily: "Arial, sans-serif" },
  card: { width: "min(100%, 480px)", background: "white", borderRadius: 16, padding: 28, textAlign: "center" as const, boxShadow: "0 8px 30px rgba(0,0,0,.1)" },
  qr: { width: 320, height: 320, maxWidth: "100%", margin: "24px auto", border: "4px solid", borderRadius: 16, display: "grid", placeItems: "center", overflow: "hidden" },
  image: { width: "94%", height: "94%", objectFit: "contain" as const },
  success: { color: "#15803d", fontSize: 24 },
};