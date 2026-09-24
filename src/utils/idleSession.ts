export const IDLE_TIMEOUT = 30 * 60 * 1000;
export const IDLE_WARNING_TIME = 25 * 60 * 1000;
export const IDLE_LOGOUT_RETRY = 5_000;
export const IDLE_STORAGE_PREFIX = "finance-smart:lastActivityAt:";
export const IDLE_LOGIN_COOKIE = "finance-smart-idle-login";

export type IdleState = "active" | "warning" | "expired";
type IdleAuthSession = {
  access_token: string;
  user: { id: string; last_sign_in_at?: string };
};

// Stable on token refresh; a new login has a different session_id.
export function idleSessionKey(session: IdleAuthSession) {
  try {
    const payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.session_id === "string" && payload.session_id) {
      return `${IDLE_STORAGE_PREFIX}${session.user.id}:${payload.session_id}`;
    }
  } catch { /* Legacy sessions without a session_id use the original login time. */ }
  return `${IDLE_STORAGE_PREFIX}${session.user.id}:${session.user.last_sign_in_at ?? "legacy"}`;
}

// Call only after an explicit authentication operation succeeds, never on SIGNED_IN
// (Supabase also emits SIGNED_IN when restoring/recovering an existing session).
export function idleLoginRecord(session: IdleAuthSession, at = Date.now()) {
  return { key: idleSessionKey(session), at };
}

export function recordIdleLogin(
  session: IdleAuthSession,
  storage: Pick<Storage, "setItem">,
  at = Date.now(),
) {
  storage.setItem(idleSessionKey(session), String(at));
}

// OAuth/invite callbacks carry the actual authentication timestamp across the
// server-to-browser redirect. Import it once, without replacing existing activity.
export function importIdleLogin(
  session: IdleAuthSession,
  serialized: string,
  storage: Pick<Storage, "getItem" | "setItem">,
  now = Date.now(),
) {
  try {
    const record = JSON.parse(serialized);
    const key = idleSessionKey(session);
    if (record.key !== key || !Number.isFinite(record.at) || record.at <= 0 ||
        record.at > now || now - record.at >= IDLE_TIMEOUT) return false;
    if (storage.getItem(key) === null) storage.setItem(key, String(record.at));
    return true;
  } catch { return false; }
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
  let deadline: number | undefined;
  let cancel: (() => void) | undefined;

  function expire() {
    if (stopped || expired) return;
    expired = true;
    cancel?.();
    try { options.storage.setItem(options.key, "0"); } catch { /* Remain locked. */ }
    options.onState("expired");
    options.onExpire();
  }

  function read() {
    const value = options.storage.getItem(options.key);
    if (value === null) return 0;
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= options.now()
      ? timestamp : 0;
  }

  function check(activity = false) {
    if (stopped || expired) return;
    try {
      let last = read();
      // Check the old deadline BEFORE accepting input. Missing history is not
      // permission to adopt a restored Supabase session with a fresh timeout.
      if (last === 0 || options.now() - last >= IDLE_TIMEOUT) {
        expire();
        return;
      }
      if (activity) {
        last = options.now();
        options.storage.setItem(options.key, String(last));
      }
      const elapsed = options.now() - last;
      const warning = elapsed >= IDLE_WARNING_TIME;
      options.onState(warning ? "warning" : "active");
      const nextDeadline = last + (warning ? IDLE_TIMEOUT : IDLE_WARNING_TIME);
      // Passive events neither write activity nor restart an unchanged timer.
      if (nextDeadline !== deadline) {
        cancel?.();
        deadline = nextDeadline;
        cancel = options.schedule(() => {
          deadline = undefined;
          check();
        }, Math.max(0, nextDeadline - options.now()));
      }
    } catch {
      expire();
    }
  }

  return {
    check: () => check(),
    activity: () => check(true),
    stop: () => { stopped = true; cancel?.(); },
  };
}
