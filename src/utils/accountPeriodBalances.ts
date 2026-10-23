// Saldos de uma conta no resumo de Lançamentos, pela regra canônica do app
// (calculateAccountBalanceAt, a mesma do "Saldo atual" da Visão Financeira e
// dos atalhos). Não depende de busca, tipo, status ou categoria: saldo é a
// posição da conta, não o resultado de um filtro.

// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountBalanceAt, getTemporal, shiftMonth, type OverviewAccount, type OverviewClosure, type OverviewCompetence, type OverviewTransaction, type Temporal } from "./financialOverview.ts";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Data de referência "antes do dia 1" da competência. Na regra canônica ela
 * usa o último fechamento ANTERIOR ao mês e nenhum lançamento do próprio mês
 * ("YYYY-MM-00" é menor que qualquer data do mês na comparação de texto).
 */
export function getCompetenceStartReference(year: number, month: number) {
  return `${year}-${pad(month)}-00`;
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
  const balanceAt = (asOf: string) =>
    calculateAccountBalanceAt({
      account: params.account,
      asOf,
      competences: params.competences,
      closures: params.closures,
      transactions: params.transactions,
    });
  const temporal = getTemporal(params.year, params.month, params.today);

  return {
    temporal,
    openingBalance: balanceAt(getCompetenceStartReference(params.year, params.month)),
    currentBalance: temporal === "current" ? balanceAt(params.today) : null,
    // Fim do mês = início do mês seguinte: usa o fechamento do próprio mês,
    // quando existir, como a Visão Financeira faz no mês seguinte.
    closingBalance: balanceAt(getCompetenceStartReference(next.year, next.month)),
  };
}

/** Datas de referência cujos lançamentos o cálculo acima precisa. */
export function getAccountPeriodBalanceReferences(year: number, month: number, today: string) {
  const next = shiftMonth(year, month, 1);
  return Array.from(
    new Set([
      getCompetenceStartReference(year, month),
      getCompetenceStartReference(next.year, next.month),
      ...(getTemporal(year, month, today) === "current" ? [today] : []),
    ]),
  );
}
