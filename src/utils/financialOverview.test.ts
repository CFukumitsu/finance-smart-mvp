import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateCents,
  buildFinancialOverview,
  calculateAccountBalanceAt,
  classifyConfidence,
  DEFAULT_RESERVE_PROJECTION_SETTINGS,
  describeReserveProjectionBasis,
  describeReserveProjectionFallback,
  estimateVariableSpending,
  getHistoryMonths,
  getTemporal,
  isReserveProjectionModel,
  isVariableExpense,
  monthsRequiredFor,
  planReserveProjection,
  RESERVE_PROJECTION_MODELS,
  resolvePlanningRole,
  roundMoney,
  type OverviewAccount,
  type OverviewInput,
  type OverviewTransaction,
  type ReserveProjectionSettings,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./financialOverview.ts";

const TODAY = "2026-10-16";

const competences = [
  [2026, 6], [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12],
].map(([year, month]) => ({ id: `c-${year}-${String(month).padStart(2, "0")}`, year, month }));
const comp = (key: string) => `c-${key}`;

const account = (patch: Partial<OverviewAccount> & { id: string }): OverviewAccount => ({
  name: patch.id.toUpperCase(),
  type: "Conta",
  currency: "BRL",
  current_balance: 0,
  active: true,
  show_on_investments_dashboard: false,
  investment_account_kind: null,
  planning_role: null,
  use_spending_history: true,
  spending_history_start_date: null,
  due_day: null,
  ...patch,
});

const ACCOUNTS: OverviewAccount[] = [
  account({ id: "corrente", current_balance: 10000 }),
  account({ id: "diaadia", current_balance: 2000 }),
  account({ id: "fixas", current_balance: 0, use_spending_history: false }),
  account({ id: "investimento", show_on_investments_dashboard: true }),
  account({ id: "cofrinho", planning_role: "savings" }),
  account({ id: "tecnica", current_balance: 99999, planning_role: "excluded" }),
  account({ id: "euro", currency: "EUR", current_balance: 300 }),
  account({ id: "cartao", type: "Cartão", due_day: 10 }),
];

let sequence = 0;
const tx = (patch: Partial<OverviewTransaction> & { account_id: string; due_date: string }): OverviewTransaction => ({
  id: `t${++sequence}`,
  competence_id: comp(patch.due_date.slice(0, 7)),
  type: "Despesa",
  value: 0,
  status: "Pago",
  ...patch,
});

/** Transferência vinculada (duas pontas), como gravada pelas RPCs. */
const transfer = (from: string, to: string, date: string, value: number, receivedValue = value) => [
  tx({ account_id: from, due_date: date, type: "Transferência", status: "Pago", value, origin_account_id: from, destination_account_id: to }),
  tx({ account_id: to, due_date: date, type: "Transferência", status: "Recebido", value: receivedValue, origin_account_id: from, destination_account_id: to }),
];

// Histórico de gastos variáveis na conta "diaadia": jul, ago e set, com
// metade do gasto depois do dia 16.
const history = ["2026-07", "2026-08", "2026-09"].flatMap((key) => [
  tx({ account_id: "diaadia", due_date: `${key}-05`, value: 1000 }),
  tx({ account_id: "diaadia", due_date: `${key}-20`, value: 1000 }),
]);

const baseInput = (patch: Partial<OverviewInput> = {}): OverviewInput => ({
  today: TODAY,
  year: 2026,
  month: 10,
  accounts: ACCOUNTS,
  competences,
  closures: [],
  cardStatements: [],
  recurring: [],
  transactions: [...history],
  firstTransactionDateByAccount: { diaadia: "2026-01-02", corrente: "2026-01-02" },
  savingsGoal: 5000,
  cardTargets: {},
  ...patch,
});

const withTransactions = (extra: OverviewTransaction[], patch: Partial<OverviewInput> = {}) =>
  buildFinancialOverview(baseInput({ ...patch, transactions: [...history, ...extra] }));

// ---------------------------------------------------------------------------

test("papel automático: investimento vira reserva; demais contas operacionais; configuração explícita vence", () => {
  assert.equal(resolvePlanningRole(ACCOUNTS.find((item) => item.id === "investimento")!), "savings");
  assert.equal(resolvePlanningRole(ACCOUNTS.find((item) => item.id === "corrente")!), "operational");
  assert.equal(resolvePlanningRole(ACCOUNTS.find((item) => item.id === "cofrinho")!), "savings");
  assert.equal(resolvePlanningRole(ACCOUNTS.find((item) => item.id === "tecnica")!), "excluded");
  assert.equal(resolvePlanningRole(account({ id: "x", show_on_investments_dashboard: true, planning_role: "operational" })), "operational");
});

test("1/3/4. Pode guardar = saldo atual + entradas previstas - compromissos - reserva", () => {
  const overview = withTransactions([
    tx({ account_id: "fixas", due_date: "2026-10-25", value: 1500, status: "Pendente" }),
  ]);
  assert.equal(overview.temporal, "current");
  assert.equal(overview.availableBalance, 12000 - 6000); // saldos - histórico jul..set (6 x 1000)
  assert.equal(overview.commitments.total, 1500);
  assert.equal(overview.reserve.historicalEstimate, 1000); // gasto após o dia 16, média ponderada
  assert.equal(overview.reserve.total, 1000);
  assert.equal(overview.canSave, 6000 - 1500 - 1000);
});

test("2/4. transferência para conta de reserva vira Guardado e não é despesa", () => {
  const overview = withTransactions(transfer("corrente", "cofrinho", "2026-10-10", 5000));
  assert.equal(overview.saved, 5000);
  assert.equal(overview.commitments.total, 0);
  assert.equal(overview.reserve.variableRealized, 0);
  assert.deepEqual(overview.savingsMovements.map((item) => [item.fromName, item.toName, item.value, item.kind]), [
    ["CORRENTE", "COFRINHO", 5000, "deposit"],
  ]);
});

test("3. transferência entre contas operacionais não vira economia nem muda o disponível", () => {
  const before = withTransactions([]);
  const after = withTransactions(transfer("corrente", "diaadia", "2026-10-10", 700));
  assert.equal(after.saved, 0);
  assert.equal(after.canSave, before.canSave);
  assert.equal(after.commitments.transfersOut, 0);
});

