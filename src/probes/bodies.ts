/**
 * Todos os corpos do simulador de sondas além do Sol: planetas (`planets.ts`),
 * luas e corpos pequenos, com posição e velocidade heliocêntricas (UA, UA/dia,
 * eclíptica J2000).
 *
 * - Luas: série de Fourier ajustada pelo script aos vetores do JPL Horizons de
 *   1970 a 2036, relativa ao centro do planeta (erro máximo de 3 a 130 km). Nos
 *   sobrevoos de luas, a sonda é desenhada relativa à lua desenhada.
 * - Corpos pequenos (cometa 67P, Arrokoth e os asteroides visitados): tabelas
 *   do Horizons nos anos das missões; fora delas, o corpo não aparece.
 */
import moonData from './data/moons.json';
import smallBodyData from './data/small-bodies.json';
import { interpolateState, muAu, tableEnd, tableStart, unpackTable, type StateTable, type TableState } from './ephemeris';
import { PLANETS, SUN_GM, planetPosition, planetVelocity, type PlanetId } from './planets';
import { add, scale, type Vec3 } from './vec3';

const AU_KM = 149_597_870.7;

export type MoonId = 'moon' | 'io' | 'europa' | 'ganymede' | 'callisto' | 'enceladus' | 'titan' | 'triton' | 'charon';
export type SmallBodyId = 'comet67p' | 'arrokoth' | 'steins' | 'lutetia' | 'gaspra' | 'ida';
export type BodyId = PlanetId | MoonId | SmallBodyId;

export interface Body {
  readonly id: BodyId;
  readonly name: string;
  readonly color: string;
  readonly radiusKm: number;
  /**
   * Parâmetro gravitacional GM (km³/s²), o mesmo usado pelo script para
   * escolher as amostras das janelas relativas. Corpos pequenos demais para
   * curvar uma trajetória ficam com 0.
   */
  readonly gm: number;
  readonly kind: 'planet' | 'moon' | 'comet' | 'asteroid' | 'kbo';
  /** Planeta em torno do qual a lua gira. */
  readonly parent?: PlanetId;
}

const GASEOUS: ReadonlySet<BodyId> = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
/** Planetas gasosos não têm superfície: a altitude conta a partir das nuvens. */
export const isGaseous = (id: BodyId) => GASEOUS.has(id);

const MOONS: Readonly<Record<MoonId, Omit<Body, 'id' | 'kind'>>> = {
  moon: { name: 'Lua', color: '#cbd5e1', radiusKm: 1737.4, gm: 4902.8, parent: 'earth' },
  io: { name: 'Io', color: '#eab308', radiusKm: 1821.6, gm: 5959.9, parent: 'jupiter' },
  europa: { name: 'Europa', color: '#d6c7a1', radiusKm: 1560.8, gm: 3202.7, parent: 'jupiter' },
  ganymede: { name: 'Ganimedes', color: '#a8a29e', radiusKm: 2634.1, gm: 9887.8, parent: 'jupiter' },
  callisto: { name: 'Calisto', color: '#78716c', radiusKm: 2410.3, gm: 7179.3, parent: 'jupiter' },
  enceladus: { name: 'Encélado', color: '#f1f5f9', radiusKm: 252.1, gm: 7.21, parent: 'saturn' },
  titan: { name: 'Titã', color: '#d4a24c', radiusKm: 2574.7, gm: 8978.1, parent: 'saturn' },
  triton: { name: 'Tritão', color: '#e7d7cf', radiusKm: 1353.4, gm: 1427.6, parent: 'neptune' },
  charon: { name: 'Caronte', color: '#a8a29e', radiusKm: 606, gm: 105.9, parent: 'pluto' },
};

const SMALL_BODIES: Readonly<Record<SmallBodyId, Omit<Body, 'id'>>> = {
  comet67p: { name: 'Cometa 67P', color: '#cbd5e1', radiusKm: 2, gm: 6.66e-7, kind: 'comet' },
  arrokoth: { name: 'Arrokoth', color: '#f97316', radiusKm: 18, gm: 0, kind: 'kbo' },
  steins: { name: 'Šteins', color: '#d6d3d1', radiusKm: 2.7, gm: 0, kind: 'asteroid' },
  lutetia: { name: 'Lutécia', color: '#a8a29e', radiusKm: 49, gm: 0, kind: 'asteroid' },
  gaspra: { name: 'Gaspra', color: '#d6d3d1', radiusKm: 6.1, gm: 0, kind: 'asteroid' },
  ida: { name: 'Ida', color: '#d6d3d1', radiusKm: 15.7, gm: 0, kind: 'asteroid' },
};

