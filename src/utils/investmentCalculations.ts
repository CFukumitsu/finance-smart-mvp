import type {
  InvestmentAccount,
  InvestmentAsset,
  InvestmentMonthlyValuation,
  InvestmentOperation,
  InvestmentPosition,
} from "@/src/types/investments";

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

export function calculateOperationValue(
  operation: Pick<InvestmentOperation, "quantity" | "unit_price">,
) {
  return round(
    Math.abs(Number(operation.quantity)) * Number(operation.unit_price ?? 0),
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

  [...operations].sort(operationOrder).forEach((operation) => {
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
          quantity * Number(operation.unit_price ?? 0) +
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

  return [...ledgers.values()]
    .filter((ledger) => ledger.quantity > QUANTITY_EPSILON)
    .flatMap((ledger) => {
      const asset = assetsById.get(ledger.assetId);
      const account = accountsById.get(ledger.accountId);

      if (!asset || !account) return [];

      const averagePrice = ledger.costBasis / ledger.quantity;
      const valuation = latestValuationByAsset.get(asset.id);
      const currentUnitValue = valuation
        ? Number(valuation.market_value)
        : averagePrice;
      const currentValue = round(ledger.quantity * currentUnitValue, 2);
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
) {
  const scoped = positions.filter((position) => position.currency === currency);
  const totalInvested = round(
    scoped.reduce((sum, position) => sum + position.investedValue, 0),
    2,
  );
  const currentValue = round(
    scoped.reduce((sum, position) => sum + position.currentValue, 0),
    2,
  );

  return {
    totalInvested,
    currentValue,
    unrealizedResult: round(currentValue - totalInvested, 2),
    assetCount: new Set(scoped.map((position) => position.assetId)).size,
    accountCount: new Set(scoped.map((position) => position.accountId)).size,
  };
}
