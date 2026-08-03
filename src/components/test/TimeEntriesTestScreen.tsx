"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  FlaskConical,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  simulateTimeEntries,
  type SimulatedTimeEntry,
  type TimeEntryRule,
} from "@/src/utils/simulatedTimeEntries";

const weekdays = [
  { value: 1, label: "Segunda", short: "Seg" },
  { value: 2, label: "Terça", short: "Ter" },
  { value: 3, label: "Quarta", short: "Qua" },
  { value: 4, label: "Quinta", short: "Qui" },
  { value: 5, label: "Sexta", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 0, label: "Domingo", short: "Dom" },
];

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60";

function joinLabels(values: number[]) {
  const labels = weekdays
    .filter((weekday) => values.includes(weekday.value))
    .map((weekday) => weekday.label);

  if (labels.length <= 1) return labels[0] ?? "Nenhum dia";
  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function getWeekdayLabel(value: number) {
  return weekdays.find((weekday) => weekday.value === value)?.label ?? "";
}

export default function TimeEntriesTestScreen() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [rules, setRules] = useState<TimeEntryRule[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [entries, setEntries] = useState<SimulatedTimeEntry[]>([]);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const simulatedDayCount = useMemo(
    () => new Set(entries.map((entry) => entry.date)).size,
    [entries],
  );

  function invalidateSimulation() {
    setEntries([]);
    setMessage(null);
  }

  function toggleWeekday(value: number) {
    setSelectedWeekdays((current) =>
      current.includes(value)
        ? current.filter((weekday) => weekday !== value)
        : [...current, value],
    );
    setMessage(null);
  }

  function resetRuleEditor() {
    setEditingRuleId(null);
    setSelectedWeekdays([]);
    setStartTime("08:00");
    setEndTime("17:00");
  }

  function saveRule() {
    if (!startTime || !endTime) {
      setMessage({ type: "error", text: "Informe a hora inicial e a hora final." });
      return;
    }

    if (startTime >= endTime) {
      setMessage({ type: "error", text: "A hora inicial deve ser anterior à hora final." });
      return;
    }

    if (selectedWeekdays.length === 0) {
      setMessage({ type: "error", text: "Selecione pelo menos um dia da semana." });
      return;
    }

    const rule: TimeEntryRule = {
      id: editingRuleId ?? crypto.randomUUID(),
      weekdays: [...selectedWeekdays],
      startTime,
      endTime,
    };

    setRules((current) =>
      editingRuleId
        ? current.map((item) => (item.id === editingRuleId ? rule : item))
        : [...current, rule],
    );
    setEntries([]);
    setMessage({
      type: "success",
      text: editingRuleId ? "Regra atualizada em memória." : "Regra adicionada em memória.",
    });
    resetRuleEditor();
  }

  function editRule(rule: TimeEntryRule) {
    setEditingRuleId(rule.id);
    setSelectedWeekdays([...rule.weekdays]);
    setStartTime(rule.startTime);
    setEndTime(rule.endTime);
    setMessage(null);
  }

  function deleteRule(ruleId: string) {
    setRules((current) => current.filter((rule) => rule.id !== ruleId));
    setEntries([]);
    setMessage({ type: "success", text: "Regra excluída da simulação." });

    if (editingRuleId === ruleId) resetRuleEditor();
  }

  function runSimulation() {
    if (!startDate || !endDate) {
      setMessage({ type: "error", text: "Informe a data inicial e a data final." });
      return;
    }

    if (rules.length === 0) {
      setMessage({ type: "error", text: "Adicione pelo menos uma regra de horário." });
      return;
    }

    try {
      const result = simulateTimeEntries({ startDate, endDate, rules });
      setEntries(result);
      setMessage({
        type: "success",
        text: result.length
          ? `${result.length} lançamento(s) gerado(s) somente para pré-visualização.`
          : "Nenhuma regra coincide com os dias do período informado.",
      });
    } catch (error) {
      setEntries([]);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível simular os lançamentos.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-cyan-300">
            <FlaskConical size={20} />
            <span className="text-xs font-black uppercase tracking-[.2em]">Laboratório</span>
          </div>
          <h1 className="text-3xl font-black text-white">Cadastro de Ponto — Teste</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Monte regras em lote e visualize os lançamentos antes de qualquer implementação definitiva.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">
          <FlaskConical size={14} />
          Protótipo · dados temporários
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow-xl">
        <div className="mb-5 flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-300">
            <CalendarDays size={21} />
          </div>
          <div>
            <h2 className="font-black text-white">Período da simulação</h2>
            <p className="text-xs text-slate-400">As datas inicial e final são inclusivas.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-semibold text-slate-300">
            <span>Data inicial</span>
            <input
              type="date"
              className={fieldClass}
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                invalidateSimulation();
              }}
            />
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-slate-300">
            <span>Data final</span>
            <input
              type="date"
              className={fieldClass}
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                invalidateSimulation();
              }}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-300">
              <Clock3 size={21} />
            </div>
            <div>
              <h2 className="font-black text-white">
                {editingRuleId ? "Editar regra de horário" : "Nova regra de horário"}
              </h2>
              <p className="text-xs text-slate-400">Uma regra pode atender a vários dias.</p>
            </div>
          </div>
          {editingRuleId && (
            <button
              type="button"
              onClick={resetRuleEditor}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <X size={14} /> Cancelar edição
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-semibold text-slate-300">
            <span>Hora inicial</span>
            <input type="time" className={fieldClass} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-slate-300">
            <span>Hora final</span>
            <input type="time" className={fieldClass} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-3 text-sm font-semibold text-slate-300">Dias da semana</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {weekdays.map((weekday) => {
              const selected = selectedWeekdays.includes(weekday.value);
              return (
                <label
                  key={weekday.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                    selected
                      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                      : "border-white/10 bg-slate-900 text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-cyan-400"
                    checked={selected}
                    onChange={() => toggleWeekday(weekday.value)}
                  />
                  <span className="sm:hidden lg:inline">{weekday.label}</span>
                  <span className="hidden sm:inline lg:hidden">{weekday.short}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={saveRule}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:w-auto"
          >
            {editingRuleId ? <Pencil size={17} /> : <Plus size={17} />}
            {editingRuleId ? "Salvar alterações" : "Adicionar regra de horário"}
          </button>
        </div>
      </section>

      {message && (
        <div
          role={message.type === "error" ? "alert" : "status"}
          className={`rounded-xl border p-4 text-sm ${
            message.type === "error"
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Regras adicionadas</h2>
            <p className="text-sm text-slate-400">Cada edição ou exclusão afeta somente a regra selecionada.</p>
          </div>
          <span className="w-fit rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">
            {rules.length} {rules.length === 1 ? "regra" : "regras"}
          </span>
        </div>

        {rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
            <Clock3 className="mx-auto mb-3 text-slate-600" size={30} />
            <p className="font-bold text-slate-300">Nenhuma regra adicionada</p>
            <p className="mt-1 text-sm text-slate-500">Defina um horário e selecione os dias da semana.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
            <table className="finance-table-compact w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th>Dias</th>
                  <th>Horário</th>
                  <th className="w-32">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rules.map((rule) => (
                  <tr key={rule.id} className={editingRuleId === rule.id ? "bg-cyan-500/5" : ""}>
                    <td className="font-semibold text-white">{joinLabels(rule.weekdays)}</td>
                    <td className="text-slate-300">{rule.startTime} às {rule.endTime}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-label="Editar regra"
                          title="Editar"
                          onClick={() => editRule(rule)}
                          className="rounded-lg border border-cyan-400/20 p-2 text-cyan-300 transition hover:bg-cyan-500/10"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label="Excluir regra"
                          title="Excluir"
                          onClick={() => deleteRule(rule.id)}
                          className="rounded-lg border border-red-400/20 p-2 text-red-300 transition hover:bg-red-500/10"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={runSimulation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-500 sm:w-auto"
          >
            <Play size={17} fill="currentColor" />
            Simular lançamentos
          </button>
        </div>
      </section>

      <section className="space-y-4 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Pré-visualização</h2>
            <p className="text-sm text-slate-400">Nenhum lançamento abaixo será salvo.</p>
          </div>
          {entries.length > 0 && (
            <div className="flex gap-2 text-xs font-bold">
              <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-300">{entries.length} lançamentos</span>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-slate-300">{simulatedDayCount} dias</span>
            </div>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
            <Play className="mx-auto mb-3 text-slate-600" size={30} />
            <p className="font-bold text-slate-300">A pré-visualização aparecerá aqui</p>
            <p className="mt-1 text-sm text-slate-500">Informe o período, adicione regras e execute a simulação.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
            <table className="finance-table-compact w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th>Data</th>
                  <th>Dia da semana</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Regra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-semibold text-white">{formatDate(entry.date)}</td>
                    <td className="text-slate-300">{getWeekdayLabel(entry.weekday)}</td>
                    <td className="font-mono text-emerald-300">{entry.startTime}</td>
                    <td className="font-mono text-red-300">{entry.endTime}</td>
                    <td className="text-xs text-slate-500">{entry.ruleId.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
