"use client";

import { Header } from "@/components/layout/header";
import {
  Megaphone,
  Send,
  Plus,
  MessageCircle,
  Bot,
  Globe,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Play,
  Users,
  Eye,
  Sparkles,
  X,
  Radio,
  FileText,
  Link2,
  Check,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { formatRelativeTime } from "@/lib/utils";

interface CampaignItem {
  id: string;
  name: string;
  description: string;
  channel: string;
  message: string;
  status: string;
  sentCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AudienceStats {
  audience: {
    whatsapp: number;
    telegram: number;
    total: number;
  };
  stats: {
    totalCampaigns: number;
    totalSent: number;
  };
}

export default function CampaignsPage() {
  const [activeTab, setActiveTab] = useState<"bayan" | "all">("bayan");
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [audience, setAudience] = useState<AudienceStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Bayan Broadcast Studio state
  const [bayanTitle, setBayanTitle] = useState("");
  const [bayanMessage, setBayanMessage] = useState("");
  const [bayanLink, setBayanLink] = useState("");
  const [bayanSendType, setBayanSendType] = useState<"both" | "message_only" | "link_only">("both");
  const [bayanTarget, setBayanTarget] = useState<"bayan_subscribers" | "all">("bayan_subscribers");
  const [bayanSending, setBayanSending] = useState(false);
  const [bayanResult, setBayanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [bayanStats, setBayanStats] = useState<{ subscribersCount: number; declinedCount: number; totalWaCount: number } | null>(null);

  // New Campaign Modal
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resCamps, resAud, resBayan] = await Promise.all([
        fetch("/api/campaigns?limit=50"),
        fetch("/api/campaigns?audience=true"),
        fetch("/api/campaigns/bayan"),
      ]);
      if (resCamps.ok) {
        const json = await resCamps.json();
        setCampaigns(Array.isArray(json) ? json : json.data || []);
      }
      if (resAud.ok) {
        const audJson = await resAud.json();
        setAudience(audJson);
      }
      if (resBayan.ok) {
        const bJson = await resBayan.json();
        setBayanStats({
          subscribersCount: bJson.subscribersCount ?? 0,
          declinedCount: bJson.declinedCount ?? 0,
          totalWaCount: bJson.totalWaCount ?? 0,
        });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSendBayan = async () => {
    if (!bayanTitle.trim()) {
      alert("الرجاء كتابة عنوان للبيان أو المستجد");
      return;
    }
    const hasMsg = bayanSendType !== "link_only" && bayanMessage.trim().length > 0;
    const hasLnk = bayanSendType !== "message_only" && bayanLink.trim().length > 0;
    if (!hasMsg && !hasLnk) {
      alert("الرجاء كتابة نص البيان أو إدراج الرابط");
      return;
    }

    const countTarget =
      bayanTarget === "bayan_subscribers"
        ? (bayanStats?.subscribersCount ?? 0)
        : (bayanStats?.totalWaCount ?? 0);

    if (!confirm(`هل أنت متأكد من إرسال هذا البيان إلى ${bayanTarget === "bayan_subscribers" ? `المشتركين فقط (${countTarget} مشترك)` : `كافة جهات الاتصال (${countTarget} هاتف)`}؟`)) {
      return;
    }

    setBayanSending(true);
    setBayanResult(null);
    try {
      const res = await fetch("/api/campaigns/bayan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bayanTitle.trim(),
          message: bayanSendType !== "link_only" ? bayanMessage.trim() : "",
          link: bayanSendType !== "message_only" ? bayanLink.trim() : "",
          targetGroup: bayanTarget,
          channel: "whatsapp",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إرسال البيان");

      setBayanResult({
        success: true,
        message: `تم إرسال البيان بنجاح إلى ${data.sentCount} جهة اتصال${data.failedCount > 0 ? ` (تعذر تسليم ${data.failedCount})` : ""}! 🕊️`,
      });
      setBayanTitle("");
      setBayanMessage("");
      setBayanLink("");
      void fetchData();
    } catch (err: unknown) {
      setBayanResult({
        success: false,
        message: err instanceof Error ? err.message : "حدث خطأ أثناء الإرسال",
      });
    } finally {
      setBayanSending(false);
    }
  };

  const handleCreateAndSend = async (immediate: boolean) => {
    if (!name.trim() || !message.trim()) return;
    setSaving(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          channel,
          message: message.trim(),
          status: immediate ? "running" : "draft",
        }),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      const created = await res.json();

      if (immediate && created.id) {
        setExecutingId(created.id);
        const execRes = await fetch(`/api/campaigns/${created.id}/execute`, { method: "POST" });
        const execJson = await execRes.json();
        if (execRes.ok) {
          setSendResult({
            success: true,
            message: `تم إرسال الحملة بنجاح إلى ${execJson.sentCount || 0} جهة اتصال! 🚀`,
          });
        } else {
          setSendResult({
            success: false,
            message: execJson.error || "حدث خطأ أثناء الإرسال",
          });
        }
      }

      setShowModal(false);
      setName("");
      setMessage("");
      await fetchData();
    } catch (e) {
      setSendResult({
        success: false,
        message: String(e),
      });
    } finally {
      setSaving(false);
      setExecutingId(null);
    }
  };

  const handleExecuteExisting = async (id: string, campName: string) => {
    if (!confirm(`هل أنت متأكد من إطلاق الحملة: "${campName}" وإرسالها الآن؟`)) return;
    setExecutingId(id);
    try {
      const res = await fetch(`/api/campaigns/${id}/execute`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        alert(`✅ تم إرسال الحملة بنجاح إلى ${json.sentCount || 0} مستلم!`);
      } else {
        alert(`❌ خطأ: ${json.error || "تعذر الإرسال"}`);
      }
      await fetchData();
    } catch (err) {
      alert("❌ خطأ أثناء الإرسال: " + String(err));
    } finally {
      setExecutingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الحملة من الأرشيف؟")) return;
    try {
      await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silent
    }
  };

  const templates = [
    {
      name: "📌 دعوة لتجديد الانخراط",
      text: "تحية نضالية رفيقي/تي ✊\nنذكركم بفتح باب تجديد الانخراط السنوي في الجامعة الوطنية للتعليم FNE لسنة 2026.\nللانخراط إلكترونياً وتأكيد العضوية:\nhttps://hub.taalim.org/adherer\nمعاً نواصل النضال والدفاع عن المدرسة العمومية وحقوق نساء ورجال التعليم.",
    },
    {
      name: "📢 إعلان بيان نضالي",
      text: "عاشت الجامعة الوطنية للتعليم FNE نقابة مناضلة، ديمقراطية ومستقلة 🕊️\n\nتعلن الجامعة الوطنية للتعليم عن إصدار بيانها الرسمي حول مستجدات الحوار القطاعي.\nللاطلاع على نص البيان الكامل والمذكرة:\nhttps://taalim.org\nوحدة، نضال، صمود من أجل تحقيق المطالب العادلة.",
    },
    {
      name: "📅 تذكير بجمع عام أو محطة تنظيمية",
      text: "دعوة لحضور الجمع العام التنظيمي للجامعة الوطنية للتعليم FNE 🏢\nالمكان: مقر الجامعة\nالتاريخ: هذا الأسبوع\nحضوركم قوة للنقابة ودعم للعمل النضالي المستقل.",
    },
  ];

  const targetCount =
    channel === "whatsapp"
      ? audience?.audience.whatsapp ?? 0
      : channel === "telegram"
      ? audience?.audience.telegram ?? 0
      : audience?.audience.total ?? 0;

  return (
    <div className="min-h-screen bg-[#f8f9fa]" dir="rtl">
      <Header title="حملات البث والبيانات 📢" />

      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* ── Result Notification ─────────────────────────── */}
        {sendResult && (
          <div
            className={`flex items-center gap-3 p-4 rounded-xl border ${
              sendResult.success
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {sendResult.success ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            )}
            <span className="text-sm font-semibold">{sendResult.message}</span>
            <button
              onClick={() => setSendResult(null)}
              className="ml-auto text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Audience & Stats Cards ──────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">المشتركون (Opt-in)</span>
              <Radio className="h-4 w-4 text-green-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-green-700">{bayanStats?.subscribersCount ?? 0}</p>
            <p className="text-xs text-green-600 mt-0.5 font-medium">وافقوا على الاستقبال</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">الرافضون (Opt-out)</span>
              <X className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-amber-700">{bayanStats?.declinedCount ?? 0}</p>
            <p className="text-xs text-amber-600 mt-0.5 font-medium">اختاروا عدم التوصل</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">إجمالي واتساب</span>
              <MessageCircle className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-gray-800">{bayanStats?.totalWaCount ?? audience?.audience.whatsapp ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">محادثات مسجلة</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">مشتركو تيليغرام</span>
              <Bot className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-gray-800">{audience?.audience.telegram ?? "—"}</p>
            <p className="text-xs text-blue-600 mt-0.5 font-medium">محادثات متصلة</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">رسائل بُثّت</span>
              <Send className="h-4 w-4 text-purple-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-purple-700">{audience?.stats.totalSent ?? "0"}</p>
            <p className="text-xs text-purple-500 mt-0.5 font-medium">إشعار تم تسليمه</p>
          </div>
        </div>

        {/* ── Navigation Tabs ─────────────────────────────── */}
        <div className="flex border-b border-gray-200 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("bayan")}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-bold border-b-2 transition-all ${
              activeTab === "bayan"
                ? "border-[#b51f2b] text-[#b51f2b] bg-red-50/50 rounded-t-xl"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Radio className="h-4 w-4 text-[#b51f2b]" />
            <span>بث بيان أو مستجد (Diffusion Bayan)</span>
            <span className="rounded-full bg-red-100 text-[#b51f2b] text-[11px] font-extrabold px-2 py-0.5">
              مخصص
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-bold border-b-2 transition-all ${
              activeTab === "all"
                ? "border-[#b51f2b] text-[#b51f2b] bg-red-50/50 rounded-t-xl"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Megaphone className="h-4 w-4" />
            <span>جميع حملات البث السابقة ({campaigns.length})</span>
          </button>
        </div>

        {/* ── TAB 1: DIFFUSION BAYAN ──────────────────────── */}
        {activeTab === "bayan" && (
          <div className="space-y-6">
            {/* Header info banner */}
            <div className="rounded-2xl border border-red-100 bg-gradient-to-r from-red-50 to-orange-50 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#b51f2b] text-white flex items-center justify-center shadow">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">
                    استوديو إرسال البيانات والمستجدات (Diffusion Bayan)
                  </h3>
                  <p className="text-xs text-gray-600 mt-0.5">
                    إرسال البيانات والبلاغات والمذكرات الصادرة إلى المنخرطين المشتركين بنقرة واحدة عبر واتساب.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-green-200 text-green-700 text-xs font-bold shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                  {bayanStats?.subscribersCount ?? 0} مشترك مسجل (Opt-in)
                </span>
              </div>
            </div>

            {/* Notification if sent */}
            {bayanResult && (
              <div
                className={`flex items-center gap-3 p-4 rounded-xl border ${
                  bayanResult.success
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {bayanResult.success ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                )}
                <span className="text-sm font-semibold">{bayanResult.message}</span>
                <button
                  onClick={() => setBayanResult(null)}
                  className="ml-auto text-xs opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Two-column layout: Form on the right (RTL), Live Preview on the left */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form (7 cols) */}
              <div className="lg:col-span-7 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    عنوان البيان أو المستجد *
                  </label>
                  <input
                    type="text"
                    value={bayanTitle}
                    onChange={(e) => setBayanTitle(e.target.value)}
                    placeholder="مثال: بيان الجامعة حول نتائج الحركة الانتقالية الوطنية 2026"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/30 font-semibold text-gray-900"
                  />
                </div>

                {/* Send Type Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-1.5">
                    محتوى الإرسال المراد بثه *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setBayanSendType("both")}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs transition-all ${
                        bayanSendType === "both"
                          ? "border-[#b51f2b] bg-red-50 text-[#b51f2b] ring-2 ring-red-400/30"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>نص ورابط معاً</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBayanSendType("message_only")}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs transition-all ${
                        bayanSendType === "message_only"
                          ? "border-[#b51f2b] bg-red-50 text-[#b51f2b] ring-2 ring-red-400/30"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      <span>نص البيان فقط</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBayanSendType("link_only")}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs transition-all ${
                        bayanSendType === "link_only"
                          ? "border-[#b51f2b] bg-red-50 text-[#b51f2b] ring-2 ring-red-400/30"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <Link2 className="h-4 w-4" />
                      <span>رابط فقط</span>
                    </button>
                  </div>
                </div>

                {/* Message Text (if both or message_only) */}
                {bayanSendType !== "link_only" && (
                  <div>
                    <label className="block text-xs font-bold text-gray-800 mb-1.5">
                      نص البيان أو ملخص البلاغ *
                    </label>
                    <textarea
                      rows={6}
                      value={bayanMessage}
                      onChange={(e) => setBayanMessage(e.target.value)}
                      placeholder="اكتب هنا نص البيان أو خلاصة المستجد النقابي المراد تبليغه للمنخرطين..."
                      className="w-full rounded-xl border border-gray-200 p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/30 leading-relaxed font-sans"
                    />
                    <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                      <span>💡 التنسيق المتاح: *غامق* ، _مائل_</span>
                      <span>{bayanMessage.length} حرف</span>
                    </div>
                  </div>
                )}

                {/* Link Input (if both or link_only) */}
                {bayanSendType !== "message_only" && (
                  <div>
                    <label className="block text-xs font-bold text-gray-800 mb-1.5">
                      رابط الوثيقة الرسمية أو المقال (PDF أو رابط موقع) *
                    </label>
                    <input
                      type="url"
                      value={bayanLink}
                      onChange={(e) => setBayanLink(e.target.value)}
                      placeholder="https://taalim.org/... أو رابط مذكرة الوزارة men.gov.ma"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/30 text-left font-mono"
                      dir="ltr"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      ⚡ سيتم اختصار الروابط الطويلة والمعقدة تلقائياً إلى رابط أنيق وسريع الاستجابة.
                    </p>
                  </div>
                )}

                {/* Audience Target */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 mb-2">
                    الجمهور المستهدف (Destinataires) *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        bayanTarget === "bayan_subscribers"
                          ? "border-green-500 bg-green-50/70 ring-2 ring-green-400/20"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="bayanTarget"
                        value="bayan_subscribers"
                        checked={bayanTarget === "bayan_subscribers"}
                        onChange={() => setBayanTarget("bayan_subscribers")}
                        className="mt-0.5 text-green-600 focus:ring-green-500"
                      />
                      <div>
                        <span className="block text-xs font-bold text-gray-800">
                          المشتركون في البيانات (Opt-in) 🎯
                        </span>
                        <span className="block text-[11px] text-gray-500 mt-0.5">
                          {bayanStats?.subscribersCount ?? 0} مشترك وافق على التوصل بالمستجدات (موصى به).
                        </span>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        bayanTarget === "all"
                          ? "border-purple-500 bg-purple-50/70 ring-2 ring-purple-400/20"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="bayanTarget"
                        value="all"
                        checked={bayanTarget === "all"}
                        onChange={() => setBayanTarget("all")}
                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <span className="block text-xs font-bold text-gray-800">
                          كافة جهات اتصال واتساب 🌐
                        </span>
                        <span className="block text-[11px] text-gray-500 mt-0.5">
                          {bayanStats?.totalWaCount ?? audience?.audience.whatsapp ?? 0} جهة اتصال مسجلة في النظام.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSendBayan()}
                    disabled={bayanSending || !bayanTitle.trim() || (bayanSendType !== "link_only" && !bayanMessage.trim() && !bayanLink.trim())}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#b51f2b] px-6 py-3 text-sm font-bold text-white shadow hover:bg-[#941a25] disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {bayanSending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>جاري إرسال البيان إلى الهواتف...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>إرسال البيان الآن 🚀</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Preview (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-4 w-4 text-green-600" />
                    معاينة حية كما ستصل على واتساب
                  </span>
                  <span className="text-[11px] text-gray-400">تحديث فوري</span>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-[#efeae2] p-4 shadow-sm min-h-[460px] flex flex-col justify-between">
                  {/* WhatsApp chat top bar */}
                  <div className="rounded-xl bg-[#075e54] text-white p-3 flex items-center gap-2.5 mb-4 shadow">
                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                      FNE
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-none">FNE Assistant Officiel 🕊️</p>
                      <p className="text-[10px] text-green-200 mt-0.5">متصل الآن</p>
                    </div>
                  </div>

                  {/* Message bubble */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm text-sm whitespace-pre-wrap leading-relaxed text-gray-800 space-y-3 self-start max-w-full">
                    <p className="font-bold text-base text-gray-900 border-b border-gray-100 pb-2">
                      📢 *{bayanTitle.trim() || "عنوان البيان أو المستجد"}*
                    </p>

                    {bayanSendType !== "link_only" && (
                      <p className="text-xs text-gray-700 leading-relaxed">
                        {bayanMessage.trim() || "(نص البيان سيظهر هنا بشكل منسق ومقروء...)"}
                      </p>
                    )}

                    {bayanSendType !== "message_only" && (
                      <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                        <p className="font-bold text-gray-800 mb-1">🔗 *رابط الاطلاع والتحميل:*</p>
                        <p className="text-blue-600 underline font-mono text-[11px] break-all" dir="ltr">
                          {bayanLink.trim()
                            ? bayanLink.trim()
                            : "https://askfne.taalim.org/r/26-067"}
                        </p>
                      </div>
                    )}

                    <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 italic">
                      🕊️ _الجامعة الوطنية للتعليم FNE — نقابة مناضلة، ديمقراطية ومستقلة_
                    </div>

                    <div className="flex justify-end items-center gap-1 text-[10px] text-gray-400 pt-1">
                      <span>الآن</span>
                      <Check className="h-3 w-3 text-blue-500 inline" />
                      <Check className="h-3 w-3 text-blue-500 -mr-2 inline" />
                    </div>
                  </div>

                  {/* Footer note */}
                  <p className="text-[11px] text-gray-500 text-center mt-4">
                    📱 يتم إرسال الرسالة من رقم الجامعة الرسمي المسجل عبر Baileys.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: ALL CAMPAIGNS ────────────────────────── */}
        {activeTab === "all" && (
          <div className="space-y-4">
            {/* Action bar */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-800">سجل الحملات السابقة</h2>
                <p className="text-xs text-gray-500">
                  إدارة وأرشيف حملات البث المنفذة عبر مختلف القنوات
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 rounded-xl bg-[#b51f2b] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#941a25] transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>حملة بث مخصصة 📢</span>
              </button>
            </div>

            {/* Table of Campaigns */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                  جاري التحميل...
                </div>
              ) : campaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Megaphone className="h-12 w-12 mb-3 opacity-30 text-[#b51f2b]" />
                  <p className="text-base font-bold text-gray-700">لا توجد حملات حالياً</p>
                  <p className="text-xs mt-1 text-gray-400">
                    استخدم تبويب "بث بيان أو مستجد" لبدء التواصل مع المنخرطين
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="mt-4 flex items-center gap-1.5 rounded-lg bg-[#b51f2b] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#941a25]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إنشاء حملة الآن
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 text-right">الحملة</th>
                      <th className="px-4 py-3 text-right">القناة</th>
                      <th className="px-4 py-3 text-right">الرسالة</th>
                      <th className="px-4 py-3 text-right">المستلمون</th>
                      <th className="px-4 py-3 text-right">الحالة</th>
                      <th className="px-4 py-3 text-right">التاريخ</th>
                      <th className="px-4 py-3 text-right">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaigns.map((camp) => (
                      <tr key={camp.id} className="transition-colors hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-800">
                          {camp.name}
                        </td>

                        <td className="px-4 py-3">
                          {camp.channel === "whatsapp" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <MessageCircle className="h-3 w-3" /> WhatsApp
                            </span>
                          ) : camp.channel === "telegram" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              <Bot className="h-3 w-3" /> Telegram
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                              <Globe className="h-3 w-3" /> الكل
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 max-w-xs truncate text-gray-500 font-mono text-xs">
                          {camp.message.replace(/\n/g, " ").substring(0, 50)}...
                        </td>

                        <td className="px-4 py-3 font-bold text-gray-700">
                          {camp.sentCount}
                        </td>

                        <td className="px-4 py-3">
                          {camp.status === "completed" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" /> مكتملة
                            </span>
                          ) : camp.status === "running" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              <RefreshCw className="h-3 w-3 animate-spin" /> قيد الإرسال
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                              <Clock className="h-3 w-3" /> مسودة
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-xs text-gray-400">
                          {formatRelativeTime(camp.createdAt)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {camp.status !== "completed" && (
                              <button
                                type="button"
                                onClick={() => void handleExecuteExisting(camp.id, camp.name)}
                                disabled={executingId === camp.id}
                                title="إطلاق الحملة الآن"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDelete(camp.id)}
                              title="حذف"
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Standard New Campaign Modal ────────────────────── */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#fbf9f8]">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-[#b51f2b]" />
                  <h3 className="font-bold text-gray-800 text-base">إنشاء حملة بث جديدة</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Templates Quick Insert */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    نماذج جاهزة (قوالب سريعة)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setName(tpl.name.replace(/^[^\s]+\s/, ""));
                          setMessage(tpl.text);
                        }}
                        className="text-xs bg-gray-50 border border-gray-200 hover:border-[#b51f2b] hover:bg-red-50 px-2.5 py-1.5 rounded-lg text-gray-700 font-medium transition-colors cursor-pointer"
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campaign Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    اسم الحملة *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: نداء الدخول المدرسي 2026"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/30"
                  />
                </div>

                {/* Channel Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    القناة المستهدفة *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setChannel("whatsapp")}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs transition-all ${
                        channel === "whatsapp"
                          ? "border-green-500 bg-green-50 text-green-700 ring-2 ring-green-400/30"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <MessageCircle className="h-4 w-4 text-green-600" />
                      <span>واتساب ({audience?.audience.whatsapp ?? 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChannel("telegram")}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs transition-all ${
                        channel === "telegram"
                          ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-400/30"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <Bot className="h-4 w-4 text-blue-600" />
                      <span>تيليغرام ({audience?.audience.telegram ?? 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChannel("all")}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs transition-all ${
                        channel === "all"
                          ? "border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-400/30"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <Globe className="h-4 w-4 text-purple-600" />
                      <span>الكل ({audience?.audience.total ?? 0})</span>
                    </button>
                  </div>
                </div>

                {/* Message Content */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700">
                      نص الرسالة *
                    </label>
                    <button
                      type="button"
                      onClick={() => setPreviewMode(!previewMode)}
                      className="flex items-center gap-1 text-xs text-[#b51f2b] font-medium hover:underline cursor-pointer"
                    >
                      <Eye className="h-3 w-3" />
                      <span>{previewMode ? "وضع التحرير" : "معاينة الرسالة"}</span>
                    </button>
                  </div>

                  {!previewMode ? (
                    <textarea
                      rows={7}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="اكتب هنا نص الرسالة التي ستصل لجميع الهواتف..."
                      className="w-full rounded-xl border border-gray-200 p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/30 leading-relaxed font-sans"
                    />
                  ) : (
                    <div className="rounded-xl border border-green-200 bg-[#efeae2] p-4 text-sm font-sans">
                      <div className="bg-white rounded-2xl p-3.5 shadow-sm max-w-md mx-auto whitespace-pre-wrap leading-relaxed text-gray-800">
                        {message || "(لا يوجد نص للمعاينة)"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Target info alert */}
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                  <Users className="h-4 w-4 shrink-0 text-blue-600" />
                  <span>
                    سيتم توجيه هذا البث إلى <strong>{targetCount}</strong> جهة اتصال مسجلة عبر {channel === "whatsapp" ? "واتساب" : channel === "telegram" ? "تيليغرام" : "كافة القنوات"}.
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-[#fbf9f8]">
                <button
                  type="button"
                  onClick={() => void handleCreateAndSend(false)}
                  disabled={saving || !name.trim() || !message.trim()}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                >
                  حفظ كمسودة فقط
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateAndSend(true)}
                    disabled={saving || !name.trim() || !message.trim()}
                    className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#b51f2b] rounded-xl hover:bg-[#941a25] disabled:opacity-40 shadow-sm cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>جاري الإرسال...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>إرسال فوري الآن</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
