import type { ImportLayout } from "@/src/lib/importLayout";

export type NormalizedImportItem = {
  date: string;
  description: string;
  value: number;
  installment?: string | null;
  raw: Record<string, unknown>;
};

export type ImportDiscardReason =
  | "ignored_payment"
  | "ignored_summary"
  | "missing_date"
  | "missing_description"
  | "zero_or_invalid_value";

export type ImportRowDiagnostic = {
  rowNumber: number;
  rawDate: unknown;
  normalizedDate: string;
  rawDescription: unknown;
  normalizedDescription: string;
  rawValue: unknown;
  normalizedValue: number;
  status: "accepted" | "discarded";
  reason: ImportDiscardReason | null;
};

export type ImportNormalizationResult = {
  items: NormalizedImportItem[];
  diagnostics: ImportRowDiagnostic[];
  headerRowIndex: number;
  usedSavedHeaderRowIndex: boolean;
  rowsAfterHeader: number;
};

export function assignOccurrenceSourceHashes<
  T extends { date: string; description: string; value: number },
>(items: T[]) {
  const occurrenceCounter = new Map<string, number>();

  return items.map((item) => {
    const baseHash = `${item.date}|${normalizeHeader(item.description)}|${Number(
      item.value
    ).toFixed(2)}`;
    const occurrence = (occurrenceCounter.get(baseHash) ?? 0) + 1;
    occurrenceCounter.set(baseHash, occurrence);

    return {
      ...item,
      occurrence,
      sourceHash: `${baseHash}|${occurrence}`,
    };
  });
}

type StatementOccurrenceComparable = {
  statement_date: string;
  statement_description: string;
  normalized_description?: string | null;
  statement_value: number;
};

function getStatementOccurrenceKey(item: StatementOccurrenceComparable) {
  return [
    item.statement_date,
    normalizeHeader(
      item.normalized_description ?? item.statement_description
    ),
    Number(item.statement_value).toFixed(2),
  ].join("|");
}

function getStatementValueDateKey(item: StatementOccurrenceComparable) {
  return `${item.statement_date}|${Number(item.statement_value).toFixed(2)}`;
}

