"use client";

import { Header } from "@/components/layout/header";
import {
  MessageCircle,
  Mail,
  Phone,
  Wifi,
  WifiOff,
  Save,
  Loader2,
  QrCode,
  Key,
  TestTube,
  PhoneCall,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Send,
  Globe,
  Copy,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelData {
  id: string | null;
  type: string;
  isActive: boolean;
  config: Record<string, unknown>;
  status: string;
  tokenConfigured?: boolean;
}

type WhatsAppMode = "web" | "api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const isConnected = status === "connected";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        isConnected
          ? "bg-owly-success/10 text-owly-success"
          : "bg-owly-danger/10 text-owly-danger"
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          isConnected ? "bg-owly-success" : "bg-owly-danger"
        )}
      />
      {isConnected ? "Connected" : "Disconnected"}
    </span>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:ring-offset-2",
        enabled ? "bg-owly-primary" : "bg-owly-border"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
          enabled ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  isSecret = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  isSecret?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="block text-xs font-medium text-owly-text-light mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={isSecret && !visible ? "password" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg bg-owly-bg text-owly-text placeholder:text-owly-text-light/50 focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary transition-colors"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-owly-text-light hover:text-owly-text transition-colors"
          >
            {visible ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp Card
// ---------------------------------------------------------------------------

function WhatsAppCard({
  channel,
  onSave,
  onAction,
  saving,
}: {
  channel: ChannelData;
  onSave: (type: string, config: Record<string, unknown>, isActive: boolean) => void;
  onAction: (type: string, action: string, payload?: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const cfg = (channel.config || {}) as Record<string, string>;
  const [isActive, setIsActive] = useState(channel.isActive);
  const [mode, setMode] = useState<WhatsAppMode>(
    (cfg.mode as WhatsAppMode) || "api"
  );
  const [apiKey, setApiKey] = useState(cfg.apiKey || cfg.accessToken || "");
  const [phoneNumberId, setPhoneNumberId] = useState(cfg.phoneNumberId || cfg.phoneId || "");
  const [verifyToken, setVerifyToken] = useState(cfg.verifyToken || "owly_webhook_secret");
  const [phoneNumber, setPhoneNumber] = useState(cfg.phoneNumber || "");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isConnected = channel.status === "connected";

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setQrCode(null);
    try {
      const res = await fetch("/api/channels/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.qr) setQrCode(data.qr);
      }
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/channels/whatsapp");
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (status.qr) setQrCode(status.qr);
            if (status.status === "connected") {
              if (pollRef.current) clearInterval(pollRef.current);
              setConnecting(false);
              onAction("whatsapp", "connect");
            }
          }
        } catch {}
      }, 2000);
    } catch {
      setConnecting(false);
    }
  };

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/channels/whatsapp/webhook`
    : "http://158.69.24.123:3000/api/channels/whatsapp/webhook";

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-owly-surface rounded-xl border border-owly-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-owly-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-green-50 text-green-600">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-owly-text">WhatsApp</h3>
              <p className="text-xs text-owly-text-light mt-0.5">
                Messaging via WhatsApp Cloud API (Meta) or Web QR
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={channel.status} />
            <Toggle enabled={isActive} onChange={setIsActive} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Smart Permanent Redirect & Dynamic Poster Management */}
        <div className="p-4 bg-gradient-to-br from-amber-500/10 via-red-500/5 to-slate-50 border border-amber-300/60 rounded-xl space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
              <span>🎯 الرابط الذكي الدائم والملصق التعريفي (Smart Anti-Block Link)</span>
            </div>
            <a
              href="/affiche.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-colors shadow-sm text-xs"
            >
              📄 عرض الملصق الرسمي (Affiche)
            </a>
          </div>

          <p className="text-slate-600 leading-relaxed">
            لحماية منشوراتكم وملصقاتكم المطبوعة من خطر حظر الرقم، يقوم الرابط والـ QR Code الدائم 
            <strong className="text-amber-900 mx-1 font-mono">Hub.taalim.org/Bot</strong>
            بالتحويل الفوري والتلقائي إلى رقم الواتساب النشط المحدد أدناه. في حال تغيير الرقم مستقبلاً، يكفي تعديله هنا ليتم تحديث وجهة جميع الملصقات السابقة فوراً!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">
                📱 رقم الواتساب النشط للتحويل الفوري (مع رمز الدولة) :
              </label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="212669305883"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">
                🔗 الرابط الدائم الموحد للطباعة والنشر :
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value="https://Hub.taalim.org/Bot"
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-100 border border-slate-300 rounded-lg text-slate-800 select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText("https://Hub.taalim.org/Bot");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-3 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 text-xs shrink-0"
                >
                  {copied ? "✓ تم" : "نسخ"}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-amber-200/80 space-y-2">
            <span className="font-bold text-slate-800 text-[11px] block">
              📥 تحميل واستعراض جميع المواد الرسمية الجاهزة للنشر والطباعة :
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <a
                href="/affiche-fne-chatbot.pdf"
                download="affiche-fne-chatbot.pdf"
                className="flex items-center gap-2 p-2 bg-white hover:bg-red-50 border border-red-200 rounded-lg text-red-800 font-bold transition-all shadow-xs"
              >
                <span className="text-base">📄</span>
                <div>
                  <div className="text-[11px]">الملصق الكامل (PDF)</div>
                  <div className="text-[9px] text-slate-500 font-normal">جاهز للطباعة بدقة A4 عالية</div>
                </div>
              </a>

              <a
                href="/affiche-fne-chatbot.png"
                download="affiche-fne-chatbot.png"
                className="flex items-center gap-2 p-2 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg text-blue-800 font-bold transition-all shadow-xs"
              >
                <span className="text-base">🖼️</span>
                <div>
                  <div className="text-[11px]">الملصق الكامل (صورة PNG)</div>
                  <div className="text-[9px] text-slate-500 font-normal">للنشر على فيسبوك والمجموعات</div>
                </div>
              </a>

              <a
                href="/fne-services-guide.png"
                download="fne-services-guide.png"
                className="flex items-center gap-2 p-2 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-bold transition-all shadow-xs"
              >
                <span className="text-base">📋</span>
                <div>
                  <div className="text-[11px]">دليل الخدمات الـ 6 (صورة منفصلة)</div>
                  <div className="text-[9px] text-slate-500 font-normal">الجزء العلوي للخدمات</div>
                </div>
              </a>

              <a
                href="/fne-bot-direct-access.png"
                download="fne-bot-direct-access.png"
                className="flex items-center gap-2 p-2 bg-white hover:bg-purple-50 border border-purple-200 rounded-lg text-purple-800 font-bold transition-all shadow-xs"
              >
                <span className="text-base">🤖</span>
                <div>
                  <div className="text-[11px]">بطاقة المجيب والـ QR (صورة منفصلة)</div>
                  <div className="text-[9px] text-slate-500 font-normal">الجزء السفلي للاتصال المباشر</div>
                </div>
              </a>

              <a
                href="/qr_fne_wa.png"
                download="qr_fne_wa.png"
                className="flex items-center gap-2 p-2 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg text-teal-800 font-bold transition-all shadow-xs"
              >
                <span className="text-base">📱</span>
                <div>
                  <div className="text-[11px]">رمز QR Code عالي الدقة</div>
                  <div className="text-[9px] text-slate-500 font-normal">Hub.taalim.org/Bot</div>
                </div>
              </a>

              <a
                href="/guide-reinstallation-fne-serveur.pdf"
                download="guide-reinstallation-fne-serveur.pdf"
                className="flex items-center gap-2 p-2 bg-white hover:bg-amber-50 border border-amber-300 rounded-lg text-amber-900 font-bold transition-all shadow-xs"
              >
                <span className="text-base">🛠️</span>
                <div>
                  <div className="text-[11px]">دليل إعادة تثبيت السيرفر (PDF)</div>
                  <div className="text-[9px] text-slate-500 font-normal">خطة الطوارئ والاسترجاع</div>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Mode selector */}
        <div>
          <label className="block text-xs font-medium text-owly-text-light mb-2">
            Connection Method
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("api")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                mode === "api"
                  ? "border-green-300 bg-green-50 text-green-700 font-semibold"
                  : "border-owly-border bg-owly-bg text-owly-text-light hover:bg-owly-primary-50 hover:text-owly-text"
              )}
            >
              <Key className="h-4 w-4" />
              WhatsApp Cloud API (Meta)
            </button>
            <button
              type="button"
              onClick={() => setMode("web")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                mode === "web"
                  ? "border-green-300 bg-green-50 text-green-700 font-semibold"
                  : "border-owly-border bg-owly-bg text-owly-text-light hover:bg-owly-primary-50 hover:text-owly-text"
              )}
            >
              <QrCode className="h-4 w-4" />
              WhatsApp Web (QR)
            </button>
          </div>
        </div>

        {mode === "api" ? (
          <div className="space-y-4">
            <FieldInput
              label="Meta Access Token (API Key)"
              value={apiKey}
              onChange={setApiKey}
              placeholder="EAATcmstikgIBSWdVhDCT8xgEiZBEEhxQWFgL..."
              isSecret
            />

            <FieldInput
              label="Phone Number ID (ID de numéro Meta)"
              value={phoneNumberId}
              onChange={setPhoneNumberId}
              placeholder="Ex: 105948329482910"
            />

            <FieldInput
              label="Webhook Verify Token (Jeton de vérification)"
              value={verifyToken}
              onChange={setVerifyToken}
              placeholder="owly_webhook_secret"
            />

            {/* Meta Webhook Configuration Box */}
            <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-lg space-y-2 text-xs">
              <div className="font-semibold text-blue-900 flex items-center justify-between">
                <span>📋 Configuration Webhook Meta :</span>
                <button
                  type="button"
                  onClick={copyWebhook}
                  className="text-blue-700 hover:text-blue-900 bg-blue-100 px-2 py-0.5 rounded font-medium text-[11px]"
                >
                  {copied ? "✓ Copié !" : "Copier l'URL"}
                </button>
              </div>
              <div>
                <span className="text-blue-800 font-medium">Callback URL :</span>
                <code className="block bg-white p-2 mt-1 rounded border border-blue-200 text-blue-950 font-mono text-[11px] break-all select-all">
                  {webhookUrl}
                </code>
              </div>
              <div className="text-blue-800">
                <span>Verify Token : </span>
                <strong className="font-mono text-blue-950">{verifyToken || "owly_webhook_secret"}</strong>
              </div>
              <div className="text-blue-700 text-[11px] pt-1">
                👉 Dans <strong>Meta Developers &gt; Configuration Webhook</strong>, collez cette URL et ce Jeton, puis cochez le champ <strong>messages</strong>.
              </div>
            </div>

            {isConnected && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 font-medium">
                  WhatsApp Cloud API configuré et actif
                </span>
              </div>
            )}
          </div>
        ) : (
          <div>
            {isConnected ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    Session Active
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onAction("whatsapp", "disconnect")}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <WifiOff className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-owly-border bg-owly-bg p-6 flex flex-col items-center">
                <div className="w-48 h-48 bg-white border-2 border-dashed border-owly-border rounded-lg flex items-center justify-center mb-3 overflow-hidden">
                  {qrCode ? (
                    <img
                      src={qrCode}
                      alt="WhatsApp QR Code"
                      className="w-full h-full object-contain"
                    />
                  ) : connecting ? (
                    <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                  ) : (
                    <div className="text-center">
                      <QrCode className="h-10 w-10 text-owly-text-light/40 mx-auto mb-1" />
                      <p className="text-xs text-owly-text-light/60">QR Code</p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  {connecting ? "Connecting..." : "Connect"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-owly-border bg-owly-bg/50">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave(
              "whatsapp",
              { mode, apiKey, phoneNumberId, verifyToken, phoneNumber },
              isActive
            )
          }
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-owly-primary rounded-lg hover:bg-owly-primary-dark disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}

function TelegramCard({
  channel,
  onSave,
  onAction,
  saving,
}: {
  channel: ChannelData;
  onSave: (type: string, config: Record<string, unknown>, isActive: boolean) => void;
  onAction: (type: string, action: string, payload?: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const cfg = (channel.config || {}) as Record<string, string>;
  const [token, setToken] = useState("");
  const [isActive, setIsActive] = useState(channel.isActive);
  const [copied, setCopied] = useState(false);
  const defaultWebhook = typeof window !== "undefined"
    ? `${window.location.origin}/api/channels/telegram`
    : "https://taalim.org/api/channels/telegram";
  const [webhookUrl, setWebhookUrl] = useState(cfg.webhookUrl || defaultWebhook);
  const tokenReady = Boolean(token.trim() || channel.tokenConfigured);

  return (
    <div className="bg-owly-surface rounded-xl border border-owly-border overflow-hidden shadow-sm flex flex-col justify-between">
      <div>
        <div className="px-5 py-4 border-b border-owly-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-50 text-sky-600">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-owly-text">Telegram Bot</h3>
              <p className="text-xs text-owly-text-light mt-0.5">
                قناة المحادثة والمجيب الآلي على تيليغرام
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={channel.status} />
            <Toggle enabled={isActive} onChange={setIsActive} />
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* RTL Info Box */}
          <div dir="rtl" className="p-3.5 bg-sky-50/70 border border-sky-200/80 rounded-xl text-xs text-sky-950 space-y-2">
            <div className="flex items-center justify-between font-bold text-sky-900">
              <span>🤖 البوت الرسمي على تيليغرام :</span>
              <a
                href="https://t.me/askfne_bot"
                target="_blank"
                rel="noreferrer"
                className="bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
              >
                فتح البوت @askfne_bot ↗
              </a>
            </div>
            <p className="text-sky-800 text-[11px] leading-relaxed">
              المجيب الآلي متصل مباشرة بحساب البوت الرسمي <strong>@askfne_bot</strong>. يمكن للمستخدمين التواصل معه مباشرة لتوليد الطلبات وحساب النقط والاستشارات.
            </p>
          </div>

          <FieldInput
            label="Bot API Token (من BotFather)"
            value={token}
            onChange={setToken}
            placeholder={channel.tokenConfigured ? "••••••••  (jeton déjà enregistré — laissez vide pour le conserver)" : "123456789:ABCdefGhIJKlmNoPQRstuVWXyz..."}
            isSecret
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-owly-text-light">
              Webhook URL (رابط استقبال الرسائل) :
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://votre-domaine.tld/api/channels/telegram"
                className="flex-1 px-3 py-2 text-xs font-mono bg-owly-bg border border-owly-border rounded-lg text-owly-text"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium shrink-0"
              >
                {copied ? "✓ Copié" : "Copier"}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={saving || !tokenReady}
              onClick={() => onAction("telegram", "setup", { webhookUrl })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-sky-700 bg-sky-100 hover:bg-sky-200 border border-sky-300 rounded-lg disabled:opacity-50 transition-colors"
            >
              🔄 تسجيل وتفعيل Webhook تيليغرام
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-owly-border bg-owly-bg/50 flex justify-between items-center">
        <span className="text-[11px] text-owly-text-light font-medium">Telegram Bot API v7+</span>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave("telegram", { token: token.trim(), webhookUrl }, isActive)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-owly-primary hover:bg-owly-primary-dark rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function EmailCard({
  channel,
  onSave,
  onAction,
  saving,
}: {
  channel: ChannelData;
  onSave: (type: string, config: Record<string, unknown>, isActive: boolean) => void;
  onAction: (type: string, action: string) => void;
  saving: boolean;
}) {
  const cfg = channel.config as Record<string, string>;
  const [isActive, setIsActive] = useState(channel.isActive);

  const [smtpHost, setSmtpHost] = useState(cfg.smtpHost || "");
  const [smtpPort, setSmtpPort] = useState(cfg.smtpPort || "587");
  const [smtpUser, setSmtpUser] = useState(cfg.smtpUser || "");
  const [smtpPass, setSmtpPass] = useState(cfg.smtpPass || "");
  const [smtpFrom, setSmtpFrom] = useState(cfg.smtpFrom || "");

  const [imapHost, setImapHost] = useState(cfg.imapHost || "");
  const [imapPort, setImapPort] = useState(cfg.imapPort || "993");
  const [imapUser, setImapUser] = useState(cfg.imapUser || "");
  const [imapPass, setImapPass] = useState(cfg.imapPass || "");

  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTest = async () => {
    setTestResult(null);
    onAction("email", "test");
    setTestResult("Test initiated - check server logs for results");
    setTimeout(() => setTestResult(null), 4000);
  };

  return (
    <div className="bg-owly-surface rounded-xl border border-owly-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-owly-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-owly-text">Email</h3>
              <p className="text-xs text-owly-text-light mt-0.5">
                Send and receive via SMTP / IMAP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={channel.status} />
            <Toggle enabled={isActive} onChange={setIsActive} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {/* SMTP */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-owly-text-light mb-3">
            SMTP Settings (Outgoing)
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput
              label="Host"
              value={smtpHost}
              onChange={setSmtpHost}
              placeholder="smtp.example.com"
            />
            <FieldInput
              label="Port"
              value={smtpPort}
              onChange={setSmtpPort}
              placeholder="587"
              type="text"
            />
            <FieldInput
              label="Username"
              value={smtpUser}
              onChange={setSmtpUser}
              placeholder="user@example.com"
            />
            <FieldInput
              label="Password"
              value={smtpPass}
              onChange={setSmtpPass}
              placeholder="Password"
              isSecret
            />
          </div>
          <div className="mt-3">
            <FieldInput
              label="From Address"
              value={smtpFrom}
              onChange={setSmtpFrom}
              placeholder="noreply@example.com"
            />
          </div>
        </div>

        {/* IMAP */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-owly-text-light mb-3">
            IMAP Settings (Incoming)
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput
              label="Host"
              value={imapHost}
              onChange={setImapHost}
              placeholder="imap.example.com"
            />
            <FieldInput
              label="Port"
              value={imapPort}
              onChange={setImapPort}
              placeholder="993"
              type="text"
            />
            <FieldInput
              label="Username"
              value={imapUser}
              onChange={setImapUser}
              placeholder="user@example.com"
            />
            <FieldInput
              label="Password"
              value={imapPass}
              onChange={setImapPass}
              placeholder="Password"
              isSecret
            />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-700">{testResult}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-owly-border bg-owly-bg/50 flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave(
              "email",
              {
                smtpHost,
                smtpPort,
                smtpUser,
                smtpPass,
                smtpFrom,
                imapHost,
                imapPort,
                imapUser,
                imapPass,
              },
              isActive
            )
          }
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-owly-primary rounded-lg hover:bg-owly-primary-dark disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={handleTest}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <TestTube className="h-4 w-4" />
          Test Connection
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone Card
// ---------------------------------------------------------------------------

function PhoneCard({
  channel,
  onSave,
  onAction,
  saving,
}: {
  channel: ChannelData;
  onSave: (type: string, config: Record<string, unknown>, isActive: boolean) => void;
  onAction: (type: string, action: string) => void;
  saving: boolean;
}) {
  const cfg = channel.config as Record<string, string>;
  const [isActive, setIsActive] = useState(channel.isActive);

  const [twilioSid, setTwilioSid] = useState(cfg.twilioSid || "");
  const [twilioToken, setTwilioToken] = useState(cfg.twilioToken || "");
  const [twilioPhone, setTwilioPhone] = useState(cfg.twilioPhone || "");

  const [elevenLabsKey, setElevenLabsKey] = useState(cfg.elevenLabsKey || "");
  const [elevenLabsVoice, setElevenLabsVoice] = useState(
    cfg.elevenLabsVoice || ""
  );

  const voiceOptions = [
    { id: "", label: "Select a voice..." },
    { id: "rachel", label: "Rachel - Calm, professional" },
    { id: "drew", label: "Drew - Friendly, warm" },
    { id: "clyde", label: "Clyde - Authoritative" },
    { id: "domi", label: "Domi - Energetic, upbeat" },
    { id: "bella", label: "Bella - Soft, gentle" },
  ];

  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestCall = () => {
    setTestResult(null);
    onAction("phone", "test");
    setTestResult("Test call initiated - check Twilio dashboard for status");
    setTimeout(() => setTestResult(null), 4000);
  };

  return (
    <div className="bg-owly-surface rounded-xl border border-owly-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-owly-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-owly-text">Phone</h3>
              <p className="text-xs text-owly-text-light mt-0.5">
                Voice calls via Twilio and ElevenLabs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={channel.status} />
            <Toggle enabled={isActive} onChange={setIsActive} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {/* Twilio */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-owly-text-light mb-3">
            Twilio Settings
          </h4>
          <div className="space-y-3">
            <FieldInput
              label="Account SID"
              value={twilioSid}
              onChange={setTwilioSid}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <FieldInput
              label="Auth Token"
              value={twilioToken}
              onChange={setTwilioToken}
              placeholder="Your Twilio auth token"
              isSecret
            />
            <FieldInput
              label="Phone Number"
              value={twilioPhone}
              onChange={setTwilioPhone}
              placeholder="+1234567890"
            />
          </div>
        </div>

        {/* ElevenLabs */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-owly-text-light mb-3">
            ElevenLabs Voice
          </h4>
          <div className="space-y-3">
            <FieldInput
              label="API Key"
              value={elevenLabsKey}
              onChange={setElevenLabsKey}
              placeholder="Your ElevenLabs API key"
              isSecret
            />
            <div>
              <label className="block text-xs font-medium text-owly-text-light mb-1">
                Voice
              </label>
              <select
                value={elevenLabsVoice}
                onChange={(e) => setElevenLabsVoice(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg bg-owly-bg text-owly-text focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary transition-colors"
              >
                {voiceOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-purple-600" />
            <span className="text-sm text-purple-700">{testResult}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-owly-border bg-owly-bg/50 flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave(
              "phone",
              {
                twilioSid,
                twilioToken,
                twilioPhone,
                elevenLabsKey,
                elevenLabsVoice,
              },
              isActive
            )
          }
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-owly-primary rounded-lg hover:bg-owly-primary-dark disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={handleTestCall}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <PhoneCall className="h-4 w-4" />
          Test Call
        </button>
      </div>
    </div>
  );
}

function WebCard({
  channel,
  onSave,
  saving,
}: {
  channel: ChannelData;
  onSave: (type: string, config: Record<string, unknown>, isActive: boolean) => void;
  saving: boolean;
}) {
  const [isActive, setIsActive] = useState(channel.isActive);
  const [copied, setCopied] = useState(false);
  const webChatUrl = typeof window !== "undefined"
    ? `${window.location.origin}/web-chat`
    : "/web-chat";

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webChatUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-owly-surface rounded-xl border border-owly-border overflow-hidden">
      <div className="px-5 py-4 border-b border-owly-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-50 text-sky-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-owly-text">Web chat</h3>
              <p className="text-xs text-owly-text-light mt-0.5">A public chat page for your website</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={isActive ? "connected" : "disconnected"} />
            <Toggle enabled={isActive} onChange={setIsActive} />
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-owly-text-light mb-1">Public chat URL</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={webChatUrl}
              className="min-w-0 flex-1 px-3 py-2 text-sm border border-owly-border rounded-lg bg-owly-bg text-owly-text"
            />
            <button
              type="button"
              title="Copy public chat URL"
              onClick={copyUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-owly-primary border border-owly-border rounded-lg hover:bg-owly-bg"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave("web", { publicPath: "/web-chat" }, isActive)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-owly-primary rounded-lg hover:bg-owly-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save web channel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    []
  );

  const fetchChannels = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch("/api/channels");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setChannels(Array.isArray(data) ? data : data.data || []);
    } catch {
      setFetchError("Failed to load channels. Please try refreshing the page.");
      showToast("Failed to load channels", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleSave = async (
    type: string,
    config: Record<string, unknown>,
    isActive: boolean
  ) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, isActive }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setChannels((prev) =>
        prev.map((ch) => (ch.type === type ? updated : ch))
      );
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} settings saved`);
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (type: string, action: string, payload: Record<string, unknown> = {}) => {
    try {
      const res = await fetch(`/api/channels/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Action failed");
      }
      const data = await res.json();
      if (data.type) {
        setChannels((prev) =>
          prev.map((ch) => (ch.type === type ? { ...ch, ...data } : ch))
        );
      }
      showToast(data.message || "Action completed");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Action failed",
        "error"
      );
    }
  };

  const getChannel = (type: string): ChannelData =>
    channels.find((ch) => ch.type === type) || {
      id: null,
      type,
      isActive: false,
      config: {},
      status: "disconnected",
    };

  return (
    <>
      <Header
        title="Channels"
        description="Connect and manage your communication channels"
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-owly-primary" />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-medium text-owly-text">Could not load channels</p>
            <p className="text-sm text-owly-text-light mt-1">{fetchError}</p>
            <button
              onClick={() => { setLoading(true); fetchChannels(); }}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-owly-primary rounded-lg hover:bg-owly-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-6 max-w-7xl">
            {/* Primary Channels: WhatsApp & Telegram */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <WhatsAppCard
                channel={getChannel("whatsapp")}
                onSave={handleSave}
                onAction={handleAction}
                saving={saving}
              />
              <TelegramCard
                channel={getChannel("telegram")}
                onSave={handleSave}
                onAction={handleAction}
                saving={saving}
              />
            </div>

            {/* Secondary Channels: Email & Phone */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <EmailCard
                channel={getChannel("email")}
                onSave={handleSave}
                onAction={handleAction}
                saving={saving}
              />
              <PhoneCard
                channel={getChannel("phone")}
                onSave={handleSave}
                onAction={handleAction}
                saving={saving}
              />
            </div>
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-in slide-in-from-bottom-4 duration-300",
            toast.type === "success"
              ? "bg-owly-success text-white"
              : "bg-owly-danger text-white"
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}
    </>
  );
}
