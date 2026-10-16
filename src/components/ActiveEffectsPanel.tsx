import { useEffect } from 'react';
import type { FlightPhase } from '../physics/RelativityEngine';
import { useFlightStore } from '../store/useFlightStore';
import { useExplainSettings } from '../ui/explainSettings';
import { activeEffects, explainEffect, type EffectId, type ExplainContext } from '../ui/explanations';
import { formatDuration, formatGamma } from '../ui/format';
import { TeX } from './TeX';
import { useLiveExplainContext } from './useLiveExplainContext';

const PHASE_LABEL: Readonly<Record<FlightPhase, string>> = {
  accelerating: 'aceleração',
  coasting: 'inércia',
  decelerating: 'frenagem',
  arrived: 'chegada',
};

function EffectSection({ id, ctx, highlighted }: { id: EffectId; ctx: ExplainContext; highlighted: boolean }) {
  const { title, summary, details, formulas } = explainEffect(id, ctx);
  return (
    <article
      className={`border-b border-white/10 px-4 py-3 last:border-b-0 ${highlighted ? 'bg-amber-400/[0.07]' : ''}`}
      aria-labelledby={`effect-${id}`}
    >
      <h3 id={`effect-${id}`} className="text-sm font-semibold text-amber-200">
        {title}
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-200">{summary}</p>
      <div className="mt-2 flex flex-col gap-1.5 border-l border-cyan-400/30 pl-3">
        {formulas.map((f) => (
          <div key={f.tex}>
            <div className="overflow-x-auto overflow-y-hidden text-[13px] text-slate-100">
              <TeX tex={f.tex} />
            </div>
            {f.note && <p className="text-[11px] text-slate-400">{f.note}</p>}
          </div>
        ))}
      </div>
      {details.length > 0 && (
        <details className="group mt-2" open={highlighted}>
          <summary className="cursor-pointer text-[12px] text-cyan-300 select-none hover:text-cyan-100">
            Saiba mais
          </summary>
          {details.map((p) => (
            <p key={p} className="mt-1.5 text-[13px] leading-relaxed text-slate-300">
              {p}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}

/**
 * Painel de efeitos ativos: o que a física está fazendo neste instante, com
 * explicação e fórmulas com os valores atuais. Abre ao pausar no modo Explicar
 * (ou pelo botão "Efeitos") e acompanha o scrub da linha do tempo.
 */
export function ActiveEffectsPanel({ className = '' }: { className?: string }) {
  const open = useExplainSettings((s) => s.panelOpen);
  return open ? <EffectsPanel className={className} /> : null;
}

function EffectsPanel({ className }: { className: string }) {
  const focus = useExplainSettings((s) => s.focus);
  const closePanel = useExplainSettings((s) => s.closePanel);
  const canResume = useFlightStore(
    (s) =>
      !s.playing &&
      s.ignitionCountdownS === null &&
      s.tau > 0 &&
      s.tau < s.profile.tauTotal,
  );
  const togglePlay = useFlightStore((s) => s.togglePlay);
  const ctx = useLiveExplainContext();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel]);

  const active = activeEffects(ctx);
  const ids = focus ? [focus, ...active.filter((id) => id !== focus)] : active;
  const { flight } = ctx;

  return (
    <section
      aria-label="Efeitos ativos"
      className={`flex flex-col overflow-hidden bg-neutral-950/95 shadow-2xl backdrop-blur-md ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-cyan-400/30 px-4 py-2">
        <div className="min-w-0">
          <h2 className="font-mono text-[11px] tracking-widest text-cyan-300 uppercase">Efeitos ativos</h2>
          <p className="truncate font-mono text-[11px] text-slate-400 tabular-nums">
            τ = {formatDuration(flight.tau)} · {PHASE_LABEL[flight.phase]} · γ = {formatGamma(flight.gamma)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canResume && (
            <button
              type="button"
              className="rounded-sm bg-cyan-400/80 px-2 py-1 text-[11px] tracking-wider text-black hover:bg-cyan-300"
              onClick={togglePlay}
            >
              ▶ Retomar
            </button>
          )}
          <button
            type="button"
            aria-label="Fechar painel de efeitos"
            className="px-2 py-1 text-slate-400 hover:text-slate-100"
            onClick={closePanel}
          >
            ✕
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {ids.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-slate-400">
            Nave em repouso: nenhum efeito relativístico relevante. Dê a partida ou arraste a linha do tempo para ver
            aberração, Doppler e a CMB.
          </p>
        ) : (
          ids.map((id) => <EffectSection key={id} id={id} ctx={ctx} highlighted={id === focus} />)
        )}
        <p className="px-4 pt-1 pb-4 text-[11px] text-slate-500">
          Os valores são os deste instante: arraste a linha do tempo e as fórmulas se atualizam.
        </p>
      </div>
    </section>
  );
}
