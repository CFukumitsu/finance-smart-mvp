import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  buildCreateTransferRpcParams,
  buildUpdateTransferRpcParams,
  resolveLinkedTransferLegs,
  type LinkedTransferInput,
  type TransferLeg,
} from "@/src/utils/linkedTransfers";

export type CurrencyConversionRow = {
  transfer_group_id: string;
  provider_id: string;
  fee_amount: number | null;
  fee_currency: string | null;
  quoted_rate: number | null;
  quoted_rate_base_currency: string | null;
  quoted_rate_quote_currency: string | null;
};

export type CurrencyConversionProvider = {
  id: string;
  name: string;
  active: boolean;
};

export async function loadLinkedTransferLegs(transferGroupId: string) {
  const ownerId = await getCurrentUserId();
  const [legsResponse, conversionResponse] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, description, due_date, value, status, account_id, competence_id, origin_account_id, destination_account_id, transfer_group_id",
      )
      .eq("owner_id", ownerId)
      .eq("transfer_group_id", transferGroupId),
    supabase
      .from("currency_conversions")
      .select(
        "transfer_group_id, provider_id, fee_amount, fee_currency, quoted_rate, quoted_rate_base_currency, quoted_rate_quote_currency",
      )
      .eq("owner_id", ownerId)
      .eq("transfer_group_id", transferGroupId)
      .maybeSingle(),
  ]);

  if (legsResponse.error) throw new Error(legsResponse.error.message);
  if (conversionResponse.error) throw new Error(conversionResponse.error.message);

  const legs = resolveLinkedTransferLegs((legsResponse.data ?? []) as TransferLeg[]);
  if (!legs) return null;

  return {
    ...legs,
    conversion: (conversionResponse.data ?? null) as CurrencyConversionRow | null,
  };
}

export async function createLinkedTransfer(
  input: LinkedTransferInput & { idempotencyKey: string },
) {
  const { error } = await supabase.rpc(
    "create_transfer",
    buildCreateTransferRpcParams(input),
  );
  if (error) throw new Error(error.message);
}

export async function updateLinkedTransfer(
  input: LinkedTransferInput & { transferGroupId: string },
) {
  const { error } = await supabase.rpc(
    "update_transfer",
    buildUpdateTransferRpcParams(input),
  );
  if (error) throw new Error(error.message);
}

export async function deleteLinkedTransfer(transferGroupId: string) {
  const { error } = await supabase.rpc("delete_transfer", {
    p_transfer_group_id: transferGroupId,
  });
  if (error) throw new Error(error.message);
}

export async function loadConversionProviders() {
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("currency_conversion_providers")
    .select("id, name, active")
    .eq("owner_id", ownerId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CurrencyConversionProvider[];
}

export async function createConversionProvider(name: string) {
  const ownerId = await getCurrentUserId();
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName) throw new Error("Informe o nome do provedor.");

  const { data, error } = await supabase
    .from("currency_conversion_providers")
    .insert({ owner_id: ownerId, name: normalizedName })
    .select("id, name, active")
    .single();

  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Já existe um provedor com esse nome."
        : error.message,
    );
  }
  return data as CurrencyConversionProvider;
}
