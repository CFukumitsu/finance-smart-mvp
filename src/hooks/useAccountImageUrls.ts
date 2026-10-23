"use client";

import { useEffect, useState } from "react";
import { createAccountImageUrls } from "@/src/services/accountImageService";

/**
 * URLs assinadas das imagens de contas (bucket privado), por caminho. Sem
 * imagem ou com falha, o mapa fica sem a entrada e a tela usa o ícone.
 */
export function useAccountImageUrls(paths: (string | null | undefined)[]) {
  const key = [...new Set(paths.filter((path): path is string => Boolean(path)))]
    .sort()
    .join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    createAccountImageUrls(key.split("|"))
      .then((result) => {
        if (!cancelled) setUrls((current) => ({ ...current, ...result }));
      })
      .catch((error) => {
        if (!cancelled) console.error("Erro ao carregar imagens das contas:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}
