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

export async function loadAnalyticsReferenceData(
  ownerId: string
): Promise<AnalyticsReferenceData> {
  const [accountsResponse, categoriesResponse, competencesResponse] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type, active")
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
    .lte("due_date", filters.endDate);

  if (filters.accountId) {
    transactionsQuery = transactionsQuery.eq("account_id", filters.accountId);
  }

  if (filters.categoryId) {
    transactionsQuery = transactionsQuery.eq("category_id", filters.categoryId);
  }

  if (filters.status) {
    transactionsQuery = transactionsQuery.eq("status", filters.status);
  }

  let openingBalanceQuery = supabase
    .from("account_closures")
    .select("opening_balance")
    .eq("owner_id", ownerId)
    .eq("competence_id", selectedCompetenceIds[0] ?? competenceIds[0])
    .eq("account_type", "Conta");

  if (filters.accountId) {
    openingBalanceQuery = openingBalanceQuery.eq("account_id", filters.accountId);
  }

  const [transactionsResponse, openingBalanceResponse] = await Promise.all([
    transactionsQuery,
    openingBalanceQuery,
  ]);

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

  const error = transactionsResponse.error ?? openingBalanceResponse.error ?? targetsResponse.error;
  if (error) throw new Error(error.message);

  return {
    transactions: (transactionsResponse.data ?? []) as unknown as AnalyticsTransaction[],
    financialTargets: (targetsResponse.data ?? []) as AnalyticsFinancialTarget[],
    openingBalance: (openingBalanceResponse.data ?? []).reduce(
      (sum, closure) => sum + Number(closure.opening_balance ?? 0),
      0
    ),
  };
}