test("5/6. guardar R$ 5.000 reduz Pode guardar uma única vez, aumenta Guardado e mantém a previsão", () => {
  const before = withTransactions([]);
  const after = withTransactions(transfer("corrente", "investimento", TODAY, 5000));
  assert.equal(after.saved, 5000);
  assert.equal(after.canSave, (before.canSave ?? 0) - 5000);
  assert.equal(after.forecast, before.forecast);
  assert.equal(after.goal.reference, before.goal.reference);
});

test("1. receita futura do mês entra em Pode guardar e na previsão", () => {
  const before = withTransactions([]);
  const after = withTransactions([
    tx({ account_id: "corrente", due_date: "2026-10-28", type: "Receita", value: 7000, status: "Pendente" }),
  ]);
  assert.equal(after.income.expected, 7000);
  assert.equal(after.expectedInflows, 7000);
  assert.equal(after.canSave, (before.canSave ?? 0) + 7000);
  assert.equal(after.forecast, (before.forecast ?? 0) + 7000);
});

test("2. receita já realizada NÃO é somada de novo (já está no saldo atual)", () => {
  const before = withTransactions([]);
  const after = withTransactions([
    tx({ account_id: "corrente", due_date: "2026-10-05", type: "Receita", value: 7000, status: "Recebido" }),
  ]);
  assert.equal(after.expectedInflows, 0);
  assert.equal(after.availableBalance, (before.availableBalance ?? 0) + 7000);
  assert.equal(after.canSave, (before.canSave ?? 0) + 7000, "entra uma única vez, via saldo");
});

test("7/8. entrada prevista removida ou alterada recalcula Pode guardar na próxima carga", () => {
  const income = tx({ account_id: "corrente", due_date: "2026-10-28", type: "Receita", value: 7000, status: "Pendente" });
  const withIncome = withTransactions([income]);
  const removed = withTransactions([]);
  const edited = withTransactions([{ ...income, value: 4000 }]);
  assert.equal((withIncome.canSave ?? 0) - (removed.canSave ?? 0), 7000);
  assert.equal((withIncome.canSave ?? 0) - (edited.canSave ?? 0), 3000);
});

test("Previsão de economia = Guardado no mês + Pode guardar (exemplo da regra)", () => {
  const overview = withTransactions([
    ...transfer("corrente", "cofrinho", "2026-10-05", 1000),
    tx({ account_id: "corrente", due_date: "2026-10-28", type: "Receita", value: 7000, status: "Pendente" }),
    tx({ account_id: "fixas", due_date: "2026-10-26", value: 3500, status: "Pendente" }),
  ]);
  assert.equal(overview.saved, 1000);
  // saldo (6.000 - 1.000 guardado) + 7.000 entradas - 3.500 compromissos - 1.000 reserva
  assert.equal(overview.canSave, 5000 + 7000 - 3500 - 1000);
  assert.equal(overview.forecast, overview.saved + (overview.canSave ?? 0));
});

test("3. compromissos futuros reduzem Pode guardar e a previsão", () => {
  const before = withTransactions([]);
  const after = withTransactions([
    tx({ account_id: "fixas", due_date: "2026-10-20", value: 800, status: "Pendente" }),
  ]);
  assert.equal(after.commitments.fixedExpenses, 800);
  assert.equal(after.canSave, (before.canSave ?? 0) - 800);
  assert.equal(after.forecast, (before.forecast ?? 0) - 800);
});

test("9. fatura não é duplicada: pagamento lançado substitui a projeção das compras", () => {
  const purchases = [
    tx({ account_id: "cartao", due_date: "2026-09-12", value: 1200 }),
    tx({ account_id: "cartao", due_date: "2026-09-20", type: "Receita", value: 200 }),
  ];
  const projected = withTransactions(purchases);
  assert.equal(projected.commitments.projectedInvoices, 1000);
  assert.equal(projected.commitments.invoicePayments, 0);

  const payment = tx({ account_id: "corrente", due_date: "2026-10-25", type: "Pagamento de Fatura", value: 1000, status: "Pendente" });
  const paid = withTransactions([...purchases, payment], {
    cardStatements: [{ account_id: "cartao", competence_id: comp("2026-09"), payment_transaction_id: payment.id }],
  });
  assert.equal(paid.commitments.projectedInvoices, 0);
  assert.equal(paid.commitments.invoicePayments, 1000);
  assert.equal(paid.commitments.total, projected.commitments.total);
  assert.equal(paid.cards.invoicesDueThisMonth, 1000);
});

test("compras do cartão no mês não são compromisso de caixa deste mês (viram fatura no próximo)", () => {
  const overview = withTransactions([tx({ account_id: "cartao", due_date: "2026-10-05", value: 1280 })], {
    cardTargets: { cartao: 2000 },
  });
  assert.equal(overview.commitments.total, 0);
  assert.equal(overview.cards.used, 1280);
  assert.equal(overview.cards.target, 2000);
  assert.equal(overview.cards.progress, 0.64);
  assert.equal(overview.cards.availableInTarget, 720);
});

test("10. reserva histórica ignora transferências, receitas, faturas, recorrências e parcelas", () => {
  const noise = ["2026-07", "2026-08", "2026-09"].flatMap((key) => [
    ...transfer("diaadia", "cofrinho", `${key}-25`, 5000),
    tx({ account_id: "diaadia", due_date: `${key}-25`, type: "Receita", value: 7000 }),
    tx({ account_id: "diaadia", due_date: `${key}-25`, type: "Pagamento de Fatura", value: 3000 }),
    tx({ account_id: "diaadia", due_date: `${key}-25`, value: 900, recurring_transaction_id: "rec-1" }),
    tx({ account_id: "diaadia", due_date: `${key}-25`, value: 400, mode: "parcelado", parcel_number: 2 }),
  ]);
  const overview = withTransactions(noise);
  assert.equal(overview.reserve.historicalEstimate, 1000);
  assert.equal(overview.reserve.historicalMonthlyAverage, 2000);
  assert.equal(isVariableExpense(tx({ account_id: "x", due_date: TODAY, value: 1 })), true);
});

