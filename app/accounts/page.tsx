"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";

type Account = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  closing_day: number | null;
  due_day: number | null;
  limit_amount: number | null;
  current_balance: number | null;
  active: boolean;
};

const initialForm = {
  name: "",
  type: "Conta" as "Conta" | "Cartão",
  closing_day: "",
  due_day: "",
  limit_amount: "",
  current_balance: "",
  active: true,
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  async function loadAccounts() {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("accounts")
      .select("id, name, type, closing_day, due_day, limit_amount, current_balance, active")
      .order("active", { ascending: false })
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Erro ao carregar contas/cartões:", error);
      alert("Erro ao carregar contas/cartões.");
      setIsLoading(false);
      return;
    }

    setAccounts((data ?? []) as Account[]);
    setIsLoading(false);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function resetForm() {
    setEditingAccountId(null);
    setForm(initialForm);
  }

  function openNewDrawer() {
    resetForm();
    setIsDrawerOpen(true);
  }

  function openEditDrawer(account: Account) {
    setEditingAccountId(account.id);
    setForm({
      name: account.name ?? "",
      type: account.type ?? "Conta",
      closing_day: account.closing_day ? String(account.closing_day) : "",
      due_day: account.due_day ? String(account.due_day) : "",
      limit_amount: account.limit_amount ? String(account.limit_amount) : "",
      current_balance: account.current_balance ? String(account.current_balance) : "",
      active: account.active,
    });
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    resetForm();
    setIsDrawerOpen(false);
  }

  async function saveAccount() {
    if (!form.name || !form.type) {
      alert("Preencha nome e tipo.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      closing_day: form.closing_day ? Number(form.closing_day) : null,
      due_day: form.due_day ? Number(form.due_day) : null,
      limit_amount: form.limit_amount ? Number(form.limit_amount) : 0,
      current_balance: form.current_balance ? Number(form.current_balance) : 0,
      active: form.active,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingAccountId
      ? await supabase.from("accounts").update(payload).eq("id", editingAccountId)
      : await supabase.from("accounts").insert(payload);

    if (error) {
      console.error("Erro ao salvar conta/cartão:", error);
      alert(error.message);
      return;
    }

    closeDrawer();
    await loadAccounts();
  }

  async function toggleActive(account: Account) {
    const { error } = await supabase
      .from("accounts")
      .update({
        active: !account.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    if (error) {
      console.error("Erro ao alterar status:", error);
      alert(error.message);
      return;
    }

    await loadAccounts();
  }

  async function deleteAccount(account: Account) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir "${account.name}"? Se já existir lançamento usando essa conta/cartão, o banco pode bloquear.`
    );

    if (!confirmed) return;

    const { error } = await supabase.from("accounts").delete().eq("id", account.id);

    if (error) {
      console.error("Erro ao excluir conta/cartão:", error);
      alert("Não foi possível excluir. Use Inativar se já houver lançamentos vinculados.");
      return;
    }

    await loadAccounts();
  }

  function formatCurrency(value: number | null) {
    return Number(value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Contas e Cartões</h1>
            <p className="mt-1 text-sm text-slate-400">
              Cadastre contas bancárias, cartões e saldos iniciais.
            </p>
          </div>

          <button
            onClick={openNewDrawer}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Nova conta/cartão
          </button>
        </div>

        <div className="w-full overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-5 py-4">Nome</th>
                <th className="px-5 py-4">Tipo</th>
                <th className="px-5 py-4">Fechamento</th>
                <th className="px-5 py-4">Vencimento</th>
                <th className="px-5 py-4">Limite</th>
                <th className="px-5 py-4">Saldo atual</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                    Carregando contas/cartões...
                  </td>
                </tr>
              )}

              {!isLoading &&
                accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-4 font-medium text-white">{account.name}</td>
                    <td className="px-5 py-4 text-slate-300">{account.type}</td>
                    <td className="px-5 py-4 text-slate-300">
                      {account.closing_day ? `Dia ${account.closing_day}` : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {account.due_day ? `Dia ${account.due_day}` : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {formatCurrency(account.limit_amount)}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {formatCurrency(account.current_balance)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${account.active
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-slate-500/10 text-slate-400"
                          }`}
                      >
                        {account.active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditDrawer(account)}
                          className="rounded-lg px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => toggleActive(account)}
                          className="rounded-lg px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                        >
                          {account.active ? "Inativar" : "Ativar"}
                        </button>

                        <button
                          onClick={() => deleteAccount(account)}
                          className="rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && accounts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                    Nenhuma conta/cartão cadastrada.
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
                  {editingAccountId ? "Editar conta/cartão" : "Nova conta/cartão"}
                </h2>
                <p className="text-sm text-slate-400">
                  Configure os dados da conta ou cartão.
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
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nome"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <select
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value as "Conta" | "Cartão" })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                <option value="Conta">Conta</option>
                <option value="Cartão">Cartão</option>
              </select>

              <input
                value={form.closing_day}
                onChange={(event) => setForm({ ...form, closing_day: event.target.value })}
                placeholder="Dia de fechamento, se cartão"
                type="number"
                min={1}
                max={31}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <input
                value={form.due_day}
                onChange={(event) => setForm({ ...form, due_day: event.target.value })}
                placeholder="Dia de vencimento, se cartão"
                type="number"
                min={1}
                max={31}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <input
                value={form.limit_amount}
                onChange={(event) => setForm({ ...form, limit_amount: event.target.value })}
                placeholder="Limite"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <input
                value={form.current_balance}
                onChange={(event) =>
                  setForm({ ...form, current_balance: event.target.value })
                }
                placeholder="Saldo atual"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                Ativa
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeDrawer}
                  className="w-full rounded-xl border border-white/10 px-5 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Cancelar
                </button>

                <button
                  onClick={saveAccount}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
                >
                  {editingAccountId ? "Atualizar" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
