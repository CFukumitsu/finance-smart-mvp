"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useModalShortcuts } from "@/src/hooks/useModalShortcuts";
import {
  deleteTransaction,
  loadActiveFinanceAccounts,
  saveIntegratedFinanceOperation,
  saveTransaction,
  saveTransfer,
} from "@/src/services/bankrollService";
import type {
  BankrollDirection,
  BankrollFinanceIntegrationMode,
  BankrollFinanceLink,
  BankrollSession,
  BankrollTransaction,
  BankrollTransactionType,
  BankrollWallet,
  EligibleFinanceAccount,
  FinanceAccount,
} from "@/src/types/bankroll";
import { buildTransactionView, getTransactionEffect } from "@/src/utils/bankrollCalculations";
import { createBankrollFinanceIdempotencyKey, filterEligibleFinanceAccountsForWallet, getFinanceAccountEmptyMessage, getNewBankrollMovementSelection, isEligibleFinanceAccount, shouldLoadFinanceAccounts, validateBankrollFinanceForm } from "@/src/utils/bankrollFinanceIntegration";
import { requireBankrollMoney } from "@/src/utils/bankrollMoney";

type Data = {
  wallets: BankrollWallet[];
  sessions: BankrollSession[];
  transactions: BankrollTransaction[];
  financeLinks: BankrollFinanceLink[];
  financeAccounts: FinanceAccount[];
  eligibleAccounts: EligibleFinanceAccount[];
};
type FormState = {
  date: string;
  walletId: string;
  destinationWalletId: string;
  type: BankrollTransactionType | "transfer";
  direction: BankrollDirection;
  amount: string;
  description: string;
  notes: string;
  mode: BankrollFinanceIntegrationMode;
  financeAccountId: string;
  idempotencyKey: string;
};

const field = "w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60";
const labels: Record<string, string> = { deposit: "Depósito", withdrawal: "Saque", adjustment: "Ajuste", bonus: "Bônus", staking_received: "Staking recebido", staking_paid: "Staking pago", transfer_in: "Transferência recebida", transfer_out: "Transferência enviada", transfer: "Transferência entre carteiras" };
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number, currency: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
const displayDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function blank(type: "deposit" | "withdrawal" = "deposit"): FormState {
  return { date: today(), ...getNewBankrollMovementSelection(), destinationWalletId: "", type, direction: "in", amount: "", description: "", notes: "", mode: "integrated", idempotencyKey: createBankrollFinanceIdempotencyKey() };
}

