// Aparência das contas/cartões (ícone) e atalhos de Lançamentos.
// Tudo aqui é visual: o ícone escolhido nunca define tipo, moeda, papel no
// planejamento ou qualquer regra financeira. Os valores exibidos nos atalhos
// reutilizam as regras já existentes (balanceCalculations).

// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { calculateCardRealizedValue, type BalanceTransaction } from "./balanceCalculations.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isPrimaryCurrency } from "./currencies.ts";
// @ts-expect-error Node's native TypeScript test runner requires the extension.
import { isInvestmentAccount } from "./closingAccounts.ts";

/** Colunas acrescentadas pela migration 202610230001 em public.accounts. */
export const ACCOUNT_SHORTCUT_COLUMNS =
  "icon_key, show_in_transaction_shortcuts, transaction_shortcut_order";

export const ACCOUNT_ICON_KEY_PATTERN = /^[a-z0-9-]{1,40}$/;

export type AccountIconTone =
  | "blue"
  | "sky"
  | "indigo"
  | "violet"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "slate";

/** Pictogramas genéricos (o componente associa cada um a um ícone Lucide). */
export type AccountIconGlyph =
  | "bank"
  | "card"
  | "wallet"
  | "cash"
  | "investment"
  | "savings"
  | "broker"
  | "vault"
  | "foreign"
  | "dollar"
  | "euro"
  | "pound"
  | "coins";

export type AccountIconOption = {
  key: string;
  label: string;
  group: "generic" | "institution";
  tone: AccountIconTone;
  /** Pictograma genérico. */
  glyph?: AccountIconGlyph;
  /**
   * Iniciais da instituição. Não há logotipos no projeto; por isso as
   * instituições usam monograma + cor, nunca a marca.
   */
  monogram?: string;
};

export const ACCOUNT_ICON_OPTIONS: readonly AccountIconOption[] = [
  { key: "bank", label: "Banco", group: "generic", tone: "blue", glyph: "bank" },
  { key: "card", label: "Cartão", group: "generic", tone: "violet", glyph: "card" },
  { key: "wallet", label: "Carteira", group: "generic", tone: "amber", glyph: "wallet" },
  { key: "cash", label: "Dinheiro", group: "generic", tone: "green", glyph: "cash" },
  { key: "investment", label: "Investimento", group: "generic", tone: "cyan", glyph: "investment" },
  { key: "savings", label: "Poupança", group: "generic", tone: "pink", glyph: "savings" },
  { key: "broker", label: "Corretora", group: "generic", tone: "indigo", glyph: "broker" },
  { key: "vault", label: "Reserva", group: "generic", tone: "slate", glyph: "vault" },
  { key: "foreign", label: "Moeda estrangeira", group: "generic", tone: "teal", glyph: "foreign" },
  { key: "dollar", label: "Dólar", group: "generic", tone: "emerald", glyph: "dollar" },
  { key: "euro", label: "Euro", group: "generic", tone: "sky", glyph: "euro" },
  { key: "pound", label: "Libra", group: "generic", tone: "purple", glyph: "pound" },
  { key: "coins", label: "Moedas", group: "generic", tone: "orange", glyph: "coins" },
  { key: "inst-nubank", label: "Nubank", group: "institution", tone: "purple", monogram: "Nu" },
  { key: "inst-itau", label: "Itaú", group: "institution", tone: "orange", monogram: "It" },
  { key: "inst-bradesco", label: "Bradesco", group: "institution", tone: "red", monogram: "Br" },
  { key: "inst-santander", label: "Santander", group: "institution", tone: "red", monogram: "Sa" },
  { key: "inst-bb", label: "Banco do Brasil", group: "institution", tone: "yellow", monogram: "BB" },
  { key: "inst-caixa", label: "Caixa", group: "institution", tone: "blue", monogram: "Cx" },
  { key: "inst-inter", label: "Inter", group: "institution", tone: "orange", monogram: "In" },
  { key: "inst-c6", label: "C6 Bank", group: "institution", tone: "slate", monogram: "C6" },
  { key: "inst-btg", label: "BTG Pactual", group: "institution", tone: "indigo", monogram: "BTG" },
  { key: "inst-xp", label: "XP", group: "institution", tone: "slate", monogram: "XP" },
  { key: "inst-mercadopago", label: "Mercado Pago", group: "institution", tone: "sky", monogram: "MP" },
  { key: "inst-picpay", label: "PicPay", group: "institution", tone: "green", monogram: "PP" },
  { key: "inst-sicredi", label: "Sicredi", group: "institution", tone: "lime", monogram: "Si" },
  { key: "inst-wise", label: "Wise", group: "institution", tone: "lime", monogram: "W" },
  { key: "inst-revolut", label: "Revolut", group: "institution", tone: "blue", monogram: "R" },
];

