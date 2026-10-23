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
  Check,
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
import {
  createConversionProvider,
  createLinkedTransfer,
  deleteLinkedTransfer,
  loadConversionProviders,
  loadLinkedTransferLegs,
  updateLinkedTransfer,
  type CurrencyConversionProvider,
} from "@/src/services/transferService";
import {
  applyConversionDriverChange,
  buildConversionInput,
  calculateEffectiveRate,
  calculateQuotedRateDifference,
  CONVERSION_FEE_HINT,
  formatCompactRate,
  formatRateInput,
  formatSignedPercent,
  getConversionFeeCurrency,
  getQuoteUnitLabel,
  getTransferCurrencyMode,
  invertQuotedRateDirection,
  normalizeQuotedRate,
  parseRateInput,
  type ConversionFormValues,
  type TransferConversionInput,
} from "@/src/utils/currencyConversion";
import {
  createTransferIdempotencyKey,
  getLinkedTransferFormValues,
  LINKED_TRANSFER_DELETE_CONFIRMATION,
  LINKED_TRANSFER_INCONSISTENT_MESSAGE,
} from "@/src/utils/linkedTransfers";
import FuelTransactionFields, {
  emptyFuelForm,
  type FuelForm,
} from "@/src/components/fuel/FuelTransactionFields";
import { parsePtBrNumber } from "@/src/utils/fuelCalculations";
import {
  loadSuggestedFuelFormPatch,
  removeFuelRecordForTransaction,
} from "@/src/services/fuelService";
import { ensureAccountIsOpen } from "@/src/utils/accountLock";
import {
  ensureCompetenceExists,
  ensureCompetencesExist,
  toCompetenceKey,
} from "@/src/services/competenceService";
import {
  calculateAccountMovement,
} from "@/src/utils/balanceCalculations";
import {
  sortLatestTransactionsForDisplay,
  sortTransactionsByCashDirection,
} from "@/src/utils/transactionFilters";
import {
  isFinancialAccount,
  isFinancialLedgerAccount,
} from "@/src/utils/closingAccounts";
import {
  BROKERAGE_TRANSFER_HINTS,
  BROKERAGE_TRANSFER_LABELS,
  classifyTransferAccounts,
  getTransferDestinationOptions,
  getTransferOriginOptions,
  isBrokerageAccount,
} from "@/src/utils/brokerageTransfers";
import {
  checkCardPaymentCurrencies,
  checkTransferCurrencies,
  formatMoney,
  formatMoneyInput,
  getMoneyInputPlaceholder,
  parseMoneyInput,
} from "@/src/utils/currencies";
import { summarizeTransactionTotalsByCurrency } from "@/src/utils/transactionCurrencyTotals";
import {
  getAutomaticTransactionStatus,
  getStatusAfterDateChange,
  getTodayIsoDate,
} from "@/src/utils/transactionStatus";
import {
  checkLinkedInvoicePaymentEdit,
  INVOICE_PAYMENT_ACCOUNT_MESSAGE,
  isInvoicePaymentOverdue,
  LINKED_INVOICE_PAYMENT_DELETE_MESSAGE,
} from "@/src/utils/invoicePayment";
import {
  canConfirmPayment,
  getInvoiceDivergence,
  validatePaymentConfirmation,
  type InvoiceDivergence,
} from "@/src/utils/paymentConfirmation";
import { ensureCompetenceIsOpen } from "@/src/utils/competenceLock";
import ConfirmPaymentDialog from "../components/transactions/ConfirmPaymentDialog";
import AccountShortcutStrip from "../components/transactions/AccountShortcutStrip";
import {
  loadAccountPeriodBalances,
  loadTransactionShortcutSummaries,
  type TransactionShortcutSummary,
} from "@/src/services/transactionShortcutService";
import {
  resolveAccountPeriodBalancesView,
  type AccountPeriodBalancesRequest,
} from "@/src/utils/accountPeriodBalances";
import { getTemporal } from "@/src/utils/financialOverview";
import { useAccountImageUrls } from "@/src/hooks/useAccountImageUrls";
import {
  selectWithOptionalAccountColumns,
  sortTransactionShortcuts,
} from "@/src/utils/accountShortcuts";
import ViewModeToggle from "@/src/components/ui/viewMode/ViewModeToggle";
import { useViewMode } from "@/src/components/ui/viewMode/useViewMode";
import {
  confirmAction,
  notify,
  showNotice,
  showToast,
} from "@/src/components/ui/feedback/feedbackStore";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  closing_day: number | null;
  due_day: number | null;
  limit_amount: number | null;
  current_balance: number | null;
  currency: string | null;
  show_on_investments_dashboard: boolean;
  investment_account_kind: "BALANCE" | null;
  // Visuais; ausentes enquanto a migration 202610230001 não for aplicada.
  icon_key?: string | null;
  show_in_transaction_shortcuts?: boolean;
  transaction_shortcut_order?: number | null;
  image_path?: string | null;
};

const ACCOUNT_COLUMNS =
  "id, name, type, closing_day, due_day, limit_amount, current_balance, currency, show_on_investments_dashboard, investment_account_kind";

/** Hoje pela data local, como na Visão Financeira (saldo atual dos atalhos). */
function getLocalTodayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Opção de conta na transferência; corretoras identificadas no próprio texto. */
function formatTransferAccountOption(account: Account) {
  const currency = account.currency ? ` (${account.currency})` : "";
  return `${account.name}${currency}${isBrokerageAccount(account) ? " · corretora" : ""}`;
}

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
  account: {
    name: string;
    type: "Conta" | "Cartão";
    currency: string | null;
  } | null;
  category: { name: string } | null;
  competence: { name: string } | null;
  origin_account_id?: string | null;
  destination_account_id?: string | null;
  card_payment_account_id?: string | null;
  bankroll_integration_group_id?: string | null;
  bankroll_operation_type?: "deposit" | "withdrawal" | null;
  investment_integration_group_id?: string | null;
  investment_event_type?: "application" | "redemption" | null;
  transfer_group_id?: string | null;
};

// Fatura fechada. payment_transaction_id liga a fatura (cartão = account_id)
// ao lançamento "Pagamento de Fatura", que fica na conta pagadora.
type CardStatement = {
  id: string;
  account_id: string;
  competence_id: string;
  payment_transaction_id: string | null;
  payment_account_id: string | null;
  statement_total: number | null;
};

type AccountClosure = {
  account_id: string;
  competence_id: string;
  closing_balance: number | null;
};

