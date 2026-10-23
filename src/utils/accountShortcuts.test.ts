import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_ICON_KEY_PATTERN,
  ACCOUNT_ICON_OPTIONS,
  findAccountIconOption,
  formatShortcutDueDate,
  formatShortcutMonthLabel,
  getCardInvoiceDueDate,
  getNextTransactionShortcutOrder,
  buildOptionalAccountColumns,
  resolveMissingAccountColumns,
  selectWithOptionalAccountColumns,
  parseTransactionShortcutOrder,
  resolveAccountIcon,
  sortTransactionShortcuts,
  summarizeCardShortcut,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./accountShortcuts.ts";

test("catálogo de ícones tem chaves únicas e compatíveis com a restrição do banco", () => {
  const keys = ACCOUNT_ICON_OPTIONS.map((option: { key: string }) => option.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, ACCOUNT_ICON_KEY_PATTERN);
  for (const option of ACCOUNT_ICON_OPTIONS) {
    assert.ok(Boolean(option.glyph) !== Boolean(option.monogram), option.key);
  }
});

test("chave inválida ou com marcação nunca é aceita", () => {
  assert.equal(findAccountIconOption("<svg onload=alert(1)>"), null);
  assert.equal(findAccountIconOption("desconhecido"), null);
  assert.equal(findAccountIconOption(null), null);
  assert.equal(findAccountIconOption("inst-wise")?.label, "Wise");
});

test("contas sem ícone usam fallback visual pelo cadastro", () => {
  assert.equal(resolveAccountIcon({ type: "Cartão", currency: "BRL" }).key, "card");
  assert.equal(resolveAccountIcon({ type: "Conta", currency: "BRL" }).key, "bank");
  assert.equal(resolveAccountIcon({ type: "Conta", currency: null }).key, "bank");
  assert.equal(resolveAccountIcon({ type: "Conta", currency: "EUR" }).key, "foreign");
  assert.equal(
    resolveAccountIcon({ type: "Conta", currency: "BRL", investment_account_kind: "BALANCE" }).key,
    "investment",
  );
  assert.equal(resolveAccountIcon({ type: "Conta", currency: "GBP", icon_key: "xyz" }).key, "foreign");
  assert.equal(resolveAccountIcon({ type: "Cartão", icon_key: "inst-nubank" }).key, "inst-nubank");
});

test("atalhos: somente favoritos, pela ordem e depois pelo nome", () => {
  const accounts = [
    { id: "a", name: "Wise", show_in_transaction_shortcuts: true, transaction_shortcut_order: 2 },
    { id: "b", name: "Itaú", show_in_transaction_shortcuts: false, transaction_shortcut_order: 1 },
    { id: "c", name: "Nubank", show_in_transaction_shortcuts: true, transaction_shortcut_order: 1 },
    { id: "d", name: "Caixa", show_in_transaction_shortcuts: true, transaction_shortcut_order: null },
    { id: "e", name: "Bradesco", show_in_transaction_shortcuts: true, transaction_shortcut_order: 2 },
    { id: "f", name: "Antigo" },
  ];
  assert.deepEqual(
    sortTransactionShortcuts(accounts).map((account: { id: string }) => account.id),
    ["c", "e", "a", "d"],
  );
  assert.equal(getNextTransactionShortcutOrder(accounts), 3);
  assert.equal(getNextTransactionShortcutOrder([]), 1);
  assert.equal(getNextTransactionShortcutOrder(accounts.filter((item) => item.id !== "a" && item.id !== "e")), 2);
});

test("ordem digitada aceita inteiros positivos", () => {
  assert.equal(parseTransactionShortcutOrder("3"), 3);
  assert.equal(parseTransactionShortcutOrder(" 12 "), 12);
  assert.equal(parseTransactionShortcutOrder("0"), null);
  assert.equal(parseTransactionShortcutOrder("-1"), null);
  assert.equal(parseTransactionShortcutOrder("1.5"), null);
  assert.equal(parseTransactionShortcutOrder(""), null);
});

test("detecta banco sem as migrations visuais e recua por grupo", async () => {
  const all = { shortcuts: true, image: true };
  assert.deepEqual(resolveMissingAccountColumns({ code: "42703", message: "column accounts.image_path does not exist" }, all), { shortcuts: true, image: false });
  assert.deepEqual(resolveMissingAccountColumns({ message: "column accounts.icon_key does not exist" }, { shortcuts: true, image: false }), { shortcuts: false, image: false });
  assert.deepEqual(resolveMissingAccountColumns({ code: "PGRST204", message: "Could not find column" }, all), { shortcuts: false, image: false });
  assert.equal(resolveMissingAccountColumns({ code: "42501", message: "permission denied" }, all), null);
  assert.equal(resolveMissingAccountColumns(null, all), null);
  assert.equal(resolveMissingAccountColumns({ code: "42703", message: "x" }, { shortcuts: false, image: false }), null);
  assert.equal(buildOptionalAccountColumns({ shortcuts: false, image: true }), ", image_path");

  // Banco só com a migration dos atalhos: a 2a tentativa vem sem image_path.
  const attempts: string[] = [];
  const result = await selectWithOptionalAccountColumns(async (columns: string) => {
    attempts.push(columns);
    return columns.includes("image_path")
      ? { error: { code: "42703", message: "column accounts.image_path does not exist" } }
      : { error: null };
  });
  assert.equal(attempts.length, 2);
  assert.deepEqual(result.available, { shortcuts: true, image: false });
});