export default function BankrollFinanceTransactions({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const searchParams = useSearchParams();
  const quickActionOpened = useRef(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BankrollTransaction | null>(null);
  const [form, setForm] = useState<FormState>(() => blank());
  const [activeFinanceAccounts, setActiveFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [loadingFinanceAccounts, setLoadingFinanceAccounts] = useState(false);
  const [financeAccountsError, setFinanceAccountsError] = useState("");
  const [search, setSearch] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [currency, setCurrency] = useState(data.wallets[0]?.currency ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const close = useCallback(() => { if (!saving) setOpen(false); }, [saving]);
  useModalShortcuts({ enabled: open, onEscape: close });

  const show = useCallback((transaction?: BankrollTransaction, quickType?: "deposit" | "withdrawal") => {
    setEditing(transaction ?? null);
    if (!transaction) {
      setForm(blank(quickType));
    } else {
      const link = transaction.finance_link;
      setForm({
        date: transaction.transaction_date,
        walletId: transaction.transaction_type === "transfer_out" ? transaction.wallet_id : transaction.counterpart_wallet_id ?? transaction.wallet_id,
        destinationWalletId: transaction.transaction_type === "transfer_in" ? transaction.wallet_id : transaction.counterpart_wallet_id ?? "",
        type: transaction.transfer_group_id ? "transfer" : transaction.transaction_type,
        direction: transaction.direction,
        amount: String(transaction.amount),
        description: transaction.description ?? "",
        notes: transaction.notes ?? "",
        mode: link ? "integrated" : "bankroll_only",
        financeAccountId: link?.finance_transaction?.account_id ?? "",
        idempotencyKey: "",
      });
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!quickActionOpened.current && data.wallets.length && (action === "deposit" || action === "withdrawal")) {
      quickActionOpened.current = true;
      show(undefined, action);
    }
  }, [data.wallets.length, searchParams, show]);

  useEffect(() => {
    if (!shouldLoadFinanceAccounts({ open, mode: form.mode, type: form.type })) {
      return;
    }

    let active = true;
    setLoadingFinanceAccounts(true);
    setFinanceAccountsError("");
    void loadActiveFinanceAccounts()
      .then((accounts) => {
        if (active) setActiveFinanceAccounts(accounts);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setActiveFinanceAccounts([]);
        setFinanceAccountsError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as contas financeiras."
        );
      })
      .finally(() => {
        if (active) setLoadingFinanceAccounts(false);
      });

    return () => {
      active = false;
    };
  }, [form.mode, form.type, open]);

  const filtered = useMemo(() => data.transactions.filter((transaction) => {
    const wallet = data.wallets.find((item) => item.id === transaction.wallet_id);
    return (!currency || wallet?.currency === currency)
      && (!typeFilter || (typeFilter === "transfer_out" ? ["transfer_in", "transfer_out"].includes(transaction.transaction_type) : transaction.transaction_type === typeFilter))
      && (!startDate || transaction.transaction_date >= startDate)
      && (!endDate || transaction.transaction_date <= endDate)
      && [transaction.description, transaction.notes].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  }), [currency, data.transactions, data.wallets, endDate, search, startDate, typeFilter]);
  const view = buildTransactionView(filtered, walletFilter);
  const selectedWallet = data.wallets.find((wallet) => wallet.id === form.walletId);
  const eligibleAccounts = filterEligibleFinanceAccountsForWallet(
    activeFinanceAccounts.filter(isEligibleFinanceAccount),
    selectedWallet
  );
  const financeAccountEmptyMessage = getFinanceAccountEmptyMessage(
    activeFinanceAccounts,
    selectedWallet
  );
  const integrated = ["deposit", "withdrawal"].includes(form.type) && form.mode === "integrated";
  const activeWallets = data.wallets.filter((wallet) => wallet.active || wallet.id === form.walletId);

  async function submit() {
    if (saving) return;
    try {
      setSaving(true);
      const amount = requireBankrollMoney(form.amount, "Valor");
      if (form.type === "transfer") {
        if (!form.walletId || !form.destinationWalletId || form.walletId === form.destinationWalletId) throw new Error("Escolha carteiras diferentes.");
        await saveTransfer({ originWalletId: form.walletId, destinationWalletId: form.destinationWalletId, date: form.date, amount, description: form.description || null, notes: form.notes || null, groupId: editing?.transfer_group_id ?? undefined });
      } else if (integrated) {
        const account = eligibleAccounts.find((item) => item.id === form.financeAccountId);
        const validation = validateBankrollFinanceForm({ mode: form.mode, operationType: form.type as "deposit" | "withdrawal", account, wallet: selectedWallet, amount, date: form.date });
        if (validation) throw new Error(validation);
        const operation = { operationType: form.type as "deposit" | "withdrawal", accountId: form.financeAccountId, walletId: form.walletId, date: form.date, amount, notes: form.notes || null };
        await saveIntegratedFinanceOperation(
          editing?.finance_link
            ? { ...operation, integrationGroupId: editing.finance_link.integration_group_id }
            : { ...operation, idempotencyKey: form.idempotencyKey }
        );
      } else {
        if (!form.walletId) throw new Error("Selecione a carteira do Bankroll.");
        const fixedIn = ["deposit", "bonus", "staking_received"].includes(form.type);
        const fixedOut = ["withdrawal", "staking_paid"].includes(form.type);
        await saveTransaction({ wallet_id: form.walletId, transaction_date: form.date, transaction_type: form.type as BankrollTransactionType, direction: fixedIn ? "in" : fixedOut ? "out" : form.direction, amount, description: form.description || null, notes: form.notes || null }, editing?.id);
      }
      setOpen(false);
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(transaction: BankrollTransaction) {
    const question = transaction.finance_link ? "Excluir a operação integrada nos dois módulos?" : "Excluir esta movimentação?";
    if (!confirm(question)) return;
    try { await deleteTransaction(transaction); await reload(); }
    catch (error) { alert(error instanceof Error ? error.message : "Erro ao excluir."); }
  }

  function integrationStatus(transaction: BankrollTransaction) {
    if (!transaction.finance_link) return "Somente Bankroll";
    const link = transaction.finance_link;
    const finance = link.finance_transaction;
    const consistent = Boolean(
      finance &&
      transaction.bankroll_integration_group_id === link.integration_group_id &&
      finance.bankroll_integration_group_id === link.integration_group_id &&
      finance.bankroll_operation_type === link.operation_type &&
      transaction.transaction_type === link.operation_type &&
      finance.value === transaction.amount &&
      finance.due_date === transaction.transaction_date
    );
    return consistent ? "Integrado" : "Inconsistente";
  }

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: `Entradas (${currency})`, value: view.incoming }, { label: `Saídas (${currency})`, value: view.outgoing }, { label: `Líquido (${currency})`, value: view.net }].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/60 p-5"><p className="text-xs uppercase text-slate-500">{item.label}</p><p className="mt-1 text-xl font-black text-white">{item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>)}
    </div>
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:grid-cols-2 xl:grid-cols-4">
      <input aria-label="Pesquisar" className={field} placeholder="Pesquisar..." value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Carteira" className={field} value={walletFilter} onChange={(event) => setWalletFilter(event.target.value)}><option value="">Todas as carteiras</option>{data.wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}</select>
      <select aria-label="Tipo" className={field} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todos os tipos</option>{["deposit", "withdrawal", "adjustment", "bonus", "staking_received", "staking_paid", "transfer_out"].map((type) => <option value={type} key={type}>{labels[type]}</option>)}</select>
      <select aria-label="Moeda" className={field} value={currency} onChange={(event) => { setCurrency(event.target.value); setWalletFilter(""); }}><option value="">Todas as moedas</option>{[...new Set(data.wallets.map((wallet) => wallet.currency))].map((value) => <option value={value} key={value}>{value}</option>)}</select>
      <input aria-label="Data inicial" type="date" className={field} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      <input aria-label="Data final" type="date" className={field} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      <button onClick={() => show()} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-300"><Plus size={17}/>Nova movimentação</button>
    </div>

    <div className="grid gap-3 md:hidden">{view.rows.map((transaction) => { const wallet = data.wallets.find((item) => item.id === transaction.wallet_id); return <article key={transaction.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><div className="flex justify-between gap-3"><div><p className="text-xs text-slate-500">{displayDate(transaction.transaction_date)}</p><h3 className="font-bold text-white">{labels[transaction.transaction_type]}</h3><p className="text-sm text-slate-400">{wallet?.name}</p></div><strong className={transaction.direction === "in" ? "text-emerald-300" : "text-red-300"}>{money(getTransactionEffect(transaction), wallet?.currency ?? "BRL")}</strong></div><div className="mt-3 flex items-center justify-between"><span className="rounded-full bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300">{integrationStatus(transaction)}</span><div className="flex gap-2"><button aria-label="Editar" onClick={() => show(transaction)} className="rounded-lg border border-white/10 p-2 text-cyan-300"><Pencil size={15}/></button><button aria-label="Excluir" onClick={() => void remove(transaction)} className="rounded-lg border border-white/10 p-2 text-red-300"><Trash2 size={15}/></button></div></div></article>; })}</div>

    <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 md:block"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr>{["Data", "Carteira", "Conta financeira", "Tipo", "Modo", "Valor", "Ações"].map((header) => <th className="px-4 py-3" key={header}>{header}</th>)}</tr></thead><tbody>{view.rows.map((transaction) => { const wallet = data.wallets.find((item) => item.id === transaction.wallet_id); const account = data.financeAccounts.find((item) => item.id === transaction.finance_link?.finance_transaction?.account_id); return <tr key={transaction.id} className="border-t border-white/10"><td className="px-4 py-3">{displayDate(transaction.transaction_date)}</td><td className="px-4 py-3">{wallet?.name ?? "—"}</td><td className="px-4 py-3">{account?.name ?? "—"}</td><td className="px-4 py-3">{labels[transaction.transaction_type]}</td><td className="px-4 py-3 text-cyan-300">{integrationStatus(transaction)}</td><td className={transaction.direction === "in" ? "px-4 py-3 font-bold text-emerald-300" : "px-4 py-3 font-bold text-red-300"}>{money(getTransactionEffect(transaction), wallet?.currency ?? "BRL")}</td><td className="px-4 py-3"><div className="flex gap-2"><button aria-label="Editar" onClick={() => show(transaction)} className="rounded-lg border border-white/10 p-2 text-cyan-300"><Pencil size={15}/></button><button aria-label="Excluir" onClick={() => void remove(transaction)} className="rounded-lg border border-white/10 p-2 text-red-300"><Trash2 size={15}/></button></div></td></tr>; })}</tbody></table></div>
    {!view.rows.length && <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 text-center text-slate-400">Nenhuma movimentação encontrada.</div>}

    {open && <div role="dialog" aria-modal="true" aria-label={editing ? "Editar movimentação" : "Nova movimentação"} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-950 p-5 sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black text-white">{editing ? "Editar movimentação" : "Nova movimentação"}</h2><button aria-label="Fechar" onClick={close} className="rounded-lg p-2 text-slate-400"><X/></button></div><div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Data"><input type="date" max={today()} className={field} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })}/></Field><Field label="Tipo"><select disabled={Boolean(editing?.finance_link)} className={field} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as FormState["type"] })}>{["deposit", "withdrawal", "transfer", "bonus", "adjustment", "staking_received", "staking_paid"].map((type) => <option value={type} key={type}>{labels[type]}</option>)}</select></Field></div>
      {["deposit", "withdrawal"].includes(form.type) && <Field label="Modo de registro"><select disabled={Boolean(editing)} className={field} value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as BankrollFinanceIntegrationMode, financeAccountId: "" })}><option value="integrated">Integrado ao Financeiro</option><option value="bankroll_only">Somente no Bankroll</option></select>{editing && <span className="block text-xs font-normal text-slate-500">O modo de uma movimentação existente não pode ser convertido.</span>}</Field>}
      <Field label={form.type === "transfer" || form.type === "withdrawal" ? "Carteira de origem" : "Carteira de destino"}><select className={field} value={form.walletId} onChange={(event) => setForm({ ...form, walletId: event.target.value, financeAccountId: "" })}><option value="">Selecione</option>{activeWallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></Field>
      {integrated && <Field label={form.type === "deposit" ? "Conta financeira de origem" : "Conta financeira de destino"}>
        {loadingFinanceAccounts ? (
          <span className="block rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-normal text-slate-400">Carregando contas financeiras...</span>
        ) : financeAccountsError ? (
          <span role="alert" className="block rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2.5 text-sm font-normal text-red-200">{financeAccountsError}</span>
        ) : activeFinanceAccounts.length === 0 ? (
          <span className="block rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-sm font-normal text-amber-200">{financeAccountEmptyMessage}</span>
        ) : (
          <>
            <select className={field} value={form.financeAccountId} onChange={(event) => setForm({ ...form, financeAccountId: event.target.value })} required>
              <option value="">Selecione</option>
              {activeFinanceAccounts.map((account) => {
                const selectable = eligibleAccounts.some((item) => item.id === account.id);
                const accountLabel = account.currency
                  ? `${account.name} (${account.currency})`
                  : `${account.name} (moeda não confirmada)`;
                return <option value={account.id} key={account.id} disabled={!selectable}>{accountLabel}</option>;
              })}
            </select>
            {financeAccountEmptyMessage && <span className="block text-xs font-normal text-amber-300">{financeAccountEmptyMessage}</span>}
          </>
        )}
      </Field>}
      {form.type === "transfer" && <Field label="Carteira de destino"><select className={field} value={form.destinationWalletId} onChange={(event) => setForm({ ...form, destinationWalletId: event.target.value })}><option value="">Selecione</option>{activeWallets.filter((wallet) => wallet.id !== form.walletId && wallet.currency === selectedWallet?.currency).map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}</select></Field>}
      {form.type === "adjustment" && <Field label="Direção"><select className={field} value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as BankrollDirection })}><option value="in">Entrada</option><option value="out">Saída</option></select></Field>}
      <Field label="Valor"><input inputMode="decimal" className={field} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/[^0-9,.]/g, "") })}/></Field>
      {integrated ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">{form.type === "deposit" ? `Saída na conta financeira e entrada na carteira ${selectedWallet?.name ?? "selecionada"}.` : `Saída na carteira ${selectedWallet?.name ?? "selecionada"} e entrada na conta financeira.`}<span className="mt-1 block text-xs text-cyan-300">Não será contabilizada como receita ou despesa.</span></div> : (["deposit", "withdrawal"].includes(form.type) && <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">Nenhum lançamento será criado no Financeiro.</div>)}
      {!integrated && <Field label="Descrição"><input className={field} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></Field>}
      <Field label="Observações"><textarea className={field} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></Field>
    </div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={close} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300">Cancelar</button><button onClick={() => void submit()} disabled={saving} className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button></div></div></div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-semibold text-slate-300"><span>{label}</span>{children}</label>;
}
