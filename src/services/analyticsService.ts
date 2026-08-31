import { supabase } from "@/src/lib/supabase";
import type {
  AnalyticsAccount,
  AnalyticsCategory,
  AnalyticsCompetence,
  AnalyticsDataset,
  AnalyticsFilters,
  AnalyticsFinancialTarget,
  AnalyticsReferenceData,
  AnalyticsTransaction,
} from "@/src/types/analytics";
import { requiresTraditionalAccountClosure } from "@/src/utils/closingAccounts";

export async function loadAnalyticsReferenceData(
  ownerId: string
): Promise<AnalyticsReferenceData> {
  const [accountsResponse, categoriesResponse, competencesResponse] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type, active, show_on_investments_dashboard, investment_account_kind")
        .eq("owner_id", ownerId)
        .order("active", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("categories")
        .select("id, name, type, active")
        .eq("owner_id", ownerId)
        .order("active", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("competences")
        .select("id, name, month, year")
        .eq("owner_id", ownerId)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(120),
    ]);

  const error =
    accountsResponse.error ??
    categoriesResponse.error ??
    competencesResponse.error;

  if (error) throw new Error(error.message);

  return {
    accounts: (accountsResponse.data ?? []) as AnalyticsAccount[],
    categories: (categoriesResponse.data ?? []) as AnalyticsCategory[],
    competences: (competencesResponse.data ?? []) as AnalyticsCompetence[],
  };
}

export async function loadAnalyticsDataset(
  ownerId: string,
  competenceIds: string[],
  filters: AnalyticsFilters,
  selectedCompetenceIds: string[]
): Promise<AnalyticsDataset> {
  if (competenceIds.length === 0) {
    return { transactions: [], financialTargets: [], openingBalance: 0 };
  }

  const pageSize = 1000;
  const transactions: AnalyticsTransaction[] = [];
  let transactionsError: { message: string } | null = null;

  for (let from = 0; ; from += pageSize) {
    let transactionsQuery = supabase
      .from("transactions")
      .select(`
        id,
        competence_id,
        account_id,
        category_id,
        origin_account_id,
        destination_account_id,
        bankroll_integration_group_id,
        bankroll_operation_type,
        investment_integration_group_id,
        investment_event_type,
        description,
        due_date,
        type,
        value,
        status,
        account:accounts!transactions_account_id_fkey(name, type),
        category:categories!transactions_category_id_fkey(name, type)
      `)
      .eq("owner_id", ownerId)
      .in("competence_id", competenceIds)
      .gte("due_date", filters.startDate)
      .lte("due_date", filters.endDate)
      .order("due_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (filters.accountId) {
      transactionsQuery = transactionsQuery.eq("account_id", filters.accountId);
    }

    if (filters.categoryId) {
      transactionsQuery = transactionsQuery.eq("category_id", filters.categoryId);
    }

    if (filters.status) {
      transactionsQuery = transactionsQuery.eq("status", filters.status);
    }

    const pageResponse = await transactionsQuery;
    if (pageResponse.error) {
      transactionsError = pageResponse.error;
      break;
    }

    const page = (pageResponse.data ?? []) as unknown as AnalyticsTransaction[];
    transactions.push(...page);
    if (page.length < pageSize) break;
  }

  const closingAccountsResponse = await supabase
    .from("accounts")
    .select(
      "id, type, show_on_investments_dashboard, investment_account_kind",
    )
    .eq("owner_id", ownerId);
  const closingAccountIds = (
    (closingAccountsResponse.data ?? []) as AnalyticsAccount[]
  )
    .filter(requiresTraditionalAccountClosure)
    .map((account) => account.id);
  const selectedClosingAccountIds = filters.accountId
    ? closingAccountIds.filter((accountId) => accountId === filters.accountId)
    : closingAccountIds;

  let openingBalanceResponse: {
    data: Array<{ opening_balance: number | null }> | null;
    error: { message: string } | null;
  } = { data: [], error: null };

  if (selectedClosingAccountIds.length > 0) {
    openingBalanceResponse = await supabase
      .from("account_closures")
      .select("opening_balance")
      .eq("owner_id", ownerId)
      .eq("competence_id", selectedCompetenceIds[0] ?? competenceIds[0])
      .eq("account_type", "Conta")
      .in("account_id", selectedClosingAccountIds);
  }

  let targetsResponse: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };
  if (selectedCompetenceIds.length === 1) {
    let targetsQuery = supabase
      .from("financial_targets")
      .select("competence_id, target_id, planned_value")
      .eq("owner_id", ownerId)
      .eq("target_type", "category")
      .in("competence_id", selectedCompetenceIds);
    if (filters.categoryId) targetsQuery = targetsQuery.eq("target_id", filters.categoryId);
    targetsResponse = await targetsQuery;
  }

  const error =
    transactionsError ??
    closingAccountsResponse.error ??
    openingBalanceResponse.error ??
    targetsResponse.error;
  if (error) throw new Error(error.message);

  return {
    transactions,
    financialTargets: (targetsResponse.data ?? []) as AnalyticsFinancialTarget[],
    openingBalance: (openingBalanceResponse.data ?? []).reduce(
      (sum, closure) => sum + Number(closure.opening_balance ?? 0),
      0
    ),
  };
}
