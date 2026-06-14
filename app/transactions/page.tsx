"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import { deleteTransaction as deleteTransactionService } from "@/src/services/transactionService";
import { ensureCompetenceIsOpen } from "@/src/utils/competenceLock";

type Account = {
  id: string;
  name: string;
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
};

export default function TransactionsPage() {
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

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [competenceFilter, setCompetenceFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  const [form, setForm] = useState({
    description: "",
    value: "",
    due_date: new Date().toISOString().split("T")[0],
    type: "Despesa",
    mode: "unico",
    status: "Pendente",
    account_id: "",
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

  async function loadTransactions(filters?: {
    competenceId?: string;
    accountId?: string;
    type?: string;
    status?: string;
    search?: string;
  }) {
    setIsLoading(true);

    let query = supabase
      .from("transactions")
      .select(`
        id,
        description,
        due_date,
        type,
        mode,
        value,
        status,
        account_id,
        category_id,
        competence_id,
        account:accounts(name),
        category:categories(name),
        competence:competences(name)
      `)
      .order("due_date", { ascending: false });

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

    const sortedTransactions = [...rawTransactions].sort((a, b) => {
      const typeOrder: Record<string, number> = {
        Receita: 1,
        Despesa: 2,
        Transferência: 3,
      };
    
      const typeDiff =
        (typeOrder[a.type] ?? 999) -
        (typeOrder[b.type] ?? 999);
    
      if (typeDiff !== 0) {
        return typeDiff;
      }
    
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
    
    setTransactions(sortedTransactions);
    setIsLoading(false);
  }

  async function loadReferenceData() {
    setIsLoading(true);

    const [accountsResponse, categoriesResponse, competencesResponse] =
      await Promise.all([
        supabase
          .from("accounts")
          .select("id, name")
          .eq("active", true)
          .order("type", { ascending: true })
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
    loadTransactions({
      competenceId: competenceFilter,
      accountId: accountFilter,
      type: typeFilter,
      status: statusFilter,
      search: searchTerm,
    });
  }, [competenceFilter, accountFilter, typeFilter, statusFilter]);

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
      status: "Pendente",
      account_id: "",
      category_id: "",
      competence_id: defaultCompetenceId,
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
      value: String(transaction.value ?? ""),
      due_date: transaction.due_date ?? new Date().toISOString().split("T")[0],
      type: transaction.type ?? "Despesa",
      mode: transaction.mode ?? "unico",
      status: transaction.status ?? "Pendente",
      account_id: transaction.account_id ?? "",
      category_id: transaction.category_id ?? "",
      competence_id: transaction.competence_id ?? "",
    });

    setIsDrawerOpen(true);
  }

  async function saveTransaction() {
    if (
      !form.description ||
      !form.value ||
      !form.due_date ||
      !form.account_id ||
      !form.category_id ||
      !form.competence_id
    ) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      const lock = await ensureCompetenceIsOpen(form.competence_id);

      if (!lock.allowed) {
        alert(lock.message);
        return;
      }

      const payload = {
        description: form.description,
        value: Number(form.value),
        due_date: form.due_date,
        type: form.type,
        mode: form.mode,
        status: form.status,
        account_id: form.account_id,
        category_id: form.category_id,
        competence_id: form.competence_id,
      };

      const { error } = editingTransactionId
        ? await supabase
            .from("transactions")
            .update(payload)
            .eq("id", editingTransactionId)
        : await supabase.from("transactions").insert(payload);

      if (error) {
        throw new Error(error.message);
      }

      closeDrawer();

      await loadTransactions({
        competenceId: competenceFilter,
        accountId: accountFilter,
        type: typeFilter,
        status: statusFilter,
        search: searchTerm,
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

  function formatCurrency(value: number) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

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

        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <div className="grid gap-3 md:grid-cols-5">
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

            <select
              value={competenceFilter}
              onChange={(event) => setCompetenceFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">Todas as competências</option>
              {competences.map((competence) => (
                <option key={competence.id} value={competence.id}>
                  {competence.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{transactions.length} lançamento(s) encontrado(s)</span>

            <button
              onClick={() => {
                setSearchTerm("");
                setTypeFilter("");
                setStatusFilter("");
                setCompetenceFilter("");
                setAccountFilter("");

                loadTransactions({
                  competenceId: "",
                  accountId: "",
                  type: "",
                  status: "",
                  search: "",
                });
              }}
              className="text-blue-400 hover:text-blue-300"
            >
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
          <table className="w-full text-left text-sm">
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
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-white/[0.03]">

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
                            className="rounded-lg px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => handleDeleteTransaction(transaction.id)}
                            className="rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          >
                            Excluir
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
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Descrição"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <input
                value={form.value}
                onChange={(event) =>
                  setForm({ ...form, value: event.target.value })
                }
                placeholder="Valor"
                type="number"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <input
                value={form.due_date}
                onChange={(event) =>
                  setForm({ ...form, due_date: event.target.value })
                }
                type="date"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

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
              </select>

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
