import type { ReactNode } from 'react';
import { useAudioSettings } from '../audio/audioSettings';
import { log10GammaFromRapidity } from '../physics/RelativityEngine';
import { assessMission } from '../physics/accelerationPresets';
import { CMB_VISIBLE_GAMMA, activeWindowsAt } from '../physics/criticalEvents';
import { adjacentTimeScale, naturalTimeScale, timeScaleStep } from '../store/timeScales';
import { useFlightStore } from '../store/useFlightStore';
import { APP_HASH } from '../ui/appMode';
import { useCockpitUi } from '../ui/cockpitUi';
import { useExplainSettings } from '../ui/explainSettings';
import { formatAccelG, formatDuration, formatGamma, formatSpan } from '../ui/format';

/** Rótulo gravado na chapa do painel. */
function Plate({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-display text-[8px] tracking-[0.22em] text-slate-400 uppercase sm:text-[9px] ${className}`}>
      {children}
    </div>
  );
}

/** Tecla de hardware com LED: acesa quando ligada. */
function KeySwitch({
  on,
  label,
  icon,
  title,
  onClick,
}: {
  on: boolean;
  label: string;
  icon: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={title}
      onClick={onClick}
      className="flex min-w-0 flex-col items-center gap-0.5 rounded-md border border-slate-600/70 bg-gradient-to-b from-slate-700/80 to-slate-900 px-2 py-1 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:from-slate-600"
    >
      <span
        aria-hidden
        className={`h-1 w-5 rounded-full ${on ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)]' : 'bg-slate-600'}`}
      />
      <span className="text-sm leading-none">{icon}</span>
      <span className="font-display text-[8px] tracking-[0.12em] uppercase">{label}</span>
    </button>
  );
}

// ── Missão ───────────────────────────────────────────────────────────────────
function MissionPlate() {
  const destination = useFlightStore((s) => s.destination);
  const accelG = useFlightStore((s) => s.accelG);
  const crew = useFlightStore((s) => s.crew);
  const profile = useFlightStore((s) => s.profile);
  const openPlanner = useCockpitUi((s) => s.openPlanner);
  const viability = assessMission(crew, accelG, profile).viability;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Plate className="max-lg:hidden">Missão</Plate>
      <div className="instrument-well min-w-0 rounded-md px-2 py-1.5 max-lg:hidden">
        <div className="font-display truncate text-[11px] font-bold tracking-wider text-cyan-50">{destination.name}</div>
        <div className="font-readout truncate text-[11px] text-cyan-200">
          α {formatAccelG(accelG)} · {profile.coastEta === null ? 'acelerar e frear' : 'com cruzeiro'}
        </div>
        <div className="truncate text-[11px] text-slate-300">
          {crew === 'crewed' ? '🧑‍🚀 Piloto humano' : '🤖 Sonda robótica'}
          {viability === 'hypothetical' && <span className="text-rose-300"> · hipotética</span>}
          {viability === 'over-limit' && <span className="text-amber-300"> · além do limite humano</span>}
        </div>
        <div className="font-readout truncate text-[10px] text-slate-500">
          {formatSpan(profile.tauTotal)} a bordo · {formatSpan(profile.tTotal)} na Terra
        </div>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={openPlanner}
          className="font-display flex-1 rounded-md border border-cyan-300/50 bg-cyan-400/10 px-2 py-1 text-[9px] tracking-[0.18em] text-cyan-100 uppercase hover:bg-cyan-400/25"
        >
          ⚙ Planejar
        </button>
        <a
          href={APP_HASH.probes}
          title="Simulador de sondas: as trajetórias reais do JPL no Sistema Solar"
          className="rounded-md border border-slate-600/70 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          🛰
        </a>
        <a
          href={APP_HASH.home}
          title="Tela de abertura"
          className="rounded-md border border-slate-600/70 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          ⌂
        </a>
      </div>
    </div>
  );
}

