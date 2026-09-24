"use client";

import type { ButtonHTMLAttributes, ReactNode, SyntheticEvent } from "react";
import { LoaderCircle } from "lucide-react";

export function ProcessingButton({ busy, children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean }) {
  const compact = Boolean(props["aria-label"]);
  return (
    <button {...props} disabled={disabled || busy} aria-busy={busy}>
      <span className="inline-grid items-center justify-items-center align-middle">
        <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${busy ? "invisible" : ""}`} aria-hidden={busy || undefined}>{children}</span>
        <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${busy ? "" : "invisible"}`} aria-hidden={!busy}>
          <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span className={compact ? "sr-only" : undefined}>Processando...</span>
        </span>
      </span>
    </button>
  );
}

/** Native fieldset disables nested controls, including controls in child components. */
export function MutationScope({ busy, isLocked, children }: { busy: boolean; isLocked: () => boolean; children: ReactNode }) {
  function blockWhileLocked(event: SyntheticEvent) {
    if (isLocked()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  return (
    <fieldset className="contents" disabled={busy} aria-busy={busy}
      onMouseDownCapture={blockWhileLocked} onPointerDownCapture={blockWhileLocked}
      onClickCapture={blockWhileLocked} onChangeCapture={blockWhileLocked}
      onSubmitCapture={blockWhileLocked} onKeyDownCapture={blockWhileLocked}>
      {children}
    </fieldset>
  );
}
