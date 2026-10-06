import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinancialOverview,
  calculateAccountBalanceAt,
  classifyConfidence,
  estimateVariableSpending,
  getHistoryMonths,
  getTemporal,
  isVariableExpense,
  resolvePlanningRole,
  type OverviewAccount,
  type OverviewInput,
  type OverviewTransaction,
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

test("1. Pode guardar hoje = saldo disponível - compromissos - reserva", () => {
  const overview = withTransactions([
    tx({ account_id: "fixas", due_date: "2026-10-25", value: 1500, status: "Pendente" }),
  ]);
  assert.equal(overview.temporal, "current");
  assert.equal(overview.availableBalance, 12000 - 6000); // saldos - histórico jul..set (6 x 1000)
  assert.equal(overview.commitments.total, 1500);
  assert.equal(overview.reserve.historicalEstimate, 1000); // gasto após o dia 16, média ponderada
  assert.equal(overview.reserve.total, 1000);
  assert.equal(overview.canSaveToday, 6000 - 1500 - 1000);
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
  assert.equal(after.canSaveToday, before.canSaveToday);
  assert.equal(after.commitments.transfersOut, 0);
});

test("5/18. guardar R$ 5.000 reduz Pode guardar hoje uma única vez e mantém a previsão", () => {
  const before = withTransactions([]);
  const after = withTransactions(transfer("corrente", "investimento", TODAY, 5000));
  assert.equal(after.saved, 5000);
  assert.equal(after.canSaveToday, (before.canSaveToday ?? 0) - 5000);
  assert.equal(after.forecast, before.forecast);
  assert.equal(after.remainingToSave, (before.remainingToSave ?? 0) - 5000);
  assert.equal(after.goal.reference, before.goal.reference);
});

test("6/7. receita futura não entra em Pode guardar hoje, mas entra na previsão", () => {
  const before = withTransactions([]);
  const after = withTransactions([
    tx({ account_id: "corrente", due_date: "2026-10-28", type: "Receita", value: 9000, status: "Pendente" }),
  ]);
  assert.equal(after.canSaveToday, before.canSaveToday);
  assert.equal(after.income.expected, 9000);
  assert.equal(after.forecast, (before.forecast ?? 0) + 9000);
  assert.equal(after.remainingToSave, (before.remainingToSave ?? 0) + 9000);
});

test("8. compromissos futuros reduzem Pode guardar hoje e a previsão", () => {
  const before = withTransactions([]);
  const after = withTransactions([
    tx({ account_id: "fixas", due_date: "2026-10-20", value: 800, status: "Pendente" }),
  ]);
  assert.equal(after.commitments.fixedExpenses, 800);
  assert.equal(after.canSaveToday, (before.canSaveToday ?? 0) - 800);
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
  assert.notEqual(overview.canSaveToday, null);
  assert.notEqual(overview.forecast, null);
  assert.equal(overview.monthResult, null);
  assert.equal(overview.reserve.variableRealized, 250);
  assert.equal(overview.reserve.variableExpectedMonth, 1250);
});

test("13. mês passado: só realizado, sem Pode guardar hoje nem projeção", () => {
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
  assert.equal(overview.canSaveToday, null);
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
  assert.equal(overview.canSaveToday, null);
  assert.equal(overview.reserve.total, 2000); // média mensal completa
  assert.equal(overview.forecast, 10000 - 3000 - 2000);
  assert.equal(overview.saved, 1000);
  assert.equal(overview.remainingToSave, 5000 - 1000);
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
  assert.equal((edited.canSaveToday ?? 0) - (original.canSaveToday ?? 0), 1000);
  assert.equal((deleted.canSaveToday ?? 0) - (original.canSaveToday ?? 0), 1500);
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

test("moeda 9. guardar R$ 2.000 em reserva EUR: saldo -2.000, guardado +2.000, Pode guardar hoje -2.000, previsão estável", () => {
  const before = foreign([]);
  const after = foreign(transfer("corrente", "reservaEur", TODAY, 2000, 320));
  assert.equal(after.availableBalance, (before.availableBalance ?? 0) - 2000);
  assert.equal(after.saved, before.saved + 2000);
  assert.equal(after.canSaveToday, (before.canSaveToday ?? 0) - 2000);
  assert.equal(after.forecast, before.forecast);
  assert.equal(after.remainingToSave, (before.remainingToSave ?? 0) - 2000);
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