// ── Partida e linha do tempo ─────────────────────────────────────────────────
function IgnitionButton({ size = 'large' }: { size?: 'large' | 'small' }) {
  const tau = useFlightStore((s) => s.tau);
  const tauTotal = useFlightStore((s) => s.profile.tauTotal);
  const playing = useFlightStore((s) => s.playing);
  const countingDown = useFlightStore((s) => s.ignitionCountdownS !== null);
  const togglePlay = useFlightStore((s) => s.togglePlay);
  const arrived = tau >= tauTotal;
  const [label, icon, tone] = countingDown
    ? ['Abortar', '✕', 'border-rose-400 text-rose-100 shadow-[0_0_22px_rgba(251,113,133,0.55)] from-rose-700 to-rose-950']
    : playing
      ? ['Pausar', '❚❚', 'border-amber-300 text-amber-50 shadow-[0_0_22px_rgba(252,211,77,0.45)] from-amber-600 to-amber-950']
      : arrived
        ? ['Repetir', '↺', 'border-cyan-300 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.5)] from-cyan-700 to-cyan-950']
        : tau > 0
          ? ['Retomar', '▶', 'border-cyan-300 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.5)] from-cyan-700 to-cyan-950']
          : ['Partida', '▶', 'border-emerald-300 text-emerald-50 shadow-[0_0_26px_rgba(52,211,153,0.6)] from-emerald-600 to-emerald-950'];
  return (
    <button
      type="button"
      onClick={togglePlay}
      aria-label={label}
      className={`flex shrink-0 flex-col items-center justify-center rounded-full border-2 bg-gradient-to-b ${tone} ${
        size === 'large' ? 'h-[4.5rem] w-[4.5rem]' : 'h-14 w-14'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="font-display mt-0.5 text-[8px] font-bold tracking-[0.15em] uppercase">{label}</span>
    </button>
  );
}

function Timeline() {
  const tau = useFlightStore((s) => s.tau);
  const tauTotal = useFlightStore((s) => s.profile.tauTotal);
  const seek = useFlightStore((s) => s.seek);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <Plate>
          Linha do tempo <span className="font-readout tracking-normal normal-case">τ</span>
        </Plate>
        <span className="font-readout truncate text-[11px] text-cyan-100 tabular-nums">
          {formatDuration(tau)} / {formatDuration(tauTotal)}
        </span>
      </div>
      <input
        type="range"
        aria-label="Linha do tempo do voo (tempo próprio)"
        className="w-full accent-cyan-400"
        min={0}
        max={tauTotal}
        step="any"
        value={tau}
        onChange={(e) => seek(Number(e.target.value))}
      />
    </div>
  );
}

function TimeWarp() {
  const timeScale = useFlightStore((s) => s.timeScale);
  const remaining = useFlightStore((s) => s.profile.tauTotal - s.tau);
  const natural = useFlightStore((s) => naturalTimeScale(s.profile));
  const autoStepDown = useFlightStore((s) => s.autoStepDown);
  const setTimeScale = useFlightStore((s) => s.setTimeScale);
  const setAutoStepDown = useFlightStore((s) => s.setAutoStepDown);
  const step = timeScaleStep(timeScale);
  const stepClass =
    'h-7 w-8 shrink-0 rounded-md border border-slate-600/70 bg-gradient-to-b from-slate-700/80 to-slate-900 text-xs text-slate-200 hover:from-slate-600 disabled:opacity-40';
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Plate>Tempo de bordo por segundo</Plate>
      <div className="flex items-center gap-1" role="group" aria-label="Multiplicador de tempo próprio">
        <button type="button" aria-label="Mais devagar" className={stepClass} onClick={() => setTimeScale(adjacentTimeScale(timeScale, -1))}>
          ◀
        </button>
        <div className="instrument-well min-w-0 flex-1 rounded-md px-2 py-0.5 text-center" title={step.title}>
          <span className="font-readout glow-text text-sm text-cyan-50">{step.label}</span>
        </div>
        <button type="button" aria-label="Mais depressa" className={stepClass} onClick={() => setTimeScale(adjacentTimeScale(timeScale, 1))}>
          ▶
        </button>
        <button
          type="button"
          title={`Ritmo que encaixa a viagem em ~10 min: ${timeScaleStep(natural).label}`}
          aria-label="Ritmo natural da missão"
          disabled={timeScale === natural}
          className={stepClass}
          onClick={() => setTimeScale(natural)}
        >
          ⟲
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-[10px] text-slate-400">
        <span className="font-readout">{remaining > 0 ? `≈ ${formatSpan(remaining / timeScale)} até a chegada` : 'chegou'}</span>
        <label className="flex items-center gap-1 text-slate-300" title="Ao entrar num evento crítico, o tempo desacelera para dar tempo de ver">
          <input type="checkbox" className="accent-cyan-400" checked={autoStepDown} onChange={(e) => setAutoStepDown(e.target.checked)} />
          Desacelerar nos eventos
        </label>
      </div>
    </div>
  );
}

// ── Mostradores ──────────────────────────────────────────────────────────────
const DIAL_MAX = 13;
const DIAL_LABELS: readonly (readonly [number, string])[] = [
  [0, '1'],
  [3, '10³'],
  [6, '10⁶'],
  [9, '10⁹'],
  [12, '10¹²'],
];
const dialAngle = (log10Gamma: number) => -120 + (240 * Math.min(Math.max(log10Gamma, 0), DIAL_MAX)) / DIAL_MAX;

function arcPath(from: number, to: number, r: number): string {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${p(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)}`;
}

/** Mostrador de γ em escala log (1 a 10¹³), com a faixa em que a CMB fica visível. */
function GammaDial() {
  const gamma = useFlightStore((s) => s.flight.gamma);
  const eta = useFlightStore((s) => s.flight.eta);
  const needle = dialAngle(log10GammaFromRapidity(eta));
  const cmbFrom = dialAngle(Math.log10(CMB_VISIBLE_GAMMA.min));
  const cmbTo = dialAngle(Math.log10(CMB_VISIBLE_GAMMA.max));
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 78" className="h-[4.5rem] w-24" role="img" aria-label={`Fator de Lorentz γ = ${formatGamma(gamma)}`}>
        <circle cx="50" cy="50" r="46" fill="#04080d" stroke="#334155" />
        <path d={arcPath(-120, 120, 38)} fill="none" stroke="#1e293b" strokeWidth="6" />
        <path d={arcPath(cmbFrom, cmbTo, 38)} fill="none" stroke="#f59e0b" strokeOpacity="0.75" strokeWidth="6" />
        <path d={arcPath(-120, needle, 38)} fill="none" stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="2" />
        {DIAL_LABELS.map(([k, text]) => {
          const a = ((dialAngle(k) - 90) * Math.PI) / 180;
          return (
            <text
              key={k}
              x={50 + 27 * Math.cos(a)}
              y={52 + 27 * Math.sin(a)}
              fill="#94a3b8"
              fontSize="7"
              textAnchor="middle"
              className="font-readout"
            >
              {text}
            </text>
          );
        })}
        <g transform={`rotate(${needle} 50 50)`}>
          <line x1="50" y1="50" x2="50" y2="14" stroke="#fef3c7" strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <circle cx="50" cy="50" r="3" fill="#cbd5e1" />
        <text x="50" y="74" fill="#67e8f9" fontSize="8" textAnchor="middle" className="font-display">
          γ
        </text>
      </svg>
      <span className="font-readout -mt-1 text-[11px] text-cyan-50 tabular-nums">{formatGamma(gamma)}</span>
    </div>
  );
}

type EngineState = 'thrust' | 'flip' | 'coast' | 'off';

const ENGINE: Readonly<Record<EngineState, { label: string; lamp: string }>> = {
  thrust: { label: 'Empuxo', lamp: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]' },
  flip: { label: 'Flip', lamp: 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.9)] animate-beacon' },
  coast: { label: 'Inércia', lamp: 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' },
  off: { label: 'Desligado', lamp: 'bg-slate-600' },
};

/** Lâmpada do motor e a aceleração própria. */
function EngineLamp() {
  const state = useFlightStore((s): EngineState => {
    const { phase, tau } = s.flight;
    if (phase === 'coasting') return 'coast';
    if (phase === 'arrived' || !s.playing) return 'off';
    if (phase === 'accelerating' && activeWindowsAt(s.criticalWindows, tau).some((w) => w.kind === 'pre-flip')) return 'flip';
    return 'thrust';
  });
  const accelG = useFlightStore((s) => s.accelG);
  const { label, lamp } = ENGINE[state];
  return (
    <div className="instrument-well flex min-w-0 flex-col items-center gap-1 rounded-md px-2 py-1.5">
      <Plate>Motor</Plate>
      <span aria-hidden className={`h-3 w-3 rounded-full ${lamp}`} />
      <span className="font-display text-[9px] tracking-[0.15em] text-slate-100 uppercase">{label}</span>
      <span className="font-readout truncate text-[10px] text-cyan-200">α {formatAccelG(accelG)}</span>
    </div>
  );
}

function Switches() {
  const explain = useExplainSettings((s) => s.enabled);
  const setExplain = useExplainSettings((s) => s.setEnabled);
  const panelOpen = useExplainSettings((s) => s.panelOpen);
  const openPanel = useExplainSettings((s) => s.openPanel);
  const closePanel = useExplainSettings((s) => s.closePanel);
  const sound = useAudioSettings((s) => s.enabled);
  const toggleSound = useAudioSettings((s) => s.toggle);
  return (
    <div className="grid grid-cols-3 gap-1">
      <KeySwitch
        on={explain}
        label="Explicar"
        icon="💡"
        title={explain ? 'Explicações ligadas: um cartão a cada efeito novo e as fórmulas ao pausar' : 'Ligar as explicações dos efeitos relativísticos'}
        onClick={() => setExplain(!explain)}
      />
      <KeySwitch
        on={panelOpen}
        label="Efeitos"
        icon="∑"
        title="Efeitos ativos agora, com explicações e fórmulas"
        onClick={() => (panelOpen ? closePanel() : openPanel())}
      />
      <KeySwitch
        on={sound}
        label={sound ? 'Som' : 'Mudo'}
        icon={sound ? '🔊' : '🔇'}
        title={sound ? 'Silenciar motor e alertas' : 'Ligar motor e alertas sonoros'}
        onClick={toggleSound}
      />
    </div>
  );
}

/**
 * Painel de instrumentos: a missão, a partida, a linha do tempo, o ritmo do
 * tempo de bordo e os mostradores (γ, motor), com as teclas do modo Explicar
 * e do som.
 */
export function InstrumentPanel({ className = '' }: { className?: string }) {
  const collapsed = useCockpitUi((s) => s.panelCollapsed);
  const togglePanel = useCockpitUi((s) => s.togglePanel);

  return (
    <section
      aria-label="Painel de instrumentos"
      className={`hull-panel relative rounded-t-3xl px-3 pt-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5 ${className}`}
    >
      <div className="mx-auto max-w-7xl">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={togglePanel}
        className="font-display absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-slate-600 bg-slate-900 px-3 py-0.5 text-[9px] tracking-[0.2em] text-slate-300 uppercase hover:bg-slate-800"
      >
        {collapsed ? '▴ Painel' : '▾ Recolher'}
      </button>
      {collapsed ? (
        <div className="flex items-center gap-3">
          <IgnitionButton size="small" />
          <div className="min-w-0 flex-1">
            <Timeline />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 lg:grid-cols-[minmax(11rem,1fr)_auto_minmax(16rem,2fr)_auto_auto_minmax(10rem,1fr)] lg:gap-x-4">
          <div className="col-span-2 max-lg:order-4 lg:col-span-1">
            <MissionPlate />
          </div>
          <div className="max-lg:order-1">
            <IgnitionButton />
          </div>
          <div className="flex min-w-0 flex-col gap-2 max-lg:order-2">
            <Timeline />
            <TimeWarp />
          </div>
          <div className="max-lg:hidden">
            <GammaDial />
          </div>
          <div className="max-lg:hidden">
            <EngineLamp />
          </div>
          <div className="col-span-2 max-lg:order-3 lg:col-span-1">
            <Switches />
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
