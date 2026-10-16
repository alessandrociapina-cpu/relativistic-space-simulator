import { useEffect } from 'react';
import { create } from 'zustand';
import { useFlightStore } from '../store/useFlightStore';
import { activeEffects, headlineEffect, type EffectId } from './explanations';

const STORAGE_KEY = 'relsim:explain';

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface ExplainSettings {
  /** Modo Explicar: um cartão a cada efeito novo e o painel de efeitos ao pausar. */
  readonly enabled: boolean;
  /** Painel de efeitos ativos, com explicações e fórmulas do instante. */
  readonly panelOpen: boolean;
  /** Efeito destacado no topo do painel (vindo do cartão). */
  readonly focus: EffectId | null;
  setEnabled: (enabled: boolean) => void;
  openPanel: (focus?: EffectId | null) => void;
  closePanel: () => void;
}

export const useExplainSettings = create<ExplainSettings>()((set) => ({
  enabled: loadEnabled(),
  panelOpen: false,
  focus: null,
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // sem armazenamento: a escolha vale só nesta sessão
    }
    set({ enabled });
    // Ligado no meio do voo, já explica o que está acontecendo agora.
    const flight = useFlightStore.getState();
    if (enabled && flight.insight === null) flight.showInsight(headlineEffect(activeEffects(flight)));
  },
  openPanel: (focus = null) => set({ panelOpen: true, focus }),
  closePanel: () => set({ panelOpen: false, focus: null }),
}));

/**
 * No modo Explicar, pausar no meio do voo abre o painel de efeitos;
 * retomar o fecha. A chegada e a troca de modo, que também param o relógio,
 * não abrem. O scrub tira o destaque vindo do cartão, que era de outro instante.
 */
export function useEffectsPanelOnPause() {
  useEffect(
    () =>
      useFlightStore.subscribe((s, prev) => {
        const explain = useExplainSettings.getState();
        if (s.playing === prev.playing) {
          if (s.tau !== prev.tau && explain.focus !== null) useExplainSettings.setState({ focus: null });
          return;
        }
        if (s.playing) {
          explain.closePanel();
          return;
        }
        const midFlight = s.tau > 0 && s.tau < s.profile.tauTotal;
        if (explain.enabled && midFlight && !explain.panelOpen) explain.openPanel();
      }),
    [],
  );
}
