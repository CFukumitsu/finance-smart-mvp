"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  deleteInvestmentAccountEvent,
  saveInvestmentAccountEvent,
} from "@/src/services/investmentService";
import type {
  InvestmentAccountEvent,
  InvestmentAccountEventType,
  InvestmentData,
} from "@/src/types/investments";
import { calculateInvestmentAccountSummaries } from "@/src/utils/investmentCalculations";
import {
  formatInvestmentDate,
  formatInvestmentMoney,
  InvestmentActions,
  InvestmentAddButton,
  InvestmentEmpty,
  InvestmentInput,
  InvestmentModal,
  InvestmentTable,
  InvestmentTd,
  investmentCard,
  investmentField,
} from "./InvestmentUi";
import { formatInvestmentMoneyInput, parseInvestmentMoney } from "@/src/utils/investmentFormatting";

const today = () => new Date().toISOString().slice(0, 10);

const eventLabels: Record<InvestmentAccountEventType, string> = {
  opening_balance: "Saldo inicial",
  application: "Aplicação",
  redemption: "Resgate",
  yield: "Rendimento",
  positive_adjustment: "Ajuste",
};

function requiresFinancialAccount(type: InvestmentAccountEventType) {
  return type === "application" || type === "redemption";
}

export default function InvestmentAccountEvents({
  data,
  reload,
}: {
  data: InvestmentData;
  reload: () => Promise<void>;
}) {
  const balanceAccounts = data.accounts.filter(
    (account) => account.investment_account_kind === "BALANCE",
  );
  const accountsById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account])),
    [data.accounts],
  );
  const summaries = useMemo(
    () =>
      calculateInvestmentAccountSummaries({
        accounts: data.accounts,
        events: data.accountEvents,
      }),
    [data.accountEvents, data.accounts],
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvestmentAccountEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: today(),
    investmentAccountId: "",
    financialAccountId: "",
    type: "application" as InvestmentAccountEventType,
    amount: "",
    notes: "",
  });
  const submissionLock = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const close = useCallback(() => {
    if (!submissionLock.current) setOpen(false);
  }, []);

  function eligibleFinancialAccounts(investmentAccountId: string) {
    const investmentAccount = accountsById.get(investmentAccountId);
    return data.accounts.filter(
      (account) =>
        account.investment_account_kind !== "BALANCE" &&
        account.type === "Conta" &&
        account.active &&
        Boolean(account.currency) &&
        account.currency === investmentAccount?.currency,
    );
  }

  function show(event?: InvestmentAccountEvent) {
    const investmentAccountId =
      event?.investment_account_id ??
      balanceAccounts.find((account) => account.active)?.id ??
      balanceAccounts[0]?.id ??
      "";
    const financialAccounts = eligibleFinancialAccounts(investmentAccountId);
    idempotencyKey.current = crypto.randomUUID();
    setEditing(event ?? null);
    setForm({
      date: event?.event_date ?? today(),
      investmentAccountId,
      financialAccountId:
        event?.financial_account_id ?? financialAccounts[0]?.id ?? "",
      type: event?.event_type ?? "application",
      amount: event ? formatInvestmentMoneyInput(event.amount) : "",
      notes: event?.notes ?? "",
    });
    setOpen(true);
  }

  function changeInvestmentAccount(investmentAccountId: string) {
    const financialAccounts = eligibleFinancialAccounts(investmentAccountId);
    setForm((current) => ({
      ...current,
      investmentAccountId,
      financialAccountId: financialAccounts.some(
        (account) => account.id === current.financialAccountId,
      )
        ? current.financialAccountId
        : (financialAccounts[0]?.id ?? ""),
    }));
  }

  async function submit() {
    if (submissionLock.current) return;
    const amount = parseInvestmentMoney(form.amount);
    if (!form.date) return alert("Informe a data.");
    if (!form.investmentAccountId)
      return alert("Selecione a conta de investimento.");
    if (!Number.isFinite(amount) || amount <= 0)
      return alert("Informe um valor maior que zero.");
    if (requiresFinancialAccount(form.type) && !form.financialAccountId)
      return alert("Selecione a conta financeira.");

    try {
      submissionLock.current = true;
      setSaving(true);
      await saveInvestmentAccountEvent(
        {
          investment_account_id: form.investmentAccountId,
          financial_account_id: requiresFinancialAccount(form.type)
            ? form.financialAccountId
            : null,
          event_type: form.type,
          event_date: form.date,
          amount,
          notes: form.notes.trim() || null,
          idempotency_key: idempotencyKey.current,
        },
        editing?.id,
      );
      setOpen(false);
      await reload();
    } catch (value) {
      alert(
        value instanceof Error
          ? value.message
          : "Não foi possível salvar a movimentação.",
      );
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  async function remove(event: InvestmentAccountEvent) {
    if (!confirm(`Excluir ${eventLabels[event.event_type].toLowerCase()}?`)) return;
    try {
      await deleteInvestmentAccountEvent(event.id);
      await reload();
    } catch (value) {
      alert(
        value instanceof Error
          ? value.message
          : "Não foi possível excluir a movimentação.",
      );
    }
  }

  const selectedInvestmentAccount = accountsById.get(form.investmentAccountId);
  const financialAccounts = eligibleFinancialAccounts(form.investmentAccountId);
  const selectedCurrency = selectedInvestmentAccount?.currency ?? "BRL";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Contas por saldo</h2>
          <p className="mt-1 text-sm text-slate-400">
            Aplicações e resgates movimentam apenas a conta financeira. O saldo
            do investimento vem exclusivamente dos eventos abaixo.
          </p>
        </div>
        {balanceAccounts.length > 0 && (
          <InvestmentAddButton onClick={() => show()}>
            Nova movimentação
          </InvestmentAddButton>
        )}
      </div>

      {summaries.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <div className={investmentCard} key={summary.accountId}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {summary.accountName}
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {formatInvestmentMoney(summary.balance, summary.currency)}
              </p>
              <div className="mt-3 flex justify-between text-xs text-slate-400">
                <span>Rendimento</span>
                <span className={summary.result >= 0 ? "text-emerald-300" : "text-red-300"}>
                  {formatInvestmentMoney(summary.result, summary.currency)}
                  {summary.profitabilityPercent === null
                    ? ""
                    : ` · ${summary.profitabilityPercent.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.accountEvents.length > 0 ? (
        <InvestmentTable
          headers={["Data", "Conta", "Evento", "Conta financeira", "Valor", "Ações"]}
          minWidth="920px"
        >
          {data.accountEvents.map((event) => {
            const investmentAccount = accountsById.get(event.investment_account_id);
            const financialAccount = event.financial_account_id
              ? accountsById.get(event.financial_account_id)
              : null;
            return (
              <tr key={event.id} className="border-t border-white/10">
                <InvestmentTd>{formatInvestmentDate(event.event_date)}</InvestmentTd>
                <InvestmentTd strong>{investmentAccount?.name ?? "Conta indisponível"}</InvestmentTd>
                <InvestmentTd>{eventLabels[event.event_type]}</InvestmentTd>
                <InvestmentTd>{financialAccount?.name ?? "Não movimenta"}</InvestmentTd>
                <InvestmentTd>
                  <span className={event.event_type === "redemption" ? "text-amber-300" : "text-emerald-300"}>
                    {event.event_type === "redemption" ? "− " : "+ "}
                    {formatInvestmentMoney(event.amount, investmentAccount?.currency ?? "BRL")}
                  </span>
                </InvestmentTd>
                <InvestmentTd>
                  <InvestmentActions
                    onEdit={() => show(event)}
                    onDelete={() => void remove(event)}
                  />
                </InvestmentTd>
              </tr>
            );
          })}
        </InvestmentTable>
      ) : (
        <InvestmentEmpty
          title={balanceAccounts.length ? "Nenhuma movimentação por saldo" : "Nenhuma conta por saldo"}
          text={
            balanceAccounts.length
              ? "Cadastre o Saldo inicial ou a primeira Aplicação."
              : "Classifique uma conta como Conta de investimento por saldo na tela de Contas."
          }
          href={balanceAccounts.length ? undefined : "/accounts"}
          actionLabel="Gerenciar contas"
        />
      )}

      {open && (
        <InvestmentModal
          title={editing ? "Editar movimentação" : "Nova movimentação"}
          close={close}
          saving={saving}
          submit={submit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <InvestmentInput label="Data">
              <input
                autoFocus
                type="date"
                className={investmentField}
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </InvestmentInput>
            <InvestmentInput label="Evento">
              <select
                className={investmentField}
                value={form.type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as InvestmentAccountEventType,
                  })
                }
              >
                {Object.entries(eventLabels).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </InvestmentInput>
          </div>

          <InvestmentInput label="Conta de investimento">
            <select
              className={investmentField}
              value={form.investmentAccountId}
              onChange={(event) => changeInvestmentAccount(event.target.value)}
            >
              <option value="">Selecione</option>
              {balanceAccounts
                .filter((account) => account.active || account.id === editing?.investment_account_id)
                .map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
            </select>
          </InvestmentInput>

          {requiresFinancialAccount(form.type) && (
            <InvestmentInput
              label={form.type === "application" ? "Conta financeira de origem" : "Conta financeira de destino"}
              hint="Somente esta conta será afetada em Lançamentos. A contrapartida existe apenas no evento do investimento."
            >
              <select
                className={investmentField}
                value={form.financialAccountId}
                onChange={(event) => setForm({ ...form, financialAccountId: event.target.value })}
              >
                <option value="">Selecione</option>
                {financialAccounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
              </select>
            </InvestmentInput>
          )}

          <InvestmentInput
            label="Valor"
            hint={
              requiresFinancialAccount(form.type)
                ? "Será movimentado também na conta financeira selecionada."
                : "Não cria lançamento nem movimenta conta financeira."
            }
          >
            <input
              inputMode="decimal"
              className={investmentField}
              value={form.amount}
              onChange={(event) =>
                setForm({ ...form, amount: event.target.value.replace(/[^0-9.,]/g, "") })
              }
              onBlur={() => {
                const value = parseInvestmentMoney(form.amount);
                if (Number.isFinite(value)) setForm({ ...form, amount: formatInvestmentMoneyInput(value) });
              }}
              placeholder="0,00"
            />
          </InvestmentInput>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-slate-300">
            {requiresFinancialAccount(form.type)
              ? form.type === "application"
                ? "A conta financeira será debitada; a conta de investimento será creditada somente pelo evento Aplicação."
                : "A conta financeira será creditada; a conta de investimento será debitada somente pelo evento Resgate."
              : `${eventLabels[form.type]} altera somente o saldo da conta de investimento.`}
          </div>

          <InvestmentInput label="Observações" hint="Opcional">
            <textarea
              rows={3}
              className={investmentField}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </InvestmentInput>

          <p className="text-xs text-slate-500">
            Prévia: {formatInvestmentMoney(parseInvestmentMoney(form.amount) || 0, selectedCurrency)}
          </p>
        </InvestmentModal>
      )}
    </section>
  );
}
