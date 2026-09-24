import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { createIdleSession, idleSessionKey, IDLE_TIMEOUT, IDLE_WARNING_TIME, recordIdleLogin, idleLoginRecord, importIdleLogin } from "./idleSession.ts";

function fixture(shared = new Map<string, string>(), key = "session-a") {
  let now = 1_000_000_000;
  if (!shared.has(key)) shared.set(key, String(now)); // Successful explicit login.
  let expired = 0;
  let state = "";
  let pending: { callback: () => void; at: number } | null = null;
  const controller = createIdleSession({
    key,
    storage: {
      getItem: (name: string) => shared.get(name) ?? null,
      setItem: (name: string, value: string) => { shared.set(name, value); },
    },
    now: () => now,
    schedule: (callback: () => void, delay: number) => {
      pending = { callback, at: now + delay };
      return () => { pending = null; };
    },
    onState: (next: string) => { state = next; },
    onExpire: () => { expired++; },
  });
  return {
    controller, shared,
    state: () => state,
    expired: () => expired,
    now: () => now,
    advance: (duration: number) => { now += duration; },
    fire: () => { if (pending && pending.at <= now) pending.callback(); },
    deadline: () => pending?.at,
  };
}

test("avisa aos 25 minutos e expira exatamente aos 30, uma única vez", () => {
  const f = fixture();
  f.controller.check();
  assert.equal(f.state(), "active");
  f.advance(IDLE_WARNING_TIME - 1);
  f.fire();
  assert.equal(f.state(), "active");
  f.advance(1);
  f.fire();
  assert.equal(f.state(), "warning");
  f.advance(IDLE_TIMEOUT - IDLE_WARNING_TIME);
  f.fire();
  f.controller.check();
  f.controller.activity();
  assert.equal(f.state(), "expired");
  assert.equal(f.expired(), 1);
  assert.equal(f.shared.get("session-a"), "0");
});

test("atividade e Continuar conectado fecham o aviso e renovam o prazo", () => {
  const f = fixture();
  f.controller.check();
  f.advance(IDLE_WARNING_TIME);
  f.fire();
  f.controller.activity();
  assert.equal(f.state(), "active");
  assert.equal(f.shared.get("session-a"), String(f.now()));
  assert.equal(f.deadline(), f.now() + IDLE_WARNING_TIME);
  f.advance(IDLE_TIMEOUT - IDLE_WARNING_TIME);
  f.controller.check();
  assert.equal(f.state(), "active");
});

test("uso contínuo mantém a sessão por mais de 30 minutos", () => {
  const f = fixture();
  f.controller.check();
  for (let n = 0; n < 10; n++) {
    f.advance(IDLE_WARNING_TIME - 1);
    f.controller.activity();
  }
  assert.equal(f.state(), "active");
  assert.equal(f.expired(), 0);
});

test("refresh e eventos de autenticação preservam a última atividade", () => {
  const f = fixture();
  f.controller.check();
  const original = f.shared.get("session-a");
  f.advance(IDLE_WARNING_TIME);
  f.controller.check();
  assert.equal(f.shared.get("session-a"), original);
  f.controller.stop();
  const reload = fixture(f.shared);
  reload.advance(IDLE_WARNING_TIME);
  reload.controller.check();
  assert.equal(reload.state(), "warning");
  assert.equal(reload.shared.get("session-a"), original);
});

test("reabertura após o prazo expira antes de aceitar atividade", () => {
  const f = fixture();
  f.controller.check();
  f.controller.stop();
  const reload = fixture(f.shared);
  reload.advance(IDLE_TIMEOUT + 1);
  reload.controller.check();
  reload.controller.activity();
  assert.equal(reload.state(), "expired");
});

test("timer suspenso não permite que o primeiro clique reviva a sessão", () => {
  const f = fixture();
  f.controller.check();
  f.advance(IDLE_TIMEOUT);
  f.controller.activity();
  assert.equal(f.state(), "expired");
});

test("atividade em outra aba fecha aviso e sincroniza o prazo", () => {
  const a = fixture();
  const b = fixture(a.shared);
  a.controller.check();
  b.controller.check();
  a.advance(IDLE_WARNING_TIME);
  b.advance(IDLE_WARNING_TIME);
  a.controller.check();
  b.controller.activity();
  a.controller.check(); // storage event
  assert.equal(a.state(), "active");
  assert.equal(a.deadline(), b.deadline());
});

test("expiração em uma aba bloqueia as outras mesmo antes do logout remoto concluir", () => {
  const a = fixture();
  const b = fixture(a.shared);
  a.controller.check();
  b.controller.check();
  a.advance(IDLE_TIMEOUT);
  a.controller.check();
  b.controller.check();
  b.controller.activity();
  assert.equal(b.state(), "expired");
  assert.equal(b.expired(), 1);
});

