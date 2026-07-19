import assert from "node:assert/strict";
import test from "node:test";
import type { BankrollSession, BankrollTransaction, BankrollWallet } from "../types/bankroll";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { buildBankrollEvolution, buildMonthlyResults, buildTransactionView, calculateSession, calculateTournamentIndicators, calculateWalletBalance, filterSessionsByPeriod, findLargestPrize, getTransactionEffect, summarizeByCurrency } from "./bankrollCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { parseBankrollMoney } from "./bankrollMoney.ts";

const baseSession = { id: "s", owner_id: "o", wallet_id: "w", session_date: "2026-07-01", session_type: "tournament", game_type: "Hold'em", format: null, event_name: null, buy_in: 100, reentries: 0, reentry_cost: 100, add_on_cost: 0, prize: 0, fees: 0, cash_buy_in: null, cash_out: null, duration_minutes: null, notes: null, created_at: "", updated_at: "" } as BankrollSession;
const wallet = (id: string, currency = "BRL", initial_balance = 0) => ({ id, owner_id: "o", name: id, wallet_type: "online", currency, initial_balance, active: true, notes: null, created_at: "", updated_at: "" } as BankrollWallet);
const transaction = (direction: "in" | "out", amount: number, wallet_id = "w") => ({ id: Math.random().toString(), owner_id: "o", wallet_id, transaction_date: "2026-07-01", transaction_type: direction === "in" ? "deposit" : "withdrawal", direction, amount, description: null, notes: null, transfer_group_id: null, counterpart_wallet_id: null, created_at: "", updated_at: "" } as BankrollTransaction);
const typedTransaction = (transaction_type: BankrollTransaction["transaction_type"], direction: "in" | "out", amount: number, wallet_id = "w", group: string | null = null) => ({ ...transaction(direction, amount, wallet_id), transaction_type, transfer_group_id: group, counterpart_wallet_id: group ? (wallet_id === "origin" ? "destination" : "origin") : null });

