import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  removeImportLayoutWithRepository,
  replaceImportLayoutWithRepository,
  type ImportLayout,
  type ImportLayoutInput,
  type ImportLayoutRepository,
} from "@/src/lib/reconciliation/importLayoutManagement";
export type { ImportLayout, ImportLayoutInput } from "@/src/lib/reconciliation/importLayoutManagement";

const supabaseImportLayoutRepository: ImportLayoutRepository = {
  async loadActive(ownerId, accountId) {
    const { data, error } = await supabase
      .from("import_layouts")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("account_id", accountId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as ImportLayout | null;
  },
  async deactivate(ownerId, accountId, layoutId) {
    const { error } = await supabase
      .from("import_layouts")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", layoutId)
      .eq("owner_id", ownerId)
      .eq("account_id", accountId);
    if (error) throw error;
  },
  async reactivate(ownerId, accountId, layoutId) {
    const { error } = await supabase
      .from("import_layouts")
      .update({ active: true, updated_at: new Date().toISOString() })
      .eq("id", layoutId)
      .eq("owner_id", ownerId)
      .eq("account_id", accountId);
    if (error) throw error;
  },
  async insert(ownerId, accountId, input) {
    const { data, error } = await supabase
      .from("import_layouts")
      .insert({ ...input, owner_id: ownerId, account_id: accountId, active: true })
      .select("*")
      .single();
    if (error) throw error;
    return data as ImportLayout;
  },
};

export async function loadActiveImportLayout(accountId: string) {
  const ownerId = await getCurrentUserId();
  return supabaseImportLayoutRepository.loadActive(ownerId, accountId);
}

export async function replaceActiveImportLayout(accountId: string, input: ImportLayoutInput) {
  const ownerId = await getCurrentUserId();
  return replaceImportLayoutWithRepository({ ownerId, accountId, input, confirmed: true, repository: supabaseImportLayoutRepository });
}

export async function removeActiveImportLayout(accountId: string) {
  const ownerId = await getCurrentUserId();
  return removeImportLayoutWithRepository({ ownerId, accountId, confirmed: true, repository: supabaseImportLayoutRepository });
}
