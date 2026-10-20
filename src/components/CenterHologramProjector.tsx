import type { ReactNode } from 'react';
import { blackbodyCssColor, planckSpectralRadiance } from '../physics/blackbody';
import { WIEN_NM_K, type EyeTimeline } from '../physics/EyeAndPhotometry';
import { flipTauOf } from '../physics/RelativityEngine';
import { AU_M } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';
import { useCockpitUi, useIsWideCockpit } from '../ui/cockpitUi';
import { useExplainSettings } from '../ui/explainSettings';
import { formatFixed, formatSpaceNumber, formatSpan } from '../ui/format';
import { hologramCountdownS, selectHologramMode, type HologramMode } from '../ui/hologramMode';

const CYAN = '#38bdf8';
const AMBER = '#f59e0b';
const SLATE = '#94a3b8';

// ── Modo: anéis do Sistema Solar ─────────────────────────────────────────────
const SATURN = { au: 9.5, rx: 85 };
const URANUS = { au: 19.2, rx: 175 };
/** Raio do anel da nave em escala logarítmica entre as órbitas de Saturno e Urano. */
const ringRx = (au: number) =>
  Math.min(190, Math.max(8, SATURN.rx + ((URANUS.rx - SATURN.rx) * Math.log(au / SATURN.au)) / Math.log(URANUS.au / SATURN.au)));

function SolarSystemHologram({ au }: { au: number }) {
  const rx = ringRx(au);
  return (
    <>
      <Caption label="DISTÂNCIA DO SOL" value={`${formatFixed(au, 1)} UA`} valueClass="text-amber-400 text-2xl" />
      <svg viewBox="0 0 380 100" className="w-[min(380px,88vw)] overflow-visible">
        <line x1="190" y1="105" x2="40" y2="50" stroke={CYAN} strokeOpacity="0.25" />
        <line x1="190" y1="105" x2="340" y2="50" stroke={CYAN} strokeOpacity="0.25" />
        <ellipse cx="190" cy="52" rx={SATURN.rx} ry={SATURN.rx * 0.19} fill="none" stroke={SLATE} strokeOpacity="0.45" />
        <circle cx="122" cy="43" r="3" fill={CYAN} />
        <text x="85" y="36" fill={SLATE} fontSize="9">
          SATURNO 9,5 UA
        </text>
        <ellipse cx="190" cy="52" rx={rx} ry={rx * 0.19} fill="none" stroke={AMBER} strokeWidth="2" />
        <ellipse cx="190" cy="52" rx={URANUS.rx} ry={URANUS.rx * 0.19} fill="none" stroke={CYAN} strokeOpacity="0.4" />
        <circle cx="245" cy="24" r="3" fill={CYAN} />
        <text x="210" y="16" fill={SLATE} fontSize="9">
          URANO 19,2 UA
        </text>
        <circle cx="190" cy="52" r="5" fill="#fde047" />
      </svg>
    </>
  );
}

// ── Modo: espectro de Planck da CMB ──────────────────────────────────────────
const NM_MIN = 100;
const NM_MAX = 3000;
const spectrumX = (nm: number) => 10 + (440 * Math.log(nm / NM_MIN)) / Math.log(NM_MAX / NM_MIN);

