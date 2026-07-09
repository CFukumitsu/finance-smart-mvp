import { getCurrentUserId, supabase } from "@/src/lib/supabase";

export type ImportLayout = {
  id: string;
  account_id: string;
  name: string;
  header_row_index: number;
  date_header: string;
  description_header: string;
  value_header: string;
  installment_header: string | null;
  amount_sign: "auto" | "positive" | "negative";
  active: boolean;
};

export async function loadActiveImportLayout(accountId: string) {
  const ownerId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("import_layouts")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("account_id", accountId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar layout de importação:", error);
    return null;
  }

  return data as ImportLayout | null;
}