"use client";

import { Suspense, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/layout/AppShell";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { deleteTransaction as deleteTransactionService } from "@/src/services/transactionService";
import FuelTransactionFields, { emptyFuelForm, type FuelForm } from "@/src/components/fuel/FuelTransactionFields";
import { parsePtBrNumber } from "@/src/utils/fuelCalculations";
import { removeFuelRecordForTransaction } from "@/src/services/fuelService";
import { ensureAccountIsOpen } from "@/src/utils/accountLock";
import {
  calculateAccountFinalBalance,
  filterTransactionsUntilDate,
} from "@/src/utils/balanceCalculations";

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
  special_type: string | null;
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
  account: { name: string; type: "Conta" | "Cartão" } | null;
  category: { name: string } | null;
  competence: { name: string } | null;
  origin_account_id?: string | null;
  destination_account_id?: string | null;
};

type AccountClosure = {
  account_id: string;
  competence_id: string;
  closing_balance: number | null;
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
  const [fuelForm, setFuelForm] = useState<FuelForm>(emptyFuelForm);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [closedCompetenceIds, setClosedCompetenceIds] = useState<string[]>([]);
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [competenceFilter, setCompetenceFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [listMode, setListMode] = useState<"competence" | "latest">("competence");
  const [showFilters, setShowFilters] = useState(false);
  const [plannedCardLimit, setPlannedCardLimit] = useState(0);
  const [accountClosures, setAccountClosures] = useState<AccountClosure[]>([]);

  const [cardStatements, setCardStatements] = useState<
    { account_id: string; competence_id: string }[]
  >([]);

  const transactionDefaultsKey = "finance-smart-transaction-defaults";

  function getAutomaticStatus(type: string, dueDate: string) {
    const today = new Date().toISOString().split("T")[0];

    if (dueDate > today) {
      return "Pendente";
    }

    if (type === "Receita") {
      return "Recebido";
    }

    return "Pago";
  }

  function getStoredTransactionDefaults() {
    if (typeof window === "undefined") return null;

    const saved = sessionStorage.getItem(transactionDefaultsKey);

    if (!saved) return null;

    try {
      return JSON.parse(saved) as {
        due_date?: string;
        account_id?: string;
        category_id?: string;
        type?: string;
        competence_id?: string;
        status?: string;
      };
    } catch {
      return null;
    }
  }

  function updateTransactionDefaults(nextDefaults: {
    due_date?: string;
    account_id?: string;
    category_id?: string;
    type?: string;
    competence_id?: string;
    status?: string;
  }) {
    if (typeof window === "undefined") return;

    const currentDefaults = getStoredTransactionDefaults() ?? {};

    sessionStorage.setItem(
      transactionDefaultsKey,
      JSON.stringify({
        ...currentDefaults,
        ...nextDefaults,
      })
    );
  }

  function saveTransactionDefaults(nextForm: typeof form) {
    if (typeof window === "undefined") return;

    sessionStorage.setItem(
      transactionDefaultsKey,
      JSON.stringify({
        due_date: nextForm.due_date,
        account_id: nextForm.account_id,
        category_id: nextForm.category_id,
        type: nextForm.type,
        competence_id: nextForm.competence_id,
        status: nextForm.status,
      })
    );
  }

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

  async function loadClosedCompetences(ownerId: string) {
    const { data, error } = await supabase
      .from("competence_closures")
      .select("competence_id")
      .eq("owner_id", ownerId)
      .eq("status", "Fechada");

    if (error) {
      console.error("Erro ao carregar competências fechadas:", error);
      setClosedCompetenceIds([]);
      return;
    }

    setClosedCompetenceIds((data ?? []).map((item) => item.competence_id));
  }

  function isTransactionLocked(transaction: Transaction) {
    const account = accounts.find((item) => item.id === transaction.account_id);

    if (account?.type === "Conta") {
      return accountClosures.some(
        (closure) =>
          closure.account_id === transaction.account_id &&
          closure.competence_id === transaction.competence_id
      );
    }

    if (account?.type === "Cartão") {
      return cardStatements.some(
        (statement) =>
          statement.account_id === transaction.account_id &&
          statement.competence_id === transaction.competence_id
      );
    }

    return false;
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

  async function loadPlannedCardLimit(accountId: string, competenceId: string) {
    const ownerId = await getCurrentUserId();
    if (!accountId || !competenceId) {
      setPlannedCardLimit(0);
      return;
    }

    const { data, error } = await supabase
      .from("financial_targets")
      .select("planned_value")
      .eq("target_type", "account")
      .eq("target_id", accountId)
      .eq("competence_id", competenceId)
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar limite planejado:", error);
      setPlannedCardLimit(0);
      return;
    }

    setPlannedCardLimit(Number(data?.planned_value ?? 0));
  }

  async function loadDescriptionSuggestions(ownerId: string) {
    const { data, error } = await supabase
      .from("transactions")
      .select("description, created_at")
      .eq("owner_id", ownerId)
      .eq("type", "Despesa")

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
    categoryId?: string;
    search?: string;
    listMode?: "competence" | "latest";
  }) {
    setIsLoading(true);

    const ownerId = await getCurrentUserId();

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
          account:accounts!transactions_account_id_fkey(name, type),
          category:categories!transactions_category_id_fkey(name),
          competence:competences!transactions_competence_id_fkey(name)
        `)
      .eq("owner_id", ownerId)

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

    if (filters?.categoryId) {
      query = query.eq("category_id", filters.categoryId);
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

          return 2;
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

    const ownerId = await getCurrentUserId();

    const [accountClosuresResponse, cardStatementsResponse] = await Promise.all([
      supabase
        .from("account_closures")
        .select("*")
        .eq("owner_id", ownerId),
      supabase
        .from("credit_card_statements")
        .select("account_id, competence_id")
        .eq("owner_id", ownerId),
    ]);

    setAccountClosures(accountClosuresResponse.data ?? []);
    setCardStatements(cardStatementsResponse.data ?? []);

    const [accountsResponse, categoriesResponse, competencesResponse] =
      await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, closing_day, due_day, limit_amount, current_balance")
          .eq("owner_id", ownerId)
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name, type, special_type")
          .eq("owner_id", ownerId)
          .eq("active", true)
          .order("type", { ascending: false })
          .order("name", { ascending: true }),
        supabase
          .from("competences")
          .select("id, month, year, name, status")
          .eq("owner_id", ownerId)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
      ]);

    if (accountsResponse.data) setAccounts(accountsResponse.data);
    if (categoriesResponse.data) setCategories(categoriesResponse.data);

    await loadClosedCompetences(ownerId);
    await loadDescriptionSuggestions(ownerId);

    if (competencesResponse.data) {
      setCompetences(competencesResponse.data);

      const defaultCompetenceId = getCurrentCompetenceId(competencesResponse.data);

      setCompetenceFilter(defaultCompetenceId);

      const storedDefaults = getStoredTransactionDefaults();
      const defaultDueDate =
        storedDefaults?.due_date ?? new Date().toISOString().split("T")[0];

      const defaultType = storedDefaults?.type ?? "Despesa";

      setForm((previousForm) => ({
        ...previousForm,
        due_date: defaultDueDate,
        type: defaultType,
        status:
          storedDefaults?.status ??
          getAutomaticStatus(defaultType, defaultDueDate),
        account_id: storedDefaults?.account_id ?? "",
        category_id: storedDefaults?.category_id ?? "",
        competence_id: defaultCompetenceId,
      }));

      await loadTransactions({
        competenceId: defaultCompetenceId,
        accountId: "",
        type: "",
        status: "",
        search: "",
        listMode: "competence",
      });
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "true" || searchParams.get("new") === "fuel") {
      resetForm();
      if (searchParams.get("new") === "fuel") {
        const fuelCategory = categories.find((category) => category.special_type === "fuel");
        if (fuelCategory) setForm((current) => ({ ...current, category_id: fuelCategory.id, type: "Despesa", mode: "unico" }));
      }
      setIsDrawerOpen(true);
    }
  }, [searchParams, categories]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    const transaction = transactions.find((item) => item.id === editId);
    if (transaction && !isDrawerOpen) void openEditDrawer(transaction);
  }, [searchParams, transactions, isDrawerOpen]);

  useEffect(() => {
    const selected = accounts.find((account) => account.id === accountFilter);

    if (selected?.type === "Cartão") {
      loadPlannedCardLimit(accountFilter, competenceFilter);
      return;
    }

    setPlannedCardLimit(0);
  }, [accountFilter, competenceFilter, accounts]);

  useEffect(() => {
    if (!competenceFilter) return;

    loadTransactions({
      competenceId: competenceFilter,
      accountId: accountFilter,
      type: typeFilter,
      status: statusFilter,
      categoryId: categoryFilter,
      search: searchTerm,
      listMode,
    });
  }, [competenceFilter, accountFilter, typeFilter, statusFilter, categoryFilter, listMode]);

  function resetForm() {
    const storedDefaults = getStoredTransactionDefaults();

    const defaultDueDate =
      storedDefaults?.due_date ?? new Date().toISOString().split("T")[0];

    const defaultType = storedDefaults?.type ?? "Despesa";

    setEditingTransactionId(null);
    setFuelForm(emptyFuelForm);

    setForm({
      description: "",
      value: "",
      due_date: defaultDueDate,
      type: defaultType,
      mode: "unico",
      status:
        storedDefaults?.status ??
        getAutomaticStatus(defaultType, defaultDueDate),
      installments: "2",
      account_id: storedDefaults?.account_id ?? "",
      card_payment_account_id: "",
      origin_account_id: "",
      destination_account_id: "",
      category_id: storedDefaults?.category_id ?? "",
      competence_id: getCurrentCompetenceId(competences),
    });
  }

  function closeDrawer() {
    resetForm();
    setIsDrawerOpen(false);
    router.replace("/transactions");
  }

  async function openEditDrawer(transaction: Transaction) {

    if (isTransactionLocked(transaction)) {
      alert("Esta conta/cartão já está fechado nesta competência.");
      return;
    }

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

    const ownerId = await getCurrentUserId();
    const { data: fuel } = await supabase.from("fuel_records").select("vehicle_id,fuel_station_id,fuel_type,odometer,liters,price_per_liter,full_tank,latitude,longitude").eq("transaction_id", transaction.id).eq("owner_id", ownerId).maybeSingle();
    if (fuel) setFuelForm({ vehicle_id:fuel.vehicle_id, fuel_station_id:fuel.fuel_station_id ?? "", fuel_type:fuel.fuel_type, odometer:String(fuel.odometer).replace(".",","), liters:String(fuel.liters).replace(".",","), price_per_liter:String(fuel.price_per_liter).replace(".",","), full_tank:fuel.full_tank, latitude:String(fuel.latitude??""), longitude:String(fuel.longitude??"") });

    setIsDrawerOpen(true);
  }

  async function saveTransaction() {
    const numericValue = parseCurrencyInput(form.value);
    const installmentCount = Number(form.installments);
    const isFuel = categories.find((category) => category.id === form.category_id)?.special_type === "fuel";

    if (
      !form.description ||
      numericValue <= 0 ||
      !form.due_date ||
      !form.competence_id ||
      (
        form.type === "Transferência" &&
        !editingTransactionId &&
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
      const ownerId = await getCurrentUserId();

      if (isFuel) {
        const liters = parsePtBrNumber(fuelForm.liters), price = parsePtBrNumber(fuelForm.price_per_liter), odometer = parsePtBrNumber(fuelForm.odometer);
        if (!fuelForm.vehicle_id || !fuelForm.fuel_type || odometer < 0 || liters <= 0 || price <= 0 || numericValue <= 0) { alert("Preencha todos os dados obrigatórios do abastecimento."); return; }
        const { data: last } = await supabase.from("fuel_records").select("odometer").eq("owner_id", ownerId).eq("vehicle_id", fuelForm.vehicle_id).order("odometer", { ascending: false }).limit(1).maybeSingle();
        if (last && odometer < Number(last.odometer) && !window.confirm(`O hodômetro é inferior ao último registro (${last.odometer} km). Deseja continuar?`)) return;
        const lock = await ensureAccountIsOpen({ accountId: form.account_id, competenceId: form.competence_id });
        if (!lock.allowed) { alert(lock.message); return; }
        const transactionPayload = {
          description: form.description,
          value: numericValue,
          due_date: form.due_date,
          type: "Despesa",
          mode: "unico",
          status: form.status,
          account_id: form.account_id,
          category_id: form.category_id,
          competence_id: form.competence_id,
          owner_id: ownerId,
        };
        const transactionResult = editingTransactionId
          ? await supabase.from("transactions").update(transactionPayload).eq("id", editingTransactionId).eq("owner_id", ownerId).select("id").single()
          : await supabase.from("transactions").insert(transactionPayload).select("id").single();
        if (transactionResult.error) throw new Error(transactionResult.error.message);

        const transactionId = transactionResult.data.id;
        const fuelRecordPayload = {
          owner_id: ownerId,
          transaction_id: transactionId,
          vehicle_id: fuelForm.vehicle_id,
          fuel_station_id: fuelForm.fuel_station_id || null,
          fuel_type: fuelForm.fuel_type,
          odometer,
          liters,
          price_per_liter: price,
          total_value: numericValue,
          full_tank: fuelForm.full_tank,
          latitude: fuelForm.latitude || null,
          longitude: fuelForm.longitude || null,
          recorded_at: form.due_date,
        };
        const { error: fuelRecordError } = await supabase
          .from("fuel_records")
          .upsert(fuelRecordPayload, { onConflict: "transaction_id" });
        if (fuelRecordError) {
          if (!editingTransactionId) {
            await supabase.from("transactions").delete().eq("id", transactionId).eq("owner_id", ownerId);
          }
          throw new Error(fuelRecordError.message);
        }
        closeDrawer(); await loadTransactions({ competenceId: competenceFilter, accountId: accountFilter, type: typeFilter, status: statusFilter, categoryId: categoryFilter, search: searchTerm, listMode }); return;
      }

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
            origin_account_id: form.account_id,
            destination_account_id: form.destination_account_id,
            owner_id: ownerId,
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
            owner_id: ownerId,
          },
        ];

        for (const transaction of transferTransactions) {
          if (!transaction.account_id) {
            alert("Conta/cartão inválido para validar fechamento.");
            return;
          }

          const lock = await ensureAccountIsOpen({
            accountId: transaction.account_id,
            competenceId: transaction.competence_id,
          });

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

        if (!editingTransactionId) {
          saveTransactionDefaults(form);
        }

        closeDrawer();

        await loadDescriptionSuggestions(ownerId);

        await loadTransactions({
          competenceId: competenceFilter,
          accountId: accountFilter,
          type: typeFilter,
          status: statusFilter,
          categoryId: categoryFilter,
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
            category_id:
              form.type === "Transferência" || form.type === "Pagamento de Fatura"
                ? null
                : form.category_id,
            competence_id: competenceId,
            origin_account_id:
              form.type === "Transferência"
                ? form.origin_account_id || form.account_id
                : null,
            destination_account_id:
              form.type === "Transferência"
                ? form.destination_account_id || null
                : null,
            parcel_number: index + 1,
            total_parcels: installmentCount,
            owner_id: ownerId,
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
          category_id:
            form.type === "Transferência" || form.type === "Pagamento de Fatura"
              ? null
              : form.category_id || null,
          competence_id: form.competence_id,
          origin_account_id:
            form.type === "Transferência"
              ? form.origin_account_id || form.account_id || null
              : null,
          destination_account_id:
            form.type === "Transferência"
              ? form.destination_account_id || null
              : null,
          owner_id: ownerId,
        }];

      for (const transaction of transactionsToSave) {
        if (!transaction.account_id) {
          alert("Conta/cartão inválido para validar fechamento.");
          return;
        }

        const lock = await ensureAccountIsOpen({
          accountId: transaction.account_id,
          competenceId: transaction.competence_id,
        });

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
          .eq("owner_id", ownerId)
        : await supabase.from("transactions").insert(transactionsToSave);

      if (error) {
        throw new Error(error.message);
      }

      if (editingTransactionId) await removeFuelRecordForTransaction(editingTransactionId);

      if (!editingTransactionId) {
        saveTransactionDefaults(form);
      }

      closeDrawer();
      await loadDescriptionSuggestions(ownerId);

      await loadTransactions({
        competenceId: competenceFilter,
        accountId: accountFilter,
        type: typeFilter,
        status: statusFilter,
        categoryId: categoryFilter,
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

  async function handleDeleteTransaction(transaction: Transaction) {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este lançamento? Se ele estiver conciliado, a conciliação será desfeita automaticamente."
    );

    if (isTransactionLocked(transaction)) {
      alert("Esta conta/cartão já está fechado nesta competência.");
      return;
    }

    if (!confirmed) return;

    try {
      const result = await deleteTransactionService(transaction.id);

      if (!result.success) {
        alert(result.message ?? "Erro ao excluir lançamento.");
        return;
      }

      await loadTransactions({
        competenceId: competenceFilter,
        accountId: accountFilter,
        type: typeFilter,
        status: statusFilter,
        categoryId: categoryFilter,
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
  const selectedCategory = categories.find((category) => category.id === form.category_id);
  const isFuelCategory = selectedCategory?.special_type === "fuel";

  function getCompetenceOrder(competence: Competence) {
    return competence.year * 100 + competence.month;
  }

  function getClosureBalance(closure: AccountClosure) {
    if (closure.closing_balance === null || closure.closing_balance === undefined) {
      return null;
    }

    return Number(closure.closing_balance);
  }

  function getAccountOpeningBalance(account: Account) {
    if (!selectedCompetence) {
      return Number(account.current_balance ?? 0);
    }

    const selectedOrder = getCompetenceOrder(selectedCompetence);

    const previousClosures = accountClosures
      .map((closure) => {
        const closureCompetence = competences.find(
          (competence) => competence.id === closure.competence_id
        );

        return {
          closure,
          competence: closureCompetence,
        };
      })
      .filter((item) => {
        if (item.closure.account_id !== account.id) return false;
        if (!item.competence) return false;

        return getCompetenceOrder(item.competence) < selectedOrder;
      })
      .sort((a, b) => {
        if (!a.competence || !b.competence) return 0;

        return (
          getCompetenceOrder(b.competence) -
          getCompetenceOrder(a.competence)
        );
      });

    const previousClosure = previousClosures[0]?.closure;

    const previousBalance = previousClosure
      ? getClosureBalance(previousClosure)
      : null;

    return previousBalance ?? Number(account.current_balance ?? 0);
  }

  function getCompetenceByDate(date: Date) {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    return competences.find(
      (competence) => competence.month === month && competence.year === year
    );
  }

  function getVisibleMonthDates() {
    if (!selectedCompetence) {
      return [];
    }

    const centerDate = new Date(
      selectedCompetence.year,
      selectedCompetence.month - 1,
      1
    );

    const dates: Date[] = [];

    for (let offset = -3; offset <= 3; offset++) {
      dates.push(
        new Date(centerDate.getFullYear(), centerDate.getMonth() + offset, 1)
      );
    }

    return dates;
  }

  function formatMonthLabel(date: Date) {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
    })
      .format(date)
      .replace(".", "");
  }

  function selectCompetenceByDate(date: Date) {
    const foundCompetence = getCompetenceByDate(date);

    if (foundCompetence) {
      setListMode("competence");
      setCompetenceFilter(foundCompetence.id);
    }
  }

  function goToPreviousCompetence() {
    if (!selectedCompetence) return;

    const previousDate = new Date(
      selectedCompetence.year,
      selectedCompetence.month - 2,
      1
    );

    selectCompetenceByDate(previousDate);
  }

  function goToNextCompetence() {
    if (!selectedCompetence) return;

    const nextDate = new Date(
      selectedCompetence.year,
      selectedCompetence.month,
      1
    );

    selectCompetenceByDate(nextDate);
  }

  function goToCurrentCompetence() {
    const currentCompetenceId = getCurrentCompetenceId(competences);

    if (currentCompetenceId) {
      setCompetenceFilter(currentCompetenceId);
    }
  }

  function formatShortDate(date: string) {
    return new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  }

  function formatFullDate(date: string) {
    return new Date(date + "T00:00:00").toLocaleDateString("pt-BR");
  }

  function formatCurrency(value: number) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  const today = new Date().toISOString().split("T")[0];

  const selectedAccount = accounts.find(
    (account) => account.id === accountFilter
  );

  const currentTransactions = transactions.filter(
    (transaction) => transaction.due_date <= today
  );

  const openingBalance = selectedAccount
    ? (() => {
      const selectedCompetenceOrder = selectedCompetence
        ? selectedCompetence.year * 100 + selectedCompetence.month
        : 0;

      const previousClosure = accountClosures
        .map((closure) => {
          const closureCompetence = competences.find(
            (competence) => competence.id === closure.competence_id
          );

          return {
            closure,
            competence: closureCompetence,
          };
        })
        .filter((item) => {
          if (item.closure.account_id !== selectedAccount.id) return false;
          if (!item.competence) return false;

          const closureOrder = item.competence.year * 100 + item.competence.month;

          return closureOrder < selectedCompetenceOrder;
        })
        .sort((a, b) => {
          if (!a.competence || !b.competence) return 0;

          const orderA = a.competence.year * 100 + a.competence.month;
          const orderB = b.competence.year * 100 + b.competence.month;

          return orderB - orderA;
        })[0];

      return Number(previousClosure?.closure.closing_balance ?? 0);
    })()
    : 0;

  const selectedAccountTransactions = selectedAccount
    ? transactions.filter(
      (transaction) =>
        transaction.account_id === selectedAccount.id ||
        transaction.destination_account_id === selectedAccount.id
    )
    : [];

  const currentBalance = selectedAccount
    ? calculateAccountFinalBalance({
      accountId: selectedAccount.id,
      openingBalance,
      transactions: filterTransactionsUntilDate(selectedAccountTransactions, today),
    })
    : 0;

  const futureBalance = selectedAccount
    ? calculateAccountFinalBalance({
      accountId: selectedAccount.id,
      openingBalance,
      transactions,
    })
    : 0;

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "Receita")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const totalDirectExpenses = transactions
    .filter(
      (transaction) =>
        transaction.type === "Despesa" &&
        transaction.account?.type === "Conta"
    )
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const totalInvoicePayments = transactions
    .filter((transaction) => transaction.type === "Pagamento de Fatura")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const cashFlowResult =
    totalIncome - totalDirectExpenses - totalInvoicePayments;

  const totalTransfers = transactions
    .filter((transaction) => transaction.type === "Transferência")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const cardLimit = plannedCardLimit;

  const cardUsedLimit = transactions.reduce((sum, transaction) => {
    if (transaction.type === "Despesa") {
      return sum + Number(transaction.value);
    }

    if (transaction.type === "Receita") {
      return sum - Number(transaction.value);
    }

    return sum;
  }, 0);

  const cardAvailableLimit =
    selectedAccount?.type === "Cartão"
      ? cardLimit - cardUsedLimit
      : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 md:w-auto"
          >
            Novo lançamento
          </button>
        </div>

        <div className="space-y-3">
          <div className="w-full">
            <div className="w-full rounded-xl border border-white/10 bg-slate-900 p-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goToPreviousCompetence}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                  title="Competência anterior"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
                  {getVisibleMonthDates().map((date) => {
                    const foundCompetence = getCompetenceByDate(date);
                    const isSelected =
                      foundCompetence?.id === selectedCompetence?.id;

                    const today = new Date();
                    const isCurrentMonth =
                      date.getMonth() === today.getMonth() &&
                      date.getFullYear() === today.getFullYear();

                    return (
                      <button
                        key={`${date.getFullYear()}-${date.getMonth()}`}
                        type="button"
                        disabled={!foundCompetence}
                        onClick={() => selectCompetenceByDate(date)}
                        className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2 text-xs font-semibold transition ${isSelected
                          ? "bg-blue-600 text-white"
                          : isCurrentMonth
                            ? "bg-cyan-500/10 text-cyan-300"
                            : foundCompetence
                              ? "bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-white"
                              : "cursor-not-allowed bg-white/[0.02] text-slate-700"
                          }`}
                      >
                        {formatMonthLabel(date)}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={goToNextCompetence}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                  title="Próxima competência"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <button
                type="button"
                onClick={goToCurrentCompetence}
                className="mt-2 w-full rounded-lg py-1 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Voltar para mês atual
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-6">
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
                    categoryId: categoryFilter,
                    search: searchTerm,
                    listMode,
                  });
                }
              }}
              placeholder="Buscar por descrição..."
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
            />

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 md:hidden"
            >
              <SlidersHorizontal size={16} />
              Filtros
            </button>

            <div className={`${showFilters ? "grid" : "hidden"} gap-3 md:contents`}>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">Todas as categorias</option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
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
          </div>
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
                <p className="text-sm text-slate-400">Despesas diretas</p>
                <p className="mt-2 text-2xl font-bold text-red-300">
                  {formatCurrency(totalDirectExpenses)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Fluxo de caixa</p>
                <p
                  className={`mt-2 text-2xl font-bold ${cashFlowResult >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                >
                  {formatCurrency(cashFlowResult)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Pagamentos de fatura</p>
                <p className="mt-2 text-2xl font-bold text-orange-300">
                  {formatCurrency(totalInvoicePayments)}
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
                <p className="text-sm text-slate-400">Saldo anterior</p>
                <p
                  className={`mt-2 text-2xl font-bold ${openingBalance >= 0 ? "text-blue-300" : "text-red-300"
                    }`}
                >
                  {formatCurrency(openingBalance)}
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
                  {formatCurrency(cardUsedLimit)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <p className="text-sm text-slate-400">Limite disponível</p>
                <p
                  className={`mt-2 text-2xl font-bold ${cardAvailableLimit >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                >
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
          <table className="min-w-[520px] w-full table-fixed text-left text-sm md:min-w-[1040px]">
            <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
              <tr>
                <th className="w-[70px] px-3 py-4 md:w-[110px] md:px-4">Data</th>
                <th className="px-3 py-4 md:px-4">Descrição</th>
                <th className="hidden w-[180px] px-4 py-4 md:table-cell">Conta / Cartão</th>
                <th className="hidden w-[110px] px-3 py-4 md:table-cell">Categoria</th>
                <th className="w-[95px] px-2 py-4 text-right md:w-[120px] md:px-3">Valor</th>
                <th className="w-[76px] px-2 py-4 text-right md:w-[90px] md:px-3">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    Carregando lançamentos...
                  </td>
                </tr>
              )}

              {!isLoading &&
                transactions.map((transaction, index) => (
                  <tr key={`${transaction.id}-${index}`} className="hover:bg-white/[0.03]">

                    <td className="w-[70px] px-3 py-4 text-slate-300 md:w-[110px] md:px-4">
                      <span className="md:hidden">{formatShortDate(transaction.due_date)}</span>
                      <span className="hidden md:inline">{formatFullDate(transaction.due_date)}</span>
                    </td>

                    <td className="min-w-0 px-3 py-4 md:px-4">
                      <div className="font-medium text-white">
                        {transaction.description}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${transaction.type === "Receita"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : transaction.type === "Transferência"
                              ? "bg-blue-500/10 text-blue-300"
                              : transaction.type === "Pagamento de Fatura"
                                ? "bg-cyan-500/10 text-cyan-300"
                                : "bg-red-500/10 text-red-300"
                            }`}
                        >
                          {transaction.type}
                        </span>

                        <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-xs font-semibold text-slate-400">
                          {transaction.status ?? "-"}
                        </span>
                      </div>
                    </td>

                    <td className="hidden w-[180px] max-w-[180px] truncate px-4 py-4 text-slate-300 md:table-cell">
                      {transaction.account?.name ?? "-"}
                    </td>

                    <td className="hidden w-[110px] max-w-[110px] truncate px-3 py-4 text-slate-300 md:table-cell">
                      {transaction.category?.name ?? "-"}
                    </td>

                    <td
                      className={`w-[95px] px-2 py-4 text-right text-xs font-semibold md:w-[120px] md:px-3 md:text-sm ${transaction.type === "Receita"
                        ? "text-emerald-300"
                        : transaction.type === "Transferência"
                          ? "text-blue-300"
                          : "text-red-300"
                        }`}
                    >
                      {formatCurrency(transaction.value)}
                    </td>

                    <td className="w-[76px] px-2 py-4 text-right md:w-[90px] md:px-3">
                      {isTransactionLocked(transaction) ? (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                          Fechada
                        </span>
                      ) : (
                        <div className="flex justify-end gap-1 md:gap-2">
                          <button
                            onClick={() => openEditDrawer(transaction)}
                            title="Editar"
                            className="rounded-lg p-2 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                          >
                            ✏️
                          </button>

                          <button
                            onClick={() => handleDeleteTransaction(transaction)}
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
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
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
                onChange={(event) => {
                  const newDate = event.target.value;
                  const newCompetenceId = getCompetenceIdByDate(newDate);
                  const newStatus = getAutomaticStatus(form.type, newDate);

                  setForm({
                    ...form,
                    due_date: newDate,
                    competence_id: newCompetenceId,
                    status: newStatus,
                  });

                  updateTransactionDefaults({
                    due_date: newDate,
                    competence_id: newCompetenceId,
                    status: newStatus,
                  });
                }}
                type="date"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              {form.type !== "Pagamento de Fatura" && form.type !== "Transferência" && (
                <select value={form.category_id} onChange={(event) => { const categoryId=event.target.value; const category=categories.find(item=>item.id===categoryId); const fuel=category?.special_type==="fuel"; const type=category?.type??form.type; setForm({ ...form, category_id:categoryId, type:fuel?"Despesa":type, mode:fuel?"unico":form.mode, status:getAutomaticStatus(fuel?"Despesa":type,form.due_date) }); updateTransactionDefaults({category_id:categoryId,type:fuel?"Despesa":type}); }} className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none">
                  <option value="">Categoria</option>{categories.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              )}

              {isFuelCategory && (
                <FuelTransactionFields value={fuelForm} onChange={setFuelForm} onTotalChange={(total) => setForm((current) => ({ ...current, value: formatCurrencyFromNumber(total) }))} isEditing={editingTransactionId !== null} />
              )}

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
                onChange={(event) => { const value=formatCurrencyInput(event.target.value); setForm({ ...form, value }); if(isFuelCategory){const total=parseCurrencyInput(value),liters=parsePtBrNumber(fuelForm.liters);if(total>0&&liters>0)setFuelForm(current=>({...current,price_per_liter:(total/liters).toFixed(3).replace(".",",")}));} }}
                placeholder="Valor"
                inputMode="numeric"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <select
                value={form.account_id}
                onChange={(event) => {
                  const accountId = event.target.value;

                  setForm({ ...form, account_id: accountId });
                  updateTransactionDefaults({ account_id: accountId });
                }}
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

              {!isFuelCategory && <select
                value={form.type}
                onChange={(event) => {
                  const newType = event.target.value;
                  const newStatus = getAutomaticStatus(newType, form.due_date);

                  setForm({
                    ...form,
                    type: newType,
                    status: newStatus,
                  });

                  updateTransactionDefaults({
                    type: newType,
                    status: newStatus,
                  });
                }}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="Receita">Receita</option>
                <option value="Despesa">Despesa</option>
                <option value="Transferência">Transferência</option>
                <option value="Pagamento de Fatura">Pagamento de Fatura</option>
              </select>}

              {form.type === "Transferência" && (
                <div className="space-y-3">
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

              {!isFuelCategory && <select
                value={form.mode}
                onChange={(event) =>
                  setForm({ ...form, mode: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="unico">Único</option>
                <option value="recorrente">Recorrente</option>
                <option value="parcelado">Parcelado</option>
              </select>}

              {!isFuelCategory && form.mode === "parcelado" && !editingTransactionId && (
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
              {false && form.type !== "Pagamento de Fatura" && form.type !== "Transferência" && (
                <select
                  value={form.category_id}
                  onChange={(event) => {
                    const categoryId = event.target.value;

                    setForm({ ...form, category_id: categoryId });
                    updateTransactionDefaults({ category_id: categoryId });
                  }}
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
