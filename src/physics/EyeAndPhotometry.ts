/**
 * Fotometria da CMB à frente, adaptação do olho do piloto e auto-zoom do
 * telescópio.
 *
 * A iluminância é calculada pela física, não por ajuste: integrando a
 * luminância de Planck da CMB aberrada e desviada pelo Doppler sobre o
 * hemisfério frontal, o pico sai em ≈ 11 069 lux (γ ≈ 6 955) e 10 799 lux em
 * γ = 9 356, os marcos do vídeo de referência (11 065 e 10 796 lux).
 */
import {
  T_CMB_0,
  computeFlightState,
  computeShaderKinematics,
  type FlightState,
  type MissionProfile,
} from './RelativityEngine';
import { blackbodyLinearRgb, blackbodyLuminance } from './blackbody';

/** Constante de deslocamento de Wien (nm·K). */
export const WIEN_NM_K = 2.897771955e6;

/** FOV vertical do para-brisa; os zooms "x N" são relativos a ele. */
export const WINDSHIELD_FOV_DEG = 70;

/** Temperatura da CMB exatamente à frente: T₀·D_max, com D_max = γ(1 + β) = e^η. */
export function cmbTemperatureAhead(eta: number): number {
  return T_CMB_0 * Math.exp(eta);
}

export function wienPeakNm(temperatureK: number): number {
  return WIEN_NM_K / temperatureK;
}

// ── Iluminância visível à frente ─────────────────────────────────────────────
/**
 * E = 2π ∫₀¹ L_v(T₀·D(u)) (1 − u) du, com u = 1 − cosθ e D = 1/(γ(δ + βu)).
 * O integrando vive em u ≲ 1/γ², então a integração é em ln u.
 */
function integrateVisibleLux(eta: number): number {
  if (eta <= 0) return 0;
  const { uBeta: beta, uGamma: gamma, uOneMinusBeta: delta } = computeShaderKinematics(eta);
  const lnLo = Math.log(delta * 1e-4);
  const steps = 300;
  const h = -lnLo / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const u = Math.exp(lnLo + (i + 0.5) * h);
    sum += blackbodyLuminance(T_CMB_0 / (gamma * (delta + beta * u))) * (1 - u) * u * h;
  }
  return 2 * Math.PI * sum;
}

const LUX_ETA_MAX = 45;
const LUX_ETA_STEP = 0.01;
let luxTable: Float64Array | null = null;

function getLuxTable(): Float64Array {
  if (!luxTable) {
    const n = Math.round(LUX_ETA_MAX / LUX_ETA_STEP);
    luxTable = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) luxTable[i] = integrateVisibleLux(i * LUX_ETA_STEP);
  }
  return luxTable;
}

/** Iluminância visível (lux) da CMB num plano voltado para a frente, na rapidez η. */
export function visibleLuxAhead(eta: number): number {
  const table = getLuxTable();
  const p = Math.min(Math.max(eta, 0), LUX_ETA_MAX) / LUX_ETA_STEP;
  const i = Math.min(Math.floor(p), table.length - 2);
  const f = p - i;
  return table[i]! * (1 - f) + table[i + 1]! * f;
}

let luxPeak: { readonly lux: number; readonly eta: number } | null = null;

function getLuxPeak() {
  if (!luxPeak) {
    const table = getLuxTable();
    let peak = 0;
    for (let i = 1; i < table.length; i++) if (table[i]! > table[peak]!) peak = i;
    luxPeak = { lux: table[peak]!, eta: peak * LUX_ETA_STEP };
  }
  return luxPeak;
}

/** Maior iluminância que a CMB pode produzir à frente, em qualquer γ (≈ 11 069 lux). */
export function peakCmbLux(): number {
  return getLuxPeak().lux;
}

/**
 * Rapidez do pico de iluminância (γ ≈ 6 955). Acima dela o cone quente à frente
 * encolhe (∝ 1/γ²) mais rápido do que o brilho visível cresce (∝ T), e E cai.
 */
export function peakCmbLuxRapidity(): number {
  return getLuxPeak().eta;
}

// ── Olho do piloto ───────────────────────────────────────────────────────────
/**
 * Parâmetros fisiológicos, arredondados e calibrados para reproduzir os marcos
 * do vídeo na missão para Proxima (retina ≈ −12,9 stops e ≈ 1 260× mais escuro
 * na frenagem; pupila ≈ 2,14 mm).
 */
export const EYE = {
  /** Iluminância de referência dos stops da retina (lux). */
  referenceLux: 0.7,
  /** Constante de tempo da adaptação à luz (s de tempo próprio). */
  lightAdaptationS: 60,
  /** Constante de tempo da recuperação no escuro (cones e bastonetes, ~20 min). */
  darkAdaptationS: 1200,
  pupilConstrictionS: 0.5,
  pupilDilationS: 300,
} as const;

/** Diâmetro de pupila em equilíbrio (Moon & Spencer, 1944), tomando a iluminância frontal como adaptação. */
export function steadyPupilMm(lux: number): number {
  return 4.9 - 3 * Math.tanh(0.4 * Math.log10(Math.max(lux, 1e-6)));
}

