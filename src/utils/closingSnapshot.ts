import type { ClosingSnapshot } from "@/src/types/closing";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isPrimaryCurrency } from "./currencies.ts";

export type ClosingSnapshotTransaction = {
  type: string;
  status: string | null;
  value: number | null;
  account?: { currency?: string | null } | null;
};

/**
 * Totais persistidos em competence_closures. A tabela não guarda moeda, então
 * os totais representam somente a moeda principal (BRL); lançamentos de contas
 * em outras moedas não entram. Snapshots gravados antes desta regra podem
 * conter valores de moedas diferentes somados e não são recalculados.
 */
export function buildClosingSnapshot(
  transactions: readonly ClosingSnapshotTransaction[],
): ClosingSnapshot {
  const snapshot: ClosingSnapshot = {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    pendingIncome: 0,
    pendingExpense: 0,
    paidIncome: 0,
    paidExpense: 0,
  };

  for (const item of transactions) {
    if (!isPrimaryCurrency(item.account?.currency)) continue;

    const value = Number(item.value ?? 0);

    if (item.type === "Receita") {
      snapshot.totalIncome += value;

      if (item.status === "Recebido") {
        snapshot.paidIncome += value;
      }

      if (item.status === "Pendente") {
        snapshot.pendingIncome += value;
      }
    }

    if (item.type === "Despesa") {
      snapshot.totalExpense += value;

      if (item.status === "Pago") {
        snapshot.paidExpense += value;
      }

      if (item.status === "Pendente") {
        snapshot.pendingExpense += value;
      }
    }
  }

  snapshot.balance = snapshot.totalIncome - snapshot.totalExpense;

  return snapshot;
}
