import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type { PersistedStatementLink } from "@/src/lib/reconciliation/candidateRanking";

const PAGE_SIZE = 1000;
// Mantém a URL do filtro "in" curta (cada uuid tem 36 caracteres).
const ID_CHUNK_SIZE = 100;

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAllPages<T>(buildQuery: (from: number, to: number) => QueryResult<T>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function chunk<T>(values: T[]) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += ID_CHUNK_SIZE) {
    chunks.push(values.slice(index, index + ID_CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Todos os vínculos gravados destes lançamentos, de qualquer fatura ou
 * competência, com o valor do item da fatura vinculado. Somente leitura.
 */
export async function loadPersistedLinksForTransactions(transactionIds: string[]): Promise<PersistedStatementLink[]> {
  const ids = Array.from(new Set(transactionIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const ownerId = await getCurrentUserId();

  const links = (
    await Promise.all(
      chunk(ids).map((idsChunk) =>
        fetchAllPages<{ statement_item_id: string; transaction_id: string }>((from, to) =>
          supabase
            .from("credit_card_statement_item_transactions")
            .select("statement_item_id, transaction_id")
            .eq("owner_id", ownerId)
            .in("transaction_id", idsChunk)
            .order("id", { ascending: true })
            .range(from, to)
        )
      )
    )
  ).flat();

  const statementItemIds = Array.from(new Set(links.map((link) => link.statement_item_id)));
  if (statementItemIds.length === 0) return [];

  const statementItems = (
    await Promise.all(
      chunk(statementItemIds).map((idsChunk) =>
        fetchAllPages<{ id: string; statement_value: number }>((from, to) =>
          supabase
            .from("credit_card_statement_items")
            .select("id, statement_value")
            .eq("owner_id", ownerId)
            .in("id", idsChunk)
            .order("id", { ascending: true })
            .range(from, to)
        )
      )
    )
  ).flat();

  const valueByStatementItemId = new Map(statementItems.map((item) => [item.id, Number(item.statement_value)]));

  return links
    .filter((link) => valueByStatementItemId.has(link.statement_item_id))
    .map((link) => ({
      statementItemId: link.statement_item_id,
      transactionId: link.transaction_id,
      value: valueByStatementItemId.get(link.statement_item_id) ?? 0,
    }));
}

/** Valor e tipo atuais do lançamento, lidos do banco (para revalidar antes de gravar). */
export async function loadTransactionForReconciliation(transactionId: string) {
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, description, due_date, value, type")
    .eq("owner_id", ownerId)
    .eq("id", transactionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; description: string; due_date: string; value: number; type: string } | null;
}
