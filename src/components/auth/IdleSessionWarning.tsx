"use client";

import { useEffect, useRef } from "react";

export default function IdleSessionWarning({ onContinue }: { onContinue: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="idle-session-title"
      aria-describedby="idle-session-description"
      onCancel={(event) => { event.preventDefault(); onContinue(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/15 bg-slate-950 p-6 text-white shadow-2xl backdrop:bg-black/60"
    >
      <h2 id="idle-session-title" className="text-xl font-semibold">Sessão prestes a expirar</h2>
      <p id="idle-session-description" className="mt-3 text-sm text-slate-300">
        Por segurança, sua sessão será encerrada em 5 minutos por inatividade.
      </p>
      <button type="button" onClick={onContinue} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">
        Continuar conectado
      </button>
    </dialog>
  );
}
