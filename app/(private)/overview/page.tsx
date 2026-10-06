"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Settings2 } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { updateOverduePaymentStatusesOncePerDay } from "@/src/services/paymentStatusService";
import {
  loadFinancialOverviewInput,
  saveMonthlySavingsGoal,
} from "@/src/services/financialOverviewService";
import {
  buildFinancialOverview,
  CONFIDENCE_LABELS,
  describeConfidence,
  type FinancialOverview,
  type OverviewInput,
} from "@/src/utils/financialOverview";
import { formatMoney, formatMoneyInput, parseMoneyInput, PRIMARY_CURRENCY } from "@/src/utils/currencies";
import {
  CompetenceNavigator,
  FormulaBlock,
  InfoTip,
  ProgressBar,
  SavingsChart,
  StatCard,
  type FormulaTerm,
  type Tone,
} from "@/src/components/overview/OverviewWidgets";

const money = (value: number) => formatMoney(value, PRIMARY_CURRENCY);
const percent = (value: number) =>
  `${Math.round(value * 100).toLocaleString("pt-BR")}%`;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

function monthTitle(year: number, month: number) {
  const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(" de ", " ");
}

const METHODOLOGY = [
  "Os valores são baseados nos seus lançamentos, contas, compromissos e histórico de gastos. Transferências para investimentos/reservas não são consideradas despesas.",
  "Saldo disponível: saldo de hoje das contas marcadas como operacionais (último fechamento + lançamentos até hoje). Contas de reserva/investimento e contas fora do planejamento não entram.",
  "Compromissos: despesas, faturas e transferências para fora do planejamento que ainda vão acontecer no mês, recorrências ainda não geradas e faturas de cartão projetadas a partir das compras do mês anterior (quando a fatura ainda não foi lançada).",
  "Reserva estimada: quanto você costuma gastar com despesas variáveis (débito/Pix, sem recorrências e parcelas) do dia seguinte até o fim do mês, pela média ponderada dos últimos 3 meses completos (pesos 3, 2 e 1). Se você já lançou gastos variáveis maiores que essa média, vale o valor lançado.",
  "Guardado: transferências e aplicações cujo destino é uma conta de reserva/investimento, menos os resgates. Como esse dinheiro já saiu do saldo, ele não é descontado de novo.",
  "Somente a moeda principal (BRL) é somada; contas em outras moedas aparecem à parte, sem conversão.",
];

