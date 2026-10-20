import { useState, type ReactNode } from 'react';
import { computeFlightState } from '../physics/RelativityEngine';
import {
  MISSION_SCRIPTS,
  beatText,
  phaseIndexAt,
  type PhaseTiming,
  type ScriptBeat,
  type ScriptId,
  type ScriptPhase,
} from '../physics/missionScripts';
import { useFlightStore } from '../store/useFlightStore';
import { bowRadiation, gasDensityOnRoute } from '../sky/interstellarGas';
import { useCockpitUi } from '../ui/cockpitUi';
import { formatAccelG, formatDistance, formatEnergyEv, formatGamma, formatProse, formatScientific, formatSpan } from '../ui/format';

/** Cor de cada tipo de fase: acelerando (verde a ciano), motor desligado (azul), freando (violeta). */
function phaseTone(phase: ScriptPhase): { chip: string; bar: string; text: string } {
  if (phase.accelG < 0) return { chip: 'border-violet-300/70 bg-violet-500/20', bar: 'bg-violet-300', text: 'text-violet-100' };
  if (phase.accelG === 0) return { chip: 'border-sky-300/70 bg-sky-500/20', bar: 'bg-sky-300', text: 'text-sky-100' };
  if (phase.accelG >= 10) return { chip: 'border-orange-300/70 bg-orange-500/20', bar: 'bg-orange-300', text: 'text-orange-100' };
  return { chip: 'border-emerald-300/70 bg-emerald-500/15', bar: 'bg-emerald-300', text: 'text-emerald-100' };
}

/** O roteiro da missão em curso e a fase do instante (`null` sem roteiro). */
function useScript() {
  const plan = useFlightStore((s) => s.profile.script ?? null);
  const index = useFlightStore((s) => (s.profile.script ? phaseIndexAt(s.profile.script, s.tau) : 0));
  const arrived = useFlightStore((s) => s.flight.phase === 'arrived');
  return plan && { plan, script: MISSION_SCRIPTS[plan.id], index, arrived };
}

/** Quanto da fase em curso já passou (0 a 1). */
const useProgress = (timing: PhaseTiming) =>
  useFlightStore((s) => Math.min(Math.max((s.tau - timing.startTau) / (timing.endTau - timing.startTau), 0), 1));

