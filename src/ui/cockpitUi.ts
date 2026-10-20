import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { PlannerTab } from './missionLink';

/**
 * A partir deste γ, a luz do céu inteiro à frente (a CMB quente e as estrelas) chega num cone de ~1/γ rad, bem
 * menor que um pixel do para-brisa, e o brilho difuso já passou: o para-brisa fica quase preto, com um ponto
 * no centro, e só o telescópio voltado para a frente mostra alguma coisa.
 */
export const SKY_IN_A_POINT_GAMMA = 2e4;

/** Para onde aponta o telescópio: atrás (a estrela de partida, padrão) ou à frente (o alvo). */
export type TelescopeDirection = 'rear' | 'front';

interface CockpitUi {
  /** Planejamento da missão aberto sobre o cockpit (aberto ao chegar da abertura). */
  readonly plannerOpen: boolean;
  /** Aba em que o planejamento abre ("⚙ Planejar" ou a ficção científica hard). */
  readonly plannerTab: PlannerTab;
  /** Muda a cada abertura: o planejamento recomeça o rascunho pela missão atual (a de um link, inclusive). */
  readonly plannerSession: number;
  readonly telescopeDirection: TelescopeDirection;
  /** Painel de instrumentos recolhido (só a partida e a linha do tempo). */
  readonly panelCollapsed: boolean;
  /** No celular o telescópio começa desligado e abre por uma tecla do painel. */
  readonly telescopeOpen: boolean;
  /** Nomes das estrelas e galáxias reais no telescópio. */
  readonly skyLabels: boolean;
  openPlanner: (tab?: PlannerTab) => void;
  /** Troca a aba do planejamento aberto (a barra de navegação e as próprias abas). */
  setPlannerTab: (tab: PlannerTab) => void;
  closePlanner: () => void;
  setTelescopeDirection: (direction: TelescopeDirection) => void;
  togglePanel: () => void;
  toggleTelescope: () => void;
  toggleSkyLabels: () => void;
}

export const useCockpitUi = create<CockpitUi>()((set) => ({
  plannerOpen: true,
  plannerTab: 'plan',
  plannerSession: 0,
  telescopeDirection: 'rear',
  panelCollapsed: false,
  telescopeOpen: false,
  skyLabels: true,
  openPlanner: (plannerTab = 'plan') => set((s) => ({ plannerOpen: true, plannerTab, plannerSession: s.plannerSession + 1 })),
  setPlannerTab: (plannerTab) => set({ plannerTab }),
  closePlanner: () => set({ plannerOpen: false }),
  setTelescopeDirection: (telescopeDirection) => set({ telescopeDirection }),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  toggleTelescope: () => set((s) => ({ telescopeOpen: !s.telescopeOpen })),
  toggleSkyLabels: () => set((s) => ({ skyLabels: !s.skyLabels })),
}));

/** Breakpoint `lg` do Tailwind: a partir dele, o cockpit tem as telas penduradas. */
const WIDE_QUERY = '(min-width: 1024px)';

/** A tela é larga o bastante para as telas penduradas? Acompanha a rotação do aparelho. */
export function useIsWideCockpit(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}
