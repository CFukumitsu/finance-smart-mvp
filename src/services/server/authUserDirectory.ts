import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

export async function listAllAuthUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < PAGE_SIZE) return users;
  }
}

export async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    if (user || data.users.length < PAGE_SIZE) return user ?? null;
  }
}
