import { Suspense } from "react";
import LoginForm from "@/src/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Suspense fallback={<div className="text-white">Carregando...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}