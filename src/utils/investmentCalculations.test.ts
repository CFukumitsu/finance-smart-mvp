import assert from "node:assert/strict";
import test from "node:test";
import type {
  InvestmentAccount,
  InvestmentAsset,
  InvestmentMonthlyValuation,
  InvestmentOperation,
} from "../types/investments";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateInvestmentPositions, calculateOperationValue, findNegativeInvestmentPosition, summarizeInvestmentPositions } from "./investmentCalculations.ts";

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

function operation(
  id: string,
  quantity: number,
  unitPrice: number,
  fees = 0,
  date = "2026-07-01",
): InvestmentOperation {
  return {
    id,
    owner_id: "owner",
    asset_id: asset.id,
    account_id: account.id,
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
  });
});

test("valor da operação ignora taxas conforme especificação da tela", () => {
  assert.equal(calculateOperationValue(operation("buy", 3, 12.5, 4)), 37.5);
});
