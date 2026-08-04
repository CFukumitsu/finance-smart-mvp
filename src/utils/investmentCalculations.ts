import type {
  InvestmentAccount,
  InvestmentAsset,
  InvestmentExchangeRate,
  InvestmentMonthlyValuation,
  InvestmentOperation,
  InvestmentPosition,
} from "@/src/types/investments";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { convertInvestmentValue, resolveExchangeRate } from "./exchangeRateCalculations.ts";

const QUANTITY_EPSILON = 0.00000001;

function round(value: number, digits = 8) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function operationOrder(
  left: Pick<
    InvestmentOperation,
    "operation_date" | "created_at" | "id"
  >,
  right: Pick<
    InvestmentOperation,
    "operation_date" | "created_at" | "id"
  >,
) {
  return (
    left.operation_date.localeCompare(right.operation_date) ||
    left.created_at.localeCompare(right.created_at) ||
    left.id.localeCompare(right.id)
  );
}

function referenceMonthEnd(referenceMonth: string) {
  return `${referenceMonth.slice(0, 7)}-31`;
}

export function calculateInvestmentAssetSnapshot({
  operations,
  assetId,
  referenceMonth,
}: {
  operations: InvestmentOperation[];
  assetId: string;
  referenceMonth: string;
}) {
  const ledgers = new Map<string, { quantity: number; costBasis: number }>();

  [...operations]
    .filter(
      (operation) =>
        operation.asset_id === assetId &&
        operation.operation_date <= referenceMonthEnd(referenceMonth),
    )
    .sort(operationOrder)
    .forEach((operation) => {
      const ledger = ledgers.get(operation.account_id) ?? {
        quantity: 0,
        costBasis: 0,
      };
      const quantity = Number(operation.quantity);

      if (quantity > 0) {
        ledger.quantity = round(ledger.quantity + quantity);
        ledger.costBasis = round(
          ledger.costBasis +
            quantity * Number(operation.unit_price) +
            Number(operation.fees ?? 0),
          2,
        );
      } else if (quantity < 0 && ledger.quantity > QUANTITY_EPSILON) {
        const soldQuantity = Math.abs(quantity);
        const averagePrice = ledger.costBasis / ledger.quantity;
        ledger.quantity = round(ledger.quantity - soldQuantity);
        ledger.costBasis = round(
          ledger.costBasis - soldQuantity * averagePrice,
          2,
        );

        if (Math.abs(ledger.quantity) < QUANTITY_EPSILON) {
          ledger.quantity = 0;
          ledger.costBasis = 0;
        }
      }

      ledgers.set(operation.account_id, ledger);
    });

  const quantity = round(
    [...ledgers.values()].reduce((sum, ledger) => sum + ledger.quantity, 0),
  );
  const investedValue = round(
    [...ledgers.values()].reduce((sum, ledger) => sum + ledger.costBasis, 0),
    2,
  );

  return {
    quantity,
    investedValue,
    averagePrice: quantity > QUANTITY_EPSILON ? round(investedValue / quantity) : 0,
  };
}

export function calculateValuationResult({
  quantity,
  averagePrice,
  currentUnitValue,
  currentValue,
  source,
}: {
  quantity: number;
  averagePrice: number;
  currentUnitValue: number;
  currentValue: number;
  source: "unit" | "total";
}) {
  const resolvedUnitValue =
    source === "total" && quantity > QUANTITY_EPSILON
      ? round(currentValue / quantity)
      : round(currentUnitValue);
  const resolvedCurrentValue =
    source === "unit" ? round(quantity * resolvedUnitValue, 2) : round(currentValue, 2);
  const investedValue = round(quantity * averagePrice, 2);
  const result = round(resolvedCurrentValue - investedValue, 2);

  return {
    currentUnitValue: resolvedUnitValue,
    currentValue: resolvedCurrentValue,
    investedValue,
    result,
    profitability: investedValue > 0 ? round((result / investedValue) * 100, 2) : null,
  };
}

