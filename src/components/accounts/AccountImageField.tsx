"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import AccountIcon from "@/src/components/accounts/AccountIcon";
import { checkAccountImageFile } from "@/src/services/accountImageService";
import { ACCOUNT_IMAGE_HINT, ACCOUNT_IMAGE_TYPES } from "@/src/utils/accountImage";
import type { AccountIconOption } from "@/src/utils/accountShortcuts";

/** Imagem escolhida e ainda não salva (pré-visualização local). */
export type AccountImageDraft = { file: File; previewUrl: string };

type AccountImageFieldProps = {
  /** URL da imagem já salva, se houver. */
  savedImageUrl: string | null;
  hasSavedImage: boolean;
  draft: AccountImageDraft | null;
  onDraftChange: (draft: AccountImageDraft | null) => void;
  /** Remoção da imagem salva, confirmada só ao salvar o cadastro. */
  removeSaved: boolean;
  onRemoveSavedChange: (remove: boolean) => void;
  /** Ícone mostrado quando não há imagem (escolhido ou automático). */
  iconOption: AccountIconOption;
  disabled?: boolean;
};

const ACCEPT = Object.keys(ACCOUNT_IMAGE_TYPES).join(",");
const buttonClass =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50";

export default function AccountImageField({
  savedImageUrl,
  hasSavedImage,
  draft,
  onDraftChange,
  removeSaved,
  onRemoveSavedChange,
  iconOption,
  disabled,
}: AccountImageFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const previewUrl = draft?.previewUrl ?? (removeSaved ? null : savedImageUrl);
  const showsImage = Boolean(draft) || (hasSavedImage && !removeSaved);

  async function handleFile(file: File | undefined) {
    // Cancelar a janela de arquivos não muda nada.
    if (!file) return;
    setError("");
    setIsChecking(true);
    try {
      const validation = await checkAccountImageFile(file);
      if (!validation.ok) {
        setError(validation.message);
        return;
      }
      onDraftChange({ file, previewUrl: URL.createObjectURL(file) });
    } catch {
      setError("Não foi possível ler o arquivo. Tente outra imagem.");
    } finally {
      setIsChecking(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove() {
    setError("");
    if (draft) {
      onDraftChange(null);
      return;
    }
    onRemoveSavedChange(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <AccountIcon option={iconOption} imageUrl={previewUrl} />
        <div className="min-w-0 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">Imagem</p>
          <p id={hintId}>
            {ACCOUNT_IMAGE_HINT} Sem imagem, vale o ícone abaixo.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          disabled={disabled || isChecking}
          aria-describedby={hintId}
          onChange={(event) => void handleFile(event.target.files?.[0])}
          className="sr-only"
        />
        <label
          htmlFor={inputId}
          className={`${buttonClass} cursor-pointer has-[:disabled]:cursor-not-allowed ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <ImagePlus size={14} aria-hidden="true" />
          {isChecking ? "Verificando..." : showsImage ? "Substituir imagem" : "Enviar imagem"}
        </label>

        {showsImage && (
          <button type="button" onClick={remove} disabled={disabled} className={buttonClass}>
            <Trash2 size={14} aria-hidden="true" />
            {draft && hasSavedImage && !removeSaved ? "Descartar nova imagem" : "Remover imagem"}
          </button>
        )}

        {removeSaved && !draft && (
          <button
            type="button"
            onClick={() => onRemoveSavedChange(false)}
            disabled={disabled}
            className={buttonClass}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Desfazer remoção
          </button>
        )}
      </div>

      {(draft || removeSaved) && !error && (
        <p role="status" className="text-xs text-slate-400">
          {draft
            ? "A nova imagem será enviada ao salvar."
            : "A imagem será removida ao salvar."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