test("11. histórico respeita a data inicial configurada na conta", () => {
  const accounts = ACCOUNTS.map((item) =>
    item.id === "diaadia" ? { ...item, spending_history_start_date: "2026-09-01" } : item);
  const overview = withTransactions([], { accounts });
  assert.equal(overview.reserve.monthsAvailable, 1);
  assert.equal(overview.reserve.confidence, "media");
  assert.equal(overview.reserve.historicalEstimate, 1000); // só setembro
  const midMonth = withTransactions([], {
    accounts: ACCOUNTS.map((item) => item.id === "diaadia" ? { ...item, spending_history_start_date: "2026-08-15" } : item),
  });
  assert.equal(midMonth.reserve.monthsAvailable, 1, "agosto começa antes da data inicial e não entra");
});

test("média ponderada dá mais peso aos meses recentes e respeita a janela do dia", () => {
  const varied = [
    tx({ account_id: "diaadia", due_date: "2026-07-20", value: 600 }),
    tx({ account_id: "diaadia", due_date: "2026-08-20", value: 1200 }),
    tx({ account_id: "diaadia", due_date: "2026-09-20", value: 1800 }),
    tx({ account_id: "diaadia", due_date: "2026-09-10", value: 999 }),
  ];
  const estimate = estimateVariableSpending({
    historyAccounts: [ACCOUNTS[1]],
    historyMonths: getHistoryMonths(2026, 10, TODAY),
    transactions: varied,
    firstTransactionDateByAccount: { diaadia: "2026-01-01" },
    afterDay: 16,
  });
  // (3*1800 + 2*1200 + 1*600) / 6 = 1400; o gasto do dia 10 fica fora da janela
  assert.equal(estimate.remaining, 1400);
  assert.equal(estimate.monthsAvailable, 3);
});

test("reserva usa o maior entre histórico e variáveis já lançadas, sem somar o mesmo gasto duas vezes", () => {
  const overview = withTransactions([
    tx({ account_id: "diaadia", due_date: "2026-10-25", value: 400, status: "Pendente" }),
  ]);
  assert.equal(overview.reserve.knownVariable, 400);
  assert.equal(overview.reserve.estimatedNotRegistered, 600);
  assert.equal(overview.reserve.total, 1000);
  assert.equal(overview.commitments.total, 0, "variável lançado fica na reserva, não nos compromissos");

  const bigKnown = withTransactions([
    tx({ account_id: "diaadia", due_date: "2026-10-25", value: 1500, status: "Pendente" }),
  ]);
  assert.equal(bigKnown.reserve.total, 1500);
});

test("12. mês atual: realizado + disponível hoje + projeção", () => {
  const overview = withTransactions([tx({ account_id: "diaadia", due_date: "2026-10-03", value: 250 })]);
  assert.equal(overview.temporal, "current");
  assert.equal(overview.daysRemaining, 15);
  assert.notEqual(overview.canSave, null);
  assert.notEqual(overview.forecast, null);
  assert.equal(overview.monthResult, null);
  assert.equal(overview.reserve.variableRealized, 250);
  assert.equal(overview.reserve.variableExpectedMonth, 1250);
});

test("13. mês passado: só realizado, sem Pode guardar nem projeção", () => {
  const overview = buildFinancialOverview(baseInput({
    year: 2026,
    month: 9,
    transactions: [
      ...history,
      tx({ account_id: "corrente", due_date: "2026-09-05", type: "Receita", value: 8000 }),
      ...transfer("corrente", "investimento", "2026-09-10", 3000),
    ],
  }));
  assert.equal(overview.temporal, "past");
  assert.equal(overview.canSave, null);
  assert.equal(overview.forecast, null);
  assert.equal(overview.reserve.total, 0);
  assert.equal(overview.saved, 3000);
  assert.equal(overview.monthResult, 8000 - 2000); // receita - gastos de setembro; guardado não é saída
  assert.equal(overview.goal.reference, 3000);
});

test("14. mês futuro: sem saldo de hoje; previsão = receitas - compromissos - reserva do mês", () => {
  const overview = buildFinancialOverview(baseInput({
    year: 2026,
    month: 11,
    transactions: [
      ...history,
      tx({ account_id: "corrente", due_date: "2026-11-05", type: "Receita", value: 10000, status: "Pendente" }),
      tx({ account_id: "fixas", due_date: "2026-11-10", value: 3000, status: "Pendente" }),
      ...transfer("corrente", "cofrinho", "2026-11-06", 1000),
    ],
  }));
  assert.equal(overview.temporal, "future");
  assert.equal(overview.availableBalance, null);
  assert.equal(overview.reserve.total, 2000); // média mensal completa
  assert.equal(overview.forecast, 10000 - 3000 - 2000);
  assert.equal(overview.saved, 1000);
  assert.equal(overview.canSave, 5000 - 1000, "futuro: previsão - guardado programado");
});

test("15. sem histórico: confiança baixa e reserva só com o que já foi lançado", () => {
  const overview = buildFinancialOverview(baseInput({ transactions: [], firstTransactionDateByAccount: {} }));
  assert.equal(overview.reserve.confidence, "baixa");
  assert.equal(overview.reserve.historicalEstimate, 0);
  assert.equal(classifyConfidence(null), "indisponivel");
  assert.equal(classifyConfidence(3), "alta");
});

test("16. sem meta: indicadores de meta ficam vazios", () => {
  const overview = withTransactions([], { savingsGoal: null });
  assert.equal(overview.goal.amount, null);
  assert.equal(overview.goal.progress, null);
  assert.equal(overview.goal.difference, null);
});

test("17. contas fora do planejamento e de reserva não entram no saldo disponível", () => {
  const overview = withTransactions([]);
  assert.deepEqual(overview.accountBalances.map((item) => item.id).sort(), ["corrente", "diaadia", "fixas"]);
  assert.ok(!overview.accountBalances.some((item) => item.id === "tecnica"));
  const noPlanning = buildFinancialOverview(baseInput({
    accounts: ACCOUNTS.map((item) => ({ ...item, planning_role: item.type === "Conta" ? "excluded" : item.planning_role })),
  }));
  assert.equal(noPlanning.hasPlanningAccounts, false);
  assert.equal(noPlanning.availableBalance, 0);
});

test("18. moedas: conta EUR fica à parte; conversão BRL -> EUR não vira receita nem despesa", () => {
  const overview = withTransactions(transfer("corrente", "euro", "2026-10-10", 1500, 241.69));
  assert.deepEqual(overview.otherCurrencyAccounts, [{ id: "euro", name: "EURO", currency: "EUR", balance: 541.69 }]);
  assert.equal(overview.income.realized, 0);
  assert.equal(overview.reserve.variableRealized, 0);
  assert.equal(overview.saved, 0);

  const toSavings = withTransactions(transfer("corrente", "euro", "2026-10-10", 1500, 241.69), {
    accounts: ACCOUNTS.map((item) => item.id === "euro" ? { ...item, planning_role: "savings" } : item),
  });
  assert.equal(toSavings.saved, 1500, "guardado medido pelo valor debitado em BRL");
});

