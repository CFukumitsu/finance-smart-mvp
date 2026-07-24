"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  deleteInvestmentAsset,
  saveInvestmentAsset,
} from "@/src/services/investmentService";
import type {
  InvestmentAsset,
  InvestmentData,
} from "@/src/types/investments";
import {
  InvestmentActions,
  InvestmentAddButton,
  InvestmentEmpty,
  InvestmentInput,
  InvestmentModal,
  InvestmentStatus,
  InvestmentTable,
  InvestmentTd,
  InvestmentToolbar,
  investmentField,
} from "./InvestmentUi";

const emptyForm = {
  name: "",
  symbol: "",
  assetType: "",
  currency: "BRL",
  active: true,
};

export default function InvestmentAssets({
  data,
  reload,
}: {
  data: InvestmentData;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [sort, setSort] = useState("name-asc");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvestmentAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const submissionLock = useRef(false);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");

    return data.assets
      .filter((asset) => {
        const matchesStatus =
          status === "all" ||
          (status === "active" && asset.active) ||
          (status === "inactive" && !asset.active);
        const matchesSearch =
          !term ||
          [asset.name, asset.symbol, asset.asset_type, asset.currency]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(term);

        return matchesStatus && matchesSearch;
      })
      .sort((left, right) => {
        if (sort === "name-desc")
          return right.name.localeCompare(left.name, "pt-BR");
        if (sort === "type")
          return (
            left.asset_type.localeCompare(right.asset_type, "pt-BR") ||
            left.name.localeCompare(right.name, "pt-BR")
          );
        if (sort === "currency")
          return (
            left.currency.localeCompare(right.currency) ||
            left.name.localeCompare(right.name, "pt-BR")
          );
        return left.name.localeCompare(right.name, "pt-BR");
      });
  }, [data.assets, search, sort, status]);

  const close = useCallback(() => {
    if (!submissionLock.current) setOpen(false);
  }, []);

  function show(asset?: InvestmentAsset) {
    setEditing(asset ?? null);
    setForm(
      asset
        ? {
            name: asset.name,
            symbol: asset.symbol ?? "",
            assetType: asset.asset_type,
            currency: asset.currency,
            active: asset.active,
          }
        : emptyForm,
    );
    setOpen(true);
  }

  async function submit() {
    if (submissionLock.current) return;

    const name = form.name.trim();
    const assetType = form.assetType.trim();
    const currency = form.currency.trim().toUpperCase();

    if (!name) return alert("Informe o nome do ativo.");
    if (!assetType) return alert("Informe o tipo do ativo.");
    if (!/^[A-Z]{3}$/.test(currency))
      return alert("Informe uma moeda com três letras, como BRL ou USD.");

    try {
      submissionLock.current = true;
      setSaving(true);
      await saveInvestmentAsset(
        {
          name,
          symbol: form.symbol.trim() || null,
          asset_type: assetType,
          currency,
          active: form.active,
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

  async function remove(asset: InvestmentAsset) {
    if (!confirm(`Excluir o ativo "${asset.name}"?`)) return;

    try {
      await deleteInvestmentAsset(asset.id);
      await reload();
    } catch (value) {
      alert(
        value instanceof Error ? value.message : "Não foi possível excluir.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <InvestmentToolbar search={search} setSearch={setSearch}>
        <select
          aria-label="Status"
          className={investmentField}
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as "active" | "inactive" | "all")
          }
        >
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>
        <select
          aria-label="Ordenação"
          className={investmentField}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="name-asc">Nome: A–Z</option>
          <option value="name-desc">Nome: Z–A</option>
          <option value="type">Tipo</option>
          <option value="currency">Moeda</option>
        </select>
        <InvestmentAddButton onClick={() => show()}>
          Novo ativo
        </InvestmentAddButton>
      </InvestmentToolbar>

      {rows.length ? (
        <InvestmentTable
          headers={["Nome", "Código", "Tipo", "Moeda", "Status", "Ações"]}
          minWidth="760px"
        >
          {rows.map((asset) => (
            <tr key={asset.id} className="border-t border-white/10">
              <InvestmentTd strong>{asset.name}</InvestmentTd>
              <InvestmentTd>{asset.symbol ?? "—"}</InvestmentTd>
              <InvestmentTd>{asset.asset_type}</InvestmentTd>
              <InvestmentTd>{asset.currency}</InvestmentTd>
              <InvestmentTd>
                <InvestmentStatus active={asset.active} />
              </InvestmentTd>
              <InvestmentTd>
                <InvestmentActions
                  onEdit={() => show(asset)}
                  onDelete={() => void remove(asset)}
                />
              </InvestmentTd>
            </tr>
          ))}
        </InvestmentTable>
      ) : (
        <InvestmentEmpty
          title={
            data.assets.length
              ? "Nenhum ativo encontrado"
              : "Nenhum ativo cadastrado"
          }
          text={
            data.assets.length
              ? "Ajuste a pesquisa ou os filtros."
              : "Cadastre o primeiro ativo para começar a registrar operações."
          }
        />
      )}

      {open && (
        <InvestmentModal
          title={editing ? "Editar ativo" : "Novo ativo"}
          close={close}
          saving={saving}
          submit={submit}
        >
          <InvestmentInput label="Nome">
            <input
              autoFocus
              className={investmentField}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="Ex.: Petrobras PN"
            />
          </InvestmentInput>

          <div className="grid gap-4 sm:grid-cols-2">
            <InvestmentInput label="Código" hint="Opcional">
              <input
                className={investmentField}
                value={form.symbol}
                onChange={(event) =>
                  setForm({
                    ...form,
                    symbol: event.target.value.toUpperCase(),
                  })
                }
                placeholder="Ex.: PETR4"
              />
            </InvestmentInput>

            <InvestmentInput label="Moeda">
              <input
                className={investmentField}
                value={form.currency}
                maxLength={3}
                list="investment-currencies"
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value.toUpperCase(),
                  })
                }
                placeholder="BRL"
              />
              <datalist id="investment-currencies">
                <option value="BRL" />
                <option value="USD" />
                <option value="EUR" />
              </datalist>
            </InvestmentInput>
          </div>

          <InvestmentInput
            label="Tipo"
            hint="Campo configurável; as sugestões não limitam novos tipos."
          >
            <input
              className={investmentField}
              value={form.assetType}
              list="investment-asset-types"
              onChange={(event) =>
                setForm({ ...form, assetType: event.target.value })
              }
              placeholder="Ex.: Ação"
            />
            <datalist id="investment-asset-types">
              <option value="Ação" />
              <option value="ETF" />
              <option value="Fundo Imobiliário" />
              <option value="Renda Fixa" />
              <option value="Criptomoeda" />
              <option value="Fundo" />
              <option value="Previdência" />
            </datalist>
          </InvestmentInput>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900 p-4">
            <div>
              <p className="font-semibold text-white">Ativo disponível</p>
              <p className="mt-1 text-xs text-slate-400">
                Ativos inativos permanecem no histórico e não aparecem em novas
                operações.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
            />
          </label>
        </InvestmentModal>
      )}
    </div>
  );
}
