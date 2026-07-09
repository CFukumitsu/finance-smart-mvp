import { getCurrentUserId, supabase } from "@/src/lib/supabase";

export async function ensureAccountIsOpen(params: {
  accountId: string;
  competenceId: string;
}) {

  const { accountId, competenceId } = params;
  const ownerId = await getCurrentUserId();

  const { data: account } = await supabase
    .from("accounts")
    .select("type")
    .eq("id", accountId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!account) {
    return {
      allowed: false,
      message: "Conta/cartão não encontrado.",
    };
  }

  if (account.type === "Conta") {
    const { data } = await supabase
      .from("account_closures")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("account_id", accountId)
      .eq("competence_id", competenceId)
      .maybeSingle();

    if (data) {
      return {
        allowed: false,
        message: "Esta conta já está fechada nesta competência.",
      };
    }
  }

  if (account.type === "Cartão") {
    const { data } = await supabase
      .from("credit_card_statements")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("account_id", accountId)
      .eq("competence_id", competenceId)
      .maybeSingle();

    if (data) {
      return {
        allowed: false,
        message: "Este cartão/fatura já está fechado nesta competência.",
      };
    }
  }

  return {
    allowed: true,
    message: "",
  };
}