test("19/20. alterar ou excluir um lançamento muda os indicadores na próxima carga", () => {
  const expense = tx({ account_id: "fixas", due_date: "2026-10-25", value: 1500, status: "Pendente" });
  const original = withTransactions([expense]);
  const edited = withTransactions([{ ...expense, value: 500 }]);
  const deleted = withTransactions([]);
  assert.equal((edited.canSave ?? 0) - (original.canSave ?? 0), 1000);
  assert.equal((deleted.canSave ?? 0) - (original.canSave ?? 0), 1500);
});

test("resgate da reserva reduz o guardado; aplicação via Investimentos conta como guardado", () => {
  const overview = withTransactions([
    ...transfer("corrente", "cofrinho", "2026-10-05", 3000),
    ...transfer("cofrinho", "corrente", "2026-10-12", 1000),
    tx({ account_id: "corrente", due_date: "2026-10-08", type: "Transferência", status: "Pago", value: 2000,
      origin_account_id: "corrente", investment_event_type: "application", investment_account_id: "investimento" }),
  ]);
  assert.equal(overview.saved, 3000 - 1000 + 2000);
});

test("recorrência ainda não gerada vira compromisso sem duplicar as já geradas", () => {
  const recurring = [
    { id: "aluguel", type: "expense" as const, amount: 2500, account_id: "fixas", start_competence_id: comp("2026-01"), end_competence_id: null },
    { id: "luz", type: "expense" as const, amount: 300, account_id: "fixas", start_competence_id: comp("2026-06"), end_competence_id: null },
    { id: "salario", type: "income" as const, amount: 9000, account_id: "corrente", start_competence_id: comp("2026-06"), end_competence_id: null },
  ];
  const overview = withTransactions([
    tx({ account_id: "fixas", due_date: "2026-10-05", value: 300, recurring_transaction_id: "luz" }),
  ], { recurring, competences: [...competences, { id: comp("2026-01"), year: 2026, month: 1 }] });
  assert.equal(overview.commitments.recurringNotGenerated, 2500);
  assert.equal(overview.income.expected, 9000);
});

test("saldo parte do último fechamento anterior ao mês e soma só os lançamentos seguintes até hoje", () => {
  const corrente = ACCOUNTS[0];
  const transactions = [
    tx({ account_id: "corrente", due_date: "2026-08-10", value: 999 }),
    tx({ account_id: "corrente", due_date: "2026-09-10", type: "Receita", value: 500 }),
    tx({ account_id: "corrente", due_date: "2026-10-01", value: 100 }),
    tx({ account_id: "corrente", due_date: "2026-10-30", value: 7000, status: "Pendente" }),
  ];
  const balance = calculateAccountBalanceAt({
    account: corrente,
    asOf: TODAY,
    competences,
    closures: [{ account_id: "corrente", competence_id: comp("2026-08"), closing_balance: 4000 }],
    transactions,
  });
  assert.equal(balance, 4000 + 500 - 100);
  assert.equal(calculateAccountBalanceAt({ account: corrente, asOf: TODAY, competences, closures: [], transactions }),
    10000 - 999 + 500 - 100);
});

test("utilitários de período", () => {
  assert.equal(getTemporal(2026, 9, TODAY), "past");
  assert.equal(getTemporal(2026, 10, TODAY), "current");
  assert.equal(getTemporal(2027, 1, TODAY), "future");
  assert.deepEqual(getHistoryMonths(2026, 12, TODAY).map((item) => item.key), ["2026-09", "2026-08", "2026-07"]);
  assert.deepEqual(getHistoryMonths(2026, 3, TODAY).map((item) => item.key), ["2026-02", "2026-01", "2025-12"]);
});

test("confiança: conta sem gastos no histórico não derruba; conta com data inicial recente derruba", () => {
  const withEmptyAccount = withTransactions([], {
    accounts: [...ACCOUNTS, account({ id: "nova", current_balance: 500 })],
    firstTransactionDateByAccount: { diaadia: "2026-01-02", corrente: "2026-01-02", nova: "2026-10-08" },
  });
  assert.equal(withEmptyAccount.reserve.confidence, "alta");
  assert.equal(withEmptyAccount.reserve.monthsAvailable, 3);

  const changedBehavior = withTransactions([], {
    accounts: [...ACCOUNTS, account({ id: "nova", current_balance: 500, spending_history_start_date: "2026-10-01" })],
    firstTransactionDateByAccount: { diaadia: "2026-01-02", corrente: "2026-01-02", nova: "2026-10-08" },
  });
  assert.equal(changedBehavior.reserve.confidence, "baixa");
});

// ---------------------------------------------------------------------------
// Moeda estrangeira como destino de economia: decide o PAPEL do destino.
// ---------------------------------------------------------------------------
const FOREIGN_ACCOUNTS: OverviewAccount[] = [
  ...ACCOUNTS.filter((item) => item.id !== "euro"),
  account({ id: "reservaEur", name: "Reserva EUR", currency: "EUR", planning_role: "savings" }),
  account({ id: "reservaGbp", name: "Reserva GBP", currency: "GBP", planning_role: "savings" }),
  account({ id: "operEur", currency: "EUR", planning_role: "operational" }),
  account({ id: "foraEur", currency: "EUR", planning_role: "excluded" }),
];
const foreign = (extra: OverviewTransaction[]) =>
  buildFinancialOverview(baseInput({ accounts: FOREIGN_ACCOUNTS, transactions: [...history, ...extra] }));

test("moeda 1. Operacional BRL -> Reserva BRL = Guardado", () => {
  assert.equal(foreign(transfer("corrente", "cofrinho", "2026-10-10", 2000)).saved, 2000);
});

test("moeda 2/3. Operacional BRL -> Reserva EUR/GBP = Guardado pelo valor debitado em BRL", () => {
  const eur = foreign(transfer("corrente", "reservaEur", "2026-10-10", 2000, 320));
  assert.equal(eur.saved, 2000);
  assert.deepEqual(eur.savingsMovements.map((item) => [item.toName, item.value]), [["Reserva EUR", 2000]]);
  const gbp = foreign(transfer("corrente", "reservaGbp", "2026-10-10", 2000, 270));
  assert.equal(gbp.saved, 2000);
});

