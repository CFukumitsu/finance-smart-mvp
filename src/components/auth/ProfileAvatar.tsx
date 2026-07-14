/* eslint-disable @next/next/no-img-element */
import { getInitials } from "@/src/utils/identity";

export default function ProfileAvatar({ src, name, email, size = "md" }: { src?: string | null; name: string; email?: string | null; size?: "sm" | "md" | "lg" }) {
  const classes = size === "lg" ? "h-24 w-24 text-2xl" : size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  if (src) {
    return <img src={src} alt={`Foto de ${name || "usuário"}`} referrerPolicy="no-referrer" className={`${classes} shrink-0 rounded-full border border-white/10 object-cover`} />;
  }
  return <div aria-label={`Iniciais de ${name || "usuário"}`} className={`${classes} flex shrink-0 items-center justify-center rounded-full bg-blue-600/20 font-bold text-blue-200`}>{getInitials(name, email)}</div>;
}
