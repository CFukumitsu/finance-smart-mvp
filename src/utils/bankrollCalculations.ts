import type { BankrollCurrency, BankrollSession, BankrollTransaction, BankrollWallet, CurrencyTotal } from "../types/bankroll";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const COMPETITIVE_SESSION_TYPES = ["tournament", "sit_and_go", "spin"] as const;
export const isCompetitiveSession = (session: Pick<BankrollSession, "session_type">) =>
  COMPETITIVE_SESSION_TYPES.includes(session.session_type as (typeof COMPETITIVE_SESSION_TYPES)[number]);
export const usesTournamentFinancialModel = (session: Pick<BankrollSession, "session_type">) => session.session_type !== "cash_game";

export function calculateSession(session: Pick<BankrollSession, "session_type" | "buy_in" | "reentries" | "reentry_cost" | "add_on_cost" | "prize" | "fees" | "cash_buy_in" | "cash_out">) {
  const tournament = usesTournamentFinancialModel(session);
  const invested = tournament
    ? session.buy_in + session.reentries * session.reentry_cost + session.add_on_cost + session.fees
    : (session.cash_buy_in ?? 0) + session.fees;
  const returnAmount = tournament ? session.prize : (session.cash_out ?? 0);
  const netResult = roundMoney(returnAmount - invested);
  return { invested: roundMoney(invested), returnAmount: roundMoney(returnAmount), netResult, roi: isCompetitiveSession(session) && invested > 0 ? roundMoney(netResult / invested * 100) : null };
}

export function getTransactionEffect(transaction: Pick<BankrollTransaction, "direction" | "amount">) {
  return roundMoney(transaction.direction === "in" ? transaction.amount : -transaction.amount);
}

export function calculateWalletBalance(wallet: Pick<BankrollWallet, "id" | "initial_balance">, transactions: BankrollTransaction[], sessions: BankrollSession[]) {
  const movement = transactions.filter((item) => item.wallet_id === wallet.id).reduce((sum, item) => sum + getTransactionEffect(item), 0);
  const result = sessions.filter((item) => item.wallet_id === wallet.id).reduce((sum, item) => sum + calculateSession(item).netResult, 0);
  return roundMoney(wallet.initial_balance + movement + result);
}

export function summarizeByCurrency(wallets: BankrollWallet[], transactions: BankrollTransaction[], sessions: BankrollSession[]): CurrencyTotal[] {
  const totals = new Map<BankrollCurrency, number>();
  wallets.forEach((wallet) => totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + calculateWalletBalance(wallet, transactions, sessions)));
  return [...totals].map(([currency, amount]) => ({ currency, amount: roundMoney(amount) })).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function calculateTournamentIndicators(sessions: BankrollSession[]) {
  const tournaments = sessions.filter(isCompetitiveSession);
  const totals = tournaments.map(calculateSession);
  const invested = roundMoney(totals.reduce((sum, item) => sum + item.invested, 0));
  const result = roundMoney(totals.reduce((sum, item) => sum + item.netResult, 0));
  const count = tournaments.length;
  const itmCount = tournaments.filter((item) => item.prize > 0).length;
  return {
    invested, result, count,
    abi: count > 0 ? roundMoney(invested / count) : null,
    roi: invested > 0 ? roundMoney(result / invested * 100) : null,
    itm: count > 0 ? roundMoney(itmCount / count * 100) : null,
    itmCount,
  };
}

export function buildMonthlyResults(sessions: BankrollSession[]) {
  const months = new Map<string, number>();
  sessions.forEach((session) => {
    const month = session.session_date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + calculateSession(session).netResult);
  });
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, result]) => ({ month, result: roundMoney(result) }));
}

export function filterSessionsByPeriod(sessions: BankrollSession[], startDate = "", endDate = "") {
  return sessions.filter((session) => (!startDate || session.session_date >= startDate) && (!endDate || session.session_date <= endDate));
}

export function findLargestPrize(sessions: BankrollSession[]) {
  return sessions.reduce((largest, session) => Math.max(largest, session.prize), 0);
}

export function buildTransactionView(transactions: BankrollTransaction[], walletId = "") {
  const scoped = walletId ? transactions.filter((transaction) => transaction.wallet_id === walletId) : transactions;
  const rows = walletId ? scoped : scoped.filter((transaction) => transaction.transaction_type !== "transfer_in");
  const volumeRows = walletId ? scoped : scoped.filter((transaction) => !["transfer_in", "transfer_out"].includes(transaction.transaction_type));
  const incoming = roundMoney(volumeRows.reduce((sum, transaction) => sum + (transaction.direction === "in" ? transaction.amount : 0), 0));
  const outgoing = roundMoney(volumeRows.reduce((sum, transaction) => sum + (transaction.direction === "out" ? transaction.amount : 0), 0));
  return { rows, incoming, outgoing, net: roundMoney(incoming - outgoing) };
}

export function buildBankrollEvolution(
  wallets: BankrollWallet[],
  transactions: BankrollTransaction[],
  sessions: BankrollSession[],
  currency: BankrollCurrency,
  period: { startDate?: string; endDate?: string } = {}
) {
  const currencyWallets = wallets.filter((wallet) => wallet.currency === currency);
  const ids = new Set(currencyWallets.map((wallet) => wallet.id));
  let balance = currencyWallets.reduce((sum, wallet) => sum + wallet.initial_balance, 0);
  const allEvents = [
    ...transactions.filter((item) => ids.has(item.wallet_id)).map((item) => ({ date: item.transaction_date, value: getTransactionEffect(item) })),
    ...sessions.filter((item) => ids.has(item.wallet_id)).map((item) => ({ date: item.session_date, value: calculateSession(item).netResult })),
  ];
  const startDate = period.startDate ?? "";
  const endDate = period.endDate ?? "";
  allEvents.filter((event) => startDate && event.date < startDate).forEach((event) => { balance += event.value; });

  const dailyChanges = new Map<string, number>();
  allEvents
    .filter((event) => (!startDate || event.date >= startDate) && (!endDate || event.date <= endDate))
    .forEach((event) => dailyChanges.set(event.date, (dailyChanges.get(event.date) ?? 0) + event.value));

  const points: Array<{ date: string; balance: number; opening?: boolean }> = [];
  if (startDate) points.push({ date: startDate, balance: roundMoney(balance), opening: true });
  [...dailyChanges].sort(([a], [b]) => a.localeCompare(b)).forEach(([date, change]) => {
    balance = roundMoney(balance + change);
    points.push({ date, balance });
  });
  return points;
}
