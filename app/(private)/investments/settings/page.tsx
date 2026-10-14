"use client";

import AppShell from "../../../components/layout/AppShell";
import InvestmentScreen from "@/src/components/investments/InvestmentScreen";

export default function InvestmentSettingsPage() {
  return (
    <AppShell>
      <InvestmentScreen view="settings" />
    </AppShell>
  );
}