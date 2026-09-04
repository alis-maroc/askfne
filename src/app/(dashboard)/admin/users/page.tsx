"use client";

import { Header } from "@/components/layout/header";
import {
  Users, Plus, Pencil, Trash2, X, Loader2, Eye, EyeOff,
  Shield, ShieldCheck, ShieldOff,
  ToggleLeft, ToggleRight, Save,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

const MODULES = [
  { id: "conversations",    label: "Conversations",              group: "Core" },
  { id: "messages",         label: "Messages",                   group: "Core" },
  { id: "tickets",          label: "Tickets",                    group: "Core" },
  { id: "customers",        label: "Clients (Customers)",        group: "Core" },
  { id: "knowledge",        label: "Base de connaissances",      group: "Connaissance" },
  { id: "unanswered",       label: "Questions sans réponse",     group: "Connaissance" },
  { id: "forum",            label: "Forum",                      group: "Connaissance" },
  { id: "campaigns",        label: "Campagnes / Bayan",          group: "Communication" },
  { id: "suggestions",      label: "Suggestions & Feedback",     group: "Communication" },
  { id: "admin-requests",   label: "Demandes administratives",   group: "Communication" },
  { id: "analytics",        label: "Analytics",                  group: "Reporting" },
  { id: "activity",         label: "Journal d'activité",         group: "Reporting" },
  { id: "sla",              label: "SLA",                        group: "Config" },
  { id: "automation",       label: "Automation",                 group: "Config" },
  { id: "canned-responses", label: "Réponses prédéfinies",       group: "Config" },
  { id: "business-hours",   label: "Heures de travail",          group: "Config" },
  { id: "flows",            label: "Flows",                      group: "Config" },
  { id: "team",             label: "Équipe (Team)",              group: "Admin" },
  { id: "webhooks",         label: "Webhooks",                   group: "Admin" },
  { id: "channels",         label: "Canaux (WhatsApp/Telegram)", group: "Admin" },
  { id: "whatsapp",         label: "WhatsApp Watch/Setup",       group: "Admin" },
  { id: "ai-test",          label: "Test AI",                    group: "Admin" },
  { id: "settings",         label: "Paramètres",                 group: "Admin" },
  { id: "api-docs",         label: "API / Documentation",        group: "Admin" },
];

type AccessLevel = "none" | "read" | "write";
type ModulePermissions = Record<string, AccessLevel>;
const GROUPS = Array.from(new Set(MODULES.map((m) => m.group)));

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  permissions: ModulePermissions | null;
  createdAt: string;
}

interface UserFormData {
  name: string;
  username: string;
  password: string;
  role: string;
  isActive: boolean;
  permissions: ModulePermissions;
}

const ROLES = ["admin", "supervisor", "agent", "viewer"] as const;

const mkPerm = (write: string[], read: string[]): ModulePermissions =>
  Object.fromEntries(MODULES.map((m) => [
    m.id,
    write.includes(m.id) ? "write" : read.includes(m.id) ? "read" : "none"
  ])) as ModulePermissions;

const ROLE_DEFAULTS: Record<string, ModulePermissions> = {
  admin: Object.fromEntries(MODULES.map((m) => [m.id, "write"])) as ModulePermissions,
  supervisor: mkPerm(
    ["conversations","messages","tickets","customers","knowledge","unanswered","forum","suggestions","admin-requests","analytics","activity","sla","automation","canned-responses"],
    ["campaigns","business-hours","flows","team","webhooks","channels","whatsapp","ai-test"]
  ),
  agent: mkPerm(
    [],
    ["conversations","messages","tickets","customers","knowledge","suggestions","admin-requests"]
  ),
  viewer: mkPerm([], ["conversations","analytics"]),
};

