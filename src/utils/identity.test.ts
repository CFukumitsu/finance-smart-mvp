import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { getAvatarUrl, getInitials, getRoleLabel, isSafeInternalRedirect, safeInternalRedirect } from "./identity.ts";

test("gera iniciais do primeiro e último nome", () => {
  assert.equal(getInitials("César Fukumitsu", "cesar@example.com"), "CF");
});

test("usa o e-mail quando o nome não existe", () => {
  assert.equal(getInitials("", "cesar@example.com"), "CE");
});

test("aceita somente redirects internos", () => {
  assert.equal(isSafeInternalRedirect("/account?tab=profile"), true);
  assert.equal(isSafeInternalRedirect("//malicious.example"), false);
  assert.equal(isSafeInternalRedirect("https://malicious.example"), false);
  assert.equal(safeInternalRedirect("https://malicious.example"), "/dashboard");
});

test("prioriza o avatar futuro do Storage", () => {
  const profile = { avatar_url: "https://google.example/avatar.png" };
  assert.equal(getAvatarUrl(profile as never, null, "https://storage.example/avatar.png"), "https://storage.example/avatar.png");
});

test("reconhece os papéis arquiteturais", () => {
  assert.equal(getRoleLabel("manager"), "Gerente");
});