test("vencimento: data do fechamento prevalece; senão mês seguinte no dia do cadastro", () => {
  assert.equal(getCardInvoiceDueDate({ year: 2026, month: 10, dueDay: 10 }), "2026-11-10");
  assert.equal(getCardInvoiceDueDate({ year: 2026, month: 12, dueDay: 5 }), "2027-01-05");
  assert.equal(getCardInvoiceDueDate({ year: 2027, month: 1, dueDay: 31 }), "2027-02-28");
  assert.equal(
    getCardInvoiceDueDate({ year: 2026, month: 10, dueDay: 10, statementDueDate: "2026-11-12" }),
    "2026-11-12",
  );
  assert.equal(getCardInvoiceDueDate({ year: 2026, month: 10, dueDay: null }), null);
  assert.equal(formatShortcutMonthLabel(2026, 10), "out/26");
  assert.equal(formatShortcutDueDate("2026-11-05"), "05/nov");
});

test("fatura e limite planejado seguem as regras existentes", () => {
  const transactions = [
    { account_id: "card", type: "Despesa", value: 700 },
    { account_id: "card", type: "Despesa", value: "300" as unknown as number },
    { account_id: "card", type: "Receita", value: 100 },
    { account_id: "card", type: "Pagamento de Fatura", value: 5000 },
  ];

  const withLimit = summarizeCardShortcut({ transactions, plannedLimit: 1800 });
  assert.equal(withLimit.invoiceTotal, 900);
  assert.equal(withLimit.availableLimit, 900);
  assert.equal(withLimit.usageRatio, 0.5);
  assert.equal(withLimit.isOverLimit, false);

  const over = summarizeCardShortcut({ transactions, plannedLimit: 600 });
  assert.equal(over.availableLimit, -300);
  assert.equal(over.usageRatio, 1);
  assert.equal(over.isOverLimit, true);

  const withoutLimit = summarizeCardShortcut({ transactions, plannedLimit: 0 });
  assert.equal(withoutLimit.invoiceTotal, 900);
  assert.equal(withoutLimit.availableLimit, null);
  assert.equal(withoutLimit.usageRatio, null);
});

test("planejamento do cartão: abaixo, igual, acima, sem planejamento e estornos", () => {
  const purchases = (values: number[], refunds: number[] = []) => [
    ...values.map((value) => ({ account_id: "card", type: "Despesa", value })),
    ...refunds.map((value) => ({ account_id: "card", type: "Receita", value })),
  ];

  const below = summarizeCardShortcut({ transactions: purchases([800, 200], [50]), plannedLimit: 2000 });
  assert.deepEqual(
    [below.invoiceTotal, below.availableLimit, below.usageRatio, below.isOverLimit, below.exceededAmount],
    [950, 1050, 0.475, false, 0],
  );

  const equal = summarizeCardShortcut({ transactions: purchases([1500, 500]), plannedLimit: 2000 });
  assert.deepEqual(
    [equal.invoiceTotal, equal.availableLimit, equal.usageRatio, equal.isOverLimit, equal.exceededAmount],
    [2000, 0, 1, false, 0],
  );

  const above = summarizeCardShortcut({ transactions: purchases([2000, 450], [150]), plannedLimit: 2000 });
  assert.deepEqual(
    [above.invoiceTotal, above.availableLimit, above.usageRatio, above.isOverLimit, above.exceededAmount],
    [2300, -300, 1, true, 300],
  );

  const none = summarizeCardShortcut({ transactions: purchases([800]), plannedLimit: null });
  assert.deepEqual(
    [none.invoiceTotal, none.plannedLimit, none.availableLimit, none.usageRatio, none.exceededAmount],
    [800, null, null, null, 0],
  );

  // Estornos maiores que as compras: fatura negativa (crédito); barra em 0.
  const credit = summarizeCardShortcut({ transactions: purchases([100], [300]), plannedLimit: 1000 });
  assert.deepEqual(
    [credit.invoiceTotal, credit.availableLimit, credit.usageRatio, credit.isOverLimit],
    [-200, 1200, 0, false],
  );
});
