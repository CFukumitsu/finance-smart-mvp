export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center text-center">
        <img
          src="/logo-fkt.png"
          alt="FKT Systems"
          className="h-28 w-28 rounded-full object-cover shadow-2xl shadow-red-500/20"
        />

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">
          Finance Smart
        </p>

        <p className="mt-2 text-sm text-slate-400">
          Powered by FKT Systems
        </p>

        <div className="mt-6 h-1 w-32 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
        </div>
      </div>
    </div>
  );
}