"use client";

import { Header } from "@/components/layout/header";
import {
  MessageSquare,
  Send,
  Radio,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Search,
  Check,
  X,
  Bot,
  AlertCircle,
  RefreshCw,
  Eye,
  ShieldCheck,
  StopCircle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { formatRelativeTime } from "@/lib/utils";

interface ForumTopic {
  id: string;
  title: string;
  promptQuestion: string;
  status: string;
  channels: string[];
  targetAudience: string;
  targetCustomerIds: string[];
  moderationMode: boolean;
  subscribersCount: number;
  postsCount: number;
  createdAt: string;
  closedAt?: string | null;
  posts?: ForumPostItem[];
  _count?: { posts: number };
}

interface ForumPostItem {
  id: string;
  topicId: string;
  authorName: string;
  authorContact: string;
  channel: string;
  content: string;
  status: "pending" | "approved" | "broadcasted" | "rejected";
  broadcastCount: number;
  createdAt: string;
}

interface CandidateContact {
  id: string;
  name: string;
  phone: string;
  telegramHandle?: string;
  channels: string[];
  hasWa?: boolean;
  hasTg?: boolean;
  isForumSub: boolean;
  isBayanSub: boolean;
  isBayanDeclined: boolean;
  lastContact: string | null;
}

export default function ForumPage() {
  const [activeTab, setActiveTab] = useState<"live" | "new" | "archive">("live");
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [activeTopic, setActiveTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPostItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateContact[]>([]);
  const [subscribersCount, setSubscribersCount] = useState<number>(0);
  const [channelCounts, setChannelCounts] = useState<{
    whatsapp: number;
    telegram: number;
    combined: number;
    filtered: number;
    forumSubscribers: number;
  }>({
    whatsapp: 0,
    telegram: 0,
    combined: 0,
    filtered: 0,
    forumSubscribers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Debate Form State
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newChannels, setNewChannels] = useState<string[]>(["whatsapp", "telegram"]);
  const [audienceType, setAudienceType] = useState<"manual" | "subscribers" | "all">("manual");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [moderationMode, setModerationMode] = useState(true);
  const [contactSearch, setContactSearch] = useState("");
  const [creating, setCreating] = useState(false);

  // Add new participants state
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [newParticipantSearch, setNewParticipantSearch] = useState("");
  const [selectedNewContactIds, setSelectedNewContactIds] = useState<string[]>([]);
  const [addingParticipants, setAddingParticipants] = useState(false);
  const [addParticipantChannels, setAddParticipantChannels] = useState<string[]>(["whatsapp", "telegram"]);

  const fetchForumData = useCallback(async () => {
    setLoading(true);
    try {
      const [topicsRes, subsRes] = await Promise.all([
        fetch("/api/forum/topics"),
        fetch("/api/forum/subscribers"),
      ]);

      let currentActive: ForumTopic | null = null;

      if (topicsRes.ok) {
        const tData = await topicsRes.json();
        const tList: ForumTopic[] = tData.topics || [];
        setTopics(tList);
        currentActive = tList.find((t) => t.status === "active") || null;
        setActiveTopic(currentActive);
      }

      if (subsRes.ok) {
        const sData = await subsRes.json();
        setCandidates(sData.candidates || []);
        setSubscribersCount(sData.forumSubscribersCount || 0);
        if (sData.counts) {
          setChannelCounts(sData.counts);
        }
      }

      if (currentActive) {
        const postsRes = await fetch(`/api/forum/posts?topicId=${currentActive.id}`);
        if (postsRes.ok) {
          const pData = await postsRes.json();
          setPosts(pData.posts || []);
        }
      } else {
        setPosts([]);
      }
    } catch (err) {
      console.error("Error fetching forum data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchForumData();
  }, [fetchForumData]);

  // Handle Post Moderation Actions (Broadcast or Reject)
  const handleModeratePost = async (postId: string, action: "broadcast" | "reject") => {
    try {
      setActionLoading(postId);
      const res = await fetch("/api/forum/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        if (action === "broadcast") {
          setToastMessage(`تم بث مشاركة الزميل/ة بنجاح إلى ${data.result?.sentCount ?? 0} مشترك!`);
        } else {
          setToastMessage("تم رفض المشاركة وإخفاؤها بنجاح.");
        }
        setTimeout(() => setToastMessage(null), 5000);
        void fetchForumData();
      } else {
        alert(data.error || "تعذر تنفيذ الإجراء");
      }
    } catch {
      alert("حدث خطأ أثناء معالجة المشاركة");
    } finally {
      setActionLoading(null);
    }
  };

  // Close active topic
  const handleCloseTopic = async (topicId: string) => {
    if (!confirm("هل أنت متأكد من رغبتك في إغلاق هذا النقاش وأرشفته؟")) return;
    try {
      setActionLoading(topicId);
      const res = await fetch("/api/forum/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: topicId,
          action: "close",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage("تم إغلاق موضوع النقاش وأرشفته بنجاح.");
        setTimeout(() => setToastMessage(null), 4000);
        void fetchForumData();
      } else {
        alert(data.error || "تعذر إغلاق النقاش");
      }
    } catch {
      alert("حدث خطأ أثناء إغلاق النقاش");
    } finally {
      setActionLoading(null);
    }
  };

  // Add new participants to active debate
  const handleAddParticipants = async () => {
    if (!activeTopic) return;
    if (selectedNewContactIds.length === 0) {
      alert("يرجى تحديد جهة اتصال واحدة على الأقل لإضافتها للنقاش");
      return;
    }
    setAddingParticipants(true);
    try {
      const res = await fetch("/api/forum/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeTopic.id,
          action: "add_participants",
          targetCustomerIds: selectedNewContactIds,
          channels: addParticipantChannels,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage(
          `تمت إضافة وإرسال السؤال إلى المشاركين الجدد بنجاح! (واتساب: ${data.sentWa ?? 0} | تيليغرام: ${data.sentTg ?? 0})`
        );
        setTimeout(() => setToastMessage(null), 5000);
        setSelectedNewContactIds([]);
        setShowAddParticipants(false);
        void fetchForumData();
      } else {
        alert(data.error || "تعذر إضافة المشاركين");
      }
    } catch {
      alert("حدث خطأ أثناء إضافة المشاركين");
    } finally {
      setAddingParticipants(false);
    }
  };

  // Launch new debate
  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTopic) {
      alert("يوجد حالياً موضوع نقاش نشط. يرجى إغلاقه وأرشفته أولاً قبل فتح موضوع جديد.");
      return;
    }
    if (!newTitle.trim() || !newPrompt.trim()) {
      alert("يرجى ملء عنوان وسؤال النقاش");
      return;
    }

    if (audienceType === "manual" && selectedContactIds.length === 0) {
      alert("في الوضع التجريبي، يرجى اختيار جهة اتصال واحدة على الأقل من القائمة أدناه لتوجيه السؤال إليها");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/forum/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          promptQuestion: newPrompt.trim(),
          channels: newChannels,
          targetAudience: audienceType,
          targetCustomerIds: audienceType === "manual" ? selectedContactIds : [],
          moderationMode,
          broadcastImmediately: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setToastMessage(
          `تم إطلاق موضوع النقاش وبث السؤال بنجاح! (واتساب: ${data.broadcastResult?.sentWa ?? 0} | تيليغرام: ${data.broadcastResult?.sentTg ?? 0})`
        );
        setTimeout(() => setToastMessage(null), 6000);
        setNewTitle("");
        setNewPrompt("");
        setSelectedContactIds([]);
        setActiveTab("live");
        void fetchForumData();
      } else {
        alert(data.error || "تعذر إطلاق النقاش");
      }
    } catch {
      alert("حدث خطأ أثناء إطلاق النقاش");
    } finally {
      setCreating(false);
    }
  };

  const wantsWa = newChannels.includes("whatsapp");
  const wantsTg = newChannels.includes("telegram");

  // Filter candidate contacts for experimental selector by selected channels and search
  const filteredCandidates = candidates.filter((c) => {
    // 1. Channel match
    let channelMatch = false;
    if (wantsWa && wantsTg) {
      channelMatch = Boolean(c.hasWa || c.hasTg || c.channels.length > 0);
    } else if (wantsWa) {
      channelMatch = Boolean(c.hasWa || c.channels.includes("whatsapp"));
    } else if (wantsTg) {
      channelMatch = Boolean(c.hasTg || c.channels.includes("telegram"));
    } else {
      channelMatch = true;
    }
    if (!channelMatch) return false;

    // 2. Search match
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      Boolean(c.telegramHandle && c.telegramHandle.toLowerCase().includes(q))
    );
  });

  const toggleSelectContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredCandidates.map((c) => c.id);
    setSelectedContactIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelected = () => {
    setSelectedContactIds([]);
  };

  return (
    <>
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-4 border border-emerald-600">
          <span>✅</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <Header
        title="منتدى النقاش التفاعلي"
        description="فضاء إدارة وإطلاق النقاشات التشاركية عبر واتساب وتيليغرام ومراجعة مساهمات الأساتذة والزملاء"
        actions={
          <button
            type="button"
            onClick={() => void fetchForumData()}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        }
      />

      <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
        {/* ── Stats Overview Bar ────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">حالة النقاش الحالي</span>
              <Radio className={`h-4 w-4 ${activeTopic ? "text-green-600 animate-pulse" : "text-gray-400"}`} />
            </div>
            <p className={`mt-2 text-2xl font-black ${activeTopic ? "text-green-700" : "text-gray-500"}`}>
              {activeTopic ? "نشط ومفتوح" : "لا يوجد نقاش نشط"}
            </p>
            <p className="text-xs text-gray-500 mt-1 truncate">
              {activeTopic ? activeTopic.title : "يمكنك إطلاق موضوع جديد أدناه"}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">المشتركون بالمنتدى</span>
              <Users className="h-4 w-4 text-purple-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-purple-700">{subscribersCount}</p>
            <p className="text-xs text-purple-600 mt-1">مشترك عبر الرقم 55</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">المشاركات والردود</span>
              <MessageSquare className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-blue-700">{posts.length}</p>
            <p className="text-xs text-blue-600 mt-1">آراء مسجلة في الموضوع النشط</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">المشاركات المبثوثة</span>
              <Send className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-amber-700">
              {posts.filter((p) => p.status === "broadcasted").length}
            </p>
            <p className="text-xs text-amber-600 mt-1">مشاركات معتمدة وموزعة للجميع</p>
          </div>
        </div>

        {/* ── Navigation Tabs ─────────────────────────────────── */}
        <div className="flex border-b border-gray-200 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "live"
                ? "border-red-700 text-red-700 bg-red-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            النقاش الحي وتدفق الردود
            {posts.filter((p) => p.status === "pending").length > 0 && (
              <span className="bg-red-700 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {posts.filter((p) => p.status === "pending").length} بانتظار الاعتماد
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("new")}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "new"
                ? "border-red-700 text-red-700 bg-red-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <Send className="h-4 w-4" />
            إطلاق موضوع نقاش جديد (تجريبي ومحدد) 🎯
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("archive")}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "archive"
                ? "border-red-700 text-red-700 bg-red-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <Clock className="h-4 w-4" />
            أرشيف المواضيع السابقة ({topics.filter((t) => t.status !== "active").length})
          </button>
        </div>

        {/* ── Tab 1: Live Active Debate & Moderation Stream ───── */}
        {activeTab === "live" && (
          <div className="space-y-6">
            {activeTopic ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        <span className="h-2 w-2 rounded-full bg-green-600 animate-ping" />
                        موضوع نشط حالياً
                      </span>
                      <span className="text-xs text-gray-500">
                        بدأ: {formatRelativeTime(activeTopic.createdAt)}
                      </span>
                      {activeTopic.moderationMode && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <ShieldCheck className="h-3 w-3" />
                          الوضع المعتدل (الموافقة المسبقة)
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-black text-gray-900 leading-snug">
                      {activeTopic.title}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCloseTopic(activeTopic.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all cursor-pointer"
                  >
                    <StopCircle className="h-4 w-4" />
                    إغلاق وأرشفة هذا النقاش
                  </button>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-800 leading-relaxed whitespace-pre-line font-medium">
                  {activeTopic.promptQuestion}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-4">
                    <span>🎯 الجمهور المستهدف: <strong>{activeTopic.targetAudience === "manual" ? `مجموعة محددة (${activeTopic.targetCustomerIds.length} مستخدم)` : activeTopic.targetAudience === "subscribers" ? "المشتركون فقط" : "كافة جهات الاتصال"}</strong></span>
                    <span>📡 القنوات: <strong>{activeTopic.channels.join(" + ")}</strong></span>
                    <span>👥 المستلمون: <strong>{activeTopic.subscribersCount}</strong></span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddParticipants(!showAddParticipants)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all cursor-pointer"
                  >
                    <span>{showAddParticipants ? "إخفاء لوحة الإضافة" : "➕ دعوة وإضافة مشاركين جدد لهذا النقاش"}</span>
                  </button>
                </div>

                {/* Expandable Add Participants Panel */}
                {showAddParticipants && (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">إضافة مشاركين جدد وبث السؤال إليهم</h4>
                        <p className="text-[11px] text-gray-500">
                          يمكنك اختيار زملاء إضافيين من القائمة لبث سؤال النقاش الحالي إليهم وتمكينهم من التفاعل.
                        </p>
                      </div>

                      {/* Channels for new broadcast */}
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={addParticipantChannels.includes("whatsapp")}
                            onChange={(e) =>
                              setAddParticipantChannels((prev) =>
                                e.target.checked ? [...prev, "whatsapp"] : prev.filter((c) => c !== "whatsapp")
                              )
                            }
                            className="rounded text-red-600 h-3.5 w-3.5"
                          />
                          <span>واتساب</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={addParticipantChannels.includes("telegram")}
                            onChange={(e) =>
                              setAddParticipantChannels((prev) =>
                                e.target.checked ? [...prev, "telegram"] : prev.filter((c) => c !== "telegram")
                              )
                            }
                            className="rounded text-red-600 h-3.5 w-3.5"
                          />
                          <span>تيليغرام</span>
                        </label>
                      </div>
                    </div>

                    {/* Search and Selection */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                          type="text"
                          value={newParticipantSearch}
                          onChange={(e) => setNewParticipantSearch(e.target.value)}
                          placeholder="ابحث بالاسم أو رقم الهاتف..."
                          className="w-full text-xs rounded-xl border border-gray-300 pr-9 pl-3 py-1.5 outline-none focus:border-red-600 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                          تم تحديد {selectedNewContactIds.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedNewContactIds([])}
                          className="text-xs text-gray-500 hover:text-gray-800"
                        >
                          إلغاء التحديد
                        </button>
                      </div>
                    </div>

                    {/* Contacts list */}
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
                      {candidates
                        .filter((c) => {
                          const addWantsWa = addParticipantChannels.includes("whatsapp");
                          const addWantsTg = addParticipantChannels.includes("telegram");
                          let chMatch = false;
                          if (addWantsWa && addWantsTg) chMatch = Boolean(c.hasWa || c.hasTg || c.channels.length > 0);
                          else if (addWantsWa) chMatch = Boolean(c.hasWa || c.channels.includes("whatsapp"));
                          else if (addWantsTg) chMatch = Boolean(c.hasTg || c.channels.includes("telegram"));
                          else chMatch = true;
                          if (!chMatch) return false;
                          if (!newParticipantSearch.trim()) return true;
                          const q = newParticipantSearch.toLowerCase();
                          return (
                            c.name.toLowerCase().includes(q) ||
                            c.phone.toLowerCase().includes(q) ||
                            Boolean(c.telegramHandle && c.telegramHandle.toLowerCase().includes(q))
                          );
                        })
                        .map((c) => {
                          const isAlreadyInTopic = activeTopic.targetCustomerIds.includes(c.id);
                          const isChecked = selectedNewContactIds.includes(c.id);

                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                if (isAlreadyInTopic) return;
                                setSelectedNewContactIds((prev) =>
                                  prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                                );
                              }}
                              className={`p-2.5 flex items-center justify-between text-xs transition cursor-pointer ${
                                isAlreadyInTopic
                                  ? "bg-gray-100/70 text-gray-400 cursor-not-allowed"
                                  : isChecked
                                  ? "bg-red-50/60 font-semibold text-red-900"
                                  : "hover:bg-gray-50 text-gray-700"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked || isAlreadyInTopic}
                                  disabled={isAlreadyInTopic}
                                  onChange={() => {}}
                                  className="rounded text-red-600 h-3.5 w-3.5"
                                />
                                <span className="font-bold">{c.name}</span>
                                <span className="text-gray-500 font-mono text-[11px]">{c.phone}</span>
                                {c.telegramHandle && (
                                  <span className="text-sky-600 text-[11px]">(@{c.telegramHandle})</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {isAlreadyInTopic && (
                                  <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">
                                    مشارك بالفعل ✓
                                  </span>
                                )}
                                {c.isForumSub && !isAlreadyInTopic && (
                                  <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-md">
                                    مشترك 55
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Action button */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={addingParticipants || selectedNewContactIds.length === 0}
                        onClick={() => void handleAddParticipants()}
                        className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <Send className={`h-3.5 w-3.5 ${addingParticipants ? "animate-spin" : ""}`} />
                        {addingParticipants
                          ? "جارٍ الإرسال والإضافة..."
                          : `إرسال موضوع النقاش للمشاركين المحددين (${selectedNewContactIds.length})`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 bg-white border border-gray-200 rounded-2xl p-8 shadow-xs">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                  <MessageSquare className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-gray-800">لا يوجد موضوع نقاش نشط حالياً</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  يمكنك طرح سؤال جديد أو قضية نقاشية وتحديد مجموعة من الزملاء لاختبار تفاعلهم ومشاركتهم.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("new")}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  إطلاق موضوع نقاش تجريبي جديد
                </button>
              </div>
            )}

            {/* ── Posts Stream & Moderation List ──────────────── */}
            {activeTopic && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <span>مشاركات ورود الزملاء</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-semibold">
                      {posts.length} مشاركة
                    </span>
                  </h3>
                  <div className="text-xs text-gray-500">
                    💡 _المشاركات المعتمدة تبث مباشرة لكافة المشاركين في النقاش_
                  </div>
                </div>

                {posts.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-gray-200 rounded-2xl text-gray-400 text-sm">
                    بانتظار وصول أولى ردود المشاركين عبر واتساب وتيليغرام...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3.5">
                    {posts.map((post) => {
                      const isPending = post.status === "pending";
                      const isBroadcasted = post.status === "broadcasted";
                      const isRejected = post.status === "rejected";

                      return (
                        <div
                          key={post.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            isPending
                              ? "bg-amber-50/40 border-amber-200 shadow-2xs"
                              : isBroadcasted
                              ? "bg-white border-green-200 shadow-xs"
                              : "bg-gray-50 border-gray-200 opacity-60"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="h-8 w-8 rounded-full bg-red-100 text-red-700 font-bold text-xs flex items-center justify-center">
                                {post.authorName.charAt(0) || "👤"}
                              </span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-sm font-bold text-gray-900">{post.authorName}</h4>
                                  <span
                                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                                      post.channel === "whatsapp"
                                        ? "bg-green-100 text-green-800"
                                        : "bg-blue-100 text-blue-800"
                                    }`}
                                  >
                                    {post.channel === "whatsapp" ? "WhatsApp" : "Telegram"}
                                  </span>
                                </div>
                                <span className="text-[11px] text-gray-400">
                                  {formatRelativeTime(post.createdAt)} • {post.authorContact}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isBroadcasted && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                  تم البث للجميع ({post.broadcastCount} مستلم)
                                </span>
                              )}
                              {isRejected && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                                  <XCircle className="h-3.5 w-3.5 text-gray-500" />
                                  مرفوض / غير مبثوث
                                </span>
                              )}
                              {isPending && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                  بانتظار مراجعة الإدارة
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-3 bg-white/80 rounded-xl border border-gray-100 text-sm text-gray-800 leading-relaxed font-medium">
                            {post.content}
                          </div>

                          {/* Action buttons */}
                          {!isBroadcasted && (
                            <div className="mt-3 flex items-center justify-end gap-2">
                              {isPending && (
                                <button
                                  type="button"
                                  onClick={() => void handleModeratePost(post.id, "reject")}
                                  disabled={actionLoading === post.id}
                                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                >
                                  ❌ رفض / تجاهل
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleModeratePost(post.id, "broadcast")}
                                disabled={actionLoading === post.id}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-green-700 hover:bg-green-800 rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50"
                              >
                                {actionLoading === post.id ? (
                                  <span className="h-3 w-3 border-2 border-white border-t-transparent animate-spin rounded-full" />
                                ) : (
                                  <Send className="h-3 w-3" />
                                )}
                                📢 موافقة وبث للمشاركين
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: Launch New Debate (Experimental Selector) ── */}
        {activeTab === "new" && activeTopic && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 shadow-xs text-right space-y-4">
            <div className="flex items-center gap-3 text-amber-900 font-black text-base">
              <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
              <span>يوجد حالياً موضوع نقاش نشط: « {activeTopic.title} »</span>
            </div>
            <p className="text-sm text-amber-800 leading-relaxed">
              وفقاً لضوابط منتدى النقاش، يتم مناقشة <strong>موضوع واحد فقط</strong> في نفس الوقت لمنع التشتت.
              لفتح موضوع جديد، يجب إغلاق وأرشفة الموضوع الحالي أولاً. يمكنك أيضاً إضافة مشاركين جدد للموضوع الحالي من تبويب النقاش الحي.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => void handleCloseTopic(activeTopic.id)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-xs transition cursor-pointer"
              >
                <StopCircle className="h-4 w-4" />
                إغلاق وأرشفة النقاش الحالي الآن
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("live")}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition cursor-pointer"
              >
                <Eye className="h-4 w-4" />
                الذهاب إلى النقاش النشط ومتابعة الردود
              </button>
            </div>
          </div>
        )}

        {activeTab === "new" && !activeTopic && (
          <form onSubmit={handleCreateTopic} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 cols: Form & Audience selection */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
                <h3 className="text-base font-black text-gray-900 border-b border-gray-100 pb-3">
                  تفاصيل الموضوع وسؤال النقاش
                </h3>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    عنوان الموضوع أو القضية المطروحة *
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="مثال: مقترحات تعديل النظام الأساسي والتعويض عن المناطق النائية"
                    required
                    className="w-full text-sm rounded-xl border border-gray-300 px-3.5 py-2.5 focus:border-red-600 focus:ring-2 focus:ring-red-100 outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    نص السؤال أو الإشكالية الموجهة للمشاركين *
                  </label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    rows={4}
                    placeholder="اكتب تفاصيل الإشكالية والمحاور المطلوب من الأساتذة إبداء رأيهم فيها..."
                    required
                    className="w-full text-sm rounded-xl border border-gray-300 p-3.5 focus:border-red-600 focus:ring-2 focus:ring-red-100 outline-none leading-relaxed font-medium"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    💡 _سيتم إلحاق توجيهات المشاركة (55 للاشتراك، 99 للإلغاء) تلقائياً بأسفل الرسالة._
                  </p>
                </div>

                {/* Channel selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">قنوات الإرسال المعتمدة</label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newChannels.includes("whatsapp")}
                        onChange={(e) =>
                          setNewChannels((prev) =>
                            e.target.checked ? [...prev, "whatsapp"] : prev.filter((c) => c !== "whatsapp")
                          )
                        }
                        className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                      />
                      <span>واتساب (WhatsApp)</span>
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newChannels.includes("telegram")}
                        onChange={(e) =>
                          setNewChannels((prev) =>
                            e.target.checked ? [...prev, "telegram"] : prev.filter((c) => c !== "telegram")
                          )
                        }
                        className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                      />
                      <span>تيليغرام (Telegram Bot)</span>
                    </label>
                  </div>
                </div>

                {/* Moderation Mode Toggle */}
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">الوضع المعتدل (موافقة الإدارة قبل إعادة البث)</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      موصى به لحماية رقم واتساب ومنع إرسال أي رسائل غير لائقة لعموم المشاركين.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={moderationMode}
                    onChange={(e) => setModerationMode(e.target.checked)}
                    className="h-4 w-4 text-red-600 rounded focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Audience Selector & Experimental Multi-Select */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-base font-black text-gray-900">تحديد جمهور النقاش</h3>
                  <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setAudienceType("manual")}
                      className={`px-3 py-1 rounded-lg transition ${
                        audienceType === "manual" ? "bg-white text-red-700 shadow-2xs font-bold" : "text-gray-600"
                      }`}
                    >
                      🎯 تحديد يدوي تجريبي ({filteredCandidates.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudienceType("subscribers")}
                      className={`px-3 py-1 rounded-lg transition ${
                        audienceType === "subscribers" ? "bg-white text-red-700 shadow-2xs font-bold" : "text-gray-600"
                      }`}
                    >
                      👥 مشتركو المنتدى ({subscribersCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudienceType("all")}
                      className={`px-3 py-1 rounded-lg transition ${
                        audienceType === "all" ? "bg-white text-red-700 shadow-2xs font-bold" : "text-gray-600"
                      }`}
                    >
                      🌐 {wantsWa && wantsTg
                        ? `كافة القنوات (${channelCounts.combined})`
                        : wantsTg
                        ? `كافة جهات تيليغرام (${channelCounts.telegram})`
                        : `كافة جهات واتساب (${channelCounts.whatsapp})`}
                    </button>
                  </div>
                </div>

                {/* Experimental Manual Picker */}
                {audienceType === "manual" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          placeholder="ابحث بالاسم أو رقم الهاتف..."
                          className="w-full text-xs rounded-xl border border-gray-300 pr-9 pl-3 py-2 outline-none focus:border-red-600"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllFiltered}
                          className="px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
                        >
                          تحديد الكل ({filteredCandidates.length})
                        </button>
                        <button
                          type="button"
                          onClick={clearSelected}
                          className="px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          إلغاء التحديد
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 bg-red-50/60 rounded-xl border border-red-200 flex items-center justify-between text-xs text-red-800 font-bold">
                      <span>
                        تم تحديد: {selectedContactIds.length} من أصل {filteredCandidates.length} جهة اتصال (
                        {wantsWa && wantsTg
                          ? "واتساب + تيليغرام"
                          : wantsTg
                          ? "تيليغرام فقط"
                          : "واتساب فقط"}
                        )
                      </span>
                      <span className="text-[11px] font-normal text-red-700">
                        سيتم إرسال الموضوع لهؤلاء الأشخاص فقط.
                      </span>
                    </div>

                    {/* Candidate List with checkboxes */}
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
                      {filteredCandidates.map((c) => {
                        const isSelected = selectedContactIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleSelectContact(c.id)}
                            className={`p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition ${
                              isSelected ? "bg-red-50/40" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectContact(c.id)}
                                className="h-4 w-4 text-red-600 rounded focus:ring-red-500 cursor-pointer"
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h5 className="text-xs font-bold text-gray-900">{c.name}</h5>
                                  {c.channels?.includes("whatsapp") && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-green-100 text-green-800">
                                      WhatsApp
                                    </span>
                                  )}
                                  {c.channels?.includes("telegram") && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                                      Telegram
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-gray-400 font-mono">
                                  {c.phone || c.telegramHandle || "—"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {c.isForumSub && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                                  مشترك بالمنتدى
                                </span>
                              )}
                              {c.isBayanSub && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                                  مشترك بالبيانات
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {creating ? (
                    <span className="h-4 w-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  إطلاق النقاش وبث الرسالة للمحددين
                </button>
              </div>
            </div>

            {/* Right col: Live WhatsApp Preview */}
            <div className="space-y-4">
              <div className="sticky top-6 bg-[#efeae2] border border-[#d1d7db] rounded-3xl p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-300 pb-2.5 mb-3 text-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="h-8 w-8 rounded-full bg-red-700 text-white font-bold text-xs flex items-center justify-center">
                      FNE
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">مساعد الجامعة FNE</h4>
                      <span className="text-[10px] text-green-700 font-semibold">متصل الآن</span>
                    </div>
                  </div>
                  <Eye className="h-4 w-4 text-gray-400" />
                </div>

                {/* Message Bubble Preview */}
                <div className="bg-white p-3.5 rounded-2xl rounded-tr-none shadow-2xs text-xs text-gray-900 space-y-2.5 leading-relaxed">
                  <div className="font-bold text-red-800">
                    📢 *منتدى النقاش التفاعلي — الجامعة الوطنية للتعليم FNE*
                  </div>

                  <div className="font-bold text-gray-900">
                    📌 *موضوع النقاش:* {newTitle || "عنوان موضوع النقاش..."}
                  </div>

                  <div className="whitespace-pre-line text-gray-800">
                    {newPrompt || "تفاصيل السؤال والإشكالية المطروحة للنقاش وتبادل الآراء بين الزملاء والأساتذة..."}
                  </div>

                  <div className="text-gray-600 font-medium">
                    ✍️ *شاركنا رأيك أو مقترحك بالرد المباشر على هذه الرسالة.*
                  </div>

                  <div className="border-t border-gray-100 pt-2 text-[11px] text-gray-600 space-y-0.5">
                    <div className="font-bold text-gray-700">⚙️ *خيارات المشاركة:*</div>
                    <div>• للمشاركة برأيك: أرسل الرقم *55*</div>
                    <div>• للعودة للمساعد الآلي لطرح الأسئلة: أرسل الرقم *0*</div>
                    <div>• لإلغاء الاشتراك من المنتدى: أرسل الرقم *99*</div>
                  </div>

                  <div className="text-left text-[10px] text-gray-400 mt-1">12:00 م ✓✓</div>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* ── Tab 3: Historical Debates Archive ────────────────── */}
        {activeTab === "archive" && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-black text-gray-900 border-b border-gray-100 pb-3">
              أرشيف المواضيع والنقاشات السابقة
            </h3>

            {topics.filter((t) => t.status !== "active").length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                لا توجد مواضيع نقاش سابقة في الأرشيف بعد.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {topics
                  .filter((t) => t.status !== "active")
                  .map((t) => (
                    <div key={t.id} className="py-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                            مغلق
                          </span>
                          <span className="text-xs text-gray-400">
                            أُطلق في: {formatRelativeTime(t.createdAt)}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-gray-900">{t.title}</h4>
                        <p className="text-xs text-gray-500 line-clamp-2 mt-1">{t.promptQuestion}</p>
                      </div>

                      <div className="text-left shrink-0">
                        <span className="text-xs font-bold text-blue-700">
                          {t._count?.posts ?? t.postsCount} مشاركة
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
