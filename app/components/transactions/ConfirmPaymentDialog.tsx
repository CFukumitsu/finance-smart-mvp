"use client";

import { useEffect, type ReactNode } from "react";
import { CircleAlert, CircleCheck, TriangleAlert, X } from "lucide-react";
import { ProcessingButton } from "@/src/components/ui/Mutation";
import { formatMoney } from "@/src/utils/currencies";
import {
  formatSignedMoney,
  type InvoiceDivergence,
} from "@/src/utils/paymentConfirmation";

export type ConfirmPaymentDialogProps = {
  description: string;
  accountName: string;
  value: number;
  currency: string | null;
  dueDateLabel: string;
  competenceLabel: string;
  /** Só para Pagamento de Fatura: identificação da fatura vinculada. */
  statementLabel?: string | null;
  effectiveDate: string;
  maxDate: string;
  divergence: InvoiceDivergence | null;
  error: string | null;
  busy: boolean;
  disabled: boolean;
  onEffectiveDateChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onEditTransaction: () => void;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="theme-divider flex items-start justify-between gap-4 border-b py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs font-medium text-slate-400">{label}</dt>
      <dd className="theme-text min-w-0 break-words text-right text-sm font-medium">
        {children}
      </dd>
    </div>
  );
}

export default function ConfirmPaymentDialog(props: ConfirmPaymentDialogProps) {
  const { busy, onCancel } = props;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  const { divergence, currency } = props;

  return (
    <div
      className="transactions-page transactions-overlay fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-payment-title"
        aria-describedby="confirm-payment-description"
        className="transactions-drawer max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"
          >
            <CircleCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-payment-title"
              className="theme-text text-base font-semibold"
            >
              Confirmar pagamento
            </h2>
            <p
              id="confirm-payment-description"
              className="mt-0.5 text-xs text-slate-400"
            >
              O lançamento passa a Pago na data efetiva informada.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="theme-muted theme-hover flex h-8 w-8 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <dl className="mt-4">
          <Row label="Descrição">{props.description}</Row>
          <Row label="Conta / Cartão">{props.accountName}</Row>
          {props.statementLabel !== undefined && (
            <Row label="Fatura vinculada">
              {props.statementLabel ?? "Nenhuma fatura vinculada"}
            </Row>
          )}
          <Row label="Valor">
            <span className="tabular-nums">
              {formatMoney(props.value, currency)}
            </span>
          </Row>
          <Row label="Data prevista">{props.dueDateLabel}</Row>
          <Row label="Competência">{props.competenceLabel}</Row>
        </dl>

        {divergence && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <TriangleAlert size={16} aria-hidden="true" />
              Valor diferente do total da fatura
            </p>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
              <dt className="text-slate-400">Valor do lançamento</dt>
              <dd className="theme-text text-right font-semibold tabular-nums">
                {formatMoney(divergence.transactionValue, currency)}
              </dd>
              <dt className="text-slate-400">Total da fatura</dt>
              <dd className="theme-text text-right font-semibold tabular-nums">
                {formatMoney(divergence.statementTotal, currency)}
              </dd>
              <dt className="text-slate-400">Diferença</dt>
              <dd className="text-right font-semibold tabular-nums text-amber-300">
                {formatSignedMoney(divergence.difference, currency)}
              </dd>
            </dl>
            <p className="mt-2 text-xs text-slate-400">
              A divergência não será corrigida automaticamente: o total da
              fatura e o valor do lançamento continuam como estão.
            </p>
          </div>
        )}

        <div className="mt-4">
          <label
            htmlFor="confirm-payment-date"
            className="theme-muted-strong mb-1.5 block text-sm font-semibold"
          >
            Data efetiva do pagamento
          </label>
          <input
            id="confirm-payment-date"
            type="date"
            max={props.maxDate}
            value={props.effectiveDate}
            disabled={busy}
            onChange={(event) => props.onEffectiveDateChange(event.target.value)}
            className="theme-field w-full rounded-xl border px-4 py-3 text-sm outline-none"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Será confirmado o valor registrado no lançamento. Se o valor pago
            foi diferente,{" "}
            <button
              type="button"
              disabled={busy}
              onClick={props.onEditTransaction}
              className="font-semibold text-blue-300 underline-offset-2 hover:underline disabled:opacity-50"
            >
              edite o lançamento
            </button>{" "}
            antes de confirmar.
          </p>
        </div>

        {props.error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300"
          >
            <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
            {props.error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="theme-field theme-hover h-10 w-full rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
          >
            Cancelar
          </button>
          <ProcessingButton
            busy={busy}
            disabled={props.disabled}
            onClick={props.onConfirm}
            className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              divergence
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {divergence ? "Confirmar mesmo assim" : "Confirmar pagamento"}
          </ProcessingButton>
        </div>
      </div>
    </div>
  );
}
