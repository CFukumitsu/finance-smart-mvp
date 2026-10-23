"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, LayoutGrid, Search, Settings2 } from "lucide-react";
import AccountIcon from "@/src/components/accounts/AccountIcon";
import type { TransactionShortcutSummary } from "@/src/services/transactionShortcutService";
import {
  formatShortcutDueDate,
  formatShortcutMonthLabel,
  resolveAccountIcon,
  sortTransactionShortcuts,
} from "@/src/utils/accountShortcuts";
import { formatMoney, resolveAccountCurrency } from "@/src/utils/currencies";

export type ShortcutStripAccount = {
  id: string;
  name: string;
  type: "Conta" | "Cartão";
  currency: string | null;
  show_on_investments_dashboard: boolean;
  investment_account_kind: "BALANCE" | null;
  icon_key?: string | null;
  show_in_transaction_shortcuts?: boolean;
  transaction_shortcut_order?: number | null;
  image_path?: string | null;
};

/** URL assinada da imagem da conta, quando houver. */
function imageUrlOf(account: ShortcutStripAccount, imageUrls: Record<string, string>) {
  return account.image_path ? (imageUrls[account.image_path] ?? null) : null;
}

type AccountShortcutStripProps = {
  /** Contas/cartões que o filtro de Lançamentos aceita. */
  accounts: ShortcutStripAccount[];
  /** Filtro de conta atual ("" = todas). */
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  summaries: Record<string, TransactionShortcutSummary>;
  summariesState: "loading" | "ready" | "error";
  /** false = banco sem as colunas de atalhos (migration pendente). */
  shortcutsAvailable: boolean;
  /** URLs assinadas das imagens enviadas, por caminho. */
  imageUrls: Record<string, string>;
};

const chipBase =
  "shrink-0 snap-start rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60";
const chipSelected = "border-blue-500/60 bg-blue-500/10";
const chipIdle = "transactions-surface theme-hover";

function ShortcutValue({
  value,
  currency,
  state,
  negativeTone = false,
}: {
  value: number | null | undefined;
  currency: string | null;
  state: AccountShortcutStripProps["summariesState"];
  negativeTone?: boolean;
}) {
  if (value === null || value === undefined) {
    return (
      <span className="theme-muted block text-base font-semibold">
        {state === "loading" ? "…" : state === "error" ? "Indisponível" : "—"}
      </span>
    );
  }

  return (
    <span
      className={`block truncate text-base font-semibold tabular-nums tracking-tight ${
        negativeTone && value < 0 ? "text-red-300" : "theme-text"
      }`}
    >
      {formatMoney(value, currency)}
    </span>
  );
}

