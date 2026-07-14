import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isGoogleProviderEnabled } from "./authProviders.ts";

test("reconhece Google habilitado nas configurações do Supabase Auth", () => {
  assert.equal(isGoogleProviderEnabled({ external: { google: true } }), true);
});

test("considera Google indisponível quando ausente, falso ou resposta inválida", () => {
  assert.equal(isGoogleProviderEnabled({ external: { google: false } }), false);
  assert.equal(isGoogleProviderEnabled({ external: {} }), false);
  assert.equal(isGoogleProviderEnabled(null), false);
});