function badgeForRole(role: string) {
  const styles: Record<string, string> = {
    admin: "bg-violet-100 text-violet-700 border border-violet-200",
    supervisor: "bg-blue-100 text-blue-700 border border-blue-200",
    agent: "bg-green-100 text-green-700 border border-green-200",
    viewer: "bg-gray-100 text-gray-500 border border-gray-200",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize", styles[role] || styles.viewer)}>
      {role}
    </span>
  );
}

function PermissionRow({ module, value, onChange }: { module: typeof MODULES[0]; value: AccessLevel; onChange: (v: AccessLevel) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50">
      <span className="text-sm text-gray-700 flex-1">{module.label}</span>
      <div className="flex items-center gap-1">
        {(["none", "read", "write"] as AccessLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-md border transition-all font-medium",
              value === level
                ? level === "write" ? "bg-green-500 border-green-500 text-white"
                  : level === "read" ? "bg-blue-500 border-blue-500 text-white"
                  : "bg-gray-400 border-gray-400 text-white"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
            )}
          >
            {level === "none" ? "—" : level === "read" ? "Lecture" : "Écriture"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<UserFormData>({
    name: "", username: "", password: "", role: "agent",
    isActive: true, permissions: ROLE_DEFAULTS["agent"] as ModulePermissions,
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users?limit=100");
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.data || []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setEditingUser(null);
    setForm({ name: "", username: "", password: "", role: "agent", isActive: true, permissions: ROLE_DEFAULTS["agent"] });
    setError(""); setShowPassword(false); setShowModal(true);
  }

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setForm({ name: user.name, username: user.username, password: "", role: user.role, isActive: user.isActive,
      permissions: user.permissions || ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS["agent"] });
    setError(""); setShowPassword(false); setShowModal(true);
  }

  function onRoleChange(newRole: string) {
    setForm((f) => ({ ...f, role: newRole, permissions: ROLE_DEFAULTS[newRole] || ROLE_DEFAULTS["agent"] }));
  }

  function setModuleAccess(moduleId: string, level: AccessLevel) {
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [moduleId]: level } }));
  }

  function setGroupAccess(group: string, level: AccessLevel) {
    const ids = MODULES.filter((m) => m.group === group).map((m) => m.id);
    setForm((f) => { const p = { ...f.permissions }; for (const id of ids) p[id] = level; return { ...f, permissions: p }; });
  }

  async function save() {
    if (!form.name.trim() || !form.username.trim()) { setError("Nom et identifiant requis"); return; }
    if (!editingUser && form.password.length < 6) { setError("Mot de passe: 6 caractères minimum"); return; }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { name: form.name.trim(), username: form.username.trim(),
        role: form.role, isActive: form.isActive, permissions: form.permissions };
      if (form.password) body.password = form.password;
      const res = await fetch(editingUser ? `/api/admin/users/${editingUser.id}` : "/api/admin/users",
        { method: editingUser ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Erreur inconnue"); return; }
      setShowModal(false); fetchUsers();
    } catch { setError("Erreur réseau"); }
    finally { setSaving(false); }
  }

  async function toggleActive(user: AdminUser) {
    await fetch(`/api/admin/users/${user.id}`, { method: "PATCH",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !user.isActive }) });
    fetchUsers();
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null); setDeleting(false); fetchUsers();
  }

  const stats = {
    total: users.length, active: users.filter(u => u.isActive).length,
    admins: users.filter(u => u.role === "admin").length,
    supervisors: users.filter(u => u.role === "supervisor").length,
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Gestion des Utilisateurs" description="Créez des comptes et définissez les accès par module" />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["Total", stats.total, "text-gray-800"], ["Actifs", stats.active, "text-green-600"],
            ["Admins", stats.admins, "text-violet-600"], ["Superviseurs", stats.supervisors, "text-blue-600"]].map(([l, v, c]) => (
            <div key={String(l)} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{l}</p>
              <p className={cn("text-2xl font-bold", String(c))}>{v}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-400" />
              <h3 className="font-semibold text-gray-800">Utilisateurs ({users.length})</h3>
            </div>
            <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors">
              <Plus className="h-3.5 w-3.5" /> Nouveau compte
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Nom","Identifiant","Rôle","Modules","Statut","Actions"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-3 text-xs font-medium text-gray-500 uppercase", i === 0 ? "pl-5 text-left" : i === 5 ? "pr-5 text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((user) => {
                  const perms = user.permissions || ROLE_DEFAULTS[user.role] || {};
                  const wc = Object.values(perms).filter(v => v === "write").length;
                  const rc = Object.values(perms).filter(v => v === "read").length;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="pl-5 pr-4 py-3 font-medium text-gray-800">{user.name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{user.username}</td>
                      <td className="px-4 py-3">{badgeForRole(user.role)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-xs">
                          {wc > 0 && <span className="text-green-600 font-medium flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{wc} écriture</span>}
                          {rc > 0 && <span className="text-blue-500 flex items-center gap-1"><Shield className="h-3 w-3" />{rc} lecture</span>}
                          {wc === 0 && rc === 0 && <span className="text-gray-400 flex items-center gap-1"><ShieldOff className="h-3 w-3" />Aucun</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(user)} className="flex items-center gap-1">
                          {user.isActive ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                          <span className={cn("text-xs", user.isActive ? "text-green-600" : "text-gray-400")}>{user.isActive ? "Actif" : "Inactif"}</span>
                        </button>
                      </td>
                      <td className="px-4 pr-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(user)} className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setDeleteTarget(user)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">Aucun utilisateur trouvé.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CREATE/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-500" />
                {editingUser ? "Modifier l'utilisateur" : "Créer un utilisateur"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Nom complet</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="Ahmed Benali" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Identifiant (login)</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="ahmed.benali" value={form.username} disabled={!!editingUser}
                    onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, "") }))} />
                </div>
                <div className="relative">
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">
                    Mot de passe {editingUser && <span className="text-gray-400 font-normal">(vide = inchangé)</span>}
                  </label>
                  <input type={showPassword ? "text" : "password"} className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="••••••••" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-[2.1rem] text-gray-400">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Rôle de base</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    value={form.role} onChange={(e) => onRoleChange(e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">Les accès ci-dessous peuvent être personnalisés</p>
                </div>
              </div>

              {/* Per-module permissions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Accès par module</h3>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-400 inline-block"/>Aucun</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500 inline-block"/>Lecture</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500 inline-block"/>Écriture</span>
                  </div>
                </div>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {GROUPS.map(group => {
                    const groupMods = MODULES.filter(m => m.group === group);
                    return (
                      <div key={group} className="border border-gray-100 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-100">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{group}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setGroupAccess(group, "none")} className="px-2 py-0.5 text-[11px] rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 transition-colors">Aucun</button>
                            <button onClick={() => setGroupAccess(group, "read")} className="px-2 py-0.5 text-[11px] rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">Tout lecture</button>
                            <button onClick={() => setGroupAccess(group, "write")} className="px-2 py-0.5 text-[11px] rounded border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 transition-colors">Tout écriture</button>
                          </div>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {groupMods.map(mod => (
                            <PermissionRow key={mod.id} module={mod}
                              value={(form.permissions[mod.id] as AccessLevel) || "none"}
                              onChange={(v) => setModuleAccess(mod.id, v)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Compte:</span>
                <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} className="flex items-center gap-1">
                  {form.isActive ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                  <span className={cn("text-xs font-medium", form.isActive ? "text-green-600" : "text-gray-400")}>
                    {form.isActive ? "Actif" : "Inactif"}
                  </span>
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Annuler</button>
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingUser ? "Sauvegarder" : "Créer le compte"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg"><Trash2 className="h-5 w-5 text-red-500" /></div>
              <div>
                <h3 className="font-semibold text-gray-800">Supprimer le compte ?</h3>
                <p className="text-sm text-gray-500">{deleteTarget.name} ({deleteTarget.username})</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Annuler</button>
              <button onClick={deleteUser} disabled={deleting} className="flex-1 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
