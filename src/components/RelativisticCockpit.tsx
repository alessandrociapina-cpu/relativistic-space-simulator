import { Suspense, lazy } from 'react';
import { useFlightAudio } from '../audio/useFlightAudio';
import { useFlightLoop } from '../store/useFlightLoop';
import { useEffectsPanelOnPause } from '../ui/explainSettings';
import { CenterHologramProjector } from './CenterHologramProjector';
import { FlightControls } from './FlightControls';
import { MainViewport } from './MainViewport';
import { RouteMapAndRearMonitor } from './RouteMapAndRearMonitor';
import { TelemetryHUD } from './TelemetryHUD';
import { TelescopePIP } from './TelescopePIP';

// As explicações trazem o KaTeX (JS, CSS e fontes): carregadas à parte, sem
// atrasar o primeiro quadro do cockpit.
const ExplanationCard = lazy(() => import('./ExplanationCard').then((m) => ({ default: m.ExplanationCard })));
const ActiveEffectsPanel = lazy(() => import('./ActiveEffectsPanel').then((m) => ({ default: m.ActiveEffectsPanel })));

/** Cockpit da viagem relativística: para-brisa, monitores, hologramas e controles de voo. */
export function RelativisticCockpit() {
  useFlightLoop();
  useFlightAudio();
  useEffectsPanelOnPause();

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none">
      <MainViewport className="absolute inset-0" />
      {/* Áreas vazias deixam o arrasto passar para o para-brisa. O padding respeita
          entalhe e barra de gestos quando o PWA roda em tela cheia. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <TelemetryHUD className="pointer-events-auto mx-auto w-full max-w-4xl" />
        {/* Monitores nos cantos; o cartão de explicação fica entre eles na tela larga
            e abaixo deles no celular. O painel de efeitos cobre esta faixa à direita. */}
        <div className="relative flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-3">
          <div className="flex items-start justify-between gap-3 lg:contents">
            <TelescopePIP className="pointer-events-auto w-[44%] max-w-xs" />
            <RouteMapAndRearMonitor className="pointer-events-auto w-[44%] max-w-xs lg:order-last" />
          </div>
          <Suspense fallback={null}>
            <ExplanationCard className="pointer-events-auto mx-auto w-full max-w-md select-text lg:mx-0 lg:min-w-0 lg:flex-1" />
            <ActiveEffectsPanel className="pointer-events-auto fixed inset-0 z-30 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] select-text lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[30rem] lg:rounded-md lg:border lg:border-cyan-400/30 lg:p-0" />
          </Suspense>
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-1">
          <CenterHologramProjector />
          <FlightControls className="pointer-events-auto w-full" />
        </div>
      </div>
    </div>
  );
}
