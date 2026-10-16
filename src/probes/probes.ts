/**
 * Trajetórias das sondas a partir das tabelas do JPL Horizons.
 *
 * Fora dos encontros vale a tabela heliocêntrica. Num encontro (partida da
 * Terra ou sobrevoo), a sonda é posicionada em relação ao planeta desenhado:
 * planeta(t) + trajetória relativa do Horizons. Assim o sobrevoo passa no
 * lugar exato mesmo com o planeta pelos elementos aproximados. Nas bordas da
 * janela as duas posições se misturam suavemente, sem saltos.
 */
import { interpolateState, tableEnd, tableStart, unpackTable, type PackedTable, type StateTable } from './ephemeris';
import { PLANETS, SUN_GM, planetPosition, planetVelocity, type PlanetId } from './planets';
import { add, angle, lerp, norm, sub, type Vec3 } from './vec3';

export const AU_KM = 149_597_870.7;
export const DAY_S = 86_400;
/** Velocidade da luz (km/s). */
export const C_KMS = 299_792.458;
/** UA/dia → km/s. */
export const AU_PER_DAY_TO_KMS = AU_KM / DAY_S;

export interface ProbeData {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly helio: PackedTable;
  readonly encounters: readonly (PackedTable & { readonly body: string })[];
}

export interface Encounter {
  readonly body: PlanetId;
  readonly table: StateTable;
  readonly start: number;
  readonly end: number;
  /** A partida começa colada na Terra: sem rampa de mistura na entrada. */
  readonly departure: boolean;
}

export interface ProbeTrajectory {
  readonly id: string;
  readonly name: string;
  readonly helio: StateTable;
  readonly encounters: readonly Encounter[];
  /** Primeiro e último instante com dados (dias desde J2000). */
  readonly launch: number;
  readonly end: number;
}

const isPlanet = (body: string): body is PlanetId => body in PLANETS;

export function loadTrajectory(data: ProbeData): ProbeTrajectory {
  const helio = unpackTable(data.helio);
  const launch = tableStart(helio);
  const encounters = data.encounters.map((e): Encounter => {
    if (!isPlanet(e.body)) throw new Error(`Corpo desconhecido no encontro: ${e.body}`);
    const table = unpackTable(e);
    const start = tableStart(table);
    return { body: e.body, table, start, end: tableEnd(table), departure: start - launch < 1e-6 };
  });
  return { id: data.id, name: data.name, helio, encounters, launch, end: tableEnd(helio) };
}

/** Fração das bordas da janela em que a posição relativa ganha peso gradualmente. */
const BLEND_FRACTION = 0.25;

const smoothstep = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};

/** Peso da posição relativa ao planeta: 1 no miolo da janela, 0 nas pontas. */
export function encounterWeight(e: Encounter, t: number): number {
  if (t < e.start || t > e.end) return 0;
  const ramp = BLEND_FRACTION * (e.end - e.start);
  const fromStart = e.departure ? 1 : smoothstep((t - e.start) / ramp);
  return Math.min(fromStart, smoothstep((e.end - t) / ramp));
}

/** Posição heliocêntrica (UA) da sonda; `null` antes do lançamento. */
export function probePosition(probe: ProbeTrajectory, t: number): Vec3 | null {
  if (t < probe.launch) return null;
  const helio = interpolateState(probe.helio, t).position;
  for (const e of probe.encounters) {
    const w = encounterWeight(e, t);
    if (w > 0) return lerp(helio, add(planetPosition(e.body, t), interpolateState(e.table, t).position), w);
  }
  return helio;
}

/** Velocidade heliocêntrica (UA/dia), pela tabela do Horizons. */
export const probeVelocity = (probe: ProbeTrajectory, t: number): Vec3 => interpolateState(probe.helio, t).velocity;

export const speedKms = (v: Vec3) => norm(v) * AU_PER_DAY_TO_KMS;

/** Velocidade de escape do Sol à distância r (UA), em km/s. */
export const solarEscapeKms = (rAu: number) => Math.sqrt((2 * SUN_GM) / (rAu * AU_KM));

/** Tempo que a luz leva para percorrer `distanceAu` (s). */
export const lightTimeS = (distanceAu: number) => (distanceAu * AU_KM) / C_KMS;

