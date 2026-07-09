import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <img
          src="/logo-fkt.png"
          alt="FKT Systems"
          className="h-28 w-28 rounded-full object-cover shadow-2xl shadow-red-500/20"
        />

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">
          Finance Smart
        </p>

        <h1 className="mt-4 text-3xl font-bold text-white">
          Página não encontrada
        </h1>

        <p className="mt-3 text-sm text-slate-400">
          O endereço acessado não existe ou foi movido.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
        >
          Voltar ao Dashboard
        </Link>

        <p className="mt-6 text-xs text-slate-500">
          Powered by FKT Systems
        </p>
      </div>
    </div>
  );
}