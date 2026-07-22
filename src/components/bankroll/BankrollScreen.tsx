"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Plus,
  Search,
  Spade,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useModalShortcuts } from "@/src/hooks/useModalShortcuts";
import {
  deleteSession,
  deleteTransaction,
  deleteWallet,
  loadBankrollData,
  saveSession,
  saveTransaction,
  saveTransfer,
  saveWallet,
} from "@/src/services/bankrollService";
import type {
  BankrollDirection,
  BankrollSession,
  BankrollSessionType,
  BankrollTransaction,
  BankrollTransactionType,
  BankrollWallet,
  BankrollWalletType,
} from "@/src/types/bankroll";
import {
  buildBankrollEvolution,
  buildMonthlyResults,
  buildTransactionView,
  calculateSession,
  calculateTournamentIndicators,
  calculateWalletBalance,
  findLargestPrize,
  getTransactionEffect,
  summarizeByCurrency,
} from "@/src/utils/bankrollCalculations";
import {
  parseBankrollMoney,
  requireBankrollMoney,
} from "@/src/utils/bankrollMoney";
import BankrollFinanceTransactions from "@/src/components/bankroll/BankrollFinanceTransactions";
import type {
  BankrollFinanceLink,
  EligibleFinanceAccount,
  FinanceAccount,
} from "@/src/types/bankroll";

type View = "dashboard" | "wallets" | "sessions" | "transactions";
type Data = {
  wallets: BankrollWallet[];
  sessions: BankrollSession[];
  transactions: BankrollTransaction[];
  financeLinks: BankrollFinanceLink[];
  financeAccounts: FinanceAccount[];
  eligibleAccounts: EligibleFinanceAccount[];
};
const emptyData: Data = {
  wallets: [],
  sessions: [],
  transactions: [],
  financeLinks: [],
  financeAccounts: [],
  eligibleAccounts: [],
};
const gameTypes = [
  "Texas Hold'em",
  "Omaha",
  "Omaha Hi-Lo",
  "Five Card PLO",
  "Short Deck",
  "Mixed Games",
];
const field =
  "w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60";
const card = "rounded-2xl border border-white/10 bg-slate-950/60 p-5";
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
const previewMoney = (value: string) => {
  const parsed = parseBankrollMoney(value);
  return parsed.ok ? parsed.value : 0;
};
const labels: Record<string, string> = {
  online: "Online",
  live: "Ao vivo",
  cash: "Caixa físico",
  other: "Outro",
  deposit: "Depósito",
  withdrawal: "Saque",
  adjustment: "Ajuste",
  bonus: "Bônus",
  staking_received: "Staking recebido",
  staking_paid: "Staking pago",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
  tournament: "Torneio",
  cash_game: "Cash game",
  sit_and_go: "Sit & Go",
  spin: "Spin",
};

