import assert from "node:assert/strict";
import test from "node:test";
import type { AnalyticsCategory, AnalyticsTransaction } from "../types/analytics";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildCategoryBudgetInsights, calculateBudgetPercentage, calculateDailyAvailableLimit, calculateDailyExpensePace, calculateMonthlyProjection, calculatePercentageChange, countInclusiveDays, filterTransactionsByDate, findExpenseIncreaseDrivers, getComparisonDateRange, normalizeAnalyticsDateRange } from "./analyticsPredictive.ts";

const category: AnalyticsCategory = { id: "food", name: "Alimentação", type: "Despesa", active: true };

function transaction(id: string, dueDate: string, value: number, type: AnalyticsTransaction["type"] = "Despesa", status: AnalyticsTransaction["status"] = "Pago"): AnalyticsTransaction {
  return {
    id,
    competence_id: "july",
    account_id: "checking",
    category_id: "food",
    origin_account_id: null,
    destination_account_id: null,
    description: id,
    due_date: dueDate,
    type,
    value,
    status,
    account: { name: "Conta", type: "Conta" },
    category: { name: category.name, type: category.type },
  };
}

test("normaliza intervalo de um único dia e rejeita ordem invertida", () => {
  const range = normalizeAnalyticsDateRange("2026-07-10", "2026-07-10");
  assert.equal(countInclusiveDays(range), 1);
  assert.throws(() => normalizeAnalyticsDateRange("2026-07-11", "2026-07-10"), RangeError);
});

test("compara intervalo personalizado com duração equivalente imediatamente anterior", () => {
  assert.deepEqual(getComparisonDateRange({ startDate: "2026-07-10", endDate: "2026-07-20" }), { startDate: "2026-06-29", endDate: "2026-07-09" });
});

test("mês completo usa mês anterior completo e reconhece 28, 29, 30 e 31 dias", () => {
  assert.equal(countInclusiveDays({ startDate: "2026-02-01", endDate: "2026-02-28" }), 28);
  assert.equal(countInclusiveDays({ startDate: "2024-02-01", endDate: "2024-02-29" }), 29);
  assert.equal(countInclusiveDays({ startDate: "2026-04-01", endDate: "2026-04-30" }), 30);
  assert.equal(countInclusiveDays({ startDate: "2026-07-01", endDate: "2026-07-31" }), 31);
  assert.deepEqual(getComparisonDateRange({ startDate: "2026-07-01", endDate: "2026-07-31" }), { startDate: "2026-06-01", endDate: "2026-06-30" });
});

test("ritmo e projeção da competência atual não usam dias futuros", () => {
  assert.equal(calculateDailyExpensePace(900, 9), 100);
  assert.equal(calculateMonthlyProjection(900, { startDate: "2026-07-01", endDate: "2026-07-31" }, "2026-07-09"), 3100);
});

test("competência histórica e intervalo multimensal não são projetados", () => {
  assert.equal(calculateMonthlyProjection(1000, { startDate: "2026-06-01", endDate: "2026-06-30" }, "2026-07-09"), null);
  assert.equal(calculateMonthlyProjection(1000, { startDate: "2026-06-20", endDate: "2026-07-09" }, "2026-07-09"), null);
});

test("período sem despesas retorna ritmo zero", () => {
  assert.equal(calculateDailyExpensePace(0, 15), 0);
  assert.equal(calculateDailyExpensePace(100, 0), 0);
});

test("planejamento zero ou ausente não inventa percentual nem limite", () => {
  assert.equal(calculateBudgetPercentage(100, 0), null);
  assert.equal(calculateDailyAvailableLimit(0, 0, 10), null);
  assert.deepEqual(buildCategoryBudgetInsights({ transactions: [], targets: [], categories: [category], range: { startDate: "2026-07-01", endDate: "2026-07-31" }, today: "2026-07-10" }), []);
});

test("orçamento ultrapassado nunca gera limite negativo", () => {
  assert.equal(calculateDailyAvailableLimit(1000, 1200, 10), 0);
  const insights = buildCategoryBudgetInsights({ transactions: [transaction("expense", "2026-07-02", 1200)], targets: [{ competence_id: "july", target_id: "food", planned_value: 1000 }], categories: [category], range: { startDate: "2026-07-01", endDate: "2026-07-31" }, today: "2026-07-10" });
  assert.equal(insights[0].status, "Estourado");
  assert.equal(insights[0].remaining, 0);
});

test("classifica projeções abaixo e acima do limite", () => {
  const base = { transactions: [transaction("expense", "2026-07-10", 400)], targets: [{ competence_id: "july", target_id: "food", planned_value: 1500 }], categories: [category], range: { startDate: "2026-07-01", endDate: "2026-07-31" } };
  assert.equal(buildCategoryBudgetInsights({ ...base, today: "2026-07-20" })[0].status, "Normal");
  assert.equal(buildCategoryBudgetInsights({ ...base, today: "2026-07-05" })[0].status, "Risco");
});

test("período anterior zero não produz Infinity, NaN ou percentual enganoso", () => {
  assert.equal(calculatePercentageChange(100, 0), null);
  const drivers = findExpenseIncreaseDrivers({ currentTransactions: [transaction("current", "2026-07-01", 100)], previousTransactions: [], categories: [category] });
  assert.equal(drivers[0].percentageChange, null);
});

test("transferência e pagamento de fatura ficam fora das despesas preditivas", () => {
  const insights = buildCategoryBudgetInsights({
    transactions: [transaction("expense", "2026-07-01", 100), transaction("transfer", "2026-07-02", 500, "Transferência"), transaction("invoice", "2026-07-03", 500, "Pagamento de Fatura")],
    targets: [{ competence_id: "july", target_id: "food", planned_value: 1000 }],
    categories: [category],
    range: { startDate: "2026-07-01", endDate: "2026-07-31" },
    today: "2026-07-20",
  });
  assert.equal(insights[0].realized, 100);
});

test("filtro de data preserva status pendente, pago e recebido já filtrados pelo serviço", () => {
  const values = [transaction("pending", "2026-07-02", 10, "Despesa", "Pendente"), transaction("paid", "2026-07-03", 20, "Despesa", "Pago"), transaction("received", "2026-07-04", 30, "Receita", "Recebido")];
  assert.deepEqual(filterTransactionsByDate(values, { startDate: "2026-07-03", endDate: "2026-07-04" }).map((item) => item.status), ["Pago", "Recebido"]);
});
