"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "@/src/services/authService";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email) {
      alert("Informe seu e-mail.");
      return;
    }

    setIsSubmitting(true);

    const { error } = await sendPasswordResetEmail(email);

    setIsSubmitting(false);

    if (error) {
      alert(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-2xl"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">
        Framework FKT
      </p>

      <h1 className="mt-3 text-3xl font-bold text-white">Recuperar senha</h1>

      <p className="mt-2 text-sm text-slate-400">
        Informe seu e-mail para receber o link de redefinição.
      </p>

      {sent ? (
        <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          Enviamos o link de recuperação para seu e-mail.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-mail"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Enviando..." : "Enviar link"}
          </button>
        </div>
      )}

      <Link
        href="/login"
        className="mt-6 block text-center text-sm font-semibold text-blue-300 hover:text-blue-200"
      >
        Voltar para o login
      </Link>
    </form>
  );
}