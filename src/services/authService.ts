import { supabase } from "@/src/lib/supabase";

export async function signInWithEmailAndPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function sendPasswordResetEmail(email: string) {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/reset-password`
      : undefined;

  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({
    password,
  });
}

export async function signInWithGoogle(redirectTo = "/dashboard") {
  const callback = new URL("/auth/callback", window.location.origin);
  callback.searchParams.set("next", redirectTo);
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
}
