import type { ReactNode } from 'react';
import { blackbodyCssColor, planckSpectralRadiance } from '../physics/blackbody';
import { WIEN_NM_K, type EyeTimeline } from '../physics/EyeAndPhotometry';
import { AU_M } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';
import { useExplainSettings } from '../ui/explainSettings';
import { formatSpaceNumber } from '../ui/format';
import { HOLOGRAM_COUNTDOWN_S, selectHologramMode, type HologramMode } from '../ui/hologramMode';

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
      <Caption label="DISTANCE FROM THE SUN" value={`${au.toFixed(1)} AU`} valueClass="text-amber-400 text-2xl" />
      <svg viewBox="0 0 380 100" className="w-[min(380px,88vw)] overflow-visible">
        <line x1="190" y1="105" x2="40" y2="50" stroke={CYAN} strokeOpacity="0.25" />
        <line x1="190" y1="105" x2="340" y2="50" stroke={CYAN} strokeOpacity="0.25" />
        <ellipse cx="190" cy="52" rx={SATURN.rx} ry={SATURN.rx * 0.19} fill="none" stroke={SLATE} strokeOpacity="0.45" />
        <circle cx="122" cy="43" r="3" fill={CYAN} />
        <text x="85" y="36" fill={SLATE} fontSize="9">
          SATURN 9.5 AU
        </text>
        <ellipse cx="190" cy="52" rx={rx} ry={rx * 0.19} fill="none" stroke={AMBER} strokeWidth="2" />
        <ellipse cx="190" cy="52" rx={URANUS.rx} ry={URANUS.rx * 0.19} fill="none" stroke={CYAN} strokeOpacity="0.4" />
        <circle cx="245" cy="24" r="3" fill={CYAN} />
        <text x="210" y="16" fill={SLATE} fontSize="9">
          URANUS 19.2 AU
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
      <Caption label={`CMB AHEAD · ${formatSpaceNumber(temperatureK)} K`} value={`PEAK ${Math.round(peakNm)} nm`} />
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
          ULTRAVIOLET
        </text>
        <text x={(visLeft + visRight) / 2} y="106" fill="#e2e8f0" fontSize="10" textAnchor="middle">
          VISIBLE
        </text>
        <text x={(visRight + 450) / 2} y="106" fill={SLATE} fontSize="10" textAnchor="middle">
          INFRARED
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