export default function BankrollScreen({ view }: { view: View }) {
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setData(await loadBankrollData());
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Não foi possível carregar o bankroll.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void loadBankrollData()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((value: unknown) => {
        if (active)
          setError(
            value instanceof Error
              ? value.message
              : "Não foi possível carregar o bankroll.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-cyan-300">
            <Spade size={20} />
            <span className="text-xs font-black uppercase tracking-[.2em]">
              Bankroll Poker
            </span>
          </div>
          <h1 className="text-3xl font-black text-white">
            {view === "dashboard"
              ? "Visão geral"
              : view === "wallets"
                ? "Carteiras"
                : view === "sessions"
                  ? "Sessões"
                  : "Movimentações"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Gestão separada por moeda, com histórico e resultados auditáveis.
          </p>
        </div>
      </header>
      <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-900/50 p-2 md:flex">
        {[
          ["dashboard", "/bankroll", "Visão geral"],
          ["wallets", "/bankroll/wallets", "Carteiras"],
          ["sessions", "/bankroll/sessions", "Sessões"],
          ["transactions", "/bankroll/transactions", "Movimentações"],
        ].map(([key, href, label]) => (
          <Link
            key={key}
            href={href}
            className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold transition ${view === key ? "bg-cyan-500/15 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
        >
          {error}
        </div>
      )}
      {loading ? (
        <div className={`${card} text-center text-slate-400`}>
          Carregando dados do bankroll...
        </div>
      ) : view === "dashboard" ? (
        <Dashboard data={data} />
      ) : view === "wallets" ? (
        <Wallets data={data} reload={reload} />
      ) : view === "sessions" ? (
        <Sessions data={data} reload={reload} />
      ) : (
        <BankrollFinanceTransactions data={data} reload={reload} />
      )}
    </div>
  );
}

function Dashboard({ data }: { data: Data }) {
  const [currency, setCurrency] = useState(data.wallets[0]?.currency ?? "BRL");
  const [walletFilter, setWalletFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const currencyWallets = data.wallets.filter(
    (w) => w.currency === currency && (!walletFilter || w.id === walletFilter),
  );
  const walletIds = new Set(currencyWallets.map((w) => w.id));
  const sessions = data.sessions.filter(
    (s) =>
      walletIds.has(s.wallet_id) &&
      (!startDate || s.session_date >= startDate) &&
      (!endDate || s.session_date <= endDate),
  );
  const indicators = calculateTournamentIndicators(sessions);
  const totals = summarizeByCurrency(
    currencyWallets,
    data.transactions,
    data.sessions,
  );
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const year = String(now.getFullYear());
  const monthSessions = sessions.filter((s) =>
    s.session_date.startsWith(month),
  );
  const yearSessions = sessions.filter((s) => s.session_date.startsWith(year));
  const monthResult = monthSessions.reduce(
    (sum, s) => sum + calculateSession(s).netResult,
    0,
  );
  const yearResult = yearSessions.reduce(
    (sum, s) => sum + calculateSession(s).netResult,
    0,
  );
  const monthInvested = calculateTournamentIndicators(monthSessions).invested;
  const evolution = buildBankrollEvolution(
    currencyWallets,
    data.transactions,
    data.sessions,
    currency,
    { startDate, endDate },
  );
  const monthly = buildMonthlyResults(sessions);
  const currencyOptions = [...new Set(data.wallets.map((w) => w.currency))];
  const distribution = currencyWallets.map((wallet) => ({
    name: wallet.name,
    balance: calculateWalletBalance(wallet, data.transactions, data.sessions),
  }));
  const cards = [
    [
      "Bankroll atual",
      money(totals.find((t) => t.currency === currency)?.amount ?? 0, currency),
    ],
    ["Resultado do mês", money(monthResult, currency)],
    ["Resultado do ano", money(yearResult, currency)],
    ["Investido no mês", money(monthInvested, currency)],
    ["ROI", indicators.roi === null ? "—" : `${indicators.roi.toFixed(2)}%`],
    ["ABI", indicators.abi === null ? "—" : money(indicators.abi, currency)],
    ["Sessões", String(sessions.length)],
    ["ITM", indicators.itm === null ? "—" : `${indicators.itm.toFixed(2)}%`],
    ["Maior premiação", money(findLargestPrize(sessions), currency)],
  ];
  if (!data.wallets.length)
    return (
      <Empty
        title="Comece criando uma carteira"
        text="A visão geral será preenchida após o primeiro cadastro."
        href="/bankroll/wallets"
      />
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href="/bankroll/transactions?action=deposit"
          className="rounded-xl bg-cyan-500 px-4 py-2.5 text-center text-sm font-black text-slate-950"
        >
          Registrar depósito
        </Link>
        <Link
          href="/bankroll/transactions?action=withdrawal"
          className="rounded-xl border border-cyan-400/30 px-4 py-2.5 text-center text-sm font-bold text-cyan-200"
        >
          Registrar saque
        </Link>
        <Link
          href="/bankroll/sessions"
          className="rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm font-bold text-slate-300"
        >
          Nova sessão
        </Link>
        <Link
          href="/bankroll/transactions"
          className="rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm font-bold text-slate-300"
        >
          Nova movimentação
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="text-sm font-semibold text-slate-300"
          htmlFor="dashboard-currency"
        >
          Moeda
        </label>
        <select
          id="dashboard-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className={`${field} w-40`}
        >
          {currencyOptions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          Depósitos e saques não compõem o resultado de poker. Ajustes e bônus
          afetam apenas o saldo.
        </span>
      </div>
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 sm:grid-cols-3">
        <Input label="Carteira">
          <select
            className={field}
            value={walletFilter}
            onChange={(e) => setWalletFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {data.wallets
              .filter((w) => w.currency === currency)
              .map((w) => (
                <option value={w.id} key={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </Input>
        <Input label="Início">
          <input
            type="date"
            className={field}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Input>
        <Input label="Fim">
          <input
            type="date"
            className={field}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Input>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <div className={card} key={label}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>
      <Chart title="Distribuição por carteira">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution} layout="vertical">
            <CartesianGrid stroke="rgba(148,163,184,.1)" />
            <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
            />
            <Tooltip />
            <Bar dataKey="balance" fill="#a78bfa" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Chart>
      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="Evolução do bankroll">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolution}>
              <CartesianGrid stroke="rgba(148,163,184,.1)" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip />
              <Area
                dataKey="balance"
                stroke="#22d3ee"
                fill="rgba(34,211,238,.15)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Chart>
        <Chart title="Resultado mensal">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid stroke="rgba(148,163,184,.1)" />
              <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="result" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Chart>
      </div>
      <div className={card}>
        <h2 className="font-bold text-white">Últimas sessões</h2>
        <div className="mt-4 space-y-2">
          {sessions.slice(0, 5).map((s) => (
            <div
              key={s.id}
              className="flex flex-col justify-between gap-1 rounded-xl bg-white/[.03] p-3 sm:flex-row"
            >
              <span className="text-sm text-slate-300">
                {date(s.session_date)} ·{" "}
                {s.event_name || labels[s.session_type]}
              </span>
              <Result
                value={calculateSession(s).netResult}
                currency={currency}
              />
            </div>
          ))}
          {!sessions.length && (
            <p className="text-sm text-slate-500">
              Nenhuma sessão nesta moeda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Wallets({
  data,
  reload,
}: {
  data: Data;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<BankrollWallet | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    wallet_type: "online",
    currency: "BRL",
    initial_balance: "0",
    notes: "",
    active: true,
  });
  const rows = data.wallets
    .filter(
      (w) =>
        (status === "all" || w.active === (status === "active")) &&
        w.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const currencyLocked = Boolean(
    editing &&
    (data.transactions.some((item) => item.wallet_id === editing.id) ||
      data.sessions.some((item) => item.wallet_id === editing.id)),
  );
  const close = useCallback(() => {
    if (!saving) setOpen(false);
  }, [saving]);
  useModalShortcuts({ enabled: open, onEscape: close });
  function show(wallet?: BankrollWallet) {
    setEditing(wallet ?? null);
    setForm(
      wallet
        ? {
            name: wallet.name,
            wallet_type: wallet.wallet_type,
            currency: wallet.currency,
            initial_balance: String(wallet.initial_balance),
            notes: wallet.notes ?? "",
            active: wallet.active,
          }
        : {
            name: "",
            wallet_type: "online",
            currency: "BRL",
            initial_balance: "0",
            notes: "",
            active: true,
          },
    );
    setOpen(true);
  }
  async function submit() {
    if (!form.name.trim()) return alert("Informe o nome da carteira.");
    try {
      setSaving(true);
      await saveWallet(
        {
          ...form,
          name: form.name.trim(),
          wallet_type: form.wallet_type as BankrollWalletType,
          initial_balance: requireBankrollMoney(
            form.initial_balance,
            "Saldo inicial",
          ),
          notes: form.notes.trim() || null,
        },
        editing?.id,
      );
      setOpen(false);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={field}
        >
          <option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
          <option value="all">Todas</option>
        </select>
        <Add onClick={() => show()}>Nova carteira</Add>
      </Toolbar>
      <Table
        headers={["Nome", "Tipo", "Moeda", "Saldo atual", "Status", "Ações"]}
      >
        {rows.map((w) => (
          <tr key={w.id} className="border-t border-white/10">
            <Td strong>{w.name}</Td>
            <Td>{labels[w.wallet_type]}</Td>
            <Td>{w.currency}</Td>
            <Td>
              {money(
                calculateWalletBalance(w, data.transactions, data.sessions),
                w.currency,
              )}
            </Td>
            <Td>{w.active ? "Ativa" : "Inativa"}</Td>
            <Td>
              <Actions
                onEdit={() => show(w)}
                onDelete={async () => {
                  if (confirm(`Excluir a carteira ${w.name}?`))
                    try {
                      await deleteWallet(w.id);
                      await reload();
                    } catch (e) {
                      alert(
                        e instanceof Error ? e.message : "Erro ao excluir.",
                      );
                    }
                }}
              />
            </Td>
          </tr>
        ))}
      </Table>
      {!rows.length && (
        <Empty
          title="Nenhuma carteira encontrada"
          text="Ajuste os filtros ou cadastre sua primeira carteira."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Editar carteira" : "Nova carteira"}
          close={close}
          saving={saving}
          submit={submit}
        >
          <Input label="Nome">
            <input
              className={field}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Input>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Tipo">
              <select
                className={field}
                value={form.wallet_type}
                onChange={(e) =>
                  setForm({ ...form, wallet_type: e.target.value })
                }
              >
                {["online", "live", "cash", "other"].map((v) => (
                  <option value={v} key={v}>
                    {labels[v]}
                  </option>
                ))}
              </select>
            </Input>
            <Input label="Moeda">
              <input
                className={`${field} disabled:cursor-not-allowed disabled:opacity-60`}
                maxLength={3}
                disabled={currencyLocked}
                value={form.currency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    currency: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, ""),
                  })
                }
              />
              {currencyLocked && (
                <span className="block text-xs font-normal text-amber-300">
                  A moeda não pode ser alterada porque esta carteira possui
                  histórico.
                </span>
              )}
            </Input>
          </div>
          <Input label="Saldo inicial">
            <input
              inputMode="decimal"
              className={field}
              value={form.initial_balance}
              onChange={(e) =>
                setForm({ ...form, initial_balance: e.target.value })
              }
            />
          </Input>
          <Input label="Observações">
            <textarea
              className={field}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Input>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />{" "}
            Carteira ativa
          </label>
        </Modal>
      )}
    </div>
  );
}

// Mantido temporariamente para facilitar a comparação visual com a Fase 1.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Transactions({
  data,
  reload,
}: {
  data: Data;
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BankrollTransaction | null>(null);
  const [search, setSearch] = useState("");
  const [wallet, setWallet] = useState("");
  const [type, setType] = useState("");
  const [currency, setCurrency] = useState(data.wallets[0]?.currency ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const empty = {
    date: today(),
    wallet_id: data.wallets.find((w) => w.active)?.id ?? "",
    destination: "",
    type: "deposit",
    direction: "in",
    amount: "",
    description: "",
    notes: "",
  };
  const [form, setForm] = useState(empty);
  const close = useCallback(() => {
    if (!saving) setOpen(false);
  }, [saving]);
  useModalShortcuts({ enabled: open, onEscape: close });
  const filteredTransactions = data.transactions.filter(
    (t) =>
      (!currency ||
        data.wallets.find((w) => w.id === t.wallet_id)?.currency ===
          currency) &&
      (!type ||
        (type === "transfer_out"
          ? ["transfer_in", "transfer_out"].includes(t.transaction_type)
          : t.transaction_type === type)) &&
      (!startDate || t.transaction_date >= startDate) &&
      (!endDate || t.transaction_date <= endDate) &&
      [t.description, t.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const transactionView = buildTransactionView(filteredTransactions, wallet);
  const rows = transactionView.rows;
  const incoming = transactionView.incoming,
    outgoing = transactionView.outgoing;
  function show(t?: BankrollTransaction) {
    setEditing(t ?? null);
    setForm(
      t
        ? {
            date: t.transaction_date,
            wallet_id:
              t.transaction_type === "transfer_out"
                ? t.wallet_id
                : (t.counterpart_wallet_id ?? t.wallet_id),
            destination:
              t.transaction_type === "transfer_in"
                ? t.wallet_id
                : (t.counterpart_wallet_id ?? ""),
            type: t.transfer_group_id ? "transfer" : t.transaction_type,
            direction: t.direction,
            amount: String(t.amount),
            description: t.description ?? "",
            notes: t.notes ?? "",
          }
        : { ...empty, wallet_id: data.wallets.find((w) => w.active)?.id ?? "" },
    );
    setOpen(true);
  }
  async function submit() {
    if (!form.wallet_id) return alert("Informe a carteira.");
    try {
      setSaving(true);
      const amount = requireBankrollMoney(form.amount, "Valor");
      if (amount <= 0) throw new Error("O valor deve ser maior que zero.");
      if (form.type === "transfer") {
        if (!form.destination || form.destination === form.wallet_id)
          throw new Error("Escolha carteiras diferentes.");
        await saveTransfer({
          originWalletId: form.wallet_id,
          destinationWalletId: form.destination,
          date: form.date,
          amount,
          description: form.description || null,
          notes: form.notes || null,
          groupId: editing?.transfer_group_id ?? undefined,
        });
      } else {
        const fixedIn = ["deposit", "bonus", "staking_received"].includes(
          form.type,
        );
        const fixedOut = ["withdrawal", "staking_paid"].includes(form.type);
        await saveTransaction(
          {
            wallet_id: form.wallet_id,
            transaction_date: form.date,
            transaction_type: form.type as BankrollTransactionType,
            direction: (fixedIn
              ? "in"
              : fixedOut
                ? "out"
                : form.direction) as BankrollDirection,
            amount,
            description: form.description || null,
            notes: form.notes || null,
          },
          editing?.id,
        );
      }
      setOpen(false);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  const active = data.wallets.filter((w) => w.active);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={`Entradas (${currency})`} value={incoming} />
        <Metric label={`Saídas (${currency})`} value={outgoing} />
        <Metric label={`Líquido (${currency})`} value={incoming - outgoing} />
      </div>
      <Toolbar search={search} setSearch={setSearch}>
        <select
          className={field}
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        >
          <option value="">Todas as carteiras</option>
          {data.wallets.map((w) => (
            <option value={w.id} key={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {[
            "deposit",
            "withdrawal",
            "adjustment",
            "bonus",
            "staking_received",
            "staking_paid",
            "transfer_out",
          ].map((v) => (
            <option value={v} key={v}>
              {labels[v]}
            </option>
          ))}
        </select>
        <select
          aria-label="Moeda"
          className={field}
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            setWallet("");
          }}
        >
          {[...new Set(data.wallets.map((w) => w.currency))].map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          aria-label="Data inicial"
          type="date"
          className={field}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          aria-label="Data final"
          type="date"
          className={field}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <Add onClick={() => show()}>Nova movimentação</Add>
      </Toolbar>
      <Table
        headers={["Data", "Carteira", "Tipo", "Descrição", "Valor", "Ações"]}
      >
        {rows.map((t) => {
          const w = data.wallets.find((x) => x.id === t.wallet_id);
          return (
            <tr key={t.id} className="border-t border-white/10">
              <Td>{date(t.transaction_date)}</Td>
              <Td>{w?.name ?? "—"}</Td>
              <Td>{labels[t.transaction_type]}</Td>
              <Td>{t.description || "—"}</Td>
              <Td>
                <Result
                  value={getTransactionEffect(t)}
                  currency={w?.currency ?? "BRL"}
                />
              </Td>
              <Td>
                <Actions
                  onEdit={() => show(t)}
                  onDelete={async () => {
                    if (confirm("Excluir esta movimentação?")) {
                      try {
                        await deleteTransaction(t);
                        await reload();
                      } catch (e) {
                        alert(
                          e instanceof Error ? e.message : "Erro ao excluir.",
                        );
                      }
                    }
                  }}
                />
              </Td>
            </tr>
          );
        })}
      </Table>
      {!rows.length && (
        <Empty
          title="Nenhuma movimentação encontrada"
          text="Registre depósitos, saques, ajustes ou transferências."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Editar movimentação" : "Nova movimentação"}
          close={close}
          saving={saving}
          submit={submit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Data">
              <input
                type="date"
                className={field}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Input>
            <Input label="Tipo">
              <select
                className={field}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {[
                  "deposit",
                  "withdrawal",
                  "transfer",
                  "adjustment",
                  "bonus",
                  "staking_received",
                  "staking_paid",
                ].map((v) => (
                  <option key={v} value={v}>
                    {v === "transfer" ? "Transferência" : labels[v]}
                  </option>
                ))}
              </select>
            </Input>
          </div>
          <Input
            label={form.type === "transfer" ? "Carteira de origem" : "Carteira"}
          >
            <select
              className={field}
              value={form.wallet_id}
              onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}
            >
              <option value="">Selecione</option>
              {active.map((w) => (
                <option value={w.id} key={w.id}>
                  {w.name} ({w.currency})
                </option>
              ))}
            </select>
          </Input>
          {form.type === "transfer" && (
            <Input label="Carteira de destino">
              <select
                className={field}
                value={form.destination}
                onChange={(e) =>
                  setForm({ ...form, destination: e.target.value })
                }
              >
                <option value="">Selecione</option>
                {active
                  .filter(
                    (w) =>
                      w.id !== form.wallet_id &&
                      w.currency ===
                        data.wallets.find((x) => x.id === form.wallet_id)
                          ?.currency,
                  )
                  .map((w) => (
                    <option value={w.id} key={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </Input>
          )}
          {form.type === "adjustment" && (
            <Input label="Direção">
              <select
                className={field}
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value })
                }
              >
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
              </select>
            </Input>
          )}
          <Input label="Valor">
            <input
              inputMode="decimal"
              className={field}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Input>
          <Input label="Descrição">
            <input
              className={field}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Input>
          <Input label="Observações">
            <textarea
              className={field}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Input>
        </Modal>
      )}
    </div>
  );
}

function Sessions({
  data,
  reload,
}: {
  data: Data;
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BankrollSession | null>(null);
  const [search, setSearch] = useState(""),
    [wallet, setWallet] = useState(""),
    [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [game, setGame] = useState("");
  const [result, setResult] = useState("");
  const blank = {
    date: today(),
    wallet_id: data.wallets.find((w) => w.active)?.id ?? "",
    session_type: "tournament",
    game_type: "Texas Hold'em",
    format: "",
    event_name: "",
    buy_in: "",
    reentries: "0",
    reentry_cost: "",
    add_on_cost: "",
    prize: "",
    fees: "",
    cash_buy_in: "",
    cash_out: "",
    duration: "",
    notes: "",
  };
  const [form, setForm] = useState(blank);
  const close = useCallback(() => {
    if (!saving) setOpen(false);
  }, [saving]);
  useModalShortcuts({ enabled: open, onEscape: close });
  const rows = data.sessions.filter((s) => {
    const net = calculateSession(s).netResult;
    return (
      (!wallet || s.wallet_id === wallet) &&
      (!type || s.session_type === type) &&
      (!game || s.game_type.toLowerCase().includes(game.toLowerCase())) &&
      (!result || (result === "positive" ? net >= 0 : net < 0)) &&
      (!startDate || s.session_date >= startDate) &&
      (!endDate || s.session_date <= endDate) &&
      [s.event_name, s.game_type, s.format]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  function show(s?: BankrollSession) {
    setEditing(s ?? null);
    setForm(
      s
        ? {
            date: s.session_date,
            wallet_id: s.wallet_id,
            session_type: s.session_type,
            game_type: s.game_type,
            format: s.format ?? "",
            event_name: s.event_name ?? "",
            buy_in: String(s.buy_in),
            reentries: String(s.reentries),
            reentry_cost: String(s.reentry_cost),
            add_on_cost: String(s.add_on_cost),
            prize: String(s.prize),
            fees: String(s.fees),
            cash_buy_in: String(s.cash_buy_in ?? ""),
            cash_out: String(s.cash_out ?? ""),
            duration: String(s.duration_minutes ?? ""),
            notes: s.notes ?? "",
          }
        : { ...blank, wallet_id: data.wallets.find((w) => w.active)?.id ?? "" },
    );
    setOpen(true);
  }
  const preview = calculateSession({
    session_type: form.session_type as BankrollSessionType,
    buy_in: previewMoney(form.buy_in),
    reentries: Number(form.reentries) || 0,
    reentry_cost: previewMoney(form.reentry_cost),
    add_on_cost: previewMoney(form.add_on_cost),
    prize: previewMoney(form.prize),
    fees: previewMoney(form.fees),
    cash_buy_in:
      form.cash_buy_in === "" ? null : previewMoney(form.cash_buy_in),
    cash_out: form.cash_out === "" ? null : previewMoney(form.cash_out),
  });
  const selectedCurrency =
    data.wallets.find((w) => w.id === form.wallet_id)?.currency ?? "BRL";
  async function submit() {
    if (!form.wallet_id || !form.game_type.trim())
      return alert("Informe carteira e modalidade.");
    try {
      setSaving(true);
      const cash = form.session_type === "cash_game";
      const reentries = Number(form.reentries || 0),
        duration = form.duration ? Number(form.duration) : null;
      if (!Number.isInteger(reentries) || reentries < 0)
        throw new Error("Reentradas deve ser um inteiro não negativo.");
      if (duration !== null && (!Number.isInteger(duration) || duration < 0))
        throw new Error("Duração deve ser um inteiro não negativo.");
      await saveSession(
        {
          wallet_id: form.wallet_id,
          session_date: form.date,
          session_type: form.session_type as BankrollSessionType,
          game_type: form.game_type.trim(),
          format: form.format || null,
          event_name: form.event_name || null,
          buy_in: cash ? 0 : requireBankrollMoney(form.buy_in, "Buy-in", 0),
          reentries: cash ? 0 : reentries,
          reentry_cost: cash
            ? 0
            : requireBankrollMoney(form.reentry_cost, "Valor por reentrada", 0),
          add_on_cost: cash
            ? 0
            : requireBankrollMoney(form.add_on_cost, "Add-on", 0),
          prize: cash ? 0 : requireBankrollMoney(form.prize, "Premiação", 0),
          fees: requireBankrollMoney(form.fees, "Taxas", 0),
          cash_buy_in: cash
            ? requireBankrollMoney(form.cash_buy_in, "Entrada", 0)
            : null,
          cash_out: cash
            ? requireBankrollMoney(form.cash_out, "Saída", 0)
            : null,
          duration_minutes: duration,
          notes: form.notes || null,
        },
        editing?.id,
      );
      setOpen(false);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch}>
        <select
          className={field}
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        >
          <option value="">Todas as carteiras</option>
          {data.wallets.map((w) => (
            <option value={w.id} key={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {["tournament", "cash_game", "sit_and_go", "spin", "other"].map(
            (v) => (
              <option value={v} key={v}>
                {labels[v] ?? "Outro"}
              </option>
            ),
          )}
        </select>
        <input
          aria-label="Modalidade"
          className={field}
          placeholder="Modalidade"
          value={game}
          onChange={(e) => setGame(e.target.value)}
        />
        <select
          aria-label="Resultado"
          className={field}
          value={result}
          onChange={(e) => setResult(e.target.value)}
        >
          <option value="">Todos os resultados</option>
          <option value="positive">Positivo</option>
          <option value="negative">Negativo</option>
        </select>
        <input
          aria-label="Data inicial"
          type="date"
          className={field}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          aria-label="Data final"
          type="date"
          className={field}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <Add onClick={() => show()}>Nova sessão</Add>
      </Toolbar>
      <Table
        headers={[
          "Data",
          "Carteira",
          "Tipo",
          "Evento",
          "Investido",
          "Retorno",
          "Resultado / ROI",
          "Ações",
        ]}
      >
        {rows.map((s) => {
          const w = data.wallets.find((x) => x.id === s.wallet_id),
            m = calculateSession(s);
          return (
            <tr key={s.id} className="border-t border-white/10">
              <Td>{date(s.session_date)}</Td>
              <Td>{w?.name ?? "—"}</Td>
              <Td>{labels[s.session_type] ?? "Outro"}</Td>
              <Td>{s.event_name || s.format || s.game_type}</Td>
              <Td>{money(m.invested, w?.currency ?? "BRL")}</Td>
              <Td>{money(m.returnAmount, w?.currency ?? "BRL")}</Td>
              <Td>
                <Result value={m.netResult} currency={w?.currency ?? "BRL"} />
                {m.roi !== null && (
                  <span className="text-xs text-slate-500">
                    ROI {m.roi.toFixed(2)}%
                  </span>
                )}
              </Td>
              <Td>
                <Actions
                  onEdit={() => show(s)}
                  onDelete={async () => {
                    if (confirm("Excluir esta sessão?")) {
                      try {
                        await deleteSession(s.id);
                        await reload();
                      } catch (e) {
                        alert(
                          e instanceof Error ? e.message : "Erro ao excluir.",
                        );
                      }
                    }
                  }}
                />
              </Td>
            </tr>
          );
        })}
      </Table>
      {!rows.length && (
        <Empty
          title="Nenhuma sessão encontrada"
          text="Registre um torneio ou uma sessão de cash game."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Editar sessão" : "Nova sessão"}
          close={close}
          saving={saving}
          submit={submit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Data">
              <input
                type="date"
                className={field}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Input>
            <Input label="Carteira">
              <select
                className={field}
                value={form.wallet_id}
                onChange={(e) =>
                  setForm({ ...form, wallet_id: e.target.value })
                }
              >
                <option value="">Selecione</option>
                {data.wallets
                  .filter((w) => w.active || w.id === form.wallet_id)
                  .map((w) => (
                    <option value={w.id} key={w.id}>
                      {w.name} ({w.currency})
                    </option>
                  ))}
              </select>
            </Input>
            <Input label="Tipo">
              <select
                className={field}
                value={form.session_type}
                onChange={(e) =>
                  setForm({ ...form, session_type: e.target.value })
                }
              >
                {["tournament", "cash_game", "sit_and_go", "spin", "other"].map(
                  (v) => (
                    <option value={v} key={v}>
                      {labels[v] ?? "Outro"}
                    </option>
                  ),
                )}
              </select>
            </Input>
            <Input label="Modalidade">
              <select
                className={field}
                value={form.game_type}
                onChange={(e) =>
                  setForm({ ...form, game_type: e.target.value })
                }
              >
                {gameTypes.map((game) => (
                  <option key={game} value={game}>
                    {game}
                  </option>
                ))}
              </select>
            </Input>
          </div>
          <Input
            label={
              form.session_type === "cash_game"
                ? "Local ou mesa"
                : "Nome do torneio (opcional)"
            }
          >
            <input
              className={field}
              value={form.event_name}
              onChange={(e) => setForm({ ...form, event_name: e.target.value })}
            />
          </Input>
          {form.session_type === "cash_game" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyInput
                label="Entrada"
                value={form.cash_buy_in}
                set={(v) => setForm({ ...form, cash_buy_in: v })}
              />
              <MoneyInput
                label="Saída"
                value={form.cash_out}
                set={(v) => setForm({ ...form, cash_out: v })}
              />
            </div>
          ) : (
            <>
              <h3 className="text-sm font-bold tracking-wide text-cyan-300">
                Dados Financeiros
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyInput
                  label="Buy-in"
                  value={form.buy_in}
                  set={(v) => setForm({ ...form, buy_in: v })}
                />
                <MoneyInput
                  label="Taxas"
                  value={form.fees}
                  set={(v) => setForm({ ...form, fees: v })}
                />
                <Input label="Reentradas">
                  <input
                    type="number"
                    min="0"
                    className={field}
                    value={form.reentries}
                    onChange={(e) =>
                      setForm({ ...form, reentries: e.target.value })
                    }
                  />
                </Input>
                <MoneyInput
                  label="Valor por reentrada"
                  value={form.reentry_cost}
                  set={(v) => setForm({ ...form, reentry_cost: v })}
                />
                <MoneyInput
                  label="Premiação"
                  value={form.prize}
                  set={(v) => setForm({ ...form, prize: v })}
                />
                <Input label="Duração (minutos)">
                  <input
                    type="number"
                    min="0"
                    className={field}
                    value={form.duration}
                    onChange={(e) =>
                      setForm({ ...form, duration: e.target.value })
                    }
                  />
                </Input>
              </div>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-3 gap-2 rounded-2xl bg-cyan-500/5 p-4 text-sm">
            <span>
              Investido
              <br />
              <b>{money(preview.invested, selectedCurrency)}</b>
            </span>
            <span>
              Resultado
              <br />
              <b>{money(preview.netResult, selectedCurrency)}</b>
            </span>
            {preview.roi !== null && (
              <span>
                ROI
                <br />
                <b>{preview.roi.toFixed(2)}%</b>
              </span>
            )}
          </div>
          <Input label="Observações">
            <textarea
              className={field}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Input>
        </Modal>
      )}
    </div>
  );
}

function Toolbar({
  search,
  setSearch,
  children,
}: {
  search: string;
  setSearch: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,auto))]">
      <label className="relative">
        <Search className="absolute left-3 top-3 text-slate-500" size={17} />
        <input
          aria-label="Pesquisar"
          className={`${field} pl-10`}
          placeholder="Pesquisar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {children}
    </div>
  );
}
function Add({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-300"
    >
      <Plus size={17} />
      {children}
    </button>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({
  children,
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 ${strong ? "font-bold text-white" : "text-slate-300"}`}
    >
      {children}
    </td>
  );
}
function Actions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        aria-label="Editar"
        onClick={onEdit}
        className="rounded-lg border border-white/10 p-2 text-cyan-300"
      >
        <Pencil size={15} />
      </button>
      <button
        aria-label="Excluir"
        onClick={onDelete}
        className="rounded-lg border border-white/10 p-2 text-red-300"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
function Result({ value, currency }: { value: number; currency: string }) {
  return (
    <span
      className={`flex items-center gap-1 font-bold ${value >= 0 ? "text-emerald-300" : "text-red-300"}`}
    >
      {value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
      <span>
        {value >= 0 ? "Ganho" : "Perda"}: {money(value, currency)}
      </span>
    </span>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={card}>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">
        {value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}
function Chart({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={card}>
      <h2 className="mb-4 font-bold text-white">{title}</h2>
      <div className="h-72">{children}</div>
    </div>
  );
}
function Empty({
  title,
  text,
  href,
}: {
  title: string;
  text: string;
  href?: string;
}) {
  return (
    <div className={`${card} text-center`}>
      <WalletCards className="mx-auto text-slate-600" />
      <h2 className="mt-3 font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
      {href && (
        <Link
          href={href}
          className="mt-4 inline-block rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950"
        >
          Criar carteira
        </Link>
      )}
    </div>
  );
}
function Input({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-semibold text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}
function MoneyInput({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
}) {
  return (
    <Input label={label}>
      <input
        inputMode="decimal"
        className={field}
        value={value}
        onChange={(e) => set(e.target.value.replace(/[^0-9,.]/g, ""))}
      />
    </Input>
  );
}
function Modal({
  title,
  close,
  saving,
  submit,
  children,
}: {
  title: string;
  close: () => void;
  saving: boolean;
  submit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-white">{title}</h2>
          <button
            aria-label="Fechar"
            onClick={close}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10"
          >
            <X />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={close}
            disabled={saving}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
