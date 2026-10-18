import { Suspense, lazy } from 'react';
import { explainEvent } from './eventExplanations';
import { MISSION_IMAGES, imageIndexNear } from './missionImages';
import { ALL_EVENTS, MISSIONS } from './missions';
import { formatDate, formatShortDate } from './time';
import { useProbeStore } from './useProbeStore';

// O KaTeX (JS, CSS e fontes) só carrega com o primeiro cartão de evento, não com o Sistema Solar.
const TeX = lazy(() => import('../components/TeX').then((m) => ({ default: m.TeX })));

/** Linha do tempo da sonda escolhida: um clique leva ao evento. */
export function ProbeEventList({ className = '' }: { className?: string }) {
  const t = useProbeStore((s) => s.t);
  const selected = useProbeStore((s) => s.selected);
  const eventId = useProbeStore((s) => s.eventId);
  const jumpToEvent = useProbeStore((s) => s.jumpToEvent);
  const mission = MISSIONS[selected];

  return (
    <nav aria-label="Eventos da missão" className={`rounded-md border border-cyan-400/30 bg-black/75 py-1.5 font-mono backdrop-blur-sm ${className}`}>
      <h2 className="px-3 pb-1 text-[10px] tracking-widest text-cyan-300 uppercase">
        Eventos · <span style={{ color: mission.color }}>{mission.name}</span>
      </h2>
      <ol>
        {mission.events.map((e) => {
          const past = e.t <= t;
          const active = e.id === eventId;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => jumpToEvent(e.id)}
                className={`flex w-full gap-2 px-3 py-1 text-left text-[11px] hover:bg-slate-800/80 ${
                  active ? 'bg-amber-400/15 text-amber-200' : past ? 'text-slate-200' : 'text-slate-500'
                }`}
              >
                <span className="w-20 shrink-0 tabular-nums">{formatShortDate(e.t)}</span>
                <span className="min-w-0">{e.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Cartão do evento: o que aconteceu, por quê, e as fórmulas com os números dos dados. */
export function ProbeEventCard({ className = '' }: { className?: string }) {
  const eventId = useProbeStore((s) => s.eventId);
  const showEvent = useProbeStore((s) => s.showEvent);
  const openGallery = useProbeStore((s) => s.openGallery);
  const event = ALL_EVENTS.find((e) => e.id === eventId);
  if (!event) return null;
  const explanation = explainEvent(event);
  const mission = MISSIONS[event.probeId];

  return (
    <aside aria-label="Explicação do evento" className={`rounded-md border border-amber-400/40 bg-black/80 px-3 py-2 shadow-lg backdrop-blur-sm select-text ${className}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[9px] tracking-widest uppercase" style={{ color: mission.color }}>
            {mission.name} · {formatDate(event.t)}
          </div>
          <h2 aria-live="polite" className="text-sm leading-tight font-semibold text-amber-100">
            {explanation.title}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Fechar explicação"
          className="-mt-0.5 -mr-1 shrink-0 px-1 text-slate-400 hover:text-slate-100"
          onClick={() => showEvent(null)}
        >
          ✕
        </button>
      </header>
      <p className="mt-1 text-[13px] leading-snug text-slate-200">{explanation.summary}</p>
      <div className="mt-1.5 flex flex-col gap-1 border-l border-cyan-400/30 pl-3">
        {explanation.formulas.map((f) => (
          <div key={f.tex}>
            <div className="overflow-x-auto overflow-y-hidden text-[13px] text-slate-100">
              <Suspense fallback={<span className="text-slate-500">…</span>}>
                <TeX tex={f.tex} />
              </Suspense>
            </div>
            {f.note && <p className="text-[11px] text-slate-400">{f.note}</p>}
          </div>
        ))}
      </div>
      {MISSION_IMAGES[event.probeId].length > 0 && (
        <button
          type="button"
          onClick={() => openGallery(event.probeId, imageIndexNear(event.probeId, event.t))}
          className="mt-1.5 rounded-sm border border-amber-300/60 bg-amber-400/10 px-2 py-0.5 text-[12px] text-amber-100 hover:bg-amber-400/25"
        >
          📷 Ver as imagens da {mission.name}
        </button>
      )}
      {explanation.details.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[12px] text-cyan-300 select-none hover:text-cyan-100">Saiba mais</summary>
          {explanation.details.map((p) => (
            <p key={p} className="mt-1.5 text-[13px] leading-relaxed text-slate-300">
              {p}
            </p>
          ))}
        </details>
      )}
    </aside>
  );
}
