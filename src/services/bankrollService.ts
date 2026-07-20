import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import type { BankrollFinanceLink, BankrollFinanceOperation, BankrollSession, BankrollTransaction, BankrollWallet, EligibleFinanceAccount, FinanceAccount, SessionInput, TransactionInput, WalletInput } from "@/src/types/bankroll";
import { buildBankrollFinanceCreateRpcParams, filterActiveFinanceAccountsForOwner, isEligibleFinanceAccount } from "@/src/utils/bankrollFinanceIntegration";

const friendlyError = (message: string) => {
  const known = ["Confirme a moeda desta conta antes de utilizá-la em integrações.", "A conta financeira e a carteira precisam usar a mesma moeda.", "A competência deste lançamento está fechada.", "A conta financeira já está fechada nesta competência.", "A conta financeira está inativa.", "A carteira do Bankroll está inativa.", "Saldo insuficiente na conta financeira.", "Saldo insuficiente na carteira do Bankroll.", "Operações integradas futuras não são permitidas", "Operações integradas devem usar o fluxo oficial do Bankroll.", "A integração está inconsistente."];
  return known.find((item) => message.includes(item)) ?? "Não foi possível concluir a operação. Nenhum lançamento foi criado.";
};
const fail = (error: { message: string } | null, friendly = false) => { if (error) throw new Error(friendly ? friendlyError(error.message) : error.message); };

export async function loadBankrollData() {
  const ownerId = await getCurrentUserId();
  const [wallets, transactions, sessions, links, accounts] = await Promise.all([
    supabase.from("bankroll_wallets").select("*").eq("owner_id", ownerId).order("name"),
    supabase.from("bankroll_transactions").select("*").eq("owner_id", ownerId).order("transaction_date", { ascending: false }),
    supabase.from("bankroll_sessions").select("*").eq("owner_id", ownerId).order("session_date", { ascending: false }),
    supabase.from("bankroll_finance_links").select("*, finance_transaction:transactions(id, account_id, description, due_date, value, status, type, origin_account_id, destination_account_id, bankroll_integration_group_id, bankroll_operation_type)").eq("owner_id", ownerId),
    supabase.from("accounts").select("id, owner_id, name, type, currency, active").eq("owner_id", ownerId).eq("type", "Conta").order("name"),
  ]);
  fail(wallets.error); fail(transactions.error); fail(sessions.error); fail(links.error); fail(accounts.error);
  const financeLinks = (links.data ?? []) as unknown as BankrollFinanceLink[];
  const linksByTransaction = new Map(financeLinks.map((link) => [link.bankroll_transaction_id, link]));
  const bankrollTransactions = (transactions.data ?? []).map((transaction) => ({ ...transaction, finance_link: linksByTransaction.get(transaction.id) ?? null })) as BankrollTransaction[];
  const financeAccounts = (accounts.data ?? []) as FinanceAccount[];
  return { wallets: (wallets.data ?? []) as BankrollWallet[], transactions: bankrollTransactions, sessions: (sessions.data ?? []) as BankrollSession[], financeLinks, financeAccounts, eligibleAccounts: financeAccounts.filter(isEligibleFinanceAccount) };
}

export async function loadActiveFinanceAccounts(): Promise<FinanceAccount[]> {
  const ownerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, owner_id, name, type, currency, active")
    .eq("owner_id", ownerId)
    .eq("type", "Conta")
    .eq("active", true)
    .order("name");

  fail(error);
  return filterActiveFinanceAccountsForOwner(
    (data ?? []) as FinanceAccount[],
    ownerId
  );
}

export async function saveWallet(input: WalletInput, id?: string) {
  const ownerId = await getCurrentUserId();
  const query = id
    ? supabase.from("bankroll_wallets").update(input).eq("id", id).eq("owner_id", ownerId)
    : supabase.from("bankroll_wallets").insert({ ...input, owner_id: ownerId });
  const { error } = await query; fail(error);
}

