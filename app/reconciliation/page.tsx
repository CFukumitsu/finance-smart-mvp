"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
};

type ImportedItem = {
  importKey: string;
  date: string;
  description: string;
  value: number;
  matched: boolean;
  matchedTransactionId?: string;
  matchedTransaction?: Transaction;
};

type Transaction = {
  id: string;
  description: string;
  due_date: string;
  value: number;
  type?: string;
  status?: string;
  category_id?: string;
};

type Category = {
  id: string;
  name: string;
  type: string | null;
  active?: boolean | null;
};

type DetectedLayout = {
  headerRowIndex: number;
  dateColumnIndex: number;
  descriptionColumnIndex: number;
  valueColumnIndex: number;
  signature: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDate(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(
      parsed.d
    ).padStart(2, "0")}`;
  }

  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return "";
}

function parseValue(value: unknown) {
  if (typeof value === "number") return value;

  const text = String(value ?? "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();

  return Number(text || 0);
}

function formatCurrency(value: number) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
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
        signature: row.filter(Boolean).join("|"),
      };
    }
  }

  return null;
}

function extractItems(rows: unknown[][], layout: DetectedLayout) {
  return rows
    .slice(layout.headerRowIndex + 1)
    .map((row, index) => ({
      importKey: `${layout.headerRowIndex + 1 + index}`,
      date: parseDate(row[layout.dateColumnIndex]),
      description: String(row[layout.descriptionColumnIndex] ?? "").trim(),
      value: parseValue(row[layout.valueColumnIndex]),
      matched: false,
    }))
    .filter((item) => item.date && item.description && item.value > 0);
}

function getDaysDifference(dateA: string, dateB: string) {
  return (
    Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime()) /
    (1000 * 60 * 60 * 24)
  );
}

function findMatchingTransaction(
  importedItem: ImportedItem,
  transactions: Transaction[]
) {
  return transactions.find((transaction) => {
    const sameValue =
      Math.abs(Number(transaction.value) - importedItem.value) < 0.01;

    const closeDate =
      getDaysDifference(importedItem.date, transaction.due_date) <= 3;

    return sameValue && closeDate;
  });
}

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [competences, setCompetences] = useState<
    { id: string; name: string; month: number; year: number }[]
  >([]);
  const [selectedCompetenceId, setSelectedCompetenceId] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [fileName, setFileName] = useState("");
  const [detectedLayout, setDetectedLayout] = useState<DetectedLayout | null>(
    null
  );
  const [items, setItems] = useState<ImportedItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemToReconcile, setItemToReconcile] = useState<ImportedItem | null>(null);
  const [itemToCreateTransaction, setItemToCreateTransaction] =
    useState<ImportedItem | null>(null);
  const [itemToEditTransaction, setItemToEditTransaction] =
    useState<ImportedItem | null>(null);

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

    const financeTotal = Number(item.matchedTransaction.value);

    return statementTotal - financeTotal;
  }

  function isFullyReconciled(item: ImportedItem) {
    const groupDifference = getFinanceGroupDifference(item);

    if (groupDifference === null) {
      return false;
    }

    return Math.abs(groupDifference) < 0.01;
  }

  const matchedItems = items.filter((item) => item.matched);
  const unresolvedItems = items.filter((item) => !isFullyReconciled(item));
  const visibleItems = showOnlyUnmatched ? unresolvedItems : items;

  const totalImported = items.reduce((sum, item) => sum + item.value, 0);
  const totalMatched = matchedItems.reduce((sum, item) => sum + item.value, 0);
  const unmatchedItems = unresolvedItems;
  const totalUnmatched = unmatchedItems.reduce((sum, item) => sum + item.value, 0);
  const totalFinanceMatched = matchedItems.reduce(
    (sum, item) => sum + Number(item.matchedTransaction?.value ?? 0),
    0
  );

  const totalDifference = totalMatched - totalFinanceMatched;

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
        .select("id, name, type")
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
        .select("id, name, month, year")
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
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        blankrows: false,
      });

      const layout = detectLayout(rows);

      if (!layout) {
        alert(
          "Não consegui identificar automaticamente as colunas de data, lançamento e valor."
        );
        return;
      }

      const extractedItems = extractItems(rows, layout);
      const accountTransactions = await loadTransactions(
        selectedAccountId,
        selectedCompetenceId
      );

      const { data: savedReconciliations, error: savedReconciliationsError } =
        await supabase
          .from("transaction_reconciliations")
          .select("import_key, transaction_id")
          .eq("account_id", selectedAccountId)
          .eq("competence_id", selectedCompetenceId);

      if (savedReconciliationsError) {
        throw new Error("Erro ao carregar conciliações salvas.");
      }

      const reconciledItems = extractedItems.map((item) => {
        const savedReconciliation = savedReconciliations?.find(
          (reconciliation) => reconciliation.import_key === item.importKey
        );

        const savedTransaction = savedReconciliation
          ? accountTransactions.find(
            (transaction) => transaction.id === savedReconciliation.transaction_id
          )
          : undefined;

        const automaticMatch = savedTransaction
          ? undefined
          : findMatchingTransaction(item, accountTransactions);

        const match = savedTransaction ?? automaticMatch;

        return {
          ...item,
          matched: !!match,
          matchedTransactionId: match?.id,
          matchedTransaction: match,
        };
      });

      setDetectedLayout(layout);
      setTransactions(accountTransactions);
      setItems(reconciledItems);
      setShowOnlyUnmatched(false);
    } catch (error) {
      console.error("Erro ao processar fatura:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao processar fatura."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function openCreateTransactionDrawer(item: ImportedItem) {
    setItemToCreateTransaction(item);

    setCreateForm({
      description: item.description,
      value: String(item.value),
      due_date: item.date,
      type: "Despesa",
      status: "Pago",
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
      .select("id, description, due_date, value")
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

    const { error: reconciliationError } = await supabase
      .from("transaction_reconciliations")
      .upsert(
        {
          account_id: selectedAccountId,
          competence_id: selectedCompetenceId,
          import_key: itemToCreateTransaction.importKey,
          statement_date: itemToCreateTransaction.date,
          statement_description: itemToCreateTransaction.description,
          statement_value: itemToCreateTransaction.value,
          transaction_id: newTransaction.id,
        },
        {
          onConflict: "account_id,competence_id,import_key,transaction_id",
        }
      );

    if (reconciliationError) {
      console.error("Erro ao gravar conciliação:", reconciliationError);
      alert("Lançamento criado, mas erro ao gravar conciliação.");
      return;
    }

    setItems((previousItems) =>
      previousItems.map((currentItem) =>
        currentItem.importKey === itemToCreateTransaction.importKey
          ? {
            ...currentItem,
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
      .filter((currentItem) => isFullyReconciled(currentItem))
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
              currentItem.importKey !== item.importKey
          )
          .reduce((sum, currentItem) => sum + Number(currentItem.value), 0);

        const remainingFinanceValue =
          Number(transaction.value) - alreadyLinkedStatementTotal;

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

    const { error } = await supabase.from("transaction_reconciliations").upsert(
      {
        account_id: selectedAccountId,
        competence_id: selectedCompetenceId,
        import_key: item.importKey,
        statement_date: item.date,
        statement_description: item.description,
        statement_value: item.value,
        transaction_id: transactionId,
      },
      {
        onConflict: "account_id,competence_id,import_key,transaction_id",
      }
    );

    if (error) {
      console.error("Erro ao gravar conciliação:", error);
      alert("Erro ao gravar conciliação.");
      return;
    }

    setItems((previousItems) =>
      previousItems.map((currentItem) =>
        currentItem.importKey === item.importKey
          ? {
            ...currentItem,
            matched: true,
            matchedTransactionId: transactionId,
            matchedTransaction: selectedTransaction,
          }
          : currentItem
      )
    );

    setItemToReconcile(null);
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
              setDetectedLayout(null);
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
              setDetectedLayout(null);
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
            disabled={!selectedAccountId || isProcessing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300 outline-none file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {detectedLayout && (
          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="text-sm text-emerald-200">Layout</p>
              <p className="mt-2 text-xl font-bold text-white">Detectado</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <p className="text-sm text-slate-400">Arquivo</p>
              <p className="mt-2 truncate text-xl font-bold text-white">
                {fileName}
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
            <div
              className={`rounded-2xl border p-5 ${Math.abs(totalDifference) < 0.01
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
            </div>
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
                Comparação por valor exato e data com tolerância de até 3 dias.
              </p>
            </div>

            <button
              onClick={() => setShowOnlyUnmatched(!showOnlyUnmatched)}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              {showOnlyUnmatched
                ? "Mostrar todos"
                : "Mostrar só pendentes"}
            </button>
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
              {visibleItems.map((item, index) => (
                <tr key={`${item.date}-${item.description}-${index}`}>
                  <td className="px-5 py-4">
                    {isFullyReconciled(item) ? (
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
                      ? formatCurrency(Number(item.matchedTransaction.value))
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
                      </>
                    ) : !isFullyReconciled(item) ? (
                      <button
                        onClick={() => openEditTransactionDrawer(item)}
                        className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                      >
                        Corrigir
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {isProcessing && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                    Processando fatura...
                  </td>
                </tr>
              )}

              {!isProcessing && visibleItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                    Selecione um cartão e importe uma fatura Excel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {itemToReconcile && (
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
                          <button
                            onClick={() =>
                              manuallyReconcile(itemToReconcile, transaction.id)
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            Usar este
                          </button>
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
      )}

      {itemToEditTransaction && (
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
      )}

      {itemToCreateTransaction && (
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
                <option value="Receita">Receita</option>
              </select>

              <select
                value={createForm.category_id}
                onChange={(event) =>
                  setCreateForm({ ...createForm, category_id: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="">Selecione a categoria</option>
                {categories
                  .filter((category) => category.type === createForm.type)
                  .map((category) => (
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
      )}
    </AppShell>
  );
}