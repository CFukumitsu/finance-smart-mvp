// Fila central de avisos, confirmações, entradas e toasts do Finance Smart.
// Substitui alert/confirm/prompt nativos sem sobrescrever os do navegador:
// quem chama usa as funções exportadas e o <FeedbackHost /> do layout raiz
// renderiza o que estiver na fila. Sem host montado, nada fica pendente:
// confirmações e entradas resolvem como "cancelado".

export type NoticeTone = "info" | "success" | "warning" | "error";
export type ConfirmTone = "default" | "warning" | "danger";
export type ToastTone = "success" | "error" | "info";

export type NoticeOptions = {
  title?: string;
  message: string;
  tone?: NoticeTone;
  /** Detalhe técnico opcional, exibido recolhido. Nunca dados sensíveis. */
  details?: string;
  confirmLabel?: string;
};

export type ConfirmOptions = {
  title?: string;
  message: string;
  tone?: ConfirmTone;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type ChoiceOptions = {
  title?: string;
  message: string;
  tone?: ConfirmTone;
  /** Ações possíveis, além de Cancelar. Sem tone, o botão é neutro. */
  choices: { value: string; label: string; tone?: ConfirmTone }[];
  cancelLabel?: string;
};

export type InputOptions = {
  title?: string;
  message?: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Retorna a mensagem de erro, ou null quando o valor é válido. */
  validate?: (value: string) => string | null;
};

export type DialogRequest =
  | { id: number; kind: "notice"; options: NoticeOptions; resolve: () => void }
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; kind: "choice"; options: ChoiceOptions; resolve: (value: string | null) => void }
  | { id: number; kind: "input"; options: InputOptions; resolve: (value: string | null) => void };

export type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

export type FeedbackState = {
  dialogs: DialogRequest[];
  toasts: ToastItem[];
};

const MAX_TOASTS = 3;

let state: FeedbackState = { dialogs: [], toasts: [] };
let nextId = 0;
let hostCount = 0;
const listeners = new Set<() => void>();

function setState(next: FeedbackState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function subscribeFeedback(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFeedbackState() {
  return state;
}

/** Chamado pelo host ao montar; devolve a função de desmontagem. */
export function registerFeedbackHost() {
  hostCount += 1;
  return () => {
    hostCount -= 1;
    if (hostCount === 0) {
      // Sem host, ninguém pode responder: resolve tudo como cancelado.
      state.dialogs.forEach((dialog) => settle(dialog, null));
      setState({ dialogs: [], toasts: [] });
    }
  };
}

function enqueue<T>(
  build: (id: number, resolve: (value: T) => void) => DialogRequest,
  fallback: T,
) {
  return new Promise<T>((resolve) => {
    if (hostCount === 0) {
      resolve(fallback);
      return;
    }
    nextId += 1;
    setState({ ...state, dialogs: [...state.dialogs, build(nextId, resolve)] });
  });
}

function settle(dialog: DialogRequest, value: boolean | string | null) {
  if (dialog.kind === "notice") dialog.resolve();
  else if (dialog.kind === "confirm") dialog.resolve(value === true);
  else if (dialog.kind === "choice") {
    const valid = dialog.options.choices.some((choice) => choice.value === value);
    dialog.resolve(valid ? (value as string) : null);
  } else dialog.resolve(typeof value === "string" ? value : null);
}

/**
 * Responde um diálogo da fila. Só a primeira resposta conta: cliques duplos
 * ou Esc depois do clique não resolvem de novo.
 */
export function resolveDialog(id: number, value: boolean | string | null) {
  const dialog = state.dialogs.find((item) => item.id === id);
  if (!dialog) return false;
  setState({ ...state, dialogs: state.dialogs.filter((item) => item.id !== id) });
  settle(dialog, value);
  return true;
}

/** Aviso modal. A Promise resolve quando a pessoa fecha o aviso. */
export function showNotice(options: NoticeOptions) {
  return enqueue<void>(
    (id, resolve) => ({ id, kind: "notice", options, resolve }),
    undefined,
  );
}

/** Confirmação explícita. Resolve true só no botão Confirmar. */
export function confirmAction(options: ConfirmOptions) {
  return enqueue<boolean>(
    (id, resolve) => ({ id, kind: "confirm", options, resolve }),
    false,
  );
}

/**
 * Escolha entre mais de duas saídas (substitui confirm() cujo "Cancelar" não
 * cancelava, e sim escolhia outro caminho). Resolve o value escolhido, ou null
 * quando a pessoa cancela; quem chama não executa nada com null.
 */
export function chooseAction(options: ChoiceOptions) {
  return enqueue<string | null>(
    (id, resolve) => ({ id, kind: "choice", options, resolve }),
    null,
  );
}

/** Entrada de dados. Resolve o texto informado, ou null ao cancelar. */
export function requestInput(options: InputOptions) {
  return enqueue<string | null>(
    (id, resolve) => ({ id, kind: "input", options, resolve }),
    null,
  );
}

export function showToast(tone: ToastTone, title: string, description?: string) {
  if (hostCount === 0) return;
  nextId += 1;
  const toasts = [...state.toasts, { id: nextId, tone, title, description }];
  setState({ ...state, toasts: toasts.slice(-MAX_TOASTS) });
}

export function dismissToast(id: number) {
  if (!state.toasts.some((toast) => toast.id === id)) return;
  setState({ ...state, toasts: state.toasts.filter((toast) => toast.id !== id) });
}

/**
 * Atalhos para trocar alert() sem aguardar o fechamento. Para manter a ordem
 * de um fluxo que dependia do bloqueio do alert, use `await showNotice()`.
 */
export const notify = {
  info(message: string, title?: string) {
    void showNotice({ message, title, tone: "info" });
  },
  warning(message: string, title?: string) {
    void showNotice({ message, title, tone: "warning" });
  },
  error(message: string, title?: string, details?: string) {
    void showNotice({ message, title, tone: "error", details });
  },
  success(title: string, description?: string) {
    showToast("success", title, description);
  },
};

/** Só para testes. */
export function resetFeedbackForTests() {
  state = { dialogs: [], toasts: [] };
  nextId = 0;
  hostCount = 0;
  listeners.clear();
}
