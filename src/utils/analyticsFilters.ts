import type {
  AnalyticsAccount,
  AnalyticsFilters,
  AnalyticsTransaction,
} from "@/src/types/analytics";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isPrimaryCurrency, listCurrencies, PRIMARY_CURRENCY, resolveAccountCurrency } from "./currencies.ts";

export function resolveAnalyticsDatasetFilters(
  pathname: string,
  filters: AnalyticsFilters
): AnalyticsFilters {
  if (pathname === "/analytics/cash-flow") {
    return { ...filters, categoryId: "", status: "" };
  }

  return filters;
}

/** Mantém somente lançamentos de contas na moeda analisada. */
export function filterAnalyticsTransactionsByCurrency(
  transactions: readonly AnalyticsTransaction[],
  currency: string
): AnalyticsTransaction[] {
  const target: string = resolveAccountCurrency(currency);
  return transactions.filter(
    (transaction) => resolveAccountCurrency(transaction.account?.currency) === target
  );
}

export function isAnalyticsAccountInCurrency(
  account: Pick<AnalyticsAccount, "currency">,
  currency: string
) {
  return resolveAccountCurrency(account.currency) === resolveAccountCurrency(currency);
}

/** Metas de categoria são definidas na moeda principal (BRL). */
export function hasAnalyticsCategoryTargets(currency: string): boolean {
  return isPrimaryCurrency(currency);
}

/** Moedas disponíveis no filtro: a principal sempre, mais as moedas das contas. */
export function listAnalyticsCurrencies(
  accounts: readonly Pick<AnalyticsAccount, "currency">[]
): string[] {
  const currencies: string[] = listCurrencies(
    accounts,
    (account: Pick<AnalyticsAccount, "currency">) => account.currency
  );
  return currencies.includes(PRIMARY_CURRENCY)
    ? currencies
    : [PRIMARY_CURRENCY, ...currencies];
}
