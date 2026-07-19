import assert from "node:assert/strict";
import test from "node:test";
import type { ImportLayout } from "../importLayout.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { assignOccurrenceSourceHashes, matchStatementItemOccurrences, normalizeRowsByImportLayoutWithDiagnostics } from "./importNormalizer.ts";

const layout: ImportLayout = {
  id: "layout-test",
  account_id: "account-test",
  name: "Layout estrutural",
  header_row_index: 12,
  date_header: "Data",
  description_header: "Lançamento",
  value_header: "Valor",
  installment_header: "Parcelamento",
  amount_sign: "auto",
  active: true,
};

function buildLargeStatementRows() {
  const rows: unknown[][] = Array.from({ length: 80 }, () => []);
  rows[13] = ["", "Data", "Lançamento", "Parcelamento", "Valor"];
  rows[14] = ["", new Date("2026-07-10T00:00:00Z"), "Pagamento Efetuado", "", -12073.84];

  let rowIndex = 15;

  for (let index = 1; index <= 54; index++) {
    if (rowIndex === 30) rowIndex += 1;

    rows[rowIndex] = [
      "",
      index % 3 === 0
        ? 46214
        : index % 3 === 1
          ? "11/07/2026"
          : new Date("2026-07-11T00:00:00Z"),
      `Compra ${index}`,
      index % 4 === 0 ? "Parcela 2 de 6" : "",
      index,
    ];
    rowIndex += 1;
  }

  rows[rowIndex++] = ["", "11/07/2026", "Compra repetida", "", 25];
  rows[rowIndex++] = ["", "11/07/2026", "Compra repetida", "", 25];
  rows[rowIndex++] = ["", "11/07/2026", "Estorno legítimo", "", -5];
  rows[rowIndex++] = ["", "11/07", "Compra em texto", "", "R$ 1.234,56"];
  rows[rowIndex] = ["", "", "Subtotal", "", ""];

  return rows;
}

test("recupera cabeçalho legado e mantém lançamentos após linha vazia", () => {
  const result = normalizeRowsByImportLayoutWithDiagnostics(
    buildLargeStatementRows(),
    layout,
    2026
  );

  assert.equal(result.headerRowIndex, 13);
  assert.equal(result.usedSavedHeaderRowIndex, false);
  assert.equal(result.items.length, 58);
  assert.ok(result.items.some((item) => item.description === "Compra 54"));
  assert.ok(result.items.some((item) => item.value === 1234.56));
  assert.ok(result.items.some((item) => item.value === -5));
  assert.equal(
    result.diagnostics.find(
      (diagnostic) => diagnostic.normalizedDescription === "Pagamento Efetuado"
    )?.reason,
    "ignored_payment"
  );
});

test("preserva ocorrências de compras idênticas", () => {
  const result = normalizeRowsByImportLayoutWithDiagnostics(
    buildLargeStatementRows(),
    layout,
    2026
  );
  const repeated = assignOccurrenceSourceHashes(
    result.items.filter((item) => item.description === "Compra repetida")
  );

  assert.equal(repeated.length, 2);
  assert.equal(repeated[0].occurrence, 1);
  assert.equal(repeated[1].occurrence, 2);
  assert.notEqual(repeated[0].sourceHash, repeated[1].sourceHash);
});

test("completa uma importação parcial de 28 para 58 sem duplicar", () => {
  const result = normalizeRowsByImportLayoutWithDiagnostics(
    buildLargeStatementRows(),
    layout,
    2026
  );
  const payloads = assignOccurrenceSourceHashes(result.items).map((item) => ({
    statement_date: item.date,
    statement_description: item.description,
    normalized_description: item.description,
    statement_value: item.value,
    source_hash: item.sourceHash,
  }));
  const existingItems = payloads.slice(0, 28).map((item, index) => ({
    ...item,
    id: `existing-${index}`,
    source_hash: `legacy-${index}`,
  }));
  const { reusedItems, newPayloads } = matchStatementItemOccurrences(
    existingItems,
    payloads
  );

  assert.equal(existingItems.length, 28);
  assert.equal(reusedItems.length, 28);
  assert.equal(newPayloads.length, 30);
  assert.equal(reusedItems.length + newPayloads.length, 58);
});

