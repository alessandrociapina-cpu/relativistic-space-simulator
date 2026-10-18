/**
 * Números e unidades em TeX (renderizados pelo KaTeX) no padrão pt-BR das
 * explicações: vírgula decimal como `{,}` (sem o espaço que o TeX põe depois
 * de vírgulas) e milhares separados por espaço fino.
 */
import { LIGHT_YEAR_M } from '../physics/RelativityEngine';
import { formatDistance, formatSpan } from './format';

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,');

/**
 * `significant` algarismos significativos; de 10⁻³ a 10⁶ em notação decimal
 * (inteiros completos: 11 069, não 11 100), fora disso em potência de 10.
 */
export function texNumber(x: number, significant = 3): string {
  if (Number.isNaN(x)) return '\\text{—}';
  if (!Number.isFinite(x)) return x > 0 ? '\\infty' : '-\\infty';
  if (x === 0) return '0';
  const sign = x < 0 ? '-' : '';
  const a = Math.abs(x);
  const exponent = Math.floor(Math.log10(a));
  if (exponent >= 6 || exponent < -3) {
    const [mantissa = '', power = '0'] = a.toExponential(significant - 1).split('e');
    return `${sign}${mantissa.replace('.', '{,}')} \\times 10^{${Number(power)}}`;
  }
  const [int = '', frac] = a.toFixed(Math.max(0, significant - 1 - exponent)).split('.');
  return `${sign}${groupThousands(int)}${frac ? `{,}${frac}` : ''}`;
}

/** Texto já formatado em pt-BR dentro de uma fórmula. */
export const texText = (text: string) => `\\text{${text}}`;

export const texDuration = (seconds: number) => texText(formatSpan(seconds));
/** Distância como nos visores; acima de 10⁷ anos-luz, a potência de 10 em TeX (o "×" e os expoentes do visor não entram em \text). */
export const texDistance = (meters: number) =>
  meters >= 1e7 * LIGHT_YEAR_M ? `${texNumber(meters / LIGHT_YEAR_M, 4)}\\ \\text{anos-luz}` : texText(formatDistance(meters));

/** Escala por unidade, do maior para o menor; a última vale para todo o resto. */
function withUnit(value: number, units: readonly (readonly [number, string])[], significant = 3): string {
  const [scale, unit] = units.find(([s]) => value >= s) ?? units[units.length - 1]!;
  return `${texNumber(value / scale, significant)}\\ ${unit}`;
}

const SPEED_UNITS = [
  [1e3, '\\mathrm{km/s}'],
  [1, '\\mathrm{m/s}'],
  [1e-3, '\\mathrm{mm/s}'],
  [1e-6, '\\mu\\mathrm{m/s}'],
  [1e-9, '\\mathrm{nm/s}'],
  [1e-12, '\\mathrm{pm/s}'],
  [1e-15, '\\mathrm{fm/s}'],
] as const;

export const texSpeed = (metersPerSecond: number) => withUnit(metersPerSecond, SPEED_UNITS, 4);

const WAVELENGTH_UNITS = [
  [1e6, '\\mathrm{mm}'],
  [1e3, '\\mu\\mathrm{m}'],
  [1, '\\mathrm{nm}'],
  [1e-3, '\\mathrm{pm}'],
] as const;

export const texWavelengthNm = (nm: number) => withUnit(nm, WAVELENGTH_UNITS);

const ENERGY_UNITS = [
  [1e18, '\\mathrm{EeV}'],
  [1e15, '\\mathrm{PeV}'],
  [1e12, '\\mathrm{TeV}'],
  [1e9, '\\mathrm{GeV}'],
  [1e6, '\\mathrm{MeV}'],
  [1e3, '\\mathrm{keV}'],
  [1, '\\mathrm{eV}'],
] as const;

export const texEnergyEv = (ev: number) => withUnit(ev, ENERGY_UNITS);

const RAD_TO_DEG = 180 / Math.PI;

/** Ângulo em graus, minutos ou segundos de arco (entre chaves: `10^{-5}''` seria expoente duplo). */
export function texAngle(radians: number): string {
  const deg = radians * RAD_TO_DEG;
  if (deg >= 1) return `{${texNumber(deg, 3)}}^\\circ`;
  if (deg * 60 >= 1) return `{${texNumber(deg * 60, 3)}}'`;
  return `{${texNumber(deg * 3600, 3)}}''`;
}
