"use client";

import { useState } from "react";
import {
  Banknote,
  ChartCandlestick,
  Coins,
  CreditCard,
  DollarSign,
  Euro,
  Globe,
  Landmark,
  PiggyBank,
  PoundSterling,
  TrendingUp,
  Vault,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type {
  AccountIconGlyph,
  AccountIconOption,
  AccountIconTone,
} from "@/src/utils/accountShortcuts";

const GLYPHS: Record<AccountIconGlyph, LucideIcon> = {
  bank: Landmark,
  card: CreditCard,
  wallet: Wallet,
  cash: Banknote,
  investment: TrendingUp,
  savings: PiggyBank,
  broker: ChartCandlestick,
  vault: Vault,
  foreign: Globe,
  dollar: DollarSign,
  euro: Euro,
  pound: PoundSterling,
  coins: Coins,
};

// Classes literais para o Tailwind. Gradiente com texto quase branco mantém o
// mesmo contraste nos temas claro e escuro (text-slate-50, e não text-white,
// porque o tema claro escurece text-white dentro das telas).
const TONES: Record<AccountIconTone, string> = {
  blue: "from-blue-500 to-blue-700",
  sky: "from-sky-500 to-sky-700",
  indigo: "from-indigo-500 to-indigo-700",
  violet: "from-violet-500 to-violet-700",
  purple: "from-purple-500 to-purple-700",
  pink: "from-pink-500 to-pink-700",
  red: "from-red-500 to-red-700",
  orange: "from-orange-500 to-orange-700",
  amber: "from-amber-500 to-amber-700",
  yellow: "from-yellow-500 to-yellow-700",
  lime: "from-lime-500 to-lime-700",
  green: "from-green-500 to-green-700",
  emerald: "from-emerald-500 to-emerald-700",
  teal: "from-teal-500 to-teal-700",
  cyan: "from-cyan-500 to-cyan-700",
  slate: "from-slate-500 to-slate-700",
};

const SIZES = {
  sm: { box: "h-7 w-7 rounded-lg", glyph: 14, text: "text-[10px]" },
  md: { box: "h-9 w-9 rounded-xl", glyph: 18, text: "text-xs" },
} as const;

type AccountIconProps = {
  option: AccountIconOption;
  size?: keyof typeof SIZES;
  /** Imagem enviada (URL assinada ou pré-visualização); tem prioridade sobre o ícone. */
  imageUrl?: string | null;
};

/**
 * Ícone decorativo da conta/cartão; o nome acessível fica no texto ao lado.
 * Ordem: imagem enviada → ícone escolhido → ícone automático (option já
 * resolvido por resolveAccountIcon). Imagem que não carrega volta ao ícone.
 */
export default function AccountIcon({ option, size = "md", imageUrl }: AccountIconProps) {
  const sizing = SIZES[size];
  const Glyph = option.glyph ? GLYPHS[option.glyph] : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-slate-50 ${sizing.box} shadow-sm ring-1 ring-inset ring-slate-500/20`}
      >
        {/* URL assinada e temporária de bucket privado (ou blob local da
            pré-visualização): next/image exigiria liberar o domínio do
            Storage na configuração e não traz ganho em ícones de 28–36 px. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          onError={() => setFailedUrl(imageUrl)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center bg-linear-to-br ${TONES[option.tone]} ${sizing.box} font-bold leading-none tracking-tight text-slate-50 shadow-sm ring-1 ring-inset ring-white/15`}
    >
      {Glyph ? (
        <Glyph size={sizing.glyph} strokeWidth={2.25} />
      ) : (
        <span className={sizing.text}>{option.monogram}</span>
      )}
    </span>
  );
}