/** Dessensibilização de equilíbrio da retina (stops, positiva) para uma iluminância. */
export function retinaTargetStops(lux: number): number {
  return Math.log2(1 + lux / EYE.referenceLux);
}

export interface EyeTimeline {
  readonly dt: number;
  readonly lux: Float64Array;
  readonly pupilMm: Float64Array;
  /** Dessensibilização da retina (stops, positiva). */
  readonly stops: Float64Array;
  readonly peakLux: number;
  readonly peakLuxTau: number;
}

export const EYE_TIMELINE_SAMPLES = 2400;

const relax = (current: number, target: number, dt: number, tau: number) =>
  target + (current - target) * Math.exp(-dt / tau);

/**
 * Integra a adaptação do olho ao longo da missão inteira, em tempo próprio.
 * Pré-calculada por missão, a linha do tempo é determinística: o scrub para
 * qualquer τ mostra o mesmo estado que o voo contínuo.
 */
export function computeEyeTimeline(profile: MissionProfile): EyeTimeline {
  const n = EYE_TIMELINE_SAMPLES;
  const dt = profile.tauTotal / n;
  const lux = new Float64Array(n + 1);
  const pupilMm = new Float64Array(n + 1);
  const stops = new Float64Array(n + 1);
  let peakIndex = 0;

  for (let i = 0; i <= n; i++) {
    lux[i] = visibleLuxAhead(computeFlightState(profile, i * dt).eta);
    if (lux[i]! > lux[peakIndex]!) peakIndex = i;
    if (i === 0) {
      pupilMm[0] = steadyPupilMm(lux[0]!);
      stops[0] = retinaTargetStops(lux[0]!);
      continue;
    }
    const s = retinaTargetStops(lux[i]!);
    const r = stops[i - 1]!;
    stops[i] = relax(r, s, dt, s > r ? EYE.lightAdaptationS : EYE.darkAdaptationS);
    const p = steadyPupilMm(lux[i]!);
    const q = pupilMm[i - 1]!;
    pupilMm[i] = relax(q, p, dt, p < q ? EYE.pupilConstrictionS : EYE.pupilDilationS);
  }

  return { dt, lux, pupilMm, stops, peakLux: lux[peakIndex]!, peakLuxTau: peakIndex * dt };
}

function sample(values: Float64Array, timeline: EyeTimeline, tau: number): number {
  const p = Math.min(Math.max(tau / timeline.dt, 0), values.length - 1);
  const i = Math.min(Math.floor(p), values.length - 2);
  const f = p - i;
  return values[i]! * (1 - f) + values[i + 1]! * f;
}

// ── Telescópio ───────────────────────────────────────────────────────────────
const TELESCOPE_MIN_ZOOM = 13;
/** Zoom ≈ 0,253·γ: FOV ≈ 4,8/γ rad, que enquadra o cone frontal comprimido. */
const CONE_ZOOM_PER_GAMMA = 0.253;
/** Fração da altura do monitor ocupada pelo alvo na chegada. */
const TARGET_FILL = 0.35;

/** Auto-zoom do telescópio ("TELESCOPE · x N"), relativo ao para-brisa. */
export function recommendedTelescopeZoom(eta: number, targetRadiusRestRad: number): number {
  const cone = CONE_ZOOM_PER_GAMMA * Math.cosh(eta);
  // Aberração à frente: tan(θ'/2) = e^(−η)·tan(θ/2)
  const apparentRadius = 2 * Math.atan(Math.exp(-eta) * Math.tan(targetRadiusRestRad / 2));
  const frame = ((WINDSHIELD_FOV_DEG * Math.PI) / 180) * TARGET_FILL / (2 * apparentRadius);
  return Math.max(TELESCOPE_MIN_ZOOM, Math.min(cone, frame));
}

// ── Estado consolidado para HUD, hologramas e shader ─────────────────────────
/**
 * A exposição do render não é fotometria absoluta, então os stops da retina
 * são comprimidos: a cena escurece de leve com a adaptação (Proxima continua
 * visível na chegada) e o véu escurece forte (2^(−0,5·R) no total), deixando o
 * white-out da ida estourado e a mesma luz na frenagem como uma névoa fraca.
 */
const SCENE_ADAPTATION = 0.1;
const GLARE_ADAPTATION = 0.4;
/** Intensidade do véu de espalhamento (display-referred) no pico de iluminância. */
const GLARE_GAIN = 5.5;
const EYE_HAZARD_LUX = 1500;
const EYE_HAZARD_GAMMA = { min: 200, max: 12_000 } as const;
const WHITEOUT_HUD_THRESHOLD = 0.25;

