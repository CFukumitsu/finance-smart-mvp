// Saldos de uma conta no resumo de Lançamentos, pela regra canônica do app
// (calculateAccountBalanceAt, a mesma do "Saldo atual" da Visão Financeira e
// dos atalhos). Não depende de busca, tipo, status ou categoria: saldo é a
// posição da conta, não o resultado de um filtro.

// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountBalanceAt, getTemporal, shiftMonth, type OverviewAccount, type OverviewClosure, type OverviewCompetence, type OverviewTransaction, type Temporal } from "./financialOverview.ts";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Data de referência de um saldo. Sempre uma data válida (vai para a
 * consulta de due_date, coluna date). `exclusive` = antes de `asOf`.
 */
export type BalanceReference = { asOf: string; exclusive: boolean };

/**
 * Saldo "antes do dia 1" da competência: lançamentos com data < dia 1 e o
 * último fechamento ANTERIOR ao mês. (Antes era "YYYY-MM-00", data
 * inexistente que o Postgres rejeitava, e o resumo mostrava "Indisponível".)
 */
export function getCompetenceStartReference(year: number, month: number): BalanceReference {
  return { asOf: `${year}-${pad(month)}-01`, exclusive: true };
}

export type AccountPeriodBalances = {
  temporal: Temporal;
  /** Saldo no início da competência (fim do mês anterior). */
  openingBalance: number;
  /** Saldo hoje; só na competência atual. */
  currentBalance: number | null;
  /** Saldo no fim da competência (realizado no passado, previsto no atual/futuro). */
  closingBalance: number;
};

export function calculateAccountPeriodBalances(params: {
  account: OverviewAccount;
  year: number;
  month: number;
  /** Hoje, YYYY-MM-DD. */
  today: string;
  competences: OverviewCompetence[];
  closures: OverviewClosure[];
  transactions: OverviewTransaction[];
}): AccountPeriodBalances {
  const next = shiftMonth(params.year, params.month, 1);
  const balanceAt = (reference: BalanceReference) =>
    calculateAccountBalanceAt({
      account: params.account,
      asOf: reference.asOf,
      exclusive: reference.exclusive,
      competences: params.competences,
      closures: params.closures,
      transactions: params.transactions,
    });
  const temporal = getTemporal(params.year, params.month, params.today);

  return {
    temporal,
    openingBalance: balanceAt(getCompetenceStartReference(params.year, params.month)),
    currentBalance:
      temporal === "current" ? balanceAt({ asOf: params.today, exclusive: false }) : null,
    // Fim do mês = início do mês seguinte (data < dia 1 seguinte, sem o
    // próprio dia 1): usa o fechamento do próprio mês, quando existir, como a
    // Visão Financeira faz no mês seguinte.
    closingBalance: balanceAt(getCompetenceStartReference(next.year, next.month)),
  };
}

/** Datas de referência cujos lançamentos o cálculo acima precisa. */
export function getAccountPeriodBalanceReferences(
  year: number,
  month: number,
  today: string,
): BalanceReference[] {
  const next = shiftMonth(year, month, 1);
  return [
    getCompetenceStartReference(year, month),
    getCompetenceStartReference(next.year, next.month),
    ...(getTemporal(year, month, today) === "current"
      ? [{ asOf: today, exclusive: false }]
      : []),
  ];
}

/** Último carregamento de saldos, sempre identificado pela seleção que o pediu. */
export type AccountPeriodBalancesRequest = {
  accountId: string;
  competenceId: string;
  status: "loading" | "ready" | "error";
  balances: AccountPeriodBalances | null;
};

/**
 * O que o resumo deve mostrar para a seleção atual. O carregamento guardado
 * só vale para a mesma conta e competência: troca rápida nunca exibe saldo
 * nem erro da seleção anterior. Cartão ou nenhuma conta → nada. Busca e
 * filtros não entram.
 */
export function resolveAccountPeriodBalancesView(params: {
  selectedAccount: { id: string; type: "Conta" | "Cartão" } | null | undefined;
  competenceId: string;
  request: AccountPeriodBalancesRequest | null;
}): { status: "none" | "loading" | "ready" | "error"; balances: AccountPeriodBalances | null } {
  if (params.selectedAccount?.type !== "Conta") return { status: "none", balances: null };
  const request = params.request;
  if (
    !request ||
    request.accountId !== params.selectedAccount.id ||
    request.competenceId !== params.competenceId
  ) {
    return { status: "loading", balances: null };
  }
  return { status: request.status, balances: request.status === "ready" ? request.balances : null };
}