test("moeda 4/5. BRL -> Operacional EUR ou Fora do planejamento EUR NÃO é Guardado", () => {
  const operational = foreign(transfer("corrente", "operEur", "2026-10-25", 2000, 320));
  assert.equal(operational.saved, 0);
  assert.equal(operational.savedScheduled, 0);
  assert.equal(operational.commitments.transfersOut, 2000, "sai do caixa BRL: transferência programada");
  const excluded = foreign(transfer("corrente", "foraEur", "2026-10-25", 2000, 320));
  assert.equal(excluded.saved, 0);
  assert.equal(excluded.commitments.transfersOut, 2000);
});

test("moeda 6/7/8. Reserva em moeda estrangeira não é compromisso, despesa nem receita", () => {
  const before = foreign([]);
  const scheduled = foreign(transfer("corrente", "reservaEur", "2026-10-25", 2000, 320));
  assert.equal(scheduled.commitments.total, before.commitments.total);
  assert.equal(scheduled.savedScheduled, 2000);
  assert.equal(scheduled.reserve.variableRealized, before.reserve.variableRealized);
  assert.equal(scheduled.income.expected, before.income.expected);
  assert.equal(scheduled.income.realized, before.income.realized);

  const past = buildFinancialOverview(baseInput({
    year: 2026, month: 9, accounts: FOREIGN_ACCOUNTS,
    transactions: [...history, ...transfer("corrente", "reservaEur", "2026-09-10", 2000, 320)],
  }));
  assert.equal(past.saved, 2000);
  assert.equal(past.realizedOutflows, 2000, "só os gastos variáveis de setembro; a reserva não é saída");
  assert.equal(past.income.realized, 0);
});

test("moeda 9. guardar R$ 2.000 em reserva EUR: saldo -2.000, guardado +2.000, Pode guardar -2.000, previsão estável", () => {
  const before = foreign([]);
  const after = foreign(transfer("corrente", "reservaEur", TODAY, 2000, 320));
  assert.equal(after.availableBalance, (before.availableBalance ?? 0) - 2000);
  assert.equal(after.saved, before.saved + 2000);
  assert.equal(after.canSave, (before.canSave ?? 0) - 2000);
  assert.equal(after.forecast, before.forecast);
  assert.equal(after.commitments.total, before.commitments.total);
  assert.ok(!after.otherCurrencyAccounts.some((item) => item.id === "reservaEur"), "reserva não é caixa operacional");
});

test("moeda 10. resgate Reserva EUR -> Operacional BRL reduz o Guardado pelo valor creditado em BRL", () => {
  const overview = foreign([
    ...transfer("corrente", "reservaEur", "2026-10-05", 2000, 320),
    ...transfer("reservaEur", "corrente", "2026-10-12", 100, 600),
  ]);
  assert.equal(overview.saved, 2000 - 600);
  assert.deepEqual(overview.savingsMovements.map((item) => [item.kind, item.value]), [["withdrawal", 600], ["deposit", 2000]]);
});

test("limitação documentada: resgate da Reserva EUR para conta fora do caixa BRL não tem valor BRL e não é convertido", () => {
  const overview = foreign([
    ...transfer("corrente", "reservaEur", "2026-10-05", 2000, 320),
    ...transfer("reservaEur", "operEur", "2026-10-12", 100, 100),
  ]);
  assert.equal(overview.saved, 2000);
});

test("4. reserva estimada maior reduz Pode guardar na mesma medida", () => {
  const before = withTransactions([]);
  const after = withTransactions([tx({ account_id: "diaadia", due_date: "2026-10-25", value: 1800, status: "Pendente" })]);
  // reserva passa de 1.000 (histórico) para 1.800 (variável já lançado)
  assert.equal(after.reserve.total - before.reserve.total, 800);
  assert.equal((before.canSave ?? 0) - (after.canSave ?? 0), 800);
});

// ---------------------------------------------------------------------------
// Detalhamento da reserva por categoria (Top 10 + Outras), mesma metodologia.
// ---------------------------------------------------------------------------
const categoryNames: Record<string, string> = Object.fromEntries(
  ["mercado", "almoco", "lazer", "combustivel", "farmacia", "uber", "padaria", "pet", "roupas", "presentes", "cafe", "livros"]
    .map((id) => [id, id.charAt(0).toUpperCase() + id.slice(1)]),
);
// Gasto depois do dia 16 em jul/ago/set por categoria (mesmo valor nos 3 meses).
const categoryValues: Record<string, number> = {
  mercado: 1200, almoco: 750, lazer: 650, combustivel: 450, farmacia: 300, uber: 280,
  padaria: 250, pet: 220, roupas: 200, presentes: 180, cafe: 90, livros: 60,
};
const categoryHistory = ["2026-07", "2026-08", "2026-09"].flatMap((key) =>
  Object.entries(categoryValues).map(([category_id, value]) =>
    tx({ account_id: "diaadia", due_date: `${key}-20`, value, category_id })));
const sumBreakdown = (breakdown: ReturnType<typeof buildFinancialOverview>["reserve"]["categoryBreakdown"]) =>
  Math.round((breakdown.items.reduce((sum, item) => sum + item.amount, 0) + (breakdown.others?.amount ?? 0)) * 100);
const byCategory = (extra: OverviewTransaction[] = [], patch: Partial<OverviewInput> = {}) =>
  buildFinancialOverview(baseInput({ transactions: [...categoryHistory, ...extra], categoryNames, ...patch }));

test("cat 1/2/3/7. Top 10 em ordem decrescente + Outras, fechando com a reserva", () => {
  const overview = byCategory();
  const breakdown = overview.reserve.categoryBreakdown;
  assert.equal(breakdown.source, "historical");
  assert.equal(overview.reserve.total, 4630); // soma das 12 categorias
  assert.deepEqual(breakdown.items.map((item) => [item.name, item.amount]), [
    ["Mercado", 1200], ["Almoco", 750], ["Lazer", 650], ["Combustivel", 450], ["Farmacia", 300],
    ["Uber", 280], ["Padaria", 250], ["Pet", 220], ["Roupas", 200], ["Presentes", 180],
  ]);
  assert.deepEqual(breakdown.others, { amount: 150, count: 2 });
  assert.equal(sumBreakdown(breakdown), Math.round(overview.reserve.total * 100));
});

