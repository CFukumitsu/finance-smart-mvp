import { useEffect } from "react";

type ModalShortcutOptions = {
  enabled: boolean;
  onEscape?: () => void;
  onEnter?: () => void;
};

export function useModalShortcuts({
  enabled,
  onEscape,
  onEnter,
}: ModalShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (event.key === "Escape") {
        event.preventDefault();
        onEscape?.();
        return;
      }

      if (event.key === "Enter") {
        if (tagName === "textarea") return;

        event.preventDefault();
        onEnter?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, onEscape, onEnter]);
}