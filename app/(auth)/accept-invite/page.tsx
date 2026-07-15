import Link from "next/link";

type AcceptInvitePageProps = {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    error?: string;
  }>;
};

export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const isValidInvite = tokenHash.length > 0 && params.type === "invite";
  const hasExpired = params.error === "otp_expired";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">
          Finance Smart
        </p>
        <h1 className="mt-3 text-3xl font-bold text-white">Aceitar convite</h1>

        {hasExpired || !isValidInvite ? (
          <>
            <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Este convite expirou, já foi utilizado ou não é válido. Solicite um novo convite ao administrador.
            </p>
            <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-blue-300 hover:text-blue-200">
              Voltar para o login
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Confirme abaixo para validar seu convite e definir a senha de acesso.
            </p>
            <form action="/auth/confirm" method="get" className="mt-6">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value="invite" />
              <button type="submit" className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500">
                Aceitar convite
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
