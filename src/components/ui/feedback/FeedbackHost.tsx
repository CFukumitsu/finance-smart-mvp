"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  PencilLine,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  dismissToast,
  getFeedbackState,
  registerFeedbackHost,
  resolveDialog,
  subscribeFeedback,
  type ConfirmTone,
  type DialogRequest,
  type NoticeTone,
  type ToastItem,
  type ToastTone,
} from "./feedbackStore";

const TOAST_DURATION_MS = 4500;

type ToneStyle = { icon: LucideIcon; chip: string; button: string };

const noticeTones: Record<NoticeTone, ToneStyle & { title: string }> = {
  info: { icon: Info, chip: "fs-chip-info", button: "fs-button-primary", title: "Aviso" },
  success: { icon: CircleCheck, chip: "fs-chip-success", button: "fs-button-primary", title: "Tudo certo" },
  warning: { icon: TriangleAlert, chip: "fs-chip-warning", button: "fs-button-primary", title: "Atenção" },
  error: { icon: CircleAlert, chip: "fs-chip-danger", button: "fs-button-primary", title: "Não foi possível concluir" },
};

const confirmTones: Record<ConfirmTone, ToneStyle> = {
  default: { icon: Info, chip: "fs-chip-info", button: "fs-button-primary" },
  warning: { icon: TriangleAlert, chip: "fs-chip-warning", button: "fs-button-warning" },
  danger: { icon: TriangleAlert, chip: "fs-chip-danger", button: "fs-button-danger" },
};

const toastTones: Record<ToastTone, { icon: LucideIcon; chip: string }> = {
  success: { icon: CircleCheck, chip: "fs-icon-success" },
  error: { icon: CircleAlert, chip: "fs-icon-danger" },
  info: { icon: Info, chip: "fs-icon-info" },
};

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])';

