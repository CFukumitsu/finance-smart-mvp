import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { GET } from "./route.ts";

const request = (currency: string) => new Request(`http://localhost/api/exchange-rates/ptax?currency=${currency}`);

test("retorna a PTAX de fechamento mais recente, ignorando boletins intermediários", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ value: [
      { cotacaoVenda: 6.10, dataHoraCotacao: "2026-10-13 13:04:26.866133", tipoBoletim: "Fechamento" },
      { cotacaoVenda: 6.15, dataHoraCotacao: "2026-10-14 10:08:09.608789", tipoBoletim: "Abertura" },
      { cotacaoVenda: 6.13, dataHoraCotacao: "2026-10-14 11:09:09.305156", tipoBoletim: "Intermediário" },
    ] }), { status: 200 });
  };
  const response = await GET(request("eur"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    currency: "EUR",
    rate: 6.1,
    quotedAt: "2026-10-13T13:04:26.866133-03:00",
    source: "Banco Central do Brasil — PTAX venda (fechamento)",
  });
  assert.match(decodeURIComponent(requestedUrl), /CotacaoMoedaPeriodo/);
  assert.match(decodeURIComponent(requestedUrl), /@moeda='EUR'/);
});

test("moeda fora da lista não consulta o Banco Central", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("{}"); };
  const response = await GET(request("XYZ"));
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("sem boletim de fechamento ou API indisponível retorna erro controlado (sem cotação fictícia)", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ value: [
    { cotacaoVenda: 7.4, dataHoraCotacao: "2026-10-14 10:08:09", tipoBoletim: "Abertura" },
  ] }), { status: 200 });
  assert.equal((await GET(request("GBP"))).status, 502);
  globalThis.fetch = async () => { throw new Error("offline"); };
  const response = await GET(request("GBP"));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Não foi possível consultar a PTAX GBP/BRL no Banco Central." });
});
