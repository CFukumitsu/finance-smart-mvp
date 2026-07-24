"use client";

import AppShell from "../../../components/layout/AppShell";
import InvestmentScreen from "@/src/components/investments/InvestmentScreen";

export default function InvestmentAssetsPage() {
  return (
    <AppShell>
      <InvestmentScreen view="assets" />
    </AppShell>
  );
}
