import { useEffect } from 'react';
import { useFlightStore } from './useFlightStore';

/** Limite de tempo real por frame (aba em segundo plano, travamentos). */
const MAX_FRAME_DT_S = 0.1;

/** Loop de tempo próprio: avança o Autopilot a cada frame do navegador. */
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