test("cat 4/5. até 10 categorias não cria Outras; categoria com valor zero não aparece", () => {
  const few = buildFinancialOverview(baseInput({
    categoryNames,
    transactions: ["2026-07", "2026-08", "2026-09"].flatMap((key) => [
      tx({ account_id: "diaadia", due_date: `${key}-20`, value: 500, category_id: "mercado" }),
      tx({ account_id: "diaadia", due_date: `${key}-22`, value: 100, category_id: "cafe" }),
      // só antes do dia 16: fica fora da janela restante (valor zero)
      tx({ account_id: "diaadia", due_date: `${key}-05`, value: 999, category_id: "livros" }),
    ]),
  }));
  assert.equal(few.reserve.categoryBreakdown.others, null);
  assert.deepEqual(few.reserve.categoryBreakdown.items.map((item) => item.name), ["Mercado", "Cafe"]);
});

test("cat 6. gastos sem categoria aparecem como Sem categoria e entram no ranking", () => {
  const overview = byCategory(["2026-07", "2026-08", "2026-09"].map((key) =>
    tx({ account_id: "diaadia", due_date: `${key}-21`, value: 320 })));
  const item = overview.reserve.categoryBreakdown.items.find((entry) => entry.name === "Sem categoria");
  assert.equal(item?.amount, 320);
  assert.equal(sumBreakdown(overview.reserve.categoryBreakdown), Math.round(overview.reserve.total * 100));
});

test("cat 8. pesos 3/2/1 por categoria", () => {
  const overview = buildFinancialOverview(baseInput({
    categoryNames,
    transactions: [
      tx({ account_id: "diaadia", due_date: "2026-07-20", value: 900, category_id: "mercado" }),
      tx({ account_id: "diaadia", due_date: "2026-08-20", value: 600, category_id: "mercado" }),
      tx({ account_id: "diaadia", due_date: "2026-09-20", value: 300, category_id: "mercado" }),
    ],
  }));
  // (3*300 + 2*600 + 1*900) / 6 = 500
  assert.deepEqual(overview.reserve.categoryBreakdown.items, [{ key: "mercado", name: "Mercado", amount: 500 }]);
});

test("cat 9/10. janela restante muda com o dia e não é proporcional aos dias", () => {
  const lateSpending = ["2026-07", "2026-08", "2026-09"].flatMap((key) => [
    tx({ account_id: "diaadia", due_date: `${key}-05`, value: 1000, category_id: "mercado" }),
    tx({ account_id: "diaadia", due_date: `${key}-28`, value: 2000, category_id: "lazer" }),
  ]);
  const day3 = buildFinancialOverview(baseInput({ today: "2026-10-03", categoryNames, transactions: lateSpending }));
  const day20 = buildFinancialOverview(baseInput({ today: "2026-10-20", categoryNames, transactions: lateSpending }));
  assert.deepEqual(day3.reserve.categoryBreakdown.items.map((item) => [item.name, item.amount]), [["Lazer", 2000], ["Mercado", 1000]]);
  assert.deepEqual(day20.reserve.categoryBreakdown.items.map((item) => [item.name, item.amount]), [["Lazer", 2000]]);
  // Proporcional seria 3.000 x 11/31 = 1.064,52; o histórico da janela diz 2.000.
  assert.equal(day20.reserve.total, 2000);
  assert.notEqual(day20.reserve.total, Math.round(3000 * (11 / 31) * 100) / 100);
});

test("cat 11/12/13/14. transferências, receitas, faturas, recorrências e parcelas ficam fora", () => {
  const noise = ["2026-07", "2026-08", "2026-09"].flatMap((key) => [
    { ...transfer("diaadia", "cofrinho", `${key}-25`, 5000)[0], category_id: "lazer" },
    tx({ account_id: "diaadia", due_date: `${key}-25`, type: "Receita", value: 7000, category_id: "mercado" }),
    tx({ account_id: "diaadia", due_date: `${key}-25`, type: "Pagamento de Fatura", value: 3000, category_id: "uber" }),
    tx({ account_id: "diaadia", due_date: `${key}-25`, value: 900, recurring_transaction_id: "rec", category_id: "pet" }),
    tx({ account_id: "diaadia", due_date: `${key}-25`, value: 400, mode: "parcelado", parcel_number: 2, category_id: "roupas" }),
  ]);
  assert.deepEqual(byCategory(noise).reserve.categoryBreakdown, byCategory().reserve.categoryBreakdown);
});

test("cat 15/16. data inicial do histórico e contas fora do histórico são respeitadas", () => {
  const withStart = byCategory([], {
    accounts: ACCOUNTS.map((item) => item.id === "diaadia" ? { ...item, spending_history_start_date: "2026-09-01" } : item),
  });
  assert.equal(sumBreakdown(withStart.reserve.categoryBreakdown), Math.round(withStart.reserve.total * 100));
  assert.equal(withStart.reserve.monthsAvailable, 1);

  const fixedAccount = byCategory(["2026-07", "2026-08", "2026-09"].map((key) =>
    tx({ account_id: "fixas", due_date: `${key}-20`, value: 5000, category_id: "mercado" })));
  assert.deepEqual(fixedAccount.reserve.categoryBreakdown, byCategory().reserve.categoryBreakdown);
});

test("cat 17. lançados maiores que o histórico: detalha os lançados e fecha com a reserva final", () => {
  const overview = byCategory([
    tx({ account_id: "diaadia", due_date: "2026-10-25", value: 4000, category_id: "lazer", status: "Pendente" }),
    tx({ account_id: "diaadia", due_date: "2026-10-26", value: 2500, category_id: "mercado", status: "Pendente" }),
  ]);
  assert.equal(overview.reserve.total, 6500);
  assert.equal(overview.reserve.categoryBreakdown.source, "registered");
  assert.deepEqual(overview.reserve.categoryBreakdown.items.map((item) => [item.name, item.amount]), [["Lazer", 4000], ["Mercado", 2500]]);
  assert.equal(sumBreakdown(overview.reserve.categoryBreakdown), 650000);
});

