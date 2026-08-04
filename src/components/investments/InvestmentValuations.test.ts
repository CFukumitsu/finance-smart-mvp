import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "src/components/investments/InvestmentValuations.tsx",
  "utf8",
);
const sharedUi = readFileSync(
  "src/components/investments/InvestmentUi.tsx",
  "utf8",
);

test("modal de valorização usa uma coluna no smartphone e duas em telas maiores", () => {
  assert.match(source, /grid gap-4 sm:grid-cols-2/);
});

test("modal permite rolagem vertical e mantém ações dentro da área rolável", () => {
  assert.match(sharedUi, /max-h-\[92vh\].*overflow-y-auto/);
  assert.match(sharedUi, /flex flex-col-reverse gap-2 sm:flex-row/);
});

test("campos monetários evitam corte de valores no resumo", () => {
  assert.match(source, /break-words font-bold/);
});
