import { supabase } from "@/src/lib/supabase";

type GenerateRecurringTransactionsParams = {
  competenceId: string;
};

export async function generateRecurringTransactions({
  competenceId,
}: GenerateRecurringTransactionsParams) {
  if (!competenceId) {
    throw new Error("Competência não informada.");
  }

  const { data: competence, error: competenceError } = await supabase
    .from("competences")
    .select("id, name")
    .eq("id", competenceId)
    .single();

  if (competenceError || !competence) {
    throw new Error("Competência não encontrada.");
  }

  const { data: recurringTransactions, error: recurringError } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("status", "active");

  if (recurringError) {
    throw new Error(recurringError.message);
  }

  if (!recurringTransactions || recurringTransactions.length === 0) {
    return {
      created: 0,
      ignored: 0,
    };
  }

  const { data: existingTransactions, error: existingError } = await supabase
    .from("transactions")
    .select("id, recurring_transaction_id")
    .eq("competence_id", competenceId)
    .not("recurring_transaction_id", "is", null);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const alreadyGeneratedIds = new Set(
    (existingTransactions ?? []).map(
      (item) => item.recurring_transaction_id
    )
  );

  const transactionsToCreate = recurringTransactions
    .filter((item) => !alreadyGeneratedIds.has(item.id))
    .map((item) => ({
      description: item.description,
      type: item.type === "income" ? "Receita" : "Despesa",
      value: item.amount,
      account_id: item.account_id,
      category_id: item.category_id,
      competence_id: competenceId,
      due_date: new Date().toISOString().slice(0, 10),
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