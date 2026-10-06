// Visão Financeira (Dashboard Premium). Núcleo de cálculo puro: recebe os
// dados já carregados e devolve todos os indicadores. Nada derivado é
// gravado; qualquer alteração/exclusão de lançamento muda o resultado na
// próxima carga. Valores somente na moeda principal (BRL), sem conversão.
//
// Princípios:
// - O saldo das contas é a fonte da verdade. Dinheiro já transferido para uma
//   conta de reserva/investimento já saiu do saldo da origem; por isso o
//   "guardado" NUNCA é subtraído de novo de "Pode guardar".
// - Horizonte único: a competência inteira. "Pode guardar" usa o saldo atual
//   + entradas previstas até o fim do mês - compromissos até o fim do mês -
//   reserva até o fim do mês. Receitas já realizadas estão no saldo e não são
//   somadas de novo.
// - Transferências não são receita nem despesa. Só viram "guardado" quando o
//   DESTINO é uma conta com papel "savings" no planejamento.
// - Fatura e compras do cartão nunca são contadas juntas: a fatura de uma
//   competência é o lançamento "Pagamento de Fatura" quando existe; senão é
//   projetada a partir das compras da competência anterior.
// - Nada depende de nome de conta, banco, cartão ou categoria.

// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountFinalBalance, calculateCardRealizedValue } from "./balanceCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { PRIMARY_CURRENCY, resolveAccountCurrency } from "./currencies.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isInvestmentAccount } from "./closingAccounts.ts";

export type PlanningRole = "operational" | "savings" | "excluded";

export const PLANNING_ROLE_LABELS: Record<PlanningRole, string> = {
  operational: "Operacional (saldo disponível)",
  savings: "Reserva / investimento (dinheiro guardado)",
  excluded: "Fora do planejamento",
};

export type OverviewAccount = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  currency: string | null;
  current_balance: number | null;
  active: boolean;
  show_on_investments_dashboard?: boolean | null;
  investment_account_kind?: "BALANCE" | null;
  planning_role?: PlanningRole | null;
  use_spending_history?: boolean | null;
  spending_history_start_date?: string | null;
  due_day?: number | null;
};

export type OverviewTransaction = {
  id: string;
  account_id: string | null;
  competence_id: string;
  due_date: string;
  type: string;
  value: number;
  status: string | null;
  description?: string | null;
  origin_account_id?: string | null;
  destination_account_id?: string | null;
  recurring_transaction_id?: string | null;
  mode?: string | null;
  parcel_number?: number | null;
  category_id?: string | null;
  /** Conta de investimento do evento integrado (resolvida pelo carregamento). */
  investment_account_id?: string | null;
  investment_event_type?: string | null;
};

export type OverviewCompetence = { id: string; month: number; year: number };
export type OverviewClosure = {
  account_id: string;
  competence_id: string;
  closing_balance: number | null;
};
export type OverviewCardStatement = {
  account_id: string;
  competence_id: string;
  payment_transaction_id: string | null;
};
export type OverviewRecurring = {
  id: string;
  type: "income" | "expense";
  amount: number;
  account_id: string | null;
  start_competence_id: string;
  end_competence_id: string | null;
};

export type OverviewInput = {
  /** Data de hoje, YYYY-MM-DD. */
  today: string;
  year: number;
  month: number;
  accounts: OverviewAccount[];
  competences: OverviewCompetence[];
  closures: OverviewClosure[];
  cardStatements: OverviewCardStatement[];
  recurring: OverviewRecurring[];
  /** União dos lançamentos carregados (saldos, mês, mês anterior, histórico). */
  transactions: OverviewTransaction[];
  /** Data do primeiro lançamento de cada conta (para disponibilidade do histórico). */
  firstTransactionDateByAccount: Record<string, string>;
  savingsGoal: number | null;
  /** Metas mensais (financial_targets) dos cartões na competência. */
  cardTargets: Record<string, number>;
  /** Nomes das categorias (id -> nome), para o detalhamento da reserva. */
  categoryNames?: Record<string, string>;
};

export type Temporal = "past" | "current" | "future";
export type Confidence = "alta" | "media" | "baixa" | "indisponivel";

export const HISTORY_MONTHS = 3;
/** Pesos do mês mais recente para o mais antigo. */
export const HISTORY_WEIGHTS = [3, 2, 1] as const;

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------
const pad = (value: number) => String(value).padStart(2, "0");

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function monthStart(year: number, month: number) {
  return `${year}-${pad(month)}-01`;
}

