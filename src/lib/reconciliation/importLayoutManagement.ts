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

export type ImportLayoutInput = Omit<ImportLayout, "id" | "account_id" | "active">;

export type ImportLayoutRepository = {
  loadActive(ownerId: string, accountId: string): Promise<ImportLayout | null>;
  deactivate(ownerId: string, accountId: string, layoutId: string): Promise<void>;
  reactivate(ownerId: string, accountId: string, layoutId: string): Promise<void>;
  insert(ownerId: string, accountId: string, input: ImportLayoutInput): Promise<ImportLayout>;
};

export async function replaceImportLayoutWithRepository(params: {
  ownerId: string;
  accountId: string;
  input: ImportLayoutInput;
  confirmed: boolean;
  repository: ImportLayoutRepository;
}) {
  if (!params.confirmed) return { status: "cancelled" as const, layout: null };
  const activeLayout = await params.repository.loadActive(params.ownerId, params.accountId);
  if (activeLayout) await params.repository.deactivate(params.ownerId, params.accountId, activeLayout.id);

  try {
    const layout = await params.repository.insert(params.ownerId, params.accountId, params.input);
    return { status: activeLayout ? "replaced" as const : "created" as const, layout };
  } catch (error) {
    if (activeLayout) {
      try {
        await params.repository.reactivate(params.ownerId, params.accountId, activeLayout.id);
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], "Falha ao salvar o novo layout e restaurar o anterior.");
      }
    }
    throw error;
  }
}

export async function removeImportLayoutWithRepository(params: {
  ownerId: string;
  accountId: string;
  confirmed: boolean;
  repository: ImportLayoutRepository;
}) {
  if (!params.confirmed) return { status: "cancelled" as const, layout: null };
  const activeLayout = await params.repository.loadActive(params.ownerId, params.accountId);
  if (!activeLayout) return { status: "not-found" as const, layout: null };
  await params.repository.deactivate(params.ownerId, params.accountId, activeLayout.id);
  return { status: "removed" as const, layout: activeLayout };
}