test("cat 18. arredondamento fecha exatamente em centavos", () => {
  const thirds = buildFinancialOverview(baseInput({
    categoryNames,
    transactions: ["2026-07", "2026-08", "2026-09"].flatMap((key, index) => [
      tx({ account_id: "diaadia", due_date: `${key}-20`, value: 100 + index * 0.01, category_id: "mercado" }),
      tx({ account_id: "diaadia", due_date: `${key}-21`, value: 33.33 + index, category_id: "cafe" }),
      tx({ account_id: "diaadia", due_date: `${key}-22`, value: 66.67 - index * 0.07, category_id: "pet" }),
    ]),
  }));
  assert.equal(sumBreakdown(thirds.reserve.categoryBreakdown), Math.round(thirds.reserve.total * 100));
  for (const item of thirds.reserve.categoryBreakdown.items) {
    assert.equal(Math.round(item.amount * 100), Math.round(item.amount * 100 * 1000) / 1000);
  }
  assert.deepEqual(allocateCents({ a: 1, b: 1, c: 1 }, 100), { a: 34, b: 33, c: 33 });
});

test("cat 19. adicionar, editar e excluir lançamento atualiza o detalhamento", () => {
  const base = byCategory();
  const extra = tx({ account_id: "diaadia", due_date: "2026-09-27", value: 3000, category_id: "cafe" });
  const added = byCategory([extra]);
  const edited = byCategory([{ ...extra, value: 300 }]);
  const amount = (overview: ReturnType<typeof byCategory>) =>
    overview.reserve.categoryBreakdown.items.find((item) => item.key === "cafe")?.amount ?? 0;
  assert.equal(amount(base), 0, "Café estava em Outras");
  assert.equal(amount(added), 90 + 1500); // 90 + 3*3000/6
  assert.equal(amount(edited), 90 + 150);
  assert.deepEqual(byCategory([]).reserve.categoryBreakdown, base.reserve.categoryBreakdown);
});

// ---------------------------------------------------------------------------
// Modelos de projeção da reserva estimada
// ---------------------------------------------------------------------------

// Um valor distinto por mês (depois do dia 16) para identificar a base usada.
const projectionHistory = ([["2026-06", 600], ["2026-07", 700], ["2026-08", 800], ["2026-09", 900]] as const)
  .flatMap(([key, after]) => [
    tx({ account_id: "diaadia", due_date: `${key}-05`, value: 100 }),
    tx({ account_id: "diaadia", due_date: `${key}-20`, value: after }),
  ]);
const projectionInput = (
  reserveSettings: ReserveProjectionSettings | undefined,
  patch: Partial<OverviewInput> = {},
): OverviewInput => baseInput({ transactions: projectionHistory, reserveSettings, ...patch });
const settings = (patch: Partial<ReserveProjectionSettings>): ReserveProjectionSettings => ({
  model: "weighted_average",
  referenceMonth: null,
  excludedMonths: [],
  ...patch,
});
const allFinite = (overview: ReturnType<typeof buildFinancialOverview>) => [
  overview.reserve.total, overview.reserve.historicalEstimate, overview.reserve.historicalMonthlyAverage,
  overview.reserve.estimatedNotRegistered, overview.canSave ?? 0, overview.forecast ?? 0,
].every(Number.isFinite);

test("modelo 1. usuário sem configuração mantém a média ponderada, idêntica ao default explícito", () => {
  const withoutSettings = buildFinancialOverview(projectionInput(undefined));
  const withDefault = buildFinancialOverview(projectionInput(DEFAULT_RESERVE_PROJECTION_SETTINGS));
  assert.equal(withoutSettings.reserve.projection.model, "weighted_average");
  assert.equal(withoutSettings.reserve.projection.requestedModel, "weighted_average");
  assert.equal(withoutSettings.reserve.projection.fallback, null);
  assert.deepEqual(withoutSettings, withDefault);
});

test("modelo 2. média ponderada: mesmos meses e pesos da regra anterior (3/2/1 nos 3 meses completos)", () => {
  assert.deepEqual(getHistoryMonths(2026, 10, TODAY, []), getHistoryMonths(2026, 10, TODAY));
  assert.deepEqual(getHistoryMonths(2026, 10, TODAY).map((item) => [item.key, item.weight]), [
    ["2026-09", 3], ["2026-08", 2], ["2026-07", 1],
  ]);
  const overview = buildFinancialOverview(projectionInput(settings({})));
  assert.equal(overview.reserve.historicalEstimate, roundMoney((3 * 900 + 2 * 800 + 1 * 700) / 6));
  assert.equal(overview.reserve.historicalMonthlyAverage, roundMoney((3 * 1000 + 2 * 900 + 1 * 800) / 6));
  assert.equal(overview.reserve.confidence, "alta");
  assert.equal(describeReserveProjectionBasis(overview.reserve.projection), "Média ponderada — 09/2026, 08/2026 e 07/2026");
});

test("modelo 3. último mês: usa só o último mês completo, no período equivalente ao restante do mês", () => {
  const overview = buildFinancialOverview(projectionInput(settings({ model: "last_month" })));
  assert.deepEqual(overview.reserve.projection.months.map((item) => item.key), ["2026-09"]);
  assert.equal(overview.reserve.historicalEstimate, 900); // só o gasto de set depois do dia 16
  assert.equal(overview.reserve.historicalMonthlyAverage, 1000);
  assert.equal(overview.reserve.confidence, "alta");
  assert.equal(describeReserveProjectionBasis(overview.reserve.projection), "Último mês — 09/2026");
  // Hoje = 03/10: o período restante (04 a 31) inclui o gasto do dia 05 de setembro.
  const early = buildFinancialOverview(projectionInput(settings({ model: "last_month" }), { today: "2026-10-03" }));
  assert.equal(early.reserve.historicalEstimate, 1000);
  // Mês futuro: base é o último mês completo antes do mês atual, mês inteiro.
  const future = buildFinancialOverview(projectionInput(settings({ model: "last_month" }), { month: 11 }));
  assert.deepEqual(future.reserve.projection.months.map((item) => item.key), ["2026-09"]);
  assert.equal(future.reserve.historicalEstimate, 1000);
});

