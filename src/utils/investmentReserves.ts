import type { InvestmentExchangeRate, InvestmentOperation } from "@/src/types/investments";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { convertInvestmentValue } from "./exchangeRateCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateAccountBalanceAt } from "./financialOverview.ts";
import type {
  OverviewAccount,
  OverviewClosure,
  OverviewCompetence,
  OverviewTransaction,
} from "./financialOverview";

/*
 * Reservas em caixa no patrimônio consolidado de Investimentos.
 *
 * Elegível: Conta ativa com papel EXPLÍCITO "Reserva / investimento"
 * (planning_role = "savings"). Ficam de fora, para não contar o mesmo dinheiro
 * duas vezes:
 *   - contas "investimento por saldo" (BALANCE): já entram no patrimônio dos
 *     investimentos pelos próprios eventos;
 *   - contas de custódia (com qualquer operação de ativo): compras e vendas não
 *     geram lançamento no caixa, então o saldo poderia já estar representado
 *     pelos ativos.
 * show_on_investments_dashboard NÃO é critério: ele muda a classificação da
 * conta em outros módulos.
 *
 * Saldo = mesma regra da Visão Financeira (calculateAccountBalanceAt): último
 * fechamento anterior ao mês + lançamentos até hoje, na moeda da conta. Não há
 * rentabilidade: transferência para reserva não é lucro.
 */

export type CashReserveAccount = Pick<
  OverviewAccount,
  "id" | "name" | "type" | "currency" | "current_balance" | "active" | "investment_account_kind" | "planning_role"
>;

export type CashReserveSources = {
  accounts: CashReserveAccount[];
  competences: OverviewCompetence[];
  closures: OverviewClosure[];
  transactions: OverviewTransaction[];
};

export type CashReserveIssue = "currency_unconfirmed" | "missing_rate";

