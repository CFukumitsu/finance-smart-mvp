import { getCurrentUserId, supabase } from "@/src/lib/supabase";

export async function updateOverduePaymentStatusesOncePerDay() {
  const ownerId = await getCurrentUserId();
  const today = new Date().toISOString().slice(0, 10);

  await supabase
    .from("transactions")
    .update({
      status: "Pago",
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("type", "Despesa")
    .eq("status", "Pendente")
    .lte("due_date", today);

  await supabase
    .from("transactions")
    .update({
      status: "Recebido",
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("type", "Receita")
    .eq("status", "Pendente")
    .lte("due_date", today);
}