export function monthEnd(year: number, month: number) {
  return `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

export function shiftMonth(year: number, month: number, offset: number) {
  const date = new Date(year, month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function getTemporal(year: number, month: number, today: string): Temporal {
  const selected = year * 100 + month;
  const current = Number(today.slice(0, 4)) * 100 + Number(today.slice(5, 7));
  if (selected < current) return "past";
  if (selected > current) return "future";
  return "current";
}

const dayOf = (date: string) => Number(date.slice(8, 10));
const monthKey = (date: string) => date.slice(0, 7);

// ---------------------------------------------------------------------------
// Configuração das contas
// ---------------------------------------------------------------------------

/** Papel efetivo: o configurado ou, se vazio, o automático pelo cadastro. */
export function resolvePlanningRole(account: OverviewAccount): PlanningRole {
  if (account.planning_role) return account.planning_role;
  if (
    account.type === "Conta" &&
    isInvestmentAccount({
      id: account.id,
      type: account.type,
      show_on_investments_dashboard: account.show_on_investments_dashboard ?? false,
      investment_account_kind: account.investment_account_kind ?? null,
    })
  ) {
    return "savings";
  }
  return "operational";
}

const isPrimary = (account: OverviewAccount) =>
  resolveAccountCurrency(account.currency) === PRIMARY_CURRENCY;

/** Despesa variável (gasto do dia a dia): não recorrente, não parcelada. */
export function isVariableExpense(transaction: OverviewTransaction) {
  return (
    transaction.type === "Despesa" &&
    !transaction.recurring_transaction_id &&
    transaction.mode !== "recorrente" &&
    transaction.mode !== "parcelado" &&
    (transaction.parcel_number === null || transaction.parcel_number === undefined)
  );
}

const isOutgoingTransfer = (transaction: OverviewTransaction) =>
  transaction.type === "Transferência" && transaction.status !== "Recebido";
const isIncomingTransfer = (transaction: OverviewTransaction) =>
  transaction.type === "Transferência" && transaction.status === "Recebido";

// ---------------------------------------------------------------------------
// Saldo atual de uma conta
// ---------------------------------------------------------------------------

/**
 * Saldo até `asOf`: último fechamento de conta ANTERIOR ao mês de `asOf`
 * (closing_balance, que pode ter sido conferido com o banco) + lançamentos
 * das competências seguintes com data até `asOf`. Sem fechamento: saldo
 * inicial do cadastro (current_balance) + todos os lançamentos até `asOf`.
 * Débitos/créditos seguem calculateAccountFinalBalance (mesma regra do app).
 */
export function calculateAccountBalanceAt(params: {
  account: OverviewAccount;
  asOf: string;
  competences: OverviewCompetence[];
  closures: OverviewClosure[];
  transactions: OverviewTransaction[];
}) {
  const order = new Map(params.competences.map((item) => [item.id, item.year * 100 + item.month]));
  const asOfOrder = Number(params.asOf.slice(0, 4)) * 100 + Number(params.asOf.slice(5, 7));

  const latestClosure = params.closures
    .filter((closure) => closure.account_id === params.account.id)
    .map((closure) => ({ closure, order: order.get(closure.competence_id) ?? null }))
    .filter((item): item is { closure: OverviewClosure; order: number } =>
      item.order !== null && item.order < asOfOrder && item.closure.closing_balance !== null)
    .sort((left, right) => right.order - left.order)[0];

  const movements = params.transactions.filter((transaction) => {
    if (transaction.account_id !== params.account.id) return false;
    if (transaction.due_date > params.asOf) return false;
    if (!latestClosure) return true;
    const transactionOrder = order.get(transaction.competence_id);
    return transactionOrder !== undefined && transactionOrder > latestClosure.order;
  });

  return calculateAccountFinalBalance({
    accountId: params.account.id,
    openingBalance: latestClosure
      ? Number(latestClosure.closure.closing_balance)
      : Number(params.account.current_balance ?? 0),
    transactions: movements.map((transaction) => ({ ...transaction, value: Number(transaction.value) })),
  });
}

// ---------------------------------------------------------------------------
// Reserva estimada pelo histórico
// ---------------------------------------------------------------------------

export type HistoryMonth = {
  key: string;
  year: number;
  month: number;
  weight: number;
};

export function getHistoryMonths(year: number, month: number, today: string): HistoryMonth[] {
  // Meses COMPLETOS: antes do mês selecionado e nunca depois do mês atual.
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const reference =
    year * 100 + month <= currentYear * 100 + currentMonth
      ? { year, month }
      : { year: currentYear, month: currentMonth };

  return HISTORY_WEIGHTS.map((weight, index) => {
    const shifted = shiftMonth(reference.year, reference.month, -(index + 1));
    return { ...shifted, key: `${shifted.year}-${pad(shifted.month)}`, weight };
  });
}

/**
 * Um mês só entra no histórico de uma conta se for inteiro depois da "data
 * inicial do histórico" configurada e se a conta já tinha lançamentos até o
 * fim daquele mês (conta nova não conta como mês de gasto zero).
 */
export function isHistoryMonthAvailable(
  account: OverviewAccount,
  historyMonth: HistoryMonth,
  firstTransactionDate: string | undefined,
) {
  if (account.spending_history_start_date &&
      account.spending_history_start_date > monthStart(historyMonth.year, historyMonth.month)) {
    return false;
  }
  if (!firstTransactionDate) return false;
  return firstTransactionDate <= monthEnd(historyMonth.year, historyMonth.month);
}

export type HistoryEstimate = {
  /** Gasto variável esperado após `afterDay` (média ponderada, soma das contas). */
  remaining: number;
  /** Gasto variável médio do mês inteiro (média ponderada). */
  fullMonth: number;
  /** Menor quantidade de meses disponíveis entre as contas (0 a 3). */
  monthsAvailable: number | null;
  months: { key: string; weight: number; accountsAvailable: number; remaining: number; fullMonth: number }[];
  /**
   * Mesma média ponderada, separada por categoria (chave = category_id ou
   * UNCATEGORIZED_KEY). Valores sem arredondar: somam exatamente remaining /
   * fullMonth antes do arredondamento do total.
   */
  remainingByCategory: Record<string, number>;
  fullMonthByCategory: Record<string, number>;
};

export const UNCATEGORIZED_KEY = "__sem_categoria__";
const categoryKeyOf = (transaction: OverviewTransaction) => transaction.category_id || UNCATEGORIZED_KEY;

export function estimateVariableSpending(params: {
  historyAccounts: OverviewAccount[];
  historyMonths: HistoryMonth[];
  transactions: OverviewTransaction[];
  firstTransactionDateByAccount: Record<string, string>;
  /** Dia de hoje no mês selecionado; gasto restante = dias depois dele. 0 = mês inteiro. */
  afterDay: number;
}): HistoryEstimate {
  const months = params.historyMonths.map((item) => ({
    key: item.key,
    weight: item.weight,
    accountsAvailable: 0,
    remaining: 0,
    fullMonth: 0,
  }));

  const remainingByCategory: Record<string, number> = {};
  const fullMonthByCategory: Record<string, number> = {};

  if (params.historyAccounts.length === 0) {
    return { remaining: 0, fullMonth: 0, monthsAvailable: null, months, remainingByCategory, fullMonthByCategory };
  }

  let remaining = 0;
  let fullMonth = 0;
  let minimumMonths = Infinity;

  for (const account of params.historyAccounts) {
    let weightSum = 0;
    let remainingSum = 0;
    let fullSum = 0;
    let available = 0;
    let hasSpending = false;
    // Somas ponderadas por categoria desta conta (dividem pelo mesmo weightSum).
    const accountRemainingByCategory: Record<string, number> = {};
    const accountFullByCategory: Record<string, number> = {};

    params.historyMonths.forEach((historyMonth, index) => {
      if (!isHistoryMonthAvailable(account, historyMonth, params.firstTransactionDateByAccount[account.id])) {
        return;
      }
      available += 1;
      const lastDay = daysInMonth(historyMonth.year, historyMonth.month);
      const fromDay = Math.min(params.afterDay, lastDay);
      const spending = params.transactions.filter((transaction) =>
        transaction.account_id === account.id &&
        monthKey(transaction.due_date) === historyMonth.key &&
        isVariableExpense(transaction) &&
        (!account.spending_history_start_date || transaction.due_date >= account.spending_history_start_date));
      const monthFull = spending.reduce((sum, item) => sum + Number(item.value), 0);
      const monthRemaining = spending
        .filter((item) => dayOf(item.due_date) > fromDay)
        .reduce((sum, item) => sum + Number(item.value), 0);

      if (spending.length > 0) hasSpending = true;
      for (const item of spending) {
        const key = categoryKeyOf(item);
        const weighted = historyMonth.weight * Number(item.value);
        accountFullByCategory[key] = (accountFullByCategory[key] ?? 0) + weighted;
        if (dayOf(item.due_date) > fromDay) {
          accountRemainingByCategory[key] = (accountRemainingByCategory[key] ?? 0) + weighted;
        }
      }
      weightSum += historyMonth.weight;
      remainingSum += historyMonth.weight * monthRemaining;
      fullSum += historyMonth.weight * monthFull;
      months[index].accountsAvailable += 1;
      months[index].remaining += monthRemaining;
      months[index].fullMonth += monthFull;
    });

    // Confiança: conta sem nenhum gasto variável no histórico e sem data
    // inicial configurada não influencia (contribui 0 e não é "pouco
    // histórico"). Com data inicial configurada (mudança de comportamento),
    // ela sempre conta, mesmo sem gastos ainda.
    if (hasSpending || account.spending_history_start_date) {
      minimumMonths = Math.min(minimumMonths, available);
    }
    if (weightSum > 0) {
      remaining += remainingSum / weightSum;
      fullMonth += fullSum / weightSum;
      for (const [key, value] of Object.entries(accountRemainingByCategory)) {
        remainingByCategory[key] = (remainingByCategory[key] ?? 0) + value / weightSum;
      }
      for (const [key, value] of Object.entries(accountFullByCategory)) {
        fullMonthByCategory[key] = (fullMonthByCategory[key] ?? 0) + value / weightSum;
      }
    }
  }

  return {
    remaining: roundMoney(remaining),
    fullMonth: roundMoney(fullMonth),
    monthsAvailable: minimumMonths === Infinity ? 0 : minimumMonths,
    months,
    remainingByCategory,
    fullMonthByCategory,
  };
}

/**
 * Distribui um total em centavos proporcionalmente aos pesos (maior resto):
 * a soma das partes é EXATAMENTE o total.
 */
export function allocateCents(weights: Record<string, number>, totalCents: number) {
  const entries = Object.entries(weights).filter(([, value]) => value > 0);
  const weightSum = entries.reduce((sum, [, value]) => sum + value, 0);
  const result: Record<string, number> = {};
  if (totalCents <= 0 || weightSum <= 0) return result;
  const shares = entries.map(([key, value]) => {
    const exact = (value / weightSum) * totalCents;
    return { key, floor: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let leftover = totalCents - shares.reduce((sum, item) => sum + item.floor, 0);
  shares
    .sort((left, right) => right.fraction - left.fraction || left.key.localeCompare(right.key))
    .forEach((item) => {
      result[item.key] = item.floor + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover -= 1;
    });
  return result;
}

export const RESERVE_TOP_CATEGORIES = 10;

export type ReserveCategoryBreakdown = {
  /** Origem da composição (D1): histórico ou gastos variáveis já lançados. */
  source: "historical" | "registered";
  total: number;
  items: { key: string; name: string; amount: number }[];
  others: { amount: number; count: number } | null;
};

/**
 * Top 10 categorias + "Outras categorias", fechando exatamente com o total da
 * reserva (centavos). Valores zero não aparecem.
 */
export function buildReserveCategoryBreakdown(params: {
  total: number;
  weights: Record<string, number>;
  source: ReserveCategoryBreakdown["source"];
  categoryNames: Record<string, string>;
}): ReserveCategoryBreakdown {
  const cents = allocateCents(params.weights, Math.round(params.total * 100));
  const nameOf = (key: string) =>
    key === UNCATEGORIZED_KEY ? "Sem categoria" : params.categoryNames[key] ?? "Categoria sem nome";
  const ranked = Object.entries(cents)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ key, name: nameOf(key), cents: value }))
    .sort((left, right) => right.cents - left.cents || left.name.localeCompare(right.name, "pt-BR"));
  const top = ranked.slice(0, RESERVE_TOP_CATEGORIES);
  const rest = ranked.slice(RESERVE_TOP_CATEGORIES);
  return {
    source: params.source,
    total: params.total,
    items: top.map((item) => ({ key: item.key, name: item.name, amount: item.cents / 100 })),
    others: rest.length > 0
      ? { amount: rest.reduce((sum, item) => sum + item.cents, 0) / 100, count: rest.length }
      : null,
  };
}

/**
 * Regra objetiva: sem contas de histórico -> indisponível; 0 meses completos
 * -> baixa; 1 ou 2 -> média; 3 -> alta. Usa o menor número de meses entre as
 * contas que entram no histórico.
 */
export function classifyConfidence(monthsAvailable: number | null): Confidence {
  if (monthsAvailable === null) return "indisponivel";
  if (monthsAvailable >= HISTORY_MONTHS) return "alta";
  if (monthsAvailable >= 1) return "media";
  return "baixa";
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type SavingsMovement = {
  id: string;
  date: string;
  fromName: string;
  toName: string;
  value: number;
  kind: "deposit" | "withdrawal";
  scheduled: boolean;
};

export type FinancialOverview = {
  temporal: Temporal;
  year: number;
  month: number;
  monthEnd: string;
  daysRemaining: number;
  competenceId: string | null;
  hasPlanningAccounts: boolean;

  /** Saldo atual das contas operacionais (somente mês atual). */
  availableBalance: number | null;
  accountBalances: { id: string; name: string; balance: number }[];

  commitments: {
    total: number;
    fixedExpenses: number;
    invoicePayments: number;
    projectedInvoices: number;
    recurringNotGenerated: number;
    transfersOut: number;
  };

  reserve: {
    total: number;
    historicalEstimate: number;
    knownVariable: number;
    estimatedNotRegistered: number;
    historicalMonthlyAverage: number;
    variableRealized: number;
    variableExpectedMonth: number;
    confidence: Confidence;
    monthsAvailable: number | null;
    historyMonths: HistoryEstimate["months"];
    historyAccounts: number;
    /** Decomposição da MESMA reserva final por categoria (fecha em centavos). */
    categoryBreakdown: ReserveCategoryBreakdown;
  };

  income: {
    realized: number;
    expected: number;
    transferInflows: number;
  };
  /** Saídas realizadas no mês (despesas, faturas pagas e transferências para fora), sem o guardado. */
  realizedOutflows: number;

  /**
   * Pode guardar: quanto AINDA pode ser separado dentro da competência.
   * Atual: saldo + entradas previstas - compromissos - reserva.
   * Futuro: previsão do mês - guardado já programado. Passado: null.
   * Sempre vale: Previsão de economia = Guardado + Pode guardar.
   */
  canSave: number | null;
  /** Entradas previstas ainda por acontecer (receitas + transferências de fora do planejamento). */
  expectedInflows: number;
  /** Guardado (mês atual: até hoje; passado: no mês; futuro: programado). */
  saved: number;
  savedScheduled: number;
  savingsMovements: SavingsMovement[];
  /** Previsão total de economia (atual/futuro). */
  forecast: number | null;
  /** Resultado do mês (passado): entradas - saídas, sem contar o guardado. */
  monthResult: number | null;

  goal: {
    amount: number | null;
    /** Valor comparado com a meta (guardado no passado; previsão no atual/futuro). */
    reference: number | null;
    progress: number | null;
    difference: number | null;
    savedProgress: number | null;
  };

  cards: {
    used: number;
    target: number;
    progress: number | null;
    availableInTarget: number | null;
    invoicesDueThisMonth: number;
    cardsCount: number;
  };

  otherCurrencyAccounts: { id: string; name: string; currency: string; balance: number }[];
};

export function buildFinancialOverview(input: OverviewInput): FinancialOverview {
  const temporal = getTemporal(input.year, input.month, input.today);
  const end = monthEnd(input.year, input.month);
  const lastDay = daysInMonth(input.year, input.month);
  const todayDay = dayOf(input.today);
  const competence = input.competences.find((item) => item.year === input.year && item.month === input.month);
  const previous = shiftMonth(input.year, input.month, -1);
  const previousCompetence = input.competences.find((item) => item.year === previous.year && item.month === previous.month);
  const competenceOrder = new Map(input.competences.map((item) => [item.id, item.year * 100 + item.month]));
  const selectedOrder = input.year * 100 + input.month;

  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  const roleOf = (accountId: string | null | undefined) => {
    const account = accountId ? accountsById.get(accountId) : undefined;
    return account ? resolvePlanningRole(account) : null;
  };

  const operationalCash = input.accounts.filter((account) =>
    account.active && account.type === "Conta" && isPrimary(account) && resolvePlanningRole(account) === "operational");
  const operationalCards = input.accounts.filter((account) =>
    account.active && account.type === "Cartão" && isPrimary(account) && resolvePlanningRole(account) === "operational");
  const historyAccounts = operationalCash.filter((account) => account.use_spending_history !== false);
  const poolIds = new Set(operationalCash.map((account) => account.id));
  const historyIds = new Set(historyAccounts.map((account) => account.id));
  const cardIds = new Set(operationalCards.map((account) => account.id));

  // Saldos (somente no mês atual existe "saldo disponível hoje").
  const balanceOf = (account: OverviewAccount) => calculateAccountBalanceAt({
    account,
    asOf: input.today,
    competences: input.competences,
    closures: input.closures,
    transactions: input.transactions,
  });
  const accountBalances = temporal === "current"
    ? operationalCash.map((account) => ({ id: account.id, name: account.name, balance: roundMoney(balanceOf(account)) }))
    : [];
  const availableBalance = temporal === "current"
    ? roundMoney(accountBalances.reduce((sum, item) => sum + item.balance, 0))
    : null;

  const otherCurrencyAccounts = temporal === "current"
    ? input.accounts
        .filter((account) => account.active && account.type === "Conta" && !isPrimary(account) && resolvePlanningRole(account) === "operational")
        .map((account) => ({
          id: account.id,
          name: account.name,
          currency: resolveAccountCurrency(account.currency),
          balance: roundMoney(balanceOf(account)),
        }))
    : [];

  const monthTransactions = competence
    ? input.transactions.filter((transaction) => transaction.competence_id === competence.id)
    : [];
  // "Ainda por acontecer": no mês atual, depois de hoje; no futuro, tudo.
  const isPending = (transaction: OverviewTransaction) =>
    temporal === "future" || (temporal === "current" && transaction.due_date > input.today);
  const isRealized = (transaction: OverviewTransaction) =>
    temporal === "past" || (temporal === "current" && transaction.due_date <= input.today);

  const commitments = {
    total: 0,
    fixedExpenses: 0,
    invoicePayments: 0,
    projectedInvoices: 0,
    recurringNotGenerated: 0,
    transfersOut: 0,
  };
  let knownVariable = 0;
  const knownVariableByCategory: Record<string, number> = {};
  let variableRealized = 0;
  let incomeRealized = 0;
  let incomeExpected = 0;
  let transferInflowsPending = 0;
  let transferInflowsRealized = 0;
  let realizedOutflows = 0;
  let saved = 0;
  let savedScheduled = 0;
  const savingsMovements: SavingsMovement[] = [];
  const nameOf = (accountId: string | null | undefined) =>
    (accountId && accountsById.get(accountId)?.name) || "Conta";

  for (const transaction of monthTransactions) {
    const accountId = transaction.account_id;
    if (!accountId || !poolIds.has(accountId)) continue;
    const value = Math.abs(Number(transaction.value));
    const pending = isPending(transaction);
    const realized = isRealized(transaction);

    if (transaction.type === "Receita") {
      if (pending) incomeExpected += value;
      if (realized) incomeRealized += value;
      continue;
    }

    if (transaction.type === "Despesa") {
      const variable = historyIds.has(accountId) && isVariableExpense(transaction);
      if (variable) {
        if (pending) {
          knownVariable += value;
          const key = categoryKeyOf(transaction);
          knownVariableByCategory[key] = (knownVariableByCategory[key] ?? 0) + value;
        }
        if (realized) variableRealized += value;
      } else if (pending) {
        commitments.fixedExpenses += value;
      }
      if (realized) realizedOutflows += value;
      continue;
    }

    if (transaction.type === "Pagamento de Fatura") {
      if (pending) commitments.invoicePayments += value;
      if (realized) realizedOutflows += value;
      continue;
    }

    if (isOutgoingTransfer(transaction)) {
      const destinationId = transaction.destination_account_id ?? transaction.investment_account_id ?? null;
      if (roleOf(destinationId) === "savings") {
        // Guardado: sai da conta operacional para reserva/investimento.
        if (realized) saved += value;
        if (pending) savedScheduled += value;
        savingsMovements.push({
          id: transaction.id, date: transaction.due_date, fromName: nameOf(accountId),
          toName: nameOf(destinationId), value, kind: "deposit", scheduled: pending,
        });
      } else if (destinationId && poolIds.has(destinationId)) {
        // Transferência interna entre contas operacionais: não altera o total.
      } else {
        if (pending) commitments.transfersOut += value;
        if (realized) realizedOutflows += value;
      }
      continue;
    }

    if (isIncomingTransfer(transaction)) {
      const originId = transaction.origin_account_id ?? transaction.investment_account_id ?? null;
      if (roleOf(originId) === "savings") {
        // Resgate: volta da reserva/investimento para a conta operacional.
        if (realized) saved -= value;
        if (pending) savedScheduled -= value;
        savingsMovements.push({
          id: transaction.id, date: transaction.due_date, fromName: nameOf(originId),
          toName: nameOf(accountId), value, kind: "withdrawal", scheduled: pending,
        });
      } else if (originId && poolIds.has(originId)) {
        // Interna.
      } else {
        if (pending) transferInflowsPending += value;
        if (realized) transferInflowsRealized += value;
      }
    }
  }

  // Faturas projetadas: compras da competência anterior em cartões
  // operacionais, quando a fatura ainda não virou "Pagamento de Fatura".
  let projectedInvoices = 0;
  let invoicePaymentsInMonth = 0;
  if (temporal !== "past") {
    for (const card of operationalCards) {
      const statement = previousCompetence
        ? input.cardStatements.find((item) => item.account_id === card.id && item.competence_id === previousCompetence.id)
        : undefined;
      if (statement?.payment_transaction_id) continue;
      const purchases = previousCompetence
        ? input.transactions.filter((transaction) =>
            transaction.account_id === card.id && transaction.competence_id === previousCompetence.id)
        : [];
      projectedInvoices += Math.max(0, calculateCardRealizedValue(
        purchases.map((transaction) => ({ ...transaction, value: Number(transaction.value) })),
      ));
    }
  }
  commitments.projectedInvoices = projectedInvoices;
  invoicePaymentsInMonth = monthTransactions
    .filter((transaction) => transaction.type === "Pagamento de Fatura" && poolIds.has(transaction.account_id ?? ""))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.value)), 0);

  // Recorrências ativas ainda não geradas na competência (sem duplicar as já geradas).
  let recurringIncome = 0;
  if (temporal !== "past" && competence) {
    const generated = new Set(monthTransactions.map((transaction) => transaction.recurring_transaction_id).filter(Boolean));
    for (const template of input.recurring) {
      if (generated.has(template.id) || !template.account_id || !poolIds.has(template.account_id)) continue;
      const start = competenceOrder.get(template.start_competence_id);
      const finish = template.end_competence_id ? competenceOrder.get(template.end_competence_id) : null;
      if (start === undefined || start > selectedOrder) continue;
      if (finish !== null && finish !== undefined && finish < selectedOrder) continue;
      if (template.type === "expense") commitments.recurringNotGenerated += Math.abs(Number(template.amount));
      else recurringIncome += Math.abs(Number(template.amount));
    }
  }
  incomeExpected += recurringIncome;

  commitments.total = roundMoney(
    commitments.fixedExpenses + commitments.invoicePayments + commitments.projectedInvoices +
    commitments.recurringNotGenerated + commitments.transfersOut,
  );

  // Reserva para gastos variáveis.
  const historyMonths = getHistoryMonths(input.year, input.month, input.today);
  const estimate = estimateVariableSpending({
    historyAccounts,
    historyMonths,
    transactions: input.transactions,
    firstTransactionDateByAccount: input.firstTransactionDateByAccount,
    afterDay: temporal === "current" ? todayDay : 0,
  });
  const historicalEstimate = temporal === "past" ? 0 : (temporal === "current" ? estimate.remaining : estimate.fullMonth);
  // Lançamentos variáveis já previstos fazem parte do gasto esperado: a reserva
  // é o maior dos dois, sem somar o mesmo gasto duas vezes.
  const reserveTotal = temporal === "past" ? 0 : roundMoney(Math.max(historicalEstimate, knownVariable));
  const reserve = {
    total: reserveTotal,
    historicalEstimate: roundMoney(historicalEstimate),
    knownVariable: roundMoney(knownVariable),
    estimatedNotRegistered: roundMoney(Math.max(0, historicalEstimate - knownVariable)),
    historicalMonthlyAverage: estimate.fullMonth,
    variableRealized: roundMoney(variableRealized),
    variableExpectedMonth: roundMoney(variableRealized + reserveTotal),
    confidence: classifyConfidence(estimate.monthsAvailable),
    monthsAvailable: estimate.monthsAvailable,
    historyMonths: estimate.months,
    historyAccounts: historyAccounts.length,
    // D1: a reserva é o maior entre histórico e já lançados. A composição
    // segue a mesma origem: se vale o histórico, decompõe o histórico (os
    // lançados fazem parte dele); se valem os lançados, decompõe os lançados.
    // Nunca soma os dois.
    categoryBreakdown: buildReserveCategoryBreakdown({
      total: reserveTotal,
      source: knownVariable > historicalEstimate ? "registered" : "historical",
      weights: knownVariable > historicalEstimate
        ? knownVariableByCategory
        : temporal === "current" ? estimate.remainingByCategory : estimate.fullMonthByCategory,
      categoryNames: input.categoryNames ?? {},
    }),
  };

  const incomeExpectedTotal = roundMoney(incomeExpected);
  let canSave: number | null = null;
  let forecast: number | null = null;
  let monthResult: number | null = null;

  if (temporal === "current") {
    // Mesmo horizonte (fim da competência) para entradas, compromissos e reserva.
    canSave = roundMoney(
      (availableBalance ?? 0) + incomeExpectedTotal + transferInflowsPending - commitments.total - reserve.total,
    );
    forecast = roundMoney(saved + canSave);
  } else if (temporal === "future") {
    forecast = roundMoney(incomeExpectedTotal + transferInflowsPending - commitments.total - reserve.total);
    canSave = roundMoney(forecast - savedScheduled);
  } else {
    monthResult = roundMoney(incomeRealized + transferInflowsRealized - realizedOutflows);
  }

  const savedValue = roundMoney(temporal === "future" ? savedScheduled : saved);
  const goalAmount = input.savingsGoal;
  const goalReference = temporal === "past" ? savedValue : forecast;
  const goal = {
    amount: goalAmount,
    reference: goalReference,
    progress: goalAmount && goalAmount > 0 && goalReference !== null ? goalReference / goalAmount : null,
    difference: goalAmount !== null && goalReference !== null ? roundMoney(goalReference - goalAmount) : null,
    savedProgress: goalAmount && goalAmount > 0 ? savedValue / goalAmount : null,
  };

  const cardsUsed = roundMoney(monthTransactions
    .filter((transaction) => cardIds.has(transaction.account_id ?? ""))
    .reduce((sum, transaction) => {
      if (transaction.type === "Despesa") return sum + Number(transaction.value);
      if (transaction.type === "Receita") return sum - Number(transaction.value);
      return sum;
    }, 0));
  const cardsTarget = roundMoney(operationalCards.reduce((sum, card) => sum + Number(input.cardTargets[card.id] ?? 0), 0));

  return {
    temporal,
    year: input.year,
    month: input.month,
    monthEnd: end,
    daysRemaining: temporal === "current" ? lastDay - todayDay : temporal === "future" ? lastDay : 0,
    competenceId: competence?.id ?? null,
    hasPlanningAccounts: operationalCash.length > 0,
    availableBalance,
    accountBalances,
    commitments: {
      total: commitments.total,
      fixedExpenses: roundMoney(commitments.fixedExpenses),
      invoicePayments: roundMoney(commitments.invoicePayments),
      projectedInvoices: roundMoney(commitments.projectedInvoices),
      recurringNotGenerated: roundMoney(commitments.recurringNotGenerated),
      transfersOut: roundMoney(commitments.transfersOut),
    },
    reserve,
    realizedOutflows: roundMoney(realizedOutflows),
    income: {
      realized: roundMoney(incomeRealized),
      expected: incomeExpectedTotal,
      transferInflows: roundMoney(temporal === "past" ? transferInflowsRealized : transferInflowsPending),
    },
    canSave,
    expectedInflows: roundMoney(temporal === "past" ? 0 : incomeExpectedTotal + transferInflowsPending),
    saved: savedValue,
    savedScheduled: roundMoney(savedScheduled),
    savingsMovements: savingsMovements.sort((left, right) => right.date.localeCompare(left.date)),
    forecast,
    monthResult,
    goal,
    cards: {
      used: cardsUsed,
      target: cardsTarget,
      progress: cardsTarget > 0 ? cardsUsed / cardsTarget : null,
      availableInTarget: cardsTarget > 0 ? roundMoney(cardsTarget - cardsUsed) : null,
      invoicesDueThisMonth: roundMoney(invoicePaymentsInMonth + projectedInvoices),
      cardsCount: operationalCards.length,
    },
    otherCurrencyAccounts,
  };
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  indisponivel: "Indisponível",
};

export function describeConfidence(confidence: Confidence, monthsAvailable: number | null) {
  if (confidence === "indisponivel") {
    return "Nenhuma conta está configurada para entrar no histórico de gastos.";
  }
  if (confidence === "baixa") {
    return "Histórico insuficiente: nenhum mês completo disponível para estimar a reserva.";
  }
  return `Baseada em ${monthsAvailable} de ${HISTORY_MONTHS} meses completos de histórico (média ponderada, meses recentes pesam mais).`;
}
