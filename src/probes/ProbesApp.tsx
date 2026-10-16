import { useState } from 'react';
import { ProbeControls } from './ProbeControls';
import { ProbeEventCard, ProbeEventList } from './ProbeEvents';
import { ProbeHUD } from './ProbeHUD';
import { SolarSystemScene } from './SolarSystemScene';
import { useProbeLoop } from './useProbeStore';

/** Simulador de sondas: o Sistema Solar com as trajetórias reais do JPL Horizons. */
export function ProbesApp() {
  useProbeLoop();
  // Na tela larga a lista de eventos fica aberta; no celular, sob demanda.
  const [eventsOpen, setEventsOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none">
      <SolarSystemScene className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <header className="pointer-events-auto flex items-start justify-between gap-2 font-mono">
          <div>
            <h1 className="text-[11px] tracking-widest text-cyan-300 uppercase">Sondas · Sistema Solar</h1>
            <p className="text-[10px] text-slate-500">Trajetórias do JPL Horizons; Veneras, Mariner 10, Vikings, Magellan e Apollo reconstruídas</p>
          </div>
          <div className="flex shrink-0 gap-1.5 text-[11px]">
            <button
              type="button"
              aria-pressed={eventsOpen}
              aria-label="Eventos"
              className={`rounded-sm px-2 py-1 ${eventsOpen ? 'bg-amber-400/90 text-black' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}
              onClick={() => setEventsOpen((o) => !o)}
            >
              📅<span className="ml-1 hidden sm:inline">Eventos</span>
            </button>
            <a href="#viagem" aria-label="Viagem relativística" className="rounded-sm bg-slate-800/80 px-2 py-1 text-slate-300 hover:bg-slate-700">
              🚀<span className="ml-1 hidden sm:inline">Viagem relativística</span>
            </a>
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1 items-start justify-end gap-3">
          {eventsOpen && (
            <ProbeEventList className="pointer-events-auto absolute top-0 left-0 z-10 max-h-full w-72 overflow-y-auto max-lg:shadow-2xl" />
          )}
          <ProbeHUD className="pointer-events-auto w-full sm:w-80" />
        </div>
        <ProbeEventCard className="pointer-events-auto max-h-[40vh] w-full max-w-lg overflow-y-auto" />
        <ProbeControls className="pointer-events-auto mx-auto w-full max-w-4xl" />
      </div>
    </div>
  );
}
