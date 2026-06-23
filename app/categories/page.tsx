"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import {
  Pencil,
  CircleOff,
  Trash2,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  type: "Receita" | "Despesa" | "Transferência";
  monthly_limit: number | null;
  monthly_goal: number | null;
  active: boolean;
};

const initialForm = {
  name: "",
  type: "Despesa" as "Receita" | "Despesa" | "Transferência",
  monthly_limit: "",
  monthly_goal: "",
  active: true,
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
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
      .select("id, name, type, monthly_limit, monthly_goal, active");

    if (statusFilter === "Ativas") {
      query = query.eq("active", true);
    }

    if (statusFilter === "Inativas") {
      query = query.eq("active", false);
    }

    if (searchTerm.trim()) {
      query = query.ilike("name", `%${searchTerm.trim()}%`);
    }

    const { data, error } = await query.order("name", {
      ascending: true,
    });

    if (error) {
      console.error("Erro ao carregar categorias:", error);
      alert("Erro ao carregar categorias.");
      setIsLoading(false);
      return;
    }

    setCategories((data ?? []) as Category[]);
    setIsLoading(false);
  }

  useEffect(() => {
    loadCategories();
  }, [searchTerm, statusFilter]);

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
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
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
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="Ativas">Ativas</option>
            <option value="Inativas">Inativas</option>
            <option value="Todas">Todas</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
          <table className="min-w-[950px] w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-5 py-4">Nome</th>
                <th className="px-5 py-4">Tipo</th>
                <th className="px-5 py-4">Limite mensal</th>
                <th className="px-5 py-4">Meta mensal</th>
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
                    <td className="px-5 py-4 text-slate-300">
                      {formatCurrency(category.monthly_limit)}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {formatCurrency(category.monthly_goal)}
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
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
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
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
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
    </AppShell>
  );
}
