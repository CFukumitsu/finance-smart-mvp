import { NextResponse } from "next/server";
import { AuthorizationError, requireAdmin } from "@/src/lib/authorization";
import { createSupabaseAdminClient } from "@/src/lib/supabaseAdmin";
import { findAuthUserByEmail, listAllAuthUsers } from "@/src/services/server/authUserDirectory";
import type { AdminUserListItem, UserProfile, UserRole } from "@/src/types/identity";
import { validateInvitationInput } from "@/src/utils/accessControl";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "SUPABASE_ADMIN_NOT_CONFIGURED") {
    return NextResponse.json(
      { error: "O serviço de gestão de usuários ainda não foi configurado no servidor." },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

function providerFor(user: { app_metadata?: Record<string, unknown>; identities?: Array<{ provider?: string }> }) {
  const values = user.app_metadata?.providers;
  if (Array.isArray(values) && values.length) return values.join(", ");
  const identities = user.identities?.map((item) => item.provider).filter(Boolean);
  if (identities?.length) return identities.join(", ");
  return String(user.app_metadata?.provider ?? "email");
}

export async function GET() {
  try {
    await requireAdmin();
    const admin = createSupabaseAdminClient();
    const [authUsers, { data: profiles, error: profileError }] = await Promise.all([
      listAllAuthUsers(admin),
      admin.from("profiles").select("*"),
    ]);
    if (profileError) throw new Error("USER_LIST_FAILED");

    const profileMap = new Map((profiles as UserProfile[]).map((profile) => [profile.id, profile]));
    const users: AdminUserListItem[] = authUsers.map((user) => {
      const profile = profileMap.get(user.id);
      const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
      return {
        id: user.id,
        email: user.email ?? "",
        fullName: fullName || String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
        role: profile?.role ?? "user",
        status: profile?.status ?? (user.last_sign_in_at ? "active" : "invited"),
        invitedAt: profile?.invited_at ?? user.invited_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        provider: providerFor(user),
      };
    });
    return NextResponse.json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const validation = validateInvitationInput(await request.json());
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    const { name, email, role } = validation;

    const admin = createSupabaseAdminClient();
    const duplicate = await findAuthUserByEmail(admin, email);
    if (duplicate) {
      const message = duplicate.last_sign_in_at
        ? "Já existe um usuário ativo com este e-mail."
        : "Já existe um convite pendente para este e-mail.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const firstSpace = name.indexOf(" ");
    const firstName = firstSpace === -1 ? name : name.slice(0, firstSpace);
    const lastName = firstSpace === -1 ? null : name.slice(firstSpace + 1).trim() || null;
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName, full_name: name },
      redirectTo: `${origin.replace(/\/$/, "")}/accept-invite`,
    });
    if (error || !data.user) {
      return NextResponse.json({ error: "Não foi possível enviar o convite. Verifique o limite de e-mails e tente novamente." }, { status: 502 });
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      role,
      status: "invited",
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (profileError) {
      return NextResponse.json({ error: "O convite foi enviado, mas o perfil precisa ser revisado por um administrador." }, { status: 500 });
    }
    return NextResponse.json({ message: "Convite enviado com sucesso." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user: currentUser } = await requireAdmin();
    const body = await request.json() as { userId?: unknown; role?: unknown };
    const userId = typeof body.userId === "string" ? body.userId : "";
    const role: UserRole | null = body.role === "admin" || body.role === "user" ? body.role : null;
    if (!userId || !role) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    if (userId === currentUser.id) return NextResponse.json({ error: "Altere seu próprio perfil somente por um processo administrativo controlado." }, { status: 409 });
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", userId);
    if (error) throw new Error("ROLE_UPDATE_FAILED");
    return NextResponse.json({ message: "Perfil atualizado com sucesso." });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json() as { userId?: unknown };
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const [{ data: userData, error: userError }, { data: profile, error: profileError }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from("profiles").select("status").eq("id", userId).maybeSingle(),
    ]);
    if (userError || profileError || !userData.user?.email) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (profile?.status !== "invited" || userData.user.last_sign_in_at) return NextResponse.json({ error: "Este usuário já está ativo." }, { status: 409 });
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { error } = await admin.auth.admin.inviteUserByEmail(userData.user.email, { redirectTo: `${origin.replace(/\/$/, "")}/accept-invite` });
    if (error) return NextResponse.json({ error: "Não foi possível reenviar o convite. Verifique o limite de e-mails." }, { status: 502 });
    await admin.from("profiles").update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", userId);
    return NextResponse.json({ message: "Convite reenviado com sucesso." });
  } catch (error) {
    return errorResponse(error);
  }
}
