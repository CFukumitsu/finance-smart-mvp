export type BankrollCurrency = "BRL" | "USD" | "EUR" | (string & {});
export type BankrollWalletType = "online" | "live" | "cash" | "other";
export type BankrollDirection = "in" | "out";
export type BankrollTransactionType =
  | "deposit" | "withdrawal" | "transfer_in" | "transfer_out"
  | "adjustment" | "bonus" | "staking_received" | "staking_paid";
export type BankrollSessionType = "tournament" | "cash_game" | "sit_and_go" | "spin" | "other";
export type BankrollFinanceOperationType = "deposit" | "withdrawal";
export type BankrollFinanceIntegrationMode = "integrated" | "bankroll_only";

export type BankrollWallet = {
  id: string; owner_id: string; name: string; wallet_type: BankrollWalletType;
  currency: BankrollCurrency; initial_balance: number; active: boolean;
  notes: string | null; created_at: string; updated_at: string;
};

export type BankrollTransaction = {
  id: string; owner_id: string; wallet_id: string; transaction_date: string;
  transaction_type: BankrollTransactionType; direction: BankrollDirection;
  amount: number; description: string | null; notes: string | null;
  transfer_group_id: string | null; counterpart_wallet_id: string | null;
  bankroll_integration_group_id?: string | null;
  finance_link?: BankrollFinanceLink | null;
  created_at: string; updated_at: string;
};

export type FinanceAccount = {
  id: string; owner_id: string; name: string; type: string;
  currency: BankrollCurrency | null; active: boolean;
};

export type EligibleFinanceAccount = Omit<FinanceAccount, "currency" | "type"> & {
  type: "Conta"; currency: BankrollCurrency;
};

export type BankrollFinanceLink = {
  id: string; owner_id: string; operation_type: BankrollFinanceOperationType;
  finance_transaction_id: string; bankroll_transaction_id: string;
  integration_group_id: string; created_at: string; updated_at: string;
  finance_transaction?: {
    id: string; account_id: string; description: string; due_date: string;
    value: number; status: string; type: string;
    origin_account_id: string | null; destination_account_id: string | null;
    bankroll_integration_group_id: string;
    bankroll_operation_type: BankrollFinanceOperationType;
  } | null;
};

type BankrollFinanceOperationBase = {
  operationType: BankrollFinanceOperationType;
  accountId: string; walletId: string; date: string; amount: number;
  notes: string | null;
};

export type BankrollFinanceCreateOperation = BankrollFinanceOperationBase & {
  idempotencyKey: string;
  integrationGroupId?: never;
};

export type BankrollFinanceUpdateOperation = BankrollFinanceOperationBase & {
  integrationGroupId: string;
  idempotencyKey?: never;
};

export type BankrollFinanceOperation =
  | BankrollFinanceCreateOperation
  | BankrollFinanceUpdateOperation;

export type BankrollSession = {
  id: string; owner_id: string; wallet_id: string; session_date: string;
  session_type: BankrollSessionType; game_type: string; format: string | null;
  event_name: string | null; buy_in: number; reentries: number;
  reentry_cost: number; add_on_cost: number; prize: number; fees: number;
  cash_buy_in: number | null; cash_out: number | null; duration_minutes: number | null;
  notes: string | null; created_at: string; updated_at: string;
};

export type WalletBalance = BankrollWallet & { current_balance: number };
export type CurrencyTotal = { currency: BankrollCurrency; amount: number };

export type WalletInput = Pick<BankrollWallet, "name" | "wallet_type" | "currency" | "initial_balance" | "active" | "notes">;
export type TransactionInput = Pick<BankrollTransaction, "wallet_id" | "transaction_date" | "transaction_type" | "direction" | "amount" | "description" | "notes">;
export type SessionInput = Pick<BankrollSession, "wallet_id" | "session_date" | "session_type" | "game_type" | "format" | "event_name" | "buy_in" | "reentries" | "reentry_cost" | "add_on_cost" | "prize" | "fees" | "cash_buy_in" | "cash_out" | "duration_minutes" | "notes">;