function LuxCurveHologram({ timeline, tau, tauHalf, lux }: { timeline: EyeTimeline; tau: number; tauHalf: number; lux: number }) {
  const halfIndex = Math.round(tauHalf / timeline.dt);
  const threshold = timeline.peakLux * 0.01;
  let startIndex = 0;
  while (startIndex < halfIndex && timeline.lux[startIndex]! < threshold) startIndex++;
  const step = niceStep((halfIndex - startIndex) * timeline.dt);
  const tauStart = Math.floor((startIndex * timeline.dt) / step) * step;
  const yMax = Math.max(timeline.peakLux, 10_000) * 1.12;
  const x = (t: number) => 20 + (420 * (t - tauStart)) / (tauHalf - tauStart);
  const y = (l: number) => 86 - (68 * l) / yMax;

  const all: string[] = [];
  const done: string[] = [];
  for (let i = 0; i <= 90; i++) {
    const t = tauStart + ((tauHalf - tauStart) * i) / 90;
    const point = `${x(t).toFixed(1)},${y(timeline.lux[Math.min(Math.round(t / timeline.dt), halfIndex)]!).toFixed(1)}`;
    all.push(point);
    if (t <= tau) done.push(point);
  }
  const ticks: number[] = [];
  for (let t = tauStart; t < tauHalf - step * 0.5; t += step) ticks.push(t);

  return (
    <>
      <div className="flex w-[min(460px,92vw)] items-end justify-between px-4">
        <span className="text-xs text-slate-300">PEAK {formatSpaceNumber(timeline.peakLux)} lux</span>
        <Caption label="VISIBLE LIGHT AHEAD" value={`${formatSpaceNumber(lux)} lux`} valueClass="text-amber-300 text-xl" />
      </div>
      <svg viewBox="0 0 460 105" className="w-[min(460px,92vw)] overflow-visible">
        <line x1="20" y1={y(10_000)} x2="440" y2={y(10_000)} stroke={SLATE} strokeOpacity="0.35" strokeDasharray="3 3" />
        <text x="25" y={y(10_000) - 4} fill="#cbd5e1" fontSize="9">
          10 000 lux · OVERCAST DAYLIGHT
        </text>
        <polyline points={all.join(' ')} fill="none" stroke="#cbd5e1" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 4" />
        {done.length > 1 && <polyline points={done.join(' ')} fill="none" stroke="#ffffff" strokeWidth="2.2" />}
        <circle cx={x(Math.min(Math.max(tau, tauStart), tauHalf))} cy={y(lux)} r="4" fill="#ffffff" />
        <line x1="20" y1="86" x2="440" y2="86" stroke="#64748b" />
        {ticks.map((t, i) => (
          <text key={t} x={x(t)} y="99" fill="#cbd5e1" fontSize="9">
            {Math.round(t)} s{i === 0 ? ' · SHIP TIME' : ''}
          </text>
        ))}
        <text x="440" y="99" fill="#cbd5e1" fontSize="9" textAnchor="end">
          MIDPOINT
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

function CountdownHologram({ label, remaining }: { label: string; remaining: number }) {
  return (
    <>
      <div className="mb-1 text-xs tracking-[0.2em] text-sky-200/90 uppercase">{label}</div>
      <div className="mb-2 text-6xl font-light text-amber-400 drop-shadow-[0_0_18px_rgba(245,158,11,0.55)]">
        {Math.max(1, Math.ceil(remaining))}
      </div>
      <svg viewBox="0 0 300 75" className="w-[min(300px,80vw)]">
        <ellipse cx="150" cy="32" rx="125" ry="22" fill="none" stroke={CYAN} strokeOpacity="0.25" strokeDasharray="2 6" strokeWidth="3" />
        <polyline points={ellipseArc(Math.min(1, remaining / HOLOGRAM_COUNTDOWN_S))} fill="none" stroke={CYAN} strokeWidth="3" />
        <line x1="150" y1="74" x2="65" y2="42" stroke={CYAN} strokeOpacity="0.35" />
        <line x1="150" y1="74" x2="235" y2="42" stroke={CYAN} strokeOpacity="0.35" />
      </svg>
    </>
  );
}

// ── Modo: adaptação do olho ──────────────────────────────────────────────────
const STOPS_SCALE = 15;

function EyeAdaptationHologram(props: {
  pupilMm: number;
  retinaStops: number;
  whiteoutStops: number;
  whiteoutTau: number;
  dimmer: number;
}) {
  const fill = Math.min(1, -props.retinaStops / STOPS_SCALE);
  const marker = Math.min(1, -props.whiteoutStops / STOPS_SCALE);
  return (
    <div className="flex items-center gap-6 px-2 py-1 sm:gap-8">
      <div className="flex flex-col items-center">
        <svg width="115" height="65" viewBox="0 0 115 65">
          <path d="M 5 32 Q 57 -5 110 32 Q 57 69 5 32 Z" fill="none" stroke={CYAN} strokeOpacity="0.7" strokeWidth="1.5" />
          <circle cx="57.5" cy="32" r="20" fill="none" stroke={CYAN} strokeOpacity="0.5" />
          <circle cx="57.5" cy="32" r={Math.max(3, props.pupilMm * 2.4)} fill="#020617" stroke="#7dd3fc" strokeWidth="1.5" />
        </svg>
        <span className="mt-1 text-[10px] tracking-widest text-slate-400">NOW</span>
      </div>
      <div className="flex flex-col">
        <div className="mb-1 text-center text-xs tracking-widest text-slate-300 uppercase">YOUR EYES</div>
        <div className="mb-2 flex gap-6 text-sm">
          <span className="text-sky-200">PUPIL {props.pupilMm.toFixed(2)} mm</span>
          <span className="text-amber-400">RETINA {props.retinaStops.toFixed(1)} stops</span>
        </div>
        <svg viewBox="0 0 256 40" className="mb-2 w-56 overflow-visible sm:w-64">
          {/* Marcador do nível da retina no white-out da ida, rotulado acima da barra. */}
          <text x={256 * marker} y="8" fill="#e2e8f0" fontSize="8" textAnchor={marker > 0.6 ? 'end' : 'start'}>
            WHITE-OUT · {Math.round(props.whiteoutTau)} s
          </text>
          <rect x="0" y="14" width="256" height="6" rx="3" fill="#334155" />
          <rect x="0" y="14" width={256 * fill} height="6" rx="3" fill={AMBER} />
          <line x1={256 * marker} y1="10" x2={256 * marker} y2="24" stroke="#e2e8f0" strokeWidth="1.5" />
          {[0, 5, 10].map((s) => (
            <text key={s} x={(256 * s) / STOPS_SCALE + 2} y="34" fill={SLATE} fontSize="8">
              {s === 0 ? '0' : `−${s}`}
              {s === 10 ? ' stops' : ''}
            </text>
          ))}
        </svg>
        <div className="text-center text-[10px] tracking-widest text-slate-300 uppercase">SAME LIGHT AS THE WHITE-OUT</div>
        <div className="text-center text-sm font-medium text-amber-400">
          {formatSpaceNumber(props.dimmer)}x DIMMER TO YOUR EYES
        </div>
      </div>
    </div>
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
        <span className="text-[10px] tracking-widest text-slate-300 uppercase">{name} · TRUE COLOUR</span>
        <span className="mb-2 text-sm text-amber-200">{formatSpaceNumber(restK)} K</span>
        <Swatch temperatureK={restK} />
      </div>
      <div className="flex flex-1 flex-col items-center px-3">
        <span className="mb-1 text-xs tracking-wider text-amber-400">BLUESHIFT x {formatSpaceNumber(doppler)}</span>
        <div className="relative h-0.5 w-full bg-sky-400/70">
          <div className="absolute -top-1 right-0 h-2 w-2 rotate-45 border-t-2 border-r-2 border-sky-400" />
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] tracking-widest text-slate-300 uppercase">AS SEEN NOW</span>
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
  const mode = useFlightStore((s) => s.mode);
  const flight = useFlightStore((s) => s.flight);
  const profile = useFlightStore((s) => s.profile);
  const destination = useFlightStore((s) => s.destination);
  const timeline = useFlightStore((s) => s.eyeTimeline);
  const p = useFlightStore((s) => s.photometry);
  // O painel de efeitos traz o mesmo conteúdo, com as fórmulas, e precisa da altura.
  const effectsPanelOpen = useExplainSettings((s) => s.panelOpen);

  const sunDistanceAu = (AU_M + flight.positionM) / AU_M;
  const hologram: HologramMode = selectHologramMode({
    mode,
    flight,
    profile,
    sunDistanceAu,
    cmbTempK: p.cmbTempAheadK,
    cmbPeakNm: p.cmbWienPeakNm,
  });
  if (hologram === 'none' || effectsPanelOpen) return null;

  let content: ReactNode;
  switch (hologram) {
    case 'solar-system':
      content = <SolarSystemHologram au={sunDistanceAu} />;
      break;
    case 'cmb-spectrum':
      content = <CmbSpectrumHologram temperatureK={p.cmbTempAheadK} />;
      break;
    case 'lux-curve':
      content = <LuxCurveHologram timeline={timeline} tau={flight.tau} tauHalf={profile.tauHalf} lux={p.visibleLuxAhead} />;
      break;
    case 'countdown-flip':
      content = <CountdownHologram label="DECELERATION IN" remaining={profile.tauHalf - flight.tau} />;
      break;
    case 'countdown-arrival':
      content = <CountdownHologram label="DECELERATION COMPLETE IN" remaining={profile.tauTotal - flight.tau} />;
      break;
    case 'eye-adaptation':
      content = (
        <EyeAdaptationHologram
          pupilMm={p.pupilDiameterMm}
          retinaStops={p.retinaStops}
          whiteoutStops={p.whiteoutRetinaStops ?? 0}
          whiteoutTau={p.whiteoutTau ?? 0}
          dimmer={p.dimmerFactor}
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
          p.isWhiteoutHudActive
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