test("modelo 4. último mês desconsiderado: busca o mês válido anterior", () => {
  const overview = buildFinancialOverview(projectionInput(settings({ model: "last_month", excludedMonths: ["2026-09"] })));
  assert.deepEqual(overview.reserve.projection.months.map((item) => item.key), ["2026-08"]);
  assert.equal(overview.reserve.historicalEstimate, 800);
  const twoSkipped = buildFinancialOverview(projectionInput(settings({ model: "last_month", excludedMonths: ["2026-09", "2026-08"] })));
  assert.equal(twoSkipped.reserve.historicalEstimate, 700);
});

test("modelo 5. mês de referência: usa o mês escolhido", () => {
  const overview = buildFinancialOverview(projectionInput(settings({ model: "reference_month", referenceMonth: "2026-06" })));
  assert.equal(overview.reserve.projection.model, "reference_month");
  assert.equal(overview.reserve.projection.fallback, null);
  assert.equal(overview.reserve.historicalEstimate, 600);
  assert.equal(overview.reserve.historicalMonthlyAverage, 700);
  assert.equal(describeReserveProjectionBasis(overview.reserve.projection), "Mês de referência — 06/2026");
  assert.equal(describeReserveProjectionFallback(overview.reserve.projection), null);
});

test("modelo 6. mês de referência desconsiderado/inválido: volta para a média ponderada com aviso explícito", () => {
  const excluded = buildFinancialOverview(projectionInput(settings({
    model: "reference_month", referenceMonth: "2026-08", excludedMonths: ["2026-08"],
  })));
  assert.equal(excluded.reserve.projection.requestedModel, "reference_month");
  assert.equal(excluded.reserve.projection.model, "weighted_average");
  assert.equal(excluded.reserve.projection.fallback, "reference_month_excluded");
  // A média ponderada também pula o mês desconsiderado: 09 (3), 07 (2), 06 (1).
  assert.equal(excluded.reserve.historicalEstimate, roundMoney((3 * 900 + 2 * 700 + 1 * 600) / 6));
  assert.match(describeReserveProjectionFallback(excluded.reserve.projection) ?? "", /08\/2026 está marcado como desconsiderado/);

  const incomplete = planReserveProjection(2026, 10, TODAY, settings({ model: "reference_month", referenceMonth: "2026-10" }));
  assert.equal(incomplete.fallback, "reference_month_incomplete");
  const missing = planReserveProjection(2026, 10, TODAY, settings({ model: "reference_month", referenceMonth: null }));
  assert.equal(missing.fallback, "reference_month_missing");
  assert.equal(missing.model, "weighted_average");
});

test("modelo 7. mês sem dados suficientes não gera NaN/Infinity", () => {
  // Antes do primeiro lançamento da conta: mês indisponível.
  const beforeAccount = buildFinancialOverview(projectionInput(settings({ model: "reference_month", referenceMonth: "2025-12" })));
  assert.equal(beforeAccount.reserve.historicalEstimate, 0);
  assert.equal(beforeAccount.reserve.confidence, "baixa");
  assert.ok(allFinite(beforeAccount));
  // Mês disponível, mas sem nenhum gasto variável.
  const empty = buildFinancialOverview(projectionInput(settings({ model: "reference_month", referenceMonth: "2026-05" })));
  assert.equal(empty.reserve.historicalEstimate, 0);
  assert.ok(allFinite(empty));
  // Sem contas de histórico.
  const noAccounts = buildFinancialOverview(projectionInput(settings({ model: "last_month" }), {
    accounts: ACCOUNTS.map((item) => ({ ...item, use_spending_history: false })),
  }));
  assert.equal(noAccounts.reserve.confidence, "indisponivel");
  assert.ok(allFinite(noAccounts));
  // Média ponderada com vários meses desconsiderados.
  const manyExcluded = buildFinancialOverview(projectionInput(settings({
    excludedMonths: ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05"],
  })));
  assert.deepEqual(manyExcluded.reserve.projection.months.map((item) => item.key), ["2026-04", "2026-03", "2026-02"]);
  assert.equal(manyExcluded.reserve.historicalEstimate, 0);
  assert.ok(allFinite(manyExcluded));
});

test("modelo 8. menos de 3 meses válidos na média ponderada: mesma regra de antes (renormaliza os pesos)", () => {
  const recent = { diaadia: "2026-08-10", corrente: "2026-01-02" };
  const overview = buildFinancialOverview(projectionInput(settings({}), { firstTransactionDateByAccount: recent }));
  assert.equal(overview.reserve.historicalEstimate, roundMoney((3 * 900 + 2 * 800) / 5));
  assert.equal(overview.reserve.monthsAvailable, 2);
  assert.equal(overview.reserve.confidence, "media");
  const withExcluded = buildFinancialOverview(projectionInput(settings({ excludedMonths: ["2026-09"] }), {
    firstTransactionDateByAccount: recent,
  }));
  assert.equal(withExcluded.reserve.historicalEstimate, 800);
  assert.equal(withExcluded.reserve.monthsAvailable, 1);
});

test("modelo 9. gastos variáveis já lançados maiores que a estimativa continuam protegendo a reserva", () => {
  for (const model of RESERVE_PROJECTION_MODELS) {
    const overview = buildFinancialOverview(projectionInput(settings({ model, referenceMonth: "2026-06" }), {
      transactions: [...projectionHistory, tx({ account_id: "diaadia", due_date: "2026-10-28", value: 5000, status: "Pendente" })],
    }));
    assert.equal(overview.reserve.knownVariable, 5000, model);
    assert.ok(overview.reserve.historicalEstimate < 5000, model);
    assert.equal(overview.reserve.total, 5000, model);
    assert.equal(overview.reserve.categoryBreakdown.source, "registered", model);
  }
});

test("modelo 10. meses desconsiderados: pesos seguem a ordem dos 3 meses válidos", () => {
  assert.deepEqual(getHistoryMonths(2026, 10, TODAY, ["2026-08"]).map((item) => [item.key, item.weight]), [
    ["2026-09", 3], ["2026-07", 2], ["2026-06", 1],
  ]);
  // Mês futuro desconsiderado (planejamento antecipado) não afeta o histórico atual.
  assert.deepEqual(getHistoryMonths(2026, 10, TODAY, ["2027-05"]), getHistoryMonths(2026, 10, TODAY));
  assert.equal(classifyConfidence(1, monthsRequiredFor("last_month")), "alta");
  assert.equal(classifyConfidence(1, monthsRequiredFor("weighted_average")), "media");
  assert.ok(isReserveProjectionModel("reference_month"));
  assert.ok(!isReserveProjectionModel("Média ponderada"));
});
