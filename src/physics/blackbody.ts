/**
 * Corpo negro de Planck na CPU (64 bits): luminância fotométrica e cor.
 * Usa as mesmas funções de cor CIE 1931 do shader (ajuste multilobo de
 * Wyman, Sloan & Shirley, 2013), com ȳ(λ) = V(λ).
 */
import { C } from './RelativityEngine';

const PLANCK_H = 6.62607015e-34;
const BOLTZMANN_K = 1.380649e-23;
/** Eficácia luminosa máxima (lm/W). */
const LUMINOUS_EFFICACY = 683;

function lobe(x: number, mu: number, s1: number, s2: number): number {
  const d = (x - mu) * (x < mu ? s1 : s2);
  return Math.exp(-0.5 * d * d);
}

/** Funções de cor x̄, ȳ, z̄ em λ (nm). */
export function cieXyzBar(lambdaNm: number): [number, number, number] {
  const x =
    1.056 * lobe(lambdaNm, 599.8, 0.0264, 0.0323) +
    0.362 * lobe(lambdaNm, 442.0, 0.0624, 0.0374) -
    0.065 * lobe(lambdaNm, 501.1, 0.049, 0.0382);
  const y = 0.821 * lobe(lambdaNm, 568.8, 0.0213, 0.0247) + 0.286 * lobe(lambdaNm, 530.9, 0.0613, 0.0322);
  const z = 1.217 * lobe(lambdaNm, 437.0, 0.0845, 0.0278) + 0.681 * lobe(lambdaNm, 459.0, 0.0385, 0.0725);
  return [Math.max(x, 0), Math.max(y, 0), Math.max(z, 0)];
}

/** Radiância espectral de Planck B_λ (W·sr⁻¹·m⁻³). */
export function planckSpectralRadiance(lambdaM: number, temperatureK: number): number {
  const x = (PLANCK_H * C) / (lambdaM * BOLTZMANN_K * temperatureK);
  if (x > 700) return 0;
  return (2 * PLANCK_H * C * C) / lambdaM ** 5 / Math.expm1(x);
}

// Tabela de L_v(T) em log₁₀T ∈ [2, 9]; acima, Rayleigh–Jeans (L_v ∝ T).
const LOG_T_MIN = 2;
const LOG_T_MAX = 9;
const LOG_T_STEP = 0.01;
let luminanceTable: Float64Array | null = null;

function integrateLuminance(temperatureK: number): number {
  let sum = 0;
  for (let nm = 360; nm <= 830; nm += 2) {
    sum += planckSpectralRadiance(nm * 1e-9, temperatureK) * cieXyzBar(nm)[1] * 2e-9;
  }
  return LUMINOUS_EFFICACY * sum;
}

/** Luminância (cd/m²) da superfície de um corpo negro à temperatura T. */
export function blackbodyLuminance(temperatureK: number): number {
  if (!(temperatureK > 0)) return 0;
  if (!luminanceTable) {
    const n = Math.round((LOG_T_MAX - LOG_T_MIN) / LOG_T_STEP);
    luminanceTable = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) luminanceTable[i] = integrateLuminance(10 ** (LOG_T_MIN + i * LOG_T_STEP));
  }
  const table = luminanceTable;
  const p = (Math.log10(temperatureK) - LOG_T_MIN) / LOG_T_STEP;
  if (p <= 0) return 0;
  const last = table.length - 1;
  if (p >= last) return table[last]! * (temperatureK / 10 ** LOG_T_MAX);
  const i = Math.floor(p);
  const f = p - i;
  return table[i]! * (1 - f) + table[i + 1]! * f;
}

/** Cor linear sRGB de um corpo negro, normalizada para luminância Y = 1. */
export function blackbodyLinearRgb(temperatureK: number): [number, number, number] {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let nm = 380; nm <= 780; nm += 5) {
    const b = planckSpectralRadiance(nm * 1e-9, temperatureK);
    const [xb, yb, zb] = cieXyzBar(nm);
    X += b * xb;
    Y += b * yb;
    Z += b * zb;
  }
  if (!(Y > 0)) return [0, 0, 0];
  X /= Y;
  Z /= Y;
  return [
    Math.max(3.2404542 * X - 1.5371385 - 0.4985314 * Z, 0),
    Math.max(-0.969266 * X + 1.8760108 + 0.041556 * Z, 0),
    Math.max(0.0556434 * X - 0.2040259 + 1.0572252 * Z, 0),
  ];
}

const toSrgbByte = (v: number) => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(s, 0), 1) * 255);
};

/** Cor CSS (#rrggbb) do corpo negro, com o canal mais forte em 100%. */
export function blackbodyCssColor(temperatureK: number): string {
  const rgb = blackbodyLinearRgb(temperatureK);
  const max = Math.max(...rgb, 1e-12);
  return `#${rgb.map((v) => toSrgbByte(v / max).toString(16).padStart(2, '0')).join('')}`;
}
