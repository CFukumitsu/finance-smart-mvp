import { supabase } from "@/src/lib/supabase";
import { recordIdleLogin } from "@/src/utils/idleSession";

export async function signInWithEmailAndPassword(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!result.error && result.data.session) {
    try { recordIdleLogin(result.data.session, window.localStorage); } catch { /* Provider fails closed. */ }
  }
  return result;
}

export async function signOut(scope: "global" | "local" = "global") {
  return supabase.auth.signOut({ scope });
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