function CmbSpectrumHologram({ temperatureK }: { temperatureK: number }) {
  const peakNm = WIEN_NM_K / temperatureK;
  const peakValue = planckSpectralRadiance(peakNm * 1e-9, temperatureK);
  const points: string[] = [];
  for (let i = 0; i <= 90; i++) {
    const nm = NM_MIN * (NM_MAX / NM_MIN) ** (i / 90);
    const y = 85 - 68 * Math.min(1, planckSpectralRadiance(nm * 1e-9, temperatureK) / peakValue);
    points.push(`${spectrumX(nm).toFixed(1)},${y.toFixed(1)}`);
  }
  const peakX = spectrumX(Math.min(Math.max(peakNm, NM_MIN), NM_MAX));
  const visLeft = spectrumX(380);
  const visRight = spectrumX(740);

  return (
    <>
      <Caption label={`CMB À FRENTE · ${formatSpaceNumber(temperatureK)} K`} value={`PICO EM ${Math.round(peakNm)} nm`} />
      <svg viewBox="0 0 460 120" className="w-[min(460px,92vw)] overflow-visible">
        <defs>
          <linearGradient id="hologram-visible" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="22%" stopColor="#2563eb" />
            <stop offset="48%" stopColor="#10b981" />
            <stop offset="72%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke="#e2e8f0" strokeWidth="2.2" points={points.join(' ')} />
        <line x1={peakX} y1="17" x2={peakX} y2="86" stroke="#fde047" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx={peakX} cy="17" r="3.5" fill="#ffffff" />
        <line x1="10" y1="88" x2="450" y2="88" stroke="#64748b" strokeWidth="1.5" />
        <rect x={visLeft} y="86" width={visRight - visLeft} height="5" rx="2" fill="url(#hologram-visible)" />
        <text x={(10 + visLeft) / 2} y="106" fill={SLATE} fontSize="10" textAnchor="middle">
          ULTRAVIOLETA
        </text>
        <text x={(visLeft + visRight) / 2} y="106" fill="#e2e8f0" fontSize="10" textAnchor="middle">
          VISÍVEL
        </text>
        <text x={(visRight + 450) / 2} y="106" fill={SLATE} fontSize="10" textAnchor="middle">
          INFRAVERMELHO
        </text>
      </svg>
    </>
  );
}

// ── Modo: curva de iluminância da ida ────────────────────────────────────────
const niceStep = (span: number) => {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
};

/** Rótulo do eixo de tempo de bordo: segundos na demonstração, dias ou anos nas viagens longas. */
const tickLabel = (seconds: number) => (seconds < 3600 ? `${Math.round(seconds)} s` : formatSpan(seconds));

/** A luz à frente na queima de aceleração (até `burnEndTau`: o meio do caminho, ou o início do cruzeiro). */
function LuxCurveHologram({ timeline, tau, burnEndTau, lux }: { timeline: EyeTimeline; tau: number; burnEndTau: number; lux: number }) {
  const endIndex = Math.round(burnEndTau / timeline.dt);
  const threshold = timeline.peakLux * 0.01;
  let startIndex = 0;
  while (startIndex < endIndex && timeline.lux[startIndex]! < threshold) startIndex++;
  // Intervalos nunca nulos: com manobras, o pico da missão pode vir depois da primeira queima.
  const step = niceStep(Math.max((endIndex - startIndex) * timeline.dt, timeline.dt));
  const tauStart = Math.min(Math.floor((startIndex * timeline.dt) / step) * step, burnEndTau);
  const span = Math.max(burnEndTau - tauStart, 1e-3);
  const yMax = Math.max(timeline.peakLux, 10_000) * 1.12;
  const x = (t: number) => 20 + (420 * (t - tauStart)) / span;
  const y = (l: number) => 86 - (68 * l) / yMax;

  const all: string[] = [];
  const done: string[] = [];
  for (let i = 0; i <= 90; i++) {
    const t = tauStart + (span * i) / 90;
    const point = `${x(t).toFixed(1)},${y(timeline.lux[Math.min(Math.round(t / timeline.dt), endIndex)]!).toFixed(1)}`;
    all.push(point);
    if (t <= tau) done.push(point);
  }
  const ticks: number[] = [];
  for (let t = tauStart; t < burnEndTau - step * 0.5; t += step) ticks.push(t);

  return (
    <>
      <div className="flex w-[min(460px,92vw)] items-end justify-between px-4">
        <span className="text-xs text-slate-300">PICO {formatSpaceNumber(timeline.peakLux)} lux</span>
        <Caption label="LUZ VISÍVEL À FRENTE" value={`${formatSpaceNumber(lux)} lux`} valueClass="text-amber-300 text-xl" />
      </div>
      <svg viewBox="0 0 460 105" className="w-[min(460px,92vw)] overflow-visible">
        <line x1="20" y1={y(10_000)} x2="440" y2={y(10_000)} stroke={SLATE} strokeOpacity="0.35" strokeDasharray="3 3" />
        <text x="25" y={y(10_000) - 4} fill="#cbd5e1" fontSize="9">
          10 000 lux · DIA NUBLADO
        </text>
        <polyline points={all.join(' ')} fill="none" stroke="#cbd5e1" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 4" />
        {done.length > 1 && <polyline points={done.join(' ')} fill="none" stroke="#ffffff" strokeWidth="2.2" />}
        <circle cx={x(Math.min(Math.max(tau, tauStart), burnEndTau))} cy={y(lux)} r="4" fill="#ffffff" />
        <line x1="20" y1="86" x2="440" y2="86" stroke="#64748b" />
        {ticks.map((t, i) => (
          <text key={t} x={x(t)} y="99" fill="#cbd5e1" fontSize="9">
            {tickLabel(t)}
            {i === 0 ? ' · TEMPO DE BORDO' : ''}
          </text>
        ))}
        <text x="440" y="99" fill="#cbd5e1" fontSize="9" textAnchor="end">
          PONTO MÉDIO
        </text>
      </svg>
    </>
  );
}

