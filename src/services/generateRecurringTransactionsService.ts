import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { ensureCompetenceExists } from "@/src/services/competenceService";

type GenerateRecurringTransactionsParams = {
  competenceId: string;
  competenceReference?: string;
};

type CompetenceRow = {
  id: string;
  name: string;
  month: number;
  year: number;
};

type RecurringTransactionRow = {
  id: string;
  description: string;
  type: "income" | "expense";
  amount: number;
  account_id: string | null;
  category_id: string | null;
  day_of_month: number | null;
};

export async function generateRecurringTransactions({
  competenceId,
  competenceReference,
}: GenerateRecurringTransactionsParams) {
  if (!competenceId) {
    throw new Error("Competência não informada.");
  }

  const ownerId = await getCurrentUserId();
  const resolvedCompetenceId = competenceReference
    ? (await ensureCompetenceExists(competenceReference)).id
    : competenceId;

  const { data: competenceData, error: competenceError } = await supabase
    .from("competences")
    .select("id, name, month, year")
    .eq("id", resolvedCompetenceId)
    .eq("owner_id", ownerId)
    .single();

  if (competenceError || !competenceData) {
    throw new Error("Competência não encontrada.");
  }

  const competence = competenceData as CompetenceRow;

  const { data: recurringData, error: recurringError } = await supabase
    .from("recurring_transactions")
    .select("id, description, type, amount, account_id, category_id, day_of_month")
    .eq("owner_id", ownerId)
    .eq("status", "active");

  if (recurringError) {
    throw new Error(recurringError.message);
  }

  const recurringTransactions = (recurringData ?? []) as RecurringTransactionRow[];

  if (recurringTransactions.length === 0) {
    return {
      created: 0,
      ignored: 0,
    };
  }

  const { data: existingTransactions, error: existingError } = await supabase
    .from("transactions")
    .select("id, recurring_transaction_id")
    .eq("owner_id", ownerId)
    .eq("competence_id", resolvedCompetenceId)
    .not("recurring_transaction_id", "is", null);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const alreadyGeneratedIds = new Set(
    (existingTransactions ?? []).map((item) => item.recurring_transaction_id)
  );

  const lastDayOfMonth = new Date(
    competence.year,
    competence.month,
    0
  ).getDate();

  function buildDueDate(dayOfMonth?: number | null) {
    const safeDay = Math.min(
      Math.max(Number(dayOfMonth || 1), 1),
      lastDayOfMonth
    );

    return `${competence.year}-${String(competence.month).padStart(
      2,
      "0"
    )}-${String(safeDay).padStart(2, "0")}`;
  }

  const transactionsToCreate = recurringTransactions
    .filter((item) => !alreadyGeneratedIds.has(item.id))
    .map((item) => ({
      owner_id: ownerId,
      description: item.description,
      type: item.type === "income" ? "Receita" : "Despesa",
      value: item.amount,
      account_id: item.account_id,
      category_id: item.category_id,
      competence_id: resolvedCompetenceId,
      due_date: buildDueDate(item.day_of_month),
      status: "Pendente",
      recurring_transaction_id: item.id,
    }));

  if (transactionsToCreate.length === 0) {
    return {
      created: 0,
      ignored: recurringTransactions.length,
    };
  }

  const { error: insertError } = await supabase
    .from("transactions")
    .insert(transactionsToCreate);

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    created: transactionsToCreate.length,
    ignored: recurringTransactions.length - transactionsToCreate.length,
  };
}
