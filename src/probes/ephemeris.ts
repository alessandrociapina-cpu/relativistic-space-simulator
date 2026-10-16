/**
 * Tabelas de estado do JPL Horizons (posição e velocidade) e sua interpolação.
 *
 * Entre duas amostras a e b, a sonda segue a órbita de Kepler em torno do
 * corpo central propagada a partir de a, mais uma correção cúbica de Hermite
 * que leva exatamente ao estado de b. A cônica dá conta da curvatura (um
 * periélio, uma passagem rente a Júpiter) e a correção, das perturbações
 * suaves (outros planetas, a maré do Sol). O script
 * `scripts/fetch-horizons.mjs` faz a mesma conta e só guarda as amostras de
 * que ela precisa para errar menos de 150 km (15 km nos sobrevoos).
 */
import { propagate } from './kepler';
import { add, scale, sub, type Vec3 } from './vec3';

const AU_KM = 149_597_870.7;
const DAY_S = 86_400;

/** GM em km³/s² → UA³/dia², a unidade das tabelas. */
export const muAu = (gm: number) => (gm * DAY_S * DAY_S) / AU_KM ** 3;

/** Formato dos JSON em `src/probes/data`: tempos (dias desde J2000) e 6 números por amostra. */
export interface PackedTable {
  readonly t: readonly number[];
  readonly s: readonly number[];
}

export interface StateTable {
  readonly t: Float64Array;
  /** x, y, z (UA) e vx, vy, vz (UA/dia) de cada amostra, em sequência. */
  readonly s: Float64Array;
  /** GM do corpo central (UA³/dia²). */
  readonly mu: number;
  /** Estado de cada amostra propagado até a seguinte (NaN até ser usado). */
  readonly ends: Float64Array;
}

export interface TableState {
  readonly position: Vec3;
  readonly velocity: Vec3;
}

export function unpackTable(packed: PackedTable, mu: number): StateTable {
  if (packed.s.length !== packed.t.length * 6) throw new Error('Tabela de estados malformada');
  const n = packed.t.length;
  return { t: Float64Array.from(packed.t), s: Float64Array.from(packed.s), mu, ends: new Float64Array(Math.max(n - 1, 0) * 6).fill(NaN) };
}

export const tableStart = (table: StateTable) => table.t[0]!;
export const tableEnd = (table: StateTable) => table.t[table.t.length - 1]!;

/** Índice i com t[i] ≤ t < t[i+1] (limitado às pontas). */
function segmentIndex(table: StateTable, t: number): number {
  const times = table.t;
  let lo = 0;
  let hi = times.length - 1;
  if (t <= times[0]!) return 0;
  if (t >= times[hi]!) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

const sample = (s: Float64Array, i: number) => {
  const o = i * 6;
  return { r: [s[o]!, s[o + 1]!, s[o + 2]!] as Vec3, v: [s[o + 3]!, s[o + 4]!, s[o + 5]!] as Vec3 };
};

/** Amostra i propagada por Kepler até o instante da amostra i + 1 (guardada). */
function segmentEnd(table: StateTable, i: number) {
  const o = i * 6;
  const ends = table.ends;
  if (Number.isNaN(ends[o])) {
    const end = propagate(sample(table.s, i), table.t[i + 1]! - table.t[i]!, table.mu);
    ends.set([...end.r, ...end.v], o);
  }
  return { r: [ends[o]!, ends[o + 1]!, ends[o + 2]!] as Vec3, v: [ends[o + 3]!, ends[o + 4]!, ends[o + 5]!] as Vec3 };
}

/**
 * Estado interpolado no instante t: posição (UA) e velocidade (UA/dia). Fora
 * da tabela, segue a órbita de Kepler a partir da ponta mais próxima.
 */
export function interpolateState(table: StateTable, t: number): TableState {
  const { t: times, s, mu } = table;
  const last = times.length - 1;
  if (last === 0 || t <= times[0]! || t >= times[last]!) {
    const i = last === 0 || t <= times[0]! ? 0 : last;
    const p = propagate(sample(s, i), t - times[i]!, mu);
    return { position: p.r, velocity: p.v };
  }
  const i = segmentIndex(table, t);
  const h = times[i + 1]! - times[i]!;
  const u = (t - times[i]!) / h;
  const p = propagate(sample(s, i), t - times[i]!, mu);
  const end = segmentEnd(table, i);
  const b = sample(s, i + 1);
  // Correção de Hermite que zera em a (posição e velocidade) e leva ao estado de b.
  const dr = sub(b.r, end.r);
  const dv = sub(b.v, end.v);
  const h01 = u * u * (3 - 2 * u);
  const h11 = u * u * (u - 1) * h;
  const d01 = (6 * u * (1 - u)) / h;
  const d11 = u * (3 * u - 2);
  return {
    position: add(p.r, add(scale(dr, h01), scale(dv, h11))),
    velocity: add(p.v, add(scale(dr, d01), scale(dv, d11))),
  };
}

export const interpolatePosition = (table: StateTable, t: number): Vec3 => interpolateState(table, t).position;