// ── Modo: contagem regressiva ────────────────────────────────────────────────
function ellipseArc(fraction: number): string {
  const points: string[] = [];
  const n = Math.max(2, Math.round(60 * fraction));
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + 2 * Math.PI * fraction * (i / n);
    points.push(`${(150 + 125 * Math.cos(a)).toFixed(1)},${(32 + 22 * Math.sin(a)).toFixed(1)}`);
  }
  return points.join(' ');
}

function CountdownHologram({ label, remaining, window }: { label: string; remaining: number; window: number }) {
  // Segundos na demonstração; nas viagens longas, o tempo de bordo que falta ("12,3 dias").
  const long = window > 99;
  return (
    <>
      <div className="mb-1 text-xs tracking-[0.2em] text-sky-200/90 uppercase">{label}</div>
      <div
        className={`mb-2 font-light text-amber-400 drop-shadow-[0_0_18px_rgba(245,158,11,0.55)] ${long ? 'text-4xl' : 'text-6xl'}`}
      >
        {long ? formatSpan(remaining) : Math.max(1, Math.ceil(remaining))}
      </div>
      <svg viewBox="0 0 300 75" className="w-[min(300px,80vw)]">
        <ellipse cx="150" cy="32" rx="125" ry="22" fill="none" stroke={CYAN} strokeOpacity="0.25" strokeDasharray="2 6" strokeWidth="3" />
        <polyline points={ellipseArc(Math.min(1, remaining / window))} fill="none" stroke={CYAN} strokeWidth="3" />
        <line x1="150" y1="74" x2="65" y2="42" stroke={CYAN} strokeOpacity="0.35" />
        <line x1="150" y1="74" x2="235" y2="42" stroke={CYAN} strokeOpacity="0.35" />
      </svg>
    </>
  );
}

// ── Modo: blueshift do alvo ──────────────────────────────────────────────────
function Swatch({ temperatureK }: { temperatureK: number }) {
  const color = blackbodyCssColor(temperatureK);
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border" style={{ borderColor: `${color}80`, background: `${color}33` }}>
      <div className="h-5 w-5 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
    </div>
  );
}

function TargetBlueshiftHologram({ name, restK, doppler }: { name: string; restK: number; doppler: number }) {
  return (
    <div className="flex w-[min(430px,92vw)] items-center justify-between px-4">
      <div className="flex flex-col items-center">
        <span className="text-[10px] tracking-widest text-slate-300 uppercase">{name} · COR REAL</span>
        <span className="mb-2 text-sm text-amber-200">{formatSpaceNumber(restK)} K</span>
        <Swatch temperatureK={restK} />
      </div>
      <div className="flex flex-1 flex-col items-center px-3">
        <span className="mb-1 text-xs tracking-wider text-amber-400">DESVIO PARA O AZUL × {formatFixed(doppler, doppler < 10 ? 2 : 1)}</span>
        <div className="relative h-0.5 w-full bg-sky-400/70">
          <div className="absolute -top-1 right-0 h-2 w-2 rotate-45 border-t-2 border-r-2 border-sky-400" />
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] tracking-widest text-slate-300 uppercase">VISTA AGORA</span>
        <span className="mb-2 text-sm text-sky-200">{formatSpaceNumber(restK * doppler)} K</span>
        <Swatch temperatureK={restK * doppler} />
      </div>
    </div>
  );
}

