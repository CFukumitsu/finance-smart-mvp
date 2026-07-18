import assert from "node:assert/strict";
import test from "node:test";
import type {
  AnalyticsCompetence,
  AnalyticsFilters,
  AnalyticsTransaction,
} from "../types/analytics";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildBreakdown, buildMonthlyAnalytics } from "./analyticsCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { resolveAnalyticsDatasetFilters } from "./analyticsFilters.ts";

const competences: AnalyticsCompetence[] = [
  { id: "june", name: "2026-06", month: 6, year: 2026 },
  { id: "july", name: "2026-07", month: 7, year: 2026 },
];

const filters: AnalyticsFilters = {
  competenceId: "july",
  accountId: "",
  categoryId: "",
  status: "",
  startDate: "2026-06-01",
  endDate: "2026-07-31",
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

function transferPair(id: string, value = 1000): AnalyticsTransaction[] {
  return [
    transaction({
      id: `${id}-origin`,
      competence_id: "june",
      type: "Transferência",
      value,
      account_id: "account-a",
      origin_account_id: "account-a",
      destination_account_id: "account-b",
      status: "Pago",
    }),
    transaction({
      id: `${id}-destination`,
      competence_id: "june",
      type: "Transferência",
      value,
      account_id: "account-b",
      origin_account_id: "account-a",
      destination_account_id: "account-b",
      status: "Recebido",
    }),
  ];
}

function cashFor(
  transactions: AnalyticsTransaction[],
  accountId: string,
  includePendingCashFlow = false
) {
  return buildMonthlyAnalytics({
    competences: [competences[0]],
    filters: { ...filters, accountId },
    openingBalance: 0,
    transactions,
    includePendingCashFlow,
  })[0];
}

test("transferência gera uma única saída na conta de origem", () => {
  const result = cashFor(transferPair("transfer"), "account-a");

  assert.equal(result.cashIn, 0);
  assert.equal(result.cashOut, 1000);
});

test("transferência gera uma única entrada na conta de destino", () => {
  const result = cashFor(transferPair("transfer"), "account-b");

  assert.equal(result.cashIn, 1000);
  assert.equal(result.cashOut, 0);
});

test("transferência interna não altera nem infla o fluxo consolidado", () => {
  const result = cashFor(transferPair("transfer"), "");

  assert.equal(result.cashIn, 0);
  assert.equal(result.cashOut, 0);
  assert.equal(result.cashBalance, 0);
});

test("preserva duas transferências distintas com mesmo valor e data", () => {
  const result = cashFor(
    [...transferPair("first"), ...transferPair("second")],
    "account-a"
  );

  assert.equal(result.cashIn, 0);
  assert.equal(result.cashOut, 2000);
});

test("ignora transferência inconsistente sem inventar movimento", () => {
  const result = cashFor(
    [
      transaction({
        id: "incomplete",
        competence_id: "june",
        type: "Transferência",
        value: 1000,
        account_id: "account-b",
        origin_account_id: "account-a",
        destination_account_id: null,
        status: "Recebido",
      }),
    ],
    "account-b"
  );

  assert.equal(result.cashIn, 0);
  assert.equal(result.cashOut, 0);
});

test("fluxo padrão considera somente recebimentos e pagamentos realizados", () => {
  const result = cashFor(
    [
      transaction({ id: "received", competence_id: "june", type: "Receita", value: 100, status: "Recebido" }),
      transaction({ id: "income-pending", competence_id: "june", type: "Receita", value: 50, status: "Pendente" }),
      transaction({ id: "paid", competence_id: "june", type: "Despesa", value: 30, status: "Pago" }),
      transaction({ id: "expense-pending", competence_id: "june", type: "Despesa", value: 20, status: "Pendente" }),
      transaction({ id: "invoice-paid", competence_id: "june", type: "Pagamento de Fatura", value: 10, status: "Pago" }),
      transaction({ id: "invoice-pending", competence_id: "june", type: "Pagamento de Fatura", value: 5, status: "Pendente" }),
    ],
    "checking"
  );

  assert.equal(result.cashIn, 100);
  assert.equal(result.cashOut, 40);
});

test("opção de pendentes soma compromissos e recebimentos previstos", () => {
  const result = cashFor(
    [
      transaction({ id: "received", competence_id: "june", type: "Receita", value: 100, status: "Recebido" }),
      transaction({ id: "income-pending", competence_id: "june", type: "Receita", value: 50, status: "Pendente" }),
      transaction({ id: "paid", competence_id: "june", type: "Despesa", value: 30, status: "Pago" }),
      transaction({ id: "expense-pending", competence_id: "june", type: "Despesa", value: 20, status: "Pendente" }),
      transaction({ id: "invoice-paid", competence_id: "june", type: "Pagamento de Fatura", value: 10, status: "Pago" }),
      transaction({ id: "invoice-pending", competence_id: "june", type: "Pagamento de Fatura", value: 5, status: "Pendente" }),
    ],
    "checking",
    true
  );

  assert.equal(result.cashIn, 150);
  assert.equal(result.cashOut, 65);
});

test("filtro explícito de status é preservado fora do Fluxo de Caixa", () => {
  const explicitStatusFilters = { ...filters, categoryId: "category", status: "Pago" };

  assert.equal(
    resolveAnalyticsDatasetFilters("/analytics/expenses", explicitStatusFilters).status,
    "Pago"
  );

  const cashFlowFilters = resolveAnalyticsDatasetFilters(
    "/analytics/cash-flow",
    explicitStatusFilters
  );
  assert.equal(cashFlowFilters.status, "");
  assert.equal(cashFlowFilters.categoryId, "");
});
