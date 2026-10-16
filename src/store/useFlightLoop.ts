import { useEffect } from 'react';
import { useFlightStore } from './useFlightStore';

/**
 * Limite de tempo real por frame: absorve a volta de uma aba em segundo plano,
 * mas mantém o relógio em tempo real até ~4 FPS (aparelhos fracos).
 */
const MAX_FRAME_DT_S = 0.25;

/** Loop de tempo próprio: avança o voo a cada frame do navegador. */
export function useFlightLoop() {
  useEffect(() => {
    let last = performance.now();
    let id = requestAnimationFrame(function frame(now) {
      // O timestamp do rAF pode ser anterior ao performance.now() inicial.
      const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_FRAME_DT_S);
      last = now;
      useFlightStore.getState().tick(dt);
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, []);
}