function DialogView({ dialog }: { dialog: DialogRequest }) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const [answered, setAnswered] = useState(false);
  const [value, setValue] = useState(
    dialog.kind === "input" ? (dialog.options.defaultValue ?? "") : "",
  );
  const [inputError, setInputError] = useState<string | null>(null);

  const isNotice = dialog.kind === "notice";
  // Em ações destrutivas e escolhas múltiplas o foco inicial fica em Cancelar.
  const focusCancel =
    dialog.kind === "choice" ||
    (dialog.kind === "confirm" && dialog.options.tone === "danger");

  function answer(result: boolean | string | null) {
    if (answered) return;
    setAnswered(true);
    resolveDialog(dialog.id, result);
  }

  function cancel() {
    answer(isNotice ? true : null);
  }

  function submit() {
    if (dialog.kind === "notice") return answer(true);
    if (dialog.kind === "confirm") return answer(true);
    if (dialog.kind === "choice") return;
    const error = dialog.options.validate?.(value) ?? null;
    if (error) {
      setInputError(error);
      return;
    }
    answer(value);
  }

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (initialFocusRef.current ?? panelRef.current)?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Teclado em captura: enquanto o diálogo está aberto, atalhos da página
  // (Esc/Enter de modais e formulários por baixo) não recebem as teclas. A ação
  // padrão do navegador continua valendo (Enter/Espaço no botão focado, digitar
  // no campo). resolveDialog ignora respostas repetidas.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();

      if (event.key === "Escape") {
        event.preventDefault();
        resolveDialog(dialog.id, dialog.kind === "notice" ? true : null);
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panelRef.current.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [dialog.id, dialog.kind]);

  let tone: ToneStyle;
  let title: string;
  if (dialog.kind === "notice") {
    const style = noticeTones[dialog.options.tone ?? "info"];
    tone = style;
    title = dialog.options.title ?? style.title;
  } else if (dialog.kind === "confirm" || dialog.kind === "choice") {
    tone = confirmTones[dialog.options.tone ?? "default"];
    title = dialog.options.title ?? "Confirmar ação";
  } else {
    tone = { icon: PencilLine, chip: "fs-chip-info", button: "fs-button-primary" };
    title = dialog.options.title ?? "Informe o valor";
  }
  const Icon = tone.icon;
  const message = dialog.options.message;

  const confirmLabel =
    dialog.kind === "choice"
      ? null
      : (dialog.options.confirmLabel ??
        (dialog.kind === "notice" ? "Entendi" : "Confirmar"));
  const cancelLabel =
    dialog.kind === "notice" ? null : (dialog.options.cancelLabel ?? "Cancelar");

  return (
    <div
      className="fs-overlay fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      onMouseDown={(event) => {
        // Só avisos fecham ao clicar fora; confirmações exigem um botão.
        if (event.target === event.currentTarget && isNotice) cancel();
      }}
    >
      <div
        ref={panelRef}
        role={isNotice ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        className="fs-dialog max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-2xl outline-none sm:max-w-md sm:rounded-2xl"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}
            >
              <Icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="fs-muted text-[11px] font-semibold uppercase tracking-wider">
                Finance Smart
              </p>
              <h2 id={titleId} className="fs-text mt-0.5 text-base font-semibold">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={cancel}
              disabled={answered}
              className="fs-muted fs-hover -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>

          {message && (
            <p
              id={messageId}
              className="fs-text-soft mt-3 whitespace-pre-line break-words text-sm leading-relaxed"
            >
              {message}
            </p>
          )}

          {dialog.kind === "notice" && dialog.options.details && (
            <details className="fs-details mt-3 rounded-xl border px-3 py-2 text-xs">
              <summary className="fs-muted cursor-pointer select-none font-medium">
                Detalhes técnicos
              </summary>
              <p className="fs-text-soft mt-2 whitespace-pre-wrap break-words font-mono">
                {dialog.options.details}
              </p>
            </details>
          )}

          {dialog.kind === "input" && (
            <label className="mt-4 block">
              <span className="fs-text-soft text-xs font-medium">
                {dialog.options.label}
              </span>
              <input
                ref={(element) => {
                  initialFocusRef.current = element;
                }}
                value={value}
                placeholder={dialog.options.placeholder}
                onChange={(event) => {
                  setValue(event.target.value);
                  setInputError(null);
                }}
                aria-invalid={inputError ? true : undefined}
                className="fs-field mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              />
              {inputError && (
                <span role="alert" className="fs-danger-text mt-1.5 block text-xs">
                  {inputError}
                </span>
              )}
            </label>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {cancelLabel && (
              <button
                type="button"
                onClick={cancel}
                disabled={answered}
                ref={(element) => {
                  if (focusCancel) initialFocusRef.current = element;
                }}
                className="fs-button-secondary rounded-xl border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {cancelLabel}
              </button>
            )}
            {dialog.kind === "choice" &&
              dialog.options.choices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => answer(choice.value)}
                  disabled={answered}
                  className={`${choice.tone ? confirmTones[choice.tone].button : "fs-button-secondary border"} rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50`}
                >
                  {choice.label}
                </button>
              ))}
            {confirmLabel && (
              <button
                type="submit"
                disabled={answered}
                ref={(element) => {
                  if (!focusCancel && dialog.kind !== "input") initialFocusRef.current = element;
                }}
                className={`${tone.button} rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50`}
              >
                {confirmLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function ToastView({ toast }: { toast: ToastItem }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id]);

  const { icon: Icon, chip } = toastTones[toast.tone];

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="fs-dialog pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl"
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${chip}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="fs-text text-sm font-semibold">{toast.title}</p>
        {toast.description && (
          <p className="fs-muted mt-0.5 text-xs">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        className="fs-muted fs-hover -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        aria-label="Fechar aviso"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Montado uma vez no layout raiz. Mostra um diálogo por vez, em ordem. */
export default function FeedbackHost() {
  const state = useSyncExternalStore(
    subscribeFeedback,
    getFeedbackState,
    getFeedbackState,
  );

  useEffect(() => registerFeedbackHost(), []);

  const current = state.dialogs[0];

  return (
    <>
      {current && <DialogView key={current.id} dialog={current} />}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {state.toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} />
        ))}
      </div>
    </>
  );
}
