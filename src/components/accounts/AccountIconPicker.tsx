"use client";

import AccountIcon from "@/src/components/accounts/AccountIcon";
import {
  ACCOUNT_ICON_OPTIONS,
  type AccountIconOption,
} from "@/src/utils/accountShortcuts";

type AccountIconPickerProps = {
  /** Chave salva; "" = automático (ícone genérico pelo cadastro). */
  value: string;
  /** Ícone usado quando o valor é automático. */
  automaticOption: AccountIconOption;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const GROUPS = [
  { id: "generic", label: "Genéricos" },
  { id: "institution", label: "Instituições (iniciais, sem logotipo)" },
] as const;

function IconChoice({
  value,
  label,
  option,
  checked,
  disabled,
  onSelect,
}: {
  value: string;
  label: string;
  option: AccountIconOption;
  checked: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <label
      title={label}
      className={`flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-blue-500/60 ${
        checked
          ? "border-blue-500/60 bg-blue-500/10"
          : "border-white/10 hover:bg-white/5"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="account-icon"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <AccountIcon option={option} size="sm" />
      <span className="w-full truncate text-[11px] text-slate-300">{label}</span>
    </label>
  );
}

/** Seletor visual de ícone. A escolha é só visual e não altera regras financeiras. */
export default function AccountIconPicker({
  value,
  automaticOption,
  onChange,
  disabled,
}: AccountIconPickerProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">Ícone</legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        <IconChoice
          value=""
          label="Automático"
          option={automaticOption}
          checked={value === ""}
          disabled={disabled}
          onSelect={onChange}
        />
      </div>

      {GROUPS.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400">{group.label}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {ACCOUNT_ICON_OPTIONS.filter((option) => option.group === group.id).map((option) => (
              <IconChoice
                key={option.key}
                value={option.key}
                label={option.label}
                option={option}
                checked={value === option.key}
                disabled={disabled}
                onSelect={onChange}
              />
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
