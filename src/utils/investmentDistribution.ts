import type {
  InvestmentAsset,
  InvestmentBalanceAccountSummary,
  InvestmentExchangeRate,
  InvestmentPosition,
} from "@/src/types/investments";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { convertInvestmentValue, resolveExchangeRate } from "./exchangeRateCalculations.ts";
import type { CashReserveRow } from "./investmentReserves";

/*
 * Distribuição patrimonial da Visão geral de Investimentos.
 *
 * Usa exatamente os três componentes do patrimônio consolidado, com a mesma
 * conversão e as mesmas regras de inclusão:
 *   - posições de ativos (summarizeInvestmentPositions): valor atual convertido;
 *   - contas por saldo BALANCE (summarizeInvestmentWealth): saldo convertido;
 *   - reservas em caixa elegíveis (calculateCashReserves): convertedBalance.
 * Itens sem conversão ficam fora do total (como no consolidado) e são contados
 * como pendentes no grupo. Saldo de conta de custódia e de conta operacional
 * nunca entra: só o valor das posições, que já é o componente consolidado.
 * Valores negativos são mantidos.
 */

export type DistributionMode = "class" | "account";

export type DistributionGroupKind =
  | "asset_type"
  | "balance_unclassified"
  | "foreign_reserve"
  | "domestic_reserve"
  | "account";

export type DistributionGroup = {
  key: string;
  label: string;
  kind: DistributionGroupKind;
  /** Soma convertida para a moeda de consolidação (só itens com conversão). */
  value: number;
  /** Participação no total considerado; null quando o total não é positivo. */
  percent: number | null;
  itemCount: number;
  /** Itens do grupo sem conversão (fora do valor e do total). */
  pendingCount: number;
};

export type DistributionComponent = "assets" | "balance" | "reserves";

export type WealthDistribution = {
  byClass: DistributionGroup[];
  byAccount: DistributionGroup[];
  byComponent: Record<DistributionComponent, { value: number; itemCount: number; pendingCount: number }>;
  /** Total considerado: igual ao patrimônio consolidado. */
  total: number;
  pendingCount: number;
  complete: boolean;
};

export const UNCLASSIFIED_BALANCE_LABEL = "Investimentos por saldo não classificados";
export const FOREIGN_RESERVES_LABEL = "Reservas cambiais";
export const UNTYPED_ASSET_LABEL = "Sem tipo";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

type Item = {
  component: DistributionComponent;
  classKey: string;
  classLabel: string;
  classKind: Exclude<DistributionGroupKind, "account">;
  accountId: string;
  accountName: string;
  value: number | null;
};

function group(items: Item[], keyOf: (item: Item) => [string, string, DistributionGroupKind], total: number) {
  const groups = new Map<string, { label: string; kind: DistributionGroupKind; sum: number; itemCount: number; pendingCount: number }>();
  for (const item of items) {
    const [key, label, kind] = keyOf(item);
    const current = groups.get(key) ?? { label, kind, sum: 0, itemCount: 0, pendingCount: 0 };
    current.itemCount += 1;
    if (item.value === null) current.pendingCount += 1;
    else current.sum += item.value;
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, entry]): DistributionGroup => {
      const value = roundMoney(entry.sum);
      return {
        key,
        label: entry.label,
        kind: entry.kind,
        value,
        percent: total > 0 ? (value / total) * 100 : null,
        itemCount: entry.itemCount,
        pendingCount: entry.pendingCount,
      };
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "pt-BR"));
}