const ICON_OPTIONS_BY_KEY = new Map(
  ACCOUNT_ICON_OPTIONS.map((option) => [option.key, option]),
);

export function findAccountIconOption(key: unknown): AccountIconOption | null {
  if (typeof key !== "string" || !ACCOUNT_ICON_KEY_PATTERN.test(key)) return null;
  return ICON_OPTIONS_BY_KEY.get(key) ?? null;
}

export type AccountIconSource = {
  type: "Conta" | "Cartão";
  currency?: string | null;
  icon_key?: string | null;
  show_on_investments_dashboard?: boolean | null;
  investment_account_kind?: "BALANCE" | null;
};

/**
 * Ícone salvo, quando válido; senão um ícone genérico derivado do cadastro.
 * Contas antigas (sem icon_key) e chaves desconhecidas caem no fallback.
 */
export function resolveAccountIcon(account: AccountIconSource): AccountIconOption {
  const saved = findAccountIconOption(account.icon_key);
  if (saved) return saved;

  const fallbackKey =
    account.type === "Cartão"
      ? "card"
      : isInvestmentAccount({ id: "", ...account })
        ? "investment"
        : !isPrimaryCurrency(account.currency)
          ? "foreign"
          : "bank";

  return ICON_OPTIONS_BY_KEY.get(fallbackKey) as AccountIconOption;
}

export type ShortcutPreferences = {
  id: string;
  name: string;
  show_in_transaction_shortcuts?: boolean | null;
  transaction_shortcut_order?: number | null;
};

/** Favoritos na ordem configurada; empate (ou sem ordem) segue o nome. */
export function sortTransactionShortcuts<T extends ShortcutPreferences>(accounts: readonly T[]): T[] {
  return accounts
    .filter((account) => account.show_in_transaction_shortcuts === true)
    .sort((left, right) => {
      const leftOrder = left.transaction_shortcut_order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.transaction_shortcut_order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.name.localeCompare(right.name, "pt-BR");
    });
}

/** Próxima posição livre (1, 2, 3...) para um novo favorito. */
export function getNextTransactionShortcutOrder(
  accounts: readonly ShortcutPreferences[],
  ignoreAccountId?: string | null,
) {
  return (
    accounts
      .filter((account) => account.id !== ignoreAccountId && account.show_in_transaction_shortcuts)
      .reduce((max, account) => Math.max(max, account.transaction_shortcut_order ?? 0), 0) + 1
  );
}

/** Ordem digitada no formulário: inteiro de 1 a 999, senão null. */
export function parseTransactionShortcutOrder(value: string): number | null {
  if (!/^\d{1,3}$/.test(value.trim())) return null;
  const order = Number(value.trim());
  return order >= 1 ? order : null;
}

/** Coluna acrescentada pela migration 202610230002 (imagem da conta). */
export const ACCOUNT_IMAGE_COLUMN = "image_path";

/** Colunas visuais opcionais que o banco já possui. */
export type OptionalAccountColumns = { shortcuts: boolean; image: boolean };

export function buildOptionalAccountColumns(available: OptionalAccountColumns) {
  return [
    ...(available.shortcuts ? [ACCOUNT_SHORTCUT_COLUMNS] : []),
    ...(available.image ? [ACCOUNT_IMAGE_COLUMN] : []),
  ]
    .map((columns) => `, ${columns}`)
    .join("");
}

/**
 * Banco sem alguma migration visual: a coluna ainda não existe. Devolve as
 * colunas para a próxima tentativa (sem o grupo ausente) ou null quando o
 * erro não é de coluna ausente. A tela segue funcionando sem o recurso.
 */
export function resolveMissingAccountColumns(
  error: { code?: string | null; message?: string | null } | null | undefined,
  available: OptionalAccountColumns,
): OptionalAccountColumns | null {
  if (!error) return null;
  const message = String(error.message ?? "");
  const mentionsImage = message.includes(ACCOUNT_IMAGE_COLUMN);
  const mentionsShortcuts = ACCOUNT_SHORTCUT_COLUMNS.split(", ").some((column) => message.includes(column));
  const isMissingColumn = error.code === "42703" || error.code === "PGRST204" || mentionsImage || mentionsShortcuts;
  if (!isMissingColumn || (!available.image && !available.shortcuts)) return null;

  if (mentionsImage && available.image) return { ...available, image: false };
  if (mentionsShortcuts && available.shortcuts) return { ...available, shortcuts: false };
  // Coluna não identificada: desliga os recursos opcionais.
  return { shortcuts: false, image: false };
}

