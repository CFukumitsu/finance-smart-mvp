import assert from "node:assert/strict";
import test from "node:test";
import type { UserProfile } from "../types/identity";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { evaluateAdminAccess, validateInvitationInput } from "./accessControl.ts";

const profile: UserProfile = {
  id: "admin-id", first_name: "Admin", last_name: null, phone: null, avatar_url: null, avatar_storage_path: null,
  role: "admin", status: "active", locale: "pt-BR", timezone: "America/Sao_Paulo",
  theme: "dark", invited_at: null, disabled_at: null, created_at: "2026-01-01", updated_at: "2026-01-01",
};

test("autoriza apenas administrador ativo do mesmo usuário", () => {
  assert.equal(evaluateAdminAccess("admin-id", profile), "allowed");
  assert.equal(evaluateAdminAccess(null, profile), "unauthenticated");
  assert.equal(evaluateAdminAccess("other-id", profile), "forbidden");
  assert.equal(evaluateAdminAccess("admin-id", { ...profile, role: "user" }), "forbidden");
  assert.equal(evaluateAdminAccess("admin-id", { ...profile, role: "manager" }), "forbidden");
  assert.equal(evaluateAdminAccess("admin-id", { ...profile, status: "disabled" }), "disabled");
  assert.equal(evaluateAdminAccess("admin-id", { ...profile, status: "deleted" }), "disabled");
});

test("valida e normaliza o convite administrativo", () => {
  assert.deepEqual(validateInvitationInput({ name: "  Maria Silva ", email: " MARIA@EXAMPLE.COM ", role: "user" }), { ok: true, name: "Maria Silva", email: "maria@example.com", role: "user" });
  assert.equal(validateInvitationInput({ name: "Maria", email: "inválido", role: "user" }).ok, false);
  assert.equal(validateInvitationInput({ name: "Maria", email: "maria@example.com", role: "owner" }).ok, false);
});
