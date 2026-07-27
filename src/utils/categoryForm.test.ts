import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import {
  getCategoryMonthlyFormValues,
  getCategoryMonthlyPayload,
} from "./categoryForm.ts";

test("despesa limpa a meta e persiste somente o limite", () => {
  assert.deepEqual(getCategoryMonthlyFormValues("Despesa", "500", "900"), {
    monthly_limit: "500",
    monthly_goal: "",
  });
  assert.deepEqual(getCategoryMonthlyPayload("Despesa", "500", "900"), {
    monthly_limit: 500,
    monthly_goal: null,
  });
});

test("receita limpa o limite e persiste somente a meta", () => {
  assert.deepEqual(getCategoryMonthlyFormValues("Receita", "500", "900"), {
    monthly_limit: "",
    monthly_goal: "900",
  });
  assert.deepEqual(getCategoryMonthlyPayload("Receita", "500", "900"), {
    monthly_limit: null,
    monthly_goal: 900,
  });
});

test("campo compatível vazio preserva a conversão atual para zero", () => {
  assert.deepEqual(getCategoryMonthlyPayload("Despesa", "", "900"), {
    monthly_limit: 0,
    monthly_goal: null,
  });
  assert.deepEqual(getCategoryMonthlyPayload("Receita", "500", ""), {
    monthly_limit: null,
    monthly_goal: 0,
  });
});

test("transferência preserva os dois campos sem alterar a regra existente", () => {
  assert.deepEqual(
    getCategoryMonthlyPayload("Transferência", "500", "900"),
    {
      monthly_limit: 500,
      monthly_goal: 900,
    },
  );
});
