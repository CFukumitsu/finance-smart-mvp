export type InvestmentOperationType = "Compra" | "Venda";

export type InvestmentAccountEventType =
  | "opening_balance"
  | "application"
  | "redemption"
  | "yield"
  | "positive_adjustment";

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
  unit_price: number;
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
  total_market_value: number | null;
  quantity_snapshot: number | null;
  average_price_snapshot: number | null;
  currency: string;
  consolidation_currency: string;
  exchange_rate: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentExchangeRateSource = "PTAX" | "MANUAL";

export type InvestmentExchangeRate = {
  id: string;
  owner_id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: InvestmentExchangeRateSource;
  quoted_at: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type InvestmentExchangeContext = {
  consolidationCurrency: string;
  rates: InvestmentExchangeRate[];
  warning: string | null;
};

export type InvestmentAccount = {
  id: string;
  owner_id: string;
  name: string;
  type: "Conta" | "Cartão";
  currency: string | null;
  active: boolean;
  show_on_investments_dashboard: boolean;
  investment_account_kind?: "BALANCE" | null;
};

export type InvestmentAccountEvent = {
  id: string;
  owner_id: string;
  investment_account_id: string;
  financial_account_id: string | null;
  finance_transaction_id: string | null;
  event_type: InvestmentAccountEventType;
  event_date: string;
  amount: number;
  integration_group_id: string | null;
  idempotency_key: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentData = {
  assets: InvestmentAsset[];
  operations: InvestmentOperation[];
  valuations: InvestmentMonthlyValuation[];
  accounts: InvestmentAccount[];
  accountEvents: InvestmentAccountEvent[];
};

export type InvestmentAccountEventInput = {
  investment_account_id: string;
  financial_account_id: string | null;
  event_type: InvestmentAccountEventType;
  event_date: string;
  amount: number;
  notes: string | null;
  idempotency_key?: string;
};

export type InvestmentBalanceAccountSummary = {
  accountId: string;
  accountName: string;
  currency: string;
  balance: number;
  investedValue: number;
  openingBalance: number;
  applications: number;
  redemptions: number;
  yields: number;
  positiveAdjustments: number;
  result: number;
  profitabilityPercent: number | null;
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
  total_market_value: number;
  quantity_snapshot: number;
  average_price_snapshot: number;
  currency: string;
  consolidation_currency: string;
  exchange_rate: number;
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