// ── Projetor ─────────────────────────────────────────────────────────────────
function Caption({ label, value, valueClass = 'text-white text-lg' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-center">
      <div className="text-xs tracking-widest text-slate-200 uppercase">{label}</div>
      <div className={`mb-1 font-medium whitespace-nowrap ${valueClass}`}>{value}</div>
    </div>
  );
}

/** Disco emissor ciano de onde sai a projeção. */
function Emitter() {
  return (
    <svg viewBox="0 0 120 16" className="w-24" aria-hidden>
      <defs>
        <radialGradient id="hologram-emitter">
          <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.95" />
          <stop offset="60%" stopColor={CYAN} stopOpacity="0.5" />
          <stop offset="100%" stopColor={CYAN} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="8" rx="58" ry="7" fill="url(#hologram-emitter)" />
    </svg>
  );
}

/**
 * Projetor holográfico no centro inferior do para-brisa: escolhe sozinho o
 * holograma da fase do voo (ver `selectHologramMode`).
 */
export function CenterHologramProjector() {
  const crew = useFlightStore((s) => s.crew);
  const flight = useFlightStore((s) => s.flight);
  const profile = useFlightStore((s) => s.profile);
  const destination = useFlightStore((s) => s.destination);
  const solarSystem = useFlightStore((s) => s.origin.solarSystem);
  const timeline = useFlightStore((s) => s.eyeTimeline);
  const p = useFlightStore((s) => s.photometry);
  // O painel de efeitos traz o mesmo conteúdo, com as fórmulas, e precisa da altura.
  const effectsPanelOpen = useExplainSettings((s) => s.panelOpen);
  // No celular, o telescópio aberto ocupa o espaço do holograma.
  const wide = useIsWideCockpit();
  const telescopeOpen = useCockpitUi((s) => s.telescopeOpen);

  // Os anéis dos planetas só existem na partida do Sol.
  const sunDistanceAu = solarSystem ? (AU_M + flight.positionM) / AU_M : Infinity;
  const hologram: HologramMode = selectHologramMode({
    flight,
    profile,
    sunDistanceAu,
    cmbTempK: p.cmbTempAheadK,
    cmbPeakNm: p.cmbWienPeakNm,
    hasTarget: destination.kind !== 'void',
  });
  // No celular, o cartão da história de um roteiro também precisa da altura.
  const storyOpen = useFlightStore((s) => s.beat !== null);
  if (hologram === 'none' || effectsPanelOpen || (telescopeOpen && !wide) || (storyOpen && !wide)) return null;

  let content: ReactNode;
  switch (hologram) {
    case 'solar-system':
      content = <SolarSystemHologram au={sunDistanceAu} />;
      break;
    case 'cmb-spectrum':
      content = <CmbSpectrumHologram temperatureK={p.cmbTempAheadK} />;
      break;
    case 'lux-curve':
      content = <LuxCurveHologram timeline={timeline} tau={flight.tau} burnEndTau={profile.burnEndTau} lux={p.visibleLuxAhead} />;
      break;
    case 'countdown-flip':
      content = (
        <CountdownHologram
          label="FRENAGEM EM"
          remaining={(flipTauOf(profile) ?? profile.brakeStartTau) - flight.tau}
          window={hologramCountdownS(profile)}
        />
      );
      break;
    case 'countdown-arrival':
      content = (
        <CountdownHologram
          label={profile.maneuvers?.end === 'flyby' ? 'PASSAGEM PELO ALVO EM' : 'CHEGADA EM'}
          remaining={profile.tauTotal - flight.tau}
          window={hologramCountdownS(profile)}
        />
      );
      break;
    case 'target-blueshift':
      content = <TargetBlueshiftHologram name={destination.shortName} restK={destination.temperatureK} doppler={p.dopplerAhead} />;
      break;
  }

  return (
    <div className="pointer-events-none flex flex-col items-center select-none" aria-live="polite">
      <div
        className={`flex flex-col items-center font-mono transition-all duration-500 ${
          p.isWhiteoutHudActive && crew === 'crewed'
            ? 'rounded-2xl border border-white/15 bg-neutral-900/65 px-6 py-3 shadow-2xl backdrop-blur-md'
            : 'px-2 py-1'
        }`}
        style={{ filter: 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.45))' }}
      >
        {content}
      </div>
      <Emitter />
    </div>
  );
}
