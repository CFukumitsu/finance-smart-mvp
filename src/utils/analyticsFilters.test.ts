import assert from "node:assert/strict";
import test from "node:test";
import type { AnalyticsCompetence, AnalyticsFilters, AnalyticsTransaction } from "@/src/types/analytics";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildBreakdown, buildMonthlyAnalytics, summarizeMonthlyValues } from "./analyticsCalculations.ts";
import {
  filterAnalyticsTransactionsByCurrency,
  hasAnalyticsCategoryTargets,
  isAnalyticsAccountInCurrency,
  listAnalyticsCurrencies,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./analyticsFilters.ts";

const competences: AnalyticsCompetence[] = [
  { id: "june", name: "2026-06", month: 6, year: 2026 },
];

function filters(currency: string, accountId = ""): AnalyticsFilters {
  return {
    currency,
    competenceId: "june",
    accountId,
    categoryId: "",
    status: "",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
  };
}

function transaction(
  id: string,
  currency: string | null,
  type: AnalyticsTransaction["type"],
  value: number
): AnalyticsTransaction {
  return {
    id,
    competence_id: "june",
    account_id: currency ?? "legacy",
    category_id: "food",
    origin_account_id: null,
    destination_account_id: null,
    description: id,
    due_date: "2026-06-10",
    type,
    value,
    status: type === "Receita" ? "Recebido" : "Pago",
    account: { name: currency ?? "Legada", type: "Conta", currency },
    category: { name: "Alimentação", type: "Despesa" },
  };
}

const dataset = [
  transaction("brl-expense", "BRL", "Despesa", 1000),
  transaction("eur-expense", "EUR", "Despesa", 100),
  transaction("gbp-income", "GBP", "Receita", 85),
  transaction("legacy-income", null, "Receita", 20),
];

test("análise BRL considera somente BRL (e contas legadas): R$ 1.000, nunca 1.100", () => {
  const brl = filterAnalyticsTransactionsByCurrency(dataset, "BRL");
  const monthly = buildMonthlyAnalytics({
    competences,
    transactions: brl,
    filters: filters("BRL"),
    openingBalance: 0,
  });

  assert.deepEqual(brl.map((item: AnalyticsTransaction) => item.id), ["brl-expense", "legacy-income"]);
  assert.equal(monthly[0].expenses, 1000);
  assert.equal(monthly[0].income, 20);
  assert.equal(summarizeMonthlyValues(monthly, "expenses").total, 1000);
});

test("análise EUR mostra € 100 em despesas e breakdown sem BRL", () => {
  const eur = filterAnalyticsTransactionsByCurrency(dataset, "EUR");
  const monthly = buildMonthlyAnalytics({
    competences,
    transactions: eur,
    filters: filters("EUR"),
    openingBalance: 0,
  });

  assert.equal(monthly[0].expenses, 100);
  assert.equal(monthly[0].income, 0);
  assert.deepEqual(buildBreakdown(eur, "Despesa", "category"), [
    { id: "food", name: "Alimentação", value: 100, count: 1 },
  ]);
});

test("análise GBP considera somente GBP", () => {
  const gbp = filterAnalyticsTransactionsByCurrency(dataset, "GBP");
  assert.deepEqual(gbp.map((item: AnalyticsTransaction) => item.id), ["gbp-income"]);
});

test("contas, metas e moedas do filtro respeitam a moeda selecionada", () => {
  assert.equal(isAnalyticsAccountInCurrency({ currency: "EUR" }, "EUR"), true);
  assert.equal(isAnalyticsAccountInCurrency({ currency: "EUR" }, "BRL"), false);
  assert.equal(isAnalyticsAccountInCurrency({ currency: null }, "BRL"), true);
  assert.equal(hasAnalyticsCategoryTargets("BRL"), true);
  assert.equal(hasAnalyticsCategoryTargets("EUR"), false);
  assert.deepEqual(
    listAnalyticsCurrencies([{ currency: "GBP" }, { currency: null }, { currency: "EUR" }]),
    ["BRL", "EUR", "GBP"]
  );
  assert.deepEqual(listAnalyticsCurrencies([{ currency: "EUR" }]), ["BRL", "EUR"]);
  assert.deepEqual(listAnalyticsCurrencies([]), ["BRL"]);
});
