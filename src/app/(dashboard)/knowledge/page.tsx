"use client";

import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  X,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Star,
  ArrowUp,
  Minus,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Upload,
  Download,
  Building,
  Sparkles,
  ChevronDown,
  Globe,
  FileUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryWithCount {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  _count: { entries: number };
}

interface EntryCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface KnowledgeEntry {
  id: string;
  categoryId: string;
  category: EntryCategory;
  title: string;
  content: string;
  priority: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

const PRIORITIES = [
  { value: 0, label: "Normal", icon: Minus, className: "bg-gray-100 text-gray-600" },
  { value: 1, label: "Medium", icon: ArrowUp, className: "bg-yellow-100 text-yellow-700" },
  { value: 2, label: "High", icon: ArrowUp, className: "bg-orange-100 text-orange-700" },
  { value: 3, label: "Critical", icon: Star, className: "bg-red-100 text-red-700" },
];

function getPriority(value: number) {
  return PRIORITIES.find((p) => p.value === value) || PRIORITIES[0];
}

// ---------------------------------------------------------------------------
// Category icon mapping (lucide subset as colored circles with letter)
// ---------------------------------------------------------------------------

function CategoryIcon({ color, name }: { color: string; name: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-sm font-semibold flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function KnowledgeBasePage() {
  // --- State ---
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesLimit, setEntriesLimit] = useState(25);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [entriesTotalPages, setEntriesTotalPages] = useState(1);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");

  // URL & Feed Import Modal
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [modalTab, setModalTab] = useState<"batch" | "feed" | "single" | "paste">("batch");
  const [batchPage, setBatchPage] = useState(1);
  const [importingBatch, setImportingBatch] = useState(false);
  const [batchStats, setBatchStats] = useState<{
    page?: number;
    totalPages?: number;
    totalWpPosts?: number;
    imported?: number;
    skipped?: number;
    hasMore?: boolean;
    nextPage?: number | null;
  } | null>(null);
  const [urlForm, setUrlForm] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [feedType, setFeedType] = useState<"bayanat" | "infos" | "all">("bayanat");
  const [pasteText, setPasteText] = useState("");
  const [importingText, setImportingText] = useState(false);

  // MEN (Ministry) Import Modal
  const [showMenModal, setShowMenModal] = useState(false);
  const [menMode, setMenMode] = useState<"batch" | "auto" | "url">("batch");
  const [menBatchPage, setMenBatchPage] = useState(1);
  const [menBatchStats, setMenBatchStats] = useState<{
    page: number;
    imported: number;
    skippedDeleted: number;
    skippedExisting: number;
    skippedIrrelevant: number;
    totalFound: number;
    hasMore: boolean;
    nextPage: number;
  } | null>(null);
  const [menUrl, setMenUrl] = useState("");
  const [menLimit, setMenLimit] = useState(20);
  const [syncingMen, setSyncingMen] = useState(false);
  const [menStats, setMenStats] = useState<{
    activeEntriesCount: number;
    importedCount: number;
    deletedCount: number;
    suggestedNextPage?: number;
  } | null>(null);
  const [feedLimit, setFeedLimit] = useState(10);
  const [syncingFeed, setSyncingFeed] = useState(false);

  // Dropdown for import actions & hidden file input
  const [showImportDropdown, setShowImportDropdown] = useState(false);
  const importDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", icon: "folder", color: "#4A7C9B" });
  const [savingCategory, setSavingCategory] = useState(false);

  // Entry modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [entryForm, setEntryForm] = useState({ title: "", content: "", priority: 0 });
  const [savingEntry, setSavingEntry] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: "category" | "entry"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Data fetching ---

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const res = await fetch("/api/knowledge/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const fetchEntries = useCallback(async (categoryId: string, page?: number, limit?: number) => {
    setLoadingEntries(true);
    const p = page !== undefined ? page : 1;
    const l = limit !== undefined ? limit : 25;
    try {
      const res = await fetch(`/api/knowledge/entries?categoryId=${categoryId}&page=${p}&limit=${l}`);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.data || [];
        setEntries(items);
        if (json.pagination) {
          setEntriesTotal(json.pagination.total);
          setEntriesTotalPages(json.pagination.totalPages);
          setEntriesPage(json.pagination.page);
          setEntriesLimit(json.pagination.limit);
        } else {
          setEntriesTotal(items.length);
          setEntriesTotalPages(1);
          setEntriesPage(1);
        }
      }
    } catch (err) {
      console.error("Failed to fetch entries:", err);
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  async function importFile(file: File) {
    if (!selectedCategoryId) return;
    setImporting(true);
    setImportError("");
    setImportSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("categoryId", selectedCategoryId);
      const res = await fetch("/api/knowledge/import", { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");
      setImportSuccess(`${result.imported} partie(s) importée(s) depuis ${result.sourceFile}.`);
      await fetchEntries(selectedCategoryId);
      await fetchCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import impossible.";
      setImportError(message);
      console.error("Failed to import knowledge file:", error);
    } finally {
      setImporting(false);
    }
  }

  async function importFromUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCategoryId || !urlForm.trim()) return;
    setImportingUrl(true);
    setImportError("");
    setImportSuccess("");
    try {
      const res = await fetch("/api/knowledge/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlForm, categoryId: selectedCategoryId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to import URL");
      
      setImportSuccess(`Article importé avec succès: ${result.data.title}`);
      setShowUrlModal(false);
      setUrlForm("");
      await fetchEntries(selectedCategoryId);
      await fetchCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur lors de l'importation";
      setImportError(message);
    } finally {
      setImportingUrl(false);
    }
  }

  async function importFromText(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) return;
    setImportingText(true);
    setImportError("");
    setImportSuccess("");
    try {
      const res = await fetch("/api/knowledge/import-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText, categoryId: selectedCategoryId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to import text");
      
      setImportSuccess(`تم استخراج وإضافة المقال بنجاح: ${result.entry.title}`);
      setShowUrlModal(false);
      setPasteText("");
      if (selectedCategoryId) {
        await fetchEntries(selectedCategoryId);
      }
      await fetchCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur lors de l'importation";
      setImportError(message);
    } finally {
      setImportingText(false);
    }
  }

  async function syncFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCategoryId) return;
    setSyncingFeed(true);
    setImportError("");
    setImportSuccess("");
    try {
      const res = await fetch("/api/knowledge/sync-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategoryId,
          feedType,
          limit: feedLimit,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to sync feed");

      setImportSuccess(
        `Synchronisation réussie : ${result.imported} article(s) importé(s), ${result.skipped} déjà existant(s).`
      );
      setShowUrlModal(false);
      await fetchEntries(selectedCategoryId);
      await fetchCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur lors de la synchronisation";
      setImportError(message);
    } finally {
      setSyncingFeed(false);
    }
  }

