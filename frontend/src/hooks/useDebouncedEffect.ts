import { useEffect } from "react";

export function useDebouncedEffect(effect: () => void | (() => void), deps: any[], delayMs: number) {
  useEffect(() => {
    const t = setTimeout(() => {
      effect();
    }, delayMs);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs]);
}
