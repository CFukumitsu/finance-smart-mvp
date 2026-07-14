"use client";

import { useCallback, useEffect, useState } from "react";
import { MailPlus, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import AppShell from "@/app/components/layout/AppShell";
import { useModalShortcuts } from "@/src/hooks/useModalShortcuts";
import type { AdminUserListItem, UserRole, UserStatus } from "@/src/types/identity";

const roleLabel = (role: UserRole) => role === "admin" ? "Administrador" : role === "manager" ? "Gerente" : "Usuário";
const statusLabel: Record<UserStatus, string> = { invited: "Convite pendente", active: "Ativo", disabled: "Desativado", deleted: "Excluído" };

export default function UsersPageContent() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setMessage({ ok: false, text: body.error ?? "Não foi possível carregar os usuários." });
    else setUsers(body.users ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useModalShortcuts({ enabled: modalOpen, onEscape: () => setModalOpen(false) });

  async function changeRole(userId: string, role: UserRole) {
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
    const body = await response.json().catch(() => ({}));
    setMessage({ ok: response.ok, text: body.message ?? body.error ?? "Não foi possível atualizar o perfil." });
    if (response.ok) await load();
  }

  return <AppShell><div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-blue-300">Administração</p><h1 className="mt-1 text-3xl font-bold">Usuários</h1><p className="mt-2 text-sm text-slate-400">Convide pessoas e gerencie os perfis de acesso.</p></div><button onClick={() => setModalOpen(true)} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500"><MailPlus size={18} /> Convidar usuário</button></header>
    {message && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-red-400/20 bg-red-500/10 text-red-200"}`}>{message.text}</p>}
    <div className="hidden overflow-hidden rounded-2xl border border-white/10 lg:block"><table className="w-full text-left text-sm"><thead className="bg-slate-900 text-slate-300"><tr>{["Nome", "E-mail", "Perfil", "Status", "Convite", "Último acesso", "Provedor", "Ações"].map((value) => <th key={value} className="px-4 py-3 font-semibold">{value}</th>)}</tr></thead><tbody className="divide-y divide-white/5">{users.map((user) => <tr key={user.id} className="bg-slate-950/40"><td className="px-4 py-3 font-medium">{user.fullName || "—"}</td><td className="px-4 py-3 text-slate-300">{user.email}</td><td className="px-4 py-3">{roleLabel(user.role)}</td><td className="px-4 py-3">{statusLabel[user.status]}</td><td className="px-4 py-3 text-slate-400">{formatDate(user.invitedAt)}</td><td className="px-4 py-3 text-slate-400">{formatDate(user.lastSignInAt)}</td><td className="px-4 py-3 text-slate-400">{user.provider}</td><td className="px-4 py-3"><RoleSelect user={user} changeRole={changeRole} /></td></tr>)}</tbody></table></div>
    <div className="grid gap-4 lg:hidden">{users.map((user) => <article key={user.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-blue-500/10 p-2 text-blue-300">{user.role === "admin" ? <ShieldCheck /> : <UserRound />}</div><div className="min-w-0"><h2 className="truncate font-bold">{user.fullName || "Sem nome"}</h2><p className="break-all text-sm text-slate-400">{user.email}</p></div></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><Summary label="Perfil" value={roleLabel(user.role)} /><Summary label="Status" value={statusLabel[user.status]} /><Summary label="Convite" value={formatDate(user.invitedAt)} /><Summary label="Último acesso" value={formatDate(user.lastSignInAt)} /></dl><div className="mt-4"><RoleSelect user={user} changeRole={changeRole} /></div></article>)}</div>
    {loading && <p className="text-sm text-slate-400"><RefreshCw className="mr-2 inline animate-spin" size={16} />Carregando usuários...</p>}
    {!loading && users.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-400">Nenhum usuário encontrado.</p>}
    {modalOpen && <InviteModal close={() => setModalOpen(false)} onSuccess={async (text) => { setModalOpen(false); setMessage({ ok: true, text }); await load(); }} />}
  </div></AppShell>;
}

function RoleSelect({ user, changeRole }: { user: AdminUserListItem; changeRole: (id: string, role: UserRole) => void }) {
  const [resending, setResending] = useState(false);
  async function resend() {
    setResending(true);
    const response = await fetch("/api/admin/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
    const body = await response.json().catch(() => ({}));
    setResending(false);
    alert(body.message ?? body.error ?? "Não foi possível reenviar o convite.");
  }
  return <div className="space-y-2"><select aria-label={`Perfil de ${user.email}`} value={user.role} disabled={user.role === "manager"} onChange={(event) => changeRole(user.id, event.target.value as UserRole)} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm disabled:text-slate-400"><option value="user">Usuário</option><option value="admin">Administrador</option>{user.role === "manager" && <option value="manager">Gerente</option>}</select>{user.status === "invited" && <button type="button" disabled={resending} onClick={resend} className="w-full rounded-lg border border-blue-400/20 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/10 disabled:opacity-50">{resending ? "Reenviando..." : "Reenviar convite"}</button>}</div>;
}
function Summary({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-slate-200">{value}</dd></div>; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"; }

function InviteModal({ close, onSuccess }: { close: () => void; onSuccess: (message: string) => Promise<void> }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<UserRole>("user"); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); if (saving) return; setSaving(true); setError(""); const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, role }) }); const body = await response.json().catch(() => ({})); setSaving(false); if (!response.ok) return setError(body.error ?? "Não foi possível enviar o convite."); await onSuccess(body.message ?? "Convite enviado com sucesso."); }
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form onSubmit={submit} className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Convidar usuário</h2><p className="mt-1 text-sm text-slate-400">O usuário receberá um link para criar o próprio acesso.</p></div><button type="button" onClick={close} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><X /></button></div>{error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}<div className="mt-5 space-y-4"><ModalField label="Nome" value={name} setValue={setName} /><ModalField label="E-mail" value={email} setValue={setEmail} type="email" /><label className="block space-y-2 text-sm font-semibold"><span>Perfil</span><select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3"><option value="user">Usuário</option><option value="admin">Administrador</option></select></label></div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={close} className="rounded-xl border border-white/10 px-5 py-3 font-bold">Cancelar</button><button disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 font-bold disabled:opacity-50">{saving ? "Enviando..." : "Enviar convite"}</button></div></form></div>;
}
function ModalField({ label, value, setValue, type = "text" }: { label: string; value: string; setValue: (value: string) => void; type?: string }) { return <label className="block space-y-2 text-sm font-semibold"><span>{label}</span><input required type={type} value={value} onChange={(event) => setValue(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500" /></label>; }
