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
  Landmark,
  Fuel,
  ChevronDown,
  Gauge,
  Car,
  MapPin,
  ChartNoAxesCombined,
} from "lucide-react";

const menuItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/",
  },
  {
    label: "Análises",
    icon: ChartNoAxesCombined,
    href: "/analytics",
  },
  {
    label: "Lançamentos",
    icon: ListChecks,
    href: "/transactions",
  },
  {
    label: "Contas e Cartões",
    icon: WalletCards,
    href: "/accounts",
  },
  {
    label: "Categorias",
    icon: Tags,
    href: "/categories",
  },
  {
    label: "Recorrências",
    icon: Repeat,
    href: "/recurrences",
  },
  {
    label: "Fechamentos",
    icon: LockKeyhole,
    href: "/closings",
  },
  {
    label: "Conciliação",
    icon: Landmark,
    href: "/reconciliation",
  },
];

const fuelMenuItems = [
  {
    label: "Visão geral",
    icon: LayoutDashboard,
    href: "/fuel",
  },
  {
    label: "Abastecimentos",
    icon: Gauge,
    href: "/fuel/records",
  },
  {
    label: "Veículos",
    icon: Car,
    href: "/vehicles",
  },
  {
    label: "Postos",
    icon: MapPin,
    href: "/fuel/stations",
  },
  {
    label: "Indicadores",
    icon: ChartNoAxesCombined,
    href: "/fuel/analytics",
  },
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
  const [isFuelMenuOpen, setIsFuelMenuOpen] = useState(false);

  const isExpanded = forceExpanded || isPinned || isHovering;

  const isFuelRoute =
    pathname === "/fuel" ||
    pathname.startsWith("/fuel/") ||
    pathname.startsWith("/vehicles");
  const isFuelMenuExpanded = isFuelRoute || isFuelMenuOpen;

  function handleFuelMenuClick() {
    if (!isExpanded) {
      setIsHovering(true);
      setIsFuelMenuOpen(true);
      return;
    }

    setIsFuelMenuOpen((current) => !current);
  }

  return (
    <aside
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`h-screen shrink-0 border-r border-white/10 bg-slate-950/95 px-3 py-4 shadow-2xl shadow-black/30 transition-all duration-200 ${
        isExpanded ? "w-72" : "w-20"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
              <img
                src="/logo-fkt.png"
                alt="FKT"
                className="h-12 w-12 rounded-full object-cover shadow-lg shadow-red-500/20"
              />
            </div>

            {isExpanded && (
              <div className="min-w-0">
                <p className="truncate font-black leading-5 text-white">
                  Finance Smart
                </p>

                <p className="truncate text-xs text-slate-500">
                  Powered by FKT Systems
                </p>
              </div>
            )}
          </div>

          {isExpanded && !forceExpanded && (
            <button
              type="button"
              onClick={() => setIsPinned((current) => !current)}
              title={isPinned ? "Desafixar menu" : "Fixar menu"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition ${
                isPinned
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {isPinned ? "📌" : "📍"}
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-visible">
          {menuItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                title={!isExpanded ? item.label : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-cyan-500/10 text-cyan-300"
                    : "text-slate-400 hover:bg-cyan-500/5 hover:text-cyan-200"
                }`}
              >
                <Icon
                  size={19}
                  strokeWidth={2.3}
                  className="shrink-0"
                />

                {isExpanded && (
                  <span className="truncate">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="pt-1">
            <button
              type="button"
              onClick={handleFuelMenuClick}
              title={!isExpanded ? "Gestão de Combustível" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${
                isFuelRoute
                  ? "bg-amber-500/10 text-amber-300"
                  : "text-slate-400 hover:bg-amber-500/5 hover:text-amber-200"
              }`}
            >
              <Fuel
                size={19}
                strokeWidth={2.3}
                className="shrink-0"
              />

              {isExpanded && (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    Gestão de Combustível
                  </span>

                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${
                      isFuelMenuExpanded ? "rotate-180" : ""
                    }`}
                  />
                </>
              )}
            </button>

            {isExpanded && isFuelMenuExpanded && (
              <div className="mt-1 space-y-0.5 border-l border-amber-400/20 pl-3">
                {fuelMenuItems.map((item) => {
                  const isActive =
                    item.href === "/fuel"
                      ? pathname === "/fuel"
                      : pathname.startsWith(item.href);

                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        isActive
                          ? "bg-amber-500/10 text-amber-300"
                          : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      <Icon
                        size={16}
                        strokeWidth={2.2}
                        className="shrink-0"
                      />

                      <span className="truncate">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
}
