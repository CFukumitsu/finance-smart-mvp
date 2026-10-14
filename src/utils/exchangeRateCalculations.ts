import type { InvestmentExchangeRate } from "@/src/types/investments";

export const EXCHANGE_RATE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function isExchangeRateStale(
  rate: Pick<InvestmentExchangeRate, "updated_at">,
  now = Date.now(),
) {
  const updatedAt = Date.parse(rate.updated_at);
  return !Number.isFinite(updatedAt) || now - updatedAt > EXCHANGE_RATE_MAX_AGE_MS;
}

export function resolveExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rates: InvestmentExchangeRate[],
) {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) return 1;

  const direct = rates.find(
    (item) => item.base_currency === from && item.quote_currency === to,
  );
  if (direct && Number.isFinite(direct.rate) && direct.rate > 0) {
    return direct.rate;
  }

  const inverse = rates.find(
    (item) => item.base_currency === to && item.quote_currency === from,
  );
  if (inverse && Number.isFinite(inverse.rate) && inverse.rate > 0) {
    return 1 / inverse.rate;
  }

  return null;
}

/** Moedas com PTAX automática contra o BRL. */
export const PTAX_CURRENCIES = ["USD", "EUR", "GBP"] as const;

/** Moedas X (USD/EUR/GBP) cujo par X/BRL é necessário para consolidar `currencies`. */
export function listRequiredPtaxCurrencies(currencies: string[], consolidationCurrency: string) {
  const consolidation = consolidationCurrency.toUpperCase();
  const needed = new Set<string>();
  for (const raw of currencies) {
    const pair = new Set([raw.toUpperCase(), consolidation]);
    for (const ptax of PTAX_CURRENCIES) {
      if (pair.has(ptax) && pair.has("BRL")) needed.add(ptax);
    }
  }
  return PTAX_CURRENCIES.filter((currency) => needed.has(currency));
}

export function convertInvestmentValue(value: number, rate: number | null) {
  if (!Number.isFinite(value) || rate === null || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return Math.round((value * rate + Number.EPSILON) * 100) / 100;
}
