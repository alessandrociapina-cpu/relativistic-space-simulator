import { useState } from 'react';
import { useAudioSettings } from '../audio/audioSettings';
import { useExplainSettings } from '../ui/explainSettings';
import {
  computeMissionProfile,
  log10GammaFromRapidity,
  rapidityFromLog10Gamma,
  rocketMassRatio,
} from '../physics/RelativityEngine';
import { CREWED_ACCEL_G, DEFAULT_ACCEL_G, DESTINATION_LIST, type DestinationId } from '../physics/destinations';
import { timeScaleOptions, timeScaleStep } from '../store/timeScales';
import { MAX_LOG10_GAMMA, useFlightStore, type FlightMode } from '../store/useFlightStore';
import { formatCompact, formatDuration, formatFixed, formatGamma, formatProse, formatVelocity } from '../ui/format';

/** Faixa da aceleração personalizada: 0,1 g a 10⁷ g. */
const MIN_ACCEL_G = 0.1;
const MAX_ACCEL_G = 1e7;
/** Velocidade de cruzeiro sugerida ao ligar o perfil com inércia (fração de c). */
const DEFAULT_COAST_BETA = 0.9;
/** Menor rapidez de cruzeiro do slider (β ≈ 0,05). */
const MIN_COAST_ETA = 0.05;

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

const presetClass = (active: boolean) =>
  `rounded-sm px-2 py-0.5 text-[11px] transition-colors ${
    active ? 'bg-cyan-400/80 text-black' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
  }`;

/** Aceleração própria: demonstração, viagem tripulada a 1 g ou um valor qualquer em g. */
function AccelerationSettings() {
  const accelG = useFlightStore((s) => s.accelG);
  const setAccelG = useFlightStore((s) => s.setAccelG);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const preset = customOpen
    ? 'custom'
    : accelG === DEFAULT_ACCEL_G
      ? 'demo'
      : accelG === CREWED_ACCEL_G
        ? 'crewed'
        : 'custom';
  const choose = (g: number) => {
    setCustomOpen(false);
    setDraft(null);
    setAccelG(g);
  };
  const commit = (g: number) => {
    if (g >= MIN_ACCEL_G && g <= MAX_ACCEL_G) setAccelG(g);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-slate-400">α</span>
      <div className="flex gap-1" role="radiogroup" aria-label="Aceleração própria">
        <button
          type="button"
          role="radio"
          aria-checked={preset === 'demo'}
          title="1,61 × 10⁶ g: Proxima em 10 min de bordo, com todos os efeitos em tempo real"
          className={presetClass(preset === 'demo')}
          onClick={() => choose(DEFAULT_ACCEL_G)}
        >
          Demonstração
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={preset === 'crewed'}
          title="1 g: o peso de sempre a bordo, a viagem tripulada clássica"
          className={presetClass(preset === 'crewed')}
          onClick={() => choose(CREWED_ACCEL_G)}
        >
          1 g
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={preset === 'custom'}
          title="Qualquer aceleração entre 0,1 g e 10⁷ g"
          className={presetClass(preset === 'custom')}
          onClick={() => setCustomOpen(true)}
        >
          Personalizada
        </button>
      </div>
      {preset === 'custom' && (
        <>
          <label className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              aria-label="Aceleração própria em g"
              className="w-24 rounded-sm border border-slate-700 bg-slate-900 px-1 py-0.5 text-right text-slate-100 tabular-nums"
              min={MIN_ACCEL_G}
              max={MAX_ACCEL_G}
              step="0.1"
              value={draft ?? String(accelG)}
              onChange={(e) => {
                setDraft(e.target.value);
                commit(Number(e.target.value));
              }}
              onBlur={() => setDraft(null)}
            />
            <span className="text-slate-400">g</span>
          </label>
          <input
            type="range"
            aria-label="Aceleração própria (log₁₀ g)"
            className="min-w-32 flex-1 accent-cyan-400"
            min={Math.log10(MIN_ACCEL_G)}
            max={Math.log10(MAX_ACCEL_G)}
            step="any"
            value={Math.log10(accelG)}
            onChange={(e) => {
              setDraft(null);
              commit(Number((10 ** Number(e.target.value)).toPrecision(3)));
            }}
          />
        </>
      )}
    </div>
  );
}

/** Perfil da viagem: Flip-and-Burn ou acelerar, cruzar por inércia e frear. */
function ProfileSettings() {
  const coastEta = useFlightStore((s) => s.coastEta);
  const profile = useFlightStore((s) => s.profile);
  const setCoastEta = useFlightStore((s) => s.setCoastEta);
  // Rapidez do ponto médio: acima dela o cruzeiro nunca é atingido.
  const flipEta = computeMissionProfile(profile.distanceM, profile.properAccel).etaMax;
  const maxCoastEta = flipEta * 0.999;
  const shownEta = coastEta === null ? null : Math.min(coastEta, maxCoastEta);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-slate-400">Perfil</span>
      <div className="flex gap-1" role="radiogroup" aria-label="Perfil da viagem">
        <button
          type="button"
          role="radio"
          aria-checked={coastEta === null}
          title="Acelera até o meio do caminho e freia no resto (Flip-and-Burn)"
          className={presetClass(coastEta === null)}
          onClick={() => setCoastEta(null)}
        >
          Acelerar e frear
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={coastEta !== null}
          title="Acelera até a velocidade de cruzeiro, desliga o motor e freia no fim: gasta menos combustível"
          className={presetClass(coastEta !== null)}
          onClick={() => setCoastEta(Math.min(Math.atanh(DEFAULT_COAST_BETA), 0.8 * flipEta))}
        >
          Acelerar, cruzar e frear
        </button>
      </div>
      {shownEta !== null && (
        <label className="flex min-w-48 flex-1 items-center gap-2">
          <span className="text-slate-400">v</span>
          <input
            type="range"
            aria-label="Velocidade de cruzeiro (rapidez η)"
            className="min-w-0 flex-1 accent-cyan-400"
            min={Math.min(MIN_COAST_ETA, maxCoastEta)}
            max={maxCoastEta}
            step="any"
            value={shownEta}
            onChange={(e) => setCoastEta(Number(e.target.value))}
          />
          <span className="shrink-0 text-right text-slate-100 tabular-nums">
            {formatVelocity(Math.tanh(shownEta), Math.exp(-shownEta) / Math.cosh(shownEta))}
          </span>
        </label>
      )}
    </div>
  );
}

