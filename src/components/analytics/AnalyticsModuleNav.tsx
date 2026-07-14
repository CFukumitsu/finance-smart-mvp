"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/analytics", label: "Visão Geral" },
  { href: "/analytics/income", label: "Receitas" },
  { href: "/analytics/expenses", label: "Despesas" },
  { href: "/analytics/cash-flow", label: "Fluxo de Caixa" },
];

export default function AnalyticsModuleNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação de análises"
      className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-2 lg:grid-cols-4"
    >
      {links.map((link) => {
        const active =
          link.href === "/analytics"
            ? pathname === link.href
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition ${
              active
                ? "bg-cyan-500/15 text-cyan-200"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
