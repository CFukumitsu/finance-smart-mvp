import assert from "node:assert/strict";
import test from "node:test";
import type {
  InvestmentAccount,
  InvestmentAccountEvent,
  InvestmentAsset,
  InvestmentMonthlyValuation,
  InvestmentOperation,
} from "../types/investments";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateInvestmentAccountSummaries, calculateInvestmentAssetSnapshot, calculateInvestmentPositions, calculateOperationValue, calculateValuationResult, findNegativeInvestmentPosition, summarizeInvestmentPositions, summarizeInvestmentWealth, validateInvestmentValuation } from "./investmentCalculations.ts";

const asset = {
  id: "asset",
  owner_id: "owner",
  name: "PETR4",
  symbol: "PETR4",
  asset_type: "Ação",
  currency: "BRL",
  active: true,
  created_at: "",
  updated_at: "",
} satisfies InvestmentAsset;

const account = {
  id: "account",
  owner_id: "owner",
  name: "Corretora",
  type: "Conta",
  currency: "BRL",
  active: true,
  show_on_investments_dashboard: true,
} satisfies InvestmentAccount;

const balanceAccount = {
  ...account,
  id: "savings",
  name: "Poupança",
  investment_account_kind: "BALANCE" as const,
} satisfies InvestmentAccount;

function accountEvent(
  id: string,
  eventType: InvestmentAccountEvent["event_type"],
  amount: number,
  date: string,
): InvestmentAccountEvent {
  const integrated = eventType === "application" || eventType === "redemption";
  return {
    id,
    owner_id: "owner",
    investment_account_id: balanceAccount.id,
    financial_account_id: integrated ? "checking" : null,
    finance_transaction_id: integrated ? `finance-${id}` : null,
    event_type: eventType,
    event_date: date,
    amount,
    integration_group_id: integrated ? `group-${id}` : null,
    idempotency_key: `key-${id}`,
    notes: null,
    created_at: `${date}T12:00:00Z`,
    updated_at: "",
  };
}

function operation(
  id: string,
  quantity: number,
  unitPrice: number,
  fees = 0,
  date = "2026-07-01",
  accountId = account.id,
): InvestmentOperation {
  return {
    id,
    owner_id: "owner",
    asset_id: asset.id,
    account_id: accountId,
    operation_type: quantity > 0 ? "Compra" : "Venda",
    operation_date: date,
    quantity,
    unit_price: unitPrice,
    fees,
    event_group_id: null,
    notes: null,
    created_at: `${date}T12:00:00Z`,
    updated_at: "",
  };
}

const valuation = {
  id: "valuation",
  owner_id: "owner",
  asset_id: asset.id,
  reference_month: "2026-07-01",
  market_value: 15,
  total_market_value: 150,
  quantity_snapshot: 10,
  average_price_snapshot: 10,
  currency: "BRL",
  consolidation_currency: "BRL",
  exchange_rate: 1,
  notes: null,
  created_at: "",
  updated_at: "",
} satisfies InvestmentMonthlyValuation;

test("posição é a soma das quantidades assinadas", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [operation("buy", 10, 10), operation("sell", -3, 20)],
    valuations: [],
    referenceMonth: "2026-07",
  });

  assert.equal(positions[0].quantity, 7);
});

test("preço médio pondera compras e inclui taxas de aquisição", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [
      operation("first", 10, 10, 2, "2026-06-01"),
      operation("second", 10, 20, 2, "2026-07-01"),
    ],
    valuations: [],
    referenceMonth: "2026-07",
  });

  assert.equal(positions[0].investedValue, 304);
  assert.equal(positions[0].averagePrice, 15.2);
});

test("venda parcial reduz custo pelo preço médio e não altera o preço médio", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [
      operation("buy", 10, 10, 0, "2026-06-01"),
      operation("sell", -4, 30, 1, "2026-07-01"),
    ],
    valuations: [],
    referenceMonth: "2026-07",
  });

  assert.equal(positions[0].quantity, 6);
  assert.equal(positions[0].investedValue, 60);
  assert.equal(positions[0].averagePrice, 10);
});

