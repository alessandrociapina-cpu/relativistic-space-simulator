import { useEffect, useState } from 'react';
import { useFlightStore } from '../store/useFlightStore';
import type { ExplainContext } from '../ui/explanations';

/** Atualizações por segundo dos textos: os números mudam a cada frame, a leitura não precisa. */
const REFRESH_MS = 250;

/**
 * Estado do voo para as explicações, no máximo a cada 250 ms (o KaTeX
 * re-renderiza cada fórmula cujo valor mudou). Montar só enquanto visível.
 */
export function useLiveExplainContext(): ExplainContext {
  const [ctx, setCtx] = useState<ExplainContext>(() => useFlightStore.getState());

  useEffect(() => {
    let last = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      timer = undefined;
      last = performance.now();
      setCtx(useFlightStore.getState());
    };
    const unsubscribe = useFlightStore.subscribe(() => {
      if (timer !== undefined) return;
      const wait = REFRESH_MS - (performance.now() - last);
      if (wait <= 0) apply();
      else timer = setTimeout(apply, wait);
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return ctx;
}
