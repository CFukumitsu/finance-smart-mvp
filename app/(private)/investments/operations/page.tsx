"use client";

import AppShell from "../../../components/layout/AppShell";
import InvestmentScreen from "@/src/components/investments/InvestmentScreen";

export default function InvestmentOperationsPage() {
  return (
    <AppShell>
      <InvestmentScreen view="operations" />
    </AppShell>
  );
}
