import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { toCompetenceKey } from "@/src/utils/competence";

export { addMonthsToCompetence, toCompetenceKey } from "@/src/utils/competence";

export const MAX_COMPETENCE_RANGE_MONTHS = 120;

export type Competence = {
  id: string;
  month: number;
  year: number;
  name: string;
  status: "ABERTA" | "FECHADA";
  closed_at: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string;
};

export type CompetenceRangeResult = {
  created: number;
  existing: number;
};

async function ensureCompetenceForAuthenticatedOwner(
  reference: string | Date,
  ownerId: string
) {
  const competenceKey = toCompetenceKey(reference);
  const { data, error } = await supabase.rpc("ensure_competence", {
    p_reference: competenceKey,
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Não foi possível criar a competência.");
  }

  const competence = data as Competence;
  if (competence.owner_id !== ownerId) {
    throw new Error("A competência retornada não pertence ao usuário autenticado.");
  }

  return competence;
}

export async function ensureCompetenceExists(reference: string | Date) {
  const ownerId = await getCurrentUserId();
  return ensureCompetenceForAuthenticatedOwner(reference, ownerId);
}

export async function ensureCompetencesExist(references: Array<string | Date>) {
  const uniqueKeys = Array.from(new Set(references.map(toCompetenceKey)));
  if (uniqueKeys.length === 0) return new Map<string, Competence>();

  const ownerId = await getCurrentUserId();
  const competences = await Promise.all(
    uniqueKeys.map((reference) =>
      ensureCompetenceForAuthenticatedOwner(reference, ownerId)
    )
  );
  return new Map(competences.map((competence) => [competence.name, competence]));
}

export async function ensureCompetenceRange(
  startReference: string | Date,
  endReference: string | Date
): Promise<CompetenceRangeResult> {
  await getCurrentUserId();
  const { data, error } = await supabase.rpc("ensure_competence_range", {
    p_start_reference: toCompetenceKey(startReference),
    p_end_reference: toCompetenceKey(endReference),
    p_max_months: MAX_COMPETENCE_RANGE_MONTHS,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    created: Number(result?.created_count ?? 0),
    existing: Number(result?.existing_count ?? 0),
  };
}

export async function listCompetences() {
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("competences")
    .select("id, month, year, name, status, closed_at, start_date, end_date, owner_id")
    .eq("owner_id", ownerId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Competence[];
}