export async function deleteWallet(id: string) {
  const ownerId = await getCurrentUserId();
  const [tx, sessions] = await Promise.all([
    supabase.from("bankroll_transactions").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("wallet_id", id),
    supabase.from("bankroll_sessions").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("wallet_id", id),
  ]);
  fail(tx.error); fail(sessions.error);
  if ((tx.count ?? 0) + (sessions.count ?? 0) > 0) throw new Error("Esta carteira possui movimentações ou sessões. Inative-a para preservar o histórico.");
  const { error } = await supabase.from("bankroll_wallets").delete().eq("id", id).eq("owner_id", ownerId); fail(error);
}

export async function saveTransaction(input: TransactionInput, id?: string) {
  const ownerId = await getCurrentUserId();
  if (input.transaction_type.startsWith("transfer_")) throw new Error("Use a operação de transferência para manter os dois lados consistentes.");
  const query = id
    ? supabase.from("bankroll_transactions").update({ ...input, transfer_group_id: null, counterpart_wallet_id: null }).eq("id", id).eq("owner_id", ownerId).is("transfer_group_id", null)
    : supabase.from("bankroll_transactions").insert({ ...input, owner_id: ownerId });
  const { error } = await query; fail(error);
}

export async function saveIntegratedFinanceOperation(input: BankrollFinanceOperation) {
  await getCurrentUserId();
  const params = { p_account_id: input.accountId, p_wallet_id: input.walletId, p_date: input.date, p_amount: input.amount, p_notes: input.notes };
  const response = "integrationGroupId" in input
    ? await supabase.rpc("update_bankroll_finance_operation", { p_integration_group_id: input.integrationGroupId, ...params })
    : input.operationType === "deposit"
      ? await supabase.rpc("create_bankroll_finance_deposit", buildBankrollFinanceCreateRpcParams(input))
      : await supabase.rpc("create_bankroll_finance_withdrawal", buildBankrollFinanceCreateRpcParams(input));
  fail(response.error, true);
  return response.data;
}

export async function deleteIntegratedFinanceOperation(integrationGroupId: string) {
  await getCurrentUserId();
  const { error } = await supabase.rpc("delete_bankroll_finance_operation", { p_integration_group_id: integrationGroupId });
  fail(error, true);
}

export async function saveTransfer(input: { originWalletId: string; destinationWalletId: string; date: string; amount: number; description: string | null; notes: string | null; groupId?: string }) {
  await getCurrentUserId();
  const params = { p_origin_wallet_id: input.originWalletId, p_destination_wallet_id: input.destinationWalletId, p_date: input.date, p_amount: input.amount, p_description: input.description, p_notes: input.notes };
  const { error } = input.groupId
    ? await supabase.rpc("update_bankroll_transfer", { p_transfer_group_id: input.groupId, ...params })
    : await supabase.rpc("create_bankroll_transfer", params);
  fail(error);
}

export async function deleteTransaction(transaction: BankrollTransaction) {
  const ownerId = await getCurrentUserId();
  if (transaction.finance_link) {
    await deleteIntegratedFinanceOperation(transaction.finance_link.integration_group_id);
    return;
  }
  if (transaction.transfer_group_id) {
    const { error } = await supabase.rpc("delete_bankroll_transfer", { p_transfer_group_id: transaction.transfer_group_id }); fail(error); return;
  }
  const { error } = await supabase.from("bankroll_transactions").delete().eq("id", transaction.id).eq("owner_id", ownerId).is("transfer_group_id", null); fail(error);
}

export async function saveSession(input: SessionInput, id?: string) {
  const ownerId = await getCurrentUserId();
  const query = id
    ? supabase.from("bankroll_sessions").update(input).eq("id", id).eq("owner_id", ownerId)
    : supabase.from("bankroll_sessions").insert({ ...input, owner_id: ownerId });
  const { error } = await query; fail(error);
}

export async function deleteSession(id: string) {
  const ownerId = await getCurrentUserId();
  const { error } = await supabase.from("bankroll_sessions").delete().eq("id", id).eq("owner_id", ownerId); fail(error);
}
