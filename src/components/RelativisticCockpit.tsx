import { Suspense, lazy, useEffect } from 'react';
import { useFlightAudio } from '../audio/useFlightAudio';
import { useFlightLoop } from '../store/useFlightLoop';
import { useFlightStore } from '../store/useFlightStore';
import { useCockpitUi, useIsWideCockpit } from '../ui/cockpitUi';
import { useEffectsPanelOnPause } from '../ui/explainSettings';
import { parseMissionLink } from '../ui/missionLink';
import { CenterHologramProjector } from './CenterHologramProjector';
import { CockpitFrame } from './CockpitFrame';
import { InstrumentPanel } from './InstrumentPanel';
import { MainViewport } from './MainViewport';
import { MissionPlanner } from './MissionPlanner';
import { RouteMonitor } from './RouteMonitor';
import { ScriptCard, ScriptStrip } from './ScriptStory';
import { ShortcutHelp } from './ShortcutHelp';
import { TelemetryHUD } from './TelemetryHUD';
import { TelescopePIP } from './TelescopePIP';
import { useCockpitShortcuts } from './useCockpitShortcuts';

// As explicações trazem o KaTeX (JS, CSS e fontes): carregadas à parte, sem
// atrasar o primeiro quadro do cockpit.
const ExplanationCard = lazy(() => import('./ExplanationCard').then((m) => ({ default: m.ExplanationCard })));
const ActiveEffectsPanel = lazy(() => import('./ActiveEffectsPanel').then((m) => ({ default: m.ActiveEffectsPanel })));

/**
 * Cada entrada na viagem começa pelo planejamento da missão, com a missão de um link `#viagem?…`
 * carregada (também quando o link é colado com o cockpit aberto).
 */
function useMissionLink() {
  useEffect(() => {
    const apply = () => {
      const link = parseMissionLink(window.location.hash);
      if (link?.choice) useFlightStore.getState().configureMission(link.choice);
      useCockpitUi.getState().openPlanner(link?.tab);
    };
    apply();
    const onHash = () => {
      if (parseMissionLink(window.location.hash)) apply();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
}

/**
 * Cockpit da viagem relativística: o para-brisa ao fundo, o console de teto
 * com a telemetria, o telescópio e a rota pendurados, os hologramas e o painel
 * de instrumentos. O planejamento da missão abre por cima.
 */
export function RelativisticCockpit() {
  useFlightLoop();
  useFlightAudio();
  useEffectsPanelOnPause();
  useCockpitShortcuts();
  useMissionLink();
  // No celular não há telas penduradas: a rota vai para o painel e o telescópio abre por uma tecla.
  // Fora da tela, nem são montadas (um contexto WebGL a menos).
  const wide = useIsWideCockpit();
  const telescopeOpen = useCockpitUi((s) => s.telescopeOpen);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none">
      <MainViewport className="absolute inset-0" />
      <CockpitFrame />
      {/* Áreas vazias deixam o arrasto passar para o para-brisa. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <TelemetryHUD className="pointer-events-auto w-full" />
        {/* Num roteiro (Tau Zero), as fases da viagem logo abaixo do console. */}
        <ScriptStrip className="pointer-events-auto mx-2 mt-1.5 lg:mx-[max(1.5rem,6vw)]" />
        {/* Telas penduradas nos cantos; o cartão de explicação fica entre elas na tela larga
            e abaixo delas no celular. O painel de efeitos cobre esta faixa à direita. */}
        <div className="relative flex min-h-0 flex-1 flex-col gap-2 px-2 pt-3 sm:pt-4 lg:flex-row lg:items-start lg:justify-between lg:gap-4 lg:px-[max(1.5rem,6vw)]">
          {wide ? (
            <>
              <TelescopePIP className="pointer-events-auto w-[min(25vw,21rem)]" />
              <RouteMonitor className="pointer-events-auto order-last w-[min(25vw,21rem)]" />
            </>
          ) : (
            telescopeOpen && <TelescopePIP className="pointer-events-auto mx-auto w-full max-w-[20rem]" />
          )}
          {/* Num roteiro, o cartão da fase: no meio do cockpit na tela larga; no celular, uma folha por cima do painel. */}
          <ScriptCard className="pointer-events-auto select-text max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[60] max-lg:max-h-[72dvh] max-lg:rounded-b-none max-lg:pb-[env(safe-area-inset-bottom)] lg:mt-4 lg:mb-5 lg:max-h-[calc(100%-1.25rem)] lg:min-w-0 lg:max-w-lg lg:flex-1" />
          <Suspense fallback={null}>
            <ExplanationCard className="pointer-events-auto mx-auto w-full max-w-md select-text lg:mx-0 lg:mt-8 lg:min-w-0 lg:flex-1" />
            <ActiveEffectsPanel className="pointer-events-auto fixed inset-0 z-[60] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] select-text lg:absolute lg:z-30 lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[30rem] lg:rounded-md lg:border lg:border-cyan-400/30 lg:p-0" />
          </Suspense>
        </div>
        <div className="flex w-full flex-col items-center gap-1">
          <CenterHologramProjector />
          <InstrumentPanel className="pointer-events-auto w-full" />
        </div>
      </div>
      <MissionPlanner />
      <ShortcutHelp />
    </div>
  );
}
