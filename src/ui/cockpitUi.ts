import { create } from 'zustand';

/** Para onde aponta o telescópio: atrás (o Sol, padrão) ou à frente (o alvo). */
export type TelescopeDirection = 'rear' | 'front';

interface CockpitUi {
  /** Planejamento da missão aberto sobre o cockpit (aberto ao chegar da abertura). */
  readonly plannerOpen: boolean;
  readonly telescopeDirection: TelescopeDirection;
  /** Painel de instrumentos recolhido (só a partida e a linha do tempo). */
  readonly panelCollapsed: boolean;
  openPlanner: () => void;
  closePlanner: () => void;
  setTelescopeDirection: (direction: TelescopeDirection) => void;
  togglePanel: () => void;
}

export const useCockpitUi = create<CockpitUi>()((set) => ({
  plannerOpen: true,
  telescopeDirection: 'rear',
  panelCollapsed: false,
  openPlanner: () => set({ plannerOpen: true }),
  closePlanner: () => set({ plannerOpen: false }),
  setTelescopeDirection: (telescopeDirection) => set({ telescopeDirection }),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
}));
