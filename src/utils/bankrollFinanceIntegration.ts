import type {
  BankrollFinanceCreateOperation,
  BankrollFinanceIntegrationMode,
  BankrollFinanceOperationType,
  BankrollWallet,
  EligibleFinanceAccount,
} from "../types/bankroll";

export function createBankrollFinanceIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

export function buildBankrollFinanceCreateRpcParams(
  input: BankrollFinanceCreateOperation
) {
  return {
    p_account_id: input.accountId,
    p_wallet_id: input.walletId,
    p_date: input.date,
    p_amount: input.amount,
    p_notes: input.notes,
    p_idempotency_key: input.idempotencyKey,
  };
}

export function isEligibleFinanceAccount(account: {
  type: string; active: boolean; currency?: string | null;
}): account is EligibleFinanceAccount {
  return account.type === "Conta" && account.active && Boolean(account.currency?.match(/^[A-Z]{3}$/));
}

export function validateBankrollFinanceForm(input: {
  mode: BankrollFinanceIntegrationMode;
  operationType: BankrollFinanceOperationType;
  account?: Pick<EligibleFinanceAccount, "currency"> | null;
  wallet?: Pick<BankrollWallet, "currency" | "active"> | null;
  amount: number;
  date?: string;
}) {
  if (!input.wallet) return "Selecione a carteira do Bankroll.";
  if (!input.wallet.active) return "A carteira do Bankroll está inativa.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "O valor deve ser maior que zero.";
  if (input.date && input.date > new Date().toISOString().slice(0, 10)) {
    return "Operações integradas futuras ainda não são permitidas.";
  }
  if (input.mode === "bankroll_only") return null;
  if (!input.account) {
    return input.operationType === "deposit"
      ? "Selecione a conta financeira de origem."
      : "Selecione a conta financeira de destino.";
  }
  if (input.account.currency !== input.wallet.currency) {
    return "A conta financeira e a carteira precisam usar a mesma moeda.";
  }
  return null;
}

export function getIntegratedFinanceEffect(operationType: BankrollFinanceOperationType, amount: number) {
  const value = Math.round(amount * 100) / 100;
  return operationType === "deposit" ? -value : value;
}

export function getConsolidatedPatrimonialEffect() {
  return 0;
}