test("seleciona somente as 58 ocorrências atuais quando existem 81 persistidas", () => {
  const result = normalizeRowsByImportLayoutWithDiagnostics(
    buildLargeStatementRows(),
    layout,
    2026
  );
  const payloads = assignOccurrenceSourceHashes(result.items).map((item) => ({
    statement_date: item.date,
    statement_description: item.description,
    normalized_description: item.description,
    statement_value: item.value,
    source_hash: item.sourceHash,
  }));
  const legacyItems = payloads.slice(0, 28).map((item, index) => ({
    ...item,
    id: `legacy-${index}`,
    source_hash: `legacy-hash-${index}`,
  }));
  const newerItems = payloads.slice(5).map((item, index) => ({
    ...item,
    id: `newer-${index}`,
  }));
  const persistedItems = [...legacyItems, ...newerItems];
  const { reusedItems, newPayloads } = matchStatementItemOccurrences(
    persistedItems,
    payloads
  );

  assert.equal(persistedItems.length, 81);
  assert.equal(reusedItems.length, 58);
  assert.equal(newPayloads.length, 0);
});

test("reutiliza item quando a operadora acrescenta cidade e país à descrição", () => {
  const existingItems = [
    {
      id: "legacy-short-description",
      statement_date: "2026-07-03",
      statement_description: "SHOPPING INTERLAGOS",
      normalized_description: "SHOPPING INTERLAGOS",
      statement_value: 54.8,
    },
  ];
  const payloads = [
    {
      statement_date: "2026-07-03",
      statement_description: "SHOPPING INTERLAGOS    SAO PAULO     BRA",
      normalized_description: "SHOPPING INTERLAGOS    SAO PAULO     BRA",
      statement_value: 54.8,
    },
  ];

  const result = matchStatementItemOccurrences(existingItems, payloads);

  assert.equal(result.reusedItems.length, 1);
  assert.equal(result.newPayloads.length, 0);
  assert.equal(result.matches[0].matchType, "equivalent_description");
});

test("tolera pequena variação antes do sufixo de localização", () => {
  const existingItems = [
    {
      id: "legacy-merchant",
      statement_date: "2026-06-08",
      statement_description: "MP *BARBARABORTHOL02/02",
      normalized_description: "MP *BARBARABORTHOL02/02",
      statement_value: 725,
    },
  ];
  const payloads = [
    {
      statement_date: "2026-06-08",
      statement_description: "MP *BARBARABORTHOLO 02/02 Osasco BR",
      normalized_description: "MP *BARBARABORTHOLO 02/02 Osasco BR",
      statement_value: 725,
    },
  ];

  const result = matchStatementItemOccurrences(existingItems, payloads);

  assert.equal(result.reusedItems.length, 1);
  assert.equal(result.newPayloads.length, 0);
});

test("não combina estabelecimentos diferentes com mesma data e valor", () => {
  const existingItems = [
    {
      id: "merchant-a",
      statement_date: "2026-07-03",
      statement_description: "SHOPPING INTERLAGOS",
      normalized_description: "SHOPPING INTERLAGOS",
      statement_value: 54.8,
    },
  ];
  const payloads = [
    {
      statement_date: "2026-07-03",
      statement_description: "RESTAURANTE CENTRAL SAO PAULO BRA",
      normalized_description: "RESTAURANTE CENTRAL SAO PAULO BRA",
      statement_value: 54.8,
    },
  ];

  const result = matchStatementItemOccurrences(existingItems, payloads);

  assert.equal(result.reusedItems.length, 0);
  assert.equal(result.newPayloads.length, 1);
});

test("preserva duas ocorrências equivalentes do mesmo estabelecimento", () => {
  const existingItems = [1, 2].map((occurrence) => ({
    id: `legacy-${occurrence}`,
    statement_date: "2026-07-03",
    statement_description: "BURGER KING",
    normalized_description: "BURGER KING",
    statement_value: 49.9,
  }));
  const payloads = [1, 2].map(() => ({
    statement_date: "2026-07-03",
    statement_description: "BURGER KING SAO PAULO BRA",
    normalized_description: "BURGER KING SAO PAULO BRA",
    statement_value: 49.9,
  }));

  const result = matchStatementItemOccurrences(existingItems, payloads);

  assert.equal(result.reusedItems.length, 2);
  assert.equal(result.newPayloads.length, 0);
});
