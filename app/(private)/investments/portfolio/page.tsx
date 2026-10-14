"use client";

import AppShell from "../../../components/layout/AppShell";
import InvestmentScreen from "@/src/components/investments/InvestmentScreen";

export default function InvestmentPortfolioPage() {
  return (
    <AppShell>
      <InvestmentScreen view="portfolio" />
    </AppShell>
  );
}