/** Lê accounts com as colunas visuais disponíveis, recuando se faltar alguma. */
export async function selectWithOptionalAccountColumns<R extends { error: { code?: string | null; message?: string | null } | null }>(
  run: (optionalColumns: string) => PromiseLike<R>,
): Promise<{ response: R; available: OptionalAccountColumns }> {
  let available: OptionalAccountColumns = { shortcuts: true, image: true };
  for (;;) {
    const response = await run(buildOptionalAccountColumns(available));
    const next = resolveMissingAccountColumns(response.error, available);
    if (!next) return { response, available };
    available = next;
  }
}

// ---------------------------------------------------------------------------
// Fatura do cartão nos atalhos
// ---------------------------------------------------------------------------

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "out/26": deixa explícito a qual mês a fatura se refere. */
export function formatShortcutMonthLabel(year: number, month: number) {
  return `${MONTH_LABELS[month - 1]}/${String(year).slice(-2)}`;
}

/** "2026-11-10" -> "10/nov". */
export function formatShortcutDueDate(date: string) {
  const month = Number(date.slice(5, 7));
  return `${date.slice(8, 10)}/${MONTH_LABELS[month - 1] ?? date.slice(5, 7)}`;
}

/**
 * Vencimento da fatura da competência (ano/mês). A data gravada no fechamento
 * da fatura prevalece. Sem ela, a fatura de uma competência vence no mês
 * seguinte (mesma regra da Visão Financeira, que trata a fatura da competência
 * anterior como compromisso do mês) no dia de vencimento do cadastro,
 * limitado ao último dia do mês.
 */
export function getCardInvoiceDueDate(params: {
  year: number;
  month: number;
  dueDay: number | null | undefined;
  statementDueDate?: string | null;
}): string | null {
  if (params.statementDueDate) return params.statementDueDate;
  if (!params.dueDay || params.dueDay < 1) return null;

  const dueYear = params.month === 12 ? params.year + 1 : params.year;
  const dueMonth = params.month === 12 ? 1 : params.month + 1;
  const lastDay = new Date(Date.UTC(dueYear, dueMonth, 0)).getUTCDate();
  const day = Math.min(params.dueDay, lastDay);

  return `${dueYear}-${String(dueMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type CardShortcutSummary = {
  /** Fatura da competência: compras − estornos (calculateCardRealizedValue). */
  invoiceTotal: number;
  /**
   * Planejamento mensal do cartão (financial_targets) na competência; null =
   * não definido. É orçamento, não o limite de crédito do banco.
   */
  plannedLimit: number | null;
  /** Planejamento − fatura (mesma regra do resumo de Lançamentos). */
  availableLimit: number | null;
  /** Uso do planejamento, 0..1, para a barra; null sem planejamento. */
  usageRatio: number | null;
  isOverLimit: boolean;
  /** Quanto a fatura passou do planejamento (0 quando não passou). */
  exceededAmount: number;
};

export function summarizeCardShortcut(params: {
  transactions: BalanceTransaction[];
  plannedLimit: number | null | undefined;
}): CardShortcutSummary {
  const invoiceTotal = calculateCardRealizedValue(
    params.transactions.map((transaction) => ({ ...transaction, value: Number(transaction.value) })),
  );
  const plannedLimit =
    params.plannedLimit !== null && params.plannedLimit !== undefined && Number(params.plannedLimit) > 0
      ? Number(params.plannedLimit)
      : null;

  if (plannedLimit === null) {
    return { invoiceTotal, plannedLimit: null, availableLimit: null, usageRatio: null, isOverLimit: false, exceededAmount: 0 };
  }

  return {
    invoiceTotal,
    plannedLimit,
    availableLimit: plannedLimit - invoiceTotal,
    usageRatio: Math.min(1, Math.max(0, invoiceTotal / plannedLimit)),
    isOverLimit: invoiceTotal > plannedLimit,
    exceededAmount: Math.max(0, invoiceTotal - plannedLimit),
  };
}

/** Último carregamento dos atalhos, identificado pela competência que o pediu. */
export type ShortcutSummariesRequest<T> = {
  competenceId: string;
  status: "loading" | "ready" | "error";
  summaries: Record<string, T>;
};

/**
 * O que os atalhos mostram para a competência selecionada. Um carregamento de
 * outra competência nunca aparece (troca rápida de mês não exibe a fatura ou o
 * saldo do mês anterior); até a resposta certa chegar, os cards ficam em
 * carregamento.
 */
export function resolveShortcutSummariesView<T>(
  request: ShortcutSummariesRequest<T> | null,
  competenceId: string,
): { status: "loading" | "ready" | "error"; summaries: Record<string, T> } {
  if (!request || !competenceId || request.competenceId !== competenceId) {
    return { status: "loading", summaries: {} };
  }
  return { status: request.status, summaries: request.summaries };
}