function StepChip({ phase, timing, n, state }: { phase: ScriptPhase; timing: PhaseTiming; n: number; state: 'done' | 'now' | 'next' }) {
  const goToBeat = useFlightStore((s) => s.goToBeat);
  const progress = useProgress(timing);
  const tone = phaseTone(phase);
  return (
    <li className="min-w-0 flex-1">
      <button
        type="button"
        onClick={() => goToBeat(phase.id)}
        title={`${phase.title}: ${phase.summary} (ir para o começo da fase)`}
        aria-current={state === 'now' ? 'step' : undefined}
        className={`relative flex w-full min-w-0 flex-col overflow-hidden rounded-md border px-2 py-1 text-left transition-colors ${
          state === 'now'
            ? `${tone.chip} shadow-[0_0_14px_rgba(255,255,255,0.12)]`
            : state === 'done'
              ? 'border-slate-600/60 bg-slate-900/70 text-slate-400 hover:border-slate-400'
              : 'border-slate-700/70 bg-black/50 text-slate-400 hover:border-slate-500'
        }`}
      >
        <span className="flex min-w-0 items-baseline gap-1 text-[9px] leading-tight">
          <span className={`font-display font-bold ${state === 'now' ? tone.text : ''}`}>{state === 'done' ? '✓' : n}</span>
          <span className={`truncate opacity-80 ${state === 'now' ? tone.text : ''}`}>{phase.badge}</span>
        </span>
        <span className={`truncate text-[11px] leading-tight ${state === 'now' ? 'font-semibold text-white' : ''}`}>{phase.title}</span>
        {state === 'now' && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-black/40">
            <span className={`block h-full ${tone.bar}`} style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * Faixa de etapas de um roteiro (§4.2.11): as fases em ordem, a atual em destaque com o progresso, e a
 * chegada. Um toque leva ao começo da fase, com o cartão dela. No celular, só a fase atual, com ◀ ▶.
 */
export function ScriptStrip({ className = '' }: { className?: string }) {
  const current = useScript();
  const goToBeat = useFlightStore((s) => s.goToBeat);
  const showBeat = useFlightStore((s) => s.showBeat);
  if (!current) return null;
  const { plan, script, index, arrived } = current;
  const phase = script.phases[index]!;
  const total = script.phases.length;
  const stateOf = (i: number) => (arrived || i < index ? 'done' : i === index ? 'now' : 'next');
  const go = (i: number) => (i >= total ? goToBeat('arrival') : goToBeat(script.phases[Math.max(i, 0)]!.id));
  return (
    <nav aria-label={`Fases do roteiro: ${script.title}`} className={`font-mono ${className}`}>
      {/* Tela larga: todas as fases. */}
      <ol className="hidden items-stretch gap-1 md:flex">
        {script.phases.map((p, i) => (
          <StepChip key={p.id} phase={p} timing={plan.phases[i]!} n={i + 1} state={stateOf(i)} />
        ))}
        <li className="min-w-0 flex-[0.8]">
          <button
            type="button"
            onClick={() => goToBeat('arrival')}
            title={script.arrival.summary}
            aria-current={arrived ? 'step' : undefined}
            className={`flex h-full w-full min-w-0 flex-col rounded-md border px-2 py-1 text-left ${
              arrived ? 'border-slate-200/70 bg-slate-500/25 text-white' : 'border-slate-700/70 bg-black/50 text-slate-400 hover:border-slate-500'
            }`}
          >
            <span className="font-display text-[8px] tracking-[0.18em] uppercase">⦿ parada</span>
            <span className="truncate text-[11px] leading-tight">{script.arrival.title}</span>
          </button>
        </li>
      </ol>
      {/* Celular: a fase atual, com as vizinhas pelas setas. */}
      <div className="flex items-stretch gap-1 md:hidden">
        <button
          type="button"
          aria-label="Fase anterior"
          disabled={index === 0 && !arrived}
          onClick={() => go(arrived ? total - 1 : index - 1)}
          className="rounded-md border border-slate-600/70 bg-slate-900/80 px-2 text-xs text-slate-200 disabled:opacity-40"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => showBeat(arrived ? 'arrival' : phase.id)}
          className={`flex min-w-0 flex-1 flex-col rounded-md border px-2 py-1 text-left ${arrived ? 'border-slate-200/70 bg-slate-500/25' : phaseTone(phase).chip}`}
        >
          <span className="truncate text-[9px] text-slate-300">
            {arrived ? 'Chegada' : `Fase ${index + 1} de ${total} · ${phase.badge}`}
          </span>
          <span className="truncate text-[12px] leading-tight font-semibold text-white">{arrived ? script.arrival.title : phase.title}</span>
        </button>
        <button
          type="button"
          aria-label="Próxima fase"
          disabled={arrived}
          onClick={() => go(index + 1)}
          className="rounded-md border border-slate-600/70 bg-slate-900/80 px-2 text-xs text-slate-200 disabled:opacity-40"
        >
          ▶
        </button>
      </div>
    </nav>
  );
}

interface FactItem {
  readonly label: string;
  /** Símbolo grego fora do `uppercase` (que transformaria γ em Γ). */
  readonly symbol?: string;
  readonly value: string;
  /** Ocupa duas colunas (valores longos, como "33,5 → 1,45 × 10⁸"). */
  readonly wide?: boolean;
}

function Fact({ label, symbol, value, wide = false }: FactItem) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <div className="truncate text-[9px] tracking-widest text-slate-400">
        <span className="uppercase">{label}</span>
        {symbol && <span className="ml-1 tracking-normal text-slate-300">{symbol}</span>}
      </div>
      <div className="font-readout truncate text-[13px] text-slate-100 tabular-nums">{value}</div>
    </div>
  );
}