function MissionSettings() {
  const destination = useFlightStore((s) => s.destination);
  const profile = useFlightStore((s) => s.profile);
  const setDestination = useFlightStore((s) => s.setDestination);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex max-w-full min-w-0 items-center gap-2">
        <span className="text-slate-400">Destino</span>
        <select
          className="min-w-0 flex-1 rounded-sm border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-100 sm:flex-none"
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
      <AccelerationSettings />
      <ProfileSettings />
      <div className="text-slate-500">
        {formatDuration(profile.tauTotal)} de bordo · {formatDuration(profile.tTotal)} na Terra · γ máx{' '}
        {formatGamma(profile.gammaMax)} ·{' '}
        <span title="Razão de massa inicial/final de um foguete de fótons ideal (o mais eficiente possível)">
          foguete de fótons: m₀/m₁ = {formatProse(rocketMassRatio(profile))}
        </span>
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
    // Em telas estreitas, relógios longos ("1,754 anos / 3,543 anos") descem para a linha de baixo.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
      <ExplainToggle />
      <input
        type="range"
        aria-label="Linha do tempo do voo (tempo próprio)"
        className="min-w-32 flex-1 accent-cyan-400"
        min={0}
        max={tauTotal}
        step="any"
        value={tau}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="ml-auto shrink-0 text-slate-400 tabular-nums">
        {formatDuration(tau)} / {formatDuration(tauTotal)}
      </span>
    </div>
  );
}

function TimeScaleControls() {
  const timeScale = useFlightStore((s) => s.timeScale);
  const profile = useFlightStore((s) => s.profile);
  const autoStepDown = useFlightStore((s) => s.autoStepDown);
  const setTimeScale = useFlightStore((s) => s.setTimeScale);
  const setAutoStepDown = useFlightStore((s) => s.setAutoStepDown);
  const options = timeScaleOptions(profile);
  // Depois de um Auto-Step Down o multiplicador pode estar fora dos 5 degraus da missão.
  const steps = options.some((o) => o.value === timeScale)
    ? options
    : [...options, timeScaleStep(timeScale)].sort((a, b) => a.value - b.value);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Multiplicador de tempo próprio">
        <span className="mr-1 text-slate-400">M<sub>τ</sub></span>
        {steps.map((step) => (
          <button
            key={step.value}
            type="button"
            role="radio"
            aria-checked={step.value === timeScale}
            title={step.title}
            className={`whitespace-nowrap ${segmentClass(step.value === timeScale)} max-sm:px-1.5`}
            onClick={() => setTimeScale(step.value)}
          >
            {step.label}
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
        Desacelerar nos eventos críticos
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

/** Modo Explicar: um cartão a cada efeito que começa e o painel de fórmulas ao pausar. */
function ExplainToggle() {
  const enabled = useExplainSettings((s) => s.enabled);
  const setEnabled = useExplainSettings((s) => s.setEnabled);
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label="Explicar"
      title={
        enabled
          ? 'Explicações ligadas: um cartão a cada efeito novo e as fórmulas ao pausar'
          : 'Ligar as explicações dos efeitos relativísticos'
      }
      className={`shrink-0 rounded-sm px-2 py-1 text-[11px] tracking-wider transition-colors ${
        enabled ? 'bg-amber-400/90 text-black hover:bg-amber-300' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
      }`}
      onClick={() => setEnabled(!enabled)}
    >
      💡<span className="ml-1 hidden sm:inline">Explicar</span>
    </button>
  );
}

/** Abre o painel de efeitos ativos a qualquer momento (também no Cruzeiro Livre). */
function EffectsButton() {
  const open = useExplainSettings((s) => s.panelOpen);
  const openPanel = useExplainSettings((s) => s.openPanel);
  const closePanel = useExplainSettings((s) => s.closePanel);
  return (
    <button
      type="button"
      aria-pressed={open}
      aria-label="Efeitos ativos"
      title="Efeitos ativos agora, com explicações e fórmulas"
      className={`px-1 hover:text-slate-200 ${open ? 'text-amber-300' : 'text-slate-400'}`}
      onClick={() => (open ? closePanel() : openPanel())}
    >
      ∑<span className="ml-1 hidden sm:inline">Efeitos</span>
    </button>
  );
}

function SoundToggle() {
  const enabled = useAudioSettings((s) => s.enabled);
  const toggle = useAudioSettings((s) => s.toggle);
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label="Som"
      title={enabled ? 'Silenciar motor e alertas' : 'Ligar motor e alertas sonoros'}
      className="px-1 text-slate-400 hover:text-slate-200"
      onClick={toggle}
    >
      {enabled ? '🔊' : '🔇'}
      <span className="ml-1 hidden sm:inline">{enabled ? 'Som' : 'Mudo'}</span>
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
          <EffectsButton />
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
