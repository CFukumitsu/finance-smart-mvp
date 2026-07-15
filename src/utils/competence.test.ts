import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { addMonthsToCompetence, countCompetenceMonths, toCompetenceKey } from "./competence.ts";

test("normaliza datas e chaves de competência", () => {
  assert.equal(toCompetenceKey("2026-07-15"), "2026-07");
  assert.equal(toCompetenceKey(new Date(2026, 6, 15)), "2026-07");
});

test("avança competências cruzando anos", () => {
  assert.equal(addMonthsToCompetence("2026-08", 23), "2028-07");
});

test("conta intervalos de forma inclusiva", () => {
  assert.equal(countCompetenceMonths("2023-01", "2026-12"), 48);
  assert.equal(countCompetenceMonths("2026-07", "2026-07"), 1);
});

test("rejeita meses inválidos", () => {
  assert.throws(() => toCompetenceKey("2026-13"), /inválida/);
});