/** Densidades de 1 a 10⁻⁷ átomo/cm³: "1,03", "0,0130", "2,60 × 10⁻⁷". */
const densityText = (n: number) => `${n >= 1e-3 ? formatProse(n) : formatScientific(n)} átomo/cm³`;

function Paragraph({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-[9px] tracking-[0.25em] text-cyan-300/80 uppercase">{title}</h3>
      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-200">{children}</p>
    </div>
  );
}

/** Os números de um passo: a fase inteira (bordo, Terra, percurso, γ) ou o instante do marco e da chegada. */
function useBeatFacts(beat: ScriptBeat): FactItem[] {
  const profile = useFlightStore((s) => s.profile);
  const origin = useFlightStore((s) => s.origin);
  const destination = useFlightStore((s) => s.destination);
  // "Na Terra", "Em Erid".
  const home = origin.inHome.charAt(0).toUpperCase() + origin.inHome.slice(1);
  const flight = computeFlightState(profile, beat.tau);
  const gas = gasDensityOnRoute(origin, destination, flight.positionM);
  const bow = bowRadiation(flight.eta, gas);
  const gasFacts = [
    { label: 'Gás no caminho', value: densityText(gas) },
    ...(flight.eta > 0.01
      ? [
          { label: 'Cada próton na proa', value: formatEnergyEv(bow.protonEv) },
          { label: 'Potência na proa', value: `${formatScientific(bow.powerWm2)} W/m²` },
        ]
      : []),
  ];
  const timing = beat.kind === 'phase' ? profile.script!.phases.find((p) => p.id === beat.id) : undefined;
  if (timing) {
    const phase = MISSION_SCRIPTS[profile.script!.id].phases.find((p) => p.id === beat.id)!;
    return [
      { label: 'Aceleração', value: phase.accelG === 0 ? 'motor desligado' : `${formatAccelG(Math.abs(phase.accelG))}${phase.accelG < 0 ? ' (freando)' : ''}` },
      { label: 'A bordo', value: formatSpan(timing.endTau - timing.startTau) },
      { label: home, value: formatSpan(timing.earth1 - timing.earth0) },
      { label: 'Percurso', value: formatDistance(timing.x1 - timing.x0) },
      { label: 'Lorentz', symbol: 'γ (começo → fim)', value: `${formatGamma(Math.cosh(timing.eta0))} → ${formatGamma(Math.cosh(timing.eta1))}`, wide: true },
      ...gasFacts,
    ];
  }
  return [
    { label: 'Tempo de bordo', value: formatSpan(flight.tau) },
    { label: home, value: formatSpan(flight.earthTimeS) },
    { label: 'Distância percorrida', value: formatDistance(flight.positionM) },
    { label: 'Lorentz', symbol: 'γ', value: formatGamma(flight.gamma) },
    ...gasFacts,
  ];
}

/**
 * Cartão da história de um roteiro (§4.2.11): o passo em que o voo parou (o começo de uma fase, um marco ou
 * a chegada), com o que acontece, na obra e na física, e os números da fase. "Continuar" retoma o voo.
 */
export function ScriptCard({ className = '' }: { className?: string }) {
  const beat = useFlightStore((s) => s.beat);
  const plan = useFlightStore((s) => s.profile.script ?? null);
  // Com o planejamento aberto, o cartão espera (no celular, a folha cobriria o embarque).
  const plannerOpen = useCockpitUi((s) => s.plannerOpen);
  if (!beat || !plan || plannerOpen) return null;
  return <BeatCard key={beat.id} beat={beat} scriptId={plan.id} className={className} />;
}