export function buildWealthDistribution(params: {
  positions: InvestmentPosition[];
  assets: Pick<InvestmentAsset, "id" | "asset_type">[];
  balanceAccounts: InvestmentBalanceAccountSummary[];
  reserves: CashReserveRow[];
  consolidationCurrency: string;
  rates: InvestmentExchangeRate[];
}): WealthDistribution {
  const consolidation = params.consolidationCurrency.trim().toUpperCase();
  const typeById = new Map(params.assets.map((asset) => [asset.id, asset.asset_type]));

  const items: Item[] = [
    ...params.positions.map((position): Item => {
      // Tipo configurável: agrupa ignorando maiúsculas/espaços, rótulo como cadastrado.
      const type = (typeById.get(position.assetId) ?? "").trim();
      return {
        component: "assets",
        classKey: `type:${type.toLocaleLowerCase("pt-BR") || "-"}`,
        classLabel: type || UNTYPED_ASSET_LABEL,
        classKind: "asset_type",
        accountId: position.accountId,
        accountName: position.accountName,
        value: convertInvestmentValue(
          position.currentValue,
          resolveExchangeRate(position.currency, consolidation, params.rates),
        ),
      };
    }),
    ...params.balanceAccounts.map((account): Item => ({
      component: "balance",
      // Não há classificação confiável para contas BALANCE: não presumir Renda Fixa.
      classKey: "balance-unclassified",
      classLabel: UNCLASSIFIED_BALANCE_LABEL,
      classKind: "balance_unclassified",
      accountId: account.accountId,
      accountName: account.accountName,
      value: convertInvestmentValue(
        account.balance,
        resolveExchangeRate(account.currency, consolidation, params.rates),
      ),
    })),
    ...params.reserves.map((reserve): Item => {
      // Moeda não confirmada conta como estrangeira (mesma regra de splitCashReservesByCurrency).
      const domestic = reserve.currency === consolidation;
      return {
        component: "reserves",
        classKey: domestic ? "reserves-domestic" : "reserves-foreign",
        classLabel: domestic ? `Reservas em caixa (${consolidation})` : FOREIGN_RESERVES_LABEL,
        classKind: domestic ? "domestic_reserve" : "foreign_reserve",
        accountId: reserve.accountId,
        accountName: reserve.accountName,
        value: reserve.convertedBalance,
      };
    }),
  ];

  const total = roundMoney(items.reduce((sum, item) => sum + (item.value ?? 0), 0));
  const pendingCount = items.filter((item) => item.value === null).length;
  const component = (name: DistributionComponent) => {
    const rows = items.filter((item) => item.component === name);
    return {
      value: roundMoney(rows.reduce((sum, item) => sum + (item.value ?? 0), 0)),
      itemCount: rows.length,
      pendingCount: rows.filter((item) => item.value === null).length,
    };
  };

  return {
    byClass: group(items, (item) => [item.classKey, item.classLabel, item.classKind], total),
    // Por id da conta: contas diferentes nunca se juntam por semelhança de nome.
    byAccount: group(items, (item) => [`account:${item.accountId}`, item.accountName, "account"], total),
    byComponent: { assets: component("assets"), balance: component("balance"), reserves: component("reserves") },
    total,
    pendingCount,
    complete: pendingCount === 0,
  };
}

/* Preferência do seletor (Por classe | Por conta), por usuário, no mesmo
 * padrão das preferências de visualização: chave versionada no localStorage
 * e falha silenciosa quando o armazenamento não está disponível. */

export type DistributionPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function distributionPreferenceKey(userId: string) {
  return `finance-smart:investments-distribution:v1:${userId}`;
}

export function readDistributionMode(storage: DistributionPreferenceStorage | null, userId: string | null): DistributionMode {
  if (!storage || !userId) return "class";
  try {
    return storage.getItem(distributionPreferenceKey(userId)) === "account" ? "account" : "class";
  } catch {
    return "class";
  }
}

export function writeDistributionMode(storage: DistributionPreferenceStorage | null, userId: string | null, mode: DistributionMode) {
  if (!storage || !userId) return;
  try {
    storage.setItem(distributionPreferenceKey(userId), mode);
  } catch {
    // Armazenamento cheio ou bloqueado: a escolha vale só nesta visita.
  }
}
