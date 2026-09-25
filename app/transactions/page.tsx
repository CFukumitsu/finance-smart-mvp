"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Legacy page synchronizes filters and Supabase data through effects. */

import { useMutation } from "@/src/hooks/useMutation";
import { ProcessingButton, MutationScope } from "@/src/components/ui/Mutation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Car,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Dices,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Lock,
  PawPrint,
  Pencil,
  Plane,
  Plus,
  Receipt,
  Rows3,
  Search,
  Shirt,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Utensils,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/layout/AppShell";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import { deleteTransaction as deleteTransactionService } from "@/src/services/transactionService";
import FuelTransactionFields, {
  emptyFuelForm,
  type FuelForm,
} from "@/src/components/fuel/FuelTransactionFields";
import { parsePtBrNumber } from "@/src/utils/fuelCalculations";
import { removeFuelRecordForTransaction } from "@/src/services/fuelService";
import { ensureAccountIsOpen } from "@/src/utils/accountLock";
import {
  ensureCompetenceExists,
  ensureCompetencesExist,
  toCompetenceKey,
} from "@/src/services/competenceService";
import {
  calculateAccountFinalBalance,
  filterTransactionsUntilDate,
} from "@/src/utils/balanceCalculations";
import {
  sortLatestTransactionsForDisplay,
  sortTransactionsByCashDirection,
} from "@/src/utils/transactionFilters";
import {
  isFinancialAccount,
  isFinancialLedgerAccount,
} from "@/src/utils/closingAccounts";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  closing_day: number | null;
  due_day: number | null;
  limit_amount: number | null;
  current_balance: number | null;
  show_on_investments_dashboard: boolean;
  investment_account_kind: "BALANCE" | null;
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
  card_payment_account_id?: string | null;
  bankroll_integration_group_id?: string | null;
  bankroll_operation_type?: "deposit" | "withdrawal" | null;
  investment_integration_group_id?: string | null;
  investment_event_type?: "application" | "redemption" | null;
};

type AccountClosure = {
  account_id: string;
  competence_id: string;
  closing_balance: number | null;
};

type SummaryTone = "positive" | "negative" | "warning" | "info" | "neutral";

const summaryToneClasses: Record<SummaryTone, { value: string; dot: string }> =
  {
    positive: { value: "text-emerald-300", dot: "bg-emerald-400" },
    negative: { value: "text-red-300", dot: "bg-red-400" },
    warning: { value: "text-orange-300", dot: "bg-orange-400" },
    info: { value: "text-blue-300", dot: "bg-blue-400" },
    neutral: { value: "theme-text", dot: "bg-slate-400" },
  };

