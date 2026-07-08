import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export async function getCurrentUserId() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
  
    if (error || !user) {
      throw new Error("Usuário não autenticado.");
    }
  
    return user.id;
  }