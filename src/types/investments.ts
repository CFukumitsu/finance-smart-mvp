export type InvestmentOperationType = "Compra" | "Venda";

export type InvestmentAsset = {
  id: string;
  owner_id: string;
  name: string;
  symbol: string | null;
  asset_type: string;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type InvestmentOperation = {
  id: string;
  owner_id: string;
  asset_id: string;
  account_id: string;
  operation_type: InvestmentOperationType;
  operation_date: string;
  quantity: number;
  unit_price: number | null;
  fees: number;
  event_group_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentMonthlyValuation = {
  id: string;
  owner_id: string;
  asset_id: string;
  reference_month: string;
  market_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentAccount = {
  id: string;
  owner_id: string;
  name: string;
  type: string;
  currency: string | null;
  active: boolean;
  show_on_investments_dashboard: boolean;
};

export type InvestmentData = {
  assets: InvestmentAsset[];
  operations: InvestmentOperation[];
  valuations: InvestmentMonthlyValuation[];
  accounts: InvestmentAccount[];
};

export type InvestmentAssetInput = Pick<
  InvestmentAsset,
  "name" | "symbol" | "asset_type" | "currency" | "active"
>;

export type InvestmentOperationInput = {
  asset_id: string;
  account_id: string;
  operation_type: InvestmentOperationType;
  operation_date: string;
  quantity: number;
  unit_price: number;
  fees: number;
  notes: string | null;
};

export type InvestmentValuationInput = {
  asset_id: string;
  reference_month: string;
  market_value: number;
  notes: string | null;
};

export type InvestmentPosition = {
  key: string;
  assetId: string;
  accountId: string;
  assetName: string;
  assetSymbol: string | null;
  accountName: string;
  currency: string;
  quantity: number;
  averagePrice: number;
  investedValue: number;
  currentUnitValue: number;
  currentValue: number;
  unrealizedResult: number;
  appreciationPercent: number | null;
  valuationMonth: string | null;
  hasValuation: boolean;
};
