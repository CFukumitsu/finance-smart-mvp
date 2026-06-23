import { supabase } from "@/src/lib/supabase";
import { ensureCompetenceIsOpen } from "@/src/utils/competenceLock";
import {
  RecurringTransaction,
  RecurringTransactionFormData,
} from "@/src/types/recurrence";

export async function getRecurringTransactions() {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data as RecurringTransaction[];
}

export async function createRecurringTransaction(
  formData: RecurringTransactionFormData
) {
  if (formData.endCompetenceId) {
    const lock = await ensureCompetenceIsOpen(
      formData.endCompetenceId
    );
  
    if (!lock.allowed) {
      return {
        success: false,
        message: lock.message,
      };
    }
  }
  const { error } = await supabase.from("recurring_transactions").insert({
    description: formData.description,
    type: formData.type,
    amount: Number(formData.amount),
    account_id: formData.accountId || null,
    category_id: formData.categoryId || null,
    frequency: "monthly",
    start_competence_id: formData.startCompetenceId,
    end_competence_id: formData.endCompetenceId || null,
    status: "active",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateRecurringTransaction(
  id: string,
  formData: RecurringTransactionFormData
) {
  const { error } = await supabase
    .from("recurring_transactions")
    .update({
      description: formData.description,
      type: formData.type,
      amount: Number(formData.amount),
      account_id: formData.accountId || null,
      category_id: formData.categoryId || null,
      start_competence_id: formData.startCompetenceId,
      end_competence_id: formData.endCompetenceId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function cancelRecurringTransaction(id: string) {
  const { error } = await supabase
    .from("recurring_transactions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}