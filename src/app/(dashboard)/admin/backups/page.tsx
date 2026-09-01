"use client";

import { Header } from "@/components/layout/header";
import {
  HardDrive,
  Download,
  RotateCcw,
  Trash2,
  Plus,
  RefreshCw,
  Clock,
  ShieldCheck,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  Database,
  Calendar,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { formatRelativeTime } from "@/lib/utils";

interface BackupItem {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  timestamp: number;
}

interface BackupResponse {
  backups: BackupItem[];
  schedule: string;
  retention: string;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  latestBackup: BackupItem | null;
}

export default function BackupsPage() {
  const [data, setData] = useState<BackupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  const [uploadingRestore, setUploadingRestore] = useState(false);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Restore confirmation modal
  const [confirmRestoreTarget, setConfirmRestoreTarget] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backups");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBackups();
  }, [fetchBackups]);

  // Create immediate backup
  const handleCreateBackup = async () => {
    setCreating(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: `تم إنشاء النسخة الاحتياطية بنجاح (${json.backup?.sizeFormatted})! 💾`,
        });
        await fetchBackups();
      } else {
        setStatusMessage({
          type: "error",
          text: json.error || "فشل إنشاء النسخة الاحتياطية",
        });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: String(err) });
    } finally {
      setCreating(false);
    }
  };

  // Restore existing backup
  const handleRestore = async (filename: string) => {
    setRestoringFilename(filename);
    setConfirmRestoreTarget(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: "✅ تمت استعادة النسخة الاحتياطية بنجاح! تم تحديث قاعدة البيانات وجلسة واتساب.",
        });
        await fetchBackups();
      } else {
        setStatusMessage({
          type: "error",
          text: json.error || "فشل استرجاع النسخة الاحتياطية",
        });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: String(err) });
    } finally {
      setRestoringFilename(null);
    }
  };

  // Upload and restore a backup file from user's PC
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`هل أنت متأكد من استعادة النسخة الاحتياطية من الملف "${file.name}"؟ سيتم استبدال البيانات الحالية.`)) {
      e.target.value = "";
      return;
    }

    setUploadingRestore(true);
    setStatusMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: "✅ تم رفع واستعادة النسخة الاحتياطية بنجاح!",
        });
        await fetchBackups();
      } else {
        setStatusMessage({
          type: "error",
          text: json.error || "فشل استرجاع الملف المرفوع",
        });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: String(err) });
    } finally {
      setUploadingRestore(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete backup
  const handleDelete = async (filename: string) => {
    if (!confirm(`هل تريد بالتأكيد حذف النسخة الاحتياطية "${filename}"؟`)) return;
    setDeletingFilename(filename);
    try {
      const res = await fetch(`/api/admin/backups/${filename}`, { method: "DELETE" });
      if (res.ok) {
        await fetchBackups();
      }
    } catch {
      // silent
    } finally {
      setDeletingFilename(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="النسخ الاحتياطي والاسترجاع / Sauvegardes & Restauration" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Status Message Banner ───────────────────────── */}
        {statusMessage && (
          <div
            className={`flex items-center gap-3 p-4 rounded-xl border ${
              statusMessage.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            )}
            <span className="text-sm font-semibold">{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="ml-auto text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Stats Cards ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">النسخ المحفوظة</span>
              <FileArchive className="h-4 w-4 text-[#b51f2b]" />
            </div>
            <p className="mt-1 text-3xl font-bold text-gray-800">{data?.backups.length ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-0.5">نسخة احتياطية جاهزة</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">النسخ التلقائي</span>
              <Calendar className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-1 text-base font-bold text-gray-800">كل يومين (03:00)</p>
            <p className="text-xs text-blue-600 mt-0.5 font-medium">أوتوماتيكي عبر السيرفر</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">مدة الاحتفاظ</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-1 text-base font-bold text-gray-800">آخر 7 نسخ</p>
            <p className="text-xs text-amber-600 mt-0.5 font-medium">حذف التلقائي للأقدم</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-xs font-semibold uppercase tracking-wide">حجم التخزين</span>
              <HardDrive className="h-4 w-4 text-purple-600" />
            </div>
            <p className="mt-1 text-3xl font-bold text-purple-700">{data?.totalSizeFormatted ?? "—"}</p>
            <p className="text-xs text-purple-500 mt-0.5 font-medium">مساحة مستهلكة</p>
          </div>
        </div>

        {/* ── Info Box ────────────────────────────────────── */}
        <div className="flex items-start gap-3 p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900">
          <ShieldCheck className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">🛡️ ماذا تحتوي كل نسخة احتياطية؟</p>
            <p>
              تتضمن كل نسخة قاعدة بيانات PostgreSQL بالكامل (جميع فiches المعرفة، الأسئلة والأجوبة، سجل المحادثات الكامل، جهات الاتصال والتقييمات)، بالإضافة إلى <strong>جلسة ربط واتساب (WhatsApp Auth Session)</strong> لتمكين إعادة التشغيل الفوري دون الحاجة لمسح QR Code مرة أخرى.
            </p>
          </div>
        </div>

        {/* ── Action bar ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-800">النسخ الاحتياطية المتوفرة</h2>
            <p className="text-xs text-gray-500">تحميل النسخ إلى جهازك، أو استرجاعها بضغطة زر واحدة</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Hidden file input for upload */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".tar.gz,.gz"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingRestore}
              className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
            >
              <Upload className="h-4 w-4" />
              <span>{uploadingRestore ? "جاري الاسترجاع..." : "استرجاع من ملف خارجي 📤"}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={creating}
              className="flex items-center gap-2 rounded-xl bg-[#b51f2b] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#941a25] transition-colors disabled:opacity-40"
            >
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>{creating ? "جاري النسخ..." : "إنشاء نسخة احتياطية الآن 💾"}</span>
            </button>
          </div>
        </div>

        {/* ── Table of Backups ────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              جاري التحميل...
            </div>
          ) : !data?.backups.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <HardDrive className="h-12 w-12 mb-3 opacity-30 text-[#b51f2b]" />
              <p className="text-base font-bold text-gray-700">لا توجد نسخ احتياطية حالياً</p>
              <p className="text-xs mt-1 text-gray-400">اضغط على الزر أعلاه لإنشاء أول نسخة احتياطية فوراً</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 text-left">اسم الملف</th>
                  <th className="px-4 py-3 text-left">الحجم</th>
                  <th className="px-4 py-3 text-left">تاريخ الإنشاء</th>
                  <th className="px-4 py-3 text-left">الحالة</th>
                  <th className="px-4 py-3 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.backups.map((b, idx) => {
                  const isLatest = idx === 0;
                  const isRestoring = restoringFilename === b.filename;
                  const isDeleting = deletingFilename === b.filename;

                  return (
                    <tr key={b.filename} className="transition-colors hover:bg-gray-50">
                      {/* Name */}
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800 flex items-center gap-2">
                        <FileArchive className="h-4 w-4 text-[#b51f2b] shrink-0" />
                        <span>{b.filename}</span>
                        {isLatest && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                            الأحدث ⭐
                          </span>
                        )}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 font-semibold text-gray-700">
                        {b.sizeFormatted}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        <div>{formatRelativeTime(b.createdAt)}</div>
                        <div className="text-[11px] text-gray-400">
                          {new Date(b.createdAt).toLocaleString("fr-FR")}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                          <CheckCircle2 className="h-3 w-3" /> جاهزة
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Download */}
                          <a
                            href={`/api/admin/backups/${b.filename}`}
                            download={b.filename}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                            title="تحميل النسخة إلى حاسوبك"
                          >
                            <Download className="h-3.5 w-3.5 text-blue-600" />
                            <span>تحميل</span>
                          </a>

                          {/* Restore */}
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreTarget(b.filename)}
                            disabled={isRestoring}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-40"
                            title="استرجاع البيانات من هذه النسخة"
                          >
                            <RotateCcw className={`h-3.5 w-3.5 text-amber-700 ${isRestoring ? "animate-spin" : ""}`} />
                            <span>{isRestoring ? "جاري الاسترجاع..." : "استرجاع 🔄"}</span>
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => void handleDelete(b.filename)}
                            disabled={isDeleting}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                            title="حذف النسخة"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* ── Restore Confirmation Modal ────────────────────── */}
      {confirmRestoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="h-7 w-7 shrink-0" />
              <h3 className="font-bold text-gray-800 text-lg">تأكيد استرجاع النسخة الاحتياطية</h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              أنت على وشك استرجاع البيانات من الملف :<br />
              <strong className="font-mono text-gray-800">{confirmRestoreTarget}</strong>
            </p>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              ⚠️ <strong>تحذير :</strong> هذه العملية ستستبدل البيانات الحالية بالبيانات الموجودة في النسخة الاحتياطية. يوصى بأخذ نسخة احتياطية جديدة قبل المتابعة.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRestoreTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={() => void handleRestore(confirmRestoreTarget)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>نعم، استرجاع البيانات الآن 🔄</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
