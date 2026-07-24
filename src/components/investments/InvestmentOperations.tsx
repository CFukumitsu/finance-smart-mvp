"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  deleteInvestmentOperation,
  saveInvestmentOperation,
} from "@/src/services/investmentService";
import type {
  InvestmentData,
  InvestmentOperation,
  InvestmentOperationType,
} from "@/src/types/investments";
import { calculateOperationValue } from "@/src/utils/investmentCalculations";
import {
  formatInvestmentDate,
  formatInvestmentMoney,
  formatInvestmentQuantity,
  InvestmentActions,
  InvestmentAddButton,
  InvestmentEmpty,
  InvestmentInput,
  InvestmentModal,
  InvestmentTable,
  InvestmentTd,
  InvestmentToolbar,
  investmentCard,
  investmentField,
  parseInvestmentDecimal,
} from "./InvestmentUi";

const today = () => new Date().toISOString().slice(0, 10);

export default function InvestmentOperations({
  data,
  reload,
}: {
  data: InvestmentData;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvestmentOperation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: today(),
    accountId: "",
    assetId: "",
    type: "Compra" as InvestmentOperationType,
    quantity: "",
    unitPrice: "",
    fees: "0",
    notes: "",
  });
  const submissionLock = useRef(false);
  const assetsById = useMemo(
    () => new Map(data.assets.map((asset) => [asset.id, asset])),
    [data.assets],
  );
  const accountsById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account])),
    [data.accounts],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");

    return data.operations
      .filter((operation) => {
        const asset = assetsById.get(operation.asset_id);
        const account = accountsById.get(operation.account_id);

        return (
          (!assetFilter || operation.asset_id === assetFilter) &&
          (!accountFilter || operation.account_id === accountFilter) &&
          (!typeFilter || operation.operation_type === typeFilter) &&
          (!term ||
            [
              asset?.name,
              asset?.symbol,
              account?.name,
              operation.operation_type,
              operation.notes,
            ]
              .filter(Boolean)
              .join(" ")
              .toLocaleLowerCase("pt-BR")
              .includes(term))
        );
      })
      .sort((left, right) => {
        if (sort === "date-asc")
          return (
            left.operation_date.localeCompare(right.operation_date) ||
            left.created_at.localeCompare(right.created_at)
          );
        if (sort === "asset")
          return (
            (assetsById.get(left.asset_id)?.name ?? "").localeCompare(
              assetsById.get(right.asset_id)?.name ?? "",
              "pt-BR",
            ) || right.operation_date.localeCompare(left.operation_date)
          );
        if (sort === "account")
          return (
            (accountsById.get(left.account_id)?.name ?? "").localeCompare(
              accountsById.get(right.account_id)?.name ?? "",
              "pt-BR",
            ) || right.operation_date.localeCompare(left.operation_date)
          );
        return (
          right.operation_date.localeCompare(left.operation_date) ||
          right.created_at.localeCompare(left.created_at)
        );
      });
  }, [
    accountFilter,
    accountsById,
    assetFilter,
    assetsById,
    data.operations,
    search,
    sort,
    typeFilter,
  ]);

  const close = useCallback(() => {
    if (!submissionLock.current) setOpen(false);
  }, []);

  function eligibleAccounts(assetId: string, currentAccountId = "") {
    const currency = assetsById.get(assetId)?.currency;

    return data.accounts.filter(
      (account) =>
        account.id === currentAccountId ||
        (account.active &&
          account.show_on_investments_dashboard &&
          Boolean(account.currency) &&
          account.currency === currency),
    );
  }

  function show(operation?: InvestmentOperation) {
    const activeAssets = data.assets.filter(
      (asset) => asset.active || asset.id === operation?.asset_id,
    );
    const assetId = operation?.asset_id ?? activeAssets[0]?.id ?? "";
    const accounts = eligibleAccounts(assetId, operation?.account_id);

    setEditing(operation ?? null);
    setForm({
      date: operation?.operation_date ?? today(),
      accountId: operation?.account_id ?? accounts[0]?.id ?? "",
      assetId,
      type: operation?.operation_type ?? "Compra",
      quantity: operation
        ? formatInvestmentQuantity(Math.abs(operation.quantity))
        : "",
      unitPrice: operation?.unit_price
        ? formatInvestmentQuantity(operation.unit_price)
        : "",
      fees: operation
        ? formatInvestmentQuantity(operation.fees)
        : "0",
      notes: operation?.notes ?? "",
    });
    setOpen(true);
  }

  function changeAsset(assetId: string) {
    const accounts = eligibleAccounts(assetId);
    setForm({
      ...form,
      assetId,
      accountId: accounts.some((account) => account.id === form.accountId)
        ? form.accountId
        : (accounts[0]?.id ?? ""),
    });
  }

  async function submit() {
    if (submissionLock.current) return;

    const quantity = parseInvestmentDecimal(form.quantity);
    const unitPrice = parseInvestmentDecimal(form.unitPrice);
    const fees = parseInvestmentDecimal(form.fees || "0");

    if (!form.date) return alert("Informe a data da operação.");
    if (!form.assetId) return alert("Informe o ativo.");
    if (!form.accountId)
      return alert(
        "Selecione uma conta ativa, com moeda compatível e marcada para Investimentos.",
      );
    if (!Number.isFinite(quantity) || quantity <= 0)
      return alert("Informe uma quantidade maior que zero.");
    if (!Number.isFinite(unitPrice) || unitPrice <= 0)
      return alert("Informe um preço unitário maior que zero.");
    if (!Number.isFinite(fees) || fees < 0)
      return alert("As taxas não podem ser negativas.");

    try {
      submissionLock.current = true;
      setSaving(true);
      await saveInvestmentOperation(
        {
          asset_id: form.assetId,
          account_id: form.accountId,
          operation_type: form.type,
          operation_date: form.date,
          quantity,
          unit_price: unitPrice,
          fees,
          notes: form.notes.trim() || null,
        },
        editing?.id,
      );
      setOpen(false);
      await reload();
    } catch (value) {
      alert(
        value instanceof Error ? value.message : "Não foi possível salvar.",
      );
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  async function remove(operation: InvestmentOperation) {
    if (!confirm("Excluir esta operação? A posição será recalculada.")) return;

    try {
      await deleteInvestmentOperation(operation.id);
      await reload();
    } catch (value) {
      alert(
        value instanceof Error ? value.message : "Não foi possível excluir.",
      );
    }
  }

  const selectedAsset = assetsById.get(form.assetId);
  const formAccounts = eligibleAccounts(form.assetId, editing?.account_id);
  const previewQuantity = parseInvestmentDecimal(form.quantity);
  const previewPrice = parseInvestmentDecimal(form.unitPrice);
  const operationValue =
    Number.isFinite(previewQuantity) && Number.isFinite(previewPrice)
      ? Math.abs(previewQuantity) * previewPrice
      : 0;
  const previewCurrency = selectedAsset?.currency ?? "BRL";
  const purchaseCount = rows.filter(
    (operation) => operation.operation_type === "Compra",
  ).length;
  const saleCount = rows.filter(
    (operation) => operation.operation_type === "Venda",
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={investmentCard}>
          <p className="text-xs font-bold uppercase text-slate-500">
            Operações exibidas
          </p>
          <p className="mt-1 text-xl font-black text-white">{rows.length}</p>
        </div>
        <div className={investmentCard}>
          <p className="text-xs font-bold uppercase text-slate-500">
            Compras exibidas
          </p>
          <p className="mt-1 text-xl font-black text-emerald-300">
            {purchaseCount}
          </p>
        </div>
        <div className={investmentCard}>
          <p className="text-xs font-bold uppercase text-slate-500">
            Vendas exibidas
          </p>
          <p className="mt-1 text-xl font-black text-amber-300">
            {saleCount}
          </p>
        </div>
      </div>

      <InvestmentToolbar search={search} setSearch={setSearch}>
        <select
          aria-label="Ativo"
          className={investmentField}
          value={assetFilter}
          onChange={(event) => setAssetFilter(event.target.value)}
        >
          <option value="">Todos os ativos</option>
          {data.assets.map((asset) => (
            <option value={asset.id} key={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Conta"
          className={investmentField}
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
        >
          <option value="">Todas as contas</option>
          {data.accounts.map((account) => (
            <option value={account.id} key={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Operação"
          className={investmentField}
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="">Compras e vendas</option>
          <option value="Compra">Compras</option>
          <option value="Venda">Vendas</option>
        </select>
        <select
          aria-label="Ordenação"
          className={investmentField}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="date-desc">Mais recentes</option>
          <option value="date-asc">Mais antigas</option>
          <option value="asset">Ativo</option>
          <option value="account">Conta</option>
        </select>
        <InvestmentAddButton onClick={() => show()}>
          Nova operação
        </InvestmentAddButton>
      </InvestmentToolbar>

      {rows.length ? (
        <InvestmentTable
          headers={[
            "Data",
            "Ativo",
            "Conta",
            "Operação",
            "Quantidade",
            "Preço unitário",
            "Valor",
            "Taxas",
            "Ações",
          ]}
          minWidth="1120px"
        >
          {rows.map((operation) => {
            const asset = assetsById.get(operation.asset_id);
            const account = accountsById.get(operation.account_id);
            const currency = asset?.currency ?? "BRL";

            return (
              <tr key={operation.id} className="border-t border-white/10">
                <InvestmentTd>
                  {formatInvestmentDate(operation.operation_date)}
                </InvestmentTd>
                <InvestmentTd strong>
                  {asset?.symbol || asset?.name || "Ativo indisponível"}
                </InvestmentTd>
                <InvestmentTd>
                  {account?.name ?? "Conta indisponível"}
                </InvestmentTd>
                <InvestmentTd>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      operation.operation_type === "Compra"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {operation.operation_type}
                  </span>
                </InvestmentTd>
                <InvestmentTd>
                  {formatInvestmentQuantity(Math.abs(operation.quantity))}
                </InvestmentTd>
                <InvestmentTd>
                  {formatInvestmentMoney(operation.unit_price ?? 0, currency)}
                </InvestmentTd>
                <InvestmentTd>
                  {formatInvestmentMoney(
                    calculateOperationValue(operation),
                    currency,
                  )}
                </InvestmentTd>
                <InvestmentTd>
                  {formatInvestmentMoney(operation.fees, currency)}
                </InvestmentTd>
                <InvestmentTd>
                  <InvestmentActions
                    onEdit={() => show(operation)}
                    onDelete={() => void remove(operation)}
                  />
                </InvestmentTd>
              </tr>
            );
          })}
        </InvestmentTable>
      ) : (
        <InvestmentEmpty
          title={
            data.operations.length
              ? "Nenhuma operação encontrada"
              : "Nenhuma operação registrada"
          }
          text={
            data.assets.length
              ? "Registre a primeira compra ou ajuste os filtros."
              : "Cadastre um ativo antes de registrar compras e vendas."
          }
          href={data.assets.length ? undefined : "/investments/assets"}
          actionLabel="Cadastrar ativo"
        />
      )}

      {open && (
        <InvestmentModal
          title={editing ? "Editar operação" : "Nova operação"}
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
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </InvestmentInput>
            <InvestmentInput label="Operação">
              <select
                className={investmentField}
                value={form.type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as InvestmentOperationType,
                  })
                }
              >
                <option value="Compra">Compra</option>
                <option value="Venda">Venda</option>
              </select>
            </InvestmentInput>
          </div>

          <InvestmentInput label="Ativo">
            <select
              className={investmentField}
              value={form.assetId}
              onChange={(event) => changeAsset(event.target.value)}
            >
              <option value="">Selecione</option>
              {data.assets
                .filter(
                  (asset) => asset.active || asset.id === editing?.asset_id,
                )
                .map((asset) => (
                  <option value={asset.id} key={asset.id}>
                    {asset.name}
                    {asset.symbol ? ` (${asset.symbol})` : ""} ·{" "}
                    {asset.currency}
                  </option>
                ))}
            </select>
          </InvestmentInput>

          <InvestmentInput
            label="Conta"
            hint={
              form.assetId && !formAccounts.length
                ? "Nenhuma conta ativa com a mesma moeda está marcada para Investimentos."
                : "Somente contas ativas marcadas para o módulo e com a mesma moeda do ativo."
            }
          >
            <select
              className={investmentField}
              value={form.accountId}
              onChange={(event) =>
                setForm({ ...form, accountId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {formAccounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.name} · {account.currency ?? "Sem moeda"}
                  {!account.active ? " · Inativa" : ""}
                </option>
              ))}
            </select>
          </InvestmentInput>

          <div className="grid gap-4 sm:grid-cols-3">
            <InvestmentInput label="Quantidade">
              <input
                inputMode="decimal"
                className={investmentField}
                value={form.quantity}
                onChange={(event) =>
                  setForm({
                    ...form,
                    quantity: event.target.value.replace(/[^0-9.,]/g, ""),
                  })
                }
                placeholder="0"
              />
            </InvestmentInput>
            <InvestmentInput label="Preço unitário">
              <input
                inputMode="decimal"
                className={investmentField}
                value={form.unitPrice}
                onChange={(event) =>
                  setForm({
                    ...form,
                    unitPrice: event.target.value.replace(/[^0-9.,]/g, ""),
                  })
                }
                placeholder="0,00"
              />
            </InvestmentInput>
            <InvestmentInput label="Taxas">
              <input
                inputMode="decimal"
                className={investmentField}
                value={form.fees}
                onChange={(event) =>
                  setForm({
                    ...form,
                    fees: event.target.value.replace(/[^0-9.,]/g, ""),
                  })
                }
                placeholder="0,00"
              />
            </InvestmentInput>
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-300">
              Valor da operação
            </p>
            <p className="mt-1 text-2xl font-black text-white">
              {formatInvestmentMoney(operationValue, previewCurrency)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Quantidade × preço unitário. As taxas são exibidas separadamente
              e não são armazenadas nesse total.
            </p>
          </div>

          <InvestmentInput label="Observações" hint="Opcional">
            <textarea
              rows={3}
              className={investmentField}
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          </InvestmentInput>
        </InvestmentModal>
      )}
    </div>
  );
}
