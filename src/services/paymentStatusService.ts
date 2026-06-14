import { supabase } from "@/src/lib/supabase";

export async function updateOverduePaymentStatusesOncePerDay() {
  const today = new Date().toISOString().slice(0, 10);
  const routineId = "update_overdue_payment_statuses";

  const { data: routine } = await supabase
    .from("system_routines")
    .select("last_run_date")
    .eq("id", routineId)
    .maybeSingle();

  if (routine?.last_run_date === today) {
    return;
  }

  await supabase
    .from("transactions")
    .update({ status: "Pago" })
    .eq("type", "Despesa")
    .eq("status", "Pendente")
    .lte("due_date", today);

  await supabase
    .from("transactions")
    .update({ status: "Recebido" })
    .eq("type", "Receita")
    .eq("status", "Pendente")
    .lte("due_date", today);

  await supabase.from("system_routines").upsert({
    id: routineId,
    last_run_date: today,
    updated_at: new Date().toISOString(),
  });
}