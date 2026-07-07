"use client";

import { loadActiveImportLayout } from "@/src/lib/importLayout";
import { normalizeRowsByImportLayout } from "@/src/lib/reconciliation/importNormalizer";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  due_day?: number | null;
};

type ImportedItem = {
  id?: string;
  importKey: string;
  sourceHash: string;
  date: string;
  description: string;
  value: number;
  status?: "Pendente" | "Conciliado" | "Ignorado";
  matched: boolean;
  matchedTransactionId?: string;
  matchedTransaction?: Transaction;
  ignoredReason?: string;
};

type Transaction = {
  id: string;
  description: string;
  due_date: string;
  value: number;
  type?: string;
  status?: string;
  category_id?: string;
  signedValue?: number;
};

type Category = {
  id: string;
  name: string;
  type: string | null;
  active?: boolean | null;
};

type HeaderOption = {
  label: string;
  value: string;
};

type HeaderRowCandidate = {
  rowIndex: number;
  cells: string[];
};

type DetectedLayout = {
  headerRowIndex: number;
  dateColumnIndex: number;
  descriptionColumnIndex: number;
  valueColumnIndex: number;
  creditColumnIndex?: number;
  debitColumnIndex?: number;
  layoutType: "standard" | "porto";
  signature: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDate(value: unknown, fallbackYear?: number) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(
      parsed.d
    ).padStart(2, "0")}`;
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

  return "";
}


function parseValue(value: unknown) {
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

  return Number(text || 0);
}

function formatCurrency(value: number) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getCellColumnIndex(cellReference: string) {
  const letters = cellReference.replace(/\d/g, "").toUpperCase();

  return letters.split("").reduce((result, letter) => {
    return result * 26 + letter.charCodeAt(0) - 64;
  }, 0) - 1;
}

async function inflateRaw(data: Uint8Array) {
  const DecompressionStreamConstructor = (globalThis as unknown as {
    DecompressionStream?: new (format: "deflate-raw") => DecompressionStream;
  }).DecompressionStream;

  if (!DecompressionStreamConstructor) {
    throw new Error(
      "Este navegador não suporta a leitura alternativa deste XLSX. Abra a fatura no Excel/Google Sheets, salve novamente como .xlsx e tente importar de novo."
    );
  }

  const stream = new Blob([data.buffer as ArrayBuffer]).stream().pipeThrough(
    new DecompressionStreamConstructor("deflate-raw")
  );

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view: DataView) {
  for (let offset = view.byteLength - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Não foi possível localizar o índice interno do XLSX.");
}

async function unzipXlsxEntry(buffer: ArrayBuffer, entryName: string) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const endOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(endOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);

  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Estrutura interna do XLSX inválida.");
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(
      bytes.slice(offset + 46, offset + 46 + fileNameLength)
    );
    if (fileName === entryName) {
      const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return decoder.decode(compressedData);
      }

      if (compressionMethod === 8) {
        const inflated = await inflateRaw(compressedData);
        return decoder.decode(inflated);
      }

      throw new Error(`Tipo de compactação XLSX não suportado: ${compressionMethod}`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`Arquivo interno não encontrado no XLSX: ${entryName}`);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseCellValue(cellXml: string) {
  const inlineTextMatch = cellXml.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);

  if (inlineTextMatch) {
    return decodeXmlEntities(inlineTextMatch[1]);
  }

  const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);

  if (!valueMatch) {
    return "";
  }

  return decodeXmlEntities(valueMatch[1]);
}

function parseWorksheetRowsFromXml(sheetXml: string) {
  const rows: unknown[][] = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const row: unknown[] = [];
    const cellRegex = /<c[^>]*r="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const columnIndex = getCellColumnIndex(cellMatch[1]);
      row[columnIndex] = parseCellValue(cellMatch[2]);
    }

    if (row.some((cell) => String(cell ?? "").trim())) {
      rows.push(row);
    }
  }

  return rows;
}

async function readWorkbookRows(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });

  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: "",
  });
}

function detectLayout(rows: unknown[][]): DetectedLayout | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 80); rowIndex++) {
    const row = rows[rowIndex].map(normalizeText);

    const dateColumnIndex = row.findIndex((cell) =>
      ["data", "dt compra", "data compra", "data da compra"].includes(cell)
    );

    const descriptionColumnIndex = row.findIndex((cell) =>
      ["lancamento", "descricao", "estabelecimento", "historico"].includes(cell)
    );

    const valueColumnIndex = row.findIndex((cell) =>
      ["valor", "r$", "valor r$", "vlr"].includes(cell)
    );

    if (
      dateColumnIndex >= 0 &&
      descriptionColumnIndex >= 0 &&
      valueColumnIndex >= 0
    ) {
      return {
        headerRowIndex: rowIndex,
        dateColumnIndex,
        descriptionColumnIndex,
        valueColumnIndex,
        layoutType: "standard",
        signature: row.filter(Boolean).join("|"),
      };
    }

    const creditColumnIndex = row.findIndex((cell) => cell === "credito");
    const debitColumnIndex = row.findIndex((cell) => cell === "debito");

    if (creditColumnIndex >= 0 && debitColumnIndex >= 0) {
      return {
        headerRowIndex: rowIndex,
        dateColumnIndex: 0,
        descriptionColumnIndex: 1,
        valueColumnIndex: debitColumnIndex,
        creditColumnIndex,
        debitColumnIndex,
        layoutType: "porto",
        signature: row.filter(Boolean).join("|"),
      };
    }
  }

  return null;
}

function getStatementSourceHash(description: string, value: number) {
  return `${normalizeText(description)}|${Number(value).toFixed(2)}`;
}

function extractItems(
  rows: unknown[][],
  layout: DetectedLayout,
  fallbackYear?: number
) {
  return rows
    .slice(layout.headerRowIndex + 1)
    .map((row, index) => {
      const description = String(row[layout.descriptionColumnIndex] ?? "").trim();

      if (layout.layoutType === "porto") {
        const creditValue = parseValue(row[layout.creditColumnIndex ?? -1]);
        const debitValue = parseValue(row[layout.debitColumnIndex ?? -1]);
        const value = debitValue || creditValue * -1;

        const date = parseDate(row[layout.dateColumnIndex], fallbackYear);

        return {
          importKey: getStatementSourceHash(description, value),
          sourceHash: getStatementSourceHash(description, value),
          date,
          description,
          value,
          matched: false,
        };
      }

      const date = parseDate(row[layout.dateColumnIndex], fallbackYear);
      const value = parseValue(row[layout.valueColumnIndex]);

      return {
        importKey: getStatementSourceHash(description, value),
        sourceHash: getStatementSourceHash(description, value),
        date,
        description,
        value,
        matched: false,
      };
    })
    .filter((item) => {
      const normalizedDescription = normalizeText(item.description);

      return (
        item.date &&
        item.description &&
        item.value !== 0 &&
        normalizedDescription !== "total" &&
        !normalizedDescription.includes("fukumitsu") &&
        !normalizedDescription.includes("barbara brand")
      );
    });
}


function getDaysDifference(dateA: string, dateB: string) {
  return (
    Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime()) /
    (1000 * 60 * 60 * 24)
  );
}

function getInstallmentInfo(description: string) {
  const match = description.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);

  if (!match) return null;

  const currentInstallment = Number(match[1]);
  const totalInstallments = Number(match[2]);

  if (
    !currentInstallment ||
    !totalInstallments ||
    currentInstallment < 1 ||
    totalInstallments < 2 ||
    currentInstallment > totalInstallments
  ) {
    return null;
  }

  return {
    currentInstallment,
    totalInstallments,
  };
}

function getDescriptionBase(description: string) {
  return normalizeText(description)
    .replace(/\d{1,2}\s*\/\s*\d{1,2}/g, "")
    .replace(/\d+/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function valuesAreEqual(valueA: number, valueB: number) {
  return Math.abs(Number(valueA) - Number(valueB)) < 0.01;
}

function hasSameInstallment(
  statementDescription: string,
  financeDescription: string
) {
  const statementInstallment = getInstallmentInfo(statementDescription);
  const financeInstallment = getInstallmentInfo(financeDescription);

  if (!statementInstallment || !financeInstallment) {
    return false;
  }

  return (
    statementInstallment.currentInstallment ===
    financeInstallment.currentInstallment &&
    statementInstallment.totalInstallments === financeInstallment.totalInstallments
  );
}

function addMonthsToDate(date: string, months: number) {
  const result = new Date(date + "T00:00:00");
  result.setMonth(result.getMonth() + months);
  return result.toISOString().split("T")[0];
}

function findMatchingTransaction(
  importedItem: ImportedItem,
  transactions: Transaction[],
  usedTransactionIds = new Set<string>()
) {
  const installmentInfo = getInstallmentInfo(importedItem.description);

  const candidates = transactions
    .filter(
      (transaction) =>
        !usedTransactionIds.has(transaction.id) &&
        transaction.type !== "Pagamento de Fatura" &&
        transaction.type !== "Transferência"
    )
    .map((transaction) => {
      const sameValue = valuesAreEqual(
        Number(transaction.value),
        Math.abs(importedItem.value)
      );

      const sameInstallment = hasSameInstallment(
        importedItem.description,
        transaction.description
      );

      const daysDifference = getDaysDifference(
        importedItem.date,
        transaction.due_date
      );

      const isInstallmentCandidate =
        !!installmentInfo && sameValue && sameInstallment;

      const isDateCandidate =
        !installmentInfo && sameValue && daysDifference <= 3;

      return {
        transaction,
        score: isInstallmentCandidate
          ? 0
          : isDateCandidate
            ? daysDifference
            : 999999,
      };
    })
    .filter((candidate) => candidate.score < 999999)
    .sort((a, b) => a.score - b.score);

  return candidates[0]?.transaction;
}

function findGroupedMatchingTransaction(
  importedItem: ImportedItem,
  pendingItems: ImportedItem[],
  transactions: Transaction[],
  usedTransactionIds = new Set<string>()
) {
  const baseDescription = getDescriptionBase(importedItem.description);
  const installmentInfo = getInstallmentInfo(importedItem.description);

  if (!baseDescription || !installmentInfo) {
    return null;
  }

  const groupItems = pendingItems.filter((item) => {
    if (item.matched || item.status === "Conciliado") {
      return false;
    }

    const itemBaseDescription = getDescriptionBase(item.description);
    const itemInstallment = getInstallmentInfo(item.description);

    return (
      itemBaseDescription === baseDescription &&
      itemInstallment?.currentInstallment === installmentInfo.currentInstallment &&
      itemInstallment?.totalInstallments === installmentInfo.totalInstallments
    );
  });

  if (groupItems.length < 2) {
    return null;
  }

  const groupTotal = groupItems.reduce(
    (sum, item) => sum + Math.abs(Number(item.value)),
    0
  );

  const candidate = transactions.find(
    (transaction) =>
      !usedTransactionIds.has(transaction.id) &&
      transaction.type !== "Pagamento de Fatura" &&
      transaction.type !== "Transferência" &&
      valuesAreEqual(Number(transaction.value), groupTotal) &&
      hasSameInstallment(importedItem.description, transaction.description)
  );

  if (!candidate) {
    return null;
  }

  return {
    transaction: candidate,
    items: groupItems,
  };
}

type StatementItemPayload = {
  account_id: string;
  competence_id: string;
  statement_date: string;
  statement_description: string;
  normalized_description: string;
  statement_value: number;
  source_hash: string;
  status: "Pendente";
  updated_at: string;
};

type ExistingStatementItem = {
  id: string;
  statement_date: string;
  statement_description: string;
  normalized_description: string | null;
  statement_value: number;
  source_hash: string;
  status: "Pendente" | "Conciliado" | "Ignorado";
};

function getStableStatementKey(item: {
  statement_date: string;
  normalized_description: string;
  statement_value: number;
}) {
  return [
    item.statement_date,
    item.normalized_description,
    Number(item.statement_value).toFixed(2),
  ].join("|");
}

async function syncStatementItems(
  accountId: string,
  competenceId: string,
  payloads: StatementItemPayload[]
) {
  const { data: existingItems, error: existingError } = await supabase
    .from("credit_card_statement_items")
    .select(
      "id, statement_date, statement_description, normalized_description, statement_value, source_hash, status"
    )
    .eq("account_id", accountId)
    .eq("competence_id", competenceId);

  if (existingError) {
    throw existingError;
  }

  const existingByStableKey = new Map<string, ExistingStatementItem>();

  ((existingItems ?? []) as ExistingStatementItem[]).forEach((item) => {
    const key = getStableStatementKey({
      statement_date: item.statement_date,
      normalized_description:
        item.normalized_description ?? normalizeText(item.statement_description),
      statement_value: Number(item.statement_value),
    });

    if (!existingByStableKey.has(key)) {
      existingByStableKey.set(key, item);
    }
  });

  const newPayloads = payloads.filter((payload) => {
    const key = getStableStatementKey(payload);
    return !existingByStableKey.has(key);
  });

  if (newPayloads.length > 0) {
    const { error: insertError } = await supabase
      .from("credit_card_statement_items")
      .insert(newPayloads);

    if (insertError) {
      throw insertError;
    }
  }

  return {
    imported: payloads.length,
    reused: payloads.length - newPayloads.length,
    created: newPayloads.length,
  };
}

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [competences, setCompetences] = useState<
    { id: string; name: string; month: number; year: number; start_date?: string; end_date?: string }[]
  >([]);
  const [selectedCompetenceId, setSelectedCompetenceId] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedLayout, setDetectedLayout] = useState<DetectedLayout | null>(
    null
  );
  const [items, setItems] = useState<ImportedItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(true);
  const [viewMode, setViewMode] = useState<"all" | "difference">("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemToReconcile, setItemToReconcile] = useState<ImportedItem | null>(null);
  const [itemToCreateTransaction, setItemToCreateTransaction] =
    useState<ImportedItem | null>(null);
  const [itemToEditTransaction, setItemToEditTransaction] =
    useState<ImportedItem | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [isClosingStatement, setIsClosingStatement] = useState(false);
  const isClosingStatementRef = useRef(false);
  const [layoutHeaders, setLayoutHeaders] = useState<HeaderOption[]>([]);
  const [headerRowCandidates, setHeaderRowCandidates] = useState<HeaderRowCandidate[]>([]);
  const [selectedHeaderRowIndex, setSelectedHeaderRowIndex] = useState<number | null>(null);
  const [showLayoutMapping, setShowLayoutMapping] = useState(false);
  const [pendingLayoutRows, setPendingLayoutRows] = useState<unknown[][]>([]);
  const [layoutForm, setLayoutForm] = useState({
    header_row_index: "1",
    date_header: "",
    description_header: "",
    value_header: "",
    installment_header: "",
    amount_sign: "auto" as "auto" | "positive" | "negative",
  });
  const [closedStatement, setClosedStatement] = useState<{
    id: string;
    payment_transaction_id: string | null;
  } | null>(null);

  const [editForm, setEditForm] = useState({
    description: "",
    value: "",
    due_date: "",
  });
  const [createForm, setCreateForm] = useState({
    description: "",
    value: "",
    due_date: "",
    type: "Despesa",
    status: "Pago",
    category_id: "",
  });

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  function getSignedTransactionValue(transaction: Transaction) {
    return transaction.type === "Receita"
      ? Number(transaction.value) * -1
      : Number(transaction.value);
  }

  function getFinanceGroupDifference(item: ImportedItem) {
    if (!item.matchedTransactionId || !item.matchedTransaction) {
      return null;
    }

    const statementTotal = items
      .filter(
        (currentItem) =>
          currentItem.matchedTransactionId === item.matchedTransactionId
      )
      .reduce((sum, currentItem) => sum + Number(currentItem.value), 0);

    const financeTotal = getSignedTransactionValue(item.matchedTransaction);

    return statementTotal - financeTotal;
  }

  function isFullyReconciled(item: ImportedItem) {
    const groupDifference = getFinanceGroupDifference(item);

    if (groupDifference === null) {
      return false;
    }

    return Math.abs(groupDifference) < 0.01;
  }

  const matchedItems = items.filter(
    (item) => item.status === "Conciliado" || item.matched
  );
  const unresolvedItems = items.filter(
    (item) => item.status !== "Conciliado" || !isFullyReconciled(item)
  );
  const visibleItems = showOnlyUnmatched ? unresolvedItems : items;

  const totalImported = items.reduce((sum, item) => sum + item.value, 0);
  const totalMatched = matchedItems.reduce((sum, item) => sum + item.value, 0);

  const unmatchedItems = unresolvedItems;
  const totalUnmatched = unmatchedItems.reduce(
    (sum, item) => sum + item.value,
    0
  );

  const reconciliationGroups = transactions
    .filter(
      (transaction) =>
        transaction.type !== "Pagamento de Fatura" &&
        transaction.type !== "Transferência"
    )
    .map((transaction) => {
      const linkedItems = items.filter(
        (item) => item.matchedTransactionId === transaction.id
      );

      const statementTotal = linkedItems.reduce(
        (sum, item) => sum + Number(item.value),
        0
      );

      const financeValue =
        transaction.type === "Receita"
          ? Number(transaction.value) * -1
          : Number(transaction.value);

      return {
        ...transaction,
        statementTotal,
        financeValue,
        difference: statementTotal - financeValue,
        hasStatementMatch: linkedItems.length > 0,
      };
    });

  const reconciledTransactionIds = Array.from(
    new Set(
      reconciliationGroups
        .filter((transaction) => Math.abs(transaction.difference) < 0.01)
        .map((transaction) => transaction.id)
    )
  );

  const financeOnlyTransactions = reconciliationGroups.filter(
    (transaction) => !transaction.hasStatementMatch
  );

  const totalFinanceOnly = financeOnlyTransactions.reduce(
    (sum, transaction) => sum + transaction.financeValue,
    0
  );

  const totalFinanceMatched = reconciliationGroups
    .filter((transaction) => transaction.hasStatementMatch)
    .reduce((sum, transaction) => sum + transaction.financeValue, 0);

  const totalStatementDifference = reconciliationGroups
    .filter((transaction) => transaction.hasStatementMatch)
    .reduce((sum, transaction) => sum + transaction.difference, 0);

  const totalDifference = totalStatementDifference + totalUnmatched;

  const financeDifferenceTransactions = reconciliationGroups.filter(
    (transaction) =>
      transaction.hasStatementMatch && Math.abs(transaction.difference) >= 0.01
  );

  function getCurrentCompetenceId(list: { id: string; month: number; year: number }[]) {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const currentCompetence = list.find(
      (competence) =>
        competence.month === currentMonth && competence.year === currentYear
    );

    return currentCompetence?.id ?? list[0]?.id ?? "";
  }

  useEffect(() => {
    async function loadAccounts() {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, type, due_day")
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) {
        alert("Erro ao carregar contas/cartões.");
        return;
      }

      const accountList = (data ?? []) as Account[];

      setAccounts(accountList);

      const defaultAccount = accountList.find((account) =>
        normalizeText(account.name).includes("personnalite")
      );

      setSelectedAccountId(defaultAccount?.id ?? "");
    }

    async function loadCompetences() {
      const { data, error } = await supabase
        .from("competences")
        .select("id, name, month, year, start_date, end_date")
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (error) {
        alert("Erro ao carregar competências.");
        return;
      }

      const competenceList = data ?? [];

      setCompetences(competenceList);
      setSelectedCompetenceId(getCurrentCompetenceId(competenceList));
    }

    async function loadCategories() {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, type, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) {
        alert("Erro ao carregar categorias.");
        return;
      }

      setCategories((data ?? []) as Category[]);
    }

    loadAccounts();
    loadCompetences();
    loadCategories();
  }, []);

  async function loadTransactions(accountId: string, competenceId: string) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, due_date, value, type, status, category_id")
      .eq("account_id", accountId)
      .eq("competence_id", competenceId);

    if (error) {
      throw new Error("Erro ao carregar lançamentos do Finance Smart.");
    }

    return (data ?? []) as Transaction[];
  }

  async function loadPersistedStatement(accountId: string, competenceId: string) {
    const persistedTransactions = await loadTransactions(accountId, competenceId);

    const { data: persistedItems, error: persistedItemsError } = await supabase
      .from("credit_card_statement_items")
      .select("id, statement_date, statement_description, statement_value, source_hash, status")
      .eq("account_id", accountId)
      .eq("competence_id", competenceId)
      .neq("status", "Ignorado")
      .order("statement_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (persistedItemsError) {
      throw persistedItemsError;
    }

    const statementItemIds = (persistedItems ?? []).map((item) => item.id);

    let linkedRows: {
      statement_item_id: string;
      transaction_id: string;
    }[] = [];

    if (statementItemIds.length > 0) {
      const { data: links, error: linksError } = await supabase
        .from("credit_card_statement_item_transactions")
        .select("statement_item_id, transaction_id")
        .in("statement_item_id", statementItemIds);

      if (linksError) {
        throw linksError;
      }

      linkedRows = links ?? [];
    }

    const linkedTransactionIds = Array.from(
      new Set(linkedRows.map((link) => link.transaction_id))
    );

    let linkedTransactions: Transaction[] = [];

    if (linkedTransactionIds.length > 0) {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, due_date, value, type, status, category_id")
        .in("id", linkedTransactionIds)
        .eq("account_id", accountId)
        .eq("competence_id", competenceId);
      if (error) {
        throw error;
      }

      linkedTransactions = (data ?? []) as Transaction[];
    }

    const allAvailableTransactions = [
      ...persistedTransactions,
      ...linkedTransactions.filter(
        (linkedTransaction) =>
          !persistedTransactions.some(
            (transaction) => transaction.id === linkedTransaction.id
          )
      ),
    ];

    const persistedImportedItems = (persistedItems ?? []).map((persistedItem) => {
      const linkedRow = linkedRows.find(
        (link) => link.statement_item_id === persistedItem.id
      );

      const linkedTransaction = linkedRow
        ? allAvailableTransactions.find(
          (transaction) => transaction.id === linkedRow.transaction_id
        )
        : undefined;

      return {
        id: persistedItem.id,
        importKey: persistedItem.source_hash,
        sourceHash: persistedItem.source_hash,
        date: persistedItem.statement_date,
        description: persistedItem.statement_description,
        value: Number(persistedItem.statement_value),
        status:
          (persistedItem.status as
            | "Pendente"
            | "Conciliado"
            | "Ignorado") ?? "Pendente",
        matched:
          persistedItem.status === "Conciliado"
            ? true
            : !!linkedTransaction,
        matchedTransactionId: linkedTransaction?.id,
        matchedTransaction:
          persistedItem.status === "Conciliado"
            ? linkedTransaction
            : linkedTransaction,
      };
    }) as ImportedItem[];

    const { data: existingStatement } = await supabase
      .from("credit_card_statements")
      .select("id, payment_transaction_id")
      .eq("account_id", accountId)
      .eq("competence_id", competenceId)
      .maybeSingle();

    setClosedStatement(existingStatement ?? null);
    setTransactions(allAvailableTransactions);
    setItems(persistedImportedItems);

    if (persistedImportedItems.length > 0) {
      setDetectedLayout({
        headerRowIndex: 0,
        dateColumnIndex: 0,
        descriptionColumnIndex: 1,
        valueColumnIndex: 2,
        layoutType: "standard",
        signature: "persisted-statement",
      });
    }
  }

  async function runAutoReconciliation(accountId: string, competenceId: string) {
    const accountTransactions = await loadTransactions(accountId, competenceId);

    const { data: pendingItems, error: pendingItemsError } = await supabase
      .from("credit_card_statement_items")
      .select("id, statement_date, statement_description, statement_value, source_hash, status")
      .eq("account_id", accountId)
      .eq("competence_id", competenceId)
      .eq("status", "Pendente");

    if (pendingItemsError) {
      throw pendingItemsError;
    }

    const importedPendingItems = (pendingItems ?? []).map((item) => ({
      id: item.id,
      importKey: item.source_hash,
      sourceHash: item.source_hash,
      date: item.statement_date,
      description: item.statement_description,
      value: Number(item.statement_value),
      status: "Pendente" as const,
      matched: false,
    }));

    const usedTransactionIds = new Set<string>();
    const usedStatementItemIds = new Set<string>();

    for (const item of importedPendingItems) {
      if (!item.id || usedStatementItemIds.has(item.id)) {
        continue;
      }

      const groupedMatch = findGroupedMatchingTransaction(
        item,
        importedPendingItems.filter(
          (pendingItem) =>
            pendingItem.id && !usedStatementItemIds.has(pendingItem.id)
        ),
        accountTransactions,
        usedTransactionIds
      );

      if (groupedMatch) {
        for (const groupItem of groupedMatch.items) {
          if (!groupItem.id) continue;

          const { error: insertLinkError } = await supabase
            .from("credit_card_statement_item_transactions")
            .insert({
              statement_item_id: groupItem.id,
              transaction_id: groupedMatch.transaction.id,
            });

          if (insertLinkError) {
            console.warn("Vínculo automático agrupado ignorado:", insertLinkError);
            continue;
          }

          const { error: updateItemError } = await supabase
            .from("credit_card_statement_items")
            .update({
              status: "Conciliado",
              ignored_reason: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", groupItem.id);

          if (updateItemError) {
            throw updateItemError;
          }

          usedStatementItemIds.add(groupItem.id);
        }

        usedTransactionIds.add(groupedMatch.transaction.id);
        continue;
      }

      const automaticMatch = findMatchingTransaction(
        item,
        accountTransactions,
        usedTransactionIds
      );

      if (!automaticMatch) {
        continue;
      }

      const { error: insertLinkError } = await supabase
        .from("credit_card_statement_item_transactions")
        .insert({
          statement_item_id: item.id,
          transaction_id: automaticMatch.id,
        });

      if (insertLinkError) {
        console.warn("Sugestão automática ignorada:", insertLinkError);
        continue;
      }

      const { error: updateItemError } = await supabase
        .from("credit_card_statement_items")
        .update({
          status: "Conciliado",
          ignored_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (updateItemError) {
        throw updateItemError;
      }

      usedStatementItemIds.add(item.id);
      usedTransactionIds.add(automaticMatch.id);
    }
  }

  async function loadSelectedReconciliation() {
    if (!selectedAccountId || !selectedCompetenceId) {
      alert("Selecione conta/cartão e competência.");
      return;
    }

    const selectedCompetence = competences.find(
      (competence) => competence.id === selectedCompetenceId
    );

    const confirmationMessage = selectedFile
      ? `Você está conciliando o cartão/conta "${selectedAccount?.name}" na competência "${selectedCompetence?.name}" com o arquivo "${selectedFile.name}". Deseja continuar?`
      : `Você está carregando a conferência salva do cartão/conta "${selectedAccount?.name}" na competência "${selectedCompetence?.name}". Deseja continuar?`;

    if (!confirm(confirmationMessage)) {
      return;
    }

    setIsProcessing(true);

    try {
      if (selectedFile) {
        await handleFileUpload(selectedFile);
        return;
      }

      await runAutoReconciliation(selectedAccountId, selectedCompetenceId);
      await loadPersistedStatement(selectedAccountId, selectedCompetenceId);
    } catch (error) {
      console.error("Erro ao carregar conferência:", error);
      alert("Erro ao carregar conferência.");
    } finally {
      setIsProcessing(false);
    }
  }

  function extractHeaderOptions(rows: unknown[][], headerRowIndex: number) {
    const headerRow = rows[headerRowIndex] ?? [];

    return headerRow
      .map((header) => String(header ?? "").trim())
      .filter(Boolean)
      .map((header) => ({
        label: header,
        value: header,
      }));
  }

  function findBestHeaderRowIndex(rows: unknown[][]) {
    for (let index = 0; index < Math.min(rows.length, 80); index++) {
      const normalizedCells = rows[index]
        .map((cell) => normalizeText(cell))
        .filter(Boolean);

      if (normalizedCells.length < 3) {
        continue;
      }

      const hasDate = normalizedCells.includes("data");

      const hasDescription =
        normalizedCells.includes("lancamento") ||
        normalizedCells.includes("descricao") ||
        normalizedCells.includes("estabelecimento") ||
        normalizedCells.includes("historico");

      const hasValue =
        normalizedCells.includes("valor") ||
        normalizedCells.includes("valor parcial") ||
        normalizedCells.includes("r$") ||
        normalizedCells.includes("valor r$") ||
        normalizedCells.includes("vlr");

      if (hasDate && hasDescription && hasValue) {
        return index;
      }
    }

    return -1;
  }

  function suggestHeader(headers: HeaderOption[], candidates: string[]) {
    const normalizedCandidates = candidates.map(normalizeText);

    return (
      headers.find((header) =>
        normalizedCandidates.includes(normalizeText(header.value))
      )?.value ?? ""
    );
  }

  function findFirstUsefulRowIndex(rows: unknown[][]) {
    const index = rows.findIndex((row) => {
      const cells = row
        .map((cell) => String(cell ?? "").trim())
        .filter(Boolean);

      return cells.length >= 3;
    });

    return index >= 0 ? index : 0;
  }

  function getHeaderRowCandidates(rows: unknown[][]): HeaderRowCandidate[] {
    return rows
      .map((row, rowIndex) => ({
        rowIndex,
        cells: row
          .map((cell) => String(cell ?? "").trim())
          .filter(Boolean),
      }))
      .filter((row) => row.cells.length >= 2)
      .slice(0, 20);
  }

  function chooseHeaderRow(rows: unknown[][], rowIndex: number) {
    const headers = extractHeaderOptions(rows, rowIndex);

    setSelectedHeaderRowIndex(rowIndex);
    setLayoutHeaders(headers);

    setLayoutForm({
      header_row_index: String(rowIndex),
      date_header: suggestHeader(headers, ["data", "dt compra", "data compra"]),
      description_header: suggestHeader(headers, [
        "lançamento",
        "lancamento",
        "descrição",
        "descricao",
        "histórico",
        "historico",
      ]),
      value_header: suggestHeader(headers, ["valor", "valor parcial", "r$", "vlr"]),
      installment_header: suggestHeader(headers, [
        "parcelamento",
        "parcela",
        "parcelas",
      ]),
      amount_sign: "auto" as "auto" | "positive" | "negative",
    });
  }

  function openLayoutMapping(rows: unknown[][]) {
    const candidates = getHeaderRowCandidates(rows);

    setPendingLayoutRows(rows);
    setHeaderRowCandidates(candidates);
    setLayoutHeaders([]);
    setSelectedHeaderRowIndex(null);
    setLayoutForm({
      header_row_index: "",
      date_header: "",
      description_header: "",
      value_header: "",
      installment_header: "",
      amount_sign: "auto" as "auto" | "positive" | "negative",
    });
    setShowLayoutMapping(true);
  }

  async function handleFileUpload(file: File) {
    if (!selectedAccountId || !selectedCompetenceId) {
      alert("Selecione uma conta/cartão e uma competência antes de importar a fatura.");
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);
    setDetectedLayout(null);
    setItems([]);
    setTransactions([]);

    try {
      const buffer = await file.arrayBuffer();
      const rows = await readWorkbookRows(buffer);

      const selectedCompetence = competences.find(
        (competence) => competence.id === selectedCompetenceId
      );

      const savedLayout = await loadActiveImportLayout(selectedAccountId);

      let detectedImportLayout: DetectedLayout | null = null;
      let extractedItems: ImportedItem[] = [];

      if (savedLayout) {
        console.clear();
        console.log("LAYOUT SALVO:", savedLayout);
        console.log("HEADER ROW INDEX:", savedLayout.header_row_index);
        console.log("LINHA DO CABEÇALHO LIDA:", rows[savedLayout.header_row_index]);
        console.log("PRIMEIRAS 5 LINHAS APÓS CABEÇALHO:", rows.slice(savedLayout.header_row_index + 1, savedLayout.header_row_index + 6));
      
        const normalizedItems = normalizeRowsByImportLayout(
          rows,
          savedLayout,
          selectedCompetence?.year
        );
      
        console.log("NORMALIZED ITEMS:", normalizedItems);

        extractedItems = normalizedItems.map((item) => ({
          importKey: getStatementSourceHash(item.description, item.value),
          sourceHash: getStatementSourceHash(item.description, item.value),
          date: item.date,
          description: item.description,
          value: item.value,
          matched: false,
        }));

        detectedImportLayout = {
          headerRowIndex: savedLayout.header_row_index,
          dateColumnIndex: 0,
          descriptionColumnIndex: 0,
          valueColumnIndex: 0,
          layoutType: "standard",
          signature: `saved-layout-${savedLayout.id}`,
        };
      } else {
        openLayoutMapping(rows);
        alert(
          "Não encontrei um modelo salvo para este cartão. Faça o mapeamento das colunas uma vez e eu salvo para as próximas importações."
        );
        return;
      }

      const itemOccurrenceCounter = new Map<string, number>();

      const statementItemsPayload = extractedItems.map((item) => {
        const baseHash = `${item.date}|${normalizeText(item.description)}|${Number(
          item.value
        ).toFixed(2)}`;

        const occurrence = (itemOccurrenceCounter.get(baseHash) ?? 0) + 1;
        itemOccurrenceCounter.set(baseHash, occurrence);

        const sourceHash = `${baseHash}|${occurrence}`;

        return {
          account_id: selectedAccountId,
          competence_id: selectedCompetenceId,
          statement_date: item.date,
          statement_description: item.description,
          normalized_description: normalizeText(item.description),
          statement_value: item.value,
          source_hash: sourceHash,
          status: "Pendente",
          updated_at: new Date().toISOString(),
        };
      });

      if (statementItemsPayload.length > 0) {
        const syncResult = await syncStatementItems(
          selectedAccountId,
          selectedCompetenceId,
          statementItemsPayload as StatementItemPayload[]
        );

        console.log("Sincronização da fatura:", syncResult);

        await runAutoReconciliation(selectedAccountId, selectedCompetenceId);
      }

      const { data: persistedItems, error: persistedItemsError } = await supabase
        .from("credit_card_statement_items")
        .select(
          "id, statement_date, statement_description, statement_value, source_hash, status"
        )
        .eq("account_id", selectedAccountId)
        .eq("competence_id", selectedCompetenceId)
        .neq("status", "Ignorado")
        .order("statement_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (persistedItemsError) {
        throw persistedItemsError;
      }

      const accountTransactions = await loadTransactions(
        selectedAccountId,
        selectedCompetenceId
      );

      const statementItemIds = (persistedItems ?? []).map((item) => item.id);

      let linkedRows: {
        statement_item_id: string;
        transaction_id: string;
      }[] = [];

      if (statementItemIds.length > 0) {
        const { data: links, error: linksError } = await supabase
          .from("credit_card_statement_item_transactions")
          .select("statement_item_id, transaction_id")
          .in("statement_item_id", statementItemIds);

        if (linksError) {
          throw linksError;
        }

        linkedRows = links ?? [];
      }

      const linkedTransactionIds = Array.from(
        new Set(linkedRows.map((link) => link.transaction_id))
      );

      let linkedTransactions: Transaction[] = [];

      if (linkedTransactionIds.length > 0) {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, description, due_date, value, type, status, category_id")
          .in("id", linkedTransactionIds)
          .eq("account_id", selectedAccountId)
          .eq("competence_id", selectedCompetenceId);
        if (error) {
          throw error;
        }

        linkedTransactions = (data ?? []) as Transaction[];
      }

      const allAvailableTransactions = [
        ...accountTransactions,
        ...linkedTransactions.filter(
          (linkedTransaction) =>
            !accountTransactions.some(
              (transaction) => transaction.id === linkedTransaction.id
            )
        ),
      ];

      const reconciledItems = (persistedItems ?? []).map((persistedItem) => {
        const linkedRow = linkedRows.find(
          (link) => link.statement_item_id === persistedItem.id
        );

        const linkedTransaction = linkedRow
          ? allAvailableTransactions.find(
            (transaction) => transaction.id === linkedRow.transaction_id
          )
          : undefined;

        return {
          id: persistedItem.id,
          importKey: persistedItem.source_hash,
          sourceHash: persistedItem.source_hash,
          date: persistedItem.statement_date,
          description: persistedItem.statement_description,
          value: Number(persistedItem.statement_value),
          status:
            (persistedItem.status as
              | "Pendente"
              | "Conciliado"
              | "Ignorado") ?? "Pendente",
          matched:
            persistedItem.status === "Conciliado"
              ? true
              : !!linkedTransaction,
          matchedTransactionId: linkedTransaction?.id,
          matchedTransaction:
            persistedItem.status === "Conciliado"
              ? linkedTransaction
              : linkedTransaction,
        };
      }) as ImportedItem[];

      const { data: existingStatement } = await supabase
        .from("credit_card_statements")
        .select("id, payment_transaction_id")
        .eq("account_id", selectedAccountId)
        .eq("competence_id", selectedCompetenceId)
        .maybeSingle();

      setClosedStatement(existingStatement ?? null);
      setDetectedLayout(detectedImportLayout);
      setTransactions(allAvailableTransactions);
      setItems(reconciledItems);
      setShowOnlyUnmatched(true);

      if (statementItemsPayload.length > 0) {
        console.log("Fatura carregada:", {
          itensNaPlanilha: statementItemsPayload.length,
          itensNaConferencia: reconciledItems.length,
          conciliados: reconciledItems.filter((item) => item.status === "Conciliado").length,
          pendentes: reconciledItems.filter((item) => item.status === "Pendente").length,
        });
      }
    } catch (error) {
      console.error("Erro ao processar fatura:", error);
      alert(error instanceof Error ? error.message : "Erro ao processar fatura.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function saveImportLayout() {
    if (!selectedAccountId) {
      alert("Selecione uma conta/cartão.");
      return;
    }

    if (
      !layoutForm.date_header ||
      !layoutForm.description_header ||
      !layoutForm.value_header
    ) {
      alert("Mapeie Data, Descrição e Valor.");
      return;
    }

    try {
      const { error: deactivateError } = await supabase
        .from("import_layouts")
        .update({
          active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", selectedAccountId);

      if (deactivateError) {
        throw deactivateError;
      }

      const { error: insertError } = await supabase.from("import_layouts").insert({
        account_id: selectedAccountId,
        name: `Modelo ${selectedAccount?.name ?? ""}`.trim(),
        header_row_index: Math.max(0, Number(layoutForm.header_row_index) - 1),
        date_header: layoutForm.date_header,
        description_header: layoutForm.description_header,
        value_header: layoutForm.value_header,
        installment_header: layoutForm.installment_header || null,
        amount_sign: layoutForm.amount_sign,
        active: true,
        updated_at: new Date().toISOString(),
      });

      if (insertError) {
        throw insertError;
      }

      setShowLayoutMapping(false);

      if (selectedFile) {
        await handleFileUpload(selectedFile);
      } else if (pendingLayoutRows.length > 0) {
        alert("Modelo salvo. Agora carregue novamente a conferência.");
      }
    } catch (error) {
      console.error("Erro ao salvar modelo de importação:", error);
      alert("Erro ao salvar modelo de importação.");
    }
  }

  function openCreateTransactionDrawer(item: ImportedItem) {
    setItemToCreateTransaction(item);

    setCreateForm({
      description: item.description,
      value: String(Math.abs(item.value)),
      due_date: item.date,
      type: item.value < 0 ? "Receita" : "Despesa",
      status: item.value < 0 ? "Recebido" : "Pago",
      category_id: "",
    });
  }

  async function createTransactionFromImportedItem() {
    if (!itemToCreateTransaction) return;

    if (!selectedAccountId || !selectedCompetenceId) {
      alert("Selecione conta/cartão e competência.");
      return;
    }

    if (
      !createForm.description ||
      !createForm.value ||
      !createForm.due_date ||
      !createForm.category_id
    ) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    const payload = {
      description: createForm.description,
      value: Number(createForm.value),
      due_date: createForm.due_date,
      type: createForm.type,
      mode: "unico",
      status: createForm.status,
      account_id: selectedAccountId,
      category_id: createForm.category_id,
      competence_id: selectedCompetenceId,
    };

    const { data: createdTransaction, error } = await supabase
      .from("transactions")
      .insert(payload)
      .select("id, description, due_date, value, type, status, category_id")
      .single();

    if (error || !createdTransaction) {
      console.error("Erro ao criar lançamento:", error);
      alert("Erro ao criar lançamento.");
      return;
    }

    const newTransaction = createdTransaction as Transaction;

    setTransactions((previousTransactions) => [
      ...previousTransactions,
      newTransaction,
    ]);

    try {
      await saveReconciliation(itemToCreateTransaction, newTransaction.id);
    } catch (reconciliationError) {
      console.error("Erro ao gravar conciliação:", reconciliationError);
      alert("Lançamento criado, mas erro ao gravar conciliação.");
      return;
    }

    setItems((previousItems) =>
      previousItems.map((currentItem) =>
        currentItem.id === itemToCreateTransaction.id
          ? {
            ...currentItem,
            status: "Conciliado",
            matched: true,
            matchedTransactionId: newTransaction.id,
            matchedTransaction: newTransaction,
          }
          : currentItem
      )
    );

    setItemToCreateTransaction(null);
  }

  function openEditTransactionDrawer(item: ImportedItem) {
    if (!item.matchedTransaction) {
      alert("Nenhum lançamento vinculado para corrigir.");
      return;
    }

    setItemToEditTransaction(item);

    setEditForm({
      description: item.matchedTransaction.description,
      value: String(item.matchedTransaction.value),
      due_date: item.matchedTransaction.due_date,
    });
  }

  async function updateTransactionFromReconciliation() {
    if (!itemToEditTransaction?.matchedTransaction) return;

    const transactionId = itemToEditTransaction.matchedTransaction.id;

    const { data: updatedTransaction, error } = await supabase
      .from("transactions")
      .update({
        description: editForm.description,
        value: Number(editForm.value),
        due_date: editForm.due_date,
      })
      .eq("id", transactionId)
      .select("id, description, due_date, value, type, status, category_id")
      .single();

    if (error || !updatedTransaction) {
      console.error("Erro ao corrigir lançamento:", error);
      alert("Erro ao corrigir lançamento.");
      return;
    }

    const newTransaction = updatedTransaction as Transaction;

    setTransactions((previousTransactions) =>
      previousTransactions.map((transaction) =>
        transaction.id === transactionId ? newTransaction : transaction
      )
    );

    setItems((previousItems) =>
      previousItems.map((currentItem) =>
        currentItem.matchedTransactionId === transactionId
          ? {
            ...currentItem,
            matchedTransaction: newTransaction,
          }
          : currentItem
      )
    );

    setItemToEditTransaction(null);
  }

  function getCandidateTransactions(item: ImportedItem) {
    const fullyReconciledTransactionIds = items
      .filter((currentItem) => {
        if (currentItem.matchedTransactionId === item.matchedTransactionId) {
          return false;
        }

        return isFullyReconciled(currentItem);
      })
      .map((currentItem) => currentItem.matchedTransactionId)
      .filter(Boolean);

    return transactions
      .filter(
        (transaction) =>
          !fullyReconciledTransactionIds.includes(transaction.id) ||
          transaction.id === item.matchedTransactionId
      )
      .map((transaction) => {
        const alreadyLinkedStatementTotal = items
          .filter(
            (currentItem) =>
              currentItem.matchedTransactionId === transaction.id &&
              currentItem.id !== item.id
          )
          .reduce((sum, currentItem) => sum + Number(currentItem.value), 0);

        const financeValue = getSignedTransactionValue(transaction);

        const remainingFinanceValue =
          financeValue - alreadyLinkedStatementTotal;

        const daysDifference = getDaysDifference(item.date, transaction.due_date);
        const valueDifference = Math.abs(remainingFinanceValue - item.value);

        return {
          ...transaction,
          daysDifference,
          valueDifference,
          remainingFinanceValue,
        };
      })
      .sort((a, b) => {
        if (a.valueDifference !== b.valueDifference) {
          return a.valueDifference - b.valueDifference;
        }

        return a.daysDifference - b.daysDifference;
      });
  }

  async function saveReconciliation(
    item: ImportedItem,
    transactionId: string | null,
    ignored = false
  ) {
    if (!item.id) {
      throw new Error("Item da fatura ainda não foi persistido.");
    }

    const { error: deleteLinksError } = await supabase
      .from("credit_card_statement_item_transactions")
      .delete()
      .eq("statement_item_id", item.id);

    if (deleteLinksError) {
      throw deleteLinksError;
    }

    if (ignored) {
      const { error: ignoreError } = await supabase
        .from("credit_card_statement_items")
        .update({
          status: "Ignorado",
          ignored_reason: "Ignorado manualmente",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (ignoreError) {
        throw ignoreError;
      }

      return;
    }

    if (!transactionId) {
      const { error: pendingError } = await supabase
        .from("credit_card_statement_items")
        .update({
          status: "Pendente",
          ignored_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (pendingError) {
        throw pendingError;
      }

      return;
    }

    const { error: insertLinkError } = await supabase
      .from("credit_card_statement_item_transactions")
      .insert({
        statement_item_id: item.id,
        transaction_id: transactionId,
      });

    if (insertLinkError) {
      throw insertLinkError;
    }

    const { error: updateItemError } = await supabase
      .from("credit_card_statement_items")
      .update({
        status: "Conciliado",
        ignored_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (updateItemError) {
      throw updateItemError;
    }
  }

  async function manuallyReconcile(item: ImportedItem, transactionId: string) {
    if (!selectedAccountId || !selectedCompetenceId) {
      alert("Selecione conta/cartão e competência.");
      return;
    }

    const selectedTransaction = transactions.find(
      (transaction) => transaction.id === transactionId
    );

    if (!selectedTransaction) {
      alert("Lançamento do Finance não encontrado.");
      return;
    }

    try {
      await saveReconciliation(item, transactionId);
    } catch (error) {
      console.error("Erro ao gravar conciliação:", error);
      alert("Erro ao gravar conciliação.");
      return;
    }

    setItems((previousItems) =>
      previousItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
            ...currentItem,
            status: "Conciliado",
            matched: true,
            matchedTransactionId: transactionId,
            matchedTransaction: selectedTransaction,
          }
          : currentItem
      )
    );

    setItemToReconcile(null);
  }

  async function correctAndReconcile(
    item: ImportedItem,
    transaction: Transaction
  ) {
    const correctedValue = Math.abs(Number(item.value));

    const { data: updatedTransaction, error } = await supabase
      .from("transactions")
      .update({
        value: correctedValue,
      })
      .eq("id", transaction.id)
      .select("id, description, due_date, value, type, status, category_id")
      .single();

    if (error || !updatedTransaction) {
      console.error("Erro ao corrigir lançamento:", error);
      alert("Erro ao corrigir lançamento.");
      return;
    }

    const newTransaction = updatedTransaction as Transaction;

    try {
      await saveReconciliation(item, newTransaction.id);
    } catch (reconciliationError) {
      console.error("Erro ao gravar conciliação:", reconciliationError);
      alert("Lançamento corrigido, mas erro ao conciliar.");
      return;
    }

    setTransactions((previousTransactions) =>
      previousTransactions.map((currentTransaction) =>
        currentTransaction.id === newTransaction.id
          ? newTransaction
          : currentTransaction
      )
    );

    setItems((previousItems) =>
      previousItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
            ...currentItem,
            status: "Conciliado",
            matched: true,
            matchedTransactionId: newTransaction.id,
            matchedTransaction: newTransaction,
          }
          : currentItem
      )
    );

    setItemToReconcile(null);
  }

  async function unlinkReconciliation(item: ImportedItem) {
    if (!item.id) return;

    try {
      await saveReconciliation(item, null);
    } catch (error) {
      console.error("Erro ao desfazer conciliação:", error);
      alert("Erro ao desfazer conciliação.");
      return;
    }

    setItems((previousItems) =>
      previousItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
            ...currentItem,
            status: "Pendente",
            matched: false,
            matchedTransactionId: undefined,
            matchedTransaction: undefined,
          }
          : currentItem
      )
    );
  }

  async function ignoreStatementItem(item: ImportedItem) {
    if (!item.id) return;

    try {
      await saveReconciliation(item, null, true);
    } catch (error) {
      console.error("Erro ao ignorar item:", error);
      alert("Erro ao ignorar item.");
      return;
    }

    setItems((previousItems) =>
      previousItems.filter((currentItem) => currentItem.id !== item.id)
    );
  }

  function resetImportedStatement() {
    setItems([]);
    setTransactions([]);
    setDetectedLayout(null);
    setFileName("");
    setSelectedFile(null);
    setViewMode("all");
    setShowOnlyUnmatched(true);
    setCandidateSearch("");
    setPaymentAccountId("");
    setPaymentDueDate("");
    setClosedStatement(null);
  }

  async function getOrCreateCompetenceByDate(date: string) {
    const baseDate = new Date(date + "T00:00:00");
    const month = baseDate.getMonth() + 1;
    const year = baseDate.getFullYear();
    const name = `${year}-${String(month).padStart(2, "0")}`;

    const existingCompetence = competences.find(
      (competence) => competence.month === month && competence.year === year
    );

    if (existingCompetence) {
      return existingCompetence.id;
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("competences")
      .insert({
        name,
        month,
        year,
        start_date: startDate,
        end_date: endDate,
        closed: false,
      })
      .select("id, name, month, year, start_date, end_date")
      .single();

    if (error || !data) {
      throw error ?? new Error("Erro ao criar competência do pagamento.");
    }

    setCompetences((previousCompetences) => [data, ...previousCompetences]);

    return data.id;
  }

  async function reopenStatement() {
    if (!closedStatement?.id) {
      alert("Nenhuma fatura fechada encontrada.");
      return;
    }

    const shouldDeletePayment = confirm(
      "Deseja reabrir esta fatura e excluir também o lançamento de Pagamento de Fatura?"
    );

    try {
      const paymentTransactionId = closedStatement.payment_transaction_id;

      const { error: statementError } = await supabase
        .from("credit_card_statements")
        .delete()
        .eq("id", closedStatement.id);

      if (statementError) {
        throw statementError;
      }

      if (shouldDeletePayment && paymentTransactionId) {
        const { error: paymentError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", paymentTransactionId);

        if (paymentError) {
          throw paymentError;
        }
      }

      setClosedStatement(null);

      await loadPersistedStatement(selectedAccountId, selectedCompetenceId);

      alert("Fatura reaberta com sucesso. As conciliações foram mantidas.");
    } catch (error) {
      console.error("Erro ao reabrir fatura:", error);
      alert("Erro ao reabrir fatura.");
    }
  }

  async function closeStatementAndCreatePayment() {
    if (isClosingStatementRef.current) return;

    isClosingStatementRef.current = true;
    setIsClosingStatement(true);

    await new Promise((resolve) => setTimeout(resolve, 50));

    if (!selectedAccountId || !selectedCompetenceId) {
      alert("Selecione cartão e competência.");
      return;
    }

    if (!paymentAccountId) {
      alert("Selecione a conta de pagamento.");
      return;
    }

    if (!paymentDueDate) {
      alert("Informe a data de pagamento.");
      return;
    }

    const hasPendingStatementItems = items.some(
      (item) => !item.matched || !isFullyReconciled(item)
    );

    if (hasPendingStatementItems || Math.abs(totalDifference) >= 0.01) {
      alert("A fatura só pode ser fechada quando todos os itens estiverem conciliados e a diferença estiver zerada.");
      return;
    }

    const itemsWithoutDatabaseLink = items.filter(
      (item) => !item.id || !item.matchedTransactionId || !item.matchedTransaction
    );

    if (itemsWithoutDatabaseLink.length > 0) {
      throw new Error(
        "Existem itens aparentemente pendentes ou sem vínculo salvo. Recarregue a conferência antes de fechar."
      );
    }

    for (const item of items) {
      await saveReconciliation(item, item.matchedTransactionId ?? null);
    }

    const statementTotal = Math.abs(totalImported);

    if (statementTotal <= 0) {
      alert("Valor da fatura inválido.");
      return;
    }

    setIsClosingStatement(true);

    try {
      const selectedCompetence = competences.find(
        (competence) => competence.id === selectedCompetenceId
      );

      const description = `Pagamento de fatura ${selectedAccount?.name ?? ""} - ${selectedCompetence?.name ?? ""
        }`;

      const paymentCompetenceId = await getOrCreateCompetenceByDate(paymentDueDate);

      const { data: existingStatement, error: existingStatementError } =
        await supabase
          .from("credit_card_statements")
          .select("id, payment_transaction_id")
          .eq("account_id", selectedAccountId)
          .eq("competence_id", selectedCompetenceId)
          .maybeSingle();

      if (existingStatementError) {
        throw existingStatementError;
      }

      let paymentTransactionId =
        existingStatement?.payment_transaction_id ??
        closedStatement?.payment_transaction_id ??
        null;

      if (paymentTransactionId) {
        const { error: updatePaymentError } = await supabase
          .from("transactions")
          .update({
            description,
            value: statementTotal,
            due_date: paymentDueDate,
            type: "Pagamento de Fatura",
            status: "Pendente",
            account_id: paymentAccountId,
            competence_id: paymentCompetenceId,
          })
          .eq("id", paymentTransactionId);

        if (updatePaymentError) {
          throw updatePaymentError;
        }
      } else {
        const { data: paymentTransaction, error: paymentError } = await supabase
          .from("transactions")
          .insert({
            description,
            value: statementTotal,
            due_date: paymentDueDate,
            type: "Pagamento de Fatura",
            mode: "unico",
            status: "Pendente",
            account_id: paymentAccountId,
            competence_id: paymentCompetenceId,
            category_id: null,
          })
          .select("id")
          .single();

        if (paymentError || !paymentTransaction) {
          throw paymentError;
        }

        paymentTransactionId = paymentTransaction.id;
      }

      const reconciledItemIds = items
        .filter((item) => item.id && item.matchedTransactionId && isFullyReconciled(item))
        .map((item) => item.id) as string[];

      if (reconciledItemIds.length !== items.length) {
        throw new Error(
          "Não foi possível confirmar todas as conciliações no banco. Recarregue a tela antes de fechar a fatura."
        );
      }

      const { error: confirmItemsError } = await supabase
        .from("credit_card_statement_items")
        .update({
          status: "Conciliado",
          ignored_reason: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", reconciledItemIds);

      if (confirmItemsError) {
        throw confirmItemsError;
      }

      const { data: savedStatement, error: statementError } = await supabase
        .from("credit_card_statements")
        .upsert(
          {
            account_id: selectedAccountId,
            competence_id: selectedCompetenceId,
            payment_account_id: paymentAccountId,
            payment_transaction_id: paymentTransactionId,
            statement_total: statementTotal,
            payment_due_date: paymentDueDate,
            status: "Fechada",
            closed_at: existingStatement ? undefined : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "account_id,competence_id",
          }
        )
        .select("id, payment_transaction_id")
        .single();

      if (statementError || !savedStatement) {
        throw statementError;
      }

      setClosedStatement(savedStatement);
      alert(
        existingStatement
          ? "Pagamento da fatura atualizado com sucesso."
          : "Fatura fechada e pagamento programado com sucesso."
      );
    } catch (error: any) {
      console.error("Erro ao fechar/atualizar fatura:", error);
      alert(error?.message ?? JSON.stringify(error, null, 2) ?? "Erro ao salvar fatura.");
    } finally {
      isClosingStatementRef.current = false;
      setIsClosingStatement(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Conciliação</h1>
          <p className="mt-1 text-sm text-slate-400">
            Importe a fatura do cartão e valide os lançamentos por data e valor.
          </p>
        </div>

        <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-6 md:grid-cols-2">
          <select
            value={selectedAccountId}
            onChange={(event) => {
              setSelectedAccountId(event.target.value);
              setItems([]);
              setTransactions([]);
              setDetectedLayout(null);
              setClosedStatement(null);
              setSelectedFile(null);
              setFileName("");
            }}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
          >
            <option value="">Selecione a conta/cartão</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.type}
              </option>
            ))}
          </select>

          <select
            value={selectedCompetenceId}
            onChange={(event) => {
              setSelectedCompetenceId(event.target.value);
              setItems([]);
              setTransactions([]);
              setDetectedLayout(null);
              setClosedStatement(null);
              setSelectedFile(null);
              setFileName("");
            }}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
          >
            <option value="">Selecione a competência</option>
            {competences.map((competence) => (
              <option key={competence.id} value={competence.id}>
                {competence.name}
              </option>
            ))}
          </select>

          <input
            type="file"
            accept=".xls,.xlsx"
            disabled={!selectedAccountId || !selectedCompetenceId || isProcessing}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                setSelectedFile(file);
                setFileName(file.name);
              }
            }}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300 outline-none file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={loadSelectedReconciliation}
            disabled={!selectedAccountId || !selectedCompetenceId || isProcessing}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
          >
            {isProcessing ? "Carregando..." : "Carregar conferência"}
          </button>
        </div>

        {detectedLayout && (
          <div className="grid gap-4 md:grid-cols-6">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="text-sm text-emerald-200">Layout</p>
              <p className="mt-2 text-xl font-bold text-white">Detectado</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <p className="text-sm text-slate-400">Arquivo</p>
              <p className="mt-2 truncate text-xl font-bold text-white">
                {fileName || "Conferência salva"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <p className="text-sm text-slate-400">Importados</p>
              <p className="mt-2 text-xl font-bold text-blue-300">
                {items.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {formatCurrency(totalImported)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="text-sm text-emerald-200">Conciliados</p>
              <p className="mt-2 text-xl font-bold text-emerald-300">
                {matchedItems.length}
              </p>
              <p className="mt-1 text-xs text-emerald-200">
                Fatura: {formatCurrency(totalMatched)}
              </p>
              <p className="mt-1 text-xs text-emerald-200">
                Finance: {formatCurrency(totalFinanceMatched)}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
              <p className="text-sm text-amber-200">Pendentes</p>
              <p className="mt-2 text-xl font-bold text-amber-300">
                {unmatchedItems.length}
              </p>
              <p className="mt-1 text-xs text-amber-200">
                {formatCurrency(totalUnmatched)}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-5">
              <p className="text-sm text-blue-200">Só no Finance</p>
              <p className="mt-2 text-xl font-bold text-blue-300">
                {financeOnlyTransactions.length}
              </p>
              <p className="mt-1 text-xs text-blue-200">
                {formatCurrency(totalFinanceOnly)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setViewMode("difference");
                setShowOnlyUnmatched(false);
              }}
              className={`rounded-2xl border p-5 text-left transition hover:scale-[1.01] hover:bg-white/5 ${Math.abs(totalDifference) < 0.01
                ? "border-emerald-400/20 bg-emerald-400/10"
                : "border-red-400/20 bg-red-400/10"
                }`}
            >
              <p
                className={`text-sm ${Math.abs(totalDifference) < 0.01 ? "text-emerald-200" : "text-red-200"
                  }`}
              >
                Diferença
              </p>

              <p
                className={`mt-2 text-xl font-bold ${Math.abs(totalDifference) < 0.01 ? "text-emerald-300" : "text-red-300"
                  }`}
              >
                {formatCurrency(totalDifference)}
              </p>
            </button>
          </div>
        )}

        {selectedAccount?.type === "Cartão" &&
          detectedLayout &&
          items.length > 0 &&
          !items.some((item) => !item.matched || !isFullyReconciled(item)) &&
          Math.abs(totalDifference) < 0.01 && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white">
                  Fechar fatura e programar pagamento
                </h2>
                <p className="mt-1 text-sm text-emerald-100">
                  A fatura está conciliada. Agora você pode gerar ou atualizar o pagamento.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <select
                  value={paymentAccountId}
                  onChange={(event) => setPaymentAccountId(event.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                >
                  <option value="">Conta de pagamento</option>
                  {accounts
                    .filter((account) => account.type === "Conta")
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>

                <input
                  type="date"
                  value={paymentDueDate}
                  onChange={(event) => setPaymentDueDate(event.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />

                <button
                  type="button"
                  disabled={isClosingStatement || isClosingStatementRef.current}
                  onClick={closeStatementAndCreatePayment}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isClosingStatement
                    ? "Salvando..."
                    : closedStatement
                      ? "Atualizar pagamento"
                      : "Fechar fatura"}
                </button>
                {closedStatement && (
                  <button
                    type="button"
                    onClick={reopenStatement}
                    className="rounded-xl border border-red-400/30 px-4 py-3 font-bold text-red-300 hover:bg-red-500/10"
                  >
                    Reabrir fatura
                  </button>
                )}
              </div>

              <p className="mt-3 text-sm text-emerald-100">
                Valor programado: {formatCurrency(Math.abs(totalImported))}
              </p>
            </div>
          )}

        {items.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div>
              <p className="font-semibold text-white">
                {selectedAccount?.name ?? "Conta/cartão"} ·{" "}
                {transactions.length} lançamentos no Finance Smart
              </p>
              <p className="text-sm text-slate-400">
                {viewMode === "difference"
                  ? "Exibindo apenas lançamentos com diferença entre fatura e Finance."
                  : "Comparação por valor exato e data com tolerância de até 3 dias."}
              </p>
            </div>
            <div className="flex gap-2">

              <button
                type="button"
                onClick={() => {
                  if (selectedFile) {
                    handleFileUpload(selectedFile);
                    return;
                  }

                  if (!selectedAccountId || !selectedCompetenceId) {
                    alert("Selecione conta/cartão e competência.");
                    return;
                  }

                  loadPersistedStatement(selectedAccountId, selectedCompetenceId).catch((error) => {
                    console.error("Erro ao recarregar conferência:", error);
                    alert("Erro ao recarregar conferência.");
                  });
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Recarregar
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Deseja realmente desfazer TODAS as conciliações desta competência?")) {
                    return;
                  }

                  const statementItemIds = items
                    .map((item) => item.id)
                    .filter(Boolean) as string[];

                  if (statementItemIds.length === 0) {
                    return;
                  }

                  const { error: deleteLinksError } = await supabase
                    .from("credit_card_statement_item_transactions")
                    .delete()
                    .in("statement_item_id", statementItemIds);

                  if (deleteLinksError) {
                    alert("Erro ao desfazer as conciliações.");
                    return;
                  }

                  const { error } = await supabase
                    .from("credit_card_statement_items")
                    .update({
                      status: "Pendente",
                      ignored_reason: null,
                      updated_at: new Date().toISOString(),
                    })
                    .in("id", statementItemIds);

                  if (error) {
                    alert("Erro ao desfazer as conciliações.");
                    return;
                  }

                  setItems((items) =>
                    items.map((item) => ({
                      ...item,
                      status: "Pendente",
                      matched: false,
                      matchedTransactionId: undefined,
                      matchedTransaction: undefined,
                    }))
                  );

                  alert("Conciliações removidas com sucesso.");
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Desvincular tudo
              </button>

              <button
                onClick={() => {
                  if (viewMode === "difference") {
                    setViewMode("all");
                    setShowOnlyUnmatched(false);
                    return;
                  }

                  setShowOnlyUnmatched(!showOnlyUnmatched);
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                {viewMode === "difference"
                  ? "Mostrar todos"
                  : showOnlyUnmatched
                    ? "Mostrar todos"
                    : "Mostrar só pendentes"}
              </button>

            </div>

          </div>
        )}

        <div className="max-h-[calc(100vh-390px)] overflow-auto rounded-2xl border border-white/10 bg-slate-950/60">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
              <tr>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Data</th>
                <th className="px-5 py-4">Descrição da fatura</th>
                <th className="px-5 py-4 text-right">Valor Fatura</th>
                <th className="px-5 py-4">Descrição Finance</th>
                <th className="px-5 py-4 text-right">Valor Finance</th>
                <th className="px-5 py-4 text-right">Diferença</th>
                <th className="px-5 py-4 text-right">Ação</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {viewMode === "difference" ? (
                financeDifferenceTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-300">
                        Diferença
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {new Date(transaction.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>

                    <td className="px-5 py-4 text-slate-500">Não encontrado na fatura</td>

                    <td className="px-5 py-4 text-right text-slate-500">
                      {formatCurrency(transaction.statementTotal)}
                    </td>

                    <td className="px-5 py-4 text-white">
                      {transaction.description}
                    </td>

                    <td className="px-5 py-4 text-right text-slate-300">
                      {formatCurrency(transaction.financeValue)}
                    </td>

                    <td className="px-5 py-4 text-right text-red-300">
                      {formatCurrency(transaction.difference)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <span className="text-xs text-slate-500">—</span>
                    </td>
                  </tr>
                ))
              ) : (
                visibleItems.map((item, index) => (
                  <tr key={item.id ?? `${item.date}-${item.description}-${index}`}>
                    <td className="px-5 py-4">
                      {item.status === "Conciliado" && isFullyReconciled(item) ? (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                          Conciliado
                        </span>
                      ) : item.matched ? (
                        <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
                          Parcial
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                          Pendente
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {new Date(item.date + "T00:00:00").toLocaleDateString(
                        "pt-BR"
                      )}
                    </td>

                    <td className="px-5 py-4 text-white">{item.description}</td>

                    <td className="px-5 py-4 text-right text-slate-300">
                      {formatCurrency(item.value)}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {item.matchedTransaction?.description ?? "-"}
                    </td>

                    <td className="px-5 py-4 text-right text-slate-300">
                      {item.matchedTransaction
                        ? formatCurrency(getSignedTransactionValue(item.matchedTransaction))
                        : "-"}
                    </td>

                    <td className="px-5 py-4 text-right text-slate-300">
                      {item.matchedTransaction
                        ? formatCurrency(getFinanceGroupDifference(item) ?? 0)
                        : "-"}
                    </td>

                    <td className="px-5 py-4 text-right">
                      {!item.matched ? (
                        <>
                          <button
                            onClick={() => setItemToReconcile(item)}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                          >
                            Conciliar
                          </button>

                          <button
                            onClick={() => openCreateTransactionDrawer(item)}
                            className="ml-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            Criar
                          </button>

                          <button
                            onClick={() => ignoreStatementItem(item)}
                            className="ml-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                          >
                            Ignorar
                          </button>
                        </>
                      ) : !isFullyReconciled(item) ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditTransactionDrawer(item)}
                            className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                          >
                            Corrigir
                          </button>

                          <button
                            onClick={() => unlinkReconciliation(item)}
                            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                          >
                            Desvincular
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => unlinkReconciliation(item)}
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                        >
                          Desvincular
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}

              {isProcessing && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                    Processando fatura...
                  </td>
                </tr>
              )}

              {!isProcessing && visibleItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                    Selecione um cartão e importe uma fatura Excel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {
        financeOnlyTransactions.length > 0 && (
          <div className="rounded-2xl border border-blue-400/20 bg-slate-950/60 p-5">
            <h2 className="mb-4 text-lg font-bold text-white">
              Lançamentos no Finance que não apareceram na fatura
            </h2>

            <div className="overflow-auto">
              <table className="min-w-[800px] w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {financeOnlyTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="px-4 py-3 text-slate-300">
                        {new Date(transaction.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>

                      <td className="px-4 py-3 text-white">
                        {transaction.description}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatCurrency(
                          Number.isFinite(Number(transaction.signedValue))
                            ? Number(transaction.signedValue)
                            : getSignedTransactionValue(transaction)
                        )}
                      </td>

                      <td className="px-4 py-3 text-blue-300">
                        Não vinculado à fatura
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      {
        itemToReconcile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Conciliar lançamento
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Fatura: {new Date(itemToReconcile.date + "T00:00:00").toLocaleDateString("pt-BR")} ·{" "}
                    {itemToReconcile.description} · {formatCurrency(itemToReconcile.value)}
                  </p>
                </div>

                <button
                  onClick={() => setItemToReconcile(null)}
                  className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  Fechar
                </button>
              </div>

              <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10">
                <input
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="Filtrar lançamentos por descrição..."
                  className="mb-4 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={() => openCreateTransactionDrawer(itemToReconcile)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                  >
                    Criar lançamento
                  </button>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Descrição no Finance Smart</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-right">Diferença</th>
                      <th className="px-4 py-3 text-right">Ação</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/10">
                    {getCandidateTransactions(itemToReconcile)
                      .filter((transaction) =>
                        transaction.description
                          .toLowerCase()
                          .includes(candidateSearch.toLowerCase())
                      )
                      .map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-white/[0.03]">
                          <td className="px-4 py-3 text-slate-300">
                            {new Date(transaction.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                          </td>

                          <td className="px-4 py-3 text-white">
                            {transaction.description}
                          </td>

                          <td className="px-4 py-3 text-right text-slate-300">
                            {formatCurrency(transaction.remainingFinanceValue ?? transaction.value)}
                          </td>

                          <td className="px-4 py-3 text-right text-slate-400">
                            {transaction.daysDifference} dia(s) · {formatCurrency(transaction.valueDifference)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() =>
                                  manuallyReconcile(itemToReconcile, transaction.id)
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                              >
                                Usar este
                              </button>

                              <button
                                onClick={() =>
                                  correctAndReconcile(itemToReconcile, transaction)
                                }
                                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                              >
                                Corrigir e usar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                    {getCandidateTransactions(itemToReconcile).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          Nenhum lançamento encontrado para este cartão.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      }

      {
        itemToEditTransaction && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/70">
            <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Corrigir lançamento
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Ajuste o lançamento vinculado à fatura.
                  </p>
                </div>

                <button
                  onClick={() => setItemToEditTransaction(null)}
                  className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-4">
                <input
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm({ ...editForm, description: event.target.value })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />

                <input
                  type="number"
                  value={editForm.value}
                  onChange={(event) =>
                    setEditForm({ ...editForm, value: event.target.value })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />

                <input
                  type="date"
                  value={editForm.due_date}
                  onChange={(event) =>
                    setEditForm({ ...editForm, due_date: event.target.value })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />

                <button
                  onClick={updateTransactionFromReconciliation}
                  className="w-full rounded-xl bg-amber-600 px-4 py-3 font-bold text-white hover:bg-amber-500"
                >
                  Salvar correção
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        itemToCreateTransaction && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/70">
            <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Criar lançamento
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    A partir da conciliação da fatura.
                  </p>
                </div>

                <button
                  onClick={() => setItemToCreateTransaction(null)}
                  className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-4">
                <input
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, description: event.target.value })
                  }
                  placeholder="Descrição"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />

                <input
                  type="number"
                  value={createForm.value}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, value: event.target.value })
                  }
                  placeholder="Valor"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />

                <input
                  type="date"
                  value={createForm.due_date}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, due_date: event.target.value })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />

                <select
                  value={createForm.type}
                  onChange={(event) => {
                    const nextType = event.target.value;

                    setCreateForm({
                      ...createForm,
                      type: nextType,
                      status: nextType === "Receita" ? "Recebido" : "Pago",
                      category_id: "",
                    });
                  }}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                >
                  <option value="Despesa">Despesa</option>
                  <option value="Receita">Crédito da fatura</option>
                </select>

                <select
                  value={createForm.category_id}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, category_id: event.target.value })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                >
                  <option value="">Selecione a categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={createTransactionFromImportedItem}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-500"
                >
                  Criar e conciliar
                </button>
              </div>
            </div>
          </div>
        )
      }
      {isClosingStatement && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
          <div className="rounded-2xl border border-emerald-400/20 bg-slate-950 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-400/30 border-t-emerald-300" />

            <h2 className="text-lg font-bold text-white">
              Fechando fatura...
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Gerando pagamento e salvando a conferência.
            </p>
          </div>
        </div>
      )}
      {showLayoutMapping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-white">
                Configurar modelo de importação
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Primeiro escolha qual linha da planilha contém os nomes das colunas.
              </p>
            </div>

            {selectedHeaderRowIndex === null ? (
              <div className="space-y-3">
                {headerRowCandidates.map((candidate) => (
                  <div
                    key={candidate.rowIndex}
                    className="rounded-xl border border-white/10 bg-slate-900/70 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-300">
                        Linha candidata {candidate.rowIndex + 1}
                      </p>

                      <button
                        type="button"
                        onClick={() => chooseHeaderRow(pendingLayoutRows, candidate.rowIndex)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500"
                      >
                        Usar esta linha
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {candidate.cells.map((cell, index) => (
                        <span
                          key={`${candidate.rowIndex}-${index}`}
                          className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                        >
                          {cell}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <p className="text-sm text-emerald-200">
                    Cabeçalho selecionado
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {layoutHeaders.map((header) => (
                      <span
                        key={header.value}
                        className="rounded-lg border border-emerald-400/20 bg-slate-950 px-3 py-2 text-sm text-white"
                      >
                        {header.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["Data Finance", "date_header"],
                    ["Descrição Finance", "description_header"],
                    ["Valor Finance", "value_header"],
                    ["Parcela opcional", "installment_header"],
                  ].map(([label, field]) => (
                    <label key={field} className="space-y-2">
                      <span className="text-sm text-slate-300">{label}</span>
                      <select
                        value={layoutForm[field as keyof typeof layoutForm]}
                        onChange={(event) =>
                          setLayoutForm((previous) => ({
                            ...previous,
                            [field]: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                      >
                        <option value="">
                          {field === "installment_header"
                            ? "Não usar"
                            : "Selecione a coluna"}
                        </option>

                        {layoutHeaders.map((header) => (
                          <option key={header.value} value={header.value}>
                            {header.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}

                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm text-slate-300">Sinal do valor</span>
                    <select
                      value={layoutForm.amount_sign}
                      onChange={(event) =>
                        setLayoutForm((previous) => ({
                          ...previous,
                          amount_sign: event.target.value as
                            | "auto"
                            | "positive"
                            | "negative",
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                    >
                      <option value="auto">Automático</option>
                      <option value="positive">Sempre positivo</option>
                      <option value="negative">Sempre negativo</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            <div className="mt-6 flex justify-end gap-3">
              {selectedHeaderRowIndex !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHeaderRowIndex(null);
                    setLayoutHeaders([]);
                  }}
                  className="rounded-xl border border-white/10 px-4 py-3 font-bold text-slate-300 hover:bg-white/5"
                >
                  Voltar
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowLayoutMapping(false)}
                className="rounded-xl border border-white/10 px-4 py-3 font-bold text-slate-300 hover:bg-white/5"
              >
                Cancelar
              </button>

              {selectedHeaderRowIndex !== null && (
                <button
                  type="button"
                  onClick={saveImportLayout}
                  className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-500"
                >
                  Salvar modelo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell >
  );
}