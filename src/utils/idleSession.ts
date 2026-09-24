export const IDLE_TIMEOUT = 30 * 60 * 1000;
export const IDLE_WARNING_TIME = 25 * 60 * 1000;
export const IDLE_LOGOUT_RETRY = 5_000;
export const IDLE_STORAGE_PREFIX = "finance-smart:lastActivityAt:";

export type IdleState = "active" | "warning" | "expired";

// The identifier stays stable on token refresh but changes on a new login.
// No access/refresh tokens are persisted here.
export function idleSessionKey(session: {
  access_token: string;
  user: { id: string; last_sign_in_at?: string };
}) {
  try {
    const payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.session_id === "string" && payload.session_id) {
      return `${IDLE_STORAGE_PREFIX}${session.user.id}:${payload.session_id}`;
    }
  } catch { /* Fallback for sessions without a session_id claim. */ }
  return `${IDLE_STORAGE_PREFIX}${session.user.id}:${session.user.last_sign_in_at ?? "legacy"}`;
}

export function createIdleSession(options: {
  key: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  now: () => number;
  schedule: (callback: () => void, delay: number) => () => void;
  onState: (state: IdleState) => void;
  onExpire: () => void;
}) {
  let stopped = false;
  let expired = false;
  let initialized = false;
  let cancel: (() => void) | undefined;

  function expire() {
    if (stopped || expired) return;
    expired = true;
    cancel?.();
    // Keep a tombstone so suspended tabs cannot revive this session.
    try { options.storage.setItem(options.key, "0"); } catch { /* Remain locked. */ }
    options.onState("expired");
    options.onExpire();
  }

  function read() {
    const value = options.storage.getItem(options.key);
    if (value === null) return null;
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= options.now()
      ? timestamp : 0;
  }

  function check(activity = false) {
    if (stopped || expired) return;
    cancel?.();
    try {
      let last = read();
      // Only initialize on first adoption; reloads use the persisted deadline.
      if (last === null) last = initialized ? 0 : options.now();
      initialized = true;
      if (last === 0 || options.now() - last >= IDLE_TIMEOUT) {
        expire();
        return;
      }
      if (activity) last = options.now();
      options.storage.setItem(options.key, String(last));
      const elapsed = options.now() - last;
      const warning = elapsed >= IDLE_WARNING_TIME;
      options.onState(warning ? "warning" : "active");
      cancel = options.schedule(() => check(), (warning ? IDLE_TIMEOUT : IDLE_WARNING_TIME) - elapsed);
    } catch {
      // Without persistent storage the required idle guarantee cannot be met.
      expire();
    }
  }

  return {
    check: () => check(),
    activity: () => check(true),
    stop: () => { stopped = true; cancel?.(); },
  };
}
