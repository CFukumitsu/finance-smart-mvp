"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/src/services/authService";

export default function ResetPasswordForm() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password || !confirmPassword) {
      alert("Informe e confirme a nova senha.");
      return;
    }

    if (password.length < 6) {
      alert("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      alert("As senhas não conferem.");
      return;
    }

    setIsSubmitting(true);

    const { error } = await updatePassword(password);

    setIsSubmitting(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Senha alterada com sucesso.");
    router.replace("/dashboard");
    router.refresh();
  }

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

      <div className="mt-6 space-y-4">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Nova senha"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
        />

        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirmar nova senha"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Salvando..." : "Alterar senha"}
        </button>
      </div>
    </form>
  );
}