test("posição zerada não aparece", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [operation("buy", 10, 10), operation("sell", -10, 12)],
    valuations: [],
  });

  assert.deepEqual(positions, []);
});

test("última valorização até o mês de referência calcula patrimônio", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [operation("buy", 10, 10)],
    valuations: [
      valuation,
      {
        ...valuation,
        id: "future",
        reference_month: "2026-08-01",
        market_value: 99,
      },
    ],
    referenceMonth: "2026-07",
  });

  assert.equal(positions[0].currentUnitValue, 15);
  assert.equal(positions[0].currentValue, 150);
  assert.equal(positions[0].unrealizedResult, 50);
  assert.equal(positions[0].appreciationPercent, 50);
});

test("sem valorização usa o preço médio como estimativa neutra", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [operation("buy", 2, 25)],
    valuations: [],
  });

  assert.equal(positions[0].currentValue, 50);
  assert.equal(positions[0].hasValuation, false);
  assert.equal(positions[0].unrealizedResult, 0);
});

test("detecta venda que deixa custódia negativa", () => {
  assert.equal(
    findNegativeInvestmentPosition([
      operation("buy", 2, 10),
      operation("sell", -3, 12),
    ])?.operation.id,
    "sell",
  );
});

test("resume patrimônio sem misturar moedas", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset, { ...asset, id: "usd", name: "ETF", currency: "USD" }],
    accounts: [account],
    operations: [
      operation("brl", 10, 10),
      { ...operation("usd", 2, 50), asset_id: "usd" },
    ],
    valuations: [valuation],
    referenceMonth: "2026-07",
  });

  assert.deepEqual(summarizeInvestmentPositions(positions, "BRL"), {
    totalInvested: 100,
    currentValue: 150,
    unrealizedResult: 50,
    assetCount: 1,
    accountCount: 1,
    missingRateAssetCount: 1,
  });
});

test("consolida ativos BRL e USD com a taxa disponível", () => {
  const usdAsset = { ...asset, id: "usd", name: "ETF", currency: "USD" };
  const usdAccount = { ...account, id: "usd-account", currency: "USD" };
  const positions = calculateInvestmentPositions({
    assets: [asset, usdAsset],
    accounts: [account, usdAccount],
    operations: [
      operation("brl", 10, 10),
      { ...operation("usd", 2, 50, 0, "2026-07-01", usdAccount.id), asset_id: usdAsset.id },
    ],
    valuations: [valuation],
    referenceMonth: "2026-07",
  });
  const rate = {
    id: "rate", owner_id: "owner", base_currency: "USD", quote_currency: "BRL",
    rate: 5.43, source: "PTAX" as const, quoted_at: "2026-08-04T12:00:00Z",
    updated_by: "owner", created_at: "2026-08-04T12:00:00Z", updated_at: "2026-08-04T12:00:00Z",
  };
  assert.deepEqual(summarizeInvestmentPositions(positions, "BRL", [rate]), {
    totalInvested: 643,
    currentValue: 693,
    unrealizedResult: 50,
    assetCount: 2,
    accountCount: 2,
    missingRateAssetCount: 0,
  });
});

test("valor da operação ignora taxas conforme especificação da tela", () => {
  assert.equal(calculateOperationValue(operation("buy", 3, 12.5, 4)), 37.5);
});

test("mantém posições independentes para o mesmo ativo em contas diferentes", () => {
  const secondAccount = { ...account, id: "second-account", name: "Banco B" };
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account, secondAccount],
    operations: [
      operation("first", 4, 10, 0, "2026-07-01", account.id),
      operation("second", 6, 20, 0, "2026-07-01", secondAccount.id),
    ],
    valuations: [],
  });

  assert.equal(positions.length, 2);
  assert.deepEqual(
    positions.map((position) => [position.accountId, position.quantity]),
    [
      [secondAccount.id, 6],
      [account.id, 4],
    ],
  );
});

