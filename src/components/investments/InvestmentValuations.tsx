"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { deleteInvestmentValuation, saveInvestmentValuation } from "@/src/services/investmentService";
import type { InvestmentData, InvestmentMonthlyValuation } from "@/src/types/investments";
import { calculateInvestmentAssetSnapshot, calculateValuationResult, validateInvestmentValuation } from "@/src/utils/investmentCalculations";
import { formatInvestmentMoneyInput } from "@/src/utils/investmentFormatting";
import {
  formatInvestmentMoney,
  formatInvestmentMonth,
  formatInvestmentQuantity,
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

type ValuationForm = {
  month: string;
  assetId: string;
  unitValue: string;
  totalValue: string;
  source: "unit" | "total";
  notes: string;
};

export default function InvestmentValuations({ data, reload }: { data: InvestmentData; reload: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("month-desc");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvestmentMonthlyValuation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ValuationForm>({
    month: currentMonth(), assetId: "", unitValue: "", totalValue: "", source: "unit", notes: "",
  });
  const submissionLock = useRef(false);
  const assetsById = useMemo(() => new Map(data.assets.map((asset) => [asset.id, asset])), [data.assets]);
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return [...data.valuations]
      .filter((valuation) => {
        const asset = assetsById.get(valuation.asset_id);
        return !term || [asset?.name, asset?.symbol, valuation.notes].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term);
      })
      .sort((left, right) => {
        if (sort === "month-asc") return left.reference_month.localeCompare(right.reference_month);
        if (sort === "asset") return (assetsById.get(left.asset_id)?.name ?? "").localeCompare(assetsById.get(right.asset_id)?.name ?? "", "pt-BR") || right.reference_month.localeCompare(left.reference_month);
        return right.reference_month.localeCompare(left.reference_month);
      });
  }, [assetsById, data.valuations, search, sort]);

  const calculatedSnapshot = useMemo(() => calculateInvestmentAssetSnapshot({
    operations: data.operations, assetId: form.assetId, referenceMonth: form.month,
  }), [data.operations, form.assetId, form.month]);
  const snapshot = {
    quantity: editing?.quantity_snapshot ?? calculatedSnapshot.quantity,
    averagePrice: editing?.average_price_snapshot ?? calculatedSnapshot.averagePrice,
  };
  const result = calculateValuationResult({
    quantity: snapshot.quantity,
    averagePrice: snapshot.averagePrice,
    currentUnitValue: parseInvestmentDecimal(form.unitValue),
    currentValue: parseInvestmentDecimal(form.totalValue),
    source: form.source,
  });
  const selectedAsset = assetsById.get(form.assetId);
  const resultTone = result.result > 0 ? "text-emerald-300" : result.result < 0 ? "text-red-300" : "text-slate-300";
  const close = useCallback(() => { if (!submissionLock.current) setOpen(false); }, []);

  function show(valuation?: InvestmentMonthlyValuation) {
    const activeAssets = data.assets.filter((asset) => asset.active || asset.id === valuation?.asset_id);
    const month = valuation?.reference_month.slice(0, 7) ?? currentMonth();
    const assetId = valuation?.asset_id ?? activeAssets[0]?.id ?? "";
    const historical = calculateInvestmentAssetSnapshot({ operations: data.operations, assetId, referenceMonth: month });
    const quantity = valuation?.quantity_snapshot ?? historical.quantity;
    const totalValue = valuation ? valuation.total_market_value ?? valuation.market_value * quantity : Number.NaN;
    setEditing(valuation ?? null);
    setForm({
      month,
      assetId,
      unitValue: valuation ? formatInvestmentMoneyInput(valuation.market_value) : "",
      totalValue: valuation ? formatInvestmentMoneyInput(totalValue) : "",
      source: valuation?.total_market_value !== null && valuation?.total_market_value !== undefined ? "total" : "unit",
      notes: valuation?.notes ?? "",
    });
    setOpen(true);
  }

  function updateValue(source: "unit" | "total", rawValue: string) {
    const cleaned = rawValue.replace(/[^0-9.,]/g, "");
    const numeric = parseInvestmentDecimal(cleaned);
    const next: ValuationForm = { ...form, source, [source === "unit" ? "unitValue" : "totalValue"]: cleaned };
    if (Number.isFinite(numeric) && numeric >= 0 && snapshot.quantity > 0) {
      const synchronized = calculateValuationResult({
        quantity: snapshot.quantity, averagePrice: snapshot.averagePrice,
        currentUnitValue: source === "unit" ? numeric : 0,
        currentValue: source === "total" ? numeric : 0,
        source,
      });
      if (source === "unit") next.totalValue = formatInvestmentMoneyInput(synchronized.currentValue);
      else next.unitValue = formatInvestmentMoneyInput(synchronized.currentUnitValue);
    }
    setForm(next);
  }

  async function submit() {
    if (submissionLock.current) return;
    const unitValue = parseInvestmentDecimal(form.unitValue);
    const totalValue = parseInvestmentDecimal(form.totalValue);
    const validationError = validateInvestmentValuation({ assetId: form.assetId, referenceMonth: form.month, quantity: snapshot.quantity, currentUnitValue: unitValue, currentValue: totalValue });
    if (validationError) return alert(validationError);
    if (!Number.isFinite(result.currentUnitValue) || !Number.isFinite(result.currentValue)) return alert("Não foi possível calcular uma valorização válida.");
    if (!editing && data.valuations.some((valuation) => valuation.asset_id === form.assetId && valuation.reference_month.slice(0, 7) === form.month)) return alert("Já existe uma valorização desse ativo para o mês.");

    try {
      submissionLock.current = true;
      setSaving(true);
      await saveInvestmentValuation({
        asset_id: form.assetId,
        reference_month: form.month,
        market_value: result.currentUnitValue,
        total_market_value: result.currentValue,
        quantity_snapshot: snapshot.quantity,
        average_price_snapshot: snapshot.averagePrice,
        notes: form.notes.trim() || null,
      }, editing?.id);
      setOpen(false);
      await reload();
    } catch (value) {
      alert(value instanceof Error ? value.message : "Não foi possível salvar.");
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  async function remove(valuation: InvestmentMonthlyValuation) {
    const asset = assetsById.get(valuation.asset_id);
    if (!confirm(`Excluir a valorização de ${asset?.name ?? "este ativo"} em ${formatInvestmentMonth(valuation.reference_month)}?`)) return;
    try { await deleteInvestmentValuation(valuation.id); await reload(); }
    catch (value) { alert(value instanceof Error ? value.message : "Não foi possível excluir."); }
  }

  return <section className="space-y-4">
    <div>
      <h2 className="text-xl font-black text-white">Valorizações mensais</h2>
      <p className="mt-1 text-sm text-slate-400">Informe a cotação por unidade ou o valor total da posição. A última competência disponível alimenta o patrimônio atual.</p>
    </div>
    <InvestmentToolbar search={search} setSearch={setSearch}>
      <select aria-label="Ordenação das valorizações" className={investmentField} value={sort} onChange={(event) => setSort(event.target.value)}>
        <option value="month-desc">Mês mais recente</option><option value="month-asc">Mês mais antigo</option><option value="asset">Ativo</option>
      </select>
      <InvestmentAddButton onClick={() => show()}>Nova valorização</InvestmentAddButton>
    </InvestmentToolbar>

    {rows.length ? <InvestmentTable headers={["Mês", "Ativo", "Preço por unidade", "Valor da posição", "Observações", "Ações"]} minWidth="900px">
      {rows.map((valuation) => {
        const asset = assetsById.get(valuation.asset_id);
        return <tr key={valuation.id} className="border-t border-white/10">
          <InvestmentTd>{formatInvestmentMonth(valuation.reference_month)}</InvestmentTd>
          <InvestmentTd strong>{asset?.symbol || asset?.name || "Ativo indisponível"}</InvestmentTd>
          <InvestmentTd>{formatInvestmentMoney(valuation.market_value, asset?.currency ?? "BRL")}</InvestmentTd>
          <InvestmentTd>{valuation.total_market_value === null ? "—" : formatInvestmentMoney(valuation.total_market_value, asset?.currency ?? "BRL")}</InvestmentTd>
          <InvestmentTd>{valuation.notes || "—"}</InvestmentTd>
          <InvestmentTd><InvestmentActions onEdit={() => show(valuation)} onDelete={() => void remove(valuation)} /></InvestmentTd>
        </tr>;
      })}
    </InvestmentTable> : <InvestmentEmpty title="Nenhuma valorização encontrada" text={data.assets.length ? "Registre o primeiro valor mensal de mercado." : "Cadastre um ativo antes de informar valorizações."} href={data.assets.length ? undefined : "/investments/assets"} actionLabel="Cadastrar ativo" />}

    {open && <InvestmentModal title={editing ? "Editar valorização" : "Nova valorização"} close={close} saving={saving} submit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InvestmentInput label="Mês"><input autoFocus type="month" className={investmentField} value={form.month} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, month: event.target.value, unitValue: "", totalValue: "" })} /></InvestmentInput>
        <InvestmentInput label="Ativo"><select className={investmentField} value={form.assetId} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, assetId: event.target.value, unitValue: "", totalValue: "" })}>
          <option value="">Selecione</option>{data.assets.filter((asset) => asset.active || asset.id === editing?.asset_id).map((asset) => <option value={asset.id} key={asset.id}>{asset.name}{asset.symbol ? ` (${asset.symbol})` : ""}</option>)}
        </select></InvestmentInput>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <InvestmentInput label="Quantidade atual" hint="Calculada pelas compras e vendas até o mês selecionado."><input className={investmentField} readOnly value={`${formatInvestmentQuantity(snapshot.quantity)}${selectedAsset ? ` ${investmentAssetUnit(selectedAsset.asset_type, snapshot.quantity)}` : ""}`} /></InvestmentInput>
        <InvestmentInput label="Preço médio" hint="Não é alterado pela valorização."><input className={investmentField} readOnly value={formatInvestmentMoney(snapshot.averagePrice, selectedAsset?.currency ?? "BRL")} /></InvestmentInput>
      </div>
      {snapshot.quantity <= 0 && form.assetId && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">Este ativo não possui quantidade disponível no período selecionado. Registre primeiro uma operação de compra.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <InvestmentInput label="Preço atual por unidade" hint={`Cotação${selectedAsset ? ` em ${selectedAsset.currency}` : ""}.`}><input inputMode="decimal" className={investmentField} value={form.unitValue} onChange={(event) => updateValue("unit", event.target.value)} onBlur={() => formatField("unit")} placeholder="0,00" /></InvestmentInput>
        <InvestmentInput label="Valor atual da posição" hint="Valor total de mercado."><input inputMode="decimal" className={investmentField} value={form.totalValue} onChange={(event) => updateValue("total", event.target.value)} onBlur={() => formatField("total")} placeholder="0,00" /></InvestmentInput>
      </div>
      <section aria-label="Resumo da valorização" className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <h3 className="font-black text-white">Resumo</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <ResultItem label="Valor investido" value={formatInvestmentMoney(result.investedValue, selectedAsset?.currency ?? "BRL")} />
          <ResultItem label="Valor atual" value={formatInvestmentMoney(result.currentValue, selectedAsset?.currency ?? "BRL")} />
          <ResultItem label="Lucro/Prejuízo" value={formatSignedMoney(result.result, selectedAsset?.currency ?? "BRL")} className={resultTone} />
          <ResultItem label="Rentabilidade" value={formatSignedPercent(result.profitability)} className={resultTone} />
        </dl>
      </section>
      <InvestmentInput label="Observações" hint="Opcional"><textarea rows={3} className={investmentField} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></InvestmentInput>
    </InvestmentModal>}
  </section>;

  function formatField(source: "unit" | "total") {
    const key = source === "unit" ? "unitValue" : "totalValue";
    const value = parseInvestmentDecimal(form[key]);
    if (Number.isFinite(value)) setForm({ ...form, [key]: formatInvestmentMoneyInput(value) });
  }
}

function investmentAssetUnit(assetType: string, quantity: number) {
  const normalized = assetType.toLocaleLowerCase("pt-BR");
  if (normalized.includes("ação")) return quantity === 1 ? "ação" : "ações";
  if (["fii", "fundo", "etf"].some((type) => normalized.includes(type))) return quantity === 1 ? "cota" : "cotas";
  return "unidades";
}

function formatSignedMoney(value: number, currency: string) {
  const formatted = formatInvestmentMoney(Math.abs(value), currency);
  return value > 0 ? `+ ${formatted}` : value < 0 ? `- ${formatted}` : formatted;
}

function formatSignedPercent(value: number | null) {
  if (value === null) return "—";
  const formatted = `${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  return value > 0 ? `+ ${formatted}` : value < 0 ? `- ${formatted}` : formatted;
}

function ResultItem({ label, value, className = "text-white" }: { label: string; value: string; className?: string }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 break-words font-bold ${className}`}>{value}</dd></div>;
}
