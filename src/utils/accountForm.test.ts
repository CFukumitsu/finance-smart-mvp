import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { getAccountCardFields } from "./accountForm.ts";

test("conta sempre persiste fechamento e vencimento nulos", () => {
  assert.deepEqual(getAccountCardFields("Conta", "12", "20"), {
    closing_day: null,
    due_day: null,
  });
});

test("cartão preserva os dias preenchidos", () => {
  assert.deepEqual(getAccountCardFields("Cartão", "12", "20"), {
    closing_day: 12,
    due_day: 20,
  });
});

test("cartão preserva campos opcionais vazios como nulos", () => {
  assert.deepEqual(getAccountCardFields("Cartão", "", ""), {
    closing_day: null,
    due_day: null,
  });
});