const emptyConversionForm: ConversionFormValues = {
  destinationValue: "",
  providerId: "",
  feeAmount: "",
  feeCurrency: "",
  quotedRate: "",
  quotedRateBase: "destination",
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
      className={`min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3.5 shadow-sm ${
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
          className={`mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight ${toneClasses.value}`}
          title={value}
        >
          {value}
        </div>
      ) : (
        <p
          className={`mt-1.5 truncate font-semibold tabular-nums tracking-tight ${toneClasses.value}`}
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
  // Edição de transferência vinculada: o formulário representa a operação
  // inteira (origem -> destino), não a ponta clicada.
  const [editingTransferGroupId, setEditingTransferGroupId] = useState<
    string | null
  >(null);
  // Chave idempotente da nova transferência, mantida enquanto o formulário
  // estiver aberto para que um reenvio não crie outra transferência.
  const transferIdempotencyKeyRef = useRef<string | null>(null);
  // Conversão entre moedas (Fase 2): só usada quando as contas da
  // transferência têm moedas confirmadas diferentes.
  const [conversionForm, setConversionForm] =
    useState<ConversionFormValues>(emptyConversionForm);
  const [conversionProviders, setConversionProviders] = useState<
    CurrencyConversionProvider[]
  >([]);
  const [newProviderName, setNewProviderName] = useState<string | null>(null);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [showConversionOptions, setShowConversionOptions] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fuelForm, setFuelForm] = useState<FuelForm>(emptyFuelForm);
  const [competences, setCompetences] = useState<Competence[]>([]);
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
  const {
    mode: viewMode,
    setMode: changeViewMode,
    hasException: viewModeHasException,
    defaultMode: defaultViewMode,
  } = useViewMode("transactions");
  // Atalhos de contas: situação atual, independente dos filtros da listagem.
  const [shortcutsAvailable, setShortcutsAvailable] = useState(true);
  const [shortcutSummaries, setShortcutSummaries] = useState<
    Record<string, TransactionShortcutSummary>
  >({});
  const [shortcutSummariesState, setShortcutSummariesState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  // Incrementado depois de gravações, para os atalhos refletirem o novo saldo.
  const [shortcutRefreshToken, setShortcutRefreshToken] = useState(0);
  const [accountPeriodBalancesRequest, setAccountPeriodBalancesRequest] =
    useState<AccountPeriodBalancesRequest | null>(null);
  // Incrementado por "Tentar novamente" no resumo da conta.
  const [accountPeriodBalancesRetry, setAccountPeriodBalancesRetry] = useState(0);
  const [plannedCardLimit, setPlannedCardLimit] = useState(0);
  const [accountClosures, setAccountClosures] = useState<AccountClosure[]>([]);
  const loadTransactionsRequestIdRef = useRef(0);

  const [cardStatements, setCardStatements] = useState<CardStatement[]>([]);
  const [confirmingPayment, setConfirmingPayment] = useState<{
    transaction: Transaction;
    effectiveDate: string;
    divergence: InvoiceDivergence | null;
    error: string | null;
  } | null>(null);

  const transactionDefaultsKey = "finance-smart-transaction-defaults";

  function getAutomaticStatus(type: string, dueDate: string) {
    return getAutomaticTransactionStatus(type, dueDate);
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
  const accountImageUrls = useAccountImageUrls(
    financialLedgerAccounts.map((account) => account.image_path),
  );
  // Pagamento de fatura sai de conta bancária; um registro legado gravado num
  // cartão continua visível para que a troca seja explícita.
  const invoicePaymentAccountOptions = [
    ...financialAccounts,
    ...accounts.filter(
      (account) =>
        account.id === form.account_id &&
        !financialAccounts.some((item) => item.id === account.id),
    ),
  ];
  const formAccountOptions =
    form.type === "Transferência"
      ? financialAccounts
      : form.type === "Pagamento de Fatura"
        ? invoicePaymentAccountOptions
        : financialLedgerAccounts;

  // Transferência vinculada (nova ou em edição) aceita corretora de ativos
  // numa das pontas: aporte (financeira -> corretora) ou resgate (corretora ->
  // financeira). Transferência legada em edição segue só entre contas
  // financeiras. Corretoras não viram contas comuns nos demais tipos.
  const isLinkedTransferForm =
    form.type === "Transferência" &&
    (!editingTransactionId || editingTransferGroupId !== null);
  const transferOriginAccount =
    accounts.find((account) => account.id === form.account_id) ?? null;
  const transferDestinationAccount =
    accounts.find((account) => account.id === form.destination_account_id) ??
    null;
  const transferOriginOptions = isLinkedTransferForm
    ? getTransferOriginOptions(accounts)
    : financialAccounts;
  const transferDestinationOptions = isLinkedTransferForm
    ? getTransferDestinationOptions(accounts, transferOriginAccount)
    : financialAccounts.filter((account) => account.id !== form.account_id);
  const transferClassification = isLinkedTransferForm
    ? classifyTransferAccounts(transferOriginAccount, transferDestinationAccount)
    : null;

  function getLinkedStatement(transactionId: string | null | undefined) {
    if (!transactionId) return null;
    return (
      cardStatements.find(
        (statement) => statement.payment_transaction_id === transactionId,
      ) ?? null
    );
  }

  function getStatementLabel(statement: CardStatement | null) {
    if (!statement) return null;
    const cardName =
      accounts.find((account) => account.id === statement.account_id)?.name ??
      "Cartão";
    const competenceName = competences.find(
      (competence) => competence.id === statement.competence_id,
    )?.name;
    return competenceName
      ? `${cardName} · ${formatCompetenceLabel(competenceName)}`
      : cardName;
  }

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

  // A máscara acompanha a moeda da conta do formulário; o valor salvo continua
  // sendo o número nativo da conta, sem conversão.
  function getAccountCurrency(accountId: string) {
    return accounts.find((account) => account.id === accountId)?.currency ?? null;
  }

  function formatCurrencyFromNumber(value: number, accountId: string) {
    return formatMoney(value, getAccountCurrency(accountId));
  }

  function formatCurrencyInput(value: string, accountId: string) {
    return formatMoneyInput(value, getAccountCurrency(accountId));
  }

  function parseCurrencyInput(value: string) {
    return parseMoneyInput(value);
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
        .select("id, category_id, type, account_id")
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
      const isNewTransaction = editingTransactionId === null;

      // Em novo abastecimento, reaproveita a conta/cartão e os dados que se
      // repetem do último lançamento com a mesma descrição. Na edição, só a
      // categoria continua sendo sugerida, como antes.
      const suggestedAccountId =
        isFuel &&
        isNewTransaction &&
        data.account_id &&
        financialLedgerAccounts.some((account) => account.id === data.account_id)
          ? data.account_id
          : null;

      // Os dados do abastecimento são buscados antes de marcar a categoria para
      // que o bloco de combustível já monte com o veículo correto.
      const fuelPatch =
        isFuel && isNewTransaction
          ? await loadSuggestedFuelFormPatch(data.id, ownerId)
          : {};

      if (Object.keys(fuelPatch).length > 0) {
        setFuelForm((current) => ({ ...current, ...fuelPatch }));
      }

      setForm((current) => ({
        ...current,
        description,
        category_id: category.id,
        type: isFuel ? "Despesa" : current.type,
        mode: isFuel ? "unico" : current.mode,
        status: isFuel
          ? getAutomaticStatus("Despesa", current.due_date)
          : current.status,
        account_id: suggestedAccountId ?? current.account_id,
      }));

      updateTransactionDefaults({
        category_id: category.id,
        ...(isFuel
          ? {
              type: "Despesa",
              status: getAutomaticStatus("Despesa", form.due_date),
            }
          : {}),
        ...(suggestedAccountId ? { account_id: suggestedAccountId } : {}),
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
          transfer_group_id,
          account:accounts!transactions_account_id_fkey(name, type, currency),
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
      notify.error("Erro ao carregar lançamentos.");
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

  // Contas ativas com ícone/atalhos/imagem. Sem alguma migration visual,
  // repete a leitura sem aquelas colunas e a tela segue funcionando.
  async function loadActiveAccounts(ownerId: string) {
    const selectAccounts = (columns: string) =>
      supabase
        .from("accounts")
        .select(columns)
        .eq("owner_id", ownerId)
        .eq("active", true)
        .order("name", { ascending: true });

    const { response, available } = await selectWithOptionalAccountColumns(
      (optionalColumns) => selectAccounts(`${ACCOUNT_COLUMNS}${optionalColumns}`),
    );
    setShortcutsAvailable(available.shortcuts);

    return response;
  }

  async function loadReferenceData() {
    setIsLoading(true);

    const ownerId = await getCurrentUserId();

    // Leituras independentes em paralelo. Só a lista de competências espera a
    // garantia da competência atual, para já vir com ela.
    const [
      accountClosuresResponse,
      cardStatementsResponse,
      accountsResponse,
      categoriesResponse,
      competencesResponse,
      conversionProviders,
    ] = await Promise.all([
      supabase.from("account_closures").select("*").eq("owner_id", ownerId),
      supabase
        .from("credit_card_statements")
        .select(
          "id, account_id, competence_id, payment_transaction_id, payment_account_id, statement_total",
        )
        .eq("owner_id", ownerId),
      loadActiveAccounts(ownerId),
      supabase
        .from("categories")
        .select("id, name, type, special_type")
        .eq("owner_id", ownerId)
        .eq("active", true)
        .order("type", { ascending: false })
        .order("name", { ascending: true }),
      ensureCompetenceExists(new Date()).then(() =>
        supabase
          .from("competences")
          .select("id, month, year, name, status")
          .eq("owner_id", ownerId)
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
      ),
      loadConversionProviders().catch((error) => {
        console.error("Erro ao carregar provedores de conversão:", error);
        return [];
      }),
    ]);

    setAccountClosures(accountClosuresResponse.data ?? []);
    setCardStatements(cardStatementsResponse.data ?? []);

    const loadedAccounts = (accountsResponse.data ?? []) as unknown as Account[];
    setAccounts(loadedAccounts);
    if (categoriesResponse.data) setCategories(categoriesResponse.data);
    setConversionProviders(conversionProviders);

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

      // Com competência definida, o efeito dos filtros faz a carga (e desliga
      // o "carregando"); chamar aqui também repetia a consulta mais pesada.
      if (defaultCompetenceId) return;

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

  // Os atalhos dependem só das contas favoritas e de gravações; nunca da
  // busca, do período ou dos demais filtros da listagem.
  useEffect(() => {
    const favorites = sortTransactionShortcuts(
      accounts.filter(isFinancialLedgerAccount),
    );
    let cancelled = false;

    setShortcutSummariesState("loading");
    loadTransactionShortcutSummaries({
      accounts: favorites,
      today: getLocalTodayIsoDate(),
    })
      .then((summaries) => {
        if (cancelled) return;
        setShortcutSummaries(summaries);
        setShortcutSummariesState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Erro ao carregar atalhos de contas:", error);
        setShortcutSummariesState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [accounts, shortcutRefreshToken]);

  // Saldos canônicos da conta selecionada na competência do resumo. Também
  // não dependem da busca nem de tipo/status/categoria.
  useEffect(() => {
    const account = accounts.find((item) => item.id === accountFilter);
    const competence = competences.find((item) => item.id === competenceFilter);
    if (account?.type !== "Conta" || !competence) return;

    // Cada resultado leva a seleção que o pediu; respostas de uma seleção
    // anterior são descartadas (cancelled) e nunca aparecem na atual.
    const key = { accountId: account.id, competenceId: competence.id };
    let cancelled = false;
    setAccountPeriodBalancesRequest({ ...key, status: "loading", balances: null });
    loadAccountPeriodBalances({
      account,
      year: competence.year,
      month: competence.month,
      today: getLocalTodayIsoDate(),
    })
      .then((balances) => {
        if (cancelled) return;
        setAccountPeriodBalancesRequest({ ...key, status: "ready", balances });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Erro ao carregar saldos da conta:", error);
        setAccountPeriodBalancesRequest({ ...key, status: "error", balances: null });
      });

    return () => {
      cancelled = true;
    };
  }, [
    accountFilter,
    competenceFilter,
    accounts,
    competences,
    shortcutRefreshToken,
    accountPeriodBalancesRetry,
  ]);

  function refreshShortcutSummaries() {
    setShortcutRefreshToken((token) => token + 1);
  }

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
    // Corretora só volta como padrão numa nova transferência (aporte/resgate);
    // nunca como conta de receita/despesa.
    const storedAccount = accounts.find(
      (account) => account.id === storedDefaults?.account_id,
    );
    const defaultAccountId =
      storedAccount &&
      isBrokerageAccount(storedAccount) &&
      defaultType !== "Transferência"
        ? ""
        : (storedDefaults?.account_id ?? "");

    setEditingTransactionId(null);
    setEditingTransferGroupId(null);
    transferIdempotencyKeyRef.current = null;
    setConversionForm(emptyConversionForm);
    setNewProviderName(null);
    setShowConversionOptions(false);
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
      account_id: defaultAccountId,
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
      await showNotice({
        tone: "warning",
        message:
          "Esta operação está vinculada ao Financeiro e deve ser editada pelo módulo Bankroll.",
      });
      router.push(
        `/bankroll/transactions?action=${transaction.bankroll_operation_type ?? "deposit"}`,
      );
      return;
    }

    if (transaction.investment_integration_group_id) {
      await showNotice({
        tone: "warning",
        message:
          "Esta transferência pertence a uma conta por saldo e deve ser editada pelo módulo de Investimentos.",
      });
      router.push("/investments/operations");
      return;
    }

    if (transaction.transfer_group_id) {
      await openLinkedTransferEditDrawer(transaction);
      return;
    }

    if (isTransactionLocked(transaction)) {
      notify.warning("Esta conta/cartão já está fechado nesta competência.");
      return;
    }

    setEditingTransactionId(transaction.id);

    setForm({
      description: transaction.description ?? "",
      value: formatCurrencyFromNumber(
        Number(transaction.value ?? 0),
        transaction.account_id ?? "",
      ),
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

  // Qualquer ponta abre a operação completa: origem/destino vêm da estrutura
  // das pontas, não da linha clicada.
  async function openLinkedTransferEditDrawer(transaction: Transaction) {
    let legs: Awaited<ReturnType<typeof loadLinkedTransferLegs>>;

    try {
      legs = await loadLinkedTransferLegs(transaction.transfer_group_id ?? "");
    } catch (error) {
      console.error("Erro ao carregar transferência vinculada:", error);
      notify.warning(LINKED_TRANSFER_INCONSISTENT_MESSAGE);
      return;
    }

    if (!legs) {
      notify.warning(LINKED_TRANSFER_INCONSISTENT_MESSAGE);
      return;
    }

    if (
      isTransactionLocked({ ...transaction, ...legs.outgoing }) ||
      isTransactionLocked({ ...transaction, ...legs.incoming })
    ) {
      notify.warning("Esta conta/cartão já está fechado nesta competência.");
      return;
    }

    const values = getLinkedTransferFormValues(legs);

    setEditingTransactionId(transaction.id);
    setEditingTransferGroupId(values.transferGroupId);
    setFuelForm(emptyFuelForm);
    setNewProviderName(null);

    // Conversão: carrega valor recebido, provedor, taxa e cotação para não
    // perder metadados ao salvar. Mesma moeda: formulário de conversão vazio.
    const conversion = legs.conversion;
    setConversionForm(
      conversion
        ? {
            destinationValue: formatCurrencyFromNumber(
              values.destinationValue,
              values.destinationAccountId,
            ),
            providerId: conversion.provider_id,
            feeAmount:
              conversion.fee_amount === null
                ? ""
                : formatMoney(
                    Number(conversion.fee_amount),
                    conversion.fee_currency,
                  ),
            feeCurrency: conversion.fee_currency ?? "",
            quotedRate: formatRateInput(conversion.quoted_rate),
            quotedRateBase:
              conversion.quoted_rate_base_currency &&
              conversion.quoted_rate_base_currency ===
                getAccountCurrency(values.originAccountId)
                ? "origin"
                : "destination",
          }
        : emptyConversionForm,
    );
    // Configuração fora do padrão (taxa no destino ou cotação invertida)
    // fica visível ao abrir; o valor recebido salvo nunca é recalculado aqui.
    const originCurrency = getAccountCurrency(values.originAccountId);
    setShowConversionOptions(
      Boolean(
        conversion &&
          ((conversion.fee_currency !== null &&
            conversion.fee_currency !== originCurrency) ||
            conversion.quoted_rate_base_currency === originCurrency),
      ),
    );

    setForm({
      description: values.description,
      value: formatCurrencyFromNumber(values.value, values.originAccountId),
      due_date: values.dueDate,
      type: "Transferência",
      mode: "unico",
      status: "Pago",
      installments: "2",
      account_id: values.originAccountId,
      card_payment_account_id: "",
      origin_account_id: values.originAccountId,
      destination_account_id: values.destinationAccountId,
      category_id: "",
      competence_id: values.competenceId,
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

      // Transferência vinculada: as regras de conta (inclusive aporte/resgate
      // com corretora, mesma moeda) são as de resolve_transfer_accounts, que o
      // banco valida de novo. Legado e demais tipos seguem como antes.
      const isLinkedTransferSave =
        form.type === "Transferência" &&
        (!editingTransactionId || editingTransferGroupId !== null);
      const linkedTransferAccounts = isLinkedTransferSave
        ? classifyTransferAccounts(selectedAccount, selectedDestination)
        : null;

      if (linkedTransferAccounts?.kind === "blocked") {
        notify.warning(linkedTransferAccounts.message);
        return;
      }

      if (
        !selectedAccount ||
        (isLinkedTransferSave
          ? false
          : !isFinancialLedgerAccount(selectedAccount) ||
            (form.type === "Transferência" &&
              (!isFinancialAccount(selectedAccount) ||
                !selectedDestination ||
                !isFinancialAccount(selectedDestination))))
      ) {
        notify.warning(
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
          (!editingTransactionId || editingTransferGroupId) &&
          (!form.account_id ||
            !form.destination_account_id ||
            form.account_id === form.destination_account_id)) ||
        (form.type !== "Transferência" && !form.account_id) ||
        (form.type !== "Transferência" &&
          form.type !== "Pagamento de Fatura" &&
          !form.category_id)
      ) {
        notify.warning("Preencha todos os campos obrigatórios.");
        return;
      }

      // Pagamento de fatura: a conta pagadora é bancária e, quando o
      // lançamento está vinculado a uma fatura, valor e tipo seguem a fatura.
      const editingOriginal = editingTransactionId
        ? transactions.find(
            (transaction) => transaction.id === editingTransactionId,
          )
        : undefined;
      const linkedStatement =
        editingOriginal?.type === "Pagamento de Fatura"
          ? getLinkedStatement(editingTransactionId)
          : null;

      if (
        form.type === "Pagamento de Fatura" &&
        !isFinancialAccount(selectedAccount)
      ) {
        notify.warning(INVOICE_PAYMENT_ACCOUNT_MESSAGE);
        return;
      }

      if (linkedStatement && editingOriginal) {
        const editCheck = checkLinkedInvoicePaymentEdit({
          originalValue: Number(editingOriginal.value),
          newValue: numericValue,
          newType: form.type,
          statementTotal: Number(linkedStatement.statement_total ?? 0),
          currency: selectedAccount.currency,
        });

        if (!editCheck.ok) {
          notify.warning(editCheck.message);
          return;
        }

        const paymentCurrencyCheck = checkCardPaymentCurrencies(
          getAccountCurrency(linkedStatement.account_id),
          selectedAccount.currency,
        );

        if (!paymentCurrencyCheck.allowed) {
          notify.warning(paymentCurrencyCheck.message);
          return;
        }
      }

      // Transferências vinculadas (novas ou em edição) aceitam moedas
      // diferentes como conversão; conta sem moeda + conta confirmada segue
      // bloqueada. Pontas legadas não têm conversão: continuam exigindo a mesma
      // moeda e seguem editáveis enquanto as contas não mudarem.
      const isLinkedTransferFlow =
        form.type === "Transferência" &&
        (!editingTransactionId || editingTransferGroupId !== null);
      const transferCurrencyMode = isLinkedTransferFlow
        ? getTransferCurrencyMode(
            selectedAccount.currency,
            getAccountCurrency(form.destination_account_id),
          )
        : null;

      if (transferCurrencyMode?.mode === "blocked") {
        notify.warning(transferCurrencyMode.message);
        return;
      }

      // Moedas diferentes: valor recebido e provedor obrigatórios; taxa e
      // cotação opcionais. Mesma moeda não envia dados de conversão.
      let conversionInput: TransferConversionInput | null = null;
      if (transferCurrencyMode?.mode === "conversion") {
        const conversionResult = buildConversionInput(
          {
            ...conversionForm,
            feeCurrency: getConversionFeeCurrency(
              conversionForm.feeCurrency,
              transferCurrencyMode,
            ),
          },
          transferCurrencyMode,
        );
        if (!conversionResult.ok) {
          notify.warning(conversionResult.message);
          return;
        }
        conversionInput = conversionResult.conversion;
      }

      if (form.type === "Transferência" && !isLinkedTransferFlow) {
        const originalTransaction = editingTransactionId
          ? transactions.find(
              (transaction) => transaction.id === editingTransactionId,
            )
          : undefined;
        const transferAccountsChanged =
          !originalTransaction ||
          originalTransaction.type !== "Transferência" ||
          originalTransaction.account_id !== form.account_id ||
          (originalTransaction.destination_account_id ?? "") !==
            form.destination_account_id;
        const counterpartAccountId =
          editingTransactionId && form.account_id === form.destination_account_id
            ? form.origin_account_id
            : form.destination_account_id;
        const currencyCheck = transferAccountsChanged
          ? checkTransferCurrencies(
              selectedAccount.currency,
              getAccountCurrency(counterpartAccountId),
            )
          : null;

        if (currencyCheck && !currencyCheck.allowed) {
          notify.warning(currencyCheck.message);
          return;
        }
      }

      if (
        form.mode === "parcelado" &&
        (!installmentCount || installmentCount < 2)
      ) {
        notify.warning("Informe uma quantidade de parcelas maior que 1.");
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
            notify.warning("Preencha todos os dados obrigatórios do abastecimento.");
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
            !(await confirmAction({
              title: "Hodômetro menor que o último registro",
              message: `O hodômetro é inferior ao último registro (${last.odometer} km). Deseja continuar?`,
              tone: "warning",
              confirmLabel: "Continuar",
            }))
          )
            return;
          const lock = await ensureAccountIsOpen({
            accountId: form.account_id,
            competenceId: effectiveCompetenceId,
          });
          if (!lock.allowed) {
            notify.warning(lock.message);
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
          refreshShortcutSummaries();
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

        // Nova transferência ou edição de transferência vinculada: as duas
        // pontas são gravadas juntas pelas RPCs (Pago na origem, Recebido no
        // destino, mesmo transfer_group_id). Transferências legadas seguem o
        // fluxo de lançamento individual abaixo.
        if (
          form.type === "Transferência" &&
          (!editingTransactionId || editingTransferGroupId)
        ) {
          for (const accountId of [
            form.account_id,
            form.destination_account_id,
          ]) {
            if (!accountId) {
              notify.warning("Conta/cartão inválido para validar fechamento.");
              return;
            }

            const lock = await ensureAccountIsOpen({
              accountId,
              competenceId: effectiveCompetenceId,
            });

            if (!lock.allowed) {
              notify.warning(lock.message);
              return;
            }
          }

          const transferInput = {
            originAccountId: form.account_id,
            destinationAccountId: form.destination_account_id,
            dueDate: form.due_date,
            competenceId: effectiveCompetenceId,
            amount: numericValue,
            description: form.description,
            conversion: conversionInput,
          };

          if (editingTransferGroupId) {
            await updateLinkedTransfer({
              ...transferInput,
              transferGroupId: editingTransferGroupId,
            });
          } else {
            transferIdempotencyKeyRef.current ??=
              createTransferIdempotencyKey();
            await createLinkedTransfer({
              ...transferInput,
              idempotencyKey: transferIdempotencyKeyRef.current,
            });
          }

          if (!editingTransactionId) {
            saveTransactionDefaults(form);
          }

          closeDrawer();

          refreshShortcutSummaries();
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

        // Pagamento de fatura novo nasce Pendente; na edição o status atual é
        // mantido (só "Confirmar pagamento" quita).
        const savedStatus =
          form.type === "Pagamento de Fatura" && !editingTransactionId
            ? "Pendente"
            : form.status;

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
                  status: savedStatus,
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
                  status: savedStatus,
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
            notify.warning("Conta/cartão inválido para validar fechamento.");
            return;
          }

          const lock = await ensureAccountIsOpen({
            accountId: transaction.account_id,
            competenceId: transaction.competence_id,
          });

          if (!lock.allowed) {
            notify.warning(lock.message);
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

        // A fatura acompanha a conta pagadora do lançamento vinculado; o
        // vínculo (payment_transaction_id) e o total não mudam.
        if (
          linkedStatement &&
          linkedStatement.payment_account_id !== form.account_id
        ) {
          const { error: statementError } = await supabase
            .from("credit_card_statements")
            .update({
              payment_account_id: form.account_id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", linkedStatement.id)
            .eq("owner_id", ownerId);

          if (statementError) {
            throw new Error(
              `Pagamento salvo, mas não foi possível atualizar a conta pagadora da fatura: ${statementError.message}`,
            );
          }

          setCardStatements((current) =>
            current.map((statement) =>
              statement.id === linkedStatement.id
                ? { ...statement, payment_account_id: form.account_id }
                : statement,
            ),
          );
        }

        if (editingTransactionId)
          await removeFuelRecordForTransaction(editingTransactionId);

        if (!editingTransactionId) {
          saveTransactionDefaults(form);
        }

        closeDrawer();

        refreshShortcutSummaries();
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

        notify.error(
          error instanceof Error ? error.message : "Erro ao salvar lançamento.",
        );
      }
    });
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    return mutation.run(
      "handleDeleteTransaction" + ":" + transaction.id,
      async () => {
        if (transaction.transfer_group_id) {
          await deleteLinkedTransferFromList(transaction);
          return;
        }

        if (getLinkedStatement(transaction.id)) {
          notify.warning(LINKED_INVOICE_PAYMENT_DELETE_MESSAGE);
          return;
        }

        if (isTransactionLocked(transaction)) {
          notify.warning("Esta conta/cartão já está fechado nesta competência.");
          return;
        }

        const confirmed = await confirmAction({
          title: "Excluir lançamento",
          message:
            "Tem certeza que deseja excluir este lançamento? Se ele estiver conciliado, a conciliação será desfeita automaticamente.",
          tone: "danger",
          confirmLabel: "Excluir",
        });

        if (!confirmed) return;

        try {
          const result = await deleteTransactionService(transaction.id);

          if (!result.success) {
            notify.error(result.message ?? "Erro ao excluir lançamento.");
            return;
          }

          refreshShortcutSummaries();
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

          notify.error(
            error instanceof Error
              ? error.message
              : "Erro ao excluir lançamento.",
          );
        }
      },
    );
  }

  function getPaymentConfirmationContext(transaction: Transaction) {
    const account = accounts.find((item) => item.id === transaction.account_id);
    return {
      isBankAccount: account ? isFinancialAccount(account) : false,
      isFuel: getCategorySpecialType(transaction) === "fuel",
    };
  }

  function canConfirm(transaction: Transaction) {
    return canConfirmPayment(
      transaction,
      getPaymentConfirmationContext(transaction),
    );
  }

  function getStatementTotal(transactionId: string) {
    const statement = getLinkedStatement(transactionId);
    return statement && statement.statement_total !== null
      ? Number(statement.statement_total)
      : null;
  }

  function openConfirmPayment(transaction: Transaction) {
    setConfirmingPayment({
      transaction,
      effectiveDate: getTodayIsoDate(),
      // Divergência conhecida já aparece ao abrir; confirmar com ela visível
      // é a confirmação explícita.
      divergence:
        transaction.type === "Pagamento de Fatura"
          ? getInvoiceDivergence(
              Number(transaction.value),
              getStatementTotal(transaction.id),
              getAccountCurrency(transaction.account_id),
            )
          : null,
      error: null,
    });
  }

  function closeConfirmPayment() {
    setConfirmingPayment(null);
  }

  // Confirmação rápida: só status = "Pago" e due_date = data efetiva. Conta,
  // competência, valor e vínculo com a fatura são preservados; o saldo segue a
  // regra por data, então não há segundo débito nem ajuste automático.
  async function confirmPayment() {
    if (!confirmingPayment) return;
    const { transaction, effectiveDate } = confirmingPayment;
    const divergenceShown = confirmingPayment.divergence !== null;

    const fail = (message: string) =>
      setConfirmingPayment((current) =>
        current ? { ...current, error: message } : current,
      );

    return mutation.run(`confirmPayment:${transaction.id}`, async () => {
      try {
        setConfirmingPayment((current) =>
          current ? { ...current, error: null } : current,
        );
        const ownerId = await getCurrentUserId();

        // Revalida com os dados atuais do banco (outra aba pode ter mudado).
        const { data: current, error: currentError } = await supabase
          .from("transactions")
          .select(
            "id, type, status, due_date, value, account_id, competence_id, category_id, bankroll_integration_group_id, investment_integration_group_id, transfer_group_id",
          )
          .eq("id", transaction.id)
          .eq("owner_id", ownerId)
          .single();

        if (currentError || !current) {
          fail("Lançamento não encontrado. Atualize a lista e tente novamente.");
          return;
        }

        let statementTotal: number | null = null;
        if (current.type === "Pagamento de Fatura") {
          const { data: statement, error: statementError } = await supabase
            .from("credit_card_statements")
            .select("statement_total")
            .eq("owner_id", ownerId)
            .eq("payment_transaction_id", transaction.id)
            .limit(1)
            .maybeSingle();

          if (statementError) throw new Error(statementError.message);
          statementTotal =
            statement && statement.statement_total !== null
              ? Number(statement.statement_total)
              : null;
        }

        const validation = validatePaymentConfirmation({
          transaction: { ...current, value: Number(current.value) },
          context: getPaymentConfirmationContext({ ...transaction, ...current }),
          effectiveDate,
          today: getTodayIsoDate(),
          statementTotal,
          currency: getAccountCurrency(current.account_id),
          divergenceAcknowledged: divergenceShown,
        });

        if (!validation.ok) {
          if (validation.reason === "divergence") {
            // Divergência que não estava na tela: mostra e pede novo clique.
            const { divergence } = validation;
            setConfirmingPayment((state) =>
              state ? { ...state, divergence, error: null } : state,
            );
            return;
          }
          fail(validation.message);
          return;
        }

        // Fechamentos: competência original e a do mês da data efetiva (o
        // saldo é por data, então um mês fechado não pode mudar por aqui).
        const effectiveCompetenceId = competences.find(
          (competence) => competence.name === toCompetenceKey(effectiveDate),
        )?.id;
        const competenceIds = Array.from(
          new Set(
            [current.competence_id, effectiveCompetenceId].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        );

        for (const competenceId of competenceIds) {
          const competenceLock = await ensureCompetenceIsOpen(competenceId);
          if (!competenceLock.allowed) {
            fail(competenceLock.message);
            return;
          }

          const accountLock = await ensureAccountIsOpen({
            accountId: current.account_id,
            competenceId,
          });
          if (!accountLock.allowed) {
            fail(accountLock.message);
            return;
          }
        }

        // O filtro por status impede confirmação duplicada (clique duplo,
        // outra aba): só um UPDATE encontra a linha ainda Pendente.
        const { data: updated, error: updateError } = await supabase
          .from("transactions")
          .update({ status: "Pago", due_date: effectiveDate })
          .eq("id", transaction.id)
          .eq("owner_id", ownerId)
          .eq("status", "Pendente")
          .select("id");

        if (updateError) throw new Error(updateError.message);

        const wasUpdated = Boolean(updated && updated.length > 0);

        // Atualiza a tela sem recarregar a lista inteira.
        setTransactions((list) =>
          statusFilter === "Pendente"
            ? list.filter((item) => item.id !== transaction.id)
            : list.map((item) =>
                item.id === transaction.id
                  ? {
                      ...item,
                      status: "Pago",
                      due_date: wasUpdated ? effectiveDate : item.due_date,
                    }
                  : item,
              ),
        );
        setConfirmingPayment(null);

        if (wasUpdated) {
          refreshShortcutSummaries();
          showToast(
            "success",
            "Pagamento confirmado",
            `Marcado como pago em ${formatFullDate(effectiveDate)}.`,
          );
        } else {
          showToast(
            "info",
            "Pagamento já confirmado",
            "Este lançamento já estava pago. Nada foi alterado.",
          );
        }
      } catch (error) {
        console.error("Erro ao confirmar pagamento:", error);
        fail(
          error instanceof Error
            ? error.message
            : "Não foi possível confirmar o pagamento. Tente novamente.",
        );
      }
    });
  }

  async function saveNewConversionProvider() {
    if (newProviderName === null || isSavingProvider) return;
    setIsSavingProvider(true);

    try {
      const provider = await createConversionProvider(newProviderName);
      setConversionProviders((current) =>
        [...current, provider].sort((left, right) =>
          left.name.localeCompare(right.name, "pt-BR"),
        ),
      );
      setConversionForm((current) => ({ ...current, providerId: provider.id }));
      setNewProviderName(null);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Erro ao criar provedor.");
    } finally {
      setIsSavingProvider(false);
    }
  }

  // Qualquer ponta exclui a transferência inteira; a RPC valida o período das
  // duas pontas e remove ambas na mesma transação.
  async function deleteLinkedTransferFromList(transaction: Transaction) {
    if (isTransactionLocked(transaction)) {
      notify.warning("Esta conta/cartão já está fechado nesta competência.");
      return;
    }

    if (
      !(await confirmAction({
        title: "Excluir transferência",
        message: LINKED_TRANSFER_DELETE_CONFIRMATION,
        tone: "danger",
        confirmLabel: "Excluir",
      }))
    )
      return;

    try {
      await deleteLinkedTransfer(transaction.transfer_group_id ?? "");

      refreshShortcutSummaries();
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
      console.error("Erro ao excluir transferência:", error);

      notify.error(
        error instanceof Error ? error.message : "Erro ao excluir transferência.",
      );
    }
  }

  const selectedCompetence = competences.find(
    (item) => item.id === competenceFilter,
  );
  const selectedCategory = categories.find(
    (category) => category.id === form.category_id,
  );
  const isFuelCategory = selectedCategory?.special_type === "fuel";

  // Bloco de conversão: só em transferência vinculada (nova ou em edição)
  // entre contas com moedas confirmadas diferentes. Legado não muda.
  // Aporte/resgate com corretora nunca usa conversão (mesma moeda exigida).
  const transferFormCurrencyMode =
    form.type === "Transferência" &&
    (!editingTransactionId || editingTransferGroupId !== null) &&
    transferClassification?.kind === "traditional" &&
    form.account_id &&
    form.destination_account_id
      ? getTransferCurrencyMode(
          getAccountCurrency(form.account_id),
          getAccountCurrency(form.destination_account_id),
        )
      : null;
  const conversionCurrencies =
    transferFormCurrencyMode?.mode === "conversion"
      ? transferFormCurrencyMode
      : null;
  const conversionEffectiveRate = conversionCurrencies
    ? calculateEffectiveRate(
        parseCurrencyInput(form.value),
        parseCurrencyInput(conversionForm.destinationValue),
      )
    : null;
  const conversionQuotedRate = parseRateInput(conversionForm.quotedRate);
  const conversionNormalizedQuotedRate =
    conversionCurrencies && conversionQuotedRate
      ? normalizeQuotedRate({
          quotedRate: conversionQuotedRate,
          baseCurrency:
            conversionForm.quotedRateBase === "destination"
              ? conversionCurrencies.destinationCurrency
              : conversionCurrencies.originCurrency,
          quoteCurrency:
            conversionForm.quotedRateBase === "destination"
              ? conversionCurrencies.originCurrency
              : conversionCurrencies.destinationCurrency,
          originCurrency: conversionCurrencies.originCurrency,
          destinationCurrency: conversionCurrencies.destinationCurrency,
        })
      : null;
  const conversionQuotedDifference =
    conversionEffectiveRate && conversionNormalizedQuotedRate
      ? calculateQuotedRateDifference(
          conversionEffectiveRate,
          conversionNormalizedQuotedRate,
        )
      : null;
  const conversionFeeCurrency = conversionCurrencies
    ? getConversionFeeCurrency(conversionForm.feeCurrency, conversionCurrencies)
    : "";
  // Recalcula o valor recebido SÓ quando muda um campo determinante (valor
  // debitado, cotação, taxa, moeda da taxa, direção). Abrir a edição ou
  // digitar o valor recebido não passa por aqui, então o valor real
  // informado à mão é preservado até a próxima mudança determinante.
  function changeConversionDriver(
    patch: Parameters<typeof applyConversionDriverChange>[1],
    sourceAmount = parseCurrencyInput(form.value),
  ) {
    if (!conversionCurrencies) return;
    const context = {
      originCurrency: conversionCurrencies.originCurrency,
      destinationCurrency: conversionCurrencies.destinationCurrency,
      sourceAmount,
    };
    setConversionForm((current) =>
      applyConversionDriverChange(current, patch, context),
    );
  }

  const visibleConversionProviders = conversionProviders.filter(
    (provider) => provider.active || provider.id === conversionForm.providerId,
  );

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

  // Saldos da conta selecionada: regra canônica (mesma dos atalhos), sem
  // depender de busca/tipo/status/categoria. Só a movimentação acompanha os
  // filtros da listagem.
  const periodBalancesView = resolveAccountPeriodBalancesView({
    selectedAccount,
    competenceId: competenceFilter,
    request: accountPeriodBalancesRequest,
  });
  const periodBalances = periodBalancesView.balances;
  const periodMovement = selectedAccount
    ? calculateAccountMovement(selectedAccount.id, transactions)
    : 0;
  const hasListFilters = Boolean(
    debouncedSearchTerm || typeFilter || statusFilter || categoryFilter,
  );
  const periodTemporal = selectedCompetence
    ? getTemporal(
        selectedCompetence.year,
        selectedCompetence.month,
        getLocalTodayIsoDate(),
      )
    : "current";

  function formatPeriodBalance(value: number | null | undefined) {
    if (value === null || value === undefined) {
      return periodBalancesView.status === "error" ? "Indisponível" : "…";
    }
    return formatSummaryCurrency(value);
  }

  function balanceTone(
    value: number | null | undefined,
    positiveTone: SummaryTone,
  ): SummaryTone {
    if (value === null || value === undefined) return "neutral";
    return value >= 0 ? positiveTone : "negative";
  }

  // Sem conta selecionada, o resumo mostra somente a moeda principal (BRL);
  // as demais moedas nunca são somadas a ele. Os valores de uma conta em
  // outra moeda aparecem ao selecioná-la (atalho ou "Outras contas").
  const [primaryCurrencyTotals] =
    summarizeTransactionTotalsByCurrency(transactions);
  const {
    income: totalIncome,
    directExpenses: totalDirectExpenses,
    invoicePayments: totalInvoicePayments,
    cashFlowResult,
  } = primaryCurrencyTotals.totals;
  const selectedAccountCurrency = selectedAccount?.currency ?? null;

  function formatSummaryCurrency(value: number) {
    return formatMoney(
      value,
      selectedAccount ? selectedAccountCurrency : primaryCurrencyTotals.currency,
    );
  }

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

  // Etiquetas removíveis dos filtros de "Mais filtros". O filtro de conta já
  // aparece nos atalhos e não é repetido aqui.
  const activeAdvancedFilters = [
    typeFilter && {
      key: "type",
      label: `Tipo: ${typeFilter}`,
      clear: () => setTypeFilter(""),
    },
    statusFilter && {
      key: "status",
      label: `Status: ${statusFilter}`,
      clear: () => setStatusFilter(""),
    },
    categoryFilter && {
      key: "category",
      label: `Categoria: ${
        categories.find((category) => category.id === categoryFilter)?.name ??
        "selecionada"
      }`,
      clear: () => setCategoryFilter(""),
    },
  ].filter((item): item is { key: string; label: string; clear: () => void } =>
    Boolean(item),
  );

  // Sem conta: movimentações do período/listagem. Com conta: saldos da conta
  // no mês (regra canônica) + movimentação filtrada. Atalhos = situação atual.
  const summaryPeriodLabel = selectedCompetence
    ? formatCompetenceLabel(selectedCompetence.name)
    : "período selecionado";
  const summaryTitle = selectedAccount
    ? `${selectedAccount.type === "Cartão" ? "Fatura" : "Resumo"} de ${summaryPeriodLabel} · ${selectedAccount.name}${
        listMode === "latest" ? " · lista: últimos 20 cadastrados" : ""
      }`
    : listMode === "latest"
      ? "Resumo dos últimos 20 cadastrados"
      : `Movimentações de ${summaryPeriodLabel}`;

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

  function openTransactionDetail(transaction: Transaction) {
    setDetailTransactionId(transaction.id);
  }

  // Shared by the list and card views so both keep identical edit/delete behavior.
  function renderTransactionActions(transaction: Transaction, isLocked: boolean) {
    if (isLocked) {
      return (
        <span
          className="inline-flex h-8 w-8 items-center justify-center text-slate-400"
          title="Conta/cartão fechado nesta competência"
        >
          <Lock size={14} aria-hidden="true" />
          <span className="sr-only">Fechada</span>
        </span>
      );
    }

    return (
      <div className="flex items-center justify-end gap-1">
        {canConfirm(transaction) && (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.stopPropagation();
              openConfirmPayment(transaction);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            title="Confirmar pagamento"
            aria-label="Confirmar pagamento"
            className="transaction-action inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}

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
    );
  }

  // Status salvo + indicação visual "Vencido" (não altera o status gravado).
  function renderStatusBadges(transaction: Transaction) {
    return (
      <>
        <span
          className={`${badgeBaseClass} ${getStatusBadgeClass(transaction.status)}`}
        >
          {transaction.status ?? "-"}
        </span>
        {isInvoicePaymentOverdue(transaction, getTodayIsoDate()) && (
          <span
            className={`${badgeBaseClass} border border-red-500/30 text-red-300`}
            title="Pagamento pendente com data anterior a hoje"
          >
            Vencido
          </span>
        )}
      </>
    );
  }

  function renderOriginBadges(transaction: Transaction) {
    return (
      <>
        {transaction.bankroll_integration_group_id && (
          <span className={`${badgeBaseClass} bg-cyan-500/10 text-cyan-300`}>
            Origem: Bankroll Poker
          </span>
        )}
        {transaction.investment_integration_group_id && (
          <span className={`${badgeBaseClass} bg-cyan-500/10 text-cyan-300`}>
            Origem: Investimentos
          </span>
        )}
      </>
    );
  }

  function changeTransactionType(newType: string) {
    const newStatus = getAutomaticStatus(newType, form.due_date);

    setForm((current) => ({
      ...current,
      type: newType,
      status: newStatus,
      category_id: newType === "Transferência" ? "" : current.category_id,
      // Corretora só participa como ponta de aporte/resgate.
      account_id:
        newType !== "Transferência" &&
        isBrokerageAccount(
          accounts.find((account) => account.id === current.account_id),
        )
          ? ""
          : current.account_id,
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
        className="transactions-page transactions-density-compact space-y-4"
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

        <AccountShortcutStrip
          accounts={financialLedgerAccounts}
          selectedAccountId={accountFilter}
          onSelectAccount={setAccountFilter}
          summaries={shortcutSummaries}
          summariesState={shortcutSummariesState}
          shortcutsAvailable={shortcutsAvailable}
          imageUrls={accountImageUrls}
        />

        <div className="transactions-surface rounded-2xl border p-2 shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[minmax(0,1fr)_minmax(160px,230px)_auto_auto]">
            <label className="relative col-span-2 md:col-span-1">
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
              aria-label={
                advancedFilterCount > 0
                  ? `Mais filtros, ${advancedFilterCount} ${advancedFilterCount === 1 ? "ativo" : "ativos"}`
                  : "Mais filtros"
              }
              className="theme-field theme-hover flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Mais filtros
              {advancedFilterCount > 0 && (
                <span
                  aria-hidden="true"
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold leading-none text-white"
                >
                  {advancedFilterCount}
                </span>
              )}
            </button>

            <ViewModeToggle
              mode={viewMode}
              onChange={changeViewMode}
              hasException={viewModeHasException}
              defaultMode={defaultViewMode}
              className="col-span-2 md:col-span-1"
            />
          </div>

          {activeAdvancedFilters.length > 0 && (
            <div
              role="group"
              aria-label="Filtros adicionais aplicados"
              className="theme-divider mt-2 flex flex-wrap items-center gap-1.5 border-t px-1 pt-2"
            >
              {activeAdvancedFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={filter.clear}
                  aria-label={`Remover filtro ${filter.label}`}
                  className="inline-flex h-7 max-w-full items-center gap-1 rounded-lg bg-blue-500/10 px-2.5 text-xs font-medium text-blue-300 ring-1 ring-inset ring-blue-500/30 transition-colors hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                >
                  <span className="truncate">{filter.label}</span>
                  <X size={12} aria-hidden="true" className="shrink-0" />
                </button>
              ))}
              {activeAdvancedFilters.length > 1 && (
                <button
                  type="button"
                  onClick={clearAdvancedFilters}
                  className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        <section aria-labelledby="transactions-summary-title" className="space-y-2">
        <h2
          id="transactions-summary-title"
          className="theme-muted px-1 text-[11px] font-semibold uppercase tracking-wider"
        >
          {summaryTitle}
        </h2>
        <div
          className={`transactions-summary grid gap-3 ${
            selectedAccount?.type === "Conta" && periodTemporal !== "current"
              ? "sm:grid-cols-3"
              : selectedAccount
                ? "sm:grid-cols-2 lg:grid-cols-4"
                : "sm:grid-cols-3 lg:grid-cols-5"
          }`}
        >
          {!selectedAccount && (
            <>
              <SummaryCard
                label="Saldo do mês"
                value={formatSummaryCurrency(cashFlowResult)}
                tone={cashFlowResult >= 0 ? "positive" : "negative"}
                hint="Receitas − despesas em conta − pagamentos de fatura"
                primary
              />
              <SummaryCard
                label="Receitas"
                value={formatSummaryCurrency(totalIncome)}
                tone="positive"
              />
              <SummaryCard
                label="Despesas diretas"
                value={formatSummaryCurrency(totalDirectExpenses)}
                tone="negative"
              />
              <SummaryCard
                label="Pagamentos de fatura"
                value={formatSummaryCurrency(totalInvoicePayments)}
                tone="warning"
              />
            </>
          )}

          {selectedAccount?.type === "Conta" && (
            <>
              <SummaryCard
                label={
                  periodTemporal === "future"
                    ? "Saldo previsto no início do mês"
                    : "Saldo no início do mês"
                }
                value={formatPeriodBalance(periodBalances?.openingBalance)}
                tone={balanceTone(periodBalances?.openingBalance, "info")}
              />
              {periodTemporal === "current" && (
                <SummaryCard
                  label="Saldo atual"
                  value={formatPeriodBalance(periodBalances?.currentBalance)}
                  tone={balanceTone(periodBalances?.currentBalance, "positive")}
                  hint="Hoje, igual ao atalho da conta"
                />
              )}
              <SummaryCard
                label={
                  periodTemporal === "past"
                    ? "Saldo no fim do mês"
                    : "Saldo previsto no fim do mês"
                }
                value={formatPeriodBalance(periodBalances?.closingBalance)}
                tone={balanceTone(periodBalances?.closingBalance, "positive")}
                hint={
                  periodTemporal === "past"
                    ? undefined
                    : "Inclui lançamentos futuros do mês"
                }
              />
              <SummaryCard
                label={
                  listMode === "latest"
                    ? "Movimentação na lista"
                    : "Movimentação no período"
                }
                value={formatSummaryCurrency(periodMovement)}
                tone={periodMovement >= 0 ? "positive" : "negative"}
                hint={
                  hasListFilters
                    ? "Considera a busca e os filtros aplicados"
                    : "Entradas − saídas da conta"
                }
              />
              {periodBalancesView.status === "error" && (
                <div
                  role="alert"
                  className="col-span-full flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm"
                >
                  <span className="theme-text">
                    Não foi possível carregar os saldos desta conta. A
                    movimentação e os lançamentos continuam disponíveis.
                  </span>
                  <button
                    type="button"
                    onClick={() => setAccountPeriodBalancesRetry((value) => value + 1)}
                    className="h-8 shrink-0 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
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
                value={formatSummaryCurrency(cardUsedLimit)}
                tone="negative"
              />
              {/* Planejamento mensal do cartão (financial_targets), não limite bancário. */}
              <SummaryCard
                label={
                  cardLimit <= 0
                    ? "Disponível no planejamento"
                    : cardAvailableLimit < 0
                      ? "Excedido no planejamento"
                      : "Disponível no planejamento"
                }
                value={
                  cardLimit <= 0
                    ? "Planejamento não definido"
                    : formatSummaryCurrency(Math.abs(cardAvailableLimit))
                }
                tone={
                  cardLimit <= 0
                    ? "neutral"
                    : cardAvailableLimit < 0
                      ? "negative"
                      : "positive"
                }
                hint={
                  cardLimit > 0
                    ? `Planejado para ${summaryPeriodLabel}: ${formatSummaryCurrency(cardLimit)}`
                    : undefined
                }
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
        </section>

        <div
          className={
            detailTransaction
              ? "min-[1800px]:grid min-[1800px]:grid-cols-[minmax(0,1fr)_360px] min-[1800px]:items-start min-[1800px]:gap-4"
              : ""
          }
        >
          {viewMode === "list" ? (
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
                  <th className="w-[116px] px-2 py-4 text-right font-semibold md:w-[124px] md:px-4">
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
                        onClick={() => openTransactionDetail(transaction)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          openTransactionDetail(transaction);
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
                              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${getTypeBadgeClass(transaction.type)}`}
                            >
                              <TransactionIcon size={15} strokeWidth={2} />
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                <div
                                  className="theme-text min-w-0 flex-1 truncate text-[13px] font-medium md:text-sm"
                                  title={transaction.description}
                                >
                                  {transaction.description}
                                </div>

                                {(transaction.bankroll_integration_group_id ||
                                  transaction.investment_integration_group_id) && (
                                  <div className="transaction-badges flex shrink-0 flex-nowrap items-center gap-1">
                                    {renderOriginBadges(transaction)}
                                  </div>
                                )}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                                <span
                                  className={`${badgeBaseClass} ${getTypeBadgeClass(transaction.type)}`}
                                >
                                  {transaction.type}
                                </span>
                                {renderStatusBadges(transaction)}
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
                          {formatMoney(
                            transaction.value,
                            transaction.account?.currency,
                          )}
                        </td>

                        <td className="hidden w-[116px] px-3 py-4 md:table-cell">
                          <div className="flex flex-wrap items-center gap-1">
                            {renderStatusBadges(transaction)}
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

                        <td className="w-[116px] px-2 py-4 text-right md:w-[124px] md:px-4">
                          {renderTransactionActions(transaction, isLocked)}
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
          ) : (
            <div className="transactions-cards">
              {isLoading && (
                <div className="transactions-surface rounded-2xl border px-5 py-12 text-center text-sm text-slate-400 shadow-sm">
                  Carregando lançamentos...
                </div>
              )}

              {!isLoading && transactions.length === 0 && (
                <div className="transactions-surface rounded-2xl border px-5 py-12 text-center shadow-sm">
                  <p className="theme-text text-sm font-medium">
                    Nenhum lançamento encontrado.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Ajuste a competência ou os filtros para ver outros
                    lançamentos.
                  </p>
                </div>
              )}

              {!isLoading && transactions.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4">
                  {transactions.map((transaction, index) => {
                    const isLocked = isTransactionLocked(transaction);
                    const isSelected = transaction.id === detailTransactionId;
                    const TransactionIcon = getTransactionIcon(
                      transaction,
                      getCategorySpecialType(transaction),
                    );

                    return (
                      <li
                        key={`${transaction.id}-${index}`}
                        tabIndex={0}
                        aria-current={isSelected ? "true" : undefined}
                        aria-label={`${transaction.description}, ${formatMoney(
                          transaction.value,
                          transaction.account?.currency,
                        )}`}
                        onClick={() => openTransactionDetail(transaction)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          openTransactionDetail(transaction);
                        }}
                        className={`transactions-surface flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-2xl border p-3 shadow-sm outline-none transition-colors hover:border-blue-500/30 focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                          isSelected ? "border-blue-500/40 bg-blue-500/10" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getTypeBadgeClass(transaction.type)}`}
                          >
                            <TransactionIcon size={16} strokeWidth={2} />
                          </span>

                          <div className="min-w-0 flex-1">
                            <p
                              className="theme-text truncate text-sm font-semibold leading-5"
                              title={transaction.description}
                            >
                              {transaction.description}
                            </p>
                            <p
                              className="truncate text-xs leading-4 text-slate-400"
                              title={transaction.category?.name ?? undefined}
                            >
                              {transaction.category?.name ??
                                (transaction.type === "Transferência"
                                  ? "Transferência"
                                  : "Sem categoria")}
                            </p>
                          </div>

                          <p
                            className={`shrink-0 whitespace-nowrap text-right text-sm font-semibold leading-5 tabular-nums ${getValueColorClass(
                              transaction.type,
                            )}`}
                          >
                            {formatMoney(
                              transaction.value,
                              transaction.account?.currency,
                            )}
                          </p>
                        </div>

                        <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-slate-400">
                          <span
                            className="min-w-0 truncate"
                            title={transaction.account?.name ?? undefined}
                          >
                            {transaction.account?.name ?? "-"}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatFullDate(transaction.due_date)} ·{" "}
                            {formatWeekday(transaction.due_date, "short")}
                          </span>
                        </div>

                        <div className="theme-divider flex min-w-0 items-center justify-between gap-2 border-t pt-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <span
                              className={`${badgeBaseClass} ${getTypeBadgeClass(transaction.type)}`}
                            >
                              {transaction.type}
                            </span>
                            {renderStatusBadges(transaction)}
                            {renderOriginBadges(transaction)}
                          </div>

                          <div className="-my-1 shrink-0">
                            {renderTransactionActions(transaction, isLocked)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

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
                            {formatMoney(
                              detailTransaction.value,
                              detailTransaction.account?.currency,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`${badgeBaseClass} ${getTypeBadgeClass(detailTransaction.type)}`}
                        >
                          {detailTransaction.type}
                        </span>
                        {renderStatusBadges(detailTransaction)}
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
                        {detailTransaction.type === "Pagamento de Fatura" && (
                          <DetailField
                            label="Fatura vinculada"
                            value={
                              getStatementLabel(
                                getLinkedStatement(detailTransaction.id),
                              ) ?? "Nenhuma fatura vinculada"
                            }
                          />
                        )}
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

                    {!isDetailLocked &&
                      canConfirm(detailTransaction) && (
                        <div className="theme-divider border-t px-5 pt-4">
                          <button
                            type="button"
                            disabled={mutation.isPending}
                            onClick={() => openConfirmPayment(detailTransaction)}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check size={15} aria-hidden="true" />
                            Confirmar pagamento
                          </button>
                        </div>
                      )}

                    {!isDetailLocked && (
                      <div
                        className={`theme-divider flex flex-col gap-2 px-5 py-4 sm:flex-row ${
                          canConfirm(detailTransaction)
                            ? "pt-2"
                            : "border-t"
                        }`}
                      >
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

      {confirmingPayment &&
        (() => {
          const { transaction } = confirmingPayment;
          const isInvoice = transaction.type === "Pagamento de Fatura";

          return (
            <ConfirmPaymentDialog
              description={transaction.description}
              accountName={transaction.account?.name ?? "-"}
              value={Number(transaction.value)}
              currency={getAccountCurrency(transaction.account_id)}
              dueDateLabel={formatFullDate(transaction.due_date)}
              competenceLabel={
                transaction.competence?.name
                  ? formatCompetenceLabel(transaction.competence.name)
                  : "-"
              }
              statementLabel={
                isInvoice
                  ? getStatementLabel(getLinkedStatement(transaction.id))
                  : undefined
              }
              effectiveDate={confirmingPayment.effectiveDate}
              maxDate={getTodayIsoDate()}
              divergence={confirmingPayment.divergence}
              error={confirmingPayment.error}
              busy={mutation.pending === `confirmPayment:${transaction.id}`}
              disabled={mutation.isPending}
              onEffectiveDateChange={(effectiveDate) =>
                setConfirmingPayment((current) =>
                  current ? { ...current, effectiveDate, error: null } : current,
                )
              }
              onCancel={closeConfirmPayment}
              onConfirm={() => void confirmPayment()}
              onEditTransaction={() => {
                closeConfirmPayment();
                setDetailTransactionId(null);
                void openEditDrawer(transaction);
              }}
            />
          );
        })()}


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
                      {editingTransferGroupId
                        ? "As movimentações nas duas contas serão atualizadas juntas."
                        : editingTransactionId
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
                    {conversionCurrencies ? "Valor debitado" : "Valor"}
                  </label>

                  <input
                    value={formatCurrencyInput(form.value, form.account_id)}
                    onChange={(event) => {
                      const value = formatCurrencyInput(
                        event.target.value,
                        form.account_id,
                      );

                      setForm({
                        ...form,
                        value,
                      });

                      if (conversionCurrencies) {
                        changeConversionDriver({}, parseCurrencyInput(value));
                      }

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
                    placeholder={getMoneyInputPlaceholder(
                      getAccountCurrency(form.account_id),
                    )}
                    inputMode="numeric"
                    className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  />
                </div>

                {form.type === "Transferência" ? (
                  <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                        Conta de origem
                      </label>

                      <select
                        value={form.account_id}
                        onChange={(event) => {
                          const accountId = event.target.value;
                          // Destino que deixa de ser válido para a nova origem
                          // (ex.: corretora -> corretora) é limpo.
                          const nextOrigin =
                            accounts.find((account) => account.id === accountId) ??
                            null;
                          const keepsDestination =
                            !isLinkedTransferForm ||
                            getTransferDestinationOptions(accounts, nextOrigin).some(
                              (account) => account.id === form.destination_account_id,
                            );

                          setForm({
                            ...form,
                            account_id: accountId,
                            destination_account_id:
                              form.destination_account_id === accountId ||
                              !keepsDestination
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

                        {transferOriginOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {formatTransferAccountOption(account)}
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

                        {transferDestinationOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {formatTransferAccountOption(account)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(transferClassification?.kind === "contribution" ||
                    transferClassification?.kind === "redemption") && (
                    <div
                      role="status"
                      className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
                    >
                      <TrendingUp
                        size={18}
                        aria-hidden="true"
                        className={`mt-0.5 shrink-0 text-emerald-300 ${
                          transferClassification.kind === "redemption"
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="theme-text text-sm font-semibold">
                          {BROKERAGE_TRANSFER_LABELS[transferClassification.kind]}
                        </p>
                        <p className="theme-muted mt-0.5 text-xs">
                          {BROKERAGE_TRANSFER_HINTS[transferClassification.kind]}
                        </p>
                      </div>
                    </div>
                  )}

                  {transferClassification?.kind === "blocked" && (
                    <p
                      role="alert"
                      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
                    >
                      {transferClassification.message}
                    </p>
                  )}

                  {conversionCurrencies && (
                    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <div>
                        <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                          Provedor
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={conversionForm.providerId}
                            onChange={(event) =>
                              setConversionForm((current) => ({
                                ...current,
                                providerId: event.target.value,
                              }))
                            }
                            className="theme-field min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm outline-none"
                          >
                            <option value="">Selecione</option>
                            {visibleConversionProviders.map((provider) => (
                              <option key={provider.id} value={provider.id}>
                                {provider.active
                                  ? provider.name
                                  : `${provider.name} (inativo)`}
                              </option>
                            ))}
                          </select>
                          {newProviderName === null && (
                            <button
                              type="button"
                              onClick={() => setNewProviderName("")}
                              className="theme-field theme-hover shrink-0 rounded-xl border px-3 text-sm font-semibold"
                            >
                              + Novo
                            </button>
                          )}
                        </div>

                        {newProviderName !== null && (
                          <div className="mt-2 flex gap-2">
                            <input
                              value={newProviderName}
                              onChange={(event) =>
                                setNewProviderName(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void saveNewConversionProvider();
                                }
                              }}
                              placeholder="Nome do provedor"
                              autoFocus
                              className="theme-field min-w-0 flex-1 rounded-xl border px-4 py-2 text-sm outline-none"
                            />
                            <button
                              type="button"
                              disabled={isSavingProvider || !newProviderName.trim()}
                              onClick={() => void saveNewConversionProvider()}
                              className="shrink-0 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewProviderName(null)}
                              aria-label="Cancelar novo provedor"
                              className="theme-muted theme-hover shrink-0 rounded-xl px-2"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                            Cotação
                          </label>
                          <div className="relative">
                            <input
                              value={conversionForm.quotedRate}
                              onChange={(event) =>
                                changeConversionDriver({
                                  quotedRate: event.target.value.replace(
                                    /[^\d.,]/g,
                                    "",
                                  ),
                                })
                              }
                              placeholder="0,00"
                              inputMode="decimal"
                              className="theme-field w-full rounded-xl border py-3 pl-4 pr-16 text-sm outline-none"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-slate-400">
                              {getQuoteUnitLabel(
                                conversionForm.quotedRateBase,
                                conversionCurrencies,
                              )}
                            </span>
                          </div>
                        </div>
                        <div>
                          <label
                            className="theme-muted-strong mb-1.5 block text-sm font-semibold"
                            title={CONVERSION_FEE_HINT}
                          >
                            Taxa
                          </label>
                          <input
                            value={conversionForm.feeAmount}
                            onChange={(event) =>
                              changeConversionDriver({
                                feeAmount: formatMoneyInput(
                                  event.target.value,
                                  conversionFeeCurrency,
                                ),
                              })
                            }
                            placeholder={`${getMoneyInputPlaceholder(conversionFeeCurrency)} (opcional)`}
                            title={CONVERSION_FEE_HINT}
                            inputMode="numeric"
                            className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="theme-muted-strong mb-1.5 block text-sm font-semibold">
                          Valor recebido
                        </label>
                        <input
                          value={formatCurrencyInput(
                            conversionForm.destinationValue,
                            form.destination_account_id,
                          )}
                          onChange={(event) =>
                            // Edição manual (valor real do provedor): não recalcula.
                            setConversionForm((current) => ({
                              ...current,
                              destinationValue: formatCurrencyInput(
                                event.target.value,
                                form.destination_account_id,
                              ),
                            }))
                          }
                          placeholder={getMoneyInputPlaceholder(
                            conversionCurrencies.destinationCurrency,
                          )}
                          inputMode="numeric"
                          className="theme-field w-full rounded-xl border px-4 py-3 text-sm font-semibold outline-none"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                        <span className="theme-muted tabular-nums">
                          {conversionEffectiveRate
                            ? `Custo efetivo ${formatCompactRate(
                                conversionEffectiveRate,
                                conversionCurrencies.originCurrency,
                                conversionCurrencies.destinationCurrency,
                              )}${
                                conversionQuotedDifference !== null
                                  ? ` · ${formatSignedPercent(conversionQuotedDifference)} vs. cotação`
                                  : ""
                              }`
                            : "Informe a cotação para calcular o valor recebido."}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setShowConversionOptions((current) => !current)
                          }
                          aria-expanded={showConversionOptions}
                          className="theme-muted theme-hover rounded-lg px-2 py-1 font-semibold"
                        >
                          {showConversionOptions ? "Menos opções" : "Mais opções"}
                        </button>
                      </div>

                      {showConversionOptions && (
                        <div className="grid gap-3 border-t border-white/10 pt-3 text-sm sm:grid-cols-2">
                          <div>
                            <span className="theme-muted mb-1.5 block text-xs font-semibold">
                              Taxa cobrada em
                            </span>
                            <div className="flex gap-2">
                              {[
                                conversionCurrencies.originCurrency,
                                conversionCurrencies.destinationCurrency,
                              ].map((currency) => (
                                <button
                                  key={currency}
                                  type="button"
                                  aria-pressed={conversionFeeCurrency === currency}
                                  onClick={() =>
                                    changeConversionDriver({
                                      feeCurrency: currency,
                                      feeAmount: formatMoneyInput(
                                        conversionForm.feeAmount,
                                        currency,
                                      ),
                                    })
                                  }
                                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                                    conversionFeeCurrency === currency
                                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                                      : "border-white/10 text-slate-400"
                                  }`}
                                >
                                  {currency}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="theme-muted mb-1.5 block text-xs font-semibold">
                              Cotação em
                            </span>
                            <div className="flex gap-2">
                              {(["destination", "origin"] as const).map((base) => (
                                <button
                                  key={base}
                                  type="button"
                                  aria-pressed={conversionForm.quotedRateBase === base}
                                  onClick={() => {
                                    if (conversionForm.quotedRateBase !== base) {
                                      changeConversionDriver(
                                        invertQuotedRateDirection(conversionForm),
                                      );
                                    }
                                  }}
                                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                                    conversionForm.quotedRateBase === base
                                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                                      : "border-white/10 text-slate-400"
                                  }`}
                                >
                                  {getQuoteUnitLabel(base, conversionCurrencies)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  </>
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
                        Conta / Cartão
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

                {form.type === "Pagamento de Fatura" &&
                  (() => {
                    const linkedStatement =
                      getLinkedStatement(editingTransactionId);

                    return (
                      <div className="theme-field rounded-xl border px-4 py-3 text-sm">
                        <span className="theme-muted block text-xs font-semibold">
                          Fatura vinculada
                        </span>
                        <span className="theme-text mt-0.5 block font-medium">
                          {getStatementLabel(linkedStatement) ??
                            "Nenhuma fatura vinculada"}
                        </span>
                        <span className="theme-muted mt-1 block text-xs">
                          {form.status === "Pago"
                            ? "Pagamento confirmado."
                            : "Pendente até a confirmação do pagamento."}
                        </span>
                      </div>
                    );
                  })()}

                {isFuelCategory && (
                  <FuelTransactionFields
                    value={fuelForm}
                    onChange={setFuelForm}
                    onTotalChange={(total) =>
                      setForm((current) => ({
                        ...current,
                        value: formatCurrencyFromNumber(
                          total,
                          current.account_id,
                        ),
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
                        // Editar a data de uma ponta de transferência não
                        // pode trocar Recebido/Pago (inverteria o saldo).
                        const newStatus = getStatusAfterDateChange({
                          type: form.type,
                          currentStatus: form.status,
                          newDueDate: newDate,
                          isEditing: editingTransactionId !== null,
                        });

                        setForm({
                          ...form,
                          due_date: newDate,
                          competence_id: newCompetenceId,
                          status: newStatus,
                        });

                        // Os padrões de novos lançamentos mantêm o status
                        // automático; o preservado vale só para esta edição.
                        updateTransactionDefaults({
                          due_date: newDate,
                          competence_id: newCompetenceId,
                          status: getAutomaticStatus(form.type, newDate),
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
