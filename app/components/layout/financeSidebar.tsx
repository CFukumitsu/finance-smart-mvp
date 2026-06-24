"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  WalletCards,
  Tags,
  Repeat,
  LockKeyhole,
  Upload,
  Settings,
  Landmark,
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Lançamentos", icon: ListChecks, href: "/transactions" },
  { label: "Contas e Cartões", icon: WalletCards, href: "/accounts" },
  { label: "Categorias", icon: Tags, href: "/categories" },
  { label: "Recorrências", icon: Repeat, href: "/recurrences" },
  { label: "Fechamentos", icon: LockKeyhole, href: "/closings" },
  { label: "Conciliação", icon: Landmark, href: "/reconciliation" },
  { label: "Importar Access", icon: Upload, href: "/import" },
  { label: "Configurações", icon: Settings, href: "/settings" },
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
      className={`h-screen shrink-0 border-r border-white/10 bg-slate-950/95 px-3 py-5 shadow-2xl shadow-black/30 transition ${
        isExpanded ? "w-72" : "w-20"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 border border-cyan-500/30
            text-cyan-400 font-black">
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
              const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-cyan-500/10 text-cyan-300"
                    : ":text-slate-400 hover:bg-cyan-500/5 hover:text-cyan-200"
                }`}
              >
                <Icon size={19} strokeWidth={2.3} />
                {isExpanded && <span>{item.label}</span>}
              </Link>
            );
            
          })}
        </nav>
      </div>
    </aside>
  );
}