function normalizeComparableDescription(item: StatementOccurrenceComparable) {
  return normalizeHeader(
    item.normalized_description ?? item.statement_description
  )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function descriptionsRepresentSamePurchase(
  left: StatementOccurrenceComparable,
  right: StatementOccurrenceComparable
) {
  const leftDescription = normalizeComparableDescription(left);
  const rightDescription = normalizeComparableDescription(right);

  if (leftDescription === rightDescription) return true;

  const shorter =
    leftDescription.length <= rightDescription.length
      ? leftDescription
      : rightDescription;
  const longer =
    shorter === leftDescription ? rightDescription : leftDescription;

  if (shorter.length < 8) return false;
  if (longer.startsWith(`${shorter} `)) return true;

  const compactShorter = shorter.replace(/\s/g, "");
  const compactLonger = longer.replace(/\s/g, "");
  let commonPrefixLength = 0;

  while (
    commonPrefixLength < compactShorter.length &&
    compactShorter[commonPrefixLength] === compactLonger[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  return commonPrefixLength / compactShorter.length >= 0.8;
}

export function matchStatementItemOccurrences<
  E extends StatementOccurrenceComparable,
  P extends StatementOccurrenceComparable,
>(existingItems: E[], payloads: P[]) {
  const existingByKey = new Map<string, E[]>();
  const existingByValueDate = new Map<string, E[]>();

  existingItems.forEach((item) => {
    const key = getStatementOccurrenceKey(item);
    const matches = existingByKey.get(key) ?? [];
    matches.push(item);
    existingByKey.set(key, matches);

    const valueDateKey = getStatementValueDateKey(item);
    const valueDateMatches = existingByValueDate.get(valueDateKey) ?? [];
    valueDateMatches.push(item);
    existingByValueDate.set(valueDateKey, valueDateMatches);
  });

  const reusedItems: E[] = [];
  const newPayloads: P[] = [];
  const usedExistingItems = new Set<E>();
  const matches: Array<{
    existing: E;
    payload: P;
    matchType: "exact" | "equivalent_description";
  }> = [];

  payloads.forEach((payload) => {
    const key = getStatementOccurrenceKey(payload);
    const exactMatches = existingByKey.get(key);
    let existing = exactMatches?.find(
      (candidate) => !usedExistingItems.has(candidate)
    );
    let matchType: "exact" | "equivalent_description" = "exact";

    if (!existing) {
      const equivalentCandidates = (
        existingByValueDate.get(getStatementValueDateKey(payload)) ?? []
      ).filter(
        (candidate) =>
          !usedExistingItems.has(candidate) &&
          descriptionsRepresentSamePurchase(candidate, payload)
      );
      const candidateDescriptions = new Set(
        equivalentCandidates.map(normalizeComparableDescription)
      );

      if (candidateDescriptions.size === 1) {
        existing = equivalentCandidates[0];
        matchType = "equivalent_description";
      }
    }

    if (existing) {
      usedExistingItems.add(existing);
      reusedItems.push(existing);
      matches.push({ existing, payload, matchType });
    } else {
      newPayloads.push(payload);
    }
  });

  return { reusedItems, newPayloads, matches };
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number") return value;

  let text = String(value ?? "")
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!text) return 0;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    const lastCommaIndex = text.lastIndexOf(",");
    const lastDotIndex = text.lastIndexOf(".");

    if (lastCommaIndex > lastDotIndex) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    text = text.replace(",", ".");
  }

  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value: unknown, fallbackYear?: number) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsedDate = new Date(Math.round((value - 25569) * 86400 * 1000));

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }

  const text = String(value ?? "").trim();

  const fullDateMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/);
  if (fullDateMatch) {
    return `${fullDateMatch[3]}-${fullDateMatch[2]}-${fullDateMatch[1]}`;
  }

  const shortDateMatch = text.match(/^(\d{2})\/(\d{2})$/);
  if (shortDateMatch && fallbackYear) {
    return `${fallbackYear}-${shortDateMatch[2]}-${shortDateMatch[1]}`;
  }

  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  return "";
}

function buildRowsByHeader(rows: unknown[][], headerRowIndex: number) {
  const headers = rows[headerRowIndex] ?? [];

  return rows.slice(headerRowIndex + 1).map((row, offset) => {
    const record: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const headerName = normalizeText(header);

      if (headerName) {
        record[headerName] = row[index];
      }
    });

    return {
      record,
      rowNumber: headerRowIndex + offset + 2,
    };
  });
}

function getValueByHeader(row: Record<string, unknown>, header: string) {
  const wantedHeader = normalizeHeader(header);

  const foundKey = Object.keys(row).find(
    (key) => normalizeHeader(key) === wantedHeader
  );

  return foundKey ? row[foundKey] : undefined;
}

function normalizeInstallmentText(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const match = text.match(/parcela\s+(\d+)\s+de\s+(\d+)/i);

  if (match) {
    return `${Number(match[1])}/${Number(match[2])}`;
  }

  const directMatch = text.match(/(\d+)\s*\/\s*(\d+)/);

  if (directMatch) {
    return `${Number(directMatch[1])}/${Number(directMatch[2])}`;
  }

  return null;
}

function mergeDescriptionWithInstallment(
  description: string,
  installment: string | null
) {
  if (!installment) return description;

  if (description.includes(installment)) {
    return description;
  }

  return `${description} ${installment}`.trim();
}

function rowContainsHeaders(row: unknown[], headers: string[]) {
  const normalizedRow = new Set(
    row.map(normalizeHeader).filter(Boolean)
  );

  return headers.every((header) => normalizedRow.has(normalizeHeader(header)));
}

