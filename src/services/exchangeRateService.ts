import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type { InvestmentExchangeContext, InvestmentExchangeRate } from "@/src/types/investments";
import { isExchangeRateStale, resolveExchangeRate } from "@/src/utils/exchangeRateCalculations";

type PtaxResponse = { rate?: number; quotedAt?: string; error?: string };

function normalizeRate(rate: InvestmentExchangeRate): InvestmentExchangeRate {
  return { ...rate, rate: Number(rate.rate) };
}

async function requestOfficialUsdBrlRate() {
  const response = await fetch("/api/exchange-rates/usd-brl", { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as PtaxResponse;
  if (!response.ok || !Number.isFinite(body.rate) || Number(body.rate) <= 0) {
    throw new Error(body.error || "A cotação PTAX não está disponível.");
  }
  return { rate: Number(body.rate), quotedAt: String(body.quotedAt) };
}

async function persistRate({ baseCurrency, quoteCurrency, rate, source, quotedAt }: {
  baseCurrency: string; quoteCurrency: string; rate: number;
  source: "PTAX" | "MANUAL"; quotedAt: string;
}) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Informe uma cotação válida.");
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase.from("investment_exchange_rates").upsert({
    owner_id: ownerId,
    base_currency: baseCurrency,
    quote_currency: quoteCurrency,
    rate,
    source,
    quoted_at: quotedAt,
    updated_by: ownerId,
  }, { onConflict: "owner_id,base_currency,quote_currency" }).select("*").single();
  if (error) throw new Error(error.message);
  return normalizeRate(data as InvestmentExchangeRate);
}

export async function refreshUsdBrlRate() {
  const official = await requestOfficialUsdBrlRate();
  return persistRate({ baseCurrency: "USD", quoteCurrency: "BRL", rate: official.rate, source: "PTAX", quotedAt: official.quotedAt });
}

export async function saveManualExchangeRate(rate: number) {
  return persistRate({ baseCurrency: "USD", quoteCurrency: "BRL", rate, source: "MANUAL", quotedAt: new Date().toISOString() });
}

export async function saveInvestmentConsolidationCurrency(currency: string) {
  const ownerId = await getCurrentUserId();
  const normalized = currency.trim().toUpperCase();
  const { error } = await supabase.from("investment_settings").upsert(
    { owner_id: ownerId, consolidation_currency: normalized },
    { onConflict: "owner_id" },
  );
  if (error) throw new Error(error.message);
}

export async function loadInvestmentExchangeContext(assetCurrencies: string[]): Promise<InvestmentExchangeContext> {
  const ownerId = await getCurrentUserId();
  const [settings, ratesResponse] = await Promise.all([
    supabase.from("investment_settings").select("consolidation_currency").eq("owner_id", ownerId).maybeSingle(),
    supabase.from("investment_exchange_rates").select("*").eq("owner_id", ownerId).order("updated_at", { ascending: false }),
  ]);
  if (settings.error) throw new Error(settings.error.message);
  if (ratesResponse.error) throw new Error(ratesResponse.error.message);
  const consolidationCurrency = settings.data?.consolidation_currency?.toUpperCase() ?? "BRL";
  let rates = ((ratesResponse.data ?? []) as InvestmentExchangeRate[]).map(normalizeRate);
  let warning: string | null = null;
  const needsUsdBrl = assetCurrencies.some((currency) => {
    const pair = new Set([currency.toUpperCase(), consolidationCurrency]);
    return pair.has("USD") && pair.has("BRL");
  });
  const savedUsdBrl = rates.find((rate) => rate.base_currency === "USD" && rate.quote_currency === "BRL");
  if (needsUsdBrl && (!savedUsdBrl || isExchangeRateStale(savedUsdBrl))) {
    try {
      const refreshed = await refreshUsdBrlRate();
      rates = [refreshed, ...rates.filter((item) => item.id !== refreshed.id)];
    } catch {
      warning = savedUsdBrl
        ? "Não foi possível atualizar a PTAX. A última cotação salva está sendo utilizada e pode estar desatualizada."
        : "Não foi possível obter a PTAX. Ativos USD não serão consolidados até existir uma cotação.";
    }
  }
  return { consolidationCurrency, rates, warning };
}

export { resolveExchangeRate };