function ShortcutCard({
  account,
  summary,
  summariesState,
  selected,
  onToggle,
  imageUrl,
}: {
  imageUrl: string | null;
  account: ShortcutStripAccount;
  summary: TransactionShortcutSummary | undefined;
  summariesState: AccountShortcutStripProps["summariesState"];
  selected: boolean;
  onToggle: () => void;
}) {
  const card = summary?.kind === "card" ? summary : null;
  const monthLabel = card ? formatShortcutMonthLabel(card.year, card.month) : null;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      title={
        selected
          ? `Remover o filtro de ${account.name}`
          : `Filtrar lançamentos por ${account.name}`
      }
      className={`${chipBase} ${selected ? chipSelected : chipIdle} flex w-[15rem] flex-col gap-1 p-3`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <AccountIcon option={resolveAccountIcon(account)} size="sm" imageUrl={imageUrl} />
        <span className="theme-text min-w-0 truncate text-sm font-semibold">
          {account.name}
        </span>
      </span>

      {account.type === "Conta" ? (
        <>
          <span className="theme-muted mt-1 text-[11px] font-medium">Saldo atual</span>
          <ShortcutValue
            value={summary?.kind === "account" ? summary.balance : null}
            currency={account.currency}
            state={summariesState}
            negativeTone
          />
        </>
      ) : (
        <>
          <span className="theme-muted mt-1 flex items-center justify-between gap-2 text-[11px] font-medium">
            <span className="truncate">
              Fatura atual{monthLabel ? ` · ${monthLabel}` : ""}
            </span>
            {card?.dueDate && (
              <span className="shrink-0">Vence {formatShortcutDueDate(card.dueDate)}</span>
            )}
          </span>
          <ShortcutValue
            value={card?.invoiceTotal}
            currency={account.currency}
            state={summariesState}
          />
          {card && card.plannedLimit !== null && card.usageRatio !== null ? (
            <>
              {/* Planejamento mensal do cartão: orçamento, não limite bancário. */}
              <span className="theme-muted flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate">Uso do planejamento · {monthLabel}</span>
                <span className="shrink-0 tabular-nums">
                  {Math.max(0, Math.round((card.invoiceTotal / card.plannedLimit) * 100))}%
                </span>
              </span>
              <span
                role="meter"
                aria-label={`Uso do planejamento de ${monthLabel}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(card.usageRatio * 100)}
                title={`Planejado para ${monthLabel}: ${formatMoney(card.plannedLimit, account.currency)}`}
                className="block h-1 w-full overflow-hidden rounded-full bg-slate-500/20"
              >
                <span
                  className={`block h-full rounded-full ${card.isOverLimit ? "bg-red-400" : "bg-blue-400"}`}
                  style={{ width: `${Math.round(card.usageRatio * 100)}%` }}
                />
              </span>
              <span className="theme-muted flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate">
                  {card.isOverLimit ? "Excedido no planejamento" : "Disponível no planejamento"}
                </span>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${
                    card.isOverLimit ? "text-red-300" : "theme-muted-strong"
                  }`}
                >
                  {formatMoney(
                    card.isOverLimit ? card.exceededAmount : (card.availableLimit ?? 0),
                    account.currency,
                  )}
                </span>
              </span>
            </>
          ) : (
            <span className="theme-muted text-[11px]">
              {card
                ? `Planejamento não definido${monthLabel ? ` · ${monthLabel}` : ""}`
                : summariesState === "loading"
                  ? "…"
                  : "—"}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function OtherAccountsSelector({
  accounts,
  selectedAccount,
  onSelectAccount,
  imageUrls,
}: {
  accounts: ShortcutStripAccount[];
  selectedAccount: ShortcutStripAccount | null;
  onSelectAccount: (accountId: string) => void;
  imageUrls: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  const normalizedQuery = normalize(query.trim());
  const visibleAccounts = normalizedQuery
    ? accounts.filter((account) => normalize(account.name).includes(normalizedQuery))
    : accounts;

  function close(returnFocus: boolean) {
    setIsOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(accountId: string) {
    onSelectAccount(accountId);
    close(true);
  }

  function focusOption(index: number) {
    const options = listRef.current?.querySelectorAll<HTMLButtonElement>("button");
    if (!options || options.length === 0) return;
    options[(index + options.length) % options.length].focus();
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) {
      focusOption(event.key === "ArrowDown" ? 0 : options.length - 1);
    } else {
      focusOption(current + (event.key === "ArrowDown" ? 1 : -1));
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 sm:flex-none">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={
          selectedAccount
            ? `Outras contas: ${selectedAccount.name} selecionada`
            : "Outras contas"
        }
        onClick={() => (isOpen ? close(false) : setIsOpen(true))}
        className={`${chipBase} ${selectedAccount ? chipSelected : chipIdle} flex h-full min-h-11 w-full items-center gap-2 px-3 py-2 sm:max-w-[15rem]`}
      >
        {selectedAccount ? (
          <>
            <AccountIcon
              option={resolveAccountIcon(selectedAccount)}
              size="sm"
              imageUrl={imageUrlOf(selectedAccount, imageUrls)}
            />
            <span className="min-w-0 flex-1">
              <span className="theme-muted block text-[11px] font-medium">Outras contas</span>
              <span className="theme-text block truncate text-sm font-semibold">
                {selectedAccount.name}
              </span>
            </span>
          </>
        ) : (
          <span className="theme-text min-w-0 flex-1 truncate text-sm font-semibold">
            Outras contas
          </span>
        )}
        <ChevronDown size={16} aria-hidden="true" className="theme-muted shrink-0" />
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Selecionar outra conta ou cartão"
          onKeyDown={handlePanelKeyDown}
          className="transactions-surface absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border p-2 shadow-xl"
        >
          <label className="relative block">
            <span className="sr-only">Buscar conta ou cartão</span>
            <Search
              size={15}
              aria-hidden="true"
              className="theme-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar conta ou cartão..."
              className="theme-field h-10 w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none"
            />
          </label>

          <ul ref={listRef} className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
            {visibleAccounts.map((account) => {
              const isSelected = account.id === selectedAccount?.id;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => choose(account.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                      isSelected ? chipSelected : "theme-hover"
                    }`}
                  >
                    <AccountIcon
                      option={resolveAccountIcon(account)}
                      size="sm"
                      imageUrl={imageUrlOf(account, imageUrls)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="theme-text block truncate text-sm font-medium">
                        {account.name}
                      </span>
                      <span className="theme-muted block text-[11px]">
                        {account.type} · {resolveAccountCurrency(account.currency)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {visibleAccounts.length === 0 && (
            <p className="theme-muted px-2.5 py-3 text-sm">
              {accounts.length === 0
                ? "Todas as contas já estão nos atalhos."
                : "Nenhuma conta encontrada."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR");
}

/**
 * Atalhos de contas/cartões de Lançamentos. Mostram a situação atual (não
 * dependem dos filtros) e funcionam como filtro de conta: clicar seleciona;
 * clicar de novo, ou em "Todas", remove só o filtro de conta.
 */
export default function AccountShortcutStrip({
  accounts,
  selectedAccountId,
  onSelectAccount,
  summaries,
  summariesState,
  shortcutsAvailable,
  imageUrls,
}: AccountShortcutStripProps) {
  const favorites = sortTransactionShortcuts(accounts);
  const favoriteIds = new Set(favorites.map((account) => account.id));
  const otherAccounts = accounts.filter((account) => !favoriteIds.has(account.id));
  const selectedOther =
    otherAccounts.find((account) => account.id === selectedAccountId) ?? null;

  return (
    <section
      aria-label="Atalhos de contas e cartões"
      className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
    >
      <div
        role="group"
        aria-label="Filtrar lançamentos por conta ou cartão"
        className="flex min-w-0 flex-1 snap-x items-stretch gap-2 overflow-x-auto pb-1"
      >
        <button
          type="button"
          aria-pressed={!selectedAccountId}
          onClick={() => onSelectAccount("")}
          title="Mostrar lançamentos de todas as contas"
          className={`${chipBase} ${!selectedAccountId ? chipSelected : chipIdle} flex min-h-11 flex-col items-center justify-center gap-1 px-4 py-2`}
        >
          <LayoutGrid size={18} aria-hidden="true" className="theme-muted" />
          <span className="theme-text text-sm font-semibold">Todas</span>
        </button>

        {favorites.map((account) => (
          <ShortcutCard
            key={account.id}
            account={account}
            summary={summaries[account.id]}
            summariesState={summariesState}
            selected={account.id === selectedAccountId}
            imageUrl={imageUrlOf(account, imageUrls)}
            onToggle={() =>
              onSelectAccount(account.id === selectedAccountId ? "" : account.id)
            }
          />
        ))}

        {favorites.length === 0 && (
          <p className="theme-muted flex min-w-[14rem] max-w-md shrink-0 items-center rounded-2xl border border-dashed border-white/10 px-4 py-2 text-xs sm:shrink">
            {shortcutsAvailable ? (
              <span>
                Nenhum atalho configurado. Em{" "}
                <Link href="/accounts" className="font-semibold text-blue-300 underline-offset-2 hover:underline">
                  Contas e Cartões
                </Link>
                , edite uma conta e marque “Exibir nos atalhos de Lançamentos”.
              </span>
            ) : (
              <span>
                Atalhos de contas ficam disponíveis após a atualização do banco
                (migration 202610230001). Use “Outras contas” para filtrar.
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-stretch gap-2 pb-1">
        <OtherAccountsSelector
          accounts={otherAccounts}
          selectedAccount={selectedOther}
          onSelectAccount={onSelectAccount}
          imageUrls={imageUrls}
        />
        <Link
          href="/accounts"
          title="Personalizar atalhos em Contas e Cartões"
          aria-label="Personalizar atalhos em Contas e Cartões"
          className={`${chipBase} ${chipIdle} theme-muted flex min-h-11 w-11 items-center justify-center`}
        >
          <Settings2 size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