export interface PhotometryAndEyeState {
  readonly cmbTempAheadK: number;
  readonly cmbWienPeakNm: number;
  /** D_max = γ(1 + β) = e^η. */
  readonly dopplerAhead: number;
  readonly visibleLuxAhead: number;
  /** Pico de iluminância da missão (≤ 11 069 lux). */
  readonly peakLuxRecorded: number;
  readonly pupilDiameterMm: number;
  /** Adaptação da retina em stops (≤ 0; −12,9 = 2¹²·⁹ vezes menos sensível). */
  readonly retinaStops: number;
  /** Na frenagem: quantas vezes a mesma luz do instante espelho da ida parece mais fraca agora. */
  readonly dimmerFactor: number;
  /** Instante da ida com a mesma luz de agora (τ_total − τ), na frenagem. */
  readonly whiteoutTau: number | null;
  readonly whiteoutRetinaStops: number | null;
  readonly whiteoutPupilMm: number | null;
  readonly eyeSensitivity: number;
  readonly glareIntensity: number;
  readonly glareColor: readonly [number, number, number];
  readonly isEyeHazard: boolean;
  readonly isWhiteoutHudActive: boolean;
  readonly recommendedTelescopeZoom: number;
}

export function computePhotometryAndEyeState(
  flight: FlightState,
  profile: MissionProfile,
  timeline: EyeTimeline,
  targetRadiusRestRad: number,
): PhotometryAndEyeState {
  const lux = visibleLuxAhead(flight.eta);
  const cmbTempAheadK = cmbTemperatureAhead(flight.eta);
  const cruise = flight.phase === 'cruise';

  // No Cruzeiro Livre o olho está em equilíbrio com a luz atual.
  const pupil = cruise ? steadyPupilMm(lux) : sample(timeline.pupilMm, timeline, flight.tau);
  const stops = cruise ? retinaTargetStops(lux) : sample(timeline.stops, timeline, flight.tau);

  let dimmerFactor = 1;
  let whiteoutTau: number | null = null;
  let whiteoutRetinaStops: number | null = null;
  let whiteoutPupilMm: number | null = null;
  if (flight.phase === 'decelerating') {
    // E(τ) = E(τ_total − τ): a mesma luz da ida, vista com o olho de agora.
    whiteoutTau = profile.tauTotal - flight.tau;
    const mirrorStops = sample(timeline.stops, timeline, whiteoutTau);
    whiteoutPupilMm = sample(timeline.pupilMm, timeline, whiteoutTau);
    whiteoutRetinaStops = -mirrorStops;
    dimmerFactor = 2 ** (stops - mirrorStops) * (whiteoutPupilMm / pupil) ** 2;
  }

  const eyeSensitivity = 2 ** (-SCENE_ADAPTATION * stops);
  const glareIntensity = GLARE_GAIN * (lux / peakCmbLux()) ** 0.75 * 2 ** (-GLARE_ADAPTATION * stops);

  return {
    cmbTempAheadK,
    cmbWienPeakNm: wienPeakNm(cmbTempAheadK),
    dopplerAhead: Math.exp(flight.eta),
    visibleLuxAhead: lux,
    peakLuxRecorded: timeline.peakLux,
    pupilDiameterMm: pupil,
    retinaStops: -stops,
    dimmerFactor,
    whiteoutTau,
    whiteoutRetinaStops,
    whiteoutPupilMm,
    eyeSensitivity,
    glareIntensity,
    glareColor: blackbodyLinearRgb(cmbTempAheadK),
    isEyeHazard:
      lux > EYE_HAZARD_LUX ||
      (flight.phase === 'accelerating' && flight.gamma >= EYE_HAZARD_GAMMA.min && flight.gamma <= EYE_HAZARD_GAMMA.max),
    isWhiteoutHudActive: glareIntensity * eyeSensitivity > WHITEOUT_HUD_THRESHOLD,
    recommendedTelescopeZoom: recommendedTelescopeZoom(flight.eta, targetRadiusRestRad),
  };
}

// ── Formatação de v/c ────────────────────────────────────────────────────────
/**
 * v/c em porcentagem, com os noves agrupados de 3 em 3 a partir de
 * 1 − β = e^(−η)/cosh η (sem subtração): γ = 3 123 953 → "99.999 999 999 994 9 %".
 */
export function formatRelativisticSpeedPercent(eta: number): string {
  const a = Math.abs(eta);
  const oneMinusBeta = Math.exp(-a) / Math.cosh(a);
  if (oneMinusBeta > 1e-3) {
    const pct = Math.tanh(a) * 100;
    return `${pct.toFixed(pct < 99 ? 1 : 3)} %`;
  }
  // 100 − P = m·10^e, m ∈ [1, 10): depois da vírgula vêm (−e − 1) noves e os
  // dois algarismos de (10 − m).
  const deficit = 100 * oneMinusBeta;
  const e = Math.floor(Math.log10(deficit));
  const tail = Math.min(99, Math.round((10 - deficit / 10 ** e) * 10));
  const decimals = '9'.repeat(Math.max(0, -e - 1)) + String(tail).padStart(2, '0');
  return `99.${decimals.replace(/(\d{3})(?=\d)/g, '$1 ')} %`;
}