test("recalcula posição depois da edição de uma compra", () => {
  const original = operation("buy", 10, 10, 2);
  const edited = { ...original, quantity: 8, unit_price: 12, fees: 4 };
  const [position] = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [edited],
    valuations: [],
  });

  assert.equal(position.quantity, 8);
  assert.equal(position.investedValue, 100);
  assert.equal(position.averagePrice, 12.5);
});

test("recalcula posição depois da exclusão de uma venda", () => {
  const buy = operation("buy", 10, 10);
  const sell = operation("sell", -3, 15, 1, "2026-07-02");
  const beforeDelete = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [buy, sell],
    valuations: [],
  });
  const afterDelete = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [buy],
    valuations: [],
  });

  assert.equal(beforeDelete[0].quantity, 7);
  assert.equal(afterDelete[0].quantity, 10);
  assert.equal(afterDelete[0].currentValue, 100);
});

test("uma venda não reduz o custo médio da posição remanescente", () => {
  const [position] = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [
      operation("buy", 10, 10, 2, "2026-07-01"),
      operation("sell", -4, 20, 3, "2026-07-02"),
    ],
    valuations: [],
  });

  assert.equal(position.quantity, 6);
  assert.equal(position.averagePrice, 10.2);
  assert.equal(position.investedValue, 61.2);
});

test("100 unidades a R$ 18,53 resultam em R$ 1.853,00", () => {
  const result = calculateValuationResult({ quantity: 100, averagePrice: 16.8, currentUnitValue: 18.53, currentValue: 0, source: "unit" });
  assert.equal(result.currentValue, 1853);
  assert.equal(result.investedValue, 1680);
  assert.equal(result.result, 173);
  assert.equal(result.profitability, 10.3);
});

test("R$ 2.000,00 para 100 unidades resultam em R$ 20,00 por unidade", () => {
  const result = calculateValuationResult({ quantity: 100, averagePrice: 16.8, currentUnitValue: 0, currentValue: 2000, source: "total" });
  assert.equal(result.currentUnitValue, 20);
});

test("valorização aceita quantidade fracionária sem ruído de ponto flutuante", () => {
  const result = calculateValuationResult({ quantity: 0.015, averagePrice: 100000, currentUnitValue: 120000.12345678, currentValue: 0, source: "unit" });
  assert.equal(result.currentValue, 1800);
  assert.equal(result.investedValue, 1500);
  assert.equal(result.result, 300);
});

test("rentabilidade é nula quando o valor investido é zero", () => {
  const result = calculateValuationResult({ quantity: 1, averagePrice: 0, currentUnitValue: 10, currentValue: 0, source: "unit" });
  assert.equal(result.profitability, null);
});

test("snapshot histórico ignora compra e venda posteriores", () => {
  const operations = [
    operation("buy", 100, 10, 0, "2026-08-01"),
    operation("later-buy", 50, 20, 0, "2026-09-01"),
    operation("later-sell", -25, 30, 0, "2026-10-01"),
  ];
  const snapshot = calculateInvestmentAssetSnapshot({ operations, assetId: asset.id, referenceMonth: "2026-08" });
  assert.deepEqual(snapshot, { quantity: 100, investedValue: 1000, averagePrice: 10 });
});

test("edição usa os snapshots persistidos mesmo após operações posteriores", () => {
  const historical = { quantity: valuation.quantity_snapshot!, averagePrice: valuation.average_price_snapshot! };
  const result = calculateValuationResult({ ...historical, currentUnitValue: valuation.market_value, currentValue: valuation.total_market_value!, source: "unit" });
  assert.equal(result.currentValue, 150);
  assert.equal(result.investedValue, 100);
});

test("quantidade zero impede salvar valorização", () => {
  assert.match(validateInvestmentValuation({ assetId: "asset", referenceMonth: "2026-08", quantity: 0, currentUnitValue: 10, currentValue: 100 })!, /não possui quantidade/);
});