  async function importBatch(pageToFetch?: number) {
    if (!selectedCategoryId) return;
    const targetPage = pageToFetch || batchPage;
    setImportingBatch(true);
    setImportError("");
    setImportSuccess("");
    try {
      const res = await fetch("/api/knowledge/sync-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategoryId,
          page: targetPage,
          perPage: 100,
          categories: [79, 60, 76],
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur lors de l'importation");

      setBatchStats(result);
      if (result.nextPage) {
        setBatchPage(result.nextPage);
      }

      setImportSuccess(
        `✅ الدفعة ${targetPage}: تم استيراد ${result.imported} مقال جديد بنجاح (${result.skipped} مقال تم تجاوزه لعدم التكرار أو لأنه محذوف مسبقاً).`
      );
      await fetchEntries(selectedCategoryId);
      await fetchCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur lors de l'importation";
      setImportError(message);
    } finally {
      setImportingBatch(false);
    }
  }

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (selectedCategoryId) {
      setEntriesPage(1);
      fetchEntries(selectedCategoryId, 1, entriesLimit);
    } else {
      setEntries([]);
      setEntriesTotal(0);
      setEntriesTotalPages(1);
      setEntriesPage(1);
    }
  }, [selectedCategoryId, fetchEntries, entriesLimit]);

  // Auto-open modal if redirected with ?new=1&title=... (e.g. from feedback or unanswered page)
  useEffect(() => {
    if (typeof window !== "undefined" && categories.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const isNew = params.get("new");
      const paramTitle = params.get("title");
      if (isNew === "1" && paramTitle) {
        const decodedTitle = decodeURIComponent(paramTitle);
        if (!selectedCategoryId) {
          setSelectedCategoryId(categories[0].id);
        }
        setEditingEntry(null);
        setEntryForm({
          title: decodedTitle,
          content: "",
          priority: 20,
        });
        setShowEntryModal(true);
        window.history.replaceState({}, "", "/knowledge");
      }
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (showUrlModal) {
      fetch("/api/knowledge/sync-feed")
        .then((r) => r.json())
        .then((data) => {
          if (data?.suggestedNextPage) {
            setBatchPage(data.suggestedNextPage);
          }
        })
        .catch(() => {});
    }
  }, [showUrlModal]);

  useEffect(() => {
    if (showMenModal) {
      fetch("/api/knowledge/sync-men")
        .then((r) => r.json())
        .then((data) => {
          if (data) {
            setMenStats(data);
            if (data.suggestedNextPage && menBatchStats === null) {
              setMenBatchPage(data.suggestedNextPage);
            }
          }
        })
        .catch(() => {});
    }
  }, [showMenModal, menBatchStats]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        importDropdownRef.current &&
        !importDropdownRef.current.contains(event.target as Node)
      ) {
        setShowImportDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function syncMen(e: React.FormEvent) {
    e.preventDefault();
    setSyncingMen(true);
    setImportError("");
    setImportSuccess("");
    try {
      const res = await fetch("/api/knowledge/sync-men", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategoryId,
          mode: menMode,
          url: menUrl,
          limit: menLimit,
          page: menMode === "batch" ? menBatchPage : 1,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to sync from men.gov.ma");

      if (menMode === "batch") {
        setMenBatchStats({
          page: result.page || menBatchPage,
          imported: result.imported ?? 0,
          skippedDeleted: result.skippedDeleted ?? 0,
          skippedExisting: result.skippedExisting ?? 0,
          skippedIrrelevant: result.skippedIrrelevant ?? 0,
          totalFound: result.totalFound ?? 0,
          hasMore: result.hasMore ?? false,
          nextPage: result.nextPage ?? (menBatchPage + 1),
        });
        if (result.nextPage) {
          setMenBatchPage(result.nextPage);
        }
        setImportSuccess(
          `✅ تم استيراد الدفعة ${result.page || menBatchPage}: ${result.imported} مستجد جديد بنجاح (${result.skippedExisting || 0} موجود مسبقاً، ${result.skippedIrrelevant || 0} تم استبعاده).`
        );
      } else {
        setImportSuccess(
          `✅ مزامنة موقع الوزارة: تم استيراد ${result.imported} مستجد رسمي بنجاح (${result.skippedDeleted || 0} محذوف مسبقاً، و ${result.skippedExisting || 0} موجود بالفعل).`
        );
        setShowMenModal(false);
      }

      await fetchCategories();
      if (result.targetCategoryId) {
        setSelectedCategoryId(result.targetCategoryId);
        await fetchEntries(result.targetCategoryId);
      } else if (selectedCategoryId) {
        await fetchEntries(selectedCategoryId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur lors de la synchronisation";
      setImportError(message);
    } finally {
      setSyncingMen(false);
    }
  }

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) || null;

  // --- Category CRUD ---

  function openCategoryModal(category?: CategoryWithCount) {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description,
        icon: category.icon,
        color: category.color,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: "", description: "", icon: "folder", color: "#4A7C9B" });
    }
    setShowCategoryModal(true);
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) return;
    setSavingCategory(true);
    try {
      const url = editingCategory
        ? `/api/knowledge/categories/${editingCategory.id}`
        : "/api/knowledge/categories";
      const method = editingCategory ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
      if (res.ok) {
        setShowCategoryModal(false);
        await fetchCategories();
      }
    } catch (err) {
      console.error("Failed to save category:", err);
    } finally {
      setSavingCategory(false);
    }
  }

  // --- Entry CRUD ---

  function openEntryModal(entry?: KnowledgeEntry) {
    if (entry) {
      setEditingEntry(entry);
      setEntryForm({ title: entry.title, content: entry.content, priority: entry.priority });
    } else {
      setEditingEntry(null);
      setEntryForm({ title: "", content: "", priority: 0 });
    }
    setShowEntryModal(true);
  }

  async function saveEntry() {
    if (!entryForm.title.trim() || !selectedCategoryId) return;
    setSavingEntry(true);
    try {
      const url = editingEntry
        ? `/api/knowledge/entries/${editingEntry.id}`
        : "/api/knowledge/entries";
      const method = editingEntry ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...entryForm, categoryId: selectedCategoryId }),
      });
      if (res.ok) {
        setShowEntryModal(false);
        await fetchEntries(selectedCategoryId);
        await fetchCategories();
      }
    } catch (err) {
      console.error("Failed to save entry:", err);
    } finally {
      setSavingEntry(false);
    }
  }

  async function toggleEntryActive(entry: KnowledgeEntry) {
    try {
      const res = await fetch(`/api/knowledge/entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      if (res.ok && selectedCategoryId) {
        await fetchEntries(selectedCategoryId);
      }
    } catch (err) {
      console.error("Failed to toggle entry:", err);
    }
  }

  // --- Delete ---

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const url =
        deleteTarget.type === "category"
          ? `/api/knowledge/categories/${deleteTarget.id}`
          : `/api/knowledge/entries/${deleteTarget.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        if (deleteTarget.type === "category") {
          if (selectedCategoryId === deleteTarget.id) {
            setSelectedCategoryId(null);
            setEntries([]);
          }
          await fetchCategories();
        } else if (selectedCategoryId) {
          await fetchEntries(selectedCategoryId);
          await fetchCategories();
        }
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // --- Category color presets ---
  const colorPresets = [
    "#4A7C9B", "#2D5A7B", "#C4956A", "#6B8E5B", "#9B6B9E",
    "#C75C5C", "#D4964A", "#5B8E8E", "#7C6B9B", "#4A9B7C",
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Header
        title="Knowledge Base"
        description="Manage your AI's knowledge and responses"
      />

      <div className="flex-1 overflow-hidden flex">
        {/* ================= LEFT PANEL: Categories ================= */}
        <div className="w-80 flex-shrink-0 border-r border-owly-border bg-owly-surface flex flex-col">
          <div className="px-4 py-3 border-b border-owly-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-owly-text">Categories</h3>
            <button
              onClick={() => openCategoryModal()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-owly-primary hover:bg-owly-primary-dark rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingCategories ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-owly-text-light" />
              </div>
            ) : categories.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FolderOpen className="h-10 w-10 mx-auto mb-3 text-owly-text-light opacity-40" />
                <p className="text-sm font-medium text-owly-text-light">No categories yet</p>
                <p className="text-xs text-owly-text-light mt-1">
                  Create your first category to start organizing knowledge entries.
                </p>
                <button
                  onClick={() => openCategoryModal()}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-owly-primary border border-owly-primary/30 hover:bg-owly-primary-50 rounded-lg transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Category
                </button>
              </div>
            ) : (
              <div className="py-1">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                      selectedCategoryId === cat.id
                        ? "bg-owly-primary-50 border-r-2 border-owly-primary"
                        : "hover:bg-owly-bg"
                    )}
                    onClick={() => setSelectedCategoryId(cat.id)}
                  >
                    <CategoryIcon color={cat.color} name={cat.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-owly-text truncate">
                          {cat.name}
                        </p>
                        <span className="text-xs text-owly-text-light flex-shrink-0 ml-2">
                          {cat._count.entries}
                        </span>
                      </div>
                      {cat.description && (
                        <p className="text-xs text-owly-text-light truncate mt-0.5">
                          {cat.description}
                        </p>
                      )}
                    </div>
                    <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCategoryModal(cat);
                        }}
                        className="p-1 text-owly-text-light hover:text-owly-primary rounded transition-colors"
                        title="Edit category"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ type: "category", id: cat.id, name: cat.name });
                        }}
                        className="p-1 text-owly-text-light hover:text-red-600 rounded transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {selectedCategoryId === cat.id && (
                      <ChevronRight className="h-4 w-4 text-owly-primary flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ================= RIGHT PANEL: Entries ================= */}
        <div className="flex-1 flex flex-col min-w-0 bg-owly-bg">
          {!selectedCategory ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-owly-text-light opacity-30" />
                <p className="text-lg font-medium text-owly-text-light">
                  Select a category
                </p>
                <p className="text-sm text-owly-text-light mt-1">
                  Choose a category from the left panel to view and manage its entries.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Entries header */}
              <div className="px-6 py-3 border-b border-owly-border bg-owly-surface flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CategoryIcon color={selectedCategory.color} name={selectedCategory.name} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-owly-text">
                        {selectedCategory.name}
                      </h3>
                      {entriesTotal > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                          {entriesTotal} مقال
                        </span>
                      )}
                    </div>
                    {selectedCategory.description && (
                      <p className="text-xs text-owly-text-light">
                        {selectedCategory.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Smart Contextual Action Pill */}
                  {selectedCategory.name.includes("وزارة التربية") ? (
                    <button
                      type="button"
                      onClick={() => setShowMenModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors shadow-2xs"
                      title="سحب المذكرات والبلاغات الرسمية صفحة بصفحة"
                    >
                      <Building className="h-3.5 w-3.5 text-blue-600" />
                      <span>سحب الدفعات (men.gov.ma)</span>
                    </button>
                  ) : selectedCategory.name.includes("الموقع الإلكتروني") ? (
                    <button
                      type="button"
                      onClick={() => {
                        setModalTab("batch");
                        setShowUrlModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors shadow-2xs"
                      title="استيراد مقالات وبيانات الجامعة دفعة بدفعة"
                    >
                      <Globe className="h-3.5 w-3.5 text-emerald-600" />
                      <span>استيراد الدفعات (taalim.org)</span>
                    </button>
                  ) : null}

                  {/* Unified Import & Sync Dropdown */}
                  <div className="relative" ref={importDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowImportDropdown((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-owly-border hover:bg-gray-50 rounded-lg transition-colors shadow-2xs"
                      title="خيارات الاستيراد والمزامنة"
                    >
                      {importing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-owly-primary" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-gray-500" />
                      )}
                      <span>استيراد ومزامنة</span>
                      <ChevronDown className="h-3 w-3 text-gray-400" />
                    </button>

                    {showImportDropdown && (
                      <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-40 text-xs divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-100">
                        <div className="py-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowImportDropdown(false);
                              setShowMenModal(true);
                            }}
                            className="w-full text-right px-3 py-2 hover:bg-blue-50/70 flex items-start gap-2.5 transition-colors text-gray-700 hover:text-blue-900"
                          >
                            <Building className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-gray-900">سحب من men.gov.ma</div>
                              <div className="text-[10px] text-gray-500">مذكرات وبلاغات الوزارة (أرشيف وصفحات)</div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowImportDropdown(false);
                              setModalTab("batch");
                              setShowUrlModal(true);
                            }}
                            className="w-full text-right px-3 py-2 hover:bg-emerald-50/70 flex items-start gap-2.5 transition-colors text-gray-700 hover:text-emerald-900"
                          >
                            <Globe className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-gray-900">استيراد من taalim.org</div>
                              <div className="text-[10px] text-gray-500">مقالات وبيانات الجامعة (دفعات 100 مقال)</div>
                            </div>
                          </button>
                        </div>
                        <div className="py-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowImportDropdown(false);
                              fileInputRef.current?.click();
                            }}
                            className="w-full text-right px-3 py-2 hover:bg-gray-50 flex items-start gap-2.5 transition-colors text-gray-700"
                          >
                            <FileUp className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-gray-900">رفع ملف (PDF, Text, Markdown)</div>
                              <div className="text-[10px] text-gray-500">استخراج وتحليل النصوص مباشرة</div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowImportDropdown(false);
                              setModalTab("paste");
                              setShowUrlModal(true);
                            }}
                            className="w-full text-right px-3 py-2 hover:bg-emerald-50/70 flex items-start gap-2.5 transition-colors text-gray-700 hover:text-emerald-900"
                          >
                            <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-gray-900">لصق نص (تنظيم بالـ AI)</div>
                              <div className="text-[10px] text-gray-500">توليد العنوان والتنسيق الذكي</div>
                            </div>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                    className="hidden"
                    disabled={importing}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void importFile(file);
                    }}
                  />

                  {/* Primary Action Button */}
                  <button
                    type="button"
                    onClick={() => openEntryModal()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-owly-primary hover:bg-owly-primary-dark rounded-lg shadow-xs transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Entry</span>
                  </button>
                </div>
                {(importError || importSuccess) && (
                  <p className={cn("mt-2 text-xs", importError ? "text-red-600" : "text-owly-success")}>
                    {importError || importSuccess}
                  </p>
                )}
              </div>

              {/* Entries list */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingEntries ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-owly-text-light" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-owly-text-light opacity-40" />
                    <p className="text-sm font-medium text-owly-text-light">
                      No entries in this category
                    </p>
                    <p className="text-xs text-owly-text-light mt-1">
                      Add knowledge entries that the AI can use when responding to customers.
                    </p>
                    <button
                      onClick={() => openEntryModal()}
                      className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-owly-primary border border-owly-primary/30 hover:bg-owly-primary-50 rounded-lg transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add First Entry
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {entries.map((entry) => {
                      const priority = getPriority(entry.priority);
                      const PriorityIcon = priority.icon;
                      const contentPreview = entry.content
                        ? entry.content.split("\n")[0].slice(0, 120)
                        : "";

                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            "bg-owly-surface rounded-xl border border-owly-border p-4 transition-all hover:shadow-sm",
                            !entry.isActive && "opacity-60"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-medium text-owly-text">
                                  {entry.title}
                                </h4>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                                    priority.className
                                  )}
                                >
                                  <PriorityIcon className="h-3 w-3" />
                                  {priority.label}
                                </span>
                                {!entry.isActive && (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                    Inactive
                                  </span>
                                )}
                              </div>
                              {contentPreview && (
                                <p className="text-xs text-owly-text-light mt-1 truncate">
                                  {contentPreview}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-owly-text-light flex-wrap">
                                {entry.createdAt && (
                                  <span className="inline-flex items-center gap-1 text-gray-500">
                                    <span>📅 أضيف في:</span>
                                    <span className="font-medium text-gray-700">
                                      {new Date(entry.createdAt).toLocaleDateString("fr-FR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </span>
                                )}
                                {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
                                  <span className="text-gray-400">
                                    (تعديل: {new Date(entry.updatedAt).toLocaleDateString("fr-FR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                    })})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => toggleEntryActive(entry)}
                                className={cn(
                                  "p-1.5 rounded transition-colors",
                                  entry.isActive
                                    ? "text-owly-primary hover:bg-owly-primary-50"
                                    : "text-owly-text-light hover:bg-gray-100"
                                )}
                                title={entry.isActive ? "Deactivate" : "Activate"}
                              >
                                {entry.isActive ? (
                                  <ToggleRight className="h-4 w-4" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={() => openEntryModal(entry)}
                                className="p-1.5 text-owly-text-light hover:text-owly-primary hover:bg-owly-primary-50 rounded transition-colors"
                                title="Edit entry"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteTarget({ type: "entry", id: entry.id, name: entry.title })
                                }
                                className="p-1.5 text-owly-text-light hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Bar */}
                  {entriesTotalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-owly-surface border border-owly-border rounded-xl mt-4 flex-wrap gap-3">
                      <div className="text-xs text-owly-text-light">
                        عرض <span className="font-semibold text-owly-text">{(entriesPage - 1) * entriesLimit + 1}</span> إلى{" "}
                        <span className="font-semibold text-owly-text">
                          {Math.min(entriesPage * entriesLimit, entriesTotal)}
                        </span>{" "}
                        من أصل <span className="font-semibold text-owly-text">{entriesTotal}</span> مقال
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const newPage = entriesPage - 1;
                            setEntriesPage(newPage);
                            if (selectedCategoryId) fetchEntries(selectedCategoryId, newPage, entriesLimit);
                          }}
                          disabled={entriesPage <= 1 || loadingEntries}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-owly-border hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                          السابق
                        </button>

                        <div className="flex items-center gap-1">
                          {Array.from({ length: entriesTotalPages }, (_, i) => i + 1)
                            .filter((p) => p === 1 || p === entriesTotalPages || Math.abs(p - entriesPage) <= 2)
                            .map((p, idx, arr) => {
                              const prev = arr[idx - 1];
                              return (
                                <div key={p} className="flex items-center">
                                  {prev && p - prev > 1 && (
                                    <span className="px-1 text-xs text-gray-400">...</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEntriesPage(p);
                                      if (selectedCategoryId) fetchEntries(selectedCategoryId, p, entriesLimit);
                                    }}
                                    disabled={loadingEntries}
                                    className={cn(
                                      "min-w-[32px] h-8 px-2 text-xs font-semibold rounded-lg transition-all",
                                      entriesPage === p
                                        ? "bg-owly-primary text-white shadow-xs"
                                        : "text-owly-text hover:bg-gray-100 border border-transparent"
                                    )}
                                  >
                                    {p}
                                  </button>
                                </div>
                              );
                            })}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const newPage = entriesPage + 1;
                            setEntriesPage(newPage);
                            if (selectedCategoryId) fetchEntries(selectedCategoryId, newPage, entriesLimit);
                          }}
                          disabled={entriesPage >= entriesTotalPages || loadingEntries}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-owly-border hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                        >
                          التالي
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            </>
          )}
        </div>
      </div>

      {/* ================= CATEGORY MODAL ================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCategoryModal(false)}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-owly-border">
              <h3 className="font-semibold text-owly-text">
                {editingCategory ? "Edit Category" : "New Category"}
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="p-1 text-owly-text-light hover:text-owly-text rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="e.g. Product FAQ, Returns Policy"
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, description: e.target.value })
                  }
                  placeholder="Brief description of this category"
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {colorPresets.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoryForm({ ...categoryForm, color: c })}
                      className={cn(
                        "w-7 h-7 rounded-full transition-all",
                        categoryForm.color === c
                          ? "ring-2 ring-offset-2 ring-owly-primary scale-110"
                          : "hover:scale-110"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={categoryForm.color}
                    onChange={(e) =>
                      setCategoryForm({ ...categoryForm, color: e.target.value })
                    }
                    className="w-7 h-7 rounded cursor-pointer border border-owly-border"
                    title="Custom color"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-owly-border">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 text-sm font-medium text-owly-text-light hover:text-owly-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCategory}
                disabled={!categoryForm.name.trim() || savingCategory}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-owly-primary hover:bg-owly-primary-dark disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {savingCategory && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingCategory ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ENTRY MODAL ================= */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowEntryModal(false)}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-owly-border">
              <h3 className="font-semibold text-owly-text">
                {editingEntry ? "Edit Entry" : "New Entry"}
              </h3>
              <button
                onClick={() => setShowEntryModal(false)}
                className="p-1 text-owly-text-light hover:text-owly-text rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Category / القسم
                </label>
                <select
                  value={selectedCategoryId || ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Title / السؤال
                </label>
                <input
                  type="text"
                  value={entryForm.title}
                  onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
                  placeholder="e.g. How to reset password"
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Content
                </label>
                <textarea
                  value={entryForm.content}
                  onChange={(e) => setEntryForm({ ...entryForm, content: e.target.value })}
                  placeholder="Write the knowledge content that the AI will use when responding to customers..."
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Priority
                </label>
                <div className="flex items-center gap-2">
                  {PRIORITIES.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.value}
                        onClick={() => setEntryForm({ ...entryForm, priority: p.value })}
                        className={cn(
                          "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          entryForm.priority === p.value
                            ? cn(p.className, "border-current ring-1 ring-current/20")
                            : "border-owly-border text-owly-text-light hover:border-owly-primary/30"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-owly-border">
              <button
                onClick={() => setShowEntryModal(false)}
                className="px-4 py-2 text-sm font-medium text-owly-text-light hover:text-owly-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEntry}
                disabled={!entryForm.title.trim() || savingEntry}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-owly-primary hover:bg-owly-primary-dark disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {savingEntry && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingEntry ? "Save Changes" : "Create Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= DELETE CONFIRMATION ================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-sm mx-4">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-full bg-red-50">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="font-semibold text-owly-text">
                  Delete {deleteTarget.type === "category" ? "Category" : "Entry"}
                </h3>
              </div>
              <p className="text-sm text-owly-text-light">
                Are you sure you want to delete{" "}
                <span className="font-medium text-owly-text">{deleteTarget.name}</span>?
                {deleteTarget.type === "category" &&
                  " This will also delete all entries in this category."}
                {" "}This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-owly-border">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-owly-text-light hover:text-owly-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL & Feed Import Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!syncingFeed && !importingUrl) setShowUrlModal(false);
            }}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-owly-border">
              <h2 className="text-lg font-semibold text-owly-text">استيراد المقالات من موقع taalim.org</h2>
              <button
                onClick={() => setShowUrlModal(false)}
                disabled={syncingFeed || importingUrl}
                className="p-2 -mr-2 text-owly-text-light hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-owly-border bg-gray-50/70 px-6 pt-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setModalTab("batch")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap",
                  modalTab === "batch"
                    ? "border-owly-primary text-owly-primary bg-white rounded-t-lg font-bold"
                    : "border-transparent text-owly-text-light hover:text-owly-text"
                )}
              >
                📚 استيراد الأرشيف (100 مقال / دفعة)
              </button>
              <button
                type="button"
                onClick={() => setModalTab("feed")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap",
                  modalTab === "feed"
                    ? "border-owly-primary text-owly-primary bg-white rounded-t-lg font-bold"
                    : "border-transparent text-owly-text-light hover:text-owly-text"
                )}
              >
                ⚡ آخر المستجدات السريعة (RSS)
              </button>
              <button
                type="button"
                onClick={() => setModalTab("single")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap",
                  modalTab === "single"
                    ? "border-owly-primary text-owly-primary bg-white rounded-t-lg font-bold"
                    : "border-transparent text-owly-text-light hover:text-owly-text"
                )}
              >
                🔗 رابط مباشر لمقال واحد
              </button>
              <button
                type="button"
                onClick={() => setModalTab("paste")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap",
                  modalTab === "paste"
                    ? "border-owly-primary text-owly-primary bg-white rounded-t-lg font-bold"
                    : "border-transparent text-owly-text-light hover:text-owly-text"
                )}
              >
                📝 لصق نص (الذكاء الاصطناعي)
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {modalTab === "batch" ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                      <span>🏷️ الفئات المستهدفة للاستيراد من موقع taalim.org :</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="bg-white px-2.5 py-1 rounded-md border border-emerald-300 font-medium shadow-xs">
                        📜 بيانات وبلاغات (2,375 مقال)
                      </span>
                      <span className="bg-white px-2.5 py-1 rounded-md border border-emerald-300 font-medium shadow-xs">
                        🏛️ المكتب الوطني (314 مقال)
                      </span>
                      <span className="bg-white px-2.5 py-1 rounded-md border border-emerald-300 font-medium shadow-xs">
                        📰 مستجدات وأخبار (260 مقال)
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-owly-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-owly-text">
                        رقم الدفعة الحالية (100 مقال لكل دفعة):
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">صفحة:</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={batchPage}
                          onChange={(e) => setBatchPage(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 px-2.5 py-1 text-sm font-bold border border-owly-border rounded-lg text-center bg-white"
                        />
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-200 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-blue-700 font-medium">
                        <span>🛡️ حماية تامة ضد التكرار وإعادة الاستيراد:</span>
                      </div>
                      <p className="text-gray-500 leading-relaxed">
                        • يتجاهل تلقائياً أي مقال تم استيراده سابقاً لتجنب التكرار.
                      </p>
                      <p className="text-gray-500 leading-relaxed">
                        • <strong>إذا قمت بحذف أي مقال تريده، فلن يعاد استيراده أبداً</strong> حتى لو قمت باستيراد هذه الدفعة مجدداً.
                      </p>
                    </div>

                    {batchStats && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1">
                        <p className="font-bold">📊 نتيجة الدفعة السابقة (صفحة {batchStats.page}):</p>
                        <p>• تم استيراد <strong>{batchStats.imported}</strong> مقال جديد بنجاح.</p>
                        <p>• تم تجاوز <strong>{batchStats.skipped}</strong> مقال (موجود مسبقاً أو قمت بحذفه).</p>
                        {batchStats.hasMore && (
                          <p className="text-emerald-700 font-semibold pt-1">
                            ➡️ الدفعة التالية جاهزة (الدفعة {batchStats.nextPage}). اضغط الزر لمتابعة الاستيراد.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : modalTab === "feed" ? (
                <form id="feed-form" onSubmit={syncFeed} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-owly-text mb-1">
                      اختر القسم من موقع taalim.org:
                    </label>
                    <select
                      value={feedType}
                      onChange={(e) => setFeedType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-owly-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-owly-primary/50 text-sm font-medium"
                    >
                      <option value="bayanat">📜 بيانات وبلاغات (الأحدث والأهم)</option>
                      <option value="infos">📰 مستجدات وأخبار التعليم</option>
                      <option value="all">🌐 كل المقالات الحديثة في الموقع</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-owly-text mb-1">
                      عدد المقالات المراد استيرادها دفعة واحدة:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[5, 10, 20].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setFeedLimit(num)}
                          className={cn(
                            "py-2 text-xs font-semibold rounded-lg border transition-all",
                            feedLimit === num
                              ? "bg-owly-primary text-white border-owly-primary shadow-sm"
                              : "bg-white text-owly-text border-owly-border hover:bg-gray-50"
                          )}
                        >
                          {num} مقالات
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-1">
                    <p className="font-semibold">✨ كيف يعمل الاستيراد التلقائي؟</p>
                    <p>• يقوم بجلب آخر المقالات فوراً وبشكل آلي دون الحاجة لنسخ الروابط.</p>
                    <p>• يستخرج لكل مقال عنوانه الواضح ونصه الكامل النظيف.</p>
                    <p>• يتجاهل تلقائياً أي مقال تم استيراده سابقاً لتفادي التكرار.</p>
                  </div>
                </form>
              ) : modalTab === "single" ? (
                <form id="url-form" onSubmit={importFromUrl} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-owly-text mb-1">
                      رابط المقال المباشر (URL):
                    </label>
                    <input
                      type="url"
                      required
                      value={urlForm}
                      onChange={(e) => setUrlForm(e.target.value)}
                      className="w-full px-4 py-2 border border-owly-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-owly-primary/50 text-sm"
                      placeholder="https://taalim.org/2026/08/..."
                    />
                    <p className="mt-2 text-xs text-owly-text-light">
                      الصق رابط مقال أو بيان محدد لاستخراج نصه وحفظه في هذه الفئة.
                    </p>
                  </div>
                </form>
              ) : (
                <form id="paste-form" onSubmit={importFromText} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-owly-text mb-1">
                      الصق النص هنا:
                    </label>
                    <textarea
                      required
                      rows={10}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      className="w-full px-4 py-2 border border-owly-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-owly-primary/50 text-sm resize-y"
                      placeholder="قم بلصق نص المقال أو البيان هنا، وسيقوم الذكاء الاصطناعي باستخراج العنوان وتنسيق المحتوى وتصنيفه تلقائياً..."
                    />
                  </div>
                </form>
              )}
            </div>

            <div className="px-6 py-4 border-t border-owly-border bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowUrlModal(false)}
                disabled={syncingFeed || importingUrl || importingBatch}
                className="px-4 py-2 text-sm font-medium text-owly-text-light hover:text-owly-text transition-colors"
              >
                إلغاء
              </button>

              {modalTab === "batch" ? (
                <button
                  type="button"
                  onClick={() => importBatch()}
                  disabled={importingBatch}
                  className="inline-flex items-center px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                >
                  {importingBatch && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {importingBatch ? "جارٍ استيراد ومعالجة 100 مقال..." : `📥 استيراد الدفعة ${batchPage} (100 مقال)`}
                </button>
              ) : modalTab === "feed" ? (
                <button
                  type="submit"
                  form="feed-form"
                  disabled={syncingFeed}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-owly-primary hover:bg-owly-primary-dark disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                >
                  {syncingFeed && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {syncingFeed ? "جارٍ الاستيراد والمعالجة..." : `بدء استيراد ${feedLimit} مقالات`}
                </button>
              ) : modalTab === "single" ? (
                <button
                  type="submit"
                  form="url-form"
                  disabled={importingUrl}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-owly-primary hover:bg-owly-primary-dark disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                >
                  {importingUrl && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {importingUrl ? "جارٍ الاستيراد..." : "استيراد المقال"}
                </button>
              ) : (
                <button
                  type="submit"
                  form="paste-form"
                  disabled={importingText}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-owly-primary hover:bg-owly-primary-dark disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                >
                  {importingText && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {importingText ? "جارٍ المعالجة بالذكاء الاصطناعي..." : "تحليل وحفظ النص"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MEN (Ministry) Import Modal */}
      {showMenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!syncingMen) setShowMenModal(false);
            }}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-owly-border bg-blue-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  🏛️
                </div>
                <div>
                  <h2 className="text-base font-semibold text-owly-text">استيراد مستجدات وزارة التربية الوطنية</h2>
                  <p className="text-xs text-owly-text-light">بوابة الوزارة الرسمية: men.gov.ma</p>
                </div>
              </div>
              <button
                onClick={() => setShowMenModal(false)}
                disabled={syncingMen}
                className="p-2 -mr-2 text-owly-text-light hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={syncMen} className="p-6 space-y-4 overflow-y-auto">
              {/* Stats overview banner */}
              {menStats && (
                <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">المقالات المفعلة الحالية:</span> {menStats.activeEntriesCount}
                  </div>
                  <div>
                    <span className="font-semibold text-red-600">المقالات المستبعدة (المحذوفة):</span> {menStats.deletedCount}
                  </div>
                </div>
              )}

              {/* Mode Selector Tabs */}
              <div className="flex border-b border-owly-border bg-gray-50/80 -mx-6 -mt-4 px-6 pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMenMode("batch")}
                  className={cn(
                    "pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
                    menMode === "batch"
                      ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  )}
                >
                  <span>📦 دفعات وصفحات (الأرشيف)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMenMode("auto")}
                  className={cn(
                    "pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
                    menMode === "auto"
                      ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  )}
                >
                  <span>⚡ أحدث المستجدات فوراً</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMenMode("url")}
                  className={cn(
                    "pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
                    menMode === "url"
                      ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  )}
                >
                  <span>🔗 رابط مباشر</span>
                </button>
              </div>

              {menMode === "batch" ? (
                <div className="bg-gray-50 border border-owly-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-semibold text-owly-text block">
                        رقم الدفعة / الصفحة في موقع الوزارة:
                      </label>
                      <span className="text-[11px] text-gray-500">
                        (يجلب المذكرات والبلاغات السابقة صفحة بصفحة)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMenBatchPage((p) => Math.max(1, p - 1))}
                        className="p-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-600"
                        title="الصفحة السابقة"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={menBatchPage}
                        onChange={(e) => setMenBatchPage(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 px-2 py-1 text-sm font-bold border border-owly-border rounded-lg text-center bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setMenBatchPage((p) => p + 1)}
                        className="p-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-600"
                        title="الصفحة التالية"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-200 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
                      <span>🛡️ حماية تامة وتصفية ذكية:</span>
                    </div>
                    <p className="text-gray-500 leading-relaxed">
                      • يتجاهل تلقائياً أي مقال تم استيراده مسبقاً لتفادي التكرار.
                    </p>
                    <p className="text-gray-500 leading-relaxed">
                      • <strong>إذا حذفت أي مقال، فلن يعاد استيراده أبداً</strong> حتى لو فحصت هذه الدفعة مجدداً.
                    </p>
                    <p className="text-gray-500 leading-relaxed">
                      • يستبعد تلقائياً أنشطة التلاميذ والبطولات والبروتوكول ويركز على مذكرات وحركات ومسار الأساتذة.
                    </p>
                  </div>

                  {menBatchStats && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1">
                      <p className="font-bold">📊 نتيجة الدفعة السابقة (صفحة {menBatchStats.page}):</p>
                      <p>• تم استيراد <strong>{menBatchStats.imported}</strong> مذكرة/مستجد جديد بنجاح.</p>
                      <p>• تم تجاوز <strong>{menBatchStats.skippedExisting}</strong> مستجد (موجود مسبقاً أو محذوف).</p>
                      {menBatchStats.skippedIrrelevant > 0 && (
                        <p>• تم استبعاد <strong>{menBatchStats.skippedIrrelevant}</strong> مادة غير مخصصة للأطر التعليمية.</p>
                      )}
                      {menBatchStats.hasMore && (
                        <p className="text-emerald-700 font-semibold pt-1">
                          ➡️ الدفعة التالية جاهزة (الدفعة {menBatchStats.nextPage}). اضغط الزر لمتابعة الاستيراد.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : menMode === "auto" ? (
                <div>
                  <label className="block text-xs font-medium text-owly-text mb-1.5">
                    الحد الأقصى للمقالات المراد فحصها وسحبها فوراً:
                  </label>
                  <select
                    value={menLimit}
                    onChange={(e) => setMenLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-owly-border bg-white text-owly-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={10}>أحدث 10 مذكرات وبلاغات</option>
                    <option value={15}>أحدث 15 مذكرة وبلاغ (موصى به)</option>
                    <option value={25}>أحدث 25 مذكرة وبلاغ</option>
                    <option value={50}>أحدث 50 مذكرة وبلاغ</option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    🛡️ <strong>حماية ضد التكرار:</strong> المقالات التي سبق لك حذفها لن يتم سحبها مجدداً أبداً.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-owly-text mb-1.5">
                    رابط الصفحة على موقع الوزارة (URL):
                  </label>
                  <input
                    type="url"
                    placeholder="https://www.men.gov.ma/..."
                    value={menUrl}
                    onChange={(e) => setMenUrl(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-owly-border bg-white text-owly-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    ألصق رابط أي مذكرة، مقرر أو بلاغ منشور على بوابة men.gov.ma ليتم استخراج نصه ومرفقاته فوراً.
                  </p>
                </div>
              )}

              {/* Target Category info */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
                <span className="font-medium text-gray-900">القسم المستهدف في قاعدة المعرفة: </span>
                {selectedCategory ? (
                  <span className="font-semibold text-blue-700">{selectedCategory.name} (القسم المحدد حالياً)</span>
                ) : (
                  <span className="font-semibold text-blue-700">مذكرات وبلاغات وزارة التربية الوطنية (تلقائي)</span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-owly-border">
                <button
                  type="button"
                  onClick={() => setShowMenModal(false)}
                  disabled={syncingMen}
                  className="px-4 py-2 text-xs font-medium text-owly-text-light hover:bg-gray-100 rounded-lg transition-colors"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={syncingMen || (menMode === "url" && !menUrl.trim())}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  {syncingMen ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري استيراد ومعالجة الدفعة {menMode === "batch" ? menBatchPage : ""}...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      {menMode === "batch"
                        ? (menBatchStats ? `متابعة استيراد الدفعة ${menBatchPage}` : `استيراد الدفعة ${menBatchPage} الآن`)
                        : menMode === "auto"
                        ? "بدء السحب التلقائي"
                        : "استيراد الرابط المباشر"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
