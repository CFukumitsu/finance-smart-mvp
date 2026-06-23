"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import {
  Pencil,
  TrendingUp,
  Power,
  Trash2,
} from "lucide-react";

type Competence = {
  id: string;
  name: string;
};

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
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [selectedCompetenceId, setSelectedCompetenceId] = useState("");
  const [plannedValue, setPlannedValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [planningAccount, setPlanningAccount] = useState<Account | null>(null);
  const [planningValues, setPlanningValues] = useState<Record<string, string>>({});
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);
  const currentCompetenceRef = useRef<HTMLDivElement | null>(null);
  const currentDate = new Date();
  const currentCompetenceName = `${currentDate.getFullYear()}-${String(
    currentDate.getMonth() + 1
  ).padStart(2, "0")}`;
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

  async function loadCompetences() {
    const { data } = await supabase
      .from("competences")
      .select("id, name")
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    setCompetences((data ?? []) as Competence[]);
  }

  useEffect(() => {
    loadAccounts();
    loadCompetences();
  }, []);

  function resetForm() {
    setEditingAccountId(null);
    setForm(initialForm);

    setSelectedCompetenceId("");
    setPlannedValue("");
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

  async function openPlanningModal(account: Account) {
    setPlanningAccount(account);
    setIsPlanningOpen(true);

    const { data, error } = await supabase
      .from("financial_targets")
      .select("competence_id, planned_value")
      .eq("target_type", "account")
      .eq("target_id", account.id);

    if (error) {
      console.error("Erro ao carregar planejamento:", error);
      alert("Erro ao carregar planejamento mensal.");
      return;
    }

    const mappedValues: Record<string, string> = {};

    (data ?? []).forEach((item) => {
      mappedValues[item.competence_id] = formatMoneyInput(item.planned_value);
    });

    setPlanningValues(mappedValues);

    setTimeout(() => {
      requestAnimationFrame(() => {
        currentCompetenceRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }, 300);
  }

  function closePlanningModal() {
    setPlanningAccount(null);
    setPlanningValues({});
    setIsPlanningOpen(false);
  }

  async function savePlanning() {
    if (!planningAccount) return;

    const rows = Object.entries(planningValues)
      .filter(([, value]) => value !== "")
      .map(([competenceId, value]) => ({
        competence_id: competenceId,
        target_type: "account",
        target_id: planningAccount.id,
        planned_value: parseMoneyInput(value),
        updated_at: new Date().toISOString(),
      }));

    const { error } = await supabase.from("financial_targets").upsert(rows, {
      onConflict: "competence_id,target_type,target_id",
    });

    if (error) {
      console.error("Erro ao salvar planejamento:", error);
      alert("Erro ao salvar planejamento mensal.");
      return;
    }

    closePlanningModal();
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
    const { data: savedAccount, error } = editingAccountId
      ? await supabase
        .from("accounts")
        .update(payload)
        .eq("id", editingAccountId)
        .select("id")
        .single()
      : await supabase
        .from("accounts")
        .insert(payload)
        .select("id")
        .single();

    if (error) {
      console.error("Erro ao salvar conta/cartão:", error);
      alert(error.message);
      return;
    }

    if (selectedCompetenceId && plannedValue) {
      const { error: targetError } = await supabase
        .from("financial_targets")
        .upsert(
          {
            competence_id: selectedCompetenceId,
            target_type: "account",
            target_id: savedAccount.id,
            planned_value: Number(plannedValue),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "competence_id,target_type,target_id",
          }
        );

      if (targetError) {
        console.error("Erro ao salvar planejamento:", targetError);
        alert("Conta/cartão salvo, mas houve erro ao salvar o planejamento.");
        return;
      }
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

  function formatMoneyInput(value: string | number | null) {
    const numberValue = Number(value ?? 0);

    if (!numberValue) return "";

    return numberValue.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function parseMoneyInput(value: string) {
    return Number(
      value
        .replace(/\D/g, "")
    ) / 100;
  }

  function handlePlanningValueChange(competenceId: string, value: string) {
    const numericValue = parseMoneyInput(value);

    setPlanningValues({
      ...planningValues,
      [competenceId]: numericValue ? formatMoneyInput(numericValue) : "",
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
                          title="Planejamento"
                          onClick={() => openPlanningModal(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-cyan-500/20
        bg-cyan-500/10
        text-cyan-400
        transition-all duration-200
        hover:scale-105
        hover:border-cyan-400/40
        hover:bg-cyan-500/20
        hover:text-cyan-300
      "
                        >
                          <TrendingUp size={18} />
                        </button>

                        <button
                          title="Editar"
                          onClick={() => openEditDrawer(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-amber-500/20
        bg-amber-500/10
        text-amber-400
        transition-all duration-200
        hover:scale-105
        hover:border-amber-400/40
        hover:bg-amber-500/20
        hover:text-amber-300
      "
                        >
                          <Pencil size={18} />
                        </button>

                        <button
                          title={account.active ? "Inativar" : "Ativar"}
                          onClick={() => toggleActive(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-slate-500/20
        bg-slate-500/10
        text-slate-300
        transition-all duration-200
        hover:scale-105
        hover:border-slate-400/40
        hover:bg-slate-500/20
        hover:text-white
      "
                        >
                          <Power size={18} />
                        </button>

                        <button
                          title="Excluir"
                          onClick={() => deleteAccount(account)}
                          className="
        flex h-10 w-10 items-center justify-center
        rounded-xl
        border border-red-500/20
        bg-red-500/10
        text-red-400
        transition-all duration-200
        hover:scale-105
        hover:border-red-400/40
        hover:bg-red-500/20
        hover:text-red-300
      "
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
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
          <div className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950 shadow-2xl">
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
      {isPlanningOpen && planningAccount && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950 shadow-2xl">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Planejamento mensal
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  {planningAccount.name}
                </p>
              </div>

              <button
                onClick={closePlanningModal}
                className="rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3">
              {competences.map((competence) => (
                <div
                  key={competence.id}
                  ref={competence.name === currentCompetenceName ? currentCompetenceRef : null}
                  className={`grid grid-cols-1 gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_220px] ${competence.name === currentCompetenceName
                    ? "border-cyan-500/40 bg-cyan-500/10"
                    : "border-white/10 bg-slate-900/70"
                    }`}
                >
                  <div>
                    <p className="font-semibold text-white">{competence.name}</p>
                    <p className="text-xs text-slate-500">Valor planejado</p>
                  </div>

                  <input
                    value={planningValues[competence.id] ?? ""}
                    onChange={(event) =>
                      handlePlanningValueChange(competence.id, event.target.value)
                    }
                    type="text"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-right text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
              ))}
            </div>
            </div>

            <div className="border-t border-white/10 bg-slate-950 p-6">
              <div className="flex gap-3">
                <button
                  onClick={closePlanningModal}
                  className="w-full rounded-xl border border-white/10 px-5 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Cancelar
                </button>

                <button
                  onClick={savePlanning}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
                >
                  Salvar planejamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
