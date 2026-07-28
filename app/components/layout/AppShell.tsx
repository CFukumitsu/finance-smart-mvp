"use client";
import UserMenu from "@/src/components/auth/UserMenu";
import { useState } from "react";
import FinanceSidebar from "./financeSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="app-shell min-h-screen w-full overflow-x-clip">
      {/* Botão mobile */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="app-mobile-button fixed left-4 top-4 z-50 rounded-xl border px-3 py-2 text-sm font-bold shadow-lg md:hidden"
      >
        ☰
      </button>

      {/* Overlay mobile */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      <div className="flex min-h-screen w-full overflow-x-clip">
        {/* Sidebar desktop */}
        <div className="sticky top-0 hidden h-screen self-start md:block">
          <FinanceSidebar />
        </div>

        {/* Sidebar mobile */}
        {isMobileMenuOpen && (
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] md:hidden">
            <FinanceSidebar
              forceExpanded
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <div className="app-header sticky top-0 z-30 flex justify-end border-b px-4 py-2 backdrop-blur sm:px-5 lg:px-8">
              <UserMenu />
            </div>

            <section className="w-full max-w-full px-4 pb-5 pt-4 sm:px-5 lg:px-8">
              {children}
            </section>
          </main>
        </main>
      </div>
    </div>
  );
}
