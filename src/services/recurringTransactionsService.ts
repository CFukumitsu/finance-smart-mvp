import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { ensureCompetenceIsOpen } from "@/src/utils/competenceLock";
import {
  RecurringTransaction,
  RecurringTransactionFormData,
} from "@/src/types/recurrence";

export async function getRecurringTransactions() {
  const ownerId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("recurring_transactions")
    .select(`
      *,
      account:accounts(name)
    `)
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RecurringTransaction[]).sort((a, b) => {
    const accountA = a.account?.name ?? "";
    const accountB = b.account?.name ?? "";

    const accountCompare = accountA.localeCompare(accountB, "pt-BR");

    if (accountCompare !== 0) {
      return accountCompare;
    }

    const typeOrder: Record<string, number> = {
      income: 0,
      expense: 1,
    };

    const typeCompare =
      (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);

    if (typeCompare !== 0) {
      return typeCompare;
    }

    return a.description.localeCompare(b.description, "pt-BR");
  });
}

export async function createRecurringTransaction(
  formData: RecurringTransactionFormData
) {
  const ownerId = await getCurrentUserId();
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
    owner_id: ownerId,
    description: formData.description,
    type: formData.type,
    amount: Number(formData.amount),
    account_id: formData.accountId || null,
    category_id: formData.categoryId || null,
    frequency: "monthly",
    day_of_month: Math.min(Math.max(Number(formData.dayOfMonth || 1), 1), 31),
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
  const ownerId = await getCurrentUserId();
  const { error } = await supabase
    .from("recurring_transactions")
    .update({
      description: formData.description,
      type: formData.type,
      amount: Number(formData.amount),
      account_id: formData.accountId || null,
      category_id: formData.categoryId || null,
      day_of_month: Math.min(Math.max(Number(formData.dayOfMonth || 1), 1), 31),
      start_competence_id: formData.startCompetenceId,
      end_competence_id: formData.endCompetenceId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function cancelRecurringTransaction(id: string) {
  const ownerId = await getCurrentUserId();

  const { error } = await supabase
    .from("recurring_transactions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(error.message);
  }
}