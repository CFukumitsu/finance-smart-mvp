import { isCompetenceClosed } from "@/src/services/closingService";

export type CompetenceLockResult = {
  allowed: boolean;
  message: string;
};

export async function ensureCompetenceIsOpen(
  competenceId: string
): Promise<CompetenceLockResult> {
  const closed = await isCompetenceClosed(competenceId);

  if (closed) {
    return {
      allowed: false,
      message:
        "Esta competência está fechada. Reabra a competência para alterar lançamentos.",
    };
  }

  return {
    allowed: true,
    message: "",
  };
}
