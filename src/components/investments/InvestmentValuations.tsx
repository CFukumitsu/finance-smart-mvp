"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  deleteInvestmentValuation,
  saveInvestmentValuation,
} from "@/src/services/investmentService";
import type {
  InvestmentData,
  InvestmentMonthlyValuation,
} from "@/src/types/investments";
import {
  formatInvestmentMoney,
  formatInvestmentMonth,
  InvestmentActions,
  InvestmentAddButton,
  InvestmentEmpty,
  InvestmentInput,
  InvestmentModal,
  InvestmentTable,
  InvestmentTd,
  InvestmentToolbar,
  investmentField,
  parseInvestmentDecimal,
} from "./InvestmentUi";

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function InvestmentValuations({
  data,
  reload,
}: {
  data: InvestmentData;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("month-desc");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] =
    useState<InvestmentMonthlyValuation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    month: currentMonth(),
    assetId: "",
    marketValue: "",
    notes: "",
  });
  const submissionLock = useRef(false);
  const assetsById = useMemo(
    () => new Map(data.assets.map((asset) => [asset.id, asset])),
    [data.assets],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");

    return data.valuations
      .filter((valuation) => {
        const asset = assetsById.get(valuation.asset_id);
        return (
          !term ||
          [asset?.name, asset?.symbol, valuation.notes]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(term)
        );
      })
      .sort((left, right) => {
        if (sort === "month-asc")
          return left.reference_month.localeCompare(right.reference_month);
        if (sort === "asset")
          return (
            Number(
              !(assetsById.get(left.asset_id)?.active ?? false),
            ) -
              Number(
                !(assetsById.get(right.asset_id)?.active ?? false),
              ) ||
            (assetsById.get(left.asset_id)?.name ?? "").localeCompare(
              assetsById.get(right.asset_id)?.name ?? "",
              "pt-BR",
            ) ||
            right.reference_month.localeCompare(left.reference_month)
          );
        return right.reference_month.localeCompare(left.reference_month);
      });
  }, [assetsById, data.valuations, search, sort]);

  const close = useCallback(() => {
    if (!submissionLock.current) setOpen(false);
  }, []);

  function show(valuation?: InvestmentMonthlyValuation) {
    const activeAssets = data.assets.filter(
      (asset) => asset.active || asset.id === valuation?.asset_id,
    );
    setEditing(valuation ?? null);
    setForm({
      month: valuation?.reference_month.slice(0, 7) ?? currentMonth(),
      assetId: valuation?.asset_id ?? activeAssets[0]?.id ?? "",
      marketValue: valuation
        ? String(valuation.market_value).replace(".", ",")
        : "",
      notes: valuation?.notes ?? "",
    });
    setOpen(true);
  }

  async function submit() {
    if (submissionLock.current) return;
    const marketValue = parseInvestmentDecimal(form.marketValue);

    if (!form.month) return alert("Informe o mês de referência.");
    if (!form.assetId) return alert("Informe o ativo.");
    if (!Number.isFinite(marketValue) || marketValue < 0)
      return alert("Informe um valor de mercado válido.");

    try {
      submissionLock.current = true;
      setSaving(true);
      await saveInvestmentValuation(
        {
          asset_id: form.assetId,
          reference_month: form.month,
          market_value: marketValue,
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

  async function remove(valuation: InvestmentMonthlyValuation) {
    const asset = assetsById.get(valuation.asset_id);
    if (
      !confirm(
        `Excluir a valorização de ${asset?.name ?? "este ativo"} em ${formatInvestmentMonth(valuation.reference_month)}?`,
      )
    ) {
      return;
    }

    try {
      await deleteInvestmentValuation(valuation.id);
      await reload();
    } catch (value) {
      alert(
        value instanceof Error ? value.message : "Não foi possível excluir.",
      );
    }
  }

  const selectedAsset = assetsById.get(form.assetId);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">
          Valorizações mensais
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Informe o valor de mercado por unidade. A última competência
          disponível alimenta o patrimônio atual.
        </p>
      </div>

      <InvestmentToolbar search={search} setSearch={setSearch}>
        <select
          aria-label="Ordenação das valorizações"
          className={investmentField}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="month-desc">Mês mais recente</option>
          <option value="month-asc">Mês mais antigo</option>
          <option value="asset">Ativo</option>
        </select>
        <InvestmentAddButton onClick={() => show()}>
          Nova valorização
        </InvestmentAddButton>
      </InvestmentToolbar>

      {rows.length ? (
        <InvestmentTable
          headers={["Mês", "Ativo", "Valor por unidade", "Observações", "Ações"]}
          minWidth="760px"
        >
          {rows.map((valuation) => {
            const asset = assetsById.get(valuation.asset_id);

            return (
              <tr key={valuation.id} className="border-t border-white/10">
                <InvestmentTd>
                  {formatInvestmentMonth(valuation.reference_month)}
                </InvestmentTd>
                <InvestmentTd strong>
                  {asset?.symbol || asset?.name || "Ativo indisponível"}
                </InvestmentTd>
                <InvestmentTd>
                  {formatInvestmentMoney(
                    valuation.market_value,
                    asset?.currency ?? "BRL",
                  )}
                </InvestmentTd>
                <InvestmentTd>{valuation.notes || "—"}</InvestmentTd>
                <InvestmentTd>
                  <InvestmentActions
                    onEdit={() => show(valuation)}
                    onDelete={() => void remove(valuation)}
                  />
                </InvestmentTd>
              </tr>
            );
          })}
        </InvestmentTable>
      ) : (
        <InvestmentEmpty
          title="Nenhuma valorização encontrada"
          text={
            data.assets.length
              ? "Registre o primeiro valor mensal de mercado."
              : "Cadastre um ativo antes de informar valorizações."
          }
          href={data.assets.length ? undefined : "/investments/assets"}
          actionLabel="Cadastrar ativo"
        />
      )}

      {open && (
        <InvestmentModal
          title={editing ? "Editar valorização" : "Nova valorização"}
          close={close}
          saving={saving}
          submit={submit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <InvestmentInput label="Mês">
              <input
                autoFocus
                type="month"
                className={investmentField}
                value={form.month}
                onChange={(event) =>
                  setForm({ ...form, month: event.target.value })
                }
              />
            </InvestmentInput>
            <InvestmentInput label="Ativo">
              <select
                className={investmentField}
                value={form.assetId}
                onChange={(event) =>
                  setForm({ ...form, assetId: event.target.value })
                }
              >
                <option value="">Selecione</option>
                {data.assets
                  .filter(
                    (asset) => asset.active || asset.id === editing?.asset_id,
                  )
                  .map((asset) => (
                    <option value={asset.id} key={asset.id}>
                      {asset.name}
                      {asset.symbol ? ` (${asset.symbol})` : ""}
                    </option>
                  ))}
              </select>
            </InvestmentInput>
          </div>

          <InvestmentInput
            label="Valor de mercado"
            hint={`Preço por unidade${selectedAsset ? ` em ${selectedAsset.currency}` : ""}.`}
          >
            <input
              inputMode="decimal"
              className={investmentField}
              value={form.marketValue}
              onChange={(event) =>
                setForm({
                  ...form,
                  marketValue: event.target.value.replace(/[^0-9.,]/g, ""),
                })
              }
              placeholder="0,00"
            />
          </InvestmentInput>

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
    </section>
  );
}
