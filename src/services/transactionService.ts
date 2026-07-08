import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { ensureCompetenceIsOpen } from "@/src/utils/competenceLock";

type ServiceResult = {
  success: boolean;
  message?: string;
};

export async function deleteTransaction(id: string): Promise<ServiceResult> {
  const ownerId = await getCurrentUserId();

  const { data: existingTransaction, error: findError } = await supabase
    .from("transactions")
    .select("competence_id")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .single();

  if (findError) {
    return {
      success: false,
      message: findError.message,
    };
  }

  const lock = await ensureCompetenceIsOpen(existingTransaction.competence_id);

  if (!lock.allowed) {
    return {
      success: false,
      message: lock.message,
    };
  }

  const { error: legacyReconciliationError } = await supabase
  .from("transaction_reconciliations")
  .delete()
  .eq("transaction_id", id);

  if (legacyReconciliationError) {
    return {
      success: false,
      message: "Erro ao excluir conciliação antiga vinculada ao lançamento.",
    };
  }

  const { error: statementReconciliationError } = await supabase
    .from("credit_card_statement_item_transactions")
    .delete()
    .eq("transaction_id", id)
    .eq("owner_id", ownerId);

  if (statementReconciliationError) {
    return {
      success: false,
      message: "Erro ao excluir conciliação da fatura vinculada ao lançamento.",
    };
  }

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  return {
    success: true,
  };
}
