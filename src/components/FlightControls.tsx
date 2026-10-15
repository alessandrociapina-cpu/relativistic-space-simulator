import { useState } from 'react';
import { useAudioSettings } from '../audio/audioSettings';
import { log10GammaFromRapidity, rapidityFromLog10Gamma } from '../physics/RelativityEngine';
import { DEFAULT_ACCEL_G, DESTINATION_LIST, type DestinationId } from '../physics/destinations';
import {
  MAX_LOG10_GAMMA,
  TIME_SCALES,
  useFlightStore,
  type FlightMode,
} from '../store/useFlightStore';
import { formatCompact, formatDuration, formatFixed, formatGamma } from '../ui/format';

/** Faixa do slider de aceleração: 1 G a 10⁷ G (log₁₀). */
const MAX_LOG10_ACCEL_G = 7;

const MODES: readonly { mode: FlightMode; label: string }[] = [
  { mode: 'autopilot', label: 'Autopilot' },
  { mode: 'manual', label: 'Cruzeiro livre' },
];

const segmentClass = (active: boolean) =>
  `rounded-sm px-2 py-1 text-[11px] tracking-wider transition-colors ${
    active ? 'bg-cyan-400/80 text-black' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
  }`;

function ModeToggle() {
  const mode = useFlightStore((s) => s.mode);
  const setMode = useFlightStore((s) => s.setMode);
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Modo de voo">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          role="radio"
          aria-checked={m.mode === mode}
          className={segmentClass(m.mode === mode)}
          onClick={() => setMode(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function MissionSettings() {
  const destination = useFlightStore((s) => s.destination);
  const accelG = useFlightStore((s) => s.accelG);
  const profile = useFlightStore((s) => s.profile);
  const setDestination = useFlightStore((s) => s.setDestination);
  const setAccelG = useFlightStore((s) => s.setAccelG);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex max-w-full min-w-0 items-center gap-2">
          <span className="text-slate-400">Destino</span>
          <select
            className="min-w-0 flex-1 rounded-sm border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-100"
            value={destination.id}
            onChange={(e) => setDestination(e.target.value as DestinationId)}
          >
            {DESTINATION_LIST.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {formatCompact(d.distanceLy)} ly
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 items-center gap-2">
          <span className="text-slate-400">α</span>
          <input
            type="range"
            aria-label="Aceleração própria (log₁₀ G)"
            className="min-w-0 flex-1 accent-cyan-400"
            min={0}
            max={MAX_LOG10_ACCEL_G}
            step="any"
            value={Math.log10(accelG)}
            onChange={(e) => setAccelG(10 ** Number(e.target.value))}
          />
          <span className="w-24 text-right text-slate-100 tabular-nums">{formatCompact(accelG)} G</span>
        </label>
        <button
          type="button"
          className="rounded-sm bg-slate-800/80 px-2 py-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          disabled={accelG === DEFAULT_ACCEL_G}
          onClick={() => setAccelG(DEFAULT_ACCEL_G)}
        >
          Padrão
        </button>
      </div>
      <div className="text-slate-500">
        {formatDuration(profile.tauTotal)} de bordo · {formatDuration(profile.tTotal)} na Terra · γ máx{' '}
        {formatGamma(profile.gammaMax)}
      </div>
    </div>
  );
}

function Timeline() {
  const tau = useFlightStore((s) => s.tau);
  const tauTotal = useFlightStore((s) => s.profile.tauTotal);
  const playing = useFlightStore((s) => s.playing);
  const countingDown = useFlightStore((s) => s.ignitionCountdownS !== null);
  const togglePlay = useFlightStore((s) => s.togglePlay);
  const seek = useFlightStore((s) => s.seek);
  const arrived = tau >= tauTotal;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="w-24 shrink-0 rounded-sm bg-cyan-400/80 px-2 py-1 text-[11px] tracking-wider text-black hover:bg-cyan-300"
        onClick={togglePlay}
      >
        {countingDown
          ? '✕ Abortar'
          : playing
            ? '❚❚ Pausar'
            : arrived
              ? '↺ Repetir'
              : tau > 0
                ? '▶ Retomar'
                : '▶ Partida'}
      </button>
      <input
        type="range"
        aria-label="Linha do tempo do voo (tempo próprio)"
        className="min-w-0 flex-1 accent-cyan-400"
        min={0}
        max={tauTotal}
        step="any"
        value={tau}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="shrink-0 text-slate-400 tabular-nums">
        {formatDuration(tau)} / {formatDuration(tauTotal)}
      </span>
    </div>
  );
}

function TimeScaleControls() {
  const timeScale = useFlightStore((s) => s.timeScale);
  const autoStepDown = useFlightStore((s) => s.autoStepDown);
  const setTimeScale = useFlightStore((s) => s.setTimeScale);
  const setAutoStepDown = useFlightStore((s) => s.setAutoStepDown);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Multiplicador de tempo próprio">
        <span className="mr-1 text-slate-400">M<sub>τ</sub></span>
        {TIME_SCALES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === timeScale}
            title={m === 1 ? 'Tempo real' : undefined}
            className={segmentClass(m === timeScale)}
            onClick={() => setTimeScale(m)}
          >
            {m.toLocaleString('pt-BR')}x
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-slate-300">
        <input
          type="checkbox"
          className="accent-cyan-400"
          checked={autoStepDown}
          onChange={(e) => setAutoStepDown(e.target.checked)}
        />
        Reduzir para 1x em eventos críticos
      </label>
    </div>
  );
}

function CruiseControl() {
  const manualEta = useFlightStore((s) => s.manualEta);
  const setManualEta = useFlightStore((s) => s.setManualEta);
  const gamma = Math.cosh(manualEta);

  return (
    <label className="flex items-center gap-2">
      <span className="text-slate-400">log₁₀γ</span>
      <input
        type="range"
        aria-label="Fator de Lorentz (log₁₀γ)"
        className="min-w-0 flex-1 accent-cyan-400"
        min={0}
        max={MAX_LOG10_GAMMA}
        step="any"
        value={log10GammaFromRapidity(manualEta)}
        onChange={(e) => setManualEta(rapidityFromLog10Gamma(Number(e.target.value)))}
      />
      <span className="w-40 shrink-0 text-right text-slate-100 tabular-nums">
        γ {formatGamma(gamma)} · η {formatFixed(manualEta, 2)}
      </span>
    </label>
  );
}

function SoundToggle() {
  const enabled = useAudioSettings((s) => s.enabled);
  const toggle = useAudioSettings((s) => s.toggle);
  return (
    <button
      type="button"
      aria-pressed={enabled}
      title={enabled ? 'Silenciar motor e alertas' : 'Ligar motor e alertas sonoros'}
      className="px-1 text-slate-400 hover:text-slate-200"
      onClick={toggle}
    >
      {enabled ? '🔊 Som' : '🔇 Mudo'}
    </button>
  );
}

/** Painel de voo: Autopilot (Flip-and-Burn) ou Cruzeiro Livre (§7). */
export function FlightControls({ className = '' }: { className?: string }) {
  const mode = useFlightStore((s) => s.mode);
  const [open, setOpen] = useState(true);

  return (
    <section
      aria-label="Controles de voo"
      className={`flex flex-col gap-2 rounded-md border border-cyan-400/30 bg-black/70 px-3 py-2 font-mono text-xs backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <ModeToggle />
        <div className="flex items-center gap-2">
          <SoundToggle />
          <button
            type="button"
            aria-expanded={open}
            className="px-1 text-slate-400 hover:text-slate-200"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Ocultar ▾' : 'Controles ▴'}
          </button>
        </div>
      </div>
      {open &&
        (mode === 'autopilot' ? (
          <>
            <MissionSettings />
            <Timeline />
            <TimeScaleControls />
          </>
        ) : (
          <CruiseControl />
        ))}
    </section>
  );
}
