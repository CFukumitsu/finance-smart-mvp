import AppShell from "@/app/components/layout/AppShell";
import { AnalyticsProvider } from "@/src/components/analytics/AnalyticsProvider";
import AnalyticsModuleNav from "@/src/components/analytics/AnalyticsModuleNav";

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <AnalyticsProvider>
        <div className="min-w-0 space-y-6">
          <AnalyticsModuleNav />
          {children}
        </div>
      </AnalyticsProvider>
    </AppShell>
  );
}