test("novo login tem registro independente da sessão expirada", () => {
  const a = fixture();
  a.controller.check();
  a.advance(IDLE_TIMEOUT);
  a.controller.check();
  const b = fixture(a.shared, "session-b");
  b.controller.check();
  assert.equal(b.state(), "active");
});

test("parar o monitor cancela timers e ignora eventos posteriores", () => {
  const f = fixture();
  f.controller.check();
  f.controller.stop();
  f.advance(IDLE_TIMEOUT);
  f.fire();
  f.controller.check();
  assert.equal(f.expired(), 0);
  assert.equal(f.deadline(), undefined);
});

test("registros inválidos, futuros ou removidos bloqueiam a sessão", () => {
  for (const value of ["NaN", "-1", "Infinity", "", "0", "9999999999999"]) {
    const f = fixture(new Map([["session-a", value]]));
    f.controller.check();
    assert.equal(f.state(), "expired", value);
  }
  const f = fixture();
  f.controller.check();
  f.shared.clear();
  f.controller.activity();
  assert.equal(f.state(), "expired");
});

test("armazenamento indisponível falha fechado e solicita logout", () => {

  let expired = 0;
  const controller = createIdleSession({
    key: "session",
    storage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } },
    now: Date.now,
    schedule: () => () => {},
    onState: () => {},
    onExpire: () => { expired++; },
  });
  controller.check();
  assert.equal(expired, 1);
});

test("identificador permanece estável na renovação e muda em novo login", () => {
  function session(id: string, exp: number) {
    return {
      access_token: "header." + Buffer.from(JSON.stringify({ session_id: id, exp })).toString("base64url") + ".signature",
      user: { id: "user", last_sign_in_at: "2026-09-24" },
    };
  }
  assert.equal(idleSessionKey(session("a", 1)), idleSessionKey(session("a", 2)));
  assert.notEqual(idleSessionKey(session("a", 1)), idleSessionKey(session("b", 1)));
  assert.ok(!idleSessionKey(session("a", 1)).includes("signature"));
});

test("fallback diferencia logins quando não há claim session_id", () => {
  const a = { access_token: "invalid", user: { id: "user", last_sign_in_at: "2026-09-23" } };
  const b = { ...a, user: { ...a.user, last_sign_in_at: "2026-09-24" } };
  assert.notEqual(idleSessionKey(a), idleSessionKey(b));
});
test("sessão restaurada sem histórico expira sem criar horário novo", () => {
  const f = fixture();
  f.shared.clear();
  f.controller.check();
  assert.equal(f.state(), "expired");
  assert.equal(f.shared.get("session-a"), "0");
});

test("verificações passivas não escrevem atividade nem reagendam timer", () => {
  let now = 1_000_000_000;
  let writes = 0;
  let schedules = 0;
  const controller = createIdleSession({
    key: "session",
    storage: { getItem: () => "1000000000", setItem: () => { writes++; } },
    now: () => now,
    schedule: () => { schedules++; return () => {}; },
    onState: () => {},
    onExpire: () => {},
  });
  controller.check();
  for (let n = 0; n < 100; n++) { now += 100; controller.check(); }
  assert.equal(writes, 0);
  assert.equal(schedules, 1);
});

test("login explícito registra atividade, callback importa horário original sem renová-lo", () => {
  const session = { access_token: "legacy", user: { id: "user", last_sign_in_at: "2026-09-24" } };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const at = 1_000_000_000;
  const key = idleSessionKey(session);
  recordIdleLogin(session, storage, at);
  assert.equal(values.get(key), String(at));
  values.clear();
  const cookie = JSON.stringify(idleLoginRecord(session, at));
  assert.equal(importIdleLogin(session, cookie, storage, at + 10_000), true);
  assert.equal(values.get(key), String(at));
  values.set(key, "0");
  importIdleLogin(session, cookie, storage, at + 20_000);
  assert.equal(values.get(key), "0");
});

test("callback vencido, inválido ou de outra sessão não recria atividade", () => {
  const session = { access_token: "legacy", user: { id: "user", last_sign_in_at: "2026-09-24" } };
  let writes = 0;
  const storage = { getItem: () => null, setItem: () => { writes++; } };
  const at = 1_000_000_000;
  const cookie = JSON.stringify(idleLoginRecord(session, at));
  assert.equal(importIdleLogin(session, cookie, storage, at + IDLE_TIMEOUT), false);
  assert.equal(importIdleLogin(session, cookie, storage, at - 1), false);
  assert.equal(importIdleLogin(session, "invalid", storage, at), false);
  assert.equal(importIdleLogin({ ...session, user: { id: "other" } }, cookie, storage, at), false);
  assert.equal(writes, 0);
});
