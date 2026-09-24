"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthContext } from "@/src/contexts/AuthContext";
import { supabase } from "@/src/lib/supabase";
import { signOut } from "@/src/services/authService";
import { createIdleSession, idleSessionKey, IDLE_LOGOUT_RETRY, type IdleState } from "@/src/utils/idleSession";
import IdleSessionWarning from "@/src/components/auth/IdleSessionWarning";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [idleState, setIdleState] = useState<IdleState>("active");
  const [logoutFailed, setLogoutFailed] = useState(false);
  const activityRef = useRef<(() => void) | null>(null);
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    let mounted = true;
    let currentUser: User | null = null;
    let key: string | null = null;
    let controller: ReturnType<typeof createIdleSession> | null = null;
    let logoutTimer: ReturnType<typeof setTimeout> | undefined;
    let loggingOut = false;
    let navigating = false;

    function redirectToLogin() {
      if (navigating || !mounted) return;
      navigating = true;
      // Discard protected page state and router caches after logout.
      window.location.replace("/login");
    }

    async function expireSession() {
      if (!mounted || loggingOut) return;
      loggingOut = true;
      try {
        const { error } = await signOut("local");
        if (error) throw error;
        redirectToLogin();
      } catch {
        if (mounted) {
          setLogoutFailed(true);
          logoutTimer = setTimeout(expireSession, IDLE_LOGOUT_RETRY);
        }
      } finally {
        loggingOut = false;
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || navigating) return;
      if (!session) {
        const hadSession = currentUser !== null;
        currentUser = null;
        controller?.stop();
        controller = null;
        key = null;
        activityRef.current = null;
        setUser(null);
        setLoading(false);
        if (hadSession || event === "SIGNED_OUT") {
          setIdleState("expired");
          // Leave the SDK callback before navigation or other auth operations.
          logoutTimer = setTimeout(redirectToLogin, 0);
        }
        return;
      }

      currentUser = session.user;
      const nextKey = idleSessionKey(session);
      if (nextKey !== key) {
        controller?.stop();
        clearTimeout(logoutTimer);
        setLogoutFailed(false);
        key = nextKey;
        controller = createIdleSession({
          key,
          storage: {
            getItem: (name) => window.localStorage.getItem(name),
            setItem: (name, value) => window.localStorage.setItem(name, value),
          },
          now: Date.now,
          schedule: (callback, delay) => {
            const timer = setTimeout(callback, delay);
            return () => clearTimeout(timer);
          },
          onState: (state) => {
            if (!mounted) return;
            setIdleState(state);
            setUser(state === "expired" ? null : currentUser);
            setLoading(false);
          },
          onExpire: () => { logoutTimer = setTimeout(expireSession, 0); },
        });
        activityRef.current = controller.activity;
      }
      // INITIAL_SESSION, SIGNED_IN and TOKEN_REFRESHED never count as activity.
      controller?.check();
    });

    function interaction(event: Event) {
      if (event.isTrusted && document.visibilityState === "visible") controller?.activity();
    }
    function check() { controller?.check(); }
    function storage(event: StorageEvent) {
      if (event.key === key || event.key === null) check();
    }
    const events = ["pointerdown", "click", "keydown", "touchstart"] as const;
    events.forEach((event) => document.addEventListener(event, interaction, { capture: true, passive: true }));
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);

    return () => {
      mounted = false;
      controller?.stop();
      clearTimeout(logoutTimer);
      activityRef.current = null;
      subscription.unsubscribe();
      events.forEach((event) => document.removeEventListener(event, interaction, true));
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      activityRef.current?.();
    }
  }, [pathname]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {loading ? (
        <p role="status" className="p-6 text-center">Carregando sessão...</p>
      ) : idleState === "expired" ? (
        <p role="status" className="p-6 text-center">
          {logoutFailed
            ? "Sessão expirada. Não foi possível concluir o logout. Tentando novamente; verifique sua conexão."
            : "Encerrando sessão..."}
        </p>
      ) : children}
      {idleState === "warning" && <IdleSessionWarning onContinue={() => activityRef.current?.()} />}
    </AuthContext.Provider>
  );
}