export type CashReserveRow = {
  accountId: string;
  accountName: string;
  /** Moeda original da conta; null quando ainda não foi confirmada no cadastro. */
  currency: string | null;
  /** Saldo na moeda original (nunca convertido). */
  balance: number;
  /** Quanto vale 1 unidade da moeda original na moeda de consolidação. */
  rate: number | null;
  rateSource: "PTAX" | "MANUAL" | "SAME_CURRENCY" | null;
  rateQuotedAt: string | null;
  convertedBalance: number | null;
  issue: CashReserveIssue | null;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Data local de hoje (YYYY-MM-DD), a mesma usada pela Visão Financeira. */
export function localTodayIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function getCustodyAccountIds(operations: Pick<InvestmentOperation, "account_id">[]) {
  return new Set(operations.map((operation) => operation.account_id));
}

export function isEligibleCashReserve(account: CashReserveAccount, custodyAccountIds: ReadonlySet<string>) {
  return (
    account.type === "Conta" &&
    account.active &&
    account.planning_role === "savings" &&
    account.investment_account_kind !== "BALANCE" &&
    !custodyAccountIds.has(account.id)
  );
}

/** Cotação efetiva de `from` para `to` e o registro que a originou (direto ou inverso). */
export function findExchangeRate(from: string, to: string, rates: InvestmentExchangeRate[]) {
  const source = from.trim().toUpperCase();
  const target = to.trim().toUpperCase();
  if (source === target) return { rate: 1, record: null };
  const direct = rates.find((item) => item.base_currency === source && item.quote_currency === target);
  if (direct && Number.isFinite(direct.rate) && direct.rate > 0) return { rate: direct.rate, record: direct };
  const inverse = rates.find((item) => item.base_currency === target && item.quote_currency === source);
  if (inverse && Number.isFinite(inverse.rate) && inverse.rate > 0) return { rate: 1 / inverse.rate, record: inverse };
  return null;
}

export function calculateCashReserves(params: CashReserveSources & {
  operations: Pick<InvestmentOperation, "account_id">[];
  today: string;
  consolidationCurrency: string;
  rates: InvestmentExchangeRate[];
}): CashReserveRow[] {
  const custody = getCustodyAccountIds(params.operations);

  return params.accounts
    .filter((account) => isEligibleCashReserve(account, custody))
    .map((account) => {
      const balance = roundMoney(calculateAccountBalanceAt({
        account: account as OverviewAccount,
        asOf: params.today,
        competences: params.competences,
        closures: params.closures,
        transactions: params.transactions,
      }));
      const currency = account.currency?.trim().toUpperCase() || null;
      const base = { accountId: account.id, accountName: account.name, currency, balance };

      if (!currency) {
        return { ...base, rate: null, rateSource: null, rateQuotedAt: null, convertedBalance: null, issue: "currency_unconfirmed" as const };
      }
      const found = findExchangeRate(currency, params.consolidationCurrency, params.rates);
      if (!found) {
        return { ...base, rate: null, rateSource: null, rateQuotedAt: null, convertedBalance: null, issue: "missing_rate" as const };
      }
      return {
        ...base,
        rate: found.rate,
        rateSource: found.record ? found.record.source : ("SAME_CURRENCY" as const),
        rateQuotedAt: found.record?.quoted_at ?? null,
        convertedBalance: convertInvestmentValue(balance, found.rate),
        issue: null,
      };
    })
    .sort((left, right) => left.accountName.localeCompare(right.accountName, "pt-BR"));
}

/**
 * Patrimônio consolidado = patrimônio atual dos investimentos (inalterado) +
 * reservas em caixa convertidas. `complete` é falso se qualquer parcela ficou
 * sem conversão; nesse caso o total é parcial e deve ser apresentado assim.
 */
export function summarizeConsolidatedWealth(params: {
  investmentsCurrentValue: number;
  investmentsMissingRateCount: number;
  reserves: CashReserveRow[];
}) {
  const reservesValue = roundMoney(
    params.reserves.reduce((sum, reserve) => sum + (reserve.convertedBalance ?? 0), 0),
  );
  const pendingReserveCount = params.reserves.filter((reserve) => reserve.convertedBalance === null).length;

  return {
    investmentsValue: params.investmentsCurrentValue,
    reservesValue,
    total: roundMoney(params.investmentsCurrentValue + reservesValue),
    pendingReserveCount,
    pendingInvestmentCount: params.investmentsMissingRateCount,
    complete: pendingReserveCount === 0 && params.investmentsMissingRateCount === 0,
  };
}

/**
 * Multimoeda: existe alguma Conta cadastrada (ativa ou inativa, com qualquer
 * saldo) em moeda diferente da de consolidação. Depende do cadastro, não do
 * saldo, para a interface não sumir quando uma conta é zerada ou inativada.
 * Ativos internacionais não contam: não são reserva cambial.
 */
export function usesMultipleCurrencies(
  accounts: { type: string; currency: string | null }[],
  consolidationCurrency: string,
) {
  const consolidation = consolidationCurrency.trim().toUpperCase();
  return accounts.some(
    (account) =>
      account.type === "Conta" &&
      Boolean(account.currency) &&
      account.currency!.trim().toUpperCase() !== consolidation,
  );
}

/**
 * Separa as reservas entre moeda de consolidação e demais moedas (moeda não
 * confirmada conta como "demais": não dá para afirmar que é a principal).
 * Só reagrupa os mesmos valores de calculateCashReserves.
 */
export function splitCashReservesByCurrency(reserves: CashReserveRow[], consolidationCurrency: string) {
  const consolidation = consolidationCurrency.trim().toUpperCase();
  const group = (rows: CashReserveRow[]) => ({
    count: rows.length,
    value: roundMoney(rows.reduce((sum, row) => sum + (row.convertedBalance ?? 0), 0)),
    pendingCount: rows.filter((row) => row.convertedBalance === null).length,
  });
  return {
    domestic: group(reserves.filter((row) => row.currency === consolidation)),
    foreign: group(reserves.filter((row) => row.currency !== consolidation)),
  };
}

/** Moedas das reservas elegíveis (para buscar as cotações necessárias). */
export function listCashReserveCurrencies(
  accounts: CashReserveAccount[],
  operations: Pick<InvestmentOperation, "account_id">[],
) {
  const custody = getCustodyAccountIds(operations);
  return [...new Set(
    accounts
      .filter((account) => isEligibleCashReserve(account, custody))
      .flatMap((account) => (account.currency ? [account.currency.trim().toUpperCase()] : [])),
  )];
}
