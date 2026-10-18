import { useEffect } from 'react';
import { create } from 'zustand';
import { useAudioSettings } from '../audio/audioSettings';
import { engineCommandAt } from '../physics/maneuvers';
import { adjacentTimeScale, naturalTimeScale } from '../store/timeScales';
import { useFlightStore } from '../store/useFlightStore';
import { useCockpitUi } from '../ui/cockpitUi';
import { useExplainSettings } from '../ui/explainSettings';

/** Os atalhos do cockpit, na ordem da janela de ajuda (tecla exibida e o que faz). */
export const COCKPIT_SHORTCUTS: readonly { readonly keys: string; readonly action: string }[] = [
  { keys: 'Espaço', action: 'Partida, pausa ou retomada' },
  { keys: '← →', action: 'Tempo de bordo por segundo: mais devagar ou mais depressa' },
  { keys: 'N', action: 'Ritmo natural da missão (a viagem em ~10 min)' },
  { keys: 'M', action: 'Desligar ou religar o motor' },
  { keys: 'T', action: 'Telescópio: atrás ou à frente (no celular, abre e fecha)' },
  { keys: 'E', action: 'Modo Explicar' },
  { keys: 'F', action: 'Painel de efeitos ativos' },
  { keys: 'S', action: 'Som' },
  { keys: 'P', action: 'Planejamento da missão' },
  { keys: '?', action: 'Esta ajuda' },
];

/** Janela de ajuda dos atalhos (abre com "?"). */
export const useShortcutHelp = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Um campo de texto com o foco: as teclas são do campo (controles deslizantes e caixas de marcar, não). */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    (target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(target.type)));

/** Atalhos de teclado do cockpit; desligados enquanto o planejamento está aberto ou um campo tem o foco. */
export function useCockpitShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || useCockpitUi.getState().plannerOpen) return;
      const help = useShortcutHelp.getState();
      if (help.open) {
        if (e.key === 'Escape' || e.key === '?') help.setOpen(false);
        return;
      }
      const flight = useFlightStore.getState();
      const ui = useCockpitUi.getState();
      const explain = useExplainSettings.getState();
      // Setas repetem com a tecla presa; as demais teclas são interruptores e agem uma vez.
      if (e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      switch (e.key) {
        case ' ':
          flight.togglePlay();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          flight.setTimeScale(adjacentTimeScale(flight.timeScale, e.key === 'ArrowLeft' ? -1 : 1));
          break;
        case 'n':
        case 'N':
          flight.setTimeScale(naturalTimeScale(flight.profile));
          break;
        case 'm':
        case 'M':
          if (flight.ignitionCountdownS === null && engineCommandAt(flight.profile, flight.tau)) flight.toggleEngine();
          break;
        case 't':
        case 'T':
          if (window.matchMedia('(min-width: 1024px)').matches) {
            ui.setTelescopeDirection(ui.telescopeDirection === 'rear' ? 'front' : 'rear');
          } else ui.toggleTelescope();
          break;
        case 'e':
        case 'E':
          explain.setEnabled(!explain.enabled);
          break;
        case 'f':
        case 'F':
          if (explain.panelOpen) explain.closePanel();
          else explain.openPanel();
          break;
        case 's':
        case 'S':
          useAudioSettings.getState().toggle();
          break;
        case 'p':
        case 'P':
          ui.openPlanner();
          break;
        case '?':
          help.setOpen(true);
          break;
        default:
          return;
      }
      // Espaço não rola a página nem aperta o último botão clicado; as setas não movem um controle deslizante.
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
