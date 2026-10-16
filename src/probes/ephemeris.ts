/**
 * Tabelas de estado do JPL Horizons (posição e velocidade) e sua interpolação
 * de Hermite cúbica. O script `scripts/fetch-horizons.mjs` só guarda as
 * amostras de que a interpolação precisa para errar menos de 150 km (15 km
 * perto dos planetas).
 */
import type { Vec3 } from './vec3';

/** Formato dos JSON em `src/probes/data`: tempos (dias desde J2000) e 6 números por amostra. */
export interface PackedTable {
  readonly t: readonly number[];
  readonly s: readonly number[];
}

export interface StateTable {
  readonly t: Float64Array;
  /** x, y, z (UA) e vx, vy, vz (UA/dia) de cada amostra, em sequência. */
  readonly s: Float64Array;
}

export function unpackTable(packed: PackedTable): StateTable {
  if (packed.s.length !== packed.t.length * 6) throw new Error('Tabela de estados malformada');
  return { t: Float64Array.from(packed.t), s: Float64Array.from(packed.s) };
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

/**
 * Estado interpolado no instante t: posição (UA) e velocidade (UA/dia). Fora
 * da tabela, extrapola em linha reta a partir da ponta mais próxima.
 */
export function interpolateState(table: StateTable, t: number): { position: Vec3; velocity: Vec3 } {
  const { t: times, s } = table;
  const last = times.length - 1;
  if (t <= times[0]! || t >= times[last]!) {
    const i = t <= times[0]! ? 0 : last;
    const dt = t - times[i]!;
    const o = i * 6;
    return {
      position: [s[o]! + s[o + 3]! * dt, s[o + 1]! + s[o + 4]! * dt, s[o + 2]! + s[o + 5]! * dt],
      velocity: [s[o + 3]!, s[o + 4]!, s[o + 5]!],
    };
  }
  const i = segmentIndex(table, t);
  const h = times[i + 1]! - times[i]!;
  const u = (t - times[i]!) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  // Bases de Hermite e suas derivadas em u.
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const d00 = (6 * u2 - 6 * u) / h;
  const d10 = 3 * u2 - 4 * u + 1;
  const d01 = (-6 * u2 + 6 * u) / h;
  const d11 = 3 * u2 - 2 * u;
  const a = i * 6;
  const b = a + 6;
  const pos = [0, 0, 0];
  const vel = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const p0 = s[a + k]!;
    const v0 = s[a + 3 + k]!;
    const p1 = s[b + k]!;
    const v1 = s[b + 3 + k]!;
    pos[k] = h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1;
    vel[k] = d00 * p0 + d10 * v0 + d01 * p1 + d11 * v1;
  }
  return { position: [pos[0]!, pos[1]!, pos[2]!], velocity: [vel[0]!, vel[1]!, vel[2]!] };
}

export const interpolatePosition = (table: StateTable, t: number): Vec3 => interpolateState(table, t).position;
