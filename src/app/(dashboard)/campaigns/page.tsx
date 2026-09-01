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

const TEMPLATES = [
  {
    name: "دعوة للتصويت لـ FNE في اللجان الثنائية",
    channel: "whatsapp",
    text: `📢 *نداء عاجل لنساء ورجال التعليم* 🇲🇦

الزميلات والزملاء الأعزاء،
تدعوكم الجامعة الوطنية للتعليم FNE للمشاركة المكثفة في انتخابات اللجان الإدارية المتساوية الأعضاء والتصويت لمرشحي الصمود والكرامة.

🗳️ *صوتكم أمانة وقوتنا في وحدتنا!*
📌 للمزيد من التفاصيل والاطلاع على لوائح مرشحينا وبرنامجنا:
🌐 https://taalim.org

_الجامعة الوطنية للتعليم FNE - التزام، شفافية، دفاع مستمر عن حقوق الشغيلة التعليمية._`,
  },
  {
    name: "إعلان إخباري عاجل ومستجدات",
    channel: "whatsapp",
    text: `🔴 *مستجدات وإعلان عاجل من FNE*

تحية نضالية لكل الأطر التربوية والإدارية،
نحيطكم علماً بصدور مستجدات هامة تخص تدبير الملفات الإدارية والترقيات.

📌 يمكنكم مراجعة كافة التفاصيل عبر موقعنا الرسمي:
🌐 https://taalim.org

_لأي استفسار، يمكنكم التفاعل مباشرة مع هذا المجيب الآلي!_`,
  },
  {
    name: "تذكير بآجال الترقية والطلبات",
    channel: "whatsapp",
    text: `⏰ *تذكير هام بخصوص الآجال الإدارية*

تنهي الجامعة الوطنية للتعليم إلى علم كافة الزميلات والزملاء بضرورة مراعاة الآجال المحددة لإيداع الطلبات والطعون قبل انتهاء الفترة الرسمية.

📄 لتوليد نماذج الطلبات والطعون الجاهزة للطباعة:
🌐 https://hub.taalim.org/generate_request.php

_معاً من أجل صيانة الحقوق والمكتسبات._`,
  },
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [audience, setAudience] = useState<AudienceStats | null>(null);
  const [loading, setLoading] = useState(true);

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
      const [resCamps, resAud] = await Promise.all([
        fetch("/api/campaigns?limit=50"),
        fetch("/api/campaigns?audience=true"),
      ]);
      if (resCamps.ok) {
        const json = await resCamps.json();
        setCampaigns(Array.isArray(json) ? json : json.data || []);
      }
      if (resAud.ok) {
        const audJson = await resAud.json();
        setAudience(audJson);
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

  const handleCreateAndSend = async (immediate: boolean) => {
    if (!name.trim() || !message.trim()) return;
    setSaving(true);
    setSendResult(null);
    try {
      // 1. Create campaign
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
    if (!confirm(`هل أنت متأكد من إطلاق الحملة: "${campName}" وإرسالها لجميع المشتركين الآن؟`)) return;
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
    if (!confirm("هل تريد حذف هذه الحملة؟")) return;
    try {
      await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      await fetchData();
    } catch {
      // silent
    }
  };

  const targetCount =
    channel === "whatsapp"
      ? audience?.audience.whatsapp ?? 0
      : channel === "telegram"
      ? audience?.audience.telegram ?? 0
      : audience?.audience.total ?? 0;

  return (
    <div className="flex flex-col h-full">
      <Header title="حملات البث والإشعارات / Campagnes de Diffusion" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Notification banner if result ────────────────── */}
        {sendResult && (
          <div
            className={`flex items-center gap-3 p-4 rounded-xl border ${
              sendResult.success
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {sendResult.success ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> : <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />}
            <span className="text-sm font-semibold">{sendResult.message}</span>
            <button onClick={() => setSendResult(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* ── Audience & Stats Cards ──────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">مشتركو واتساب</span>
              <MessageCircle className="h-4 w-4 text-green-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-gray-800">{audience?.audience.whatsapp ?? "—"}</p>
            <p className="text-xs text-green-600 mt-0.5 font-medium">جهات اتصال نشطة</p>
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
              <span className="text-xs font-semibold uppercase tracking-wide">إجمالي الحملات</span>
              <Megaphone className="h-4 w-4 text-red-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-gray-800">{audience?.stats.totalCampaigns ?? campaigns.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">حملات سابقة</p>
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

        {/* ── Action bar ──────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">قائمة الحملات والإشعارات</h2>
            <p className="text-xs text-gray-500">إرسال بيانات، دعوات للتصويت، أو مستجدات مباشرة لهواتف المنخرطين</p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-xl bg-[#b51f2b] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#941a25] transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>حملة بث جديدة 📢</span>
          </button>
        </div>

        {/* ── Table of Campaigns ───────────────────────────── */}
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
              <p className="text-xs mt-1 text-gray-400">أنشئ أول حملة بث للتواصل مع المنخرطين عبر واتساب وتيليغرام</p>
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
                  <th className="px-4 py-3 text-left">الحملة</th>
                  <th className="px-4 py-3 text-left">القناة</th>
                  <th className="px-4 py-3 text-left">الرسالة</th>
                  <th className="px-4 py-3 text-left">المستلمون</th>
                  <th className="px-4 py-3 text-left">الحالة</th>
                  <th className="px-4 py-3 text-left">التاريخ</th>
                  <th className="px-4 py-3 text-left">الإجراءات</th>
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

                    <td className="px-4 py-3 max-w-xs">
                      <p dir="rtl" className="truncate text-gray-600 text-xs text-right" title={camp.message}>
                        {camp.message}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-gray-700 font-bold">
                      {camp.sentCount}
                    </td>

                    <td className="px-4 py-3">
                      {camp.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                          <CheckCircle2 className="h-3 w-3" /> تم الإرسال
                        </span>
                      ) : camp.status === "running" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 animate-pulse">
                          <RefreshCw className="h-3 w-3 animate-spin" /> جاري البث...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          <Clock className="h-3 w-3" /> مسودة
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {formatRelativeTime(camp.createdAt)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleExecuteExisting(camp.id, camp.name)}
                          disabled={executingId === camp.id}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
                          title="إرسال الحملة الآن"
                        >
                          <Play className="h-3 w-3 text-green-600" />
                          <span>{executingId === camp.id ? "جاري الإرسال..." : "إرسال 🚀"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDelete(camp.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* ── New Campaign Modal ─────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#fbf9f8]">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-[#b51f2b]" />
                <h3 className="font-bold text-gray-800 text-base">إنشاء حملة بث جديدة (Broadcast)</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* Ready-made templates */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#b51f2b]" />
                  <span>نماذج جاهزة للاستخدام السريع :</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setName(tpl.name);
                        setChannel(tpl.channel);
                        setMessage(tpl.text);
                      }}
                      className="rounded-lg border border-red-200 bg-red-50/50 px-2.5 py-1 text-xs font-medium text-[#b51f2b] hover:bg-red-100 transition-colors"
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campaign Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  اسم الحملة (للأرشيف الداخلي) *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: نداء التصويت للجامعة الوطنية للتعليم في انتخابات 2026"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/30"
                />
              </div>

              {/* Channel Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  قناة البث المستهدفة *
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

              {/* Message Content & Preview Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">
                    نص الرسالة المراد بثها *
                  </label>
                  <button
                    type="button"
                    onClick={() => setPreviewMode(!previewMode)}
                    className="flex items-center gap-1 text-xs text-[#b51f2b] font-medium hover:underline"
                  >
                    <Eye className="h-3 w-3" />
                    <span>{previewMode ? "وضع التحرير" : "معاينة الرسالة"}</span>
                  </button>
                </div>

                {!previewMode ? (
                  <div>
                    <textarea
                      rows={8}
                      dir="rtl"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="اكتب هنا نص الرسالة التي ستصل لجميع الهواتف... يمكنك استخدام *خط عريض* و _مائل_ وإيموجي ورابط المواقع."
                      className="w-full rounded-xl border border-gray-200 p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#b51f2b]/30 leading-relaxed font-sans"
                    />
                    <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                      <span>💡 نصيحة: استخدم *بين نجمتين* لتغميق النص المهم.</span>
                      <span>{message.length} حرف</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-green-200 bg-[#efeae2] p-4 text-sm font-sans">
                    <p className="text-[11px] text-gray-500 font-semibold mb-2 text-center">
                      📱 معاينة كما ستظهر في هاتف المنخرط على واتساب :
                    </p>
                    <div
                      dir="rtl"
                      className="bg-white rounded-2xl p-3.5 shadow-sm max-w-md mx-auto whitespace-pre-wrap leading-relaxed text-gray-800 text-justify"
                    >
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
                className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
              >
                حفظ كمسودة 💾
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  onClick={() => void handleCreateAndSend(true)}
                  disabled={saving || !name.trim() || !message.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#b51f2b] rounded-xl hover:bg-[#941a25] shadow-sm disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{saving ? "جاري الإرسال..." : "إرسال وبث فوري للجميع 🚀"}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
