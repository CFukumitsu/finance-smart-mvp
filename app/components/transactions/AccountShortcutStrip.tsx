"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
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
  "rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60";
const chipSelected = "border-blue-500/60 bg-blue-500/10";
/** Controles da linha "Suas contas": altura de botão comum, nunca de card. */
const controlBase =
  "h-9 rounded-xl border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60";
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
      className={`block break-words text-base font-semibold leading-tight tabular-nums tracking-tight ${
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
  const cash = summary?.kind === "account" ? summary : null;
  const monthLabel = card ? formatShortcutMonthLabel(card.year, card.month) : null;
  // Competência atual: saldo de hoje; demais: saldo no fim da competência.
  const balanceLabel =
    !cash || cash.temporal === "current"
      ? "Saldo atual"
      : `${cash.temporal === "future" ? "Saldo previsto" : "Saldo"} · fim de ${formatShortcutMonthLabel(cash.year, cash.month)}`;

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
      className={`${chipBase} ${
        selected ? `${chipSelected} ring-1 ring-blue-500/40` : chipIdle
      } flex w-full min-w-0 flex-col gap-0.5 px-3 py-2.5`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <AccountIcon option={resolveAccountIcon(account)} size="sm" imageUrl={imageUrl} />
        <span className="theme-text line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug">
          {account.name}
        </span>
      </span>

      {account.type === "Conta" ? (
        <>
          <span className="theme-muted mt-1 text-[11px] font-medium leading-tight">{balanceLabel}</span>
          <ShortcutValue
            value={cash?.balance}
            currency={account.currency}
            state={summariesState}
            negativeTone
          />
        </>
      ) : (
        <>
          <span className="theme-muted mt-1 flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] font-medium leading-tight">
            <span>
              {!card || card.temporal === "current" ? "Fatura atual" : "Fatura"}
              {monthLabel ? ` · ${monthLabel}` : ""}
            </span>
            {card?.dueDate && (
              <span className="whitespace-nowrap">
                Vence {formatShortcutDueDate(card.dueDate)}
              </span>
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
              <span className="theme-muted mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] leading-tight">
                <span>Uso do planejamento · {monthLabel}</span>
                <span className="whitespace-nowrap tabular-nums">
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
              <span className="theme-muted flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] leading-tight">
                <span>
                  {card.isOverLimit ? "Excedido no planejamento" : "Disponível no planejamento"}
                </span>
                <span
                  className={`whitespace-nowrap font-semibold tabular-nums ${
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
            <span className="theme-muted text-[11px] leading-tight">
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
    // No celular o painel se ancora à linha de controles (pai relativo), para
    // não ultrapassar a tela; a partir de sm, ao próprio seletor.
    <div ref={containerRef} className="min-w-0 flex-1 sm:relative sm:w-56 sm:flex-none">
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
        title={selectedAccount ? `Outras contas: ${selectedAccount.name}` : undefined}
        className={`${controlBase} ${selectedAccount ? chipSelected : chipIdle} flex w-full items-center gap-2 pl-1 pr-2.5 text-left`}
      >
        {selectedAccount ? (
          <>
            <AccountIcon
              option={resolveAccountIcon(selectedAccount)}
              size="sm"
              imageUrl={imageUrlOf(selectedAccount, imageUrls)}
            />
            <span className="theme-text min-w-0 flex-1 truncate font-semibold">
              {selectedAccount.name}
            </span>
          </>
        ) : (
          <span className="theme-text min-w-0 flex-1 truncate pl-2 font-semibold">
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
          className="transactions-surface absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border p-2 shadow-xl sm:left-auto sm:w-[min(20rem,calc(100vw-2rem))]"
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
 * Atalhos de contas/cartões de Lançamentos. Acompanham a competência
 * selecionada (não dependem dos demais filtros) e funcionam como filtro de conta: clicar seleciona;
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

  // Os favoritos dividem a largura em até max(n, 4) colunas: quatro favoritos
  // ocupam a linha toda; um ou dois não viram cards gigantes. O CSS reduz as
  // colunas quando não cabem com legibilidade (ver .account-shortcut-grid).
  const gridStyle = {
    "--shortcut-cols": Math.max(favorites.length, 4),
  } as CSSProperties;

  return (
    <section aria-label="Atalhos de contas e cartões" className="account-shortcuts space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="theme-muted text-xs font-semibold uppercase tracking-wide">
          Suas contas
        </h2>

        {/* No celular os controles ocupam uma linha própria, abaixo do título;
            nas demais larguras quebram de linha em vez de encolher sobre ele. */}
        <div className="relative flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto sm:shrink-0">
          <button
            type="button"
            aria-pressed={!selectedAccountId}
            onClick={() => onSelectAccount("")}
            title="Mostrar lançamentos de todas as contas"
            className={`${controlBase} ${!selectedAccountId ? chipSelected : chipIdle} theme-text flex shrink-0 items-center gap-1.5 px-3 font-semibold`}
          >
            <LayoutGrid size={15} aria-hidden="true" className="theme-muted" />
            Todas
          </button>
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
            className={`${controlBase} ${chipIdle} theme-muted flex w-9 shrink-0 items-center justify-center`}
          >
            <Settings2 size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {favorites.length > 0 ? (
        <div
          role="group"
          aria-label="Filtrar lançamentos por conta ou cartão"
          className="account-shortcut-grid"
          style={gridStyle}
        >
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
        </div>
      ) : (
        <p className="theme-muted rounded-2xl border border-dashed border-white/10 px-4 py-2 text-xs">
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
    </section>
  );
}
