import "server-only";

import { getAuthenticatedServerUser } from "@/src/lib/supabaseServer";
import type { UserProfile } from "@/src/types/identity";
import { evaluateAdminAccess } from "@/src/utils/accessControl";

export class AuthorizationError extends Error {
  constructor(public status: 401 | 403 | 503, message: string) {
    super(message);
  }
}

export async function requireAdmin() {
  const { supabase, user } = await getAuthenticatedServerUser();
  if (!user) throw new AuthorizationError(401, "Sessão inválida ou expirada.");

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new AuthorizationError(503, "A estrutura de perfis ainda não está disponível.");
  const profile = data as UserProfile | null;
  if (evaluateAdminAccess(user.id, profile) !== "allowed") {
    throw new AuthorizationError(403, "Acesso restrito a administradores.");
  }
  return { user, profile };
}
