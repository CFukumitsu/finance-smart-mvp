"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import AppShell from "@/app/components/layout/AppShell";
import { useAuth } from "@/src/hooks/useAuth";
import { updatePassword } from "@/src/services/authService";
import { getProvider } from "@/src/utils/identity";

export default function SecurityPageContent() {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage(null);
    if (password.length < 8) return setMessage({ ok: false, text: "A nova senha deve ter pelo menos 8 caracteres." });
    if (password !== confirmation) return setMessage({ ok: false, text: "A confirmação não corresponde à nova senha." });
    if (saving) return; setSaving(true);
    const { error } = await updatePassword(password); setSaving(false);
    if (error) return setMessage({ ok: false, text: "Não foi possível alterar a senha. Verifique a política configurada e tente novamente." });
    setPassword(""); setConfirmation(""); setMessage({ ok: true, text: "Senha alterada com sucesso. Sua sessão foi mantida." });
  }

  return <AppShell><div className="mx-auto max-w-4xl space-y-6">
    <header><p className="text-sm font-semibold text-blue-300">Conta</p><h1 className="mt-1 text-3xl font-bold">Segurança</h1><p className="mt-2 text-sm text-slate-400">Atualize sua senha e consulte os dados de autenticação.</p></header>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-white/10 bg-slate-900/50 p-5 sm:p-7">
        <div className="flex items-center gap-3"><KeyRound className="text-blue-300" /><div><h2 className="font-bold">Trocar senha</h2><p className="text-sm text-slate-400">Use no mínimo 8 caracteres.</p></div></div>
        {message && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-red-400/20 bg-red-500/10 text-red-200"}`}>{message.text}</p>}
        <PasswordField label="Nova senha" value={password} visible={visible} setValue={setPassword} toggle={() => setVisible(!visible)} />
        <PasswordField label="Confirmar nova senha" value={confirmation} visible={visible} setValue={setConfirmation} toggle={() => setVisible(!visible)} />
        <button disabled={saving} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500 disabled:opacity-50">{saving ? "Alterando..." : "Alterar senha"}</button>
      </form>
      <aside className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/50 p-5 sm:p-7"><h2 className="font-bold">Acesso atual</h2><Info label="E-mail" value={user?.email ?? "—"} /><Info label="Provedor" value={getProvider(user)} /><Info label="Último acesso" value={user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("pt-BR") : "Não disponível"} /><div className="border-t border-white/10 pt-4"><p className="text-sm font-semibold">MFA, sessões e dispositivos</p><p className="mt-1 text-xs text-slate-500">Em breve</p></div></aside>
    </div>
  </div></AppShell>;
}

function PasswordField({ label, value, visible, setValue, toggle }: { label: string; value: string; visible: boolean; setValue: (value: string) => void; toggle: () => void }) { return <label className="block space-y-2 text-sm font-semibold"><span>{label}</span><span className="relative block"><input type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={(event) => setValue(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 outline-none focus:border-blue-500" /><button type="button" onClick={toggle} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm text-slate-200">{value}</p></div>; }

