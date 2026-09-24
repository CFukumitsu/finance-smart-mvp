"use client";

import { useCallback, useRef, useState } from "react";
import { createMutationLock } from "@/src/utils/mutationLock";

/** One lock per editing surface; no global navigation or application state. */
export function useMutation() {
  const [pending, setPending] = useState<string | null>(null);
  const [lock] = useState(() => createMutationLock(setPending));
  const errorHandler = useRef((error: unknown) => {
    console.error("Erro durante a operação:", error);
    window.alert(error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.");
  });
  const run = useCallback(async <T,>(key: string, operation: () => Promise<T>) => {
    try {
      return await lock.run(key, operation);
    } catch (error) {
      // Existing operation-specific catch blocks still take precedence.
      errorHandler.current(error);
    }
  }, [lock]);

  return { run, pending, isPending: pending !== null, isLocked: lock.isLocked };
}
