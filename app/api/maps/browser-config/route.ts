import { NextResponse } from "next/server";
import { getAuthenticatedServerUser } from "@/src/lib/supabaseServer";

export async function GET() {
  const { user } = await getAuthenticatedServerUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_MAPS_BROWSER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Mapa não configurado neste ambiente." },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { apiKey },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