test("torneio sem reentrada", () => assert.deepEqual(calculateSession({ ...baseSession, prize: 250 }), { invested: 100, returnAmount: 250, netResult: 150, roi: 150 }));
test("torneio com múltiplas reentradas", () => assert.equal(calculateSession({ ...baseSession, reentries: 2 }).invested, 300));
test("torneio com add-on e taxas", () => assert.equal(calculateSession({ ...baseSession, add_on_cost: 50, fees: 10 }).invested, 160));
test("cash game positivo", () => assert.equal(calculateSession({ ...baseSession, session_type: "cash_game", cash_buy_in: 200, cash_out: 350, fees: 10 }).netResult, 140));
test("cash game negativo", () => assert.equal(calculateSession({ ...baseSession, session_type: "cash_game", cash_buy_in: 200, cash_out: 100, fees: 5 }).netResult, -105));
test("ROI positivo, negativo e divisão por zero", () => { assert.equal(calculateSession({ ...baseSession, prize: 200 }).roi, 100); assert.equal(calculateSession({ ...baseSession, prize: 0 }).roi, -100); assert.equal(calculateSession({ ...baseSession, buy_in: 0 }).roi, null); });
test("ABI e ITM", () => { const value = calculateTournamentIndicators([{ ...baseSession, prize: 200 }, { ...baseSession, id: "s2", buy_in: 200, prize: 0 }]); assert.equal(value.abi, 150); assert.equal(value.itm, 50); });
test("movimentações de entrada e saída", () => { assert.equal(getTransactionEffect(transaction("in", 10)), 10); assert.equal(getTransactionEffect(transaction("out", 10)), -10); });
test("transferência entre carteiras zera no consolidado", () => assert.equal(getTransactionEffect(transaction("out", 50, "a")) + getTransactionEffect(transaction("in", 50, "b")), 0));
test("saldo inicial com movimentos e sessões", () => assert.equal(calculateWalletBalance(wallet("w", "BRL", 100), [transaction("in", 50), transaction("out", 20)], [{ ...baseSession, prize: 140 }]), 170));
test("separa totais por moeda", () => assert.deepEqual(summarizeByCurrency([wallet("w", "BRL", 100), wallet("u", "USD", 20)], [], []), [{ currency: "BRL", amount: 100 }, { currency: "USD", amount: 20 }]));
test("ajuste de entrada", () => assert.equal(getTransactionEffect(typedTransaction("adjustment", "in", 25)), 25));
test("ajuste de saída", () => assert.equal(getTransactionEffect(typedTransaction("adjustment", "out", 25)), -25));
test("bônus entra no saldo", () => assert.equal(getTransactionEffect(typedTransaction("bonus", "in", 30)), 30));
test("staking recebido entra no saldo", () => assert.equal(getTransactionEffect(typedTransaction("staking_received", "in", 40)), 40));
test("staking pago sai do saldo", () => assert.equal(getTransactionEffect(typedTransaction("staking_paid", "out", 40)), -40));
test("saque sai do saldo", () => assert.equal(getTransactionEffect(typedTransaction("withdrawal", "out", 50)), -50));
test("torneio com resultado zero", () => assert.equal(calculateSession({ ...baseSession, prize: 100 }).netResult, 0));
test("carteira pode ter saldo negativo", () => assert.equal(calculateWalletBalance(wallet("w", "BRL", 10), [transaction("out", 30)], []), -20));
test("cash game não calcula ROI", () => assert.equal(calculateSession({ ...baseSession, session_type: "cash_game", cash_buy_in: 100, cash_out: 150 }).roi, null));
test("other usa modelo financeiro, mas não altera ROI, ABI ou ITM", () => {
  const other = { ...baseSession, id: "other", session_type: "other", buy_in: 1000, prize: 5000 } as BankrollSession;
  assert.equal(calculateSession(other).netResult, 4000);
  assert.equal(calculateSession(other).roi, null);
  assert.deepEqual(calculateTournamentIndicators([other]), { invested: 0, result: 0, count: 0, abi: null, roi: null, itm: null, itmCount: 0 });
});
test("evolução inclui evento anterior no saldo de abertura", () => {
  const points = buildBankrollEvolution([wallet("w", "BRL", 100)], [{ ...transaction("in", 50), transaction_date: "2026-06-30" }], [], "BRL", { startDate: "2026-07-01", endDate: "2026-07-31" });
  assert.deepEqual(points, [{ date: "2026-07-01", balance: 150, opening: true }]);
});
test("evolução inclui múltiplos eventos anteriores", () => {
  const points = buildBankrollEvolution([wallet("w", "BRL", 100)], [{ ...transaction("in", 50), transaction_date: "2026-06-10" }], [{ ...baseSession, session_date: "2026-06-20", prize: 140 }], "BRL", { startDate: "2026-07-01" });
  assert.equal(points[0].balance, 190);
});
test("saldo de abertura pode ser negativo", () => {
  const points = buildBankrollEvolution([wallet("w", "BRL", 10)], [{ ...transaction("out", 30), transaction_date: "2026-06-30" }], [], "BRL", { startDate: "2026-07-01" });
  assert.equal(points[0].balance, -20);
});
test("período sem eventos mantém ponto de abertura", () => {
  const points = buildBankrollEvolution([wallet("w", "BRL", 100)], [], [], "BRL", { startDate: "2026-07-01", endDate: "2026-07-31" });
  assert.deepEqual(points, [{ date: "2026-07-01", balance: 100, opening: true }]);
});
test("eventos na mesma data são agrupados deterministicamente", () => {
  const points = buildBankrollEvolution([wallet("w", "BRL", 100)], [transaction("in", 50)], [{ ...baseSession, prize: 120 }], "BRL");
  assert.deepEqual(points, [{ date: "2026-07-01", balance: 170 }]);
});
test("resultados mensais agrupam por session_date", () => {
  const result = buildMonthlyResults([{ ...baseSession, session_date: "2026-06-10", prize: 150 }, { ...baseSession, id: "july", session_date: "2026-07-10", prize: 80 }]);
  assert.deepEqual(result, [{ month: "2026-06", result: 50 }, { month: "2026-07", result: -20 }]);
});
test("maior premiação respeita o conjunto filtrado", () => assert.equal(findLargestPrize([{ ...baseSession, prize: 100 }, { ...baseSession, id: "large", prize: 500 }]), 500));
test("filtro por período usa session_date inclusive", () => {
  const sessions = [{ ...baseSession, id: "before", session_date: "2026-06-30" }, { ...baseSession, id: "inside", session_date: "2026-07-01" }, { ...baseSession, id: "after", session_date: "2026-08-01" }];
  assert.deepEqual(filterSessionsByPeriod(sessions, "2026-07-01", "2026-07-31").map((item) => item.id), ["inside"]);
});
const transferPair = [typedTransaction("transfer_out", "out", 75, "origin", "group"), typedTransaction("transfer_in", "in", 75, "destination", "group")];
test("visão consolidada da transferência tem líquido e volumes operacionais zerados", () => { const view = buildTransactionView(transferPair); assert.deepEqual({ incoming: view.incoming, outgoing: view.outgoing, net: view.net }, { incoming: 0, outgoing: 0, net: 0 }); assert.equal(view.rows.length, 1); });
test("visão da origem contém somente saída", () => { const view = buildTransactionView(transferPair, "origin"); assert.equal(view.net, -75); assert.deepEqual(view.rows.map((item) => item.transaction_type), ["transfer_out"]); });
test("visão do destino contém somente entrada", () => { const view = buildTransactionView(transferPair, "destination"); assert.equal(view.net, 75); assert.deepEqual(view.rows.map((item) => item.transaction_type), ["transfer_in"]); });
test("parser aceita formato monetário brasileiro", () => assert.deepEqual(parseBankrollMoney("1.234,56"), { ok: true, value: 1234.56 }));
test("parser rejeita entrada monetária inválida", () => assert.equal(parseBankrollMoney("1.2.3,xx").ok, false));
