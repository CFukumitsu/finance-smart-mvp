"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "Dashboard", icon: "▣", href: "/" },
  { label: "Lançamentos", icon: "▦", href: "/transactions" },
  { label: "Contas e Cartões", icon: "◎", href: "/accounts" },
  { label: "Categorias", icon: "▤", href: "/categories" },
  { label: "Recorrências", icon: "⟳", href: "/recurrences" },
  { label: "Fechamentos", icon: "◫", href: "/closings" },
  { label: "Importar Access", icon: "⇪", href: "/import" },
  { label: "Configurações", icon: "⚙", href: "/settings" },
];

type FinanceSidebarProps = {
  forceExpanded?: boolean;
  onNavigate?: () => void;
};

export default function FinanceSidebar({
  forceExpanded = false,
  onNavigate,
}: FinanceSidebarProps) {
  const pathname = usePathname();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const isExpanded = forceExpanded || isPinned || isHovering;

  return (
    <aside
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`h-screen shrink-0 border-r border-white/10 bg-slate-950/95 px-3 py-5 shadow-2xl shadow-black/30 transition-all duration-300 ${
        isExpanded ? "w-72" : "w-20"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 font-black text-slate-950">
              FS
            </div>

            {isExpanded && (
              <div>
                <p className="font-black leading-5 text-white">Finance Smart</p>
                <p className="text-xs text-slate-500">MVP Access → Supabase</p>
              </div>
            )}
          </div>

          {isExpanded && !forceExpanded && (
            <button
              onClick={() => setIsPinned(!isPinned)}
              title={isPinned ? "Desafixar menu" : "Fixar menu"}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-bold transition ${
                isPinned
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {isPinned ? "📌" : "📍"}
            </button>
          )}
        </div>

        <nav className="space-y-2">
          {menuItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {isExpanded && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          {isExpanded ? (
            <>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Status
              </p>
              <p className="mt-2 text-sm font-bold text-white">Sprint 7</p>
              <p className="mt-1 text-xs text-slate-400">
                Fechamentos mensais.
              </p>
            </>
          ) : (
            <p className="text-center text-xs font-black text-amber-300">S7</p>
          )}
        </div>
      </div>
    </aside>
  );
}