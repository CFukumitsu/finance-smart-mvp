import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  fetchAccountBalanceTransactions,
  fetchAllPages,
  filterClosedAccountClosures,
} from "@/src/services/financialOverviewService";
import {
  calculateAccountBalanceAt,
  type OverviewClosure,
  type OverviewCompetence,
  type OverviewTransaction,
} from "@/src/utils/financialOverview";
import {
  calculateAccountPeriodBalances,
  getAccountPeriodBalanceReferences,
  type AccountPeriodBalances,
} from "@/src/utils/accountPeriodBalances";
import {
  getCardInvoiceDueDate,
  summarizeCardShortcut,
  type CardShortcutSummary,
} from "@/src/utils/accountShortcuts";

export type ShortcutAccount = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  currency: string | null;
  current_balance: number | null;
  due_day: number | null;
};

export type TransactionShortcutSummary =
  | { kind: "account"; balance: number }
  | ({
      kind: "card";
      /** Competência da fatura exibida (a do mês de hoje). */
      year: number;
      month: number;
      dueDate: string | null;
    } & CardShortcutSummary);

type CardTransactionRow = { account_id: string; type: string; value: number };

/**
 * Situação atual das contas/cartões dos atalhos de Lançamentos. Não depende
 * de nenhum filtro da listagem (busca, período, tipo, status ou categoria).
 * - Conta: saldo de hoje pela mesma regra da Visão Financeira
 *   (calculateAccountBalanceAt).
 * - Cartão: fatura da competência do mês de hoje (compras − estornos), limite
 *   planejado (financial_targets) dessa competência e vencimento.
 * Valores sempre na moeda da própria conta/cartão, sem conversão.
 */
