"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import { deleteTransaction as deleteTransactionService } from "@/src/services/transactionService";
import { ensureCompetenceIsOpen } from "@/src/utils/competenceLock";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  closing_day: number | null;
  due_day: number | null;
  limit_amount: number | null;
  current_balance: number | null;
};

type Category = {
  id: string;
  name: string;
  type: string | null;
};

type Competence = {
  id: string;
  month: number;
  year: number;
  name: string;
  status: string;
};

type Transaction = {
  id: string;
  description: string;
  due_date: string;
  created_at: string | null;
  type: string;
  mode: string | null;
  value: number;
  status: string | null;
  account_id: string;
  category_id: string;
  competence_id: string;
  account: { name: string } | null;
  category: { name: string } | null;
  competence: { name: string } | null;
  origin_account_id?: string | null;
  destination_account_id?: string | null;
};

function TransactionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [closedCompetenceIds, setClosedCompetenceIds] = useState<string[]>([]);
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [competenceFilter, setCompetenceFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [listMode, setListMode] = useState<"competence" | "latest">("latest");
  const [isCompetencePickerOpen, setIsCompetencePickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const [form, setForm] = useState({
    description: "",
    value: "",
    due_date: new Date().toISOString().split("T")[0],
    type: "Despesa",
    mode: "unico",
    status: "Pago",
    installments: "2",
    account_id: "",
    card_payment_account_id: "",
    origin_account_id: "",
    destination_account_id: "",
    category_id: "",
    competence_id: "",
  });

  function getCurrentCompetenceId(list: Competence[]) {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const currentCompetence = list.find(
      (competence) =>
        competence.month === currentMonth && competence.year === currentYear
    );

    return currentCompetence?.id ?? list[0]?.id ?? "";
  }

  async function loadClosedCompetences() {
    const { data, error } = await supabase
      .from("competence_closures")
      .select("competence_id")
      .eq("status", "Fechada");

    if (error) {
      console.error("Erro ao carregar competências fechadas:", error);
      setClosedCompetenceIds([]);
      return;
    }

    setClosedCompetenceIds((data ?? []).map((item) => item.competence_id));
  }

  function isTransactionLocked(transaction: Transaction) {
    return closedCompetenceIds.includes(transaction.competence_id);
  }

  function onlyDigits(value: string) {
    return value.replace(/\D/g, "");
  }

  function formatCurrencyFromNumber(value: number) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatCurrencyInput(value: string) {
    const digits = onlyDigits(value);

    if (!digits) {
      return "";
    }

    const numericValue = Number(digits) / 100;

    return numericValue.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function parseCurrencyInput(value: string) {
    const digits = onlyDigits(value);

    if (!digits) {
      return 0;
    }

    return Number(digits) / 100;
  }

  function addMonths(date: string, months: number) {
    const result = new Date(date + "T00:00:00");
    result.setMonth(result.getMonth() + months);
    return result.toISOString().split("T")[0];
  }

  function getCompetenceIdByDate(date: string) {
    const transactionDate = new Date(date + "T00:00:00");
    const month = transactionDate.getMonth() + 1;
    const year = transactionDate.getFullYear();

    return (
      competences.find(
        (competence) => competence.month === month && competence.year === year
      )?.id ?? form.competence_id
    );
  }

  async function loadDescriptionSuggestions() {
    const { data, error } = await supabase
      .from("transactions")
      .select("description, created_at")
      .eq("type", "Despesa")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Erro ao carregar sugestões de despesas:", error);
      setDescriptionSuggestions([]);
      return;
    }

    const uniqueSuggestions = Array.from(
      new Set(
        (data ?? [])
          .map((item) => item.description?.trim())
          .filter(Boolean)
      )
    ).slice(0, 80) as string[];

    setDescriptionSuggestions(uniqueSuggestions);
  }

  async function loadTransactions(filters?: {
    competenceId?: string;
    accountId?: string;
    type?: string;
    status?: string;
    search?: string;
    listMode?: "competence" | "latest";
  }) {
    setIsLoading(true);

    let query = supabase
      .from("transactions")
      .select(`
        id,
        description,
        due_date,
        created_at,
        type,
        mode,
        value,
        status,
        account_id,
        category_id,
        competence_id,
        origin_account_id,
        destination_account_id,
        account:accounts!transactions_account_id_fkey(name),
        category:categories!transactions_category_id_fkey(name),
        competence:competences!transactions_competence_id_fkey(name)
      `)

    if (filters?.listMode === "latest") {
      query = query
        .order("created_at", { ascending: false })
        .order("due_date", { ascending: false })
        .limit(20);
    } else {
      query = query.order("due_date", { ascending: false });
    }

    if (filters?.competenceId && filters?.listMode !== "latest") {
      query = query.eq("competence_id", filters.competenceId);
    }

    if (filters?.accountId) {
      query = query.eq("account_id", filters.accountId);
    }

    if (filters?.type) {
      query = query.eq("type", filters.type);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.search) {
      query = query.ilike("description", `%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Erro ao carregar lançamentos:", error);
      alert("Erro ao carregar lançamentos.");
      setIsLoading(false);
      return;
    }

    const rawTransactions = (data ?? []) as unknown as Transaction[];

    if (filters?.listMode === "latest") {
      setTransactions(rawTransactions);
    } else {
      const sortedTransactions = [...rawTransactions].sort((a, b) => {
        function getSortOrder(transaction: Transaction) {
          if (transaction.type === "Receita") {
            return 1;
          }

          if (
            transaction.type === "Transferência" &&
            filters?.accountId &&
            transaction.destination_account_id === filters.accountId
          ) {
            return 1;
          }

          if (transaction.type === "Despesa") {
            return 2;
          }

          if (
            transaction.type === "Transferência" &&
            filters?.accountId &&
            transaction.origin_account_id === filters.accountId
          ) {
            return 2;
          }

          return 3;
        }

        const typeDiff = getSortOrder(a) - getSortOrder(b);

        if (typeDiff !== 0) {
          return typeDiff;
        }

        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });

      setTransactions(sortedTransactions);
    }

    setIsLoading(false);
  }

  async function loadReferenceData() {
    setIsLoading(true);

    const [accountsResponse, categoriesResponse, competencesResponse] =
      await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, closing_day, due_day, limit_amount, current_balance")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name, type")
          .eq("active", true)
          .order("type", { ascending: false })
          .order("name", { ascending: true }),
        supabase
          .from("competences")
          .select("id, month, year, name, status")
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
      ]);

    if (accountsResponse.data) setAccounts(accountsResponse.data);
    if (categoriesResponse.data) setCategories(categoriesResponse.data);

    await loadClosedCompetences();
    await loadDescriptionSuggestions();

    if (competencesResponse.data) {
      setCompetences(competencesResponse.data);

      const defaultCompetenceId = getCurrentCompetenceId(competencesResponse.data);

      setCompetenceFilter(defaultCompetenceId);

      setForm((previousForm) => ({
        ...previousForm,
        competence_id: defaultCompetenceId,
        due_date: new Date().toISOString().split("T")[0],
      }));

      await loadTransactions({
        competenceId: defaultCompetenceId,
        accountId: "",
        type: "",
        status: "",
        search: "",
        listMode: "latest",
      });
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setIsDrawerOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!competenceFilter) return;

    loadTransactions({
      competenceId: competenceFilter,
      accountId: accountFilter,
      type: typeFilter,
      status: statusFilter,
      search: searchTerm,
      listMode,
    });
  }, [competenceFilter, accountFilter, typeFilter, statusFilter, listMode]);

  function resetForm() {
    const defaultCompetenceId =
      competenceFilter || getCurrentCompetenceId(competences);

    setEditingTransactionId(null);

    setForm({
      description: "",
      value: "",
      due_date: new Date().toISOString().split("T")[0],
      type: "Despesa",
      mode: "unico",
      status: "Pago",
      installments: "2",
      account_id: "",
      card_payment_account_id: "",
      origin_account_id: "",
      destination_account_id: "",
      category_id: "",
      competence_id: getCompetenceIdByDate(new Date().toISOString().split("T")[0]),
    });
  }

  function closeDrawer() {
    resetForm();
    setIsDrawerOpen(false);
    router.replace("/transactions");
  }

  function openEditDrawer(transaction: Transaction) {
    setEditingTransactionId(transaction.id);

    setForm({
      description: transaction.description ?? "",
      value: formatCurrencyFromNumber(Number(transaction.value ?? 0)),
      due_date: transaction.due_date ?? new Date().toISOString().split("T")[0],
      type: transaction.type ?? "Despesa",
      mode: transaction.mode ?? "unico",
      status: transaction.status ?? "Pago",
      installments: "2",
      account_id: transaction.account_id ?? "",
      card_payment_account_id: (transaction as any).card_payment_account_id ?? "",
      origin_account_id: transaction.origin_account_id ?? "",
      destination_account_id: transaction.destination_account_id ?? "",
      category_id: transaction.category_id ?? "",
      competence_id: transaction.competence_id ?? "",
    });

    setIsDrawerOpen(true);
  }

  async function saveTransaction() {
    const numericValue = parseCurrencyInput(form.value);
    const installmentCount = Number(form.installments);

    if (
      !form.description ||
      numericValue <= 0 ||
      !form.due_date ||
      !form.competence_id ||
      (
        form.type === "Transferência" &&
        (!form.account_id ||
          !form.destination_account_id ||
          form.account_id === form.destination_account_id)
      ) ||
      (
        form.type !== "Transferência" &&
        !form.account_id
      ) ||
      (
        form.type !== "Transferência" &&
        form.type !== "Pagamento de Fatura" &&
        !form.category_id
      )
    ) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    if (form.mode === "parcelado" && (!installmentCount || installmentCount < 2)) {
      alert("Informe uma quantidade de parcelas maior que 1.");
      return;
    }

    try {
      if (form.type === "Transferência" && !editingTransactionId) {
        const originAccount = accounts.find(
          (account) => account.id === form.account_id
        );

        const destinationAccount = accounts.find(
          (account) => account.id === form.destination_account_id
        );

        const transferTransactions = [
          {
            description: form.description || `Transferência para ${destinationAccount?.name ?? "conta destino"}`,
            value: numericValue,
            due_date: form.due_date,
            type: "Transferência",
            mode: "unico",
            status: "Pago",
            account_id: form.account_id,
            category_id: null,
            competence_id: form.competence_id,
            origin_account_id: form.origin_account_id,
            destination_account_id: form.destination_account_id,
          },
          {
            description: form.description || `Transferência recebida de ${originAccount?.name ?? "conta origem"}`,
            value: numericValue,
            due_date: form.due_date,
            type: "Transferência",
            mode: "unico",
            status: "Recebido",
            account_id: form.destination_account_id,
            category_id: null,
            competence_id: form.competence_id,
            origin_account_id: form.account_id,
            destination_account_id: form.destination_account_id,
          },
        ];

        for (const transaction of transferTransactions) {
          const lock = await ensureCompetenceIsOpen(transaction.competence_id);

          if (!lock.allowed) {
            alert(lock.message);
            return;
          }
        }

        const { error } = await supabase
          .from("transactions")
          .insert(transferTransactions);

        if (error) {
          throw new Error(error.message);
        }

        closeDrawer();
        await loadDescriptionSuggestions();

        await loadTransactions({
          competenceId: competenceFilter,
          accountId: accountFilter,
          type: typeFilter,
          status: statusFilter,
          search: searchTerm,
          listMode,
        });

        return;
      }

      const transactionsToSave = form.mode === "parcelado" && !editingTransactionId
        ? Array.from({ length: installmentCount }, (_, index) => {
          const dueDate = addMonths(form.due_date, index);
          const competenceId = getCompetenceIdByDate(dueDate);

          return {
            description: `${form.description} ${index + 1}/${installmentCount}`,
            value: Number((numericValue / installmentCount).toFixed(2)),
            due_date: dueDate,
            type: form.type,
            mode: form.mode,
            status: form.status,
            account_id: form.account_id,
            category_id: form.category_id,
            competence_id: competenceId,
            parcel_number: index + 1,
            total_parcels: installmentCount,
          };
        })
        : [{
          description: form.description,
          value: numericValue,
          due_date: form.due_date,
          type: form.type,
          mode: form.mode,
          status: form.status,
          account_id: form.account_id,
          category_id: form.category_id,
          competence_id: form.competence_id,
        }];

      for (const transaction of transactionsToSave) {
        const lock = await ensureCompetenceIsOpen(transaction.competence_id);

        if (!lock.allowed) {
          alert(lock.message);
          return;
        }
      }

      const { error } = editingTransactionId
        ? await supabase
          .from("transactions")
          .update(transactionsToSave[0])
          .eq("id", editingTransactionId)
        : await supabase.from("transactions").insert(transactionsToSave);

      if (error) {
        throw new Error(error.message);
      }

      closeDrawer();
      await loadDescriptionSuggestions();

      await loadTransactions({
        competenceId: competenceFilter,
        accountId: accountFilter,
        type: typeFilter,
        status: statusFilter,
        search: searchTerm,
        listMode,
      });
    } catch (error) {
      console.error("Erro ao salvar lançamento:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao salvar lançamento."
      );
    }
  }

  async function handleDeleteTransaction(transactionId: string) {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este lançamento?"
    );

    if (!confirmed) return;

    try {
      const result = await deleteTransactionService(transactionId);

      if (!result.success) {
        alert(result.message ?? "Erro ao excluir lançamento.");
        return;
      }

      await loadTransactions({
        competenceId: competenceFilter,
        accountId: accountFilter,
        type: typeFilter,
        status: statusFilter,
        search: searchTerm,
        listMode,
      });
    } catch (error) {
      console.error("Erro ao excluir lançamento:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao excluir lançamento."
      );
    }
  }

  const selectedCompetence = competences.find(
    (item) => item.id === competenceFilter
  );

  const monthLabels = [
    "jan", "fev", "mar", "abr",
    "mai", "jun", "jul", "ago",
    "set", "out", "nov", "dez",
  ];

  function selectCompetenceByMonth(year: number, month: number) {
    const foundCompetence = competences.find(
      (item) => item.year === year && item.month === month
    );

    if (foundCompetence) {
      setCompetenceFilter(foundCompetence.id);
      setIsCompetencePickerOpen(false);
    }
  }

  function formatCurrency(value: number) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  console.log(
    "IDS",
    transactions.map((t) => t.id)
  );

  const today = new Date().toISOString().split("T")[0];

  const selectedAccount = accounts.find(
    (account) => account.id === accountFilter
  );

  const currentTransactions = transactions.filter(
    (transaction) => transaction.due_date <= today
  );

  const futureTransactions = transactions.filter(
    (transaction) => transaction.due_date > today
  );

  function calculateBalance(list: Transaction[]) {
    return list.reduce((sum, transaction) => {
      if (transaction.type === "Receita") {
        return sum + Number(transaction.value);
      }

      if (transaction.type === "Despesa") {
        return sum - Number(transaction.value);
      }

      if (transaction.type === "Transferência" && selectedAccount) {
        if (transaction.origin_account_id === selectedAccount.id) {
          return sum - Number(transaction.value);
        }

        if (transaction.destination_account_id === selectedAccount.id) {
          return sum + Number(transaction.value);
        }

        return sum - Number(transaction.value);
      }

      return sum;
    }, 0);
  }

  const currentBalance = calculateBalance(currentTransactions);
  const estimatedBalance = calculateBalance(transactions);
  const futureBalance = calculateBalance(futureTransactions);

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "Receita")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const totalExpense = transactions
    .filter((transaction) => transaction.type === "Despesa")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const totalTransfers = transactions
    .filter((transaction) => transaction.type === "Transferência")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const periodResult = totalIncome - totalExpense;

  const cardLimit = Number(selectedAccount?.limit_amount ?? 0);

  const cardAvailableLimit =
    selectedAccount?.type === "Cartão"
      ? cardLimit - totalExpense
      : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Lançamentos</h1>
            <p className="mt-1 text-sm text-slate-400">
              Gestão completa dos lançamentos financeiros.
            </p>
          </div>

          <button
            onClick={() => {
              resetForm();
              setIsDrawerOpen(true);
            }}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Novo lançamento
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-6">
          <div className="relative">
            <div className="flex h-full items-center justify-between rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
              <button
                onClick={() => {
                  const currentIndex = competences.findIndex(
                    (item) => item.id === competenceFilter
                  );

                  if (currentIndex >= 0 && currentIndex < competences.length - 1) {
                    setCompetenceFilter(competences[currentIndex + 1].id);
                  }
                }}
                className="rounded-lg px-2 text-lg text-slate-400 hover:bg-white/10 hover:text-white"
                title="Competência anterior"
              >
                ‹
              </button>

              <button
                onClick={() => {
                  setPickerYear(selectedCompetence?.year ?? new Date().getFullYear());
                  setIsCompetencePickerOpen(!isCompetencePickerOpen);
                }}
                className="px-3 text-sm font-bold text-blue-300 hover:text-blue-200"
              >
                {selectedCompetence
                  ? `${monthLabels[selectedCompetence.month - 1]} ${selectedCompetence.year}`
                  : "Competência"}
              </button>

              <button
                onClick={() => {
                  const currentIndex = competences.findIndex(
                    (item) => item.id === competenceFilter
                  );

                  if (currentIndex > 0) {
                    setCompetenceFilter(competences[currentIndex - 1].id);
                  }
                }}
                className="rounded-lg px-2 text-lg text-slate-400 hover:bg-white/10 hover:text-white"
                title="Próxima competência"
              >
                ›
              </button>
            </div>

            {isCompetencePickerOpen && (
              <div className="absolute left-0 top-14 z-40 w-80 rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <button
                    onClick={() => setPickerYear(pickerYear - 1)}
                    className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    ‹
                  </button>

                  <p className="text-lg font-bold text-white">{pickerYear}</p>

                  <button
                    onClick={() => setPickerYear(pickerYear + 1)}
                    className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    ›
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {monthLabels.map((month, index) => {
                    const monthNumber = index + 1;
                    const competenceExists = competences.some(
                      (item) => item.year === pickerYear && item.month === monthNumber
                    );

                    const isSelected =
                      selectedCompetence?.year === pickerYear &&
                      selectedCompetence?.month === monthNumber;

                    return (
                      <button
                        key={month}
                        disabled={!competenceExists}
                        onClick={() => selectCompetenceByMonth(pickerYear, monthNumber)}
                        className={`rounded-xl px-3 py-4 text-sm font-semibold ${isSelected
                          ? "bg-blue-600 text-white"
                          : competenceExists
                            ? "text-slate-200 hover:bg-white/10"
                            : "cursor-not-allowed text-slate-600"
                          }`}
                      >
                        {month}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <select
            value={listMode}
            onChange={(event) =>
              setListMode(event.target.value as "competence" | "latest")
            }
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="competence">Por data do lançamento</option>
            <option value="latest">Últimos 20 cadastrados</option>
          </select>

          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                loadTransactions({
                  competenceId: competenceFilter,
                  accountId: accountFilter,
                  type: typeFilter,
                  status: statusFilter,
                  search: searchTerm,
                  listMode,
                });
              }
            }}
            placeholder="Buscar por descrição..."
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          />

          <select
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">Todas as contas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">Todos os tipos</option>
            <option value="Despesa">Despesa</option>
            <option value="Receita">Receita</option>
            <option value="Transferência">Transferência</option>
            <option value="Pagamento de Fatura">Pagamento de Fatura</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">Todos os status</option>
            <option value="Pendente">Pendente</option>
            <option value="Pago">Pago</option>
            <option value="Recebido">Recebido</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {!selectedAccount && (
            <>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Receitas</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">
                  {formatCurrency(totalIncome)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Despesas</p>
                <p className="mt-2 text-2xl font-bold text-red-300">
                  {formatCurrency(totalExpense)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Resultado</p>
                <p
                  className={`mt-2 text-2xl font-bold ${periodResult >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                >
                  {formatCurrency(periodResult)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Transferências</p>
                <p className="mt-2 text-2xl font-bold text-blue-300">
                  {formatCurrency(totalTransfers)}
                </p>
              </div>
            </>
          )}

          {selectedAccount?.type === "Conta" && (
            <>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Conta selecionada</p>
                <p className="mt-2 text-xl font-bold text-white">
                  {selectedAccount.name}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Saldo atual</p>
                <p
                  className={`mt-2 text-2xl font-bold ${currentBalance >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                >
                  {formatCurrency(currentBalance)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Saldo estimado</p>
                <p
                  className={`mt-2 text-2xl font-bold ${estimatedBalance >= 0 ? "text-blue-300" : "text-red-300"
                    }`}
                >
                  {formatCurrency(estimatedBalance)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Futuro</p>
                <p
                  className={`mt-2 text-2xl font-bold ${futureBalance >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                >
                  {formatCurrency(futureBalance)}
                </p>
              </div>
            </>
          )}

          {selectedAccount?.type === "Cartão" && (
            <>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Cartão selecionado</p>
                <p className="mt-2 text-xl font-bold text-white">
                  {selectedAccount.name}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Total da fatura</p>
                <p className="mt-2 text-2xl font-bold text-red-300">
                  {formatCurrency(totalExpense)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Limite disponível</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">
                  {formatCurrency(cardAvailableLimit)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Fechamento / Vencimento</p>
                <p className="mt-2 text-xl font-bold text-blue-300">
                  {selectedAccount.closing_day
                    ? `Fecha dia ${selectedAccount.closing_day}`
                    : "Fechamento não informado"}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedAccount.due_day
                    ? `Vence dia ${selectedAccount.due_day}`
                    : "Vencimento não informado"}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="w-full overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-5 py-4">Data</th>
                <th className="px-5 py-4">Descrição</th>
                <th className="px-5 py-4">Valor</th>
                <th className="px-5 py-4">Conta / Cartão</th>
                <th className="px-5 py-4">Tipo</th>
                <th className="px-5 py-4">Categoria</th>
                <th className="px-5 py-4">Competência</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                    Carregando lançamentos...
                  </td>
                </tr>
              )}

              {!isLoading &&
                transactions.map((transaction, index) => (
                  <tr key={`${transaction.id}-${index}`} className="hover:bg-white/[0.03]">

                    <td className="px-5 py-4 text-slate-300">
                      {new Date(
                        transaction.due_date + "T00:00:00"
                      ).toLocaleDateString("pt-BR")}
                    </td>

                    <td className="px-5 py-4 text-white">
                      {transaction.description}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {formatCurrency(transaction.value)}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {transaction.account?.name ?? "-"}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {transaction.type}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {transaction.category?.name ?? "-"}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {transaction.competence?.name ?? "-"}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {transaction.status ?? "-"}
                    </td>

                    <td className="px-5 py-4 text-right">
                      {isTransactionLocked(transaction) ? (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                          Fechada
                        </span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditDrawer(transaction)}
                            title="Editar"
                            className="rounded-lg p-2 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                          >
                            ✏️
                          </button>

                          <button
                            onClick={() => handleDeleteTransaction(transaction.id)}
                            title="Excluir"
                            className="rounded-lg p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

              {!isLoading && transactions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {editingTransactionId ? "Editar lançamento" : "Novo lançamento"}
                </h2>
                <p className="text-sm text-slate-400">
                  Cadastre uma receita, despesa ou transferência.
                </p>
              </div>

              <button
                onClick={closeDrawer}
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Fechar
              </button>
            </div>
            <div className="space-y-4">
              <input
                value={form.due_date}
                onChange={(event) =>
                  setForm({ ...form, due_date: event.target.value })
                }
                type="date"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <input
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Descrição"
                list="transaction-description-suggestions"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <datalist id="transaction-description-suggestions">
                {descriptionSuggestions.map((description) => (
                  <option key={description} value={description} />
                ))}
              </datalist>

              <input
                value={form.value}
                onChange={(event) =>
                  setForm({ ...form, value: formatCurrencyInput(event.target.value) })
                }
                placeholder="Valor"
                inputMode="numeric"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <select
                value={form.account_id}
                onChange={(event) =>
                  setForm({ ...form, account_id: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="">Conta / Cartão</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>

              {form.type === "Pagamento de Fatura" && (
                <select
                  value={(form as any).card_payment_account_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      card_payment_account_id: event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                >
                  <option value="">Conta utilizada no pagamento</option>

                  {accounts
                    .filter((account) => account.type === "Conta")
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              )}

              <select
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="Receita">Receita</option>
                <option value="Despesa">Despesa</option>
                <option value="Transferência">Transferência</option>
                <option value="Pagamento de Fatura">Pagamento de Fatura</option>
              </select>

              {form.type === "Transferência" && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Transferindo de
                    </p>

                    <p className="mt-1 font-semibold text-white">
                      {accounts.find(
                        (account) => account.id === form.account_id
                      )?.name ?? "Selecione uma conta"}
                    </p>
                  </div>

                  <select
                    value={form.destination_account_id}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        destination_account_id: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                  >
                    <option value="">Conta destino</option>

                    {accounts
                      .filter(
                        (account) =>
                          account.type === "Conta" &&
                          account.id !== form.account_id
                      )
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <select
                value={form.mode}
                onChange={(event) =>
                  setForm({ ...form, mode: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="unico">Único</option>
                <option value="recorrente">Recorrente</option>
                <option value="parcelado">Parcelado</option>
              </select>

              {form.mode === "parcelado" && !editingTransactionId && (
                <input
                  value={form.installments}
                  onChange={(event) =>
                    setForm({ ...form, installments: event.target.value })
                  }
                  placeholder="Quantidade de parcelas"
                  type="number"
                  min="2"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                />
              )}
              {form.type !== "Pagamento de Fatura" && form.type !== "Transferência" && (
                <select
                  value={form.category_id}
                  onChange={(event) =>
                    setForm({ ...form, category_id: event.target.value })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                >
                  <option value="">Categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={form.competence_id}
                onChange={(event) =>
                  setForm({ ...form, competence_id: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="">Competência</option>
                {competences.map((competence) => (
                  <option key={competence.id} value={competence.id}>
                    {competence.name}
                  </option>
                ))}
              </select>

              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="Pendente">Pendente</option>
                <option value="Pago">Pago</option>
                <option value="Recebido">Recebido</option>
              </select>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeDrawer}
                  className="w-full rounded-xl border border-white/10 px-5 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Cancelar
                </button>

                <button
                  onClick={saveTransaction}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
                >
                  {editingTransactionId
                    ? "Atualizar lançamento"
                    : "Salvar lançamento"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Carregando...</div>}>
      <TransactionsPageContent />
    </Suspense>
  );
}
