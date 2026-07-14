"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword, signInWithGoogle } from "@/src/services/authService";
import { safeInternalRedirect } from "@/src/utils/identity";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const oauthError = searchParams.get("error");
  const [message, setMessage] = useState(() => {
    if (oauthError === "oauth_cancelled") return "O login com Google foi cancelado.";
    if (oauthError === "oauth_callback") return "Não foi possível concluir o login com Google. Tente novamente.";
    return "";
  });

  const redirectTo = safeInternalRedirect(searchParams.get("redirectTo"));

  async function handleGoogleLogin() {
    setMessage("");
    setIsGoogleLoading(true);

    try {
      const response = await fetch("/api/auth/providers", { cache: "no-store" });
      const providers = await response.json() as { google?: boolean };

      if (!response.ok || providers.google !== true) {
        setMessage("O login com Google ainda não está habilitado. Um administrador precisa ativá-lo no Supabase Auth.");
        setIsGoogleLoading(false);
        return;
      }

      const { error } = await signInWithGoogle(redirectTo);
      if (!error) return;

      setMessage("Não foi possível iniciar o login com Google. Tente novamente.");
      setIsGoogleLoading(false);
    } catch {
      setMessage("Não foi possível verificar o login com Google agora. Tente novamente em instantes.");
      setIsGoogleLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email || !password) {
      setMessage("Informe e-mail e senha.");
      return;
    }

    setIsSubmitting(true);

    const { error } = await signInWithEmailAndPassword(email, password);

    setIsSubmitting(false);

    if (error) {
      setMessage("E-mail ou senha inválidos.");
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-2xl"
    >
      <div className="mb-8 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-fkt.png"
          alt="FKT Systems"
          className="h-28 w-28 rounded-full object-cover shadow-xl shadow-black/40"
        />

        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">
          Finance Smart
        </p>

        <h1 className="mt-3 text-3xl font-bold text-white">
          Acesse sua conta
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Powered by FKT Systems
        </p>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isSubmitting || isGoogleLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-5 py-3 font-bold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="text-lg font-black text-blue-600">G</span>
          {isGoogleLoading ? "Redirecionando..." : "Continuar com Google"}
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
          <span className="h-px flex-1 bg-white/10" /> ou <span className="h-px flex-1 bg-white/10" />
        </div>

        {message && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{message}</p>}
        <input
          type="email"
          aria-label="E-mail"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-mail"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
        />

        <input
          type="password"
          aria-label="Senha"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>

        <a
          href="/forgot-password"
          className="block text-center text-sm font-semibold text-blue-300 hover:text-blue-200"
        >
          Esqueci minha senha
        </a>
      </div>
    </form>
  );
}
