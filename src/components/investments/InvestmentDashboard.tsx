"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InvestmentData, InvestmentExchangeContext, InvestmentPosition } from "@/src/types/investments";
import {
  calculateInvestmentPositions,
  summarizeInvestmentPositions,
} from "@/src/utils/investmentCalculations";
import { convertInvestmentValue, resolveExchangeRate } from "@/src/utils/exchangeRateCalculations";
import {
  formatInvestmentMoney,
  formatInvestmentMonth,
  formatInvestmentQuantity,
  InvestmentEmpty,
  InvestmentTable,
  InvestmentTd,
  InvestmentToolbar,
  investmentCard,
  investmentField,
} from "./InvestmentUi";
import InvestmentValuations from "./InvestmentValuations";
import InvestmentExchangeSettings from "./InvestmentExchangeSettings";

export default function InvestmentDashboard({
  data,
  exchangeContext,
  reload,
}: {
  data: InvestmentData;
  exchangeContext: InvestmentExchangeContext;
  reload: () => Promise<void>;
}) {
  const positions = useMemo(
    () =>
      calculateInvestmentPositions({
        assets: data.assets,
        accounts: data.accounts,
        operations: data.operations,
        valuations: data.valuations,
      }),
    [data],
  );
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [sort, setSort] = useState("asset");
  const selectedCurrency = exchangeContext.consolidationCurrency;
  const summary = summarizeInvestmentPositions(positions, selectedCurrency, exchangeContext.rates);
  const convertedCurrentValue = (position: InvestmentPosition) =>
    convertInvestmentValue(
      position.currentValue,
      resolveExchangeRate(position.currency, selectedCurrency, exchangeContext.rates),
    );
  const convertedResultValue = (position: InvestmentPosition) =>
    convertInvestmentValue(
      position.unrealizedResult,
      resolveExchangeRate(position.currency, selectedCurrency, exchangeContext.rates),
    );
  const accountsById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account])),
    [data.accounts],
  );
  const assetsById = useMemo(
    () => new Map(data.assets.map((asset) => [asset.id, asset])),
    [data.assets],
  );
  const scopedAccounts = data.accounts.filter((account) =>
    positions.some((position) => position.accountId === account.id),
  );
  const rows = positions
    .filter((position) => {
      const term = search.trim().toLocaleLowerCase("pt-BR");
      return (
        (!accountFilter || position.accountId === accountFilter) &&
        (!term ||
          [
            position.assetName,
            position.assetSymbol,
            position.accountName,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(term))
      );
    })
    .sort((left, right) => {
      if (sort === "account")
        return (
          left.accountName.localeCompare(right.accountName, "pt-BR") ||
          left.assetName.localeCompare(right.assetName, "pt-BR")
        );
      if (sort === "value-desc")
        return (
          (convertedCurrentValue(right) ?? -1) - (convertedCurrentValue(left) ?? -1) ||
          left.assetName.localeCompare(right.assetName, "pt-BR")
        );
      if (sort === "result-desc")
        return (
          (convertedResultValue(right) ?? Number.NEGATIVE_INFINITY) -
            (convertedResultValue(left) ?? Number.NEGATIVE_INFINITY) ||
          left.assetName.localeCompare(right.assetName, "pt-BR")
        );
      return (
        Number(!(assetsById.get(left.assetId)?.active ?? false)) -
          Number(!(assetsById.get(right.assetId)?.active ?? false)) ||
        left.assetName.localeCompare(right.assetName, "pt-BR") ||
        left.accountName.localeCompare(right.accountName, "pt-BR")
      );
    });

  if (!data.assets.length) {
    return (
      <InvestmentEmpty
        title="Comece cadastrando um ativo"
        text="Depois você poderá registrar compras, vendas e valorizações mensais."
        href="/investments/assets"
        actionLabel="Cadastrar ativo"
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/investments/operations"
          className="rounded-xl bg-cyan-500 px-4 py-2.5 text-center text-sm font-black text-slate-950"
        >
          Registrar operação
        </Link>
        <Link
          href="/investments/assets"
          className="rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm font-bold text-slate-300 hover:bg-white/5"
        >
          Gerenciar ativos
        </Link>
      </div>

      <InvestmentExchangeSettings data={data} exchangeContext={exchangeContext} reload={reload} />

      {summary.missingRateAssetCount > 0 && (
        <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          {summary.missingRateAssetCount} {summary.missingRateAssetCount === 1 ? "ativo não foi considerado" : "ativos não foram considerados"} por falta de cotação.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [
            "Patrimônio atual",
            formatInvestmentMoney(summary.currentValue, selectedCurrency),
          ],
          [
            "Total investido",
            formatInvestmentMoney(summary.totalInvested, selectedCurrency),
          ],
          [
            "Resultado não realizado",
            formatInvestmentMoney(
              summary.unrealizedResult,
              selectedCurrency,
            ),
          ],
          ["Quantidade de ativos", String(summary.assetCount)],
          ["Contas utilizadas", String(summary.accountCount)],
        ].map(([label, value]) => (
          <div className={investmentCard} key={label}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p
              className={`mt-2 text-2xl font-black ${
                label === "Resultado não realizado"
                  ? summary.unrealizedResult >= 0
                    ? "text-emerald-300"
                    : "text-red-300"
                  : "text-white"
              }`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-white">Posição atual</h2>
          <p className="mt-1 text-sm text-slate-400">
            Calculada em tempo real pelas compras e vendas, sem tabela de
            posições.
          </p>
        </div>

        <InvestmentToolbar search={search} setSearch={setSearch}>
          <select
            aria-label="Conta da posição"
            className={investmentField}
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
          >
            <option value="">Todas as contas</option>
            {scopedAccounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Ordenação das posições"
            className={investmentField}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="asset">Ativo</option>
            <option value="account">Conta</option>
            <option value="value-desc">Maior patrimônio</option>
            <option value="result-desc">Maior resultado</option>
          </select>
        </InvestmentToolbar>

        {rows.length ? (
          <InvestmentTable
            headers={[
              "Ativo",
              "Conta",
              "Quantidade",
              "Preço médio",
              "Valor investido",
              "Valorização",
              "Patrimônio atual",
            ]}
            minWidth="1080px"
          >
            {rows.map((position) => {
              const asset = assetsById.get(position.assetId);
              const account = accountsById.get(position.accountId);

              return (
                <tr key={position.key} className="border-t border-white/10">
                  <InvestmentTd strong>
                    <div>
                      <span>{position.assetSymbol || position.assetName}</span>
                      {!asset?.active && (
                        <span className="ml-2 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] text-slate-400">
                          Inativo
                        </span>
                      )}
                      {position.assetSymbol && (
                        <p className="mt-0.5 text-xs font-normal text-slate-500">
                          {position.assetName}
                        </p>
                      )}
                    </div>
                  </InvestmentTd>
                  <InvestmentTd>
                    {account?.name ?? position.accountName}
                  </InvestmentTd>
                  <InvestmentTd>
                    {formatInvestmentQuantity(position.quantity)}
                  </InvestmentTd>
                  <InvestmentTd>
                    {formatInvestmentMoney(
                      position.averagePrice,
                      position.currency,
                    )}
                  </InvestmentTd>
                  <InvestmentTd>
                    {formatInvestmentMoney(
                      position.investedValue,
                      position.currency,
                    )}
                  </InvestmentTd>
                  <InvestmentTd>
                    <div>
                      <span
                        className={
                          position.unrealizedResult >= 0
                            ? "font-bold text-emerald-300"
                            : "font-bold text-red-300"
                        }
                      >
                        {position.hasValuation
                          ? formatInvestmentMoney(
                              position.currentUnitValue,
                              position.currency,
                            )
                          : "Não informada"}
                      </span>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {position.hasValuation
                          ? `${position.appreciationPercent?.toLocaleString(
                              "pt-BR",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}% · ${formatInvestmentMonth(
                              position.valuationMonth ?? "",
                            )}`
                          : "Patrimônio estimado pelo custo médio"}
                      </p>
                    </div>
                  </InvestmentTd>
                  <InvestmentTd>
                    <div>
                      <span className="font-bold text-white">
                        {formatInvestmentMoney(
                          position.currentValue,
                          position.currency,
                        )}
                      </span>
                      {position.currency !== selectedCurrency && convertedCurrentValue(position) !== null && (
                        <p className="mt-0.5 text-xs font-semibold text-cyan-300">
                          ≈ {formatInvestmentMoney(convertedCurrentValue(position) ?? 0, selectedCurrency)}
                        </p>
                      )}
                      <p
                        className={`mt-0.5 text-xs ${
                          position.unrealizedResult >= 0
                            ? "text-emerald-300"
                            : "text-red-300"
                        }`}
                      >
                        {formatInvestmentMoney(
                          position.unrealizedResult,
                          position.currency,
                        )}
                      </p>
                    </div>
                  </InvestmentTd>
                </tr>
              );
            })}
          </InvestmentTable>
        ) : (
          <InvestmentEmpty
            title="Nenhuma posição encontrada"
            text={
              data.operations.length
                ? "Ajuste os filtros da posição."
                : "Registre uma compra para formar a primeira posição."
            }
            href={
              data.operations.length ? undefined : "/investments/operations"
            }
            actionLabel="Registrar compra"
          />
        )}
      </section>

      <InvestmentValuations data={data} exchangeContext={exchangeContext} reload={reload} />
    </div>
  );
}
