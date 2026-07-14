import { NextResponse } from "next/server";
import { isGoogleProviderEnabled } from "@/src/utils/authProviders";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { google: false, error: "A autenticação ainda não foi configurada." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("AUTH_SETTINGS_UNAVAILABLE");

    const settings: unknown = await response.json();
    return NextResponse.json({ google: isGoogleProviderEnabled(settings) });
  } catch {
    return NextResponse.json(
      { google: false, error: "Não foi possível confirmar a disponibilidade do Google." },
      { status: 503 },
    );
  }
}

