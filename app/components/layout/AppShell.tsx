import FinanceSidebar from "./financeSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="flex min-h-screen">
        <FinanceSidebar />

        <section className="flex-1 p-5 lg:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}