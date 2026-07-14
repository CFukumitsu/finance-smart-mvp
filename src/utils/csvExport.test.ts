import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildCsvContent } from "./csvExport.ts";

test("gera CSV compatível com Excel em português", () => {
  const content = buildCsvContent(
    ["Competência", "Descrição", "Valor"],
    [["2026-07", 'Receita "principal"', "1234,56"]]
  );

  assert.ok(content.startsWith("\uFEFF"));
  assert.ok(content.includes(";"));
  assert.ok(content.includes('"Receita ""principal"""'));
  assert.ok(content.includes('"1234,56"'));
});