function SummaryCard({
  label,
  value,
  tone,
  hint,
  primary = false,
}: {
  label: string;
  value: string;
  tone: SummaryTone;
  hint?: string;
  primary?: boolean;
}) {
  const toneClasses = summaryToneClasses[tone];

  return (
    <div
      className={`min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow-sm ${
        primary
          ? "ring-1 ring-inset ring-blue-500/25 sm:col-span-3 lg:col-span-2"
          : ""
      }`}
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneClasses.dot}`}
        />
        <span className="truncate">{label}</span>
      </p>
      {primary ? (
        <div
          className={`mt-1.5 truncate text-3xl font-semibold tabular-nums tracking-tight ${toneClasses.value}`}
          title={value}
        >
          {value}
        </div>
      ) : (
        <p
          className={`mt-2 truncate font-semibold tabular-nums tracking-tight ${toneClasses.value}`}
          title={value}
        >
          {value}
        </p>
      )}
      {hint && (
        <span className="mt-0.5 block truncate text-xs text-slate-400">
          {hint}
        </span>
      )}
    </div>
  );
}

const badgeBaseClass =
  "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4";

function getTypeBadgeClass(type: string) {
  if (type === "Receita") return "bg-emerald-500/10 text-emerald-300";
  if (type === "Transferência") return "bg-blue-500/10 text-blue-300";
  if (type === "Pagamento de Fatura") return "bg-orange-500/10 text-orange-300";
  return "bg-red-500/10 text-red-300";
}

function getStatusBadgeClass(status: string | null) {
  return status === "Pendente"
    ? "border border-transparent bg-amber-500/10 text-amber-300"
    : "border border-white/10 text-slate-400";
}

function getValueColorClass(type: string) {
  if (type === "Receita") return "text-emerald-300";
  if (type === "Transferência") return "text-blue-300";
  return "text-red-300";
}

const transactionModeLabels: Record<string, string> = {
  unico: "Único",
  parcelado: "Parcelado",
  recorrente: "Recorrente",
};

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR");
}

// Visual-only hints keyed on category-name word prefixes; unmatched categories
// fall back to an icon derived from the transaction type.
const categoryIconRules: { prefixes: string[]; icon: LucideIcon }[] = [
  { prefixes: ["combust", "abastec", "gasolina"], icon: Fuel },
  { prefixes: ["aliment", "restaurante", "refei", "lanche", "delivery"], icon: Utensils },
  { prefixes: ["mercado", "supermercado", "compra"], icon: ShoppingCart },
  { prefixes: ["transporte", "uber", "carro", "veicul", "estacionamento", "pedagio"], icon: Car },
  { prefixes: ["viage", "passage", "hotel"], icon: Plane },
  { prefixes: ["presente"], icon: Gift },
  { prefixes: ["saude", "farmacia", "medic", "hospital"], icon: HeartPulse },
  { prefixes: ["moradia", "casa", "aluguel", "condominio"], icon: House },
  { prefixes: ["educa", "curso", "escola", "faculdade"], icon: GraduationCap },
  { prefixes: ["pet", "pets"], icon: PawPrint },
  { prefixes: ["energia", "luz"], icon: Zap },
  { prefixes: ["roupa", "vestuario"], icon: Shirt },
  { prefixes: ["invest"], icon: TrendingUp },
  { prefixes: ["salario", "renda"], icon: Wallet },
];

function getTransactionIcon(
  transaction: Transaction,
  categorySpecialType: string | null | undefined,
): LucideIcon {
  if (transaction.investment_integration_group_id) return TrendingUp;
  if (transaction.bankroll_integration_group_id) return Dices;
  if (transaction.type === "Transferência") return ArrowLeftRight;
  if (transaction.type === "Pagamento de Fatura") return CreditCard;
  if (categorySpecialType === "fuel") return Fuel;

  const categoryName = transaction.category?.name;

  if (categoryName) {
    const words = normalizeForMatch(categoryName).split(/[^a-z0-9]+/);
    const rule = categoryIconRules.find((item) =>
      item.prefixes.some((prefix) =>
        words.some((word) => word.startsWith(prefix)),
      ),
    );

    if (rule) return rule.icon;
  }

  if (transaction.type === "Receita") return ArrowDownLeft;
  if (transaction.type === "Despesa") return ArrowUpRight;
  return Receipt;
}

function formatWeekday(date: string, weekday: "short" | "long") {
  const label = new Date(date + "T00:00:00")
    .toLocaleDateString("pt-BR", { weekday })
    .replace(".", "");

  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="theme-divider flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="shrink-0 text-xs font-medium text-slate-400">{label}</dt>
      <dd className="theme-text min-w-0 text-right text-sm font-medium">
        {value}
      </dd>
    </div>
  );
}

function TransactionsPageContent() {
  const mutation = useMutation();
  const isMutationLocked = mutation.isLocked;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fuelForm, setFuelForm] = useState<FuelForm>(emptyFuelForm);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [closedCompetenceIds, setClosedCompetenceIds] = useState<string[]>([]);
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<
    string[]
  >([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [competenceFilter, setCompetenceFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [listMode, setListMode] = useState<"competence" | "latest">(
    "competence",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [detailTransactionId, setDetailTransactionId] = useState<
    string | null
  >(null);
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [plannedCardLimit, setPlannedCardLimit] = useState(0);
  const [accountClosures, setAccountClosures] = useState<AccountClosure[]>([]);
  const loadTransactionsRequestIdRef = useRef(0);

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
      }),
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
      }),
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
  const financialAccounts = accounts.filter(isFinancialAccount);
  const financialLedgerAccounts = accounts.filter(isFinancialLedgerAccount);
  const formAccountOptions =
    form.type === "Transferência" ? financialAccounts : financialLedgerAccounts;

  function getCurrentCompetenceId(list: Competence[]) {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const currentCompetence = list.find(
      (competence) =>
        competence.month === currentMonth && competence.year === currentYear,
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
          closure.competence_id === transaction.competence_id,
      );
    }

    if (account?.type === "Cartão") {
      return cardStatements.some(
        (statement) =>
          statement.account_id === transaction.account_id &&
          statement.competence_id === transaction.competence_id,
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
        (competence) => competence.month === month && competence.year === year,
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

  useEffect(() => {
    if (!isDrawerOpen) return;
    let cancelled = false;
    setDescriptionSuggestions([]);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc(
          "search_transaction_descriptions",
          {
            search_text: form.description.trim(),
          },
        );
        if (error) throw error;
        if (!cancelled) {
          setDescriptionSuggestions(
            (data ?? []).map(
              (item: { description: string }) => item.description,
            ),
          );
        }
      } catch (error) {
        if (!cancelled)
          console.error("Erro ao carregar sugestões de descrições:", error);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.description, isDrawerOpen]);

  async function applyDescriptionSuggestion(description: string) {
    setForm((current) => ({
      ...current,
      description,
    }));

    try {
      const ownerId = await getCurrentUserId();

      const { data, error } = await supabase
        .from("transactions")
        .select("category_id, type")
        .eq("owner_id", ownerId)
        .eq("description", description)
        .not("category_id", "is", null)
        .order("due_date", { ascending: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data?.category_id) {
        return;
      }

      const category = categories.find((item) => item.id === data.category_id);

      if (!category) {
        return;
      }

      const isFuel = category.special_type === "fuel";

      setForm((current) => ({
        ...current,
        description,
        category_id: category.id,
        type: isFuel ? "Despesa" : current.type,
        mode: isFuel ? "unico" : current.mode,
        status: isFuel
          ? getAutomaticStatus("Despesa", current.due_date)
          : current.status,
      }));

      updateTransactionDefaults({
        category_id: category.id,
        ...(isFuel
          ? {
              type: "Despesa",
              status: getAutomaticStatus("Despesa", form.due_date),
            }
          : {}),
      });
    } catch (error) {
      console.error("Erro ao aplicar categoria da descrição sugerida:", error);
    }
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
    const requestId = ++loadTransactionsRequestIdRef.current;
    setIsLoading(true);

    const ownerId = await getCurrentUserId();

    if (requestId !== loadTransactionsRequestIdRef.current) {
      return;
    }

    let query = supabase
      .from("transactions")
      .select(
        `
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
          bankroll_integration_group_id,
          bankroll_operation_type,
          investment_integration_group_id,
          investment_event_type,
          account:accounts!transactions_account_id_fkey(name, type),
          category:categories!transactions_category_id_fkey(name),
          competence:competences!transactions_competence_id_fkey(name)
        `,
      )
      .eq("owner_id", ownerId);

    if (filters?.competenceId) {
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

    if (filters?.listMode === "latest") {
      query = query
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(20);
    } else {
      query = query.order("due_date", { ascending: false });
    }

    const { data, error } = await query;

    if (requestId !== loadTransactionsRequestIdRef.current) {
      return;
    }

    if (error) {
      console.error("Erro ao carregar lançamentos:", error);
      alert("Erro ao carregar lançamentos.");
      setIsLoading(false);
      return;
    }

    const rawTransactions = (data ?? []) as unknown as Transaction[];

    if (filters?.listMode === "latest") {
      setTransactions(sortLatestTransactionsForDisplay(rawTransactions));
    } else {
      setTransactions(
        sortTransactionsByCashDirection(
          rawTransactions,
          filters?.accountId ?? "",
        ),
      );
    }

    setIsLoading(false);
  }

  async function loadReferenceData() {
    setIsLoading(true);

    const ownerId = await getCurrentUserId();
    await ensureCompetenceExists(new Date());

    const [accountClosuresResponse, cardStatementsResponse] = await Promise.all(
      [
        supabase.from("account_closures").select("*").eq("owner_id", ownerId),
        supabase
          .from("credit_card_statements")
          .select("account_id, competence_id")
          .eq("owner_id", ownerId),
      ],
    );

    setAccountClosures(accountClosuresResponse.data ?? []);
    setCardStatements(cardStatementsResponse.data ?? []);

    const [accountsResponse, categoriesResponse, competencesResponse] =
      await Promise.all([
        supabase
          .from("accounts")
          .select(
            "id, name, type, closing_day, due_day, limit_amount, current_balance, show_on_investments_dashboard, investment_account_kind",
          )
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
          .order("month", { ascending: false }),
      ]);

    const loadedAccounts = (accountsResponse.data ?? []) as Account[];
    setAccounts(loadedAccounts);
    if (categoriesResponse.data) setCategories(categoriesResponse.data);

    await loadClosedCompetences(ownerId);

    if (competencesResponse.data) {
      setCompetences(competencesResponse.data);

      const defaultCompetenceId = getCurrentCompetenceId(
        competencesResponse.data,
      );

      setCompetenceFilter(defaultCompetenceId);

      const storedDefaults = getStoredTransactionDefaults();
      const defaultDueDate =
        storedDefaults?.due_date ?? new Date().toISOString().split("T")[0];

      const defaultType = storedDefaults?.type ?? "Despesa";
      const storedAccountId = loadedAccounts
        .filter(isFinancialLedgerAccount)
        .some((account) => account.id === storedDefaults?.account_id)
        ? (storedDefaults?.account_id ?? "")
        : "";

      setForm((previousForm) => ({
        ...previousForm,
        due_date: defaultDueDate,
        type: defaultType,
        status:
          storedDefaults?.status ??
          getAutomaticStatus(defaultType, defaultDueDate),
        account_id: storedAccountId,
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
    const storedDensity = localStorage.getItem(
      "finance-smart-transactions-density",
    );
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setDensity(storedDensity);
    }
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (isMutationLocked()) return;
      if (event.key !== "Escape") return;
      if (showFilters) {
        setShowFilters(false);
        return;
      }
      if (isDrawerOpen) {
        closeDrawer();
        return;
      }
      if (detailTransactionId) setDetailTransactionId(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showFilters, isDrawerOpen, detailTransactionId, isMutationLocked]);

  useEffect(() => {
    if (
      searchParams.get("new") === "true" ||
      searchParams.get("new") === "fuel"
    ) {
      resetForm();
      if (searchParams.get("new") === "fuel") {
        const fuelCategory = categories.find(
          (category) => category.special_type === "fuel",
        );
        if (fuelCategory)
          setForm((current) => ({
            ...current,
            category_id: fuelCategory.id,
            type: "Despesa",
            mode: "unico",
          }));
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
      search: debouncedSearchTerm,
      listMode,
    });
  }, [
    competenceFilter,
    accountFilter,
    typeFilter,
    statusFilter,
    categoryFilter,
    listMode,
    debouncedSearchTerm,
  ]);

  useEffect(() => {
    const normalizedSearchTerm = searchTerm.trim();

    if (!normalizedSearchTerm) {
      setDebouncedSearchTerm("");
      return;
    }

    if (normalizedSearchTerm.length < 3) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(normalizedSearchTerm);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

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
    if (transaction.bankroll_integration_group_id) {
      alert(
        "Esta operação está vinculada ao Financeiro e deve ser editada pelo módulo Bankroll.",
      );
      router.push(
        `/bankroll/transactions?action=${transaction.bankroll_operation_type ?? "deposit"}`,
      );
      return;
    }

    if (transaction.investment_integration_group_id) {
      alert(
        "Esta transferência pertence a uma conta por saldo e deve ser editada pelo módulo de Investimentos.",
      );
      router.push("/investments/operations");
      return;
    }

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
      card_payment_account_id: transaction.card_payment_account_id ?? "",
      origin_account_id: transaction.origin_account_id ?? "",
      destination_account_id: transaction.destination_account_id ?? "",
      category_id: transaction.category_id ?? "",
      competence_id: transaction.competence_id ?? "",
    });

    const ownerId = await getCurrentUserId();
    const { data: fuel } = await supabase
      .from("fuel_records")
      .select(
        "vehicle_id,fuel_station_id,fuel_type,odometer,liters,price_per_liter,full_tank,latitude,longitude",
      )
      .eq("transaction_id", transaction.id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (fuel)
      setFuelForm({
        vehicle_id: fuel.vehicle_id,
        fuel_station_id: fuel.fuel_station_id ?? "",
        fuel_type: fuel.fuel_type,
        odometer: String(fuel.odometer).replace(".", ","),
        liters: String(fuel.liters).replace(".", ","),
        price_per_liter: String(fuel.price_per_liter).replace(".", ","),
        full_tank: fuel.full_tank,
        latitude: String(fuel.latitude ?? ""),
        longitude: String(fuel.longitude ?? ""),
      });

    setIsDrawerOpen(true);
  }

  async function saveTransaction() {
    return mutation.run("saveTransaction", async () => {
      const numericValue = parseCurrencyInput(form.value);
      const installmentCount = Number(form.installments);
      const isFuel =
        categories.find((category) => category.id === form.category_id)
          ?.special_type === "fuel";
      const selectedAccount = accounts.find(
        (account) => account.id === form.account_id,
      );
      const selectedDestination = accounts.find(
        (account) => account.id === form.destination_account_id,
      );

      if (
        !selectedAccount ||
        !isFinancialLedgerAccount(selectedAccount) ||
        (form.type === "Transferência" &&
          (!isFinancialAccount(selectedAccount) ||
            !selectedDestination ||
            !isFinancialAccount(selectedDestination)))
      ) {
        alert(
          "Contas de investimento devem ser movimentadas exclusivamente pelo módulo Investimentos.",
        );
        return;
      }

      if (
        !form.description ||
        numericValue <= 0 ||
        !form.due_date ||
        !form.competence_id ||
        (form.type === "Transferência" &&
          !editingTransactionId &&
          (!form.account_id ||
            !form.destination_account_id ||
            form.account_id === form.destination_account_id)) ||
        (form.type !== "Transferência" && !form.account_id) ||
        (form.type !== "Transferência" &&
          form.type !== "Pagamento de Fatura" &&
          !form.category_id)
      ) {
        alert("Preencha todos os campos obrigatórios.");
        return;
      }

      if (
        form.mode === "parcelado" &&
        (!installmentCount || installmentCount < 2)
      ) {
        alert("Informe uma quantidade de parcelas maior que 1.");
        return;
      }

      try {
        const ownerId = await getCurrentUserId();
        const dueDateCompetence = competences.find(
          (competence) => competence.name === toCompetenceKey(form.due_date),
        );
        const effectiveCompetenceId =
          form.mode !== "parcelado" && !dueDateCompetence
            ? (await ensureCompetenceExists(form.due_date)).id
            : form.competence_id;

        if (isFuel) {
          const liters = parsePtBrNumber(fuelForm.liters),
            price = parsePtBrNumber(fuelForm.price_per_liter),
            odometer = parsePtBrNumber(fuelForm.odometer);
          if (
            !fuelForm.vehicle_id ||
            !fuelForm.fuel_type ||
            odometer < 0 ||
            liters <= 0 ||
            price <= 0 ||
            numericValue <= 0
          ) {
            alert("Preencha todos os dados obrigatórios do abastecimento.");
            return;
          }
          const { data: last } = await supabase
            .from("fuel_records")
            .select("odometer")
            .eq("owner_id", ownerId)
            .eq("vehicle_id", fuelForm.vehicle_id)
            .order("odometer", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (
            last &&
            odometer < Number(last.odometer) &&
            !window.confirm(
              `O hodômetro é inferior ao último registro (${last.odometer} km). Deseja continuar?`,
            )
          )
            return;
          const lock = await ensureAccountIsOpen({
            accountId: form.account_id,
            competenceId: effectiveCompetenceId,
          });
          if (!lock.allowed) {
            alert(lock.message);
            return;
          }
          const transactionPayload = {
            description: form.description,
            value: numericValue,
            due_date: form.due_date,
            type: "Despesa",
            mode: "unico",
            status: form.status,
            account_id: form.account_id,
            category_id: form.category_id,
            competence_id: effectiveCompetenceId,
            owner_id: ownerId,
          };
          const transactionResult = editingTransactionId
            ? await supabase
                .from("transactions")
                .update(transactionPayload)
                .eq("id", editingTransactionId)
                .eq("owner_id", ownerId)
                .select("id")
                .single()
            : await supabase
                .from("transactions")
                .insert(transactionPayload)
                .select("id")
                .single();
          if (transactionResult.error)
            throw new Error(transactionResult.error.message);

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
              await supabase
                .from("transactions")
                .delete()
                .eq("id", transactionId)
                .eq("owner_id", ownerId);
            }
            throw new Error(fuelRecordError.message);
          }
          closeDrawer();
          await loadTransactions({
            competenceId: competenceFilter,
            accountId: accountFilter,
            type: typeFilter,
            status: statusFilter,
            categoryId: categoryFilter,
            search: debouncedSearchTerm,
            listMode,
          });
          return;
        }

        if (form.type === "Transferência" && !editingTransactionId) {
          const originAccount = accounts.find(
            (account) => account.id === form.account_id,
          );

          const destinationAccount = accounts.find(
            (account) => account.id === form.destination_account_id,
          );

          const transferTransactions = [
            {
              description:
                form.description ||
                `Transferência para ${destinationAccount?.name ?? "conta destino"}`,
              value: numericValue,
              due_date: form.due_date,
              type: "Transferência",
              mode: "unico",
              status: "Pago",
              account_id: form.account_id,
              category_id: null,
              competence_id: effectiveCompetenceId,
              origin_account_id: form.account_id,
              destination_account_id: form.destination_account_id,
              owner_id: ownerId,
            },
            {
              description:
                form.description ||
                `Transferência recebida de ${originAccount?.name ?? "conta origem"}`,
              value: numericValue,
              due_date: form.due_date,
              type: "Transferência",
              mode: "unico",
              status: "Recebido",
              account_id: form.destination_account_id,
              category_id: null,
              competence_id: effectiveCompetenceId,
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

          await loadTransactions({
            competenceId: competenceFilter,
            accountId: accountFilter,
            type: typeFilter,
            status: statusFilter,
            categoryId: categoryFilter,
            search: debouncedSearchTerm,
            listMode,
          });

          return;
        }

        const installmentDates =
          form.mode === "parcelado" && !editingTransactionId
            ? Array.from({ length: installmentCount }, (_, index) =>
                addMonths(form.due_date, index),
              )
            : [];
        const ensuredInstallmentCompetences =
          await ensureCompetencesExist(installmentDates);

        const transactionsToSave =
          form.mode === "parcelado" && !editingTransactionId
            ? Array.from({ length: installmentCount }, (_, index) => {
                const dueDate = addMonths(form.due_date, index);
                const competenceId = ensuredInstallmentCompetences.get(
                  toCompetenceKey(dueDate),
                )?.id;

                if (!competenceId) {
                  throw new Error(
                    `Não foi possível preparar a competência de ${toCompetenceKey(dueDate)}.`,
                  );
                }

                return {
                  description: `${form.description} ${index + 1}/${installmentCount}`,
                  value: Number((numericValue / installmentCount).toFixed(2)),
                  due_date: dueDate,
                  type: form.type,
                  mode: form.mode,
                  status: form.status,
                  account_id: form.account_id,
                  category_id:
                    form.type === "Transferência" ||
                    form.type === "Pagamento de Fatura"
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
            : [
                {
                  description: form.description,
                  value: numericValue,
                  due_date: form.due_date,
                  type: form.type,
                  mode: form.mode,
                  status: form.status,
                  account_id: form.account_id,
                  category_id:
                    form.type === "Transferência" ||
                    form.type === "Pagamento de Fatura"
                      ? null
                      : form.category_id || null,
                  competence_id: effectiveCompetenceId,
                  origin_account_id:
                    form.type === "Transferência"
                      ? form.origin_account_id || form.account_id || null
                      : null,
                  destination_account_id:
                    form.type === "Transferência"
                      ? form.destination_account_id || null
                      : null,
                  owner_id: ownerId,
                },
              ];

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

        if (editingTransactionId)
          await removeFuelRecordForTransaction(editingTransactionId);

        if (!editingTransactionId) {
          saveTransactionDefaults(form);
        }

        closeDrawer();

        await loadTransactions({
          competenceId: competenceFilter,
          accountId: accountFilter,
          type: typeFilter,
          status: statusFilter,
          categoryId: categoryFilter,
          search: debouncedSearchTerm,
          listMode,
        });
      } catch (error) {
        console.error("Erro ao salvar lançamento:", error);

        alert(
          error instanceof Error ? error.message : "Erro ao salvar lançamento.",
        );
      }
    });
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    return mutation.run(
      "handleDeleteTransaction" + ":" + transaction.id,
      async () => {
        const confirmed = window.confirm(
          "Tem certeza que deseja excluir este lançamento? Se ele estiver conciliado, a conciliação será desfeita automaticamente.",
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
            search: debouncedSearchTerm,
            listMode,
          });
        } catch (error) {
          console.error("Erro ao excluir lançamento:", error);

          alert(
            error instanceof Error
              ? error.message
              : "Erro ao excluir lançamento.",
          );
        }
      },
    );
  }

  const selectedCompetence = competences.find(
    (item) => item.id === competenceFilter,
  );
  const selectedCategory = categories.find(
    (category) => category.id === form.category_id,
  );
  const isFuelCategory = selectedCategory?.special_type === "fuel";

  function getCompetenceOrder(competence: Competence) {
    return competence.year * 100 + competence.month;
  }

  function getClosureBalance(closure: AccountClosure) {
    if (
      closure.closing_balance === null ||
      closure.closing_balance === undefined
    ) {
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
          (competence) => competence.id === closure.competence_id,
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
          getCompetenceOrder(b.competence) - getCompetenceOrder(a.competence)
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
      (competence) => competence.month === month && competence.year === year,
    );
  }

  function getVisibleMonthDates() {
    if (!selectedCompetence) {
      return [];
    }

    const centerDate = new Date(
      selectedCompetence.year,
      selectedCompetence.month - 1,
      1,
    );

    const dates: Date[] = [];

    for (let offset = -3; offset <= 3; offset++) {
      dates.push(
        new Date(centerDate.getFullYear(), centerDate.getMonth() + offset, 1),
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

  function formatCompactMonthLabel(date: Date) {
    return formatMonthLabel(date).replace(" de ", " ");
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
      1,
    );

    selectCompetenceByDate(previousDate);
  }

  function goToNextCompetence() {
    if (!selectedCompetence) return;

    const nextDate = new Date(
      selectedCompetence.year,
      selectedCompetence.month,
      1,
    );

    selectCompetenceByDate(nextDate);
  }

  function goToCurrentCompetence() {
    const currentCompetenceId = getCurrentCompetenceId(competences);

    if (currentCompetenceId) {
      setListMode("competence");
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

  function formatCompetenceLabel(value: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(value);

    if (!match) {
      return value;
    }

    const [, year, month] = match;

    const monthLabels = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ];

    const monthIndex = Number(month) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      return value;
    }

    return `${monthLabels[monthIndex]}/${year}`;
  }

  const today = new Date().toISOString().split("T")[0];

  const selectedAccount = accounts.find(
    (account) => account.id === accountFilter,
  );

  const currentTransactions = transactions.filter(
    (transaction) => transaction.due_date <= today,
  );

  const openingBalance = selectedAccount
    ? (() => {
        const selectedCompetenceOrder = selectedCompetence
          ? selectedCompetence.year * 100 + selectedCompetence.month
          : 0;

        const previousClosure = accountClosures
          .map((closure) => {
            const closureCompetence = competences.find(
              (competence) => competence.id === closure.competence_id,
            );

            return {
              closure,
              competence: closureCompetence,
            };
          })
          .filter((item) => {
            if (item.closure.account_id !== selectedAccount.id) return false;
            if (!item.competence) return false;

            const closureOrder =
              item.competence.year * 100 + item.competence.month;

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
          transaction.destination_account_id === selectedAccount.id,
      )
    : [];

  const currentBalance = selectedAccount
    ? calculateAccountFinalBalance({
        accountId: selectedAccount.id,
        openingBalance,
        transactions: filterTransactionsUntilDate(
          selectedAccountTransactions,
          today,
        ),
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
    .filter((transaction) => transaction.type === "Despesa")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const totalCashExpenses = transactions
    .filter(
      (transaction) =>
        transaction.type === "Despesa" && transaction.account?.type === "Conta",
    )
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const totalInvoicePayments = transactions
    .filter((transaction) => transaction.type === "Pagamento de Fatura")
    .reduce((sum, transaction) => sum + Number(transaction.value), 0);

  const cashFlowResult = totalIncome - totalCashExpenses - totalInvoicePayments;

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
    selectedAccount?.type === "Cartão" ? cardLimit - cardUsedLimit : 0;

  const advancedFilterCount =
    Number(Boolean(categoryFilter)) +
    Number(Boolean(typeFilter)) +
    Number(Boolean(statusFilter));

  function clearAdvancedFilters() {
    setCategoryFilter("");
    setTypeFilter("");
    setStatusFilter("");
  }

  const quickTypeFilters = [
    { value: "", label: "Todos" },
    { value: "Receita", label: "Receitas" },
    { value: "Despesa", label: "Despesas" },
    { value: "Transferência", label: "Transferências" },
    { value: "Pagamento de Fatura", label: "Faturas" },
  ];

  const quickStatusFilters = [
    { value: "", label: "Todos" },
    { value: "Pendente", label: "Pendente" },
    { value: "Pago", label: "Pago" },
    { value: "Recebido", label: "Recebido" },
  ];

  // Derived from the loaded list so the panel reflects reloads and closes
  // itself when the transaction leaves the current result set.
  const detailTransaction = detailTransactionId
    ? (transactions.find(
        (transaction) => transaction.id === detailTransactionId,
      ) ?? null)
    : null;

  function getCategorySpecialType(transaction: Transaction) {
    return categories.find((category) => category.id === transaction.category_id)
      ?.special_type;
  }

  function editFromDetail(transaction: Transaction) {
    setDetailTransactionId(null);
    void openEditDrawer(transaction);
  }

  function toggleDensity() {
    const nextDensity = density === "compact" ? "comfortable" : "compact";
    setDensity(nextDensity);
    localStorage.setItem("finance-smart-transactions-density", nextDensity);
  }

  function changeTransactionType(newType: string) {
    const newStatus = getAutomaticStatus(newType, form.due_date);

    setForm((current) => ({
      ...current,
      type: newType,
      status: newStatus,
      category_id: newType === "Transferência" ? "" : current.category_id,
      destination_account_id:
        newType === "Transferência" ? current.destination_account_id : "",
      mode: newType === "Transferência" ? "unico" : current.mode,
    }));

    updateTransactionDefaults({
      type: newType,
      status: newStatus,
    });
  }

  function changeTransactionMode(newMode: string) {
    setForm((current) => ({
      ...current,
      mode: newMode,
    }));
  }

  return (
    <AppShell>
      <div
        className={`transactions-page transactions-density-${density} space-y-4`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="theme-text text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
              Lançamentos
            </h1>
            <p className="theme-muted mt-0.5 text-sm">
              Gestão completa dos lançamentos financeiros.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsDrawerOpen(true);
            }}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 sm:w-auto"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Novo lançamento
          </button>
        </div>

        <div className="transactions-surface w-full rounded-2xl border p-1 shadow-sm">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={goToPreviousCompetence}
              className="theme-muted theme-hover flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
              title="Competência anterior"
              aria-label="Competência anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden">
              {getVisibleMonthDates().map((date, index) => {
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
                    aria-current={isSelected ? "date" : undefined}
                    className={`${index < 2 || index > 4 ? "hidden sm:inline-flex" : "inline-flex"} h-9 shrink-0 items-center whitespace-nowrap rounded-xl px-3.5 text-xs transition-colors ${
                      isSelected
                        ? "bg-blue-600 font-semibold text-white shadow-sm"
                        : isCurrentMonth
                          ? "font-semibold text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/10"
                          : foundCompetence
                            ? "theme-muted theme-hover font-medium"
                            : "cursor-not-allowed font-medium text-slate-600 opacity-50"
                    }`}
                  >
                    <span className="sm:hidden">
                      {formatCompactMonthLabel(date)}
                    </span>
                    <span className="hidden sm:inline">
                      {formatMonthLabel(date)}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={goToNextCompetence}
              className="theme-muted theme-hover flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
              title="Próxima competência"
              aria-label="Próxima competência"
            >
              <ChevronRight size={18} />
            </button>
            <span
              aria-hidden="true"
              className="theme-divider mx-1 h-5 shrink-0 border-l"
            />
            <button
              type="button"
              onClick={goToCurrentCompetence}
              className="theme-muted theme-hover h-9 shrink-0 rounded-xl px-3.5 text-xs font-semibold transition-colors"
            >
              Hoje
            </button>
          </div>
        </div>

        <div className="transactions-surface rounded-2xl border p-2 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_minmax(180px,240px)_auto_auto]">
            <label className="relative">
              <span className="sr-only">Buscar lançamento</span>
              <Search
                className="theme-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                size={16}
              />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                enterKeyHint="search"
                placeholder="Buscar lançamento..."
                className="theme-field h-10 w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none transition-shadow"
              />
            </label>

            <select
              aria-label="Conta ou cartão"
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
              className="theme-field h-10 min-w-0 cursor-pointer rounded-xl border px-3 text-sm outline-none transition-shadow"
            >
              <option value="">Todas as contas</option>
              {financialLedgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Ordenação"
              value={listMode}
              onChange={(event) =>
                setListMode(event.target.value as "competence" | "latest")
              }
              className="theme-field h-10 min-w-0 cursor-pointer rounded-xl border px-3 text-sm outline-none transition-shadow"
            >
              <option value="competence">Por data do lançamento</option>
              <option value="latest">Últimos 20 cadastrados</option>
            </select>

            <button
              type="button"
              onClick={() => setShowFilters(true)}
              aria-expanded={showFilters}
              className="theme-field theme-hover flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-medium transition-colors"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Mais filtros
              {advancedFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold leading-none text-white">
                  {advancedFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleDensity}
              aria-pressed={density === "compact"}
              className="theme-field theme-hover flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-medium transition-colors"
              title={`Modo atual: ${density === "compact" ? "Compacto" : "Confortável"}`}
            >
              <Rows3 size={16} aria-hidden="true" />
              <span className="sm:hidden lg:inline">
                {density === "compact" ? "Compacto" : "Confortável"}
              </span>
            </button>
          </div>

          <div className="theme-divider mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-1 pt-2">
            <div
              role="group"
              aria-label="Filtro rápido por tipo"
              className="flex min-w-0 items-center gap-1 overflow-x-auto"
            >
              <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tipo
              </span>
              {quickTypeFilters.map((option) => {
                const active = typeFilter === option.value;

                return (
                  <button
                    key={option.value || "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTypeFilter(option.value)}
                    className={`h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs transition-colors ${
                      active
                        ? "bg-blue-500/10 font-semibold text-blue-300 ring-1 ring-inset ring-blue-500/30"
                        : "theme-muted theme-hover font-medium"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div
              role="group"
              aria-label="Filtro rápido por status"
              className="flex min-w-0 items-center gap-1 overflow-x-auto"
            >
              <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Status
              </span>
              {quickStatusFilters.map((option) => {
                const active = statusFilter === option.value;

                return (
                  <button
                    key={option.value || "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStatusFilter(option.value)}
                    className={`h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs transition-colors ${
                      active
                        ? "bg-blue-500/10 font-semibold text-blue-300 ring-1 ring-inset ring-blue-500/30"
                        : "theme-muted theme-hover font-medium"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Categoria
              </span>
              <select
                aria-label="Filtro rápido por categoria"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="theme-field h-8 min-w-0 max-w-[220px] cursor-pointer rounded-lg border px-2.5 text-xs outline-none transition-shadow"
              >
                <option value="">Todas</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {advancedFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAdvancedFilters}
                className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/10"
              >
                <X size={13} aria-hidden="true" />
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        <div
          className={`transactions-summary grid gap-3 ${
            selectedAccount
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : "sm:grid-cols-3 lg:grid-cols-5"
          }`}
        >
          {!selectedAccount && (
            <>
              <SummaryCard
                label="Saldo do mês"
                value={formatCurrency(cashFlowResult)}
                tone={cashFlowResult >= 0 ? "positive" : "negative"}
                hint="Receitas − despesas em conta − pagamentos de fatura"
                primary
              />
              <SummaryCard
                label="Receitas"
                value={formatCurrency(totalIncome)}
                tone="positive"
              />
              <SummaryCard
                label="Despesas diretas"
                value={formatCurrency(totalDirectExpenses)}
                tone="negative"
              />
              <SummaryCard
                label="Pagamentos de fatura"
                value={formatCurrency(totalInvoicePayments)}
                tone="warning"
              />
            </>
          )}

          {selectedAccount?.type === "Conta" && (
            <>
              <SummaryCard
                label="Conta selecionada"
                value={selectedAccount.name}
                tone="neutral"
              />
              <SummaryCard
                label="Saldo anterior"
                value={formatCurrency(openingBalance)}
                tone={openingBalance >= 0 ? "info" : "negative"}
              />
              <SummaryCard
                label="Saldo atual"
                value={formatCurrency(currentBalance)}
                tone={currentBalance >= 0 ? "positive" : "negative"}
              />
              <SummaryCard
                label="Futuro"
                value={formatCurrency(futureBalance)}
                tone={futureBalance >= 0 ? "positive" : "negative"}
              />
            </>
          )}

          {selectedAccount?.type === "Cartão" && (
            <>
              <SummaryCard
                label="Cartão selecionado"
                value={selectedAccount.name}
                tone="neutral"
              />
              <SummaryCard
                label="Total da fatura"
                value={formatCurrency(cardUsedLimit)}
                tone="negative"
              />
              <SummaryCard
                label="Limite disponível"
                value={formatCurrency(cardAvailableLimit)}
                tone={cardAvailableLimit >= 0 ? "positive" : "negative"}
              />
              <SummaryCard
                label="Fechamento / Vencimento"
                value={
                  selectedAccount.closing_day
                    ? `Fecha dia ${selectedAccount.closing_day}`
                    : "Fechamento não informado"
                }
                tone="info"
                hint={
                  selectedAccount.due_day
                    ? `Vence dia ${selectedAccount.due_day}`
                    : "Vencimento não informado"
                }
              />
            </>
          )}
        </div>

        <div
          className={
            detailTransaction
              ? "min-[1800px]:grid min-[1800px]:grid-cols-[minmax(0,1fr)_360px] min-[1800px]:items-start min-[1800px]:gap-4"
              : ""
          }
        >
          <div className="transactions-surface w-full overflow-x-auto rounded-2xl border shadow-sm">
            <table className="transactions-table min-w-[620px] w-full table-fixed text-left text-sm md:min-w-[1080px]">
              <thead className="sticky top-0 z-10">
                <tr className="theme-muted text-[11px] font-semibold uppercase tracking-wider">
                  <th className="w-[76px] px-3 py-4 font-semibold md:w-[104px] md:px-5">
                    Data
                  </th>
                  <th className="px-3 py-4 font-semibold md:px-4">Descrição</th>
                  <th className="hidden w-[120px] px-3 py-4 font-semibold md:table-cell">
                    Tipo
                  </th>
                  <th className="hidden w-[160px] px-3 py-4 font-semibold md:table-cell">
                    Conta / Cartão
                  </th>
                  <th className="hidden w-[136px] px-3 py-4 font-semibold md:table-cell">
                    Categoria
                  </th>
                  <th className="w-[95px] px-2 py-4 text-right font-semibold md:w-[124px] md:px-3">
                    Valor
                  </th>
                  <th className="hidden w-[116px] px-3 py-4 font-semibold md:table-cell">
                    Status
                  </th>
                  <th className="w-[84px] px-2 py-4 text-right font-semibold md:w-[92px] md:px-4">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.06]">
                {isLoading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      Carregando lançamentos...
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  transactions.map((transaction, index) => {
                    const isLocked = isTransactionLocked(transaction);
                    const isSelected = transaction.id === detailTransactionId;
                    const TransactionIcon = getTransactionIcon(
                      transaction,
                      getCategorySpecialType(transaction),
                    );

                    return (
                      <tr
                        key={`${transaction.id}-${index}`}
                        tabIndex={0}
                        aria-selected={isSelected}
                        onClick={() => setDetailTransactionId(transaction.id)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          setDetailTransactionId(transaction.id);
                        }}
                        className={`cursor-pointer outline-none transition-colors focus-visible:bg-blue-500/5 ${
                          isSelected ? "bg-blue-500/10" : ""
                        }`}
                      >
                        <td className="w-[76px] whitespace-nowrap px-3 py-4 tabular-nums md:w-[104px] md:px-5">
                          <span className="block text-xs text-slate-300 md:text-[13px]">
                            <span className="md:hidden">
                              {formatShortDate(transaction.due_date)}
                            </span>
                            <span className="hidden md:inline">
                              {formatFullDate(transaction.due_date)}
                            </span>
                          </span>
                          <span className="block text-[11px] leading-4 text-slate-400">
                            {formatWeekday(transaction.due_date, "short")}
                          </span>
                        </td>

                        <td className="min-w-0 px-3 py-4 md:px-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              aria-hidden="true"
                              className={`inline-flex shrink-0 items-center justify-center rounded-lg ${
                                density === "compact" ? "h-7 w-7" : "h-8 w-8"
                              } ${getTypeBadgeClass(transaction.type)}`}
                            >
                              <TransactionIcon size={15} strokeWidth={2} />
                            </span>

                            <div className="min-w-0 flex-1">
                              <div
                                className={
                                  density === "compact"
                                    ? "flex min-w-0 items-center gap-2 overflow-hidden"
                                    : "min-w-0"
                                }
                              >
                                <div
                                  className={`theme-text truncate text-[13px] font-medium md:text-sm ${
                                    density === "compact" ? "min-w-0 flex-1" : ""
                                  }`}
                                  title={transaction.description}
                                >
                                  {transaction.description}
                                </div>

                                {(transaction.bankroll_integration_group_id ||
                                  transaction.investment_integration_group_id) && (
                                  <div
                                    className={`transaction-badges flex ${
                                      density === "compact"
                                        ? "shrink-0 flex-nowrap items-center gap-1"
                                        : "mt-1 flex-wrap items-center gap-1.5"
                                    }`}
                                  >
                                    {transaction.bankroll_integration_group_id && (
                                      <span
                                        className={`${badgeBaseClass} bg-cyan-500/10 text-cyan-300`}
                                      >
                                        Origem: Bankroll Poker
                                      </span>
                                    )}
                                    {transaction.investment_integration_group_id && (
                                      <span
                                        className={`${badgeBaseClass} bg-cyan-500/10 text-cyan-300`}
                                      >
                                        Origem: Investimentos
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                                <span
                                  className={`${badgeBaseClass} ${getTypeBadgeClass(transaction.type)}`}
                                >
                                  {transaction.type}
                                </span>
                                <span
                                  className={`${badgeBaseClass} ${getStatusBadgeClass(transaction.status)}`}
                                >
                                  {transaction.status ?? "-"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="hidden w-[120px] px-3 py-4 md:table-cell">
                          <span
                            className={`${badgeBaseClass} ${getTypeBadgeClass(transaction.type)}`}
                          >
                            {transaction.type}
                          </span>
                        </td>

                        <td
                          className="hidden w-[160px] max-w-[160px] truncate px-3 py-4 text-[13px] text-slate-300 md:table-cell"
                          title={transaction.account?.name ?? undefined}
                        >
                          {transaction.account?.name ?? "-"}
                        </td>

                        <td
                          className="hidden w-[136px] max-w-[136px] truncate px-3 py-4 text-[13px] text-slate-400 md:table-cell"
                          title={transaction.category?.name ?? undefined}
                        >
                          {transaction.category?.name ?? "-"}
                        </td>

                        <td
                          className={`w-[95px] whitespace-nowrap px-2 py-4 text-right text-xs font-semibold tabular-nums md:w-[124px] md:px-3 md:text-sm ${getValueColorClass(
                            transaction.type,
                          )}`}
                        >
                          {formatCurrency(transaction.value)}
                        </td>

                        <td className="hidden w-[116px] px-3 py-4 md:table-cell">
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`${badgeBaseClass} ${getStatusBadgeClass(transaction.status)}`}
                            >
                              {transaction.status ?? "-"}
                            </span>
                            {isLocked && (
                              <span
                                className={`${badgeBaseClass} gap-1 border border-white/10 text-slate-400`}
                                title="Conta/cartão fechado nesta competência"
                              >
                                <Lock size={11} aria-hidden="true" />
                                Fechada
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="w-[84px] px-2 py-4 text-right md:w-[92px] md:px-4">
                          {isLocked ? (
                            <span
                              className="inline-flex h-8 w-8 items-center justify-center text-slate-400"
                              title="Conta/cartão fechado nesta competência"
                            >
                              <Lock size={14} aria-hidden="true" />
                              <span className="sr-only">Fechada</span>
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                disabled={mutation.isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void openEditDrawer(transaction);
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                                title="Editar"
                                aria-label="Editar lançamento"
                                className="transaction-action inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-blue-400 transition-colors hover:bg-blue-500/10 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Pencil size={15} strokeWidth={2} aria-hidden="true" />
                              </button>

                              <button
                                type="button"
                                disabled={mutation.isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteTransaction(transaction);
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                                title="Excluir"
                                aria-label="Excluir lançamento"
                                className="transaction-action inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                {!isLoading && transactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <p className="theme-text text-sm font-medium">
                        Nenhum lançamento encontrado.
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Ajuste a competência ou os filtros para ver outros
                        lançamentos.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {detailTransaction &&
            (() => {
              const isDetailLocked = isTransactionLocked(detailTransaction);
              const DetailIcon = getTransactionIcon(
                detailTransaction,
                getCategorySpecialType(detailTransaction),
              );

              return (
                <>
                  <div
                    aria-hidden="true"
                    className="transactions-overlay fixed inset-0 z-40 min-[1800px]:hidden"
                    onMouseDown={() => setDetailTransactionId(null)}
                  />

                  <aside
                    aria-labelledby="transaction-detail-title"
                    className="transactions-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-2xl min-[1800px]:static min-[1800px]:z-auto min-[1800px]:max-w-none min-[1800px]:rounded-2xl min-[1800px]:border min-[1800px]:shadow-sm"
                  >
                    <div className="theme-divider flex items-center justify-between gap-3 border-b px-5 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Detalhes do lançamento
                      </p>
                      <button
                        type="button"
                        onClick={() => setDetailTransactionId(null)}
                        className="theme-muted theme-hover flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
                        aria-label="Fechar detalhes"
                        title="Fechar"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-5">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${getTypeBadgeClass(
                            detailTransaction.type,
                          )}`}
                        >
                          <DetailIcon size={20} strokeWidth={2} />
                        </span>
                        <div className="min-w-0">
                          <h2
                            id="transaction-detail-title"
                            className="theme-text break-words text-lg font-semibold leading-snug tracking-tight"
                          >
                            {detailTransaction.description}
                          </h2>
                          <p
                            className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${getValueColorClass(
                              detailTransaction.type,
                            )}`}
                          >
                            {formatCurrency(detailTransaction.value)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`${badgeBaseClass} ${getTypeBadgeClass(detailTransaction.type)}`}
                        >
                          {detailTransaction.type}
                        </span>
                        <span
                          className={`${badgeBaseClass} ${getStatusBadgeClass(detailTransaction.status)}`}
                        >
                          {detailTransaction.status ?? "-"}
                        </span>
                        {isDetailLocked && (
                          <span
                            className={`${badgeBaseClass} gap-1 border border-white/10 text-slate-400`}
                          >
                            <Lock size={11} aria-hidden="true" />
                            Fechada
                          </span>
                        )}
                        {detailTransaction.bankroll_integration_group_id && (
                          <span
                            className={`${badgeBaseClass} bg-cyan-500/10 text-cyan-300`}
                          >
                            Origem: Bankroll Poker
                          </span>
                        )}
                        {detailTransaction.investment_integration_group_id && (
                          <span
                            className={`${badgeBaseClass} bg-cyan-500/10 text-cyan-300`}
                          >
                            Origem: Investimentos
                          </span>
                        )}
                      </div>

                      <dl className="mt-5">
                        <DetailField
                          label="Data"
                          value={
                            <>
                              {formatFullDate(detailTransaction.due_date)}
                              <span className="block text-xs font-normal text-slate-400">
                                {formatWeekday(detailTransaction.due_date, "long")}
                              </span>
                            </>
                          }
                        />
                        <DetailField
                          label="Competência"
                          value={
                            detailTransaction.competence?.name
                              ? formatCompetenceLabel(
                                  detailTransaction.competence.name,
                                )
                              : "-"
                          }
                        />
                        <DetailField
                          label="Conta / Cartão"
                          value={detailTransaction.account?.name ?? "-"}
                        />
                        <DetailField
                          label="Categoria"
                          value={detailTransaction.category?.name ?? "-"}
                        />
                        {detailTransaction.mode && (
                          <DetailField
                            label="Forma"
                            value={
                              transactionModeLabels[detailTransaction.mode] ??
                              detailTransaction.mode
                            }
                          />
                        )}
                      </dl>

                      {isDetailLocked && (
                        <p className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-slate-400">
                          <Lock size={14} className="mt-px shrink-0" aria-hidden="true" />
                          Conta/cartão fechado nesta competência. Edição e
                          exclusão estão bloqueadas.
                        </p>
                      )}
                    </div>

                    {!isDetailLocked && (
                      <div className="theme-divider flex flex-col gap-2 border-t px-5 py-4 sm:flex-row">
                        <button
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() => editFromDetail(detailTransaction)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Pencil size={15} aria-hidden="true" />
                          Editar lançamento
                        </button>
                        <ProcessingButton
                          busy={
                            mutation.pending ===
                            `handleDeleteTransaction:${detailTransaction.id}`
                          }
                          disabled={mutation.isPending}
                          onClick={() =>
                            void handleDeleteTransaction(detailTransaction)
                          }
                          className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          Excluir lançamento
                        </ProcessingButton>
                      </div>
                    )}
                  </aside>
                </>
              );
            })()}
        </div>
      </div>

      {showFilters && (
        <div
          className="transactions-page transactions-overlay fixed inset-0 z-50 flex justify-end"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowFilters(false);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-filters-title"
            className="transactions-drawer h-full w-full max-w-md overflow-y-auto border-l p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="advanced-filters-title"
                  className="theme-text text-xl font-bold"
                >
                  Mais filtros
                </h2>
                <p className="theme-muted text-sm">
                  Combine os critérios sem perder suas seleções.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="theme-muted theme-hover flex h-10 w-10 items-center justify-center rounded-xl"
                aria-label="Fechar filtros"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                  Categoria
                </span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                >
                  <option value="">Todas as categorias</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                  Tipo
                </span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                >
                  <option value="">Todos os tipos</option>
                  <option value="Despesa">Despesa</option>
                  <option value="Receita">Receita</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Pagamento de Fatura">
                    Pagamento de Fatura
                  </option>
                </select>
              </label>

              <label className="block">
                <span className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                  Status
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                >
                  <option value="">Todos os status</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Pago">Pago</option>
                  <option value="Recebido">Recebido</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={clearAdvancedFilters}
                className="theme-field theme-hover w-full rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Concluir
              </button>
            </div>
          </aside>
        </div>
      )}

      {isDrawerOpen && (
        <MutationScope busy={mutation.isPending} isLocked={mutation.isLocked}>
          <div
            className="transactions-page transactions-overlay fixed inset-0 z-50 flex justify-end"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDrawer();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="transactions-drawer h-full w-full max-w-xl overflow-y-auto border-l p-4 shadow-2xl sm:p-6"
            >
              <div className="mb-6">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="theme-text text-2xl font-semibold tracking-tight">
                      {editingTransactionId
                        ? "Editar lançamento"
                        : "Novo lançamento"}
                    </h2>

                    <p className="theme-muted mt-1 text-sm">
                      {editingTransactionId
                        ? "Altere as informações do lançamento."
                        : "Registre uma nova movimentação financeira."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="theme-muted theme-hover flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    aria-label="Fechar"
                    title="Fechar"
                  >
                    <X size={20} />
                  </button>
                </div>

                {!editingTransactionId && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "Despesa", label: "Despesa", icon: "↓" },
                        { value: "Receita", label: "Receita", icon: "↑" },
                        {
                          value: "Transferência",
                          label: "Transferência",
                          icon: "⇄",
                        },
                      ].map((option) => {
                        const selected = form.type === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => changeTransactionType(option.value)}
                            className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-2 transition ${
                              selected
                                ? option.value === "Despesa"
                                  ? "border-red-500 bg-red-500/10 text-red-500"
                                  : option.value === "Receita"
                                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                                    : "border-blue-500 bg-blue-500/10 text-blue-500"
                                : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                            }`}
                          >
                            <span className="text-xl leading-none">
                              {option.icon}
                            </span>

                            <span className="text-xs font-semibold sm:text-sm">
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {form.type !== "Pagamento de Fatura" ? (
                      <button
                        type="button"
                        onClick={() =>
                          changeTransactionType("Pagamento de Fatura")
                        }
                        className="theme-muted theme-hover text-sm font-medium"
                      >
                        Pagar uma fatura de cartão
                      </button>
                    ) : (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                        <span className="text-sm font-medium text-cyan-300">
                          Pagamento de fatura de cartão
                        </span>

                        <button
                          type="button"
                          onClick={() => changeTransactionType("Despesa")}
                          className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                        >
                          Voltar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                    Descrição
                  </label>

                  <input
                    value={form.description}
                    onChange={(event) => {
                      const description = event.target.value;

                      setForm((current) => ({
                        ...current,
                        description,
                      }));

                      const matchedSuggestion = descriptionSuggestions.find(
                        (suggestion) =>
                          suggestion.toLocaleLowerCase("pt-BR") ===
                          description.toLocaleLowerCase("pt-BR"),
                      );

                      if (matchedSuggestion) {
                        void applyDescriptionSuggestion(matchedSuggestion);
                      }
                    }}
                    placeholder="Ex.: Estacionamento"
                    list="transaction-description-suggestions"
                    className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  />

                  <datalist id="transaction-description-suggestions">
                    {descriptionSuggestions.map((description) => (
                      <option key={description} value={description} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                    Valor
                  </label>

                  <input
                    value={form.value}
                    onChange={(event) => {
                      const value = formatCurrencyInput(event.target.value);

                      setForm({
                        ...form,
                        value,
                      });

                      if (isFuelCategory) {
                        const total = parseCurrencyInput(value);
                        const liters = parsePtBrNumber(fuelForm.liters);

                        if (total > 0 && liters > 0) {
                          setFuelForm((current) => ({
                            ...current,
                            price_per_liter: (total / liters)
                              .toFixed(3)
                              .replace(".", ","),
                          }));
                        }
                      }
                    }}
                    placeholder="R$ 0,00"
                    inputMode="numeric"
                    className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  />
                </div>

                {form.type === "Transferência" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                        Conta de origem
                      </label>

                      <select
                        value={form.account_id}
                        onChange={(event) => {
                          const accountId = event.target.value;

                          setForm({
                            ...form,
                            account_id: accountId,
                            destination_account_id:
                              form.destination_account_id === accountId
                                ? ""
                                : form.destination_account_id,
                          });

                          updateTransactionDefaults({
                            account_id: accountId,
                          });
                        }}
                        className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      >
                        <option value="">Selecione</option>

                        {financialAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                        Conta de destino
                      </label>

                      <select
                        value={form.destination_account_id}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            destination_account_id: event.target.value,
                          })
                        }
                        className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      >
                        <option value="">Selecione</option>

                        {financialAccounts
                          .filter((account) => account.id !== form.account_id)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {form.type !== "Pagamento de Fatura" && (
                      <div>
                        <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                          Categoria
                        </label>

                        <select
                          value={form.category_id}
                          onChange={(event) => {
                            const categoryId = event.target.value;

                            const category = categories.find(
                              (item) => item.id === categoryId,
                            );

                            const fuel = category?.special_type === "fuel";

                            const type = category?.type ?? form.type;

                            setForm({
                              ...form,
                              category_id: categoryId,
                              type: fuel ? "Despesa" : type,
                              mode: fuel ? "unico" : form.mode,
                              status: getAutomaticStatus(
                                fuel ? "Despesa" : type,
                                form.due_date,
                              ),
                            });

                            updateTransactionDefaults({
                              category_id: categoryId,
                              type: fuel ? "Despesa" : type,
                            });
                          }}
                          className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                        >
                          <option value="">Selecione</option>

                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div
                      className={
                        form.type === "Pagamento de Fatura"
                          ? "sm:col-span-2"
                          : ""
                      }
                    >
                      <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                        {form.type === "Pagamento de Fatura"
                          ? "Cartão"
                          : "Conta / Cartão"}
                      </label>

                      <select
                        value={form.account_id}
                        onChange={(event) => {
                          const accountId = event.target.value;

                          setForm({
                            ...form,
                            account_id: accountId,
                          });

                          updateTransactionDefaults({
                            account_id: accountId,
                          });
                        }}
                        className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      >
                        <option value="">Selecione</option>

                        {formAccountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {form.type === "Pagamento de Fatura" && (
                  <div>
                    <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                      Conta utilizada no pagamento
                    </label>

                    <select
                      value={form.card_payment_account_id}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          card_payment_account_id: event.target.value,
                        })
                      }
                      className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                    >
                      <option value="">Selecione</option>

                      {financialAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isFuelCategory && (
                  <FuelTransactionFields
                    value={fuelForm}
                    onChange={setFuelForm}
                    onTotalChange={(total) =>
                      setForm((current) => ({
                        ...current,
                        value: formatCurrencyFromNumber(total),
                      }))
                    }
                    isEditing={editingTransactionId !== null}
                  />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                      Data
                    </label>

                    <input
                      value={form.due_date}
                      onChange={(event) => {
                        const newDate = event.target.value;
                        const newCompetenceId = getCompetenceIdByDate(newDate);
                        const newStatus = getAutomaticStatus(
                          form.type,
                          newDate,
                        );

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
                      className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                    />
                  </div>

                  <div>
                    <div>
                      <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                        Competência
                      </label>

                      <select
                        value={form.competence_id}
                        onChange={(event) => {
                          const competenceId = event.target.value;

                          setForm((current) => ({
                            ...current,
                            competence_id: competenceId,
                          }));

                          updateTransactionDefaults({
                            competence_id: competenceId,
                          });
                        }}
                        className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      >
                        <option value="">Selecione</option>

                        {competences.map((competence) => (
                          <option key={competence.id} value={competence.id}>
                            {formatCompetenceLabel(competence.name)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {form.type !== "Transferência" &&
                  form.type !== "Pagamento de Fatura" &&
                  !isFuelCategory && (
                    <div>
                      <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                        Forma
                      </label>

                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "unico", label: "Único" },
                          { value: "parcelado", label: "Parcelado" },
                          { value: "recorrente", label: "Recorrente" },
                        ].map((option) => {
                          const selected = form.mode === option.value;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                changeTransactionMode(option.value)
                              }
                              className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${
                                selected
                                  ? "border-blue-500 bg-blue-500/10 text-blue-300"
                                  : "theme-field theme-hover"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {!isFuelCategory &&
                  form.type !== "Transferência" &&
                  form.type !== "Pagamento de Fatura" &&
                  form.mode === "parcelado" &&
                  !editingTransactionId && (
                    <div>
                      <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                        Quantidade de parcelas
                      </label>

                      <input
                        value={form.installments}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            installments: event.target.value,
                          })
                        }
                        type="number"
                        min="2"
                        inputMode="numeric"
                        className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      />
                    </div>
                  )}

                {form.type !== "Transferência" &&
                  form.type !== "Pagamento de Fatura" && (
                    <label className="theme-field flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3">
                      <div>
                        <span className="theme-text block text-sm font-semibold">
                          {form.type === "Receita"
                            ? "Já foi recebido"
                            : "Já foi pago"}
                        </span>

                        <span className="theme-muted mt-0.5 block text-xs">
                          {form.status === "Pendente"
                            ? "Pendente"
                            : form.type === "Receita"
                              ? "Recebido"
                              : "Pago"}
                        </span>
                      </div>

                      <input
                        type="checkbox"
                        checked={
                          form.type === "Receita"
                            ? form.status === "Recebido"
                            : form.status === "Pago"
                        }
                        onChange={(event) =>
                          setForm({
                            ...form,
                            status: event.target.checked
                              ? form.type === "Receita"
                                ? "Recebido"
                                : "Pago"
                              : "Pendente",
                          })
                        }
                        className="h-5 w-5 accent-blue-600"
                      />
                    </label>
                  )}

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="theme-field theme-hover w-full rounded-xl border px-5 py-3 font-semibold"
                  >
                    Cancelar
                  </button>

                  <ProcessingButton
                    busy={mutation.pending === "saveTransaction"}
                    disabled={mutation.isPending}
                    onClick={saveTransaction}
                    className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
                  >
                    {editingTransactionId
                      ? "Atualizar lançamento"
                      : "Salvar lançamento"}
                  </ProcessingButton>
                </div>
              </div>
            </div>
          </div>
        </MutationScope>
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