export function validateInvestmentValuation({
  assetId,
  referenceMonth,
  quantity,
  currentUnitValue,
  currentValue,
}: {
  assetId: string;
  referenceMonth: string;
  quantity: number;
  currentUnitValue: number;
  currentValue: number;
}) {
  if (!assetId) return "Informe o ativo.";
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(referenceMonth)) return "Informe o mês de referência.";
  if (!Number.isFinite(quantity) || quantity <= 0)
    return "Este ativo não possui quantidade disponível no período selecionado. Registre primeiro uma operação de compra.";
  if (!Number.isFinite(currentUnitValue) && !Number.isFinite(currentValue))
    return "Informe o preço atual por unidade ou o valor atual da posição.";
  if ((Number.isFinite(currentUnitValue) && currentUnitValue < 0) || (Number.isFinite(currentValue) && currentValue < 0))
    return "Preço e valor atual não podem ser negativos.";
  return null;
}

export function calculateOperationValue(
  operation: Pick<InvestmentOperation, "quantity" | "unit_price">,
) {
  return round(
    Math.abs(Number(operation.quantity)) * Number(operation.unit_price),
    2,
  );
}

export function findNegativeInvestmentPosition(
  operations: InvestmentOperation[],
) {
  const quantities = new Map<string, number>();

  for (const operation of [...operations].sort(operationOrder)) {
    const key = `${operation.asset_id}:${operation.account_id}`;
    const next = round(
      (quantities.get(key) ?? 0) + Number(operation.quantity),
    );

    if (next < -QUANTITY_EPSILON) {
      return {
        operation,
        quantity: next,
      };
    }

    quantities.set(key, Math.abs(next) < QUANTITY_EPSILON ? 0 : next);
  }

  return null;
}