export default function FinancialOverviewPage() {
  const today = useMemo(() => todayIso(), []);
  const [selected, setSelected] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [input, setInput] = useState<OverviewInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<string | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const overdueUpdatedRef = useRef(false);

  // Carga sempre a partir das fontes de verdade; estado só é atualizado depois
  // dos awaits. O "carregando" é ligado por quem dispara a troca (evento).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!overdueUpdatedRef.current) {
          // Mesma rotina diária que o Dashboard antigo executava na página inicial.
          overdueUpdatedRef.current = true;
          await updateOverduePaymentStatusesOncePerDay();
        }
        const data = await loadFinancialOverviewInput({ year: selected.year, month: selected.month, today });
        if (!cancelled) {
          setInput(data);
          setLoadError(null);
        }
      } catch (error) {
        console.error("Erro ao carregar a Visão Financeira:", error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Erro ao carregar dados.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected.year, selected.month, reloadToken, today]);

  function selectMonth(year: number, month: number) {
    if (year === selected.year && month === selected.month) return;
    setGoalDraft(null);
    setIsLoading(true);
    setSelected({ year, month });
  }

  const overview = useMemo(() => (input ? buildFinancialOverview(input) : null), [input]);

  async function saveGoal() {
    if (goalDraft === null || isSavingGoal) return;
    setIsSavingGoal(true);
    try {
      const amount = goalDraft.replace(/\D/g, "") ? parseMoneyInput(goalDraft) : null;
      await saveMonthlySavingsGoal({ year: selected.year, month: selected.month, amount });
      setGoalDraft(null);
      setIsLoading(true);
      setReloadToken((current) => current + 1);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erro ao salvar a meta.");
    } finally {
      setIsSavingGoal(false);
    }
  }

  const title = monthTitle(selected.year, selected.month);
  const subtitle = !overview
    ? ""
    : overview.temporal === "current"
      ? `Situação financeira e projeção até ${shortDate(overview.monthEnd)}`
      : overview.temporal === "past"
        ? "Resultado realizado do mês"
        : "Projeção do mês com base nos dados disponíveis";

  return (
    <AppShell>
      <div className="overview-page space-y-6">
        <header className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Visão Financeira</p>
              <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
              <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/accounts"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 sm:flex-none"
                title="Configurar contas do planejamento">
                <Settings2 size={16} />
                <span>Contas</span>
              </Link>
              <Link href="/transactions?new=true"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 sm:flex-none">
                <Plus size={16} />
                Novo lançamento
              </Link>
            </div>
          </div>
          <CompetenceNavigator
            year={selected.year}
            month={selected.month}
            disabled={isLoading}
            onSelect={selectMonth}
          />
        </header>

        {loadError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Não foi possível carregar a Visão Financeira: {loadError}
          </div>
        )}

        {!overview && !loadError && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-busy="true">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-slate-950/60" />
            ))}
          </div>
        )}

        {overview && (
          <div className={`space-y-6 transition-opacity ${isLoading ? "opacity-60" : ""}`}>
            <Notices overview={overview} />
            <PrimaryArea
              overview={overview}
              goalDraft={goalDraft}
              setGoalDraft={setGoalDraft}
              saveGoal={saveGoal}
              isSavingGoal={isSavingGoal}
            />
            <FormulaArea overview={overview} />
            <div className="grid gap-4 lg:grid-cols-2">
              <EvolutionCard overview={overview} />
              <ReserveCard overview={overview} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <CardsCard overview={overview} />
              <VariableSpendingCard overview={overview} />
              <SavingsListCard overview={overview} />
            </div>
            <details className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-sm">
              <summary className="cursor-pointer select-none font-semibold text-white">
                Como isso é calculado?
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-400">
                {METHODOLOGY.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </details>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Notices({ overview }: { overview: FinancialOverview }) {
  const notices: { key: string; text: string; link?: { href: string; label: string } }[] = [];
  if (!overview.hasPlanningAccounts) {
    notices.push({
      key: "accounts",
      text: "Configure quais contas participam do planejamento para calcular o saldo disponível.",
      link: { href: "/accounts", label: "Configurar contas" },
    });
  }
  if (!overview.competenceId) {
    notices.push({ key: "competence", text: "Esta competência ainda não existe: não há lançamentos registrados para o mês." });
  }
  if (overview.temporal === "future" && overview.income.expected === 0 && overview.income.transferInflows === 0) {
    notices.push({
      key: "future-income",
      text: "Nenhuma receita prevista registrada para este mês: a previsão considera só compromissos e reserva. Lance as receitas esperadas ou cadastre recorrências.",
      link: { href: "/recurrences", label: "Recorrências" },
    });
  }
  if (overview.otherCurrencyAccounts.length > 0) {
    notices.push({
      key: "currencies",
      text: `Valores somente em ${PRIMARY_CURRENCY}. Contas em outras moedas, não somadas: ${overview.otherCurrencyAccounts
        .map((item) => `${item.name} ${formatMoney(item.balance, item.currency)}`).join(" · ")}.`,
    });
  }
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2">
      {notices.map((notice) => (
        <div key={notice.key}
          className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>{notice.text}</span>
          {notice.link && (
            <Link href={notice.link.href} className="inline-flex min-h-10 items-center gap-1 font-semibold text-blue-300 hover:text-blue-200">
              {notice.link.label} <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

function PrimaryArea({
  overview,
  goalDraft,
  setGoalDraft,
  saveGoal,
  isSavingGoal,
}: {
  overview: FinancialOverview;
  goalDraft: string | null;
  setGoalDraft: (value: string | null) => void;
  saveGoal: () => void;
  isSavingGoal: boolean;
}) {
  const end = shortDate(overview.monthEnd);
  let heroLabel: string;
  let heroValue: number;
  let heroText: string;
  let heroInfo: string;

  if (overview.temporal === "current") {
    heroLabel = "Pode guardar hoje";
    heroValue = overview.canSaveToday ?? 0;
    heroText = heroValue >= 0
      ? `Valor disponível após proteger compromissos e gastos estimados até ${end}.`
      : `Atenção: faltam ${money(Math.abs(heroValue))} para cobrir compromissos e gastos estimados até ${end}.`;
    heroInfo = "Saldo disponível nas contas − compromissos a pagar − reserva estimada. É o que dá para guardar AGORA sem comprometer o restante do mês.";
  } else if (overview.temporal === "future") {
    heroLabel = "Previsão de economia";
    heroValue = overview.forecast ?? 0;
    heroText = "Receitas previstas − compromissos − reserva estimada para o mês.";
    heroInfo = "Mês futuro: não existe \"pode guardar hoje\". A previsão usa somente o fluxo do próprio mês (não inclui o saldo que sobrar dos meses anteriores).";
  } else {
    heroLabel = "Resultado do mês";
    heroValue = overview.monthResult ?? 0;
    heroText = "Entradas − saídas realizadas no mês, sem contar o dinheiro guardado.";
    heroInfo = "Mês encerrado: somente valores realizados, sem projeções.";
  }

  const heroTone: Tone = heroValue >= 0 ? "green" : "red";

  return (
    <section className="grid gap-4 lg:grid-cols-12" aria-label="Indicadores principais">
      <div className={`flex min-w-0 flex-col justify-between rounded-2xl border p-6 lg:col-span-5 ${
        heroValue >= 0 ? "border-emerald-400/25 bg-emerald-500/[0.07]" : "border-red-400/30 bg-red-500/[0.08]"
      }`}>
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            {heroLabel}
            <InfoTip text={heroInfo} />
          </p>
          <p className={`mt-3 break-words text-4xl font-bold tabular-nums tracking-tight sm:text-5xl ${heroTone === "green" ? "text-emerald-300" : "text-red-300"}`}>
            {money(heroValue)}
          </p>
          <p className="mt-3 text-sm text-slate-300">{heroText}</p>
        </div>
        {overview.temporal === "current" && (
          <p className="mt-4 text-xs text-slate-400">
            {overview.daysRemaining === 0 ? "Último dia do mês." : `${overview.daysRemaining} dias até o fim do mês.`}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
        {overview.temporal === "current" && (
          <StatCard label="Previsão de economia" value={money(overview.forecast ?? 0)} tone="blue"
            hint={`Estimativa de quanto deverá sobrar até ${end}.`}
            info="Guardado no mês + Pode guardar hoje + receitas ainda previstas no mês." />
        )}
        {overview.temporal === "past" && (
          <StatCard label="Receitas do mês" value={money(overview.income.realized)} tone="blue"
            hint={`Saídas realizadas: ${money(overview.realizedOutflows)}`} />
        )}
        {overview.temporal === "future" && (
          <StatCard label="Receitas previstas" value={money(overview.income.expected)} tone="blue"
            hint={`Compromissos: ${money(overview.commitments.total)}`} />
        )}

        <StatCard
          label={overview.temporal === "future" ? "Guardado programado" : "Guardado no mês"}
          value={money(overview.saved)}
          tone="purple"
          hint={overview.temporal === "future"
            ? "Transferências já agendadas para reserva/investimento."
            : "Total destinado a reservas/investimentos neste mês."}
          info="Transferências para contas de reserva/investimento, menos resgates. Não é despesa."
        />

        <GoalCard overview={overview} goalDraft={goalDraft} setGoalDraft={setGoalDraft}
          saveGoal={saveGoal} isSavingGoal={isSavingGoal} />

        {overview.temporal !== "past" ? (
          <StatCard label="Ainda pode guardar" value={money(overview.remainingToSave ?? 0)}
            tone={(overview.remainingToSave ?? 0) >= 0 ? "green" : "red"}
            hint={overview.temporal === "current" ? `Economia adicional projetada até ${end}.` : "Previsão menos o já programado."}
            info={overview.temporal === "current"
              ? "Diferente de \"Pode guardar hoje\": inclui as receitas que ainda vão entrar no mês. É quanto mais você provavelmente conseguirá guardar até o fim do mês."
              : "Previsão de economia menos o que já está programado para ser guardado."} />
        ) : (
          <StatCard label="Gastos variáveis" value={money(overview.reserve.variableRealized)} tone="orange"
            hint="Débito/Pix realizados no mês." />
        )}
      </div>
    </section>
  );
}

function GoalCard({
  overview,
  goalDraft,
  setGoalDraft,
  saveGoal,
  isSavingGoal,
}: {
  overview: FinancialOverview;
  goalDraft: string | null;
  setGoalDraft: (value: string | null) => void;
  saveGoal: () => void;
  isSavingGoal: boolean;
}) {
  const { goal } = overview;
  const editing = goalDraft !== null;
  const referenceLabel = overview.temporal === "past" ? "Guardado" : "Previsão";

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-violet-400/20 bg-violet-500/[0.05] p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        Meta do mês
      </p>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <input
            value={goalDraft}
            onChange={(event) => setGoalDraft(formatMoneyInput(event.target.value, PRIMARY_CURRENCY))}
            onKeyDown={(event) => { if (event.key === "Enter") saveGoal(); }}
            placeholder={money(0)}
            inputMode="numeric"
            autoFocus
            aria-label="Meta de economia do mês"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-violet-400"
          />
          <div className="flex gap-2">
            <button type="button" onClick={saveGoal} disabled={isSavingGoal}
              className="min-h-10 flex-1 rounded-xl bg-violet-600 px-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">
              Salvar
            </button>
            <button type="button" onClick={() => setGoalDraft(null)}
              className="min-h-10 rounded-xl px-3 text-sm text-slate-400 hover:bg-white/10">
              Cancelar
            </button>
          </div>
          <p className="text-xs text-slate-400">Deixe vazio para remover a meta deste mês.</p>
        </div>
      ) : goal.amount === null ? (
        <div className="mt-2">
          <p className="text-sm text-slate-300">Defina uma meta de economia.</p>
          <button type="button" onClick={() => setGoalDraft("")}
            className="mt-3 min-h-10 rounded-xl border border-violet-400/30 px-3 text-sm font-semibold text-violet-300 hover:bg-violet-500/10">
            Definir meta
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="whitespace-nowrap text-2xl font-semibold tabular-nums text-violet-300">{money(goal.amount)}</p>
            <button type="button" onClick={() => setGoalDraft(money(goal.amount ?? 0))}
              className="min-h-9 rounded-lg px-2 text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-white">
              Editar
            </button>
          </div>
          {goal.reference !== null && goal.progress !== null && (
            <>
              <ProgressBar value={goal.progress} tone={goal.progress >= 1 ? "green" : "purple"} />
              <p className="mt-2 text-xs text-slate-300">
                {referenceLabel}: {money(goal.reference)} · {percent(goal.progress)}
                {goal.progress >= 1 ? " — Meta atingida" : ""}
              </p>
              {goal.difference !== null && goal.difference !== 0 && (
                <p className={`text-xs ${goal.difference > 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {goal.difference > 0
                    ? `${money(goal.difference)} acima da meta`
                    : `${money(Math.abs(goal.difference))} abaixo da meta`}
                </p>
              )}
              {overview.temporal === "current" && goal.savedProgress !== null && (
                <p className="text-xs text-slate-400">Já guardado: {percent(goal.savedProgress)} da meta.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function FormulaArea({ overview }: { overview: FinancialOverview }) {
  const { commitments, reserve } = overview;
  const commitmentsInfo = [
    `Despesas previstas: ${money(commitments.fixedExpenses)}`,
    `Faturas lançadas: ${money(commitments.invoicePayments)}`,
    `Faturas projetadas (compras do mês anterior): ${money(commitments.projectedInvoices)}`,
    `Recorrências ainda não geradas: ${money(commitments.recurringNotGenerated)}`,
    `Transferências para fora do planejamento: ${money(commitments.transfersOut)}`,
  ].join(" · ");

  let terms: FormulaTerm[];
  let title: string;
  if (overview.temporal === "current") {
    title = "De onde vem o \"Pode guardar hoje\"";
    terms = [
      { label: "Saldo disponível nas contas", value: money(overview.availableBalance ?? 0), tone: "neutral",
        info: `Saldo atual das contas que participam do planejamento: ${overview.accountBalances
          .map((item) => `${item.name} ${money(item.balance)}`).join(" · ") || "nenhuma conta"}.` },
      { label: "Compromissos a pagar", value: money(commitments.total), tone: "red", operator: "−", info: commitmentsInfo },
      { label: "Reserva estimada do mês", value: money(reserve.total), tone: "orange", operator: "−",
        info: "Gastos variáveis esperados até o fim do mês (detalhes no card Reserva estimada)." },
      { label: "Pode guardar hoje", value: money(overview.canSaveToday ?? 0),
        tone: (overview.canSaveToday ?? 0) >= 0 ? "green" : "red", operator: "=" },
    ];
  } else if (overview.temporal === "future") {
    title = "Composição da previsão do mês";
    terms = [
      { label: "Receitas previstas", value: money(overview.income.expected + overview.income.transferInflows), tone: "blue",
        info: overview.income.transferInflows > 0
          ? `Inclui ${money(overview.income.transferInflows)} de transferências vindas de fora do planejamento (não são receita).`
          : undefined },
      { label: "Compromissos previstos", value: money(commitments.total), tone: "red", operator: "−", info: commitmentsInfo },
      { label: "Reserva estimada", value: money(reserve.total), tone: "orange", operator: "−" },
      { label: "Previsão de economia", value: money(overview.forecast ?? 0),
        tone: (overview.forecast ?? 0) >= 0 ? "green" : "red", operator: "=" },
    ];
  } else {
    title = "Composição do resultado do mês";
    terms = [
      { label: "Entradas realizadas", value: money(overview.income.realized + overview.income.transferInflows), tone: "blue" },
      { label: "Saídas realizadas", value: money(overview.realizedOutflows), tone: "red", operator: "−",
        info: "Despesas em conta, faturas pagas e transferências para fora do planejamento. O dinheiro guardado não é saída." },
      { label: "Resultado do mês", value: money(overview.monthResult ?? 0),
        tone: (overview.monthResult ?? 0) >= 0 ? "green" : "red", operator: "=" },
    ];
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-label={title}>
      <p className="mb-3 text-sm font-semibold text-blue-300">{title}</p>
      <FormulaBlock terms={terms} />
    </section>
  );
}

function EvolutionCard({ overview }: { overview: FinancialOverview }) {
  const goal = overview.goal.amount;
  const data = overview.temporal === "past"
    ? [{ name: "Guardado", value: overview.saved, color: "#8b5cf6" }]
    : [
        { name: overview.temporal === "future" ? "Programado" : "Guardado", value: overview.saved, color: "#8b5cf6" },
        { name: "Previsão adicional", value: Math.max(0, overview.remainingToSave ?? 0), color: "#3b82f6" },
        { name: "Previsão total", value: Math.max(0, overview.forecast ?? 0), color: "#10b981" },
      ];
  if (goal !== null) data.push({ name: "Meta", value: goal, color: "#a78bfa" });

  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-label="Evolução da economia">
      <p className="text-sm font-semibold text-blue-300">Evolução da economia no mês</p>
      <p className="mt-1 text-xs text-slate-400">
        {overview.temporal === "past" ? "Quanto foi guardado no mês." : "Guardado até agora, previsão adicional e previsão total."}
      </p>
      {data.every((item) => item.value === 0) ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
          Ainda não há valores guardados ou previstos para este mês.
        </div>
      ) : (
        <div className="mt-3">
          <SavingsChart data={data} formatCurrency={money} />
        </div>
      )}
    </section>
  );
}

function ReserveCard({ overview }: { overview: FinancialOverview }) {
  const { reserve } = overview;
  if (overview.temporal === "past") {
    return (
      <section className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-label="Reserva">
        <p className="text-sm font-semibold text-orange-300">Reserva estimada</p>
        <p className="mt-2 text-sm text-slate-400">Mês encerrado: não há reserva a proteger.</p>
        <p className="mt-3 text-xs text-slate-400">
          Gastos variáveis realizados: <span className="font-semibold text-white">{money(reserve.variableRealized)}</span>
          {" · "}média dos 3 meses anteriores: {money(reserve.historicalMonthlyAverage)}
        </p>
      </section>
    );
  }

  const rows: [string, number, string?][] = [
    [overview.temporal === "current" ? "Média histórica do período restante" : "Média histórica do mês", reserve.historicalEstimate],
    ["Gastos variáveis já lançados (previstos)", reserve.knownVariable, "Lançamentos variáveis futuros já registrados nas contas do histórico."],
    ["Estimado ainda não lançado", reserve.estimatedNotRegistered],
  ];

  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-label="Reserva estimada do mês">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-orange-300">Reserva estimada do mês</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-orange-300">{money(reserve.total)}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">
          Confiança: <strong className="font-semibold">{CONFIDENCE_LABELS[reserve.confidence]}</strong>
          <InfoTip text={describeConfidence(reserve.confidence, reserve.monthsAvailable)} />
        </span>
      </div>

      {reserve.confidence === "indisponivel" ? (
        <p className="mt-3 text-sm text-slate-400">
          Nenhuma conta usa histórico de gastos. Ative &quot;Usar no cálculo da reserva&quot; nas contas do dia a dia.
        </p>
      ) : reserve.confidence === "baixa" ? (
        <p className="mt-3 text-sm text-slate-400">Histórico insuficiente para estimar a reserva.</p>
      ) : null}

      <dl className="mt-4 space-y-2 text-sm">
        {rows.map(([label, value, info]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
            <dt className="flex min-w-0 items-center gap-1 text-slate-400">
              <span className="min-w-0">{label}</span>
              {info && <InfoTip text={info} />}
            </dt>
            <dd className="whitespace-nowrap tabular-nums text-white">{money(value)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 pt-1">
          <dt className="text-slate-300">Reserva final (o maior entre média e já lançado)</dt>
          <dd className="whitespace-nowrap font-semibold tabular-nums text-orange-300">{money(reserve.total)}</dd>
        </div>
      </dl>

      {reserve.historyMonths.some((item) => item.accountsAvailable > 0) && (
        <p className="mt-3 text-xs text-slate-400">
          Meses usados: {reserve.historyMonths
            .filter((item) => item.accountsAvailable > 0)
            .map((item) => `${item.key.slice(5, 7)}/${item.key.slice(2, 4)} (peso ${item.weight})`)
            .join(", ")}.
        </p>
      )}
    </section>
  );
}

function CardsCard({ overview }: { overview: FinancialOverview }) {
  const { cards } = overview;
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-label="Cartões de crédito">
      <p className="text-sm font-semibold text-orange-300">Cartões de crédito</p>
      {cards.cardsCount === 0 ? (
        <p className="mt-2 text-sm text-slate-400">Nenhum cartão participa do planejamento.</p>
      ) : (
        <>
          <p className="mt-2 whitespace-nowrap text-2xl font-semibold tabular-nums text-white">{money(cards.used)}</p>
          <p className="text-xs text-slate-400">utilizados neste mês</p>
          {cards.progress !== null ? (
            <>
              <ProgressBar value={cards.progress} tone={cards.progress > 1 ? "red" : cards.progress >= 0.8 ? "orange" : "green"} />
              <p className="mt-2 text-xs text-slate-300">
                Meta {money(cards.target)} · {percent(cards.progress)}
              </p>
              {cards.availableInTarget !== null && (
                <p className={`text-xs ${cards.availableInTarget >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {cards.availableInTarget >= 0
                    ? `Disponível na meta: ${money(cards.availableInTarget)}`
                    : `Acima da meta: ${money(Math.abs(cards.availableInTarget))}`}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Sem meta de cartões para este mês.</p>
          )}
          {overview.temporal !== "past" && (
            <p className="mt-3 text-xs text-slate-400">
              Faturas a pagar neste mês: <span className="text-white">{money(cards.invoicesDueThisMonth)}</span>
            </p>
          )}
        </>
      )}
      <Link href="/closings" className="mt-auto inline-flex min-h-10 items-center gap-1 pt-3 text-sm font-semibold text-blue-300 hover:text-blue-200">
        Ver cartões <ArrowRight size={14} />
      </Link>
    </section>
  );
}

function VariableSpendingCard({ overview }: { overview: FinancialOverview }) {
  const { reserve } = overview;
  const expected = reserve.variableExpectedMonth;
  const progress = expected > 0 ? reserve.variableRealized / expected : null;
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-label="Gastos variáveis">
      <p className="flex items-center gap-1 text-sm font-semibold text-orange-300">
        Gastos variáveis
        <InfoTip text="Despesas em débito/Pix nas contas que usam histórico (sem recorrências e parcelas)." />
      </p>
      <p className="mt-2 whitespace-nowrap text-2xl font-semibold tabular-nums text-white">{money(reserve.variableRealized)}</p>
      <p className="text-xs text-slate-400">{overview.temporal === "future" ? "nada realizado ainda" : "realizados neste mês"}</p>
      {overview.temporal !== "past" && (
        <>
          {progress !== null && <ProgressBar value={progress} tone="orange" />}
          <p className="mt-2 text-xs text-slate-300">
            Previsto no mês: {money(expected)}{progress !== null ? ` · ${percent(progress)}` : ""}
          </p>
          <p className="text-xs text-slate-400">Restante previsto: {money(reserve.total)}</p>
        </>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Média histórica mensal: {money(reserve.historicalMonthlyAverage)}
        {overview.temporal === "current" ? ` · ${overview.daysRemaining} dias restantes` : ""}
      </p>
      <Link href="/analytics/expenses" className="mt-auto inline-flex min-h-10 items-center gap-1 pt-3 text-sm font-semibold text-blue-300 hover:text-blue-200">
        Ver categorias <ArrowRight size={14} />
      </Link>
    </section>
  );
}

function SavingsListCard({ overview }: { overview: FinancialOverview }) {
  const movements = overview.savingsMovements.slice(0, 5);
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-slate-950/60 p-5 md:col-span-2 xl:col-span-1" aria-label="Guardado neste mês">
      <p className="text-sm font-semibold text-violet-300">Guardado neste mês</p>
      <p className="mt-2 whitespace-nowrap text-2xl font-semibold tabular-nums text-violet-300">{money(overview.saved)}</p>
      {movements.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">Nenhuma transferência para reserva/investimento neste mês.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {movements.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">
                  {shortDate(item.date)}{item.scheduled ? " · programado" : ""}
                </p>
                <p className="truncate text-slate-200" title={`${item.fromName} → ${item.toName}`}>
                  {item.fromName} → {item.toName}
                </p>
              </div>
              <span className={`whitespace-nowrap tabular-nums ${item.kind === "deposit" ? "text-violet-300" : "text-red-300"}`}>
                {item.kind === "deposit" ? "" : "−"}{money(item.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/transactions?new=true" className="mt-auto inline-flex min-h-10 items-center gap-1 pt-3 text-sm font-semibold text-blue-300 hover:text-blue-200">
        Nova transferência <ArrowRight size={14} />
      </Link>
    </section>
  );
}
