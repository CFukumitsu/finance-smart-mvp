import type { UserProfile } from "@/src/types/identity";

export type AdminAccessResult = "allowed" | "unauthenticated" | "forbidden" | "disabled";

export function evaluateAdminAccess(userId: string | null, profile: UserProfile | null): AdminAccessResult {
  if (!userId) return "unauthenticated";
  if (!profile || profile.id !== userId || profile.role !== "admin") return "forbidden";
  if (profile.status !== "active") return "disabled";
  return "allowed";
}

export function validateInvitationInput(input: { name?: unknown; email?: unknown; role?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input.role === "admin" || input.role === "user" ? input.role : null;
  if (!name) return { ok: false as const, error: "Informe o nome do usuário." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false as const, error: "Informe um e-mail válido." };
  if (!role) return { ok: false as const, error: "Selecione um perfil válido." };
  return { ok: true as const, name, email, role };
}