export function resolveImportLayoutHeaderRowIndex(
  rows: unknown[][],
  layout: ImportLayout
) {
  const requiredHeaders = [
    layout.date_header,
    layout.description_header,
    layout.value_header,
  ].filter(Boolean);
  const savedIndex = layout.header_row_index;

  if (rowContainsHeaders(rows[savedIndex] ?? [], requiredHeaders)) {
    return {
      headerRowIndex: savedIndex,
      usedSavedHeaderRowIndex: true,
    };
  }

  const candidates = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => rowContainsHeaders(row, requiredHeaders))
    .sort(
      (left, right) =>
        Math.abs(left.rowIndex - savedIndex) -
        Math.abs(right.rowIndex - savedIndex)
    );

  if (candidates.length === 0) {
    throw new Error(
      "O cabeçalho salvo não foi encontrado na planilha. Revise o modelo de importação."
    );
  }

  return {
    headerRowIndex: candidates[0].rowIndex,
    usedSavedHeaderRowIndex: false,
  };
}

function getExplicitDiscardReason(
  description: string
): ImportDiscardReason | null {
  const normalizedDescription = normalizeHeader(description);

  if (
    [
      "pagamento efetuado",
      "pagamento de fatura",
      "pagamento recebido",
    ].includes(normalizedDescription)
  ) {
    return "ignored_payment";
  }

  if (
    ["total", "total da fatura", "subtotal", "saldo anterior"].includes(
      normalizedDescription
    )
  ) {
    return "ignored_summary";
  }

  return null;
}

export function normalizeRowsByImportLayoutWithDiagnostics(
  rows: unknown[][],
  layout: ImportLayout,
  fallbackYear?: number
): ImportNormalizationResult {
  const { headerRowIndex, usedSavedHeaderRowIndex } =
    resolveImportLayoutHeaderRowIndex(rows, layout);
  const mappedRows = buildRowsByHeader(rows, headerRowIndex);
  const items: NormalizedImportItem[] = [];
  const diagnostics: ImportRowDiagnostic[] = [];

  mappedRows.forEach(({ record: row, rowNumber }) => {
    const rawValue = getValueByHeader(row, layout.value_header);
    let value = normalizeNumber(rawValue);

    if (layout.amount_sign === "negative") {
      value = -Math.abs(value);
    }

    if (layout.amount_sign === "positive") {
      value = Math.abs(value);
    }

    const installment = layout.installment_header
      ? normalizeInstallmentText(getValueByHeader(row, layout.installment_header))
      : null;
    const rawDescription = getValueByHeader(row, layout.description_header);
    const rawDate = getValueByHeader(row, layout.date_header);
    const baseDescription = normalizeText(rawDescription);
    const description = mergeDescriptionWithInstallment(
      baseDescription,
      installment
    );
    const date = normalizeDate(rawDate, fallbackYear);
    const explicitDiscardReason = getExplicitDiscardReason(baseDescription);
    const reason =
      explicitDiscardReason ??
      (!date
        ? "missing_date"
        : !description
          ? "missing_description"
          : value === 0
            ? "zero_or_invalid_value"
            : null);

    diagnostics.push({
      rowNumber,
      rawDate,
      normalizedDate: date,
      rawDescription,
      normalizedDescription: description,
      rawValue,
      normalizedValue: value,
      status: reason ? "discarded" : "accepted",
      reason,
    });

    if (!reason) {
      items.push({
        date,
        description,
        value,
        installment,
        raw: row,
      });
    }
  });

  return {
    items,
    diagnostics,
    headerRowIndex,
    usedSavedHeaderRowIndex,
    rowsAfterHeader: mappedRows.length,
  };
}

export function normalizeRowsByImportLayout(
  rows: unknown[][],
  layout: ImportLayout,
  fallbackYear?: number
): NormalizedImportItem[] {
  return normalizeRowsByImportLayoutWithDiagnostics(
    rows,
    layout,
    fallbackYear
  ).items;
}
