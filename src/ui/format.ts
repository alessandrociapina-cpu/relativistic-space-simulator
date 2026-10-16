/**
 * Formatação pt-BR das grandezas do HUD e dos controles.
 */
import { C, JULIAN_YEAR_S, LIGHT_SECOND_M, LIGHT_YEAR_M } from '../physics/RelativityEngine';
import { AU_M } from '../physics/sky';

const LOCALE = 'pt-BR';

/** Milhares com espaço na parte inteira ("2 537 000"): o ponto do pt-BR se confundiria com a vírgula. */
const groupThousands = (s: string) => s.replace(/^-?\d{4,}/, (int) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));

function significant(digits: number, keepZeros: boolean): (x: number) => string {
  const f = new Intl.NumberFormat(LOCALE, {
    maximumSignificantDigits: digits,
    ...(keepZeros ? { minimumSignificantDigits: digits } : {}),
    useGrouping: false,
  });
  return (x) => groupThousands(f.format(x));
}

// Texto corrido: sem zeros à direita ("4,4 s").
const sig3 = significant(3, false);
const sig4 = significant(4, false);
// Visores que mudam a cada quadro: algarismos fixos, com os zeros ("4,40"), para o
// número não encolher e empurrar o texto quando um algarismo some.
const sig3Fixed = significant(3, true);
const sig4Fixed = significant(4, true);

/** Casas decimais fixas com vírgula: 6.685 → "6,685". */
export function formatFixed(x: number, digits: number): string {
  return groupThousands(x.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }));
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
  return Math.abs(x) < 1e4 ? sig4(x) : formatScientific(x);
}

/** γ com 3 casas até 10⁴ (mostra o afastamento de 1), depois científico. */
export function formatGamma(gamma: number): string {
  return gamma < 1e4 ? fixed(gamma, 3) : formatScientific(gamma);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Relógios: "12,3 s", "04:59,4", "05:12:08", "123,4 dias", "4,250 anos". Trunca, como um relógio. */
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
  if (seconds < JULIAN_YEAR_S) return `${sig4Fixed(seconds / 86_400)} dias`;
  return `${sig4Fixed(seconds / JULIAN_YEAR_S)} anos`;
}

/** Distâncias: anos-luz → UA → segundos-luz → km. */
export function formatDistance(meters: number): string {
  // Na chegada sobra só o ruído de arredondamento (~10⁻²³ m): é zero.
  if (meters < 0.5) return '0 km';
  if (meters >= 0.01 * LIGHT_YEAR_M) return `${sig4Fixed(meters / LIGHT_YEAR_M)} anos-luz`;
  if (meters >= 0.1 * AU_M) return `${sig4Fixed(meters / AU_M)} UA`;
  if (meters >= LIGHT_SECOND_M) return `${sig4Fixed(meters / LIGHT_SECOND_M)} s-luz`;
  return `${sig4Fixed(meters / 1000)} km`;
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

export function formatSpeed(metersPerSecond: number): string {
  for (const [scale, unit] of SPEED_UNITS) {
    if (metersPerSecond >= scale) return `${sig4Fixed(metersPerSecond / scale)} ${unit}`;
  }
  return `${formatScientific(metersPerSecond)} m/s`;
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Números no texto corrido das explicações: milhares com espaço ("2 697", que
 * em pt-BR não se confunde com 2,697) e notação científica a partir de 10⁶.
 */
export function formatProse(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e6) return formatScientific(x);
  if (a >= 1000) return formatSpaceNumber(x);
  return sig3(x);
}

/** Como `formatProse`, mas para visores ao vivo: mantém os zeros à direita ("4,40 UA", não "4,4 UA"). */
export function formatReadout(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e6) return formatScientific(x);
  if (a >= 1000) return formatSpaceNumber(x);
  return sig3Fixed(x);
}

/**
 * Durações, no texto corrido e nas contagens: "4,4 s", "22 min 28 s", "7 h 06 min",
 * "32,3 dias", "4,25 anos". Sempre com três algarismos ("12,0 dias"): uma contagem
 * não muda de largura quando o último algarismo é zero.
 */
export function formatSpan(seconds: number): string {
  if (seconds < 59.95) return `${fixed(seconds, 1)} s`;
  if (seconds < 3599.5) {
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)} min ${pad2(s % 60)} s`;
  }
  if (seconds < 86_370) {
    const m = Math.round(seconds / 60);
    return `${Math.floor(m / 60)} h ${pad2(m % 60)} min`;
  }
  if (seconds < JULIAN_YEAR_S) return `${sig3Fixed(seconds / 86_400)} dias`;
  return `${sig3Fixed(seconds / JULIAN_YEAR_S)} anos`;
}

/** Comprimentos de onda: "394 nm", "1,06 mm", "190 pm". */
export function formatWavelengthNm(nm: number): string {
  if (nm >= 1e6) return `${sig3Fixed(nm / 1e6)} mm`;
  if (nm >= 1e3) return `${sig3Fixed(nm / 1e3)} µm`;
  if (nm >= 1) return `${sig3Fixed(nm)} nm`;
  return `${sig3Fixed(nm * 1e3)} pm`;
}

/** Ângulos pequenos: "30,0°", "5,73′", "0,0584″". */
export function formatAngle(radians: number): string {
  const deg = radians * RAD_TO_DEG;
  if (deg >= 1) return `${fixed(deg, 1)}°`;
  if (deg * 60 >= 1) return `${sig3Fixed(deg * 60)}′`;
  return `${sig3Fixed(deg * 3600)}″`;
}

const ENERGY_PREFIXES = ['', 'k', 'M', 'G', 'T', 'P', 'E'] as const;

/** Energias de partículas e fótons: "4,67 keV", "3,31 PeV". */
export function formatEnergyEv(ev: number): string {
  const k = Math.min(Math.max(Math.floor(Math.log10(ev) / 3), 0), ENERGY_PREFIXES.length - 1);
  return `${sig3Fixed(ev / 1000 ** k)} ${ENERGY_PREFIXES[k]}eV`;
}

/** Inteiros com espaço como separador de milhar, no estilo das telas de referência: "3 123 953". */
export function formatSpaceNumber(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Distâncias do mapa de rota: UA até 600 UA, depois anos-luz ("a.l."). */
export function formatRouteDistance(meters: number): string {
  const au = meters / AU_M;
  if (au < 600) return `${fixed(au, au < 10 ? 2 : au < 100 ? 1 : 0)} UA`;
  const ly = meters / LIGHT_YEAR_M;
  return ly < 1000 ? `${fixed(ly, ly < 10 ? 2 : 1)} a.l.` : `${formatSpaceNumber(ly)} a.l.`;
}

/** v em frações de c até 0,99c; acima, quanto falta para c (c − v). */
export function formatVelocity(beta: number, oneMinusBeta: number): string {
  return beta < 0.99 ? `${fixed(beta, 4)} c` : `c − ${formatSpeed(C * oneMinusBeta)}`;
}

/** Aceleração em g: "0,3 g", "1,5 g", "10 000 g", "1,61 × 10⁶ g". */
export function formatAccelG(g: number): string {
  return `${formatProse(g)} g`;
}