const planetBody = ({ id, name, color, radiusKm, gm }: (typeof PLANETS)[PlanetId]): Body => ({ id, name, color, radiusKm, gm, kind: 'planet' });

export const BODIES: Readonly<Record<BodyId, Body>> = {
  ...(Object.fromEntries(Object.values(PLANETS).map((p) => [p.id, planetBody(p)])) as Record<PlanetId, Body>),
  ...(Object.fromEntries(Object.entries(MOONS).map(([id, m]) => [id, { ...m, id, kind: 'moon' }])) as Record<MoonId, Body>),
  ...(Object.fromEntries(Object.entries(SMALL_BODIES).map(([id, b]) => [id, { ...b, id }])) as Record<SmallBodyId, Body>),
};

export const MOON_LIST: readonly Body[] = Object.keys(MOONS).map((id) => BODIES[id as MoonId]);
export const SMALL_BODY_LIST: readonly Body[] = Object.keys(SMALL_BODIES).map((id) => BODIES[id as SmallBodyId]);

export const isMoon = (id: string): id is MoonId => id in MOONS;
export const isSmallBody = (id: string): id is SmallBodyId => id in SMALL_BODIES;
export const isBody = (id: string): id is BodyId => id in BODIES;

// ── Luas ─────────────────────────────────────────────────────────────────────
interface MoonSeries {
  readonly parent: string;
  readonly t0: number;
  readonly maxErrorKm: number;
  readonly c: readonly number[];
  /** [f (rad/dia), ax, bx, ay, by, az, bz] em km. */
  readonly terms: readonly (readonly number[])[];
}

const SERIES = moonData.moons as Readonly<Record<MoonId, MoonSeries>>;

/** Posição (UA) e velocidade (UA/dia) da lua em relação ao centro do planeta. */
export function moonOffset(id: MoonId, t: number): TableState {
  const { t0, c, terms } = SERIES[id];
  const tau = t - t0;
  const r = [c[0]!, c[1]!, c[2]!];
  const v = [0, 0, 0];
  for (const term of terms) {
    const f = term[0]!;
    const cs = Math.cos(f * tau);
    const sn = Math.sin(f * tau);
    for (let k = 0; k < 3; k++) {
      const a = term[1 + 2 * k]!;
      const b = term[2 + 2 * k]!;
      r[k]! += a * cs + b * sn;
      v[k]! += f * (b * cs - a * sn);
    }
  }
  return { position: [r[0]! / AU_KM, r[1]! / AU_KM, r[2]! / AU_KM], velocity: [v[0]! / AU_KM, v[1]! / AU_KM, v[2]! / AU_KM] };
}

/** Período orbital da lua (dias), pelo termo dominante da série. */
export const moonPeriodDays = (id: MoonId) => (2 * Math.PI) / SERIES[id].terms[0]![0]!;

// ── Corpos pequenos ──────────────────────────────────────────────────────────
const SMALL_TABLES = Object.fromEntries(
  Object.entries(smallBodyData.bodies).map(([id, packed]) => [id, unpackTable(packed, muAu(SUN_GM))]),
) as Readonly<Record<SmallBodyId, StateTable>>;

/** Intervalo (dias desde J2000) em que o corpo pequeno tem dados. */
export function smallBodySpan(id: SmallBodyId): readonly [number, number] {
  const table = SMALL_TABLES[id];
  return [tableStart(table), tableEnd(table)];
}

// ── Estado de qualquer corpo ─────────────────────────────────────────────────
/** Posição e velocidade heliocêntricas; `null` para um corpo pequeno fora dos seus dados. */
export function bodyState(id: BodyId, t: number): TableState | null {
  if (isMoon(id)) {
    const parent = MOONS[id].parent!;
    const offset = moonOffset(id, t);
    return {
      position: add(planetPosition(parent, t), offset.position),
      velocity: add(planetVelocity(parent, t), offset.velocity),
    };
  }
  if (isSmallBody(id)) {
    const table = SMALL_TABLES[id];
    if (t < tableStart(table) || t > tableEnd(table)) return null;
    return interpolateState(table, t);
  }
  return { position: planetPosition(id, t), velocity: planetVelocity(id, t) };
}

export const bodyPosition = (id: BodyId, t: number): Vec3 | null => bodyState(id, t)?.position ?? null;

/** Raio do corpo em UA. */
export const bodyRadiusAu = (id: BodyId) => BODIES[id].radiusKm / AU_KM;

/** Velocidade em UA/dia → km/s. */
export const toKms = (v: Vec3): Vec3 => scale(v, AU_KM / 86_400);
