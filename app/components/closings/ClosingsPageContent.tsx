"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  closeCompetence,
  getClosureByCompetenceId,
  reopenCompetence,
} from "@/src/services/closingService";
import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type { CompetenceClosure } from "@/src/types/closing";
import {
  calculateAccountCredits,
  calculateAccountDebits,
  calculateAccountFinalBalance,
} from "@/src/utils/balanceCalculations";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
};

type Transaction = {
  account_id: string;
  destination_account_id?: string | null;
  type: string;
  value: number;
  description?: string | null;
};

type Competence = {
  id: string;
  name: string;
};

type AccountClosure = {
  id: string;
  account_id: string;
  opening_balance: number | null;
  closing_balance: number | null;
  status: string | null;
};

type CardStatement = {
  id: string;
  account_id: string;
  statement_total: number | null;
  status: string | null;
  payment_account_id?: string | null;
  payment_due_date?: string | null;
  payment_transaction_id?: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatInputCurrency(value: number | string) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseInputCurrency(value: string) {
  return Number(
    value
      .replace(/\./g, "")
      .replace(",", ".")
  ) || 0;
}

function getCurrentCompetenceName() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export default function ClosingsPageContent() {
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [selectedCompetenceId, setSelectedCompetenceId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountClosures, setAccountClosures] = useState<AccountClosure[]>([]);
  const [cardStatements, setCardStatements] = useState<CardStatement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [competenceClosure, setCompetenceClosure] =
    useState<CompetenceClosure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
  const [accountBalanceInputs, setAccountBalanceInputs] = useState<
    Record<string, { openingBalance: string; closingBalance: string }>
  >({});
  const [cardPaymentInputs, setCardPaymentInputs] = useState<
    Record<
      string,
      {
        paymentAccountId: string;
        paymentDueDate: string;
      }
    >
  >({});

  const selectedCompetence = useMemo(
    () => competences.find((competence) => competence.id === selectedCompetenceId),
    [competences, selectedCompetenceId]
  );

  const cashAccounts = accounts.filter((account) => account.type === "Conta");
  const cardAccounts = accounts.filter((account) => account.type === "Cartão");

  async function loadData(competenceId?: string) {
    setIsLoading(true);

    const ownerId = await getCurrentUserId();

    const { data: competenceData, error: competenceError } = await supabase
      .from("competences")
      .select("id, name")
      .eq("owner_id", ownerId)
      .order("name", { ascending: false });

    if (competenceError) {
      alert("Erro ao carregar competências.");
      setIsLoading(false);
      return;
    }

    const competenceList = (competenceData ?? []) as Competence[];
    setCompetences(competenceList);

    const currentName = getCurrentCompetenceName();
    const defaultCompetence =
      competenceList.find((competence) => competence.name === currentName) ??
      competenceList[0];

    const resolvedCompetenceId = competenceId || selectedCompetenceId || defaultCompetence?.id;

    if (!resolvedCompetenceId) {
      setIsLoading(false);
      return;
    }

    setSelectedCompetenceId(resolvedCompetenceId);

    const { data: accountsData, error: accountsError } = await supabase
      .from("accounts")
      .select("id, name, type")
      .eq("owner_id", ownerId)
      .eq("active", true)

    if (accountsError) {
      alert("Erro ao carregar contas/cartões.");
      setIsLoading(false);
      return;
    }

    const { data: accountClosuresData } = await supabase
      .from("account_closures")
      .select("id, account_id, opening_balance, closing_balance, status")
      .eq("owner_id", ownerId)
      .eq("competence_id", resolvedCompetenceId)

    const { data: cardStatementsData } = await supabase
      .from("credit_card_statements")
      .select("id, account_id, statement_total, status, payment_account_id, payment_due_date, payment_transaction_id")
      .eq("owner_id", ownerId)
      .eq("competence_id", resolvedCompetenceId);

    const { data: transactionsData, error: transactionsError } = await supabase
      .from("transactions")
      .select("account_id, destination_account_id, type, value, description")
      .eq("owner_id", ownerId)
      .eq("competence_id", resolvedCompetenceId);

    if (transactionsError) {
      throw transactionsError;
    }

    const closure = await getClosureByCompetenceId(resolvedCompetenceId);

    setAccounts((accountsData ?? []) as Account[]);
    setAccountClosures((accountClosuresData ?? []) as AccountClosure[]);
    setCardStatements((cardStatementsData ?? []) as CardStatement[]);
    setTransactions((transactionsData ?? []) as Transaction[]);
    const nextAccountBalanceInputs: Record<
      string,
      { openingBalance: string; closingBalance: string }
    > = {};

    const currentCompetenceIndex = competenceList.findIndex(
      (competence) => competence.id === resolvedCompetenceId
    );

    const previousCompetenceId =
      currentCompetenceIndex >= 0
        ? competenceList[currentCompetenceIndex + 1]?.id
        : null;

    let previousAccountClosuresData: AccountClosure[] = [];

    if (previousCompetenceId) {
      const { data: previousClosures } = await supabase
        .from("account_closures")
        .select("id, account_id, opening_balance, closing_balance, status")
        .eq("competence_id", previousCompetenceId)
        .eq("account_type", "Conta");

      previousAccountClosuresData = (previousClosures ?? []) as AccountClosure[];
    }

    for (const account of accountsData ?? []) {
      if (account.type !== "Conta") continue;

      const existingClosure = (accountClosuresData ?? []).find(
        (closure) => closure.account_id === account.id
      );

      const movement = ((transactionsData ?? []) as Transaction[])
        .filter((transaction) => transaction.account_id === account.id)
        .filter((transaction) => !isLegacyOpeningBalance(transaction))
        .reduce((sum, transaction) => {
          if (transaction.type === "Receita") {
            return sum + Number(transaction.value);
          }

          if (
            transaction.type === "Despesa" ||
            transaction.type === "Pagamento de Fatura"
          ) {
            return sum - Number(transaction.value);
          }

          if (transaction.type === "Transferência") {
            return sum + Number(transaction.value);
          }

          return sum;
        }, 0);

      const previousClosure = previousAccountClosuresData.find(
        (closure) => closure.account_id === account.id
      );

      const openingBalance = Number(
        existingClosure?.opening_balance ??
        previousClosure?.closing_balance ??
        0
      );

      const transactionsList = ((transactionsData ?? []) as Transaction[]);

      const credits = calculateAccountCredits(account.id, transactionsList);
      const debits = calculateAccountDebits(account.id, transactionsList);

      const closingBalance = Number(
        existingClosure?.closing_balance ??
        calculateAccountFinalBalance({
          accountId: account.id,
          openingBalance,
          transactions: transactionsList,
        })
      );

      nextAccountBalanceInputs[account.id] = {
        openingBalance: String(openingBalance),
        closingBalance: String(closingBalance),
      };
    }

    setAccountBalanceInputs(nextAccountBalanceInputs);
    const nextCardPaymentInputs: Record<
      string,
      {
        paymentAccountId: string;
        paymentDueDate: string;
      }
    > = {};

    for (const account of accountsData ?? []) {
      if (account.type !== "Cartão") continue;

      const statement = (cardStatementsData ?? []).find(
        (statement) => statement.account_id === account.id
      );

      nextCardPaymentInputs[account.id] = {
        paymentAccountId: statement?.payment_account_id ?? "",
        paymentDueDate: statement?.payment_due_date ?? "",
      };
    }

    setCardPaymentInputs(nextCardPaymentInputs);
    setCompetenceClosure(closure);
    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function getAccountClosure(accountId: string) {
    return accountClosures.find((closure) => closure.account_id === accountId);
  }

  function getCardStatement(accountId: string) {
    return cardStatements.find((statement) => statement.account_id === accountId);
  }

  function isAccountClosed(accountId: string) {
    return !!getAccountClosure(accountId);
  }

  function isCardClosed(accountId: string) {
    return !!getCardStatement(accountId);
  }

  const openAccountsCount = cashAccounts.filter(
    (account) => !isAccountClosed(account.id)
  ).length;

  const openCardsCount = cardAccounts.filter(
    (account) => !isCardClosed(account.id)
  ).length;

  const canCloseCompetence = openAccountsCount === 0 && openCardsCount === 0;
  const isCompetenceClosed = competenceClosure?.status === "Fechada";

  function getAccountOpeningBalance(accountId: string) {
    return Number(accountBalanceInputs[accountId]?.openingBalance ?? 0);
  }

  function getAccountClosingBalance(accountId: string) {
    return Number(accountBalanceInputs[accountId]?.closingBalance ?? 0);
  }

  function updateAccountBalanceInput(
    accountId: string,
    field: "openingBalance" | "closingBalance",
    value: string
  ) {
    setAccountBalanceInputs((current) => ({
      ...current,
      [accountId]: {
        openingBalance: current[accountId]?.openingBalance ?? "0",
        closingBalance: current[accountId]?.closingBalance ?? "0",
        [field]: value,
      },
    }));
  }

  async function closeAccount(account: Account) {
    if (!selectedCompetenceId) return;

    const ownerId = await getCurrentUserId();

    setIsProcessingId(account.id);

    try {
      const openingBalance = getAccountOpeningBalance(account.id);
      const closingBalance = getAccountClosingBalance(account.id);

      const { error } = await supabase.from("account_closures").upsert(
        {
          competence_id: selectedCompetenceId,
          account_id: account.id,
          owner_id: ownerId,
          account_type: "Conta",
          status: "Fechada",
          opening_balance: openingBalance,
          closing_balance: closingBalance,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "competence_id,account_id",
        }
      );

      if (error) throw error;

      await loadData(selectedCompetenceId);
    } catch (error) {
      console.error(error);
      alert("Erro ao fechar conta.");
    } finally {
      setIsProcessingId(null);
    }
  }
  async function getOrCreateCompetenceByDate(date: string, ownerId: string) {
    const baseDate = new Date(date + "T00:00:00");
    const month = baseDate.getMonth() + 1;
    const year = baseDate.getFullYear();
    const name = `${year}-${String(month).padStart(2, "0")}`;

    const existingCompetence = competences.find(
      (competence) => competence.name === name
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
        owner_id: ownerId,
      })
      .select("id, name")
      .single();

    if (error || !data) {
      throw error ?? new Error("Erro ao criar competência do pagamento.");
    }

    setCompetences((current) => [data, ...current]);

    return data.id;
  }
  async function closeCardStatement(account: Account) {
    if (!selectedCompetenceId) return;

    const ownerId = await getCurrentUserId();

    setIsProcessingId(account.id);

    try {
      const statementTotal = Math.abs(getAccountCurrentBalance(account.id));
      const paymentAccountId =
        cardPaymentInputs[account.id]?.paymentAccountId;

      const paymentDueDate =
        cardPaymentInputs[account.id]?.paymentDueDate;

      const shouldCreatePayment =
        paymentAccountId && paymentDueDate;

      let paymentTransactionId = null;

      if (shouldCreatePayment) {
        const paymentCompetenceId =
          await getOrCreateCompetenceByDate(paymentDueDate, ownerId);

        const paymentDescription = `Pagamento fatura ${account.name}`;

        const { data: existingPayment } = await supabase
          .from("transactions")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("type", "Pagamento de Fatura")
          .eq("competence_id", paymentCompetenceId)
          .eq("account_id", paymentAccountId)
          .eq("description", paymentDescription)
          .maybeSingle();

        if (existingPayment?.id) {
          paymentTransactionId = existingPayment.id;
        } else {

          const { data: payment } = await supabase
            .from("transactions")
            .insert({
              owner_id: ownerId,
              description: paymentDescription,
              due_date: paymentDueDate,
              value: statementTotal,
              type: "Pagamento de Fatura",
              status: "Pendente",
              mode: "unico",
              account_id: paymentAccountId,
              competence_id: paymentCompetenceId,
            })
            .select("id")
            .single();

          paymentTransactionId = payment?.id ?? null;
        }
      }

      const { error } = await supabase.from("credit_card_statements").upsert(
        {
          account_id: account.id,
          competence_id: selectedCompetenceId,
          owner_id: ownerId,
          statement_total: statementTotal,

          payment_account_id: shouldCreatePayment
            ? paymentAccountId
            : null,

          payment_due_date: shouldCreatePayment
            ? paymentDueDate
            : null,

          payment_transaction_id: paymentTransactionId,

          status: "Fechada",
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "account_id,competence_id",
        }
      );

      if (error) throw error;

      await loadData(selectedCompetenceId);
    } catch (error) {
      console.error(error);
      alert("Erro ao fechar fatura.");
    } finally {
      setIsProcessingId(null);
    }
  }

  async function reopenCardStatement(statementId: string) {
    if (!selectedCompetenceId) return;

    const ownerId = await getCurrentUserId();

    if (!confirm("Deseja reabrir esta fatura?")) return;

    setIsProcessingId(statementId);

    try {
      const { error } = await supabase
        .from("credit_card_statements")
        .delete()
        .eq("id", statementId)
        .eq("owner_id", ownerId);

      if (error) throw error;

      await loadData(selectedCompetenceId);
    } catch (error) {
      console.error(error);
      alert("Erro ao reabrir fatura.");
    } finally {
      setIsProcessingId(null);
    }
  }
  async function reopenAccount(accountId: string) {
    if (!selectedCompetenceId) return;

    const ownerId = await getCurrentUserId();

    if (!confirm("Deseja reabrir esta conta nesta competência?")) return;

    setIsProcessingId(accountId);

    try {
      const { error } = await supabase
        .from("account_closures")
        .delete()
        .eq("owner_id", ownerId)
        .eq("competence_id", selectedCompetenceId)
        .eq("account_id", accountId);

      if (error) throw error;

      await loadData(selectedCompetenceId);
    } catch (error) {
      console.error(error);
      alert("Erro ao reabrir conta.");
    } finally {
      setIsProcessingId(null);
    }
  }

  async function handleCloseCompetence() {
    if (!selectedCompetenceId) return;

    if (!canCloseCompetence) {
      alert("Feche todas as contas e faturas antes de fechar a competência.");
      return;
    }

    setIsProcessingId(selectedCompetenceId);

    try {
      await closeCompetence(selectedCompetenceId);
      await loadData(selectedCompetenceId);
    } catch (error) {
      console.error(error);
      alert("Erro ao fechar competência.");
    } finally {
      setIsProcessingId(null);
    }
  }

  async function handleReopenCompetence() {
    if (!selectedCompetenceId) return;

    if (!confirm("Deseja reabrir esta competência?")) return;

    setIsProcessingId(selectedCompetenceId);

    try {
      await reopenCompetence(selectedCompetenceId);
      await loadData(selectedCompetenceId);
    } catch (error) {
      console.error(error);
      alert("Erro ao reabrir competência.");
    } finally {
      setIsProcessingId(null);
    }
  }

  function moveCompetence(direction: "previous" | "next") {
    const currentIndex = competences.findIndex(
      (competence) => competence.id === selectedCompetenceId
    );

    const nextIndex =
      direction === "previous" ? currentIndex + 1 : currentIndex - 1;

    const nextCompetence = competences[nextIndex];

    if (nextCompetence) {
      loadData(nextCompetence.id);
    }
  }

  function isLegacyOpeningBalance(transaction: Transaction) {
    const description = String(transaction.description ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return description === "saldo anterior";
  }

  function getAccountCredits(accountId: string) {
    return calculateAccountCredits(accountId, transactions);
  }

  function getAccountDebits(accountId: string) {
    return calculateAccountDebits(accountId, transactions);
  }

  function getAccountFinalBalance(accountId: string) {
    return calculateAccountFinalBalance({
      accountId,
      openingBalance: getAccountOpeningBalance(accountId),
      transactions,
    });
  }

  function getAccountCurrentBalance(accountId: string) {
    return getAccountCredits(accountId) - getAccountDebits(accountId);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-xl">
        <p className="text-sm font-medium text-emerald-400">
          Fechamento financeiro
        </p>

        <h1 className="mt-2 text-2xl font-semibold text-white">
          Fechamento de Competência
        </h1>

        <p className="mt-2 max-w-4xl text-sm text-slate-400">
          Feche as contas, confirme as faturas dos cartões e depois feche a competência.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <button
          type="button"
          onClick={() => moveCompetence("previous")}
          className="rounded-xl border border-white/10 p-3 text-slate-300 hover:bg-white/10"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-center">
          <p className="text-sm text-slate-400">Competência</p>
          <h2 className="text-2xl font-bold text-white">
            {selectedCompetence?.name ?? "-"}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => moveCompetence("next")}
          className="rounded-xl border border-white/10 p-3 text-slate-300 hover:bg-white/10"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
          <p className="text-sm text-slate-400">Contas abertas</p>
          <p className="mt-2 text-2xl font-bold text-yellow-300">
            {openAccountsCount}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
          <p className="text-sm text-slate-400">Faturas abertas</p>
          <p className="mt-2 text-2xl font-bold text-yellow-300">
            {openCardsCount}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${isCompetenceClosed
            ? "border-emerald-400/20 bg-emerald-400/10"
            : canCloseCompetence
              ? "border-blue-400/20 bg-blue-400/10"
              : "border-yellow-400/20 bg-yellow-400/10"
            }`}
        >
          <p className="text-sm text-slate-300">Status</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {isCompetenceClosed
              ? "Fechada"
              : canCloseCompetence
                ? "Pronta"
                : "Aberta"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
        <h2 className="mb-4 text-lg font-bold text-white">Contas</h2>

        <div className="space-y-3">
          {cashAccounts.map((account) => {
            const closure = getAccountClosure(account.id);
            const isClosed = !!closure;
            const isProcessing = isProcessingId === account.id;

            return (
              <div
                key={account.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="w-full">
                    <div className="mb-3 flex items-center gap-3">
                      <p className="font-semibold text-white">{account.name}</p>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${isClosed
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-yellow-500/10 text-yellow-300"
                          }`}
                      >
                        {isClosed ? "Fechada" : "Aberta"}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="text-xs text-slate-400">
                        Saldo inicial
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={isClosed || isCompetenceClosed}
                          value={formatInputCurrency(
                            accountBalanceInputs[account.id]?.openingBalance ?? 0
                          )}
                          onChange={(event) => {
                            const openingBalance = parseInputCurrency(event.target.value);
                            const finalBalance =
                              openingBalance +
                              getAccountCredits(account.id) -
                              getAccountDebits(account.id);

                            updateAccountBalanceInput(
                              account.id,
                              "openingBalance",
                              String(openingBalance)
                            );

                            updateAccountBalanceInput(
                              account.id,
                              "closingBalance",
                              String(finalBalance)
                            );
                          }}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                        />
                      </label>

                      <div className="text-xs text-slate-400">
                        Créditos
                        <p className="mt-3 text-sm font-semibold text-emerald-300">
                          {formatCurrency(getAccountCredits(account.id))}
                        </p>
                      </div>

                      <div className="text-xs text-slate-400">
                        Débitos
                        <p className="mt-3 text-sm font-semibold text-red-300">
                          {formatCurrency(getAccountDebits(account.id))}
                        </p>
                      </div>

                      <label className="text-xs text-slate-400">
                        Saldo final
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={isClosed || isCompetenceClosed}
                          value={formatInputCurrency(
                            accountBalanceInputs[account.id]?.closingBalance ??
                            getAccountFinalBalance(account.id)
                          )}
                          onChange={(event) =>
                            updateAccountBalanceInput(
                              account.id,
                              "closingBalance",
                              String(parseInputCurrency(event.target.value))
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end lg:min-w-[96px]">
                    {isClosed ? (
                      <button
                        type="button"
                        disabled={isProcessing || isCompetenceClosed}
                        onClick={() => reopenAccount(account.id)}
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                      >
                        Reabrir
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessing || isCompetenceClosed}
                        onClick={() => closeAccount(account)}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {isProcessing ? "Fechando..." : "Fechar"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
        <h2 className="mb-4 text-lg font-bold text-white">Cartões</h2>

        <div className="space-y-3">
          {cardAccounts.map((account) => {
            const statement = getCardStatement(account.id);
            const isClosed = !!statement;
            const isProcessing =
              isProcessingId === account.id || isProcessingId === statement?.id;

            const statementTotal = isClosed
              ? Number(statement.statement_total ?? 0)
              : Math.abs(getAccountCurrentBalance(account.id));

            const hasPaymentData =
              Boolean(cardPaymentInputs[account.id]?.paymentAccountId) &&
              Boolean(cardPaymentInputs[account.id]?.paymentDueDate);

            return (
              <div
                key={account.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="w-full">
                    <div className="mb-3 flex items-center gap-3">
                      <p className="font-semibold text-white">{account.name}</p>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${isClosed
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-yellow-500/10 text-yellow-300"
                          }`}
                      >
                        {isClosed ? "Fechada" : "Aberta"}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="text-xs text-slate-400">
                        {isClosed ? "Fatura fechada" : "Fatura calculada"}
                        <p className="mt-3 text-sm font-semibold text-slate-200">
                          {formatCurrency(statementTotal)}
                        </p>
                      </div>

                      <label className="text-xs text-slate-400">
                        Conta de pagamento opcional
                        <select
                          disabled={isClosed || isCompetenceClosed}
                          value={cardPaymentInputs[account.id]?.paymentAccountId ?? ""}
                          onChange={(event) =>
                            setCardPaymentInputs((current) => ({
                              ...current,
                              [account.id]: {
                                paymentAccountId: event.target.value,
                                paymentDueDate:
                                  current[account.id]?.paymentDueDate ?? "",
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                        >
                          <option value="">Não lançar pagamento</option>
                          {cashAccounts.map((cashAccount) => (
                            <option key={cashAccount.id} value={cashAccount.id}>
                              {cashAccount.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs text-slate-400">
                        Data de pagamento opcional
                        <input
                          type="date"
                          disabled={isClosed || isCompetenceClosed}
                          value={cardPaymentInputs[account.id]?.paymentDueDate ?? ""}
                          onChange={(event) =>
                            setCardPaymentInputs((current) => ({
                              ...current,
                              [account.id]: {
                                paymentAccountId:
                                  current[account.id]?.paymentAccountId ?? "",
                                paymentDueDate: event.target.value,
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                        />
                      </label>

                      <div className="text-xs text-slate-400">
                        Ação do fechamento
                        <p className="mt-3 text-sm font-semibold text-slate-200">
                          {hasPaymentData
                            ? "Fecha e lança pagamento"
                            : "Fecha sem pagamento"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end lg:min-w-[128px]">
                    {isClosed && statement ? (
                      <button
                        type="button"
                        disabled={isProcessing || isCompetenceClosed}
                        onClick={() => reopenCardStatement(statement.id)}
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                      >
                        Reabrir
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessing || isCompetenceClosed}
                        onClick={() => closeCardStatement(account)}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {isProcessing
                          ? "Fechando..."
                          : hasPaymentData
                            ? "Fechar e lançar"
                            : "Fechar fatura"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        {isCompetenceClosed ? (
          <button
            type="button"
            disabled={isProcessingId === selectedCompetenceId}
            onClick={handleReopenCompetence}
            className="rounded-xl border border-white/10 px-6 py-3 font-bold text-white hover:bg-white/10 disabled:opacity-50"
          >
            Reabrir competência
          </button>
        ) : (
          <button
            type="button"
            disabled={
              !canCloseCompetence || isProcessingId === selectedCompetenceId
            }
            onClick={handleCloseCompetence}
            className="rounded-xl bg-emerald-500 px-6 py-3 font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Fechar competência
          </button>
        )}
      </div>
    </div>
  );
}