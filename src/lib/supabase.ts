import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Lê a sessão local (o SDK renova o token quando ele expira) em vez de chamar
// o servidor de Auth a cada consulta: getUser() custava uma ida e volta extra
// antes de toda carga e gravação. A autorização continua no banco: cada
// requisição envia o JWT da sessão, validado pelo PostgREST e pelas políticas
// RLS, e o owner_id vem desse mesmo token.
export async function getCurrentUserId() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      throw new Error("Usuário não autenticado.");
    }

    return session.user.id;
  }