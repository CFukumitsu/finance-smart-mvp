import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { convertInvestmentValue, isExchangeRateStale, resolveExchangeRate } from "./exchangeRateCalculations.ts";

const rate = {
  id: "rate", owner_id: "owner", base_currency: "USD", quote_currency: "BRL",
  rate: 5.43, source: "MANUAL" as const, quoted_at: "2026-08-04T10:00:00Z",
  updated_by: "owner", created_at: "2026-08-04T10:00:00Z", updated_at: "2026-08-04T10:00:00Z",
};

test("ativo na moeda de consolidação usa taxa um", () => {
  assert.equal(resolveExchangeRate("BRL", "BRL", []), 1);
  assert.equal(convertInvestmentValue(100, 1), 100);
});

test("ativo USD é convertido para BRL", () => {
  assert.equal(resolveExchangeRate("USD", "BRL", [rate]), 5.43);
  assert.equal(convertInvestmentValue(0.05 * 118000, 5.43), 32037);
});

test("conversão inversa usa o mesmo par salvo", () => {
  assert.ok(Math.abs((resolveExchangeRate("BRL", "USD", [rate]) ?? 0) - 1 / 5.43) < 1e-12);
});

test("ausência de cotação não produz NaN ou Infinity", () => {
  assert.equal(resolveExchangeRate("EUR", "BRL", [rate]), null);
  assert.equal(convertInvestmentValue(100, null), null);
  assert.equal(convertInvestmentValue(Number.POSITIVE_INFINITY, 5.43), null);
});

test("cache permanece válido por 12 horas e vence depois", () => {
  const updatedAt = Date.parse(rate.updated_at);
  assert.equal(isExchangeRateStale(rate, updatedAt + 12 * 60 * 60 * 1000), false);
  assert.equal(isExchangeRateStale(rate, updatedAt + 12 * 60 * 60 * 1000 + 1), true);
});