// ── Sobrevoos ────────────────────────────────────────────────────────────────
export interface FlybyAnalysis {
  readonly body: PlanetId;
  /** Instante da maior aproximação (dias desde J2000). */
  readonly closestT: number;
  /** Distância ao centro do planeta (km). */
  readonly closestKm: number;
  /** Altitude acima do raio equatorial (km). */
  readonly altitudeKm: number;
  /** Velocidade de excesso hiperbólico v∞ (km/s), média de entrada e saída. */
  readonly vInfKms: number;
  /** Deflexão da velocidade relativa medida nos dados (graus). */
  readonly deflectionDeg: number;
  /** Deflexão prevista pela fórmula da hipérbole: sin(δ/2) = 1/(1 + r_p v∞²/μ). */
  readonly predictedDeflectionDeg: number;
  /** Velocidade heliocêntrica antes e depois, no modelo de cônicas: |V_planeta + v∞|. */
  readonly helioSpeedBeforeKms: number;
  readonly helioSpeedAfterKms: number;
  /** Velocidade do planeta em torno do Sol (km/s). */
  readonly planetSpeedKms: number;
}

/** Maior aproximação: a menor amostra, refinada por seção áurea na interpolação. */
function closestApproach(table: StateTable): { t: number; r: number } {
  let best = 0;
  let bestR = Infinity;
  for (let i = 0; i < table.t.length; i++) {
    const r = Math.hypot(table.s[6 * i]!, table.s[6 * i + 1]!, table.s[6 * i + 2]!);
    if (r < bestR) {
      bestR = r;
      best = i;
    }
  }
  let lo = table.t[Math.max(best - 1, 0)]!;
  let hi = table.t[Math.min(best + 1, table.t.length - 1)]!;
  const dist = (t: number) => norm(interpolateState(table, t).position);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 80; k++) {
    const a = hi - g * (hi - lo);
    const b = lo + g * (hi - lo);
    if (dist(a) < dist(b)) hi = b;
    else lo = a;
  }
  const t = (lo + hi) / 2;
  return { t, r: dist(t) };
}

/** v∞ a partir da velocidade relativa na distância r: v∞² = v² − 2μ/r. */
function asymptoticSpeedKms(state: { position: Vec3; velocity: Vec3 }, gm: number): number {
  const v = speedKms(state.velocity);
  const rKm = norm(state.position) * AU_KM;
  return Math.sqrt(Math.max(v * v - (2 * gm) / rKm, 0));
}

export function analyzeFlyby(e: Encounter): FlybyAnalysis {
  const planet = PLANETS[e.body];
  const closest = closestApproach(e.table);
  const incoming = interpolateState(e.table, e.start);
  const outgoing = interpolateState(e.table, e.end);
  const vInfKms = (asymptoticSpeedKms(incoming, planet.gm) + asymptoticSpeedKms(outgoing, planet.gm)) / 2;
  const closestKm = closest.r * AU_KM;
  const predicted = 2 * Math.asin(1 / (1 + (closestKm * vInfKms * vInfKms) / planet.gm));

  // Cônicas: velocidade do planeta mais v∞ nas direções de entrada e saída.
  const planetV = planetVelocity(e.body, closest.t);
  /** Vetor na direção de `v` com módulo `kms`. */
  const toKms = (v: Vec3, kms: number): Vec3 => {
    const k = kms / norm(v);
    return [v[0] * k, v[1] * k, v[2] * k];
  };
  const planetKms = toKms(planetV, speedKms(planetV));
  const before = add(planetKms, toKms(incoming.velocity, vInfKms));
  const after = add(planetKms, toKms(outgoing.velocity, vInfKms));

  return {
    body: e.body,
    closestT: closest.t,
    closestKm,
    altitudeKm: closestKm - planet.radiusKm,
    vInfKms,
    deflectionDeg: (angle(incoming.velocity, outgoing.velocity) * 180) / Math.PI,
    predictedDeflectionDeg: (predicted * 180) / Math.PI,
    helioSpeedBeforeKms: norm(before),
    helioSpeedAfterKms: norm(after),
    planetSpeedKms: norm(planetKms),
  };
}

/** Distância da sonda ao planeta (UA) no instante. */
export const distanceTo = (probeAt: Vec3, body: PlanetId, t: number) => norm(sub(probeAt, planetPosition(body, t)));
