"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import AppShell from "@/app/components/layout/AppShell";
import ProfileAvatar from "@/src/components/auth/ProfileAvatar";
import { useAuth } from "@/src/hooks/useAuth";
import { supabase } from "@/src/lib/supabase";
import type { ProfileTheme, UserProfile } from "@/src/types/identity";
import { getAvatarUrl, getFullName, getProvider, getRoleLabel } from "@/src/utils/identity";

export default function AccountPageContent() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", locale: "pt-BR", timezone: "America/Sao_Paulo", theme: "dark" as ProfileTheme });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data, error }) => {
      if (error || !data) setMessage({ type: "error", text: "O perfil ainda não está disponível. A migration do Release 1.8 precisa ser aplicada." });
      else {
        const value = data as UserProfile;
        setProfile(value);
        setForm({ firstName: value.first_name, lastName: value.last_name ?? "", phone: value.phone ?? "", locale: value.locale, timezone: value.timezone, theme: value.theme });
      }
      setLoading(false);
    });
  }, [authLoading, user]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!form.firstName.trim()) { setMessage({ type: "error", text: "Informe seu nome." }); return; }
    if (!user || saving) return;
    setSaving(true);
    const update = { first_name: form.firstName.trim(), last_name: form.lastName.trim() || null, phone: form.phone.trim() || null, locale: form.locale, timezone: form.timezone, theme: form.theme, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("profiles").update(update).eq("id", user.id).select("*").single();
    setSaving(false);
    if (error) setMessage({ type: "error", text: "Não foi possível salvar suas alterações." });
    else { setProfile(data as UserProfile); setMessage({ type: "success", text: "Perfil atualizado com sucesso." }); }
  }

  const name = getFullName(profile, user);
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <header><p className="text-sm font-semibold text-blue-300">Identidade</p><h1 className="mt-1 text-3xl font-bold">Minha Conta</h1><p className="mt-2 text-sm text-slate-400">Gerencie seus dados pessoais e preferências.</p></header>
        <form onSubmit={save} className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/50 p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ProfileAvatar src={getAvatarUrl(profile, user)} name={name} email={user?.email} size="lg" />
            <div><p className="font-semibold">Foto do perfil</p><p className="mt-1 max-w-lg text-sm text-slate-400">Nesta fase é usada a foto do Google, quando disponível, ou suas iniciais. Upload personalizado depende de um bucket seguro de Storage.</p></div>
          </div>
          {message && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-red-400/20 bg-red-500/10 text-red-200"}`}>{message.text}</p>}
          {loading ? <p className="text-slate-400">Carregando perfil...</p> : <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" required value={form.firstName} onChange={(value) => setForm({ ...form, firstName: value })} />
              <Field label="Sobrenome" value={form.lastName} onChange={(value) => setForm({ ...form, lastName: value })} />
              <Field label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              <ReadOnly label="E-mail" value={user?.email ?? "—"} />
              <ReadOnly label="Perfil" value={getRoleLabel(profile?.role)} />
              <ReadOnly label="Provedor de login" value={getProvider(user)} />
              <Select label="Idioma" value={form.locale} onChange={(value) => setForm({ ...form, locale: value })} options={[['pt-BR','Português (Brasil)']]} />
              <Select label="Fuso horário" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} options={[['America/Sao_Paulo','Brasília (America/Sao_Paulo)']]} />
              <Select label="Tema" value={form.theme} onChange={(value) => setForm({ ...form, theme: value as ProfileTheme })} options={[['dark','Escuro'],['system','Seguir o sistema']]} />
            </div>
            <button type="submit" disabled={saving || !profile} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><Save size={18} />{saving ? "Salvando..." : "Salvar alterações"}</button>
          </>}
        </form>
      </div>
    </AppShell>
  );
}

const inputClass = "w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:text-slate-400";
function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label className="space-y-2 text-sm font-semibold"><span>{label}{required && " *"}</span><input className={inputClass} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <label className="space-y-2 text-sm font-semibold"><span>{label}</span><input className={inputClass} value={value} readOnly disabled /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="space-y-2 text-sm font-semibold"><span>{label}</span><select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
