import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { GET } from "./route.ts";

test("retorna a última PTAX disponível no período", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ value: [
    { cotacaoVenda: 5.1, dataHoraCotacao: "2026-08-03 10:00:00.000000" },
    { cotacaoVenda: 5.2, dataHoraCotacao: "2026-08-03 13:00:00.000000" },
  ] }), { status: 200 });
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    rate: 5.2,
    quotedAt: "2026-08-03T13:00:00.000000-03:00",
    source: "Banco Central do Brasil — PTAX venda",
  });
});

test("API indisponível retorna erro controlado", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error("offline"); };
  const response = await GET();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "Não foi possível consultar a PTAX no Banco Central.",
  });
});
