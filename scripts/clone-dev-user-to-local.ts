import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEV_PROJECT_REF,
  TABLE_SPECS,
  buildUuidMaps,
  classifyDestinationData,
  parseCloneEnvFile,
  transformRow,
  type RowsByTable,
  type TableName,
  type TableSpec,
  type UuidMaps,
}
// @ts-expect-error Node's native TypeScript runner requires the extension.
from "./clone-prod-user-to-dev.ts";

type Row = Record<string, unknown>;
type ReadQuery = {
  eq(column: string, value: string): ReadQuery;
  in(column: string, values: readonly string[]): ReadQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const LOCAL_URL = "http://127.0.0.1:54321";
const PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 200;

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Variável obrigatória ausente: ${name}.`);
  return value.trim();
}

function client(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function fetchPaged(
  database: SupabaseClient,
  table: string,
  filter: (query: ReadQuery) => ReadQuery,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const base = database.from(table).select("*") as unknown as ReadQuery;
    const { data, error } = await filter(base).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchForOwner(
  database: SupabaseClient,
  spec: TableSpec,
  ownerId: string,
  accountIds: readonly string[],
): Promise<Row[]> {
  if (spec.ownership === "direct") {
    return fetchPaged(database, spec.table, (query) => query.eq("owner_id", ownerId));
  }
  const rows: Row[] = [];
  for (let offset = 0; offset < accountIds.length; offset += 100) {
    const ids = accountIds.slice(offset, offset + 100);
    rows.push(...await fetchPaged(database, spec.table, (query) => query.in("account_id", ids)));
  }
  return rows;
}

async function loadOwnedData(database: SupabaseClient, ownerId: string): Promise<RowsByTable> {
  const rows = Object.fromEntries(TABLE_SPECS.map((spec) => [spec.table, []])) as unknown as RowsByTable;
  rows.accounts = await fetchForOwner(database, TABLE_SPECS[0], ownerId, []);
  const accountIds = rows.accounts.map((row) => String(row.id));
  for (const spec of TABLE_SPECS.slice(1)) {
    rows[spec.table] = await fetchForOwner(database, spec, ownerId, accountIds);
  }
  return rows;
}

function rowsToInsert(
  spec: TableSpec,
  source: RowsByTable,
  maps: UuidMaps,
  localOwnerId: string,
  reusedCompetences: Set<string>,
): Row[] {
  return source[spec.table]
    .map((row) => transformRow(spec, row, maps, localOwnerId))
    .filter((row) => spec.table !== "competences" || !reusedCompetences.has(String(row.id)));
}

async function removeInserted(
  database: SupabaseClient,
  inserted: Partial<Record<TableName, string[]>>,
): Promise<void> {
  const failures: string[] = [];
  for (const spec of [...TABLE_SPECS].reverse()) {
    const ids = inserted[spec.table] ?? [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { error } = await database.from(spec.table).delete().in("id", ids.slice(offset, offset + 100));
      if (error) failures.push(`${spec.table}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Limpeza local incompleta: ${failures.join(" | ")}`);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const ownerIndex = process.argv.indexOf("--local-owner-id");
  const localOwnerId = required("--local-owner-id", process.argv[ownerIndex + 1]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(localOwnerId)) {
    throw new Error("--local-owner-id não é um UUID válido.");
  }

  const fileVariables = parseCloneEnvFile(await readFile(resolve(".env.clone.local"), "utf8"));
  const devUrl = required("DEV_SUPABASE_URL", process.env.DEV_SUPABASE_URL ?? fileVariables.DEV_SUPABASE_URL);
  const devKey = required("DEV_SUPABASE_SERVICE_ROLE_KEY", process.env.DEV_SUPABASE_SERVICE_ROLE_KEY ?? fileVariables.DEV_SUPABASE_SERVICE_ROLE_KEY);
  const devOwnerId = required("DEV_OWNER_ID", process.env.DEV_OWNER_ID ?? fileVariables.DEV_OWNER_ID);
  const localUrl = required("LOCAL_SUPABASE_URL", process.env.LOCAL_SUPABASE_URL);
  const localKey = required("LOCAL_SUPABASE_SERVICE_ROLE_KEY", process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY);

  if (new URL(devUrl).hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error(`Origem recusada: deve ser exclusivamente o projeto DEV ${DEV_PROJECT_REF}.`);
  }
  if (localUrl !== LOCAL_URL) {
    throw new Error(`Destino recusado: deve ser exatamente ${LOCAL_URL}.`);
  }

  const sourceClient = client(devUrl, devKey);
  const localClient = client(localUrl, localKey);
  const [{ data: sourceUser, error: sourceUserError }, { data: localUser, error: localUserError }] = await Promise.all([
    sourceClient.auth.admin.getUserById(devOwnerId),
    localClient.auth.admin.getUserById(localOwnerId),
  ]);
  if (sourceUserError || !sourceUser.user) throw new Error("Proprietário configurado não existe no DEV.");
  if (localUserError || !localUser.user) throw new Error("Proprietário informado não existe no Supabase LOCAL.");

  const [source, destination] = await Promise.all([
    loadOwnedData(sourceClient, devOwnerId),
    loadOwnedData(localClient, localOwnerId),
  ]);
  const destinationState = classifyDestinationData(destination);
  if (destinationState.functionalCount !== 0) {
    throw new Error(`Destino local possui ${destinationState.functionalCount} registro(s) funcional(is); restauração recusada para evitar duplicação.`);
  }
  if (!source.accounts.length || !source.transactions.length) {
    throw new Error("A cópia no DEV não possui contas ou lançamentos para o proprietário configurado.");
  }

  const { maps, reusedCompetenceIds } = buildUuidMaps(source, destination.competences);
  const reused = new Set(reusedCompetenceIds);
  const prepared = Object.fromEntries(
    TABLE_SPECS.map((spec) => [spec.table, rowsToInsert(spec, source, maps, localOwnerId, reused)]),
  ) as RowsByTable;
  console.table(TABLE_SPECS.map((spec) => ({
    tabela: spec.table,
    origem_dev: source[spec.table].length,
    inserir_local: prepared[spec.table].length,
  })));
  console.log(`Competências locais reutilizadas: ${reusedCompetenceIds.length}.`);

  if (!execute) {
    console.log("DRY-RUN DEV → LOCAL: nenhuma gravação executada.");
    return;
  }

  const inserted: Partial<Record<TableName, string[]>> = {};
  try {
    for (const spec of TABLE_SPECS) {
      const rows = prepared[spec.table];
      inserted[spec.table] = [];
      for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
        const batch = rows.slice(offset, offset + WRITE_BATCH_SIZE);
        const { error } = await localClient.from(spec.table).insert(batch);
        if (error) throw new Error(`Falha ao inserir ${spec.table}: ${error.message}`);
        inserted[spec.table]!.push(...batch.map((row) => String(row.id)));
      }
    }

    const finalRows = await loadOwnedData(localClient, localOwnerId);
    for (const spec of TABLE_SPECS) {
      const expected = destination[spec.table].length + prepared[spec.table].length;
      if (finalRows[spec.table].length !== expected) {
        throw new Error(`${spec.table}: esperado ${expected}, encontrado ${finalRows[spec.table].length}.`);
      }
    }
    console.log("CLONE DEV → LOCAL: PASS");
  } catch (error) {
    console.error("Falha durante a restauração; removendo somente os UUIDs inseridos nesta execução.");
    await removeInserted(localClient, inserted);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
