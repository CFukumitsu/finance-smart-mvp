import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { safeInternalRedirect } from "@/src/utils/identity";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalRedirect(url.searchParams.get("next"));
  if (!code || url.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=oauth_cancelled", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));
  }

  const metadata = data.user.user_metadata ?? {};
  const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();
  const firstName = String(metadata.given_name ?? fullName.split(" ")[0] ?? "").trim();
  const lastName = String(metadata.family_name ?? fullName.split(" ").slice(1).join(" ") ?? "").trim();
  const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("id", data.user.id).maybeSingle();
  if (profile) {
    await supabase.from("profiles").update({
      first_name: profile.first_name || firstName,
      last_name: profile.last_name || lastName || null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.user.id);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