export function calculateInvestmentPositions({
  assets,
  accounts,
  operations,
  valuations,
  referenceMonth = new Date().toISOString().slice(0, 7),
}: {
  assets: InvestmentAsset[];
  accounts: InvestmentAccount[];
  operations: InvestmentOperation[];
  valuations: InvestmentMonthlyValuation[];
  referenceMonth?: string;
}): InvestmentPosition[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const latestValuationByAsset = new Map<
    string,
    InvestmentMonthlyValuation
  >();

  [...valuations]
    .filter((valuation) => valuation.reference_month.slice(0, 7) <= referenceMonth)
    .sort((left, right) =>
      left.reference_month.localeCompare(right.reference_month),
    )
    .forEach((valuation) => {
      latestValuationByAsset.set(valuation.asset_id, valuation);
    });

  const ledgers = new Map<
    string,
    {
      assetId: string;
      accountId: string;
      quantity: number;
      costBasis: number;
    }
  >();

  [...operations]
    .filter((operation) => operation.operation_date <= referenceMonthEnd(referenceMonth))
    .sort(operationOrder)
    .forEach((operation) => {
    const key = `${operation.asset_id}:${operation.account_id}`;
    const ledger = ledgers.get(key) ?? {
      assetId: operation.asset_id,
      accountId: operation.account_id,
      quantity: 0,
      costBasis: 0,
    };
    const quantity = Number(operation.quantity);

    if (quantity > 0) {
      ledger.quantity = round(ledger.quantity + quantity);
      ledger.costBasis = round(
        ledger.costBasis +
          quantity * Number(operation.unit_price) +
          Number(operation.fees ?? 0),
        2,
      );
    } else if (quantity < 0 && ledger.quantity > QUANTITY_EPSILON) {
      const soldQuantity = Math.abs(quantity);
      const averagePrice = ledger.costBasis / ledger.quantity;
      ledger.quantity = round(ledger.quantity - soldQuantity);
      ledger.costBasis = round(
        ledger.costBasis - soldQuantity * averagePrice,
        2,
      );

      if (Math.abs(ledger.quantity) < QUANTITY_EPSILON) {
        ledger.quantity = 0;
        ledger.costBasis = 0;
      }
    }

    ledgers.set(key, ledger);
    });

  const openLedgers = [...ledgers.values()].filter(
    (ledger) => ledger.quantity > QUANTITY_EPSILON,
  );
  const quantityByAsset = new Map<string, number>();
  const ledgerCountByAsset = new Map<string, number>();
  const seenByAsset = new Map<string, number>();
  const allocatedValueByAsset = new Map<string, number>();

  openLedgers.forEach((ledger) => {
    quantityByAsset.set(
      ledger.assetId,
      round((quantityByAsset.get(ledger.assetId) ?? 0) + ledger.quantity),
    );
    ledgerCountByAsset.set(
      ledger.assetId,
      (ledgerCountByAsset.get(ledger.assetId) ?? 0) + 1,
    );
  });

  return openLedgers
    .flatMap((ledger) => {
      const asset = assetsById.get(ledger.assetId);
      const account = accountsById.get(ledger.accountId);

      if (!asset || !account) return [];

      const averagePrice = ledger.costBasis / ledger.quantity;
      const valuation = latestValuationByAsset.get(asset.id);
      const currentUnitValue = valuation
        ? Number(valuation.market_value)
        : averagePrice;
      const assetQuantity = quantityByAsset.get(asset.id) ?? ledger.quantity;
      const canUseValuationTotal = Boolean(
        valuation?.total_market_value !== null &&
          valuation?.total_market_value !== undefined &&
          valuation.quantity_snapshot !== null &&
          Math.abs(Number(valuation.quantity_snapshot) - assetQuantity) <
            QUANTITY_EPSILON,
      );
      const seen = (seenByAsset.get(asset.id) ?? 0) + 1;
      seenByAsset.set(asset.id, seen);
      let currentValue = round(ledger.quantity * currentUnitValue, 2);

      if (
        canUseValuationTotal &&
        valuation &&
        valuation.total_market_value !== null
      ) {
        const totalMarketValue = Number(valuation.total_market_value);
        const isLastLedger = seen === ledgerCountByAsset.get(asset.id);
        currentValue = isLastLedger
          ? round(totalMarketValue - (allocatedValueByAsset.get(asset.id) ?? 0), 2)
          : round((totalMarketValue * ledger.quantity) / assetQuantity, 2);
        allocatedValueByAsset.set(
          asset.id,
          round((allocatedValueByAsset.get(asset.id) ?? 0) + currentValue, 2),
        );
      }
      const investedValue = round(ledger.costBasis, 2);
      const unrealizedResult = round(currentValue - investedValue, 2);

      return [
        {
          key: `${ledger.assetId}:${ledger.accountId}`,
          assetId: asset.id,
          accountId: account.id,
          assetName: asset.name,
          assetSymbol: asset.symbol,
          accountName: account.name,
          currency: asset.currency,
          quantity: ledger.quantity,
          averagePrice: round(averagePrice),
          investedValue,
          currentUnitValue: round(currentUnitValue),
          currentValue,
          unrealizedResult,
          appreciationPercent:
            investedValue > 0
              ? round((unrealizedResult / investedValue) * 100, 2)
              : null,
          valuationMonth: valuation?.reference_month ?? null,
          hasValuation: Boolean(valuation),
        },
      ];
    })
    .sort(
      (left, right) =>
        left.assetName.localeCompare(right.assetName, "pt-BR") ||
        left.accountName.localeCompare(right.accountName, "pt-BR"),
    );
}

export function summarizeInvestmentPositions(
  positions: InvestmentPosition[],
  currency: string,
  rates: InvestmentExchangeRate[] = [],
) {
  const converted = positions.flatMap((position) => {
    const rate = resolveExchangeRate(position.currency, currency, rates);
    const investedValue = convertInvestmentValue(position.investedValue, rate);
    const currentValue = convertInvestmentValue(position.currentValue, rate);
    return investedValue === null || currentValue === null
      ? []
      : [{ position, investedValue, currentValue }];
  });
  const totalInvested = round(
    converted.reduce((sum, item) => sum + item.investedValue, 0),
    2,
  );
  const currentValue = round(
    converted.reduce((sum, item) => sum + item.currentValue, 0),
    2,
  );
  const included = converted.map((item) => item.position);
  const includedKeys = new Set(included.map((position) => position.key));

  return {
    totalInvested,
    currentValue,
    unrealizedResult: round(currentValue - totalInvested, 2),
    assetCount: new Set(included.map((position) => position.assetId)).size,
    accountCount: new Set(included.map((position) => position.accountId)).size,
    missingRateAssetCount: new Set(
      positions
        .filter((position) => !includedKeys.has(position.key))
        .map((position) => position.assetId),
    ).size,
  };
}
