import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { ensureCompetenceExists } from "@/src/services/competenceService";
import {
  getHistoryMonths,
  monthEnd,
  monthStart,
  resolvePlanningRole,
  shiftMonth,
  type OverviewAccount,
  type OverviewCardStatement,
  type OverviewClosure,
  type OverviewCompetence,
  type OverviewInput,
  type OverviewRecurring,
  type OverviewTransaction,
  type PlanningRole,
} from "@/src/utils/financialOverview";

const TRANSACTION_FIELDS =
  "id, account_id, competence_id, due_date, type, value, status, description, origin_account_id, destination_account_id, recurring_transaction_id, mode, parcel_number, investment_event_type";
const PAGE_SIZE = 1000;

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Lê todas as páginas (o PostgREST limita cada resposta). */
async function fetchAllPages<T>(buildQuery: (from: number, to: number) => QueryResult<T>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function throwIfError<T>(response: { data: T | null; error: { message: string } | null }) {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function loadFinancialOverviewInput(params: {
  year: number;
  month: number;
  today: string;
}): Promise<OverviewInput> {
  const ownerId = await getCurrentUserId();
  const previous = shiftMonth(params.year, params.month, -1);

  const [accountsResponse, competencesResponse, closuresResponse, recurringResponse] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, name, type, currency, current_balance, active, show_on_investments_dashboard, investment_account_kind, planning_role, use_spending_history, spending_history_start_date, due_day",
      )
      .eq("owner_id", ownerId),
    supabase.from("competences").select("id, month, year").eq("owner_id", ownerId),
    supabase
      .from("account_closures")
      .select("account_id, competence_id, closing_balance, status")
      .eq("owner_id", ownerId),
    supabase
      .from("recurring_transactions")
      .select("id, type, amount, account_id, start_competence_id, end_competence_id")
      .eq("owner_id", ownerId)
      .eq("status", "active"),
  ]);

  const accounts = (throwIfError(accountsResponse) ?? []) as OverviewAccount[];
  const competences = (throwIfError(competencesResponse) ?? []) as OverviewCompetence[];
  // Reabrir um fechamento apaga o registro; qualquer status diferente de
  // "Fechada" é ignorado por segurança.
  const closures = ((throwIfError(closuresResponse) ?? []) as (OverviewClosure & { status: string | null })[])
    .filter((closure) => closure.status === null || closure.status === "Fechada");
  const recurring = (throwIfError(recurringResponse) ?? []) as OverviewRecurring[];

  const competence = competences.find((item) => item.year === params.year && item.month === params.month);
  const previousCompetence = competences.find((item) => item.year === previous.year && item.month === previous.month);
  const order = new Map(competences.map((item) => [item.id, item.year * 100 + item.month]));

  const role = (account: OverviewAccount): PlanningRole => resolvePlanningRole(account);
  const operationalCash = accounts.filter((account) => account.active && account.type === "Conta" && role(account) === "operational");
  const operationalCards = accounts.filter((account) => account.active && account.type === "Cartão" && role(account) === "operational");
  const historyAccounts = operationalCash.filter((account) => account.use_spending_history !== false);

  const historyMonths = getHistoryMonths(params.year, params.month, params.today);
  const historyStart = monthStart(historyMonths[historyMonths.length - 1].year, historyMonths[historyMonths.length - 1].month);
  const historyEnd = monthEnd(historyMonths[0].year, historyMonths[0].month);

  const transactionsById = new Map<string, OverviewTransaction>();
  const addAll = (rows: OverviewTransaction[]) => rows.forEach((row) => transactionsById.set(row.id, row));

  const tasks: Promise<void>[] = [];

  if (competence) {
    tasks.push(fetchAllPages<OverviewTransaction>((from, to) =>
      supabase.from("transactions").select(TRANSACTION_FIELDS)
        .eq("owner_id", ownerId).eq("competence_id", competence.id)
        .order("id").range(from, to)).then(addAll));
  }

  if (previousCompetence && operationalCards.length > 0) {
    tasks.push(fetchAllPages<OverviewTransaction>((from, to) =>
      supabase.from("transactions").select(TRANSACTION_FIELDS)
        .eq("owner_id", ownerId).eq("competence_id", previousCompetence.id)
        .in("account_id", operationalCards.map((account) => account.id))
        .order("id").range(from, to)).then(addAll));
  }

  if (historyAccounts.length > 0) {
    tasks.push(fetchAllPages<OverviewTransaction>((from, to) =>
      supabase.from("transactions").select(TRANSACTION_FIELDS)
        .eq("owner_id", ownerId).eq("type", "Despesa")
        .in("account_id", historyAccounts.map((account) => account.id))
        .gte("due_date", historyStart).lte("due_date", historyEnd)
        .order("id").range(from, to)).then(addAll));
  }

  // Saldos de hoje: só para o mês atual. Lançamentos depois do último
  // fechamento anterior ao mês atual (ou todos, se a conta nunca foi fechada).
  const currentOrder = Number(params.today.slice(0, 4)) * 100 + Number(params.today.slice(5, 7));
  const isCurrentMonth = params.year * 100 + params.month === currentOrder;
  if (isCurrentMonth) {
    for (const account of operationalCash) {
      const latestClosureOrder = closures
        .filter((closure) => closure.account_id === account.id)
        .map((closure) => order.get(closure.competence_id))
        .filter((value): value is number => value !== undefined && value < currentOrder)
        .sort((left, right) => right - left)[0];
      const competenceIds = latestClosureOrder === undefined
        ? null
        : competences.filter((item) => item.year * 100 + item.month > latestClosureOrder).map((item) => item.id);
      if (competenceIds && competenceIds.length === 0) continue;

      tasks.push(fetchAllPages<OverviewTransaction>((from, to) => {
        let query = supabase.from("transactions").select(TRANSACTION_FIELDS)
          .eq("owner_id", ownerId).eq("account_id", account.id)
          .lte("due_date", params.today);
        if (competenceIds) query = query.in("competence_id", competenceIds);
        return query.order("id").range(from, to);
      }).then(addAll));
    }
  }

  const firstTransactionDateByAccount: Record<string, string> = {};
  for (const account of historyAccounts) {
    tasks.push((async () => {
      const response = await supabase.from("transactions").select("due_date")
        .eq("owner_id", ownerId).eq("account_id", account.id)
        .order("due_date", { ascending: true }).limit(1).maybeSingle();
      const data = throwIfError(response) as { due_date: string } | null;
      if (data?.due_date) firstTransactionDateByAccount[account.id] = data.due_date;
    })());
  }

  let cardStatements: OverviewCardStatement[] = [];
  if (previousCompetence && operationalCards.length > 0) {
    tasks.push((async () => {
      const response = await supabase.from("credit_card_statements")
        .select("account_id, competence_id, payment_transaction_id")
        .eq("owner_id", ownerId).eq("competence_id", previousCompetence.id);
      cardStatements = (throwIfError(response) ?? []) as OverviewCardStatement[];
    })());
  }

  let savingsGoal: number | null = null;
  const cardTargets: Record<string, number> = {};
  if (competence) {
    tasks.push((async () => {
      const response = await supabase.from("monthly_savings_goals").select("amount")
        .eq("owner_id", ownerId).eq("competence_id", competence.id).maybeSingle();
      const data = throwIfError(response) as { amount: number } | null;
      savingsGoal = data ? Number(data.amount) : null;
    })());
    if (operationalCards.length > 0) {
      tasks.push((async () => {
        const response = await supabase.from("financial_targets").select("target_id, planned_value")
          .eq("owner_id", ownerId).eq("competence_id", competence.id).eq("target_type", "account")
          .in("target_id", operationalCards.map((account) => account.id));
        for (const target of (throwIfError(response) ?? []) as { target_id: string; planned_value: number }[]) {
          cardTargets[target.target_id] = Number(target.planned_value ?? 0);
        }
      })());
    }
  }

  await Promise.all(tasks);

  // Aplicação/resgate de Investimentos não guarda a conta de investimento no
  // lançamento; ela vem do evento integrado.
  const transactions = [...transactionsById.values()];
  const integratedIds = transactions
    .filter((transaction) => transaction.investment_event_type)
    .map((transaction) => transaction.id);
  if (integratedIds.length > 0) {
    const response = await supabase.from("investment_account_events")
      .select("finance_transaction_id, investment_account_id")
      .eq("owner_id", ownerId).in("finance_transaction_id", integratedIds);
    const events = (throwIfError(response) ?? []) as { finance_transaction_id: string; investment_account_id: string }[];
    const investmentAccountByTransaction = new Map(events.map((event) => [event.finance_transaction_id, event.investment_account_id]));
    for (const transaction of transactions) {
      const investmentAccountId = investmentAccountByTransaction.get(transaction.id);
      if (investmentAccountId) transaction.investment_account_id = investmentAccountId;
    }
  }

  return {
    today: params.today,
    year: params.year,
    month: params.month,
    accounts,
    competences,
    closures,
    cardStatements,
    recurring,
    transactions,
    firstTransactionDateByAccount,
    savingsGoal,
    cardTargets,
  };
}

/** Meta de economia da competência: valor > 0 grava; vazio remove. */
export async function saveMonthlySavingsGoal(params: { year: number; month: number; amount: number | null }) {
  const ownerId = await getCurrentUserId();
  const competence = await ensureCompetenceExists(`${params.year}-${String(params.month).padStart(2, "0")}`);

  if (params.amount === null) {
    const { error } = await supabase.from("monthly_savings_goals").delete()
      .eq("owner_id", ownerId).eq("competence_id", competence.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("monthly_savings_goals").upsert(
    { owner_id: ownerId, competence_id: competence.id, amount: params.amount, updated_at: new Date().toISOString() },
    { onConflict: "owner_id,competence_id" },
  );
  if (error) throw new Error(error.message);
}