test("preço negativo impede salvar valorização", () => {
  assert.match(validateInvestmentValuation({ assetId: "asset", referenceMonth: "2026-08", quantity: 10, currentUnitValue: -1, currentValue: 100 })!, /negativos/);
});

test("valor total negativo impede salvar valorização", () => {
  assert.match(validateInvestmentValuation({ assetId: "asset", referenceMonth: "2026-08", quantity: 10, currentUnitValue: 10, currentValue: -1 })!, /negativos/);
});

test("dashboard usa o valor total persistido quando o snapshot corresponde à posição", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account],
    operations: [operation("buy", 10, 10)],
    valuations: [{ ...valuation, market_value: 15.12345678, total_market_value: 151.22 }],
    referenceMonth: "2026-07",
  });
  assert.equal(positions[0].currentUnitValue, 15.12345678);
  assert.equal(positions[0].currentValue, 151.22);
});

test("rateio entre contas preserva exatamente o valor total da valorização", () => {
  const secondAccount = { ...account, id: "second-account", name: "Banco B" };
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account, secondAccount],
    operations: [
      operation("first", 3, 10, 0, "2026-07-01", account.id),
      operation("second", 7, 10, 0, "2026-07-01", secondAccount.id),
    ],
    valuations: [{ ...valuation, total_market_value: 100.01 }],
    referenceMonth: "2026-07",
  });
  assert.equal(positions.reduce((sum, position) => sum + position.currentValue, 0), 100.01);
});

test("conta por saldo deriva aplicação, rendimento e resgate exclusivamente dos eventos", () => {
  const summaries = calculateInvestmentAccountSummaries({
    accounts: [balanceAccount],
    events: [
      accountEvent("application", "application", 1000, "2026-08-01"),
      accountEvent("yield", "yield", 10, "2026-08-02"),
      accountEvent("redemption", "redemption", 300, "2026-08-03"),
    ],
    referenceDate: "2026-08-31",
  });

  assert.deepEqual(summaries[0], {
    accountId: "savings",
    accountName: "Poupança",
    currency: "BRL",
    balance: 710,
    investedValue: 700,
    openingBalance: 0,
    applications: 1000,
    redemptions: 300,
    yields: 10,
    positiveAdjustments: 0,
    result: 10,
    profitabilityPercent: 1,
  });
});

test("saldo inicial e ajuste alteram saldo e capital sem criar rentabilidade", () => {
  const [summary] = calculateInvestmentAccountSummaries({
    accounts: [balanceAccount],
    events: [
      accountEvent("opening", "opening_balance", 500, "2026-08-01"),
      accountEvent("adjustment", "positive_adjustment", 20, "2026-08-02"),
    ],
    referenceDate: "2026-08-31",
  });

  assert.equal(summary.balance, 520);
  assert.equal(summary.investedValue, 520);
  assert.equal(summary.result, 0);
  assert.equal(summary.profitabilityPercent, 0);
});

test("patrimônio soma posição unitizada e conta por saldo exatamente uma vez", () => {
  const positions = calculateInvestmentPositions({
    assets: [asset],
    accounts: [account, balanceAccount],
    operations: [operation("buy", 5, 100)],
    valuations: [],
  });
  const balanceAccounts = calculateInvestmentAccountSummaries({
    accounts: [account, balanceAccount],
    events: [accountEvent("opening", "opening_balance", 710, "2026-08-01")],
    referenceDate: "2026-08-31",
  });
  const wealth = summarizeInvestmentWealth({
    positions,
    balanceAccounts,
    currency: "BRL",
  });

  assert.equal(positions[0].currentValue, 500);
  assert.equal(balanceAccounts[0].balance, 710);
  assert.equal(wealth.currentValue, 1210);
  assert.equal(wealth.totalInvested, 1210);
  assert.equal(wealth.result, 0);
});
