"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  closeCompetence,
  getClosureByCompetenceId,
  reopenCompetence,
} from "@/src/services/closingService";
import { supabase } from "@/src/lib/supabase";
import type { CompetenceClosure } from "@/src/types/closing";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
};

type Transaction = {
  account_id: string;
  type: string;
  value: number;
};

type Competence = {
  id: string;
  name: string;
};

type AccountClosure = {
  id: string;
  account_id: string;
  closing_balance: number | null;
};

type CardStatement = {
  id: string;
  account_id: string;
  statement_total: number | null;
  status: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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

  const selectedCompetence = useMemo(
    () => competences.find((competence) => competence.id === selectedCompetenceId),
    [competences, selectedCompetenceId]
  );

  const cashAccounts = accounts.filter((account) => account.type === "Conta");
  const cardAccounts = accounts.filter((account) => account.type === "Cartão");

  async function loadData(competenceId?: string) {
    setIsLoading(true);

    const { data: competenceData, error: competenceError } = await supabase
      .from("competences")
      .select("id, name")
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
      .eq("active", true)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (accountsError) {
      alert("Erro ao carregar contas/cartões.");
      setIsLoading(false);
      return;
    }

    const { data: accountClosuresData } = await supabase
      .from("account_closures")
      .select("id, account_id, closing_balance")
      .eq("competence_id", resolvedCompetenceId)
      .eq("account_type", "Conta");

    const { data: cardStatementsData } = await supabase
      .from("credit_card_statements")
      .select("id, account_id, statement_total, status")
      .eq("competence_id", resolvedCompetenceId);

    const { data: transactionsData, error: transactionsError } = await supabase
      .from("transactions")
      .select("account_id, type, value")
      .eq("competence_id", resolvedCompetenceId);

    if (transactionsError) {
      throw transactionsError;
    }

    const closure = await getClosureByCompetenceId(resolvedCompetenceId);

    setAccounts((accountsData ?? []) as Account[]);
    setAccountClosures((accountClosuresData ?? []) as AccountClosure[]);
    setCardStatements((cardStatementsData ?? []) as CardStatement[]);
    setTransactions((transactionsData ?? []) as Transaction[]);
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

  async function closeAccount(account: Account) {
    if (!selectedCompetenceId) return;

    setIsProcessingId(account.id);

    try {
      const { error } = await supabase.from("account_closures").upsert(
        {
          competence_id: selectedCompetenceId,
          account_id: account.id,
          account_type: "Conta",
          status: "Fechada",
          opening_balance: 0,
          closing_balance: getAccountCurrentBalance(account.id),
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

  async function reopenAccount(accountId: string) {
    if (!selectedCompetenceId) return;

    if (!confirm("Deseja reabrir esta conta nesta competência?")) return;

    setIsProcessingId(accountId);

    try {
      const { error } = await supabase
        .from("account_closures")
        .delete()
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

  function getAccountCurrentBalance(accountId: string) {
    return transactions
      .filter((transaction) => transaction.account_id === accountId)
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
  
        return sum;
      }, 0);
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
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div>
                  <p className="font-semibold text-white">{account.name}</p>
                  <p className="text-sm text-slate-400">
                  Saldo atual: {formatCurrency(getAccountCurrentBalance(account.id))}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${isClosed
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-yellow-500/10 text-yellow-300"
                      }`}
                  >
                    {isClosed ? "Fechada" : "Aberta"}
                  </span>

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

            return (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div>
                  <p className="font-semibold text-white">{account.name}</p>
                  <p className="text-sm text-slate-400">
                    {isClosed
                      ? `Fatura: ${formatCurrency(Number(statement.statement_total ?? 0))}`
                      : "Fatura ainda não fechada"}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${isClosed
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-yellow-500/10 text-yellow-300"
                    }`}
                >
                  {isClosed ? "Fechada" : "Aberta"}
                </span>
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