import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { fetchAllPages } from "@/src/services/financialOverviewService";
import type {
  OverviewClosure,
  OverviewCompetence,
  OverviewTransaction,
} from "@/src/utils/financialOverview";
import type { CashReserveAccount, CashReserveSources } from "@/src/utils/investmentReserves";

/**
 * Dados para o saldo das reservas em caixa (Contas ativas com papel explícito
 * Reserva / investimento). Somente leitura; o filtro final de elegibilidade
 * (BALANCE, custódia) fica em investmentReserves.ts.
 */
export async function loadCashReserveSources(today: string): Promise<CashReserveSources> {
  const ownerId = await getCurrentUserId();
  const accountsResponse = await supabase
    .from("accounts")
    .select("id, name, type, currency, current_balance, active, investment_account_kind, planning_role")
    .eq("owner_id", ownerId)
    .eq("type", "Conta")
    .eq("active", true)
    .eq("planning_role", "savings");
  if (accountsResponse.error) throw new Error(accountsResponse.error.message);

  const accounts = (accountsResponse.data ?? []) as CashReserveAccount[];
  if (accounts.length === 0) return { accounts, competences: [], closures: [], transactions: [] };
  const accountIds = accounts.map((account) => account.id);

  const [competencesResponse, closuresResponse, transactions] = await Promise.all([
    supabase.from("competences").select("id, month, year").eq("owner_id", ownerId),
    supabase
      .from("account_closures")
      .select("account_id, competence_id, closing_balance, status")
      .eq("owner_id", ownerId)
      .in("account_id", accountIds),
    fetchAllPages<OverviewTransaction>((from, to) =>
      supabase
        .from("transactions")
        .select("id, account_id, competence_id, due_date, type, value, status")
        .eq("owner_id", ownerId)
        .in("account_id", accountIds)
        .lte("due_date", today)
        .order("id")
        .range(from, to)),
  ]);
  if (competencesResponse.error) throw new Error(competencesResponse.error.message);
  if (closuresResponse.error) throw new Error(closuresResponse.error.message);

  return {
    accounts,
    competences: (competencesResponse.data ?? []) as OverviewCompetence[],
    // Mesma regra da Visão Financeira: só fechamentos com status "Fechada"
    // (ou legados sem status) valem como saldo de partida.
    closures: ((closuresResponse.data ?? []) as (OverviewClosure & { status: string | null })[])
      .filter((closure) => closure.status === null || closure.status === "Fechada"),
    transactions,
  };
}
