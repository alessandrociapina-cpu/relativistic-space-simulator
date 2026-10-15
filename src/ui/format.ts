/**
 * Formatação pt-BR das grandezas do HUD e dos controles.
 */
import { C, JULIAN_YEAR_S, LIGHT_SECOND_M, LIGHT_YEAR_M } from '../physics/RelativityEngine';
import { AU_M } from '../physics/sky';

const LOCALE = 'pt-BR';
const sig4 = new Intl.NumberFormat(LOCALE, { maximumSignificantDigits: 4 });

/** Casas decimais fixas com vírgula: 6.685 → "6,685". */
export function formatFixed(x: number, digits: number): string {
  return x.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
const fixed = formatFixed;

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** Notação científica: 3532000 → "3,53 × 10⁶". */
export function formatScientific(x: number, significant = 3): string {
  if (x === 0) return '0';
  const [mantissa = '', exponent = ''] = x.toExponential(significant - 1).split('e');
  const power = String(Number(exponent)).replace(/./g, (ch) => SUPERSCRIPT[ch] ?? ch);
  return `${fixed(Number(mantissa), significant - 1)} × 10${power}`;
}

/** Até 10⁴ com 4 algarismos significativos; acima, em notação científica. */
export function formatCompact(x: number): string {
  return Math.abs(x) < 1e4 ? sig4.format(x) : formatScientific(x);
}

/** γ com 3 casas até 10⁴ (mostra o afastamento de 1), depois científico. */
export function formatGamma(gamma: number): string {
  return gamma < 1e4 ? fixed(gamma, 3) : formatScientific(gamma);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Relógios: "12,3 s", "04:59,4", "05:12:08", "123,4 dias", "4,25 anos". Trunca, como um relógio. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${fixed(Math.floor(seconds * 10) / 10, 1)} s`;
  if (seconds < 3600) {
    const tenths = Math.floor(seconds * 10);
    const m = Math.floor(tenths / 600);
    const rest = tenths - m * 600;
    return `${pad2(m)}:${pad2(Math.floor(rest / 10))},${rest % 10}`;
  }
  if (seconds < 86_400) {
    const s = Math.floor(seconds);
    return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  }
  if (seconds < JULIAN_YEAR_S) return `${sig4.format(seconds / 86_400)} dias`;
  return `${sig4.format(seconds / JULIAN_YEAR_S)} anos`;
}

/** Distâncias: anos-luz → UA → segundos-luz → km. */
export function formatDistance(meters: number): string {
  if (meters >= 0.01 * LIGHT_YEAR_M) return `${sig4.format(meters / LIGHT_YEAR_M)} anos-luz`;
  if (meters >= 0.1 * AU_M) return `${sig4.format(meters / AU_M)} UA`;
  if (meters >= LIGHT_SECOND_M) return `${sig4.format(meters / LIGHT_SECOND_M)} s-luz`;
  return `${sig4.format(meters / 1000)} km`;
}

const SPEED_UNITS: readonly (readonly [number, string])[] = [
  [1e3, 'km/s'],
  [1, 'm/s'],
  [1e-3, 'mm/s'],
  [1e-6, 'µm/s'],
  [1e-9, 'nm/s'],
  [1e-12, 'pm/s'],
  [1e-15, 'fm/s'],
];

function formatSpeed(metersPerSecond: number): string {
  for (const [scale, unit] of SPEED_UNITS) {
    if (metersPerSecond >= scale) return `${sig4.format(metersPerSecond / scale)} ${unit}`;
  }
  return `${formatScientific(metersPerSecond)} m/s`;
}

/** v em frações de c até 0,99c; acima, quanto falta para c (c − v). */
export function formatVelocity(beta: number, oneMinusBeta: number): string {
  return beta < 0.99 ? `${fixed(beta, 4)} c` : `c − ${formatSpeed(C * oneMinusBeta)}`;
}
