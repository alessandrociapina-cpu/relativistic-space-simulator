import { useEffect, useState } from 'react';
import { create } from 'zustand';

/** Para onde aponta o telescópio: atrás (o Sol, padrão) ou à frente (o alvo). */
export type TelescopeDirection = 'rear' | 'front';

interface CockpitUi {
  /** Planejamento da missão aberto sobre o cockpit (aberto ao chegar da abertura). */
  readonly plannerOpen: boolean;
  readonly telescopeDirection: TelescopeDirection;
  /** Painel de instrumentos recolhido (só a partida e a linha do tempo). */
  readonly panelCollapsed: boolean;
  /** No celular o telescópio começa desligado e abre por uma tecla do painel. */
  readonly telescopeOpen: boolean;
  openPlanner: () => void;
  closePlanner: () => void;
  setTelescopeDirection: (direction: TelescopeDirection) => void;
  togglePanel: () => void;
  toggleTelescope: () => void;
}

export const useCockpitUi = create<CockpitUi>()((set) => ({
  plannerOpen: true,
  telescopeDirection: 'rear',
  panelCollapsed: false,
  telescopeOpen: false,
  openPlanner: () => set({ plannerOpen: true }),
  closePlanner: () => set({ plannerOpen: false }),
  setTelescopeDirection: (telescopeDirection) => set({ telescopeDirection }),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  toggleTelescope: () => set((s) => ({ telescopeOpen: !s.telescopeOpen })),
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
