"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import { supabase } from "@/src/lib/supabase";
import {
    cancelRecurringTransaction,
    createRecurringTransaction,
    getRecurringTransactions,
    updateRecurringTransaction,
} from "@/src/services/recurringTransactionsService";
import {
    RecurringTransaction,
    RecurringTransactionFormData,
    RecurrenceType,
} from "@/src/types/recurrence";

type SelectOption = {
    id: string;
    name: string;
};
import { generateRecurringTransactions } from "@/src/services/generateRecurringTransactionsService";
const emptyForm: RecurringTransactionFormData = {
    description: "",
    type: "expense",
    amount: "",
    accountId: "",
    categoryId: "",
    startCompetenceId: "",
    endCompetenceId: "",
};

export default function RecurrencesPageContent() {
    const [items, setItems] = useState<RecurringTransaction[]>([]);
    const [accounts, setAccounts] = useState<SelectOption[]>([]);
    const [categories, setCategories] = useState<SelectOption[]>([]);
    const [competences, setCompetences] = useState<SelectOption[]>([]);
    const [selectedCompetenceId, setSelectedCompetenceId] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RecurringTransaction | null>(
        null
    );
    const [formData, setFormData] =
        useState<RecurringTransactionFormData>(emptyForm);

    async function loadRecurrences() {
        setIsLoading(true);

        try {
            const data = await getRecurringTransactions();
            setItems(data);
        } catch (error) {
            console.error("Erro ao carregar recorrências:", error);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadAuxiliaryData() {
        const [accountsResult, categoriesResult, competencesResult] =
            await Promise.all([
                supabase.from("accounts").select("id, name").order("name"),
                supabase.from("categories").select("id, name").order("name"),
                supabase.from("competences").select("id, name").order("name"),
            ]);

        setAccounts((accountsResult.data ?? []) as SelectOption[]);
        setCategories((categoriesResult.data ?? []) as SelectOption[]);
        setCompetences((competencesResult.data ?? []) as SelectOption[]);

        const competenceList = (competencesResult.data ?? []) as SelectOption[];

        const currentDate = new Date();
        const currentYearMonth = `${currentDate.getFullYear()}-${String(
            currentDate.getMonth() + 1
        ).padStart(2, "0")}`;

        const currentCompetence = competenceList.find((item) =>
            item.name.includes(currentYearMonth)
        );

        if (currentCompetence) {
            setSelectedCompetenceId(currentCompetence.id);
            setFormData((current) => ({
                ...current,
                startCompetenceId: currentCompetence.id,
            }));
        }
    }

    useEffect(() => {
        loadRecurrences();
        loadAuxiliaryData();
    }, []);

    function openCreateDrawer() {
        setEditingItem(null);

        setFormData({
            ...emptyForm,
            startCompetenceId: selectedCompetenceId,
        });

        setIsDrawerOpen(true);
    }

    function openEditDrawer(item: RecurringTransaction) {
        setEditingItem(item);

        setFormData({
            description: item.description,
            type: item.type,
            amount: String(item.amount),
            accountId: item.account_id ?? "",
            categoryId: item.category_id ?? "",
            startCompetenceId: item.start_competence_id,
            endCompetenceId: item.end_competence_id ?? "",
        });

        setIsDrawerOpen(true);
    }

    function closeDrawer() {
        setIsDrawerOpen(false);
        setEditingItem(null);
        setFormData(emptyForm);
    }

    function updateField(field: keyof RecurringTransactionFormData, value: string) {
        setFormData((current) => ({
            ...current,
            [field]: value,
        }));
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const normalizedFormData: RecurringTransactionFormData = {
            ...formData,
            endCompetenceId: formData.endCompetenceId || "",
        };

        try {
            if (editingItem) {
                await updateRecurringTransaction(editingItem.id, normalizedFormData);
            } else {
                await createRecurringTransaction(normalizedFormData);
            }

            await loadRecurrences();
            closeDrawer();
        } catch (error) {
            console.error("Erro ao salvar recorrência:", error);
            alert("Não foi possível salvar a recorrência.");
        }
    }

    async function handleCancel(id: string) {
        const confirmed = confirm("Deseja cancelar esta recorrência?");
        if (!confirmed) return;

        try {
            await cancelRecurringTransaction(id);
            await loadRecurrences();
        } catch (error) {
            console.error("Erro ao cancelar recorrência:", error);
            alert("Não foi possível cancelar a recorrência.");
        }
    }

    async function handleGenerateRecurringTransactions() {
        if (!selectedCompetenceId) {
            alert("Selecione uma competência.");
            return;
        }

        try {
            setIsGenerating(true);

            const result = await generateRecurringTransactions({
                competenceId: selectedCompetenceId,
            });

            alert(
                `Processamento concluído.\n\nCriados: ${result.created}\nIgnorados: ${result.ignored}`
            );
        } catch (error) {
            console.error(error);

            alert("Erro ao gerar recorrências.");
        } finally {
            setIsGenerating(false);
        }
    }

    return (
        <AppShell>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm text-slate-400">Finance Smart</p>
                        <h1 className="text-2xl font-semibold text-white">Recorrências</h1>
                        <p className="mt-1 text-sm text-slate-400">
                            Cadastre receitas e despesas recorrentes para geração automática
                            por competência.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={openCreateDrawer}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                    >
                        Nova recorrência
                    </button>
                </div>

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                    <h3 className="text-lg font-semibold text-white">
                        Gerar lançamentos da competência
                    </h3>

                    <p className="mt-1 text-sm text-slate-400">
                        Gera automaticamente os lançamentos das recorrências ativas.
                    </p>

                    <div className="mt-4 flex flex-col gap-3 md:flex-row">
                        <select
                            value={selectedCompetenceId}
                            onChange={(e) => setSelectedCompetenceId(e.target.value)}
                            className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white"
                        >
                            <option value="">
                                Selecione uma competência
                            </option>

                            {competences.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            disabled={isGenerating}
                            onClick={handleGenerateRecurringTransactions}
                            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                        >
                            {isGenerating
                                ? "Gerando..."
                                : "Gerar recorrências"}
                        </button>
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
                            <tr>
                                <th className="px-5 py-4 font-medium">Descrição</th>
                                <th className="px-5 py-4 font-medium">Tipo</th>
                                <th className="px-5 py-4 font-medium">Valor</th>
                                <th className="px-5 py-4 font-medium">Frequência</th>
                                <th className="px-5 py-4 font-medium">Status</th>
                                <th className="px-5 py-4 font-medium text-right">Ações</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-white/10">
                            {isLoading && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-10 text-center text-slate-400"
                                    >
                                        Carregando recorrências...
                                    </td>
                                </tr>
                            )}

                            {!isLoading && items.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-10 text-center text-slate-400"
                                    >
                                        Nenhuma recorrência cadastrada.
                                    </td>
                                </tr>
                            )}

                            {!isLoading &&
                                items.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="bg-slate-950/40 hover:bg-white/[0.03]"
                                    >
                                        <td className="px-5 py-4 text-white">
                                            {item.description}
                                        </td>

                                        <td className="px-5 py-4">
                                            <span
                                                className={
                                                    item.type === "income"
                                                        ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300"
                                                        : "rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-300"
                                                }
                                            >
                                                {item.type === "income" ? "Receita" : "Despesa"}
                                            </span>
                                        </td>

                                        <td className="px-5 py-4 text-slate-200">
                                            {Number(item.amount).toLocaleString("pt-BR", {
                                                style: "currency",
                                                currency: "BRL",
                                            })}
                                        </td>

                                        <td className="px-5 py-4 text-slate-300">Mensal</td>

                                        <td className="px-5 py-4">
                                            <span
                                                className={
                                                    item.status === "active"
                                                        ? "rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300"
                                                        : "rounded-full bg-slate-500/10 px-3 py-1 text-xs font-medium text-slate-300"
                                                }
                                            >
                                                {item.status === "active" ? "Ativa" : "Cancelada"}
                                            </span>
                                        </td>

                                        <td className="px-5 py-4">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditDrawer(item)}
                                                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                                                >
                                                    Editar
                                                </button>

                                                {item.status === "active" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCancel(item.id)}
                                                        className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/10"
                                                    >
                                                        Cancelar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isDrawerOpen && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
                    <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-6 shadow-2xl">
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-white">
                                    {editingItem ? "Editar recorrência" : "Nova recorrência"}
                                </h2>
                                <p className="mt-1 text-sm text-slate-400">
                                    Configure uma receita ou despesa mensal recorrente.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeDrawer}
                                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
                            >
                                Fechar
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Descrição
                                </label>
                                <input
                                    value={formData.description}
                                    onChange={(event) =>
                                        updateField("description", event.target.value)
                                    }
                                    required
                                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                                    placeholder="Ex: Netflix, Internet, Condomínio..."
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Tipo
                                </label>
                                <select
                                    value={formData.type}
                                    onChange={(event) =>
                                        updateField("type", event.target.value as RecurrenceType)
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                                >
                                    <option value="expense">Despesa</option>
                                    <option value="income">Receita</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Valor
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.amount}
                                    onChange={(event) => updateField("amount", event.target.value)}
                                    required
                                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                                    placeholder="0,00"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Conta
                                </label>
                                <select
                                    value={formData.accountId}
                                    onChange={(event) =>
                                        updateField("accountId", event.target.value)
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                                >
                                    <option value="">Selecione</option>
                                    {accounts.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Categoria
                                </label>
                                <select
                                    value={formData.categoryId}
                                    onChange={(event) =>
                                        updateField("categoryId", event.target.value)
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                                >
                                    <option value="">Selecione</option>
                                    {categories.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Competência inicial
                                </label>
                                <select
                                    value={formData.startCompetenceId}
                                    onChange={(event) =>
                                        updateField("startCompetenceId", event.target.value)
                                    }
                                    required
                                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                                >
                                    <option value="">Selecione</option>
                                    {competences.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Competência final
                                </label>
                                <select
                                    value={formData.endCompetenceId}
                                    onChange={(event) =>
                                        updateField("endCompetenceId", event.target.value)
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                                >
                                    <option value="">Sem data final</option>
                                    {competences.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={closeDrawer}
                                    className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
                                >
                                    Cancelar
                                </button>

                                <button
                                    type="submit"
                                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                                >
                                    Salvar recorrência
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AppShell>
    );
}