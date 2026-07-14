import assert from "node:assert/strict";
import test from "node:test";
import type {
  AnalyticsCompetence,
  AnalyticsFilters,
  AnalyticsTransaction,
} from "../types/analytics";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildBreakdown, buildMonthlyAnalytics } from "./analyticsCalculations.ts";

const competences: AnalyticsCompetence[] = [
  { id: "june", name: "2026-06", month: 6, year: 2026 },
  { id: "july", name: "2026-07", month: 7, year: 2026 },
];

const filters: AnalyticsFilters = {
  competenceId: "july",
  accountId: "",
  categoryId: "",
  status: "",
};

function transaction(
  values: Partial<AnalyticsTransaction> &
    Pick<AnalyticsTransaction, "id" | "competence_id" | "type" | "value">
): AnalyticsTransaction {
  return {
    account_id: "checking",
    category_id: "category",
    origin_account_id: null,
    destination_account_id: null,
    description: values.id,
    due_date: "2026-06-10",
    status: "Pago",
    account: { name: "Conta", type: "Conta" },
    category: { name: "Categoria", type: "Despesa" },
    ...values,
  };
}

test("não duplica pagamento de fatura nem transferência nas despesas", () => {
  const monthly = buildMonthlyAnalytics({
    competences,
    filters,
    openingBalance: 1000,
    transactions: [
      transaction({ id: "income", competence_id: "june", type: "Receita", value: 3000, status: "Recebido" }),
      transaction({ id: "purchase", competence_id: "june", type: "Despesa", value: 500, account: { name: "Cartão", type: "Cartão" } }),
      transaction({ id: "invoice", competence_id: "june", type: "Pagamento de Fatura", value: 500 }),
      transaction({ id: "transfer", competence_id: "june", type: "Transferência", value: 200 }),
    ],
  });

  assert.equal(monthly[0].income, 3000);
  assert.equal(monthly[0].expenses, 500);
  assert.equal(monthly[0].balance, 2500);
  assert.equal(monthly[0].cashIn, 3000);
  assert.equal(monthly[0].cashOut, 500);
  assert.equal(monthly[0].cumulativeCashBalance, 3500);
});

test("mantém competências sem movimento e acumula o saldo", () => {
  const monthly = buildMonthlyAnalytics({
    competences,
    filters,
    openingBalance: 0,
    transactions: [
      transaction({ id: "expense", competence_id: "june", type: "Despesa", value: 250 }),
    ],
  });

  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].cumulativeBalance, -250);
  assert.equal(monthly[1].income, 0);
  assert.equal(monthly[1].expenses, 0);
  assert.equal(monthly[1].cumulativeBalance, -250);
});

test("agrupa valores reais por categoria", () => {
  const breakdown = buildBreakdown(
    [
      transaction({ id: "a", competence_id: "june", type: "Despesa", value: 100 }),
      transaction({ id: "b", competence_id: "july", type: "Despesa", value: 50 }),
      transaction({ id: "c", competence_id: "july", type: "Receita", value: 999, status: "Recebido" }),
    ],
    "Despesa",
    "category"
  );

  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0].value, 150);
  assert.equal(breakdown[0].count, 2);
});
