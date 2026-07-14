"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, ShieldCheck, UserRound, Users } from "lucide-react";
import { useAuth } from "@/src/hooks/useAuth";
import { supabase } from "@/src/lib/supabase";
import { signOut } from "@/src/services/authService";
import type { UserProfile } from "@/src/types/identity";
import { getAvatarUrl, getFullName, getRoleLabel } from "@/src/utils/identity";
import ProfileAvatar from "./ProfileAvatar";

export default function UserMenu() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data as UserProfile | null));
  }, [user]);

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);

  async function handleLogout() {
    setOpen(false);
    const { error } = await signOut();
    if (error) return;
    router.replace("/login");
    router.refresh();
  }

  if (loading) return <div className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400">Carregando...</div>;
  const name = getFullName(profile, user) || "Usuário";
  const avatar = getAvatarUrl(profile, user);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)} className="flex max-w-[calc(100vw-5.5rem)] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-2.5 py-2 text-left hover:bg-white/5 sm:max-w-xs sm:gap-3 sm:px-3">
        <ProfileAvatar src={avatar} name={name} email={user?.email} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{name}</span>
          <span className="block truncate text-xs text-slate-400">{getRoleLabel(profile?.role)}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-[70] mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-2xl shadow-black/50">
          <MenuLink href="/account" icon={UserRound} label="Minha Conta" close={() => setOpen(false)} />
          <MenuLink href="/account/security" icon={ShieldCheck} label="Segurança" close={() => setOpen(false)} />
          {profile?.role === "admin" && <MenuLink href="/admin/users" icon={Users} label="Usuários" close={() => setOpen(false)} />}
          <div className="my-1 border-t border-white/10" />
          <button type="button" role="menuitem" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/10"><LogOut size={17} /> Sair</button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label, close }: { href: string; icon: typeof UserRound; label: string; close: () => void }) {
  return <Link role="menuitem" href={href} onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5"><Icon size={17} /> {label}</Link>;
}