export async function loadTransactionShortcutSummaries(params: {
  accounts: ShortcutAccount[];
  /** Hoje, YYYY-MM-DD (data local). */
  today: string;
}): Promise<Record<string, TransactionShortcutSummary>> {
  if (params.accounts.length === 0) return {};

  const ownerId = await getCurrentUserId();
  const cashAccounts = params.accounts.filter((account) => account.type === "Conta");
  const cards = params.accounts.filter((account) => account.type === "Cartão");
  const year = Number(params.today.slice(0, 4));
  const month = Number(params.today.slice(5, 7));

  const [competencesResponse, closuresResponse] = await Promise.all([
    supabase.from("competences").select("id, month, year").eq("owner_id", ownerId),
    cashAccounts.length > 0
      ? supabase
          .from("account_closures")
          .select("account_id, competence_id, closing_balance, status")
          .eq("owner_id", ownerId)
          .in("account_id", cashAccounts.map((account) => account.id))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (competencesResponse.error) throw new Error(competencesResponse.error.message);
  if (closuresResponse.error) throw new Error(closuresResponse.error.message);

  const competences = (competencesResponse.data ?? []) as OverviewCompetence[];
  const closures = filterClosedAccountClosures(
    (closuresResponse.data ?? []) as (OverviewClosure & { status: string | null })[],
  );
  const currentCompetence = competences.find((item) => item.year === year && item.month === month);
  const summaries: Record<string, TransactionShortcutSummary> = {};

  const balanceTasks = cashAccounts.map(async (account) => {
    const transactions = await fetchAccountBalanceTransactions({
      ownerId,
      accountId: account.id,
      asOf: params.today,
      closures,
      competences,
    });
    summaries[account.id] = {
      kind: "account",
      balance: calculateAccountBalanceAt({
        account: { ...account, active: true },
        asOf: params.today,
        competences,
        closures,
        transactions,
      }),
    };
  });

  const cardTask = (async () => {
    if (cards.length === 0) return;
    const cardIds = cards.map((account) => account.id);

    const [cardTransactions, statementsResponse, targetsResponse] = currentCompetence
      ? await Promise.all([
          fetchAllPages<CardTransactionRow>((from, to) =>
            supabase
              .from("transactions")
              .select("account_id, type, value")
              .eq("owner_id", ownerId)
              .eq("competence_id", currentCompetence.id)
              .in("account_id", cardIds)
              .order("id")
              .range(from, to),
          ),
          supabase
            .from("credit_card_statements")
            .select("account_id, payment_due_date")
            .eq("owner_id", ownerId)
            .eq("competence_id", currentCompetence.id)
            .in("account_id", cardIds),
          supabase
            .from("financial_targets")
            .select("target_id, planned_value")
            .eq("owner_id", ownerId)
            .eq("competence_id", currentCompetence.id)
            .eq("target_type", "account")
            .in("target_id", cardIds),
        ])
      : [[], { data: [], error: null }, { data: [], error: null }];

    if (statementsResponse.error) throw new Error(statementsResponse.error.message);
    if (targetsResponse.error) throw new Error(targetsResponse.error.message);

    const statements = (statementsResponse.data ?? []) as {
      account_id: string;
      payment_due_date: string | null;
    }[];
    const targets = (targetsResponse.data ?? []) as { target_id: string; planned_value: number | null }[];

    for (const card of cards) {
      const statement = statements.find((item) => item.account_id === card.id);
      const target = targets.find((item) => item.target_id === card.id);
      summaries[card.id] = {
        kind: "card",
        year,
        month,
        dueDate: getCardInvoiceDueDate({
          year,
          month,
          dueDay: card.due_day,
          statementDueDate: statement?.payment_due_date ?? null,
        }),
        ...summarizeCardShortcut({
          transactions: cardTransactions.filter((transaction) => transaction.account_id === card.id),
          plannedLimit: target ? Number(target.planned_value ?? 0) : null,
        }),
      };
    }
  })();

  await Promise.all([...balanceTasks, cardTask]);
  return summaries;
}

/**
 * Saldos da conta selecionada no resumo de Lançamentos (início do mês, hoje e
 * fim do mês), pela regra canônica. Independe de busca, tipo, status e
 * categoria; depende só da conta, da competência e de hoje.
 */
export async function loadAccountPeriodBalances(params: {
  account: ShortcutAccount;
  year: number;
  month: number;
  /** Hoje, YYYY-MM-DD (data local). */
  today: string;
}): Promise<AccountPeriodBalances> {
  const ownerId = await getCurrentUserId();
  const [competencesResponse, closuresResponse] = await Promise.all([
    supabase.from("competences").select("id, month, year").eq("owner_id", ownerId),
    supabase
      .from("account_closures")
      .select("account_id, competence_id, closing_balance, status")
      .eq("owner_id", ownerId)
      .eq("account_id", params.account.id),
  ]);

  if (competencesResponse.error) throw new Error(competencesResponse.error.message);
  if (closuresResponse.error) throw new Error(closuresResponse.error.message);

  const competences = (competencesResponse.data ?? []) as OverviewCompetence[];
  const closures = filterClosedAccountClosures(
    (closuresResponse.data ?? []) as (OverviewClosure & { status: string | null })[],
  );

  // Cada data de referência traz os lançamentos posteriores ao fechamento
  // que ela usa; a união atende às três datas sem ler o histórico inteiro.
  const batches = await Promise.all(
    getAccountPeriodBalanceReferences(params.year, params.month, params.today).map((reference) =>
      fetchAccountBalanceTransactions({
        ownerId,
        accountId: params.account.id,
        asOf: reference.asOf,
        exclusive: reference.exclusive,
        closures,
        competences,
      }),
    ),
  );
  const transactions = [
    ...new Map(batches.flat().map((transaction: OverviewTransaction) => [transaction.id, transaction])).values(),
  ];

  return calculateAccountPeriodBalances({
    account: { ...params.account, active: true },
    year: params.year,
    month: params.month,
    today: params.today,
    competences,
    closures,
    transactions,
  });
}
