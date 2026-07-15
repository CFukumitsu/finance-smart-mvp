import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

const SUPPORTED_TYPE: EmailOtpType = "invite";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!tokenHash || type !== SUPPORTED_TYPE) {
    return NextResponse.redirect(new URL("/accept-invite?error=invalid_link", requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: SUPPORTED_TYPE,
  });

  if (error) {
    return NextResponse.redirect(new URL("/accept-invite?error=otp_expired", requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/reset-password?invited=1", requestUrl.origin));
}
