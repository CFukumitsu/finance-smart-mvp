import type { User } from "@supabase/supabase-js";
import type { UserProfile, UserRole } from "@/src/types/identity";

export function getFullName(profile: UserProfile | null, user?: User | null) {
  const profileName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (profileName) return profileName;

  const metadata = user?.user_metadata ?? {};
  return String(metadata.full_name ?? metadata.name ?? "").trim();
}

export function getAvatarUrl(profile: UserProfile | null, user?: User | null, storageAvatarUrl?: string | null) {
  if (storageAvatarUrl) return storageAvatarUrl;
  if (profile?.avatar_url) return profile.avatar_url;
  const metadata = user?.user_metadata ?? {};
  const googleAvatar = metadata.avatar_url ?? metadata.picture;
  if (googleAvatar) return String(googleAvatar);

  for (const identity of user?.identities ?? []) {
    const data = identity.identity_data ?? {};
    const candidate = data.avatar_url ?? data.picture;
    if (candidate) return String(candidate);
  }
  return null;
}

export function getInitials(name: string, email?: string | null) {
  const source = name.trim() || (email ?? "").trim();
  if (!source) return "US";
  const words = source.includes("@")
    ? [source.split("@")[0]]
    : source.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0]}${words[words.length - 1][0]}`
    : words[0].slice(0, 2);
  return initials.toLocaleUpperCase("pt-BR");
}

export function getProvider(user?: User | null) {
  const providers = user?.app_metadata?.providers;
  if (Array.isArray(providers) && providers.length) return providers.join(", ");
  return String(user?.app_metadata?.provider ?? "email");
}

export function getRoleLabel(role?: UserRole | null) {
  if (role === "admin") return "Administrador";
  if (role === "manager") return "Gerente";
  return "Usuário";
}

export function isSafeInternalRedirect(value: string | null | undefined) {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"));
}

export function safeInternalRedirect(value: string | null | undefined, fallback = "/dashboard") {
  return isSafeInternalRedirect(value) ? value! : fallback;
}
