"use client";

import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/src/hooks/useAuth";
import { signOut } from "@/src/services/authService";

export default function UserMenu() {
  const router = useRouter();
  const { user, loading } = useAuth();

  async function handleLogout() {
    const { error } = await signOut();

    if (error) {
      alert("Erro ao sair.");
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600/20 text-blue-300">
        <User size={18} />
      </div>

      <div className="hidden min-w-0 md:block">
        <p className="truncate text-sm font-semibold text-white">
          {user?.email ?? "Usuário"}
        </p>
        <p className="text-xs text-slate-500">Finance Smart</p>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        title="Sair"
        className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-300"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}