import { ProbeControls } from './ProbeControls';
import { ProbeEventCard, ProbeEventList } from './ProbeEvents';
import { ProbeHUD } from './ProbeHUD';
import { SolarSystemScene } from './SolarSystemScene';
import { useProbeLoop, useProbeStore } from './useProbeStore';

/** Simulador de sondas: o Sistema Solar com as trajetórias reais do JPL Horizons. */
export function ProbesApp() {
  useProbeLoop();
  // A lista de eventos abre pelo botão "📅 Eventos" do painel (aberta de saída na tela larga).
  const eventsOpen = useProbeStore((s) => s.eventsOpen);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none">
      <SolarSystemScene className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 pt-3 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <div className="relative flex min-h-0 flex-1 items-start justify-end gap-3">
          {/* Ao lado do painel a partir do tablet; no celular, por cima dele e da cena (fecha ao escolher um evento). */}
          {eventsOpen && (
            <ProbeEventList className="pointer-events-auto absolute top-0 z-30 max-h-full overflow-y-auto shadow-2xl max-sm:inset-x-0 sm:left-0 sm:w-72 lg:shadow-none" />
          )}
          <ProbeHUD className="pointer-events-auto w-full sm:w-80" />
        </div>
        <ProbeEventCard className="pointer-events-auto max-h-[40vh] w-full max-w-lg overflow-y-auto" />
        <ProbeControls className="pointer-events-auto mx-auto w-full max-w-4xl" />
      </div>
    </div>
  );
}
