import type { ImportLayout } from "@/src/lib/importLayout";

export type NormalizedImportItem = {
  date: string;
  description: string;
  value: number;
  installment?: string | null;
  raw: Record<string, unknown>;
};

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

  const fullDateMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
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

  return rows.slice(headerRowIndex + 1).map((row) => {
    const record: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const headerName = normalizeText(header);

      if (headerName) {
        record[headerName] = row[index];
      }
    });

    return record;
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

export function normalizeRowsByImportLayout(
  rows: unknown[][],
  layout: ImportLayout,
  fallbackYear?: number
): NormalizedImportItem[] {
  const mappedRows = buildRowsByHeader(rows, layout.header_row_index);

  return mappedRows
    .map((row) => {
      let value = normalizeNumber(getValueByHeader(row, layout.value_header));

      if (layout.amount_sign === "negative") {
        value = -Math.abs(value);
      }

      if (layout.amount_sign === "positive") {
        value = Math.abs(value);
      }

      const installment = layout.installment_header
        ? normalizeInstallmentText(getValueByHeader(row, layout.installment_header))
        : null;

      const description = normalizeText(
        getValueByHeader(row, layout.description_header)
      );

      return {
        date: normalizeDate(getValueByHeader(row, layout.date_header), fallbackYear),
        description: mergeDescriptionWithInstallment(description, installment),
        value,
        installment,
        raw: row,
      };
    })
    .filter((item) => item.date && item.description && item.value !== 0);
}