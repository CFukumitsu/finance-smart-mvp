import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type {
  InvestmentAccount,
  InvestmentAsset,
  InvestmentAssetInput,
  InvestmentData,
  InvestmentMonthlyValuation,
  InvestmentOperation,
  InvestmentOperationInput,
  InvestmentValuationInput,
} from "@/src/types/investments";
import { findNegativeInvestmentPosition } from "@/src/utils/investmentCalculations";
import { logApplicationError } from "@/src/utils/applicationErrorLogger";

type ServiceError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

function fail(
  error: ServiceError | null,
  context = "Investimentos",
  metadata?: Record<string, unknown>,
) {
  if (!error) return;
  void logApplicationError(context, error, metadata);
  throw new Error(error.message);
}

function normalizeNumericOperation(operation: InvestmentOperation) {
  return {
    ...operation,
    quantity: Number(operation.quantity),
    unit_price:
      operation.unit_price === null ? null : Number(operation.unit_price),
    fees: Number(operation.fees),
  };
}

function normalizeValuation(valuation: InvestmentMonthlyValuation) {
  return {
    ...valuation,
    market_value: Number(valuation.market_value),
  };
}

export async function loadInvestmentData(): Promise<InvestmentData> {
  const ownerId = await getCurrentUserId();
  const [assets, operations, valuations, accounts] = await Promise.all([
    supabase
      .from("investment_assets")
      .select("*")
      .eq("owner_id", ownerId)
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("investment_operations")
      .select("*")
      .eq("owner_id", ownerId)
      .order("operation_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("investment_monthly_valuations")
      .select("*")
      .eq("owner_id", ownerId)
      .order("reference_month", { ascending: false }),
    supabase
      .from("accounts")
      .select(
        "id, owner_id, name, type, currency, active, show_on_investments_dashboard",
      )
      .eq("owner_id", ownerId)
      .eq("type", "Conta")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
  ]);

  fail(assets.error, "Investimentos - carregar ativos");
  fail(operations.error, "Investimentos - carregar operações");
  fail(valuations.error, "Investimentos - carregar valorizações");
  fail(accounts.error, "Investimentos - carregar contas");

  return {
    assets: (assets.data ?? []) as InvestmentAsset[],
    operations: ((operations.data ?? []) as InvestmentOperation[]).map(
      normalizeNumericOperation,
    ),
    valuations: (
      (valuations.data ?? []) as InvestmentMonthlyValuation[]
    ).map(normalizeValuation),
    accounts: (accounts.data ?? []) as InvestmentAccount[],
  };
}

export async function saveInvestmentAsset(
  input: InvestmentAssetInput,
  id?: string,
) {
  const ownerId = await getCurrentUserId();
  const payload = {
    name: input.name.trim(),
    symbol: input.symbol?.trim().toUpperCase() || null,
    asset_type: input.asset_type.trim(),
    currency: input.currency.trim().toUpperCase(),
    active: input.active,
  };

  const response = id
    ? await supabase
        .from("investment_assets")
        .update(payload)
        .eq("id", id)
        .eq("owner_id", ownerId)
    : await supabase
        .from("investment_assets")
        .insert({ ...payload, owner_id: ownerId });

  if (response.error?.code === "23505") {
    throw new Error("Já existe um ativo cadastrado com esse nome.");
  }

  fail(response.error, "Investimentos - salvar ativo", {
    assetId: id,
    isUpdate: Boolean(id),
  });
}

export async function deleteInvestmentAsset(id: string) {
  const ownerId = await getCurrentUserId();
  const [operations, valuations] = await Promise.all([
    supabase
      .from("investment_operations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("asset_id", id),
    supabase
      .from("investment_monthly_valuations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("asset_id", id),
  ]);

  fail(operations.error, "Investimentos - validar exclusão de ativo");
  fail(valuations.error, "Investimentos - validar exclusão de ativo");

  if ((operations.count ?? 0) + (valuations.count ?? 0) > 0) {
    throw new Error(
      "Este ativo possui operações ou valorizações. Inative-o para preservar o histórico.",
    );
  }

  const { error } = await supabase
    .from("investment_assets")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);

  fail(error, "Investimentos - excluir ativo", { assetId: id });
}

async function loadOperationReferences(
  ownerId: string,
  input: InvestmentOperationInput,
) {
  const [asset, account] = await Promise.all([
    supabase
      .from("investment_assets")
      .select("id, owner_id, currency, active")
      .eq("id", input.asset_id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("accounts")
      .select(
        "id, owner_id, type, currency, active, show_on_investments_dashboard",
      )
      .eq("id", input.account_id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);

  fail(asset.error, "Investimentos - validar ativo da operação");
  fail(account.error, "Investimentos - validar conta da operação");

  if (!asset.data) throw new Error("O ativo selecionado não está disponível.");
  if (!account.data)
    throw new Error("A conta selecionada não está disponível.");
  if (account.data.type !== "Conta")
    throw new Error("Cartões não podem receber operações de investimentos.");
  if (
    asset.data.currency &&
    account.data.currency &&
    asset.data.currency !== account.data.currency
  ) {
    throw new Error("O ativo e a conta precisam utilizar a mesma moeda.");
  }

  return {
    asset: asset.data,
    account: account.data,
  };
}

async function loadOwnerOperations(ownerId: string) {
  const { data, error } = await supabase
    .from("investment_operations")
    .select("*")
    .eq("owner_id", ownerId);

  fail(error, "Investimentos - validar custódia");
  return ((data ?? []) as InvestmentOperation[]).map(
    normalizeNumericOperation,
  );
}

function assertLedgerRemainsValid(operations: InvestmentOperation[]) {
  const negative = findNegativeInvestmentPosition(operations);

  if (negative) {
    throw new Error(
      "A operação deixaria a posição do ativo negativa nessa conta. Revise a quantidade ou a ordem das movimentações.",
    );
  }
}

export async function saveInvestmentOperation(
  input: InvestmentOperationInput,
  id?: string,
) {
  const ownerId = await getCurrentUserId();
  const [references, operations] = await Promise.all([
    loadOperationReferences(ownerId, input),
    loadOwnerOperations(ownerId),
  ]);
  const original = id
    ? operations.find((operation) => operation.id === id)
    : undefined;

  if (id && !original) {
    throw new Error("A operação que seria editada não foi encontrada.");
  }

  const keepsOriginalAccount = Boolean(
    original && original.account_id === input.account_id,
  );
  const keepsOriginalAsset = Boolean(
    original && original.asset_id === input.asset_id,
  );

  if (
    (!references.account.active ||
      !references.account.show_on_investments_dashboard) &&
    !keepsOriginalAccount
  ) {
    throw new Error(
      "Selecione uma conta ativa e marcada para uso em Investimentos.",
    );
  }

  if (!references.asset.active && !keepsOriginalAsset) {
    throw new Error("Selecione um ativo cadastrado como ativo.");
  }

  const signedQuantity =
    input.operation_type === "Compra"
      ? Math.abs(input.quantity)
      : -Math.abs(input.quantity);
  const now = new Date().toISOString();
  const candidate: InvestmentOperation = {
    id: id ?? `pending-${crypto.randomUUID()}`,
    owner_id: ownerId,
    asset_id: input.asset_id,
    account_id: input.account_id,
    operation_type: input.operation_type,
    operation_date: input.operation_date,
    quantity: signedQuantity,
    unit_price: input.unit_price,
    fees: input.fees,
    event_group_id: original?.event_group_id ?? null,
    notes: input.notes,
    created_at: original?.created_at ?? now,
    updated_at: now,
  };

  assertLedgerRemainsValid([
    ...operations.filter((operation) => operation.id !== id),
    candidate,
  ]);

  const payload = {
    asset_id: candidate.asset_id,
    account_id: candidate.account_id,
    operation_type: candidate.operation_type,
    operation_date: candidate.operation_date,
    quantity: candidate.quantity,
    unit_price: candidate.unit_price,
    fees: candidate.fees,
    notes: candidate.notes,
  };
  const response = id
    ? await supabase
        .from("investment_operations")
        .update(payload)
        .eq("id", id)
        .eq("owner_id", ownerId)
    : await supabase
        .from("investment_operations")
        .insert({ ...payload, owner_id: ownerId });

  fail(response.error, "Investimentos - salvar operação", {
    operationId: id,
    operationType: input.operation_type,
    assetId: input.asset_id,
    accountId: input.account_id,
  });
}

export async function deleteInvestmentOperation(id: string) {
  const ownerId = await getCurrentUserId();
  const operations = await loadOwnerOperations(ownerId);
  const original = operations.find((operation) => operation.id === id);

  if (!original) throw new Error("A operação não foi encontrada.");

  assertLedgerRemainsValid(
    operations.filter((operation) => operation.id !== id),
  );

  const { error } = await supabase
    .from("investment_operations")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .is("event_group_id", null);

  fail(error, "Investimentos - excluir operação", { operationId: id });
}

function normalizeReferenceMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
}

export async function saveInvestmentValuation(
  input: InvestmentValuationInput,
  id?: string,
) {
  const ownerId = await getCurrentUserId();
  const payload = {
    asset_id: input.asset_id,
    reference_month: normalizeReferenceMonth(input.reference_month),
    market_value: input.market_value,
    notes: input.notes,
  };
  const response = id
    ? await supabase
        .from("investment_monthly_valuations")
        .update(payload)
        .eq("id", id)
        .eq("owner_id", ownerId)
    : await supabase
        .from("investment_monthly_valuations")
        .insert({ ...payload, owner_id: ownerId });

  if (response.error?.code === "23505") {
    throw new Error("Já existe uma valorização desse ativo para o mês.");
  }

  fail(response.error, "Investimentos - salvar valorização", {
    valuationId: id,
    assetId: input.asset_id,
    referenceMonth: payload.reference_month,
  });
}

export async function deleteInvestmentValuation(id: string) {
  const ownerId = await getCurrentUserId();
  const { error } = await supabase
    .from("investment_monthly_valuations")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);

  fail(error, "Investimentos - excluir valorização", { valuationId: id });
}
