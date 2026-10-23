// Aportes e resgates entre conta financeira e corretora de ativos, feitos como
// transferência vinculada (mesmas RPCs create/update/delete_transfer). As
// regras espelham public.resolve_transfer_accounts (migration 202610240001);
// o banco valida de novo e é a fonte da verdade.
//
// Corretora de ativos = Conta marcada para Investimentos que NÃO é
// investimento por saldo (é a conta exigida pelas operações de compra/venda).
// Nada depende de nome, banco ou ticker.

// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isFinancialAccount, type ClosingAccountClassification } from "./closingAccounts.ts";

export type TransferAccount = ClosingAccountClassification & {
  currency?: string | null;
  active?: boolean | null;
};

export type TransferClassification =
  | { kind: "traditional" }
  | { kind: "contribution" }
  | { kind: "redemption" }
  | { kind: "blocked"; message: string };

export const BROKERAGE_TRANSFER_LABELS = {
  contribution: "Aporte em investimento",
  redemption: "Resgate de investimento",
} as const;

export const BROKERAGE_TRANSFER_HINTS = {
  contribution:
    "Debita a conta de origem uma única vez. Conta como guardado conforme o papel da corretora no planejamento. Não é despesa; registre a compra dos ativos em Investimentos, sem novo lançamento.",
  redemption:
    "Credita a conta de destino uma única vez e reduz o guardado conforme o papel da corretora no planejamento. Não é receita; vendas que ficam na corretora não precisam de resgate.",
} as const;

export function isBrokerageAccount(account: TransferAccount | null | undefined) {
  return Boolean(
    account &&
      account.type === "Conta" &&
      account.show_on_investments_dashboard === true &&
      (account.investment_account_kind ?? null) === null,
  );
}

/** Conta que pode ser a outra ponta de uma transferência (financeira ou corretora). */
export function isTransferEligibleAccount(account: TransferAccount) {
  return isFinancialAccount(account) || isBrokerageAccount(account);
}

const normalizeCurrency = (currency: string | null | undefined) =>
  currency?.trim().toUpperCase() || null;

/**
 * Classifica a transferência pelas contas. Contas por saldo (BALANCE) e
 * cartões não entram; corretora <-> corretora não é suportado; aporte e
 * resgate exigem a mesma moeda confirmada nas duas pontas.
 */
export function classifyTransferAccounts(
  origin: TransferAccount | null | undefined,
  destination: TransferAccount | null | undefined,
): TransferClassification | null {
  if (!origin || !destination) return null;
  if (origin.type !== "Conta" || destination.type !== "Conta") {
    return { kind: "blocked", message: "Transferências só podem movimentar contas, não cartões." };
  }
  if (origin.investment_account_kind || destination.investment_account_kind) {
    return {
      kind: "blocked",
      message:
        "Contas de investimento por saldo devem ser movimentadas exclusivamente pelo módulo Investimentos.",
    };
  }

  const originIsBrokerage = isBrokerageAccount(origin);
  const destinationIsBrokerage = isBrokerageAccount(destination);
  if (!originIsBrokerage && !destinationIsBrokerage) return { kind: "traditional" };
  if (originIsBrokerage && destinationIsBrokerage) {
    return {
      kind: "blocked",
      message:
        "Transferências entre duas corretoras não são suportadas. Registre um resgate para uma conta financeira e depois um aporte.",
    };
  }

  const originCurrency = normalizeCurrency(origin.currency);
  const destinationCurrency = normalizeCurrency(destination.currency);
  if (!originCurrency || !destinationCurrency) {
    return {
      kind: "blocked",
      message:
        "Confirme a moeda das duas contas em Contas/Cartões antes de registrar aporte ou resgate.",
    };
  }
  if (originCurrency !== destinationCurrency) {
    return {
      kind: "blocked",
      message: `Aportes e resgates com corretora exigem a mesma moeda nas duas contas (${originCurrency} e ${destinationCurrency}).`,
    };
  }

  return { kind: destinationIsBrokerage ? "contribution" : "redemption" };
}

/** Origem: contas financeiras e corretoras ativas (a lista já vem filtrada por ativas). */
export function getTransferOriginOptions<T extends TransferAccount>(accounts: readonly T[]) {
  return accounts.filter(isTransferEligibleAccount);
}

/**
 * Destino: se a origem é corretora, só contas financeiras (resgate); senão,
 * financeiras e corretoras. Nunca a própria origem.
 */
export function getTransferDestinationOptions<T extends TransferAccount & { id: string }>(
  accounts: readonly T[],
  origin: T | null | undefined,
) {
  const originIsBrokerage = isBrokerageAccount(origin);
  return accounts.filter(
    (account) =>
      account.id !== origin?.id &&
      (isFinancialAccount(account) || (!originIsBrokerage && isBrokerageAccount(account))),
  );
}
