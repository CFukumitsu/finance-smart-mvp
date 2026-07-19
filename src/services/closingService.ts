import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type { CompetenceClosure, ClosingSnapshot } from "@/src/types/closing";

export async function getClosureByCompetenceId(
  competenceId: string
): Promise<CompetenceClosure | null> {
  const ownerId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("competence_closures")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("competence_id", competenceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function calculateClosingSnapshot(
  competenceId: string
): Promise<ClosingSnapshot> {
  const ownerId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("transactions")
    .select("type, status, value")
    .eq("owner_id", ownerId)
    .eq("competence_id", competenceId);

  if (error) {
    throw new Error(error.message);
  }

  const snapshot: ClosingSnapshot = {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    pendingIncome: 0,
    pendingExpense: 0,
    paidIncome: 0,
    paidExpense: 0,
  };

  for (const item of data ?? []) {
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

export async function closeCompetence(competenceId: string) {
  const ownerId = await getCurrentUserId();
  const snapshot = await calculateClosingSnapshot(competenceId);

  const { error } = await supabase.from("competence_closures").upsert(
    {
      owner_id: ownerId,
      competence_id: competenceId,
      status: "Fechada",
      closed_at: new Date().toISOString(),
      reopened_at: null,
      total_income: snapshot.totalIncome,
      total_expense: snapshot.totalExpense,
      balance: snapshot.balance,
      pending_income: snapshot.pendingIncome,
      pending_expense: snapshot.pendingExpense,
      paid_income: snapshot.paidIncome,
      paid_expense: snapshot.paidExpense,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "owner_id,competence_id",
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function reopenCompetence(competenceId: string) {
  const ownerId = await getCurrentUserId();

  const { error } = await supabase
    .from("competence_closures")
    .update({
      status: "Aberta",
      reopened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("competence_id", competenceId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function isCompetenceClosed(competenceId: string): Promise<boolean> {
  const closure = await getClosureByCompetenceId(competenceId);

  return closure?.status === "Fechada";
}
