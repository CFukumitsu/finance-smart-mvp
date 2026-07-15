"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import { updatePassword } from "@/src/services/authService";

type LinkState = "checking" | "ready" | "invalid";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);
    const linkError = searchParams.get("error") ?? hashParams.get("error_code") ?? hashParams.get("error");

    if (linkError) {
      queueMicrotask(() => {
        if (!active) return;
        setLinkState("invalid");
        setMessage("Este link expirou, já foi utilizado ou não é válido. Solicite um novo link.");
      });
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      return () => { active = false; };
    }

    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        setLinkState("invalid");
        setMessage("Não foi possível validar sua sessão. Solicite um novo link.");
        return;
      }
      setLinkState("ready");
    });

    return () => { active = false; };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password || !confirmPassword) {
      setMessage("Informe e confirme a nova senha.");
      return;
    }

    if (password.length < 8) {
      setMessage("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("As senhas não conferem.");
      return;
    }

    if (linkState !== "ready") return;

    setMessage("");
    setIsSubmitting(true);
    const { error } = await updatePassword(password);
    setIsSubmitting(false);

    if (error) {
      setMessage(error.message === "Auth session missing!"
        ? "Sua sessão expirou. Solicite um novo link."
        : "Não foi possível alterar a senha. Solicite um novo link e tente novamente.");
      setLinkState("invalid");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  const fieldsDisabled = linkState !== "ready" || isSubmitting;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-2xl"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">
        Framework FKT
      </p>
      <h1 className="mt-3 text-3xl font-bold text-white">Nova senha</h1>
      <p className="mt-2 text-sm text-slate-400">
        Defina uma nova senha para acessar o Finance Smart.
      </p>

      {linkState === "checking" && (
        <p className="mt-5 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          Validando o link...
        </p>
      )}

      {message && (
        <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {message}
        </p>
      )}

      <div className="mt-6 space-y-4">
        <input
          type="password"
          autoComplete="new-password"
          disabled={fieldsDisabled}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Nova senha"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <input
          type="password"
          autoComplete="new-password"
          disabled={fieldsDisabled}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirmar nova senha"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={fieldsDisabled}
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Salvando..." : "Alterar senha"}
        </button>

        {linkState === "invalid" && (
          <Link href="/forgot-password" className="block text-center text-sm font-semibold text-blue-300 hover:text-blue-200">
            Solicitar novo link
          </Link>
        )}
      </div>
    </form>
  );
}
