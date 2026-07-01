"use client";

import { useEffect, useRef, useState } from "react";
import { useModalShortcuts } from "@/src/hooks/useModalShortcuts";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import {
  Pencil,
  CircleOff,
  Trash2,
  TrendingUp,
  LayoutDashboard,
} from "lucide-react";

type Competence = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  type: "Receita" | "Despesa" | "Transferência";
  monthly_limit: number | null;
  monthly_goal: number | null;
  show_on_dashboard: boolean;
  dashboard_order: number | null;
  active: boolean;
};

const initialForm = {
  name: "",
  type: "Despesa" as "Receita" | "Despesa" | "Transferência",
  monthly_limit: "",
  monthly_goal: "",
  show_on_dashboard: true,
  dashboard_order: "",
  active: true,
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [planningCategory, setPlanningCategory] = useState<Category | null>(null);
  const [planningValues, setPlanningValues] = useState<Record<string, string>>({});
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);

  const currentCompetenceRef = useRef<HTMLDivElement | null>(null);
  const currentDate = new Date();
  const currentCompetenceName = `${currentDate.getFullYear()}-${String(
    currentDate.getMonth() + 1
  ).padStart(2, "0")}`;
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Ativas");

  async function loadCategories() {
    setIsLoading(true);

    let query = supabase
      .from("categories")
      .select(`
        id,
        name,
        type,
        monthly_limit,
        monthly_goal,
        show_on_dashboard,
        dashboard_order,
        active
        `);

    if (statusFilter === "Ativas") {
      query = query.eq("active", true);
    }

    if (statusFilter === "Inativas") {
      query = query.eq("active", false);
    }

    if (searchTerm.trim()) {
      query = query.ilike("name", `%${searchTerm.trim()}%`);
    }

    const { data, error } = await query
      .order("active", { ascending: false })
      .order("show_on_dashboard", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      console.error("Erro ao carregar categorias:", error);
      alert("Erro ao carregar categorias.");
      setIsLoading(false);
      return;
    }

    setCategories((data ?? []) as Category[]);
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

  function formatMoneyInput(value: string | number | null) {
    const numberValue = Number(value ?? 0);

    if (!numberValue) return "";

    return numberValue.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function parseMoneyInput(value: string) {
    return Number(value.replace(/\D/g, "")) / 100;
  }

  function handlePlanningValueChange(competenceId: string, value: string) {
    const numericValue = parseMoneyInput(value);

    setPlanningValues({
      ...planningValues,
      [competenceId]: numericValue ? formatMoneyInput(numericValue) : "",
    });
  }

  async function openPlanningModal(category: Category) {
    setPlanningCategory(category);
    setIsPlanningOpen(true);

    const { data, error } = await supabase
      .from("financial_targets")
      .select("competence_id, planned_value")
      .eq("target_type", "category")
      .eq("target_id", category.id);

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
    setPlanningCategory(null);
    setPlanningValues({});
    setIsPlanningOpen(false);
  }

  async function savePlanning() {
    if (!planningCategory) return;

    const rows = Object.entries(planningValues)
      .filter(([, value]) => value !== "")
      .map(([competenceId, value]) => ({
        competence_id: competenceId,
        target_type: "category",
        target_id: planningCategory.id,
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

  useEffect(() => {
    loadCategories();
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    loadCompetences();
  }, []);

  function resetForm() {
    setEditingCategoryId(null);
    setForm(initialForm);
  }

  function openNewDrawer() {
    resetForm();
    setIsDrawerOpen(true);
  }

  function openEditDrawer(category: Category) {
    setEditingCategoryId(category.id);
    setForm({
      name: category.name ?? "",
      type: category.type ?? "Despesa",
      monthly_limit: category.monthly_limit ? String(category.monthly_limit) : "",
      monthly_goal: category.monthly_goal ? String(category.monthly_goal) : "",
      show_on_dashboard: category.show_on_dashboard,
      dashboard_order:
        category.dashboard_order !== null
          ? String(category.dashboard_order)
          : "",
      active: category.active,
    });
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    resetForm();
    setIsDrawerOpen(false);
  }

  async function saveCategory() {
    if (!form.name || !form.type) {
      alert("Preencha nome e tipo.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      monthly_limit: form.monthly_limit ? Number(form.monthly_limit) : 0,
      monthly_goal: form.monthly_goal ? Number(form.monthly_goal) : 0,
      show_on_dashboard: form.show_on_dashboard,
      dashboard_order: form.dashboard_order
        ? Number(form.dashboard_order)
        : null,
      active: form.active,
      updated_at: new Date().toISOString(),
    };

    console.log("Payload categoria:", payload);

    const { error } = editingCategoryId
      ? await supabase.from("categories").update(payload).eq("id", editingCategoryId)
      : await supabase.from("categories").insert(payload);

    if (error) {
      console.error("Erro ao salvar categoria:", error);
      alert(error.message);
      return;
    }

    closeDrawer();
    await loadCategories();
  }

  async function toggleShowOnDashboard(category: Category) {
    const { error } = await supabase
      .from("categories")
      .update({
        show_on_dashboard: !category.show_on_dashboard,
        updated_at: new Date().toISOString(),
      })
      .eq("id", category.id);

    if (error) {
      console.error("Erro ao alterar exibição no dashboard:", error);
      alert(error.message);
      return;
    }

    await loadCategories();
  }

  async function toggleActive(category: Category) {
    const { error } = await supabase
      .from("categories")
      .update({
        active: !category.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", category.id);

    if (error) {
      console.error("Erro ao alterar status:", error);
      alert(error.message);
      return;
    }

    await loadCategories();
  }

  async function deleteCategory(category: Category) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir "${category.name}"? Se já existir lançamento usando essa categoria, o banco pode bloquear.`
    );

    if (!confirmed) return;

    const { error } = await supabase.from("categories").delete().eq("id", category.id);

    if (error) {
      console.error("Erro ao excluir categoria:", error);
      alert("Não foi possível excluir. Use Inativar se já houver lançamentos vinculados.");
      return;
    }

    await loadCategories();
  }

  function formatCurrency(value: number | null) {
    return Number(value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function getTypeBadgeClass(type: string) {
    if (type === "Receita") return "bg-emerald-500/10 text-emerald-300";
    if (type === "Transferência") return "bg-sky-500/10 text-sky-300";
    return "bg-red-500/10 text-red-300";
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (isPlanningOpen) {
        closePlanningModal();
        return;
      }

      if (isDrawerOpen) {
        closeDrawer();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isPlanningOpen, isDrawerOpen]);

  useModalShortcuts({
    enabled: isPlanningOpen,
    onEscape: closePlanningModal,
    onEnter: savePlanning,
  });

  useModalShortcuts({
    enabled: !isPlanningOpen && isDrawerOpen,
    onEscape: closeDrawer,
    onEnter: saveCategory,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Categorias</h1>
            <p className="mt-1 text-sm text-slate-400">
              Cadastre categorias de receita, despesa e transferência.
            </p>
          </div>

          <button
            onClick={openNewDrawer}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 md:w-auto"
          >
            Nova categoria
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:flex-row">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar categoria..."
            className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full md:w-52 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="Ativas">Ativas</option>
            <option value="Inativas">Inativas</option>
            <option value="Todas">Todas</option>
          </select>
        </div>

        <div className="grid gap-3 md:hidden">
          {isLoading && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center text-sm text-slate-400">
              Carregando categorias...
            </div>
          )}

          {!isLoading &&
            categories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{category.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getTypeBadgeClass(
                          category.type
                        )}`}
                      >
                        {category.type}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${category.active
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-slate-500/10 text-slate-400"
                          }`}
                      >
                        {category.active ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      title={
                        category.show_on_dashboard
                          ? "Ocultar do Dashboard"
                          : "Mostrar no Dashboard"
                      }
                      onClick={() => toggleShowOnDashboard(category)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border ${category.show_on_dashboard
                        ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                        : "border-slate-500/20 bg-slate-500/10 text-slate-400"
                        }`}
                    >
                      <LayoutDashboard size={16} />
                    </button>
                    <button
                      title="Planejamento"
                      onClick={() => openPlanningModal(category)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                    >
                      <TrendingUp size={16} />
                    </button>
                    <button
                      title="Editar"
                      onClick={() => openEditDrawer(category)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400"
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      title={category.active ? "Inativar" : "Ativar"}
                      onClick={() => toggleActive(category)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-500/20 bg-slate-500/10 text-slate-300"
                    >
                      <CircleOff size={16} />
                    </button>

                    <button
                      title="Excluir"
                      onClick={() => deleteCategory(category)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <p className="text-xs text-slate-500">Limite mensal</p>
                    <p className="mt-1 font-semibold text-slate-200">
                      {formatCurrency(category.monthly_limit)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <p className="text-xs text-slate-500">Meta mensal</p>
                    <p className="mt-1 font-semibold text-slate-200">
                      {formatCurrency(category.monthly_goal)}
                    </p>
                  </div>
                </div>
              </div>
            ))}

          {!isLoading && categories.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center text-sm text-slate-400">
              Nenhuma categoria cadastrada.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 md:block">
          <table className="min-w-[950px] w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-5 py-4">Nome</th>
                <th className="px-5 py-4">Tipo</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    Carregando categorias...
                  </td>
                </tr>
              )}

              {!isLoading &&
                categories.map((category) => (
                  <tr key={category.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-4 font-medium text-white">{category.name}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getTypeBadgeClass(
                          category.type
                        )}`}
                      >
                        {category.type}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${category.active
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-slate-500/10 text-slate-400"
                          }`}
                      >
                        {category.active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          title={
                            category.show_on_dashboard
                              ? "Ocultar do Dashboard"
                              : "Mostrar no Dashboard"
                          }
                          onClick={() => toggleShowOnDashboard(category)}
                          className={`
                                flex h-10 w-10 items-center justify-center
                                rounded-xl
                                border
                                transition-all duration-200
                                hover:scale-105
                                ${category.show_on_dashboard
                              ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400 hover:border-cyan-400/40 hover:bg-cyan-500/20 hover:text-cyan-300"
                              : "border-slate-500/20 bg-slate-500/10 text-slate-400 hover:border-slate-400/40 hover:bg-slate-500/20 hover:text-white"
                            }
  `}
                        >
                          <LayoutDashboard size={18} />
                        </button>
                        <button
                          title="Planejamento"
                          onClick={() => openPlanningModal(category)}
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
                          onClick={() => openEditDrawer(category)}
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
                          title={category.active ? "Inativar" : "Ativar"}
                          onClick={() => toggleActive(category)}
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
                          <CircleOff size={18} />
                        </button>

                        <button
                          title="Excluir"
                          onClick={() => deleteCategory(category)}
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

              {!isLoading && categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                    Nenhuma categoria cadastrada.
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
                  {editingCategoryId ? "Editar categoria" : "Nova categoria"}
                </h2>
                <p className="text-sm text-slate-400">
                  Configure a categoria financeira.
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
                  setForm({
                    ...form,
                    type: event.target.value as "Receita" | "Despesa" | "Transferência",
                  })
                }
                className="w-full md:w-52 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="Receita">Receita</option>
                <option value="Despesa">Despesa</option>
                <option value="Transferência">Transferência</option>
              </select>

              <input
                value={form.monthly_limit}
                onChange={(event) =>
                  setForm({ ...form, monthly_limit: event.target.value })
                }
                placeholder="Limite mensal"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <input
                value={form.monthly_goal}
                onChange={(event) =>
                  setForm({ ...form, monthly_goal: event.target.value })
                }
                placeholder="Meta mensal"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              />

              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900 px-4 py-3">

                <div>
                  <p className="font-medium text-white">
                    Mostrar no Dashboard
                  </p>

                  <p className="text-xs text-slate-400">
                    Exibe esta categoria nos gráficos do Dashboard.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={form.show_on_dashboard}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      show_on_dashboard: event.target.checked,
                    })
                  }
                />
              </label>

              <input
                value={form.dashboard_order}
                onChange={(event) =>
                  setForm({
                    ...form,
                    dashboard_order: event.target.value,
                  })
                }
                placeholder="Ordem no Dashboard"
                type="number"
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
                  onClick={saveCategory}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
                >
                  {editingCategoryId ? "Atualizar" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isPlanningOpen && planningCategory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950 shadow-2xl">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Planejamento mensal
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    {planningCategory.name}
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
                    ref={
                      competence.name === currentCompetenceName
                        ? currentCompetenceRef
                        : null
                    }
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