function BeatCard({ beat, scriptId, className }: { beat: ScriptBeat; scriptId: ScriptId; className: string }) {
  const script = MISSION_SCRIPTS[scriptId];
  const text = beatText(script, beat);
  const facts = useBeatFacts(beat);
  const tau = useFlightStore((s) => s.tau);
  const playing = useFlightStore((s) => s.playing);
  const countingDown = useFlightStore((s) => s.ignitionCountdownS !== null);
  const tauTotal = useFlightStore((s) => s.profile.tauTotal);
  const pauseAtBeats = useFlightStore((s) => s.pauseAtBeats);
  const setPauseAtBeats = useFlightStore((s) => s.setPauseAtBeats);
  const togglePlay = useFlightStore((s) => s.togglePlay);
  const showBeat = useFlightStore((s) => s.showBeat);
  // No celular, a obra e a física abrem num toque; na tela larga, ficam à vista.
  const [more, setMore] = useState(false);
  const phaseNumber = beat.kind === 'phase' ? script.phases.findIndex((p) => p.id === beat.id) + 1 : 0;
  const kicker =
    beat.kind === 'phase'
      ? `Fase ${phaseNumber} de ${script.phases.length}`
      : beat.kind === 'milestone'
        ? 'No caminho'
        : 'Fim da viagem';
  const action = tau <= 0 ? '▶ Partida' : tau >= tauTotal ? '↺ Repetir a viagem' : '▶ Continuar';
  return (
    <aside
      aria-label={`${script.title}: ${text.title}`}
      className={`flex min-h-0 flex-col rounded-md border border-violet-300/50 bg-black/80 shadow-lg shadow-black/60 backdrop-blur-sm ${className}`}
    >
      <header className="flex items-start justify-between gap-2 px-3 pt-2">
        <div className="min-w-0">
          <div className="font-mono text-[9px] tracking-widest text-violet-300/90 uppercase">
            📚 Tau Zero · {kicker}
          </div>
          <h2 aria-live="polite" className="font-display text-[15px] leading-tight font-bold tracking-wide text-white">
            {text.title}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Fechar o cartão da fase"
          className="-mr-1 shrink-0 px-1 text-slate-400 hover:text-slate-100"
          onClick={() => showBeat(null)}
        >
          ✕
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto px-3 pb-2">
        <p className="mt-1 text-[13px] leading-snug font-semibold text-violet-50">{text.summary}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 sm:grid-cols-3">
          {facts.map((f) => (
            <Fact key={f.label} {...f} />
          ))}
        </div>
        <button
          type="button"
          className="mt-2 text-[12px] text-cyan-300 hover:text-cyan-100 lg:hidden"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
        >
          {more ? '▴ Menos' : '▾ Na obra e a física'}
        </button>
        <div className={`mt-2 flex-col gap-2 ${more ? 'flex' : 'hidden lg:flex'}`}>
          <Paragraph title="Na obra">{text.story}</Paragraph>
          <Paragraph title="A física">{text.physics}</Paragraph>
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300" title="Pausar o voo no começo de cada fase e em cada marco, com este cartão">
          <input type="checkbox" className="accent-violet-400" checked={pauseAtBeats} onChange={(e) => setPauseAtBeats(e.target.checked)} />
          Pausar em cada fase
        </label>
        {!playing && !countingDown && (
          <button
            type="button"
            onClick={togglePlay}
            className="font-display rounded-md border border-violet-300/70 bg-violet-500/25 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-violet-50 uppercase hover:bg-violet-500/40"
          >
            {action}
          </button>
        )}
      </footer>
    </aside>
  );
}

/** O resumo da fase em curso para o console: "fase 4 · a fuga a 10 g". */
export function useScriptPhaseLabel(): string | null {
  return useFlightStore((s) => {
    const plan = s.profile.script;
    if (!plan) return null;
    const script = MISSION_SCRIPTS[plan.id];
    if (s.flight.phase === 'arrived') return script.arrival.title.toLowerCase();
    const i = phaseIndexAt(plan, s.tau);
    return `fase ${i + 1} · ${script.phases[i]!.title.toLowerCase()}`;
  });
}
