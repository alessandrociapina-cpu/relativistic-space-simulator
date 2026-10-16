/**
 * Trajetórias das sondas a partir das tabelas do JPL Horizons.
 *
 * Fora dos encontros vale a tabela heliocêntrica. Num encontro (partida da
 * Terra, sobrevoo, órbita em torno de um planeta ou do cometa), a sonda é
 * posicionada em relação ao corpo desenhado: corpo(t) + trajetória relativa
 * do Horizons. Assim o encontro passa no lugar exato mesmo com o corpo pelos
 * elementos aproximados ou pela série de Fourier. Nas bordas da janela as
 * duas posições se misturam suavemente, sem saltos; janelas de luas ficam
 * dentro da janela do planeta e se misturam sobre ela.
 */
import { BODIES, bodyState, isBody, isGaseous, isMoon, type BodyId } from './bodies';
import { interpolateState, muAu, tableEnd, tableStart, unpackTable, type PackedTable, type StateTable, type TableState } from './ephemeris';
import { orbitalPeriod } from './kepler';
import { SUN_GM } from './planets';
import { add, angle, dot, lerp, norm, scale, sub, type Vec3 } from './vec3';

export const AU_KM = 149_597_870.7;
export const DAY_S = 86_400;
/** Velocidade da luz (km/s). */
export const C_KMS = 299_792.458;
/** UA/dia → km/s. */
export const AU_PER_DAY_TO_KMS = AU_KM / DAY_S;

/** Janela relativa no JSON: em UA e UA/dia, ou em km e km/s (`units: 'km'`). */
export interface EncounterData extends PackedTable {
  readonly body: string;
  readonly departure?: boolean;
  /** Dias de mistura com a trajetória heliocêntrica na entrada e na saída. */
  readonly ramp?: readonly number[];
  readonly units?: string;
}

export interface ProbeData {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly helio: PackedTable;
  readonly encounters: readonly EncounterData[];
}

/** Partida da Terra, sobrevoo, ou órbita em que a missão termina (sem saída). */
export type EncounterKind = 'departure' | 'flyby' | 'orbit';

export interface Encounter {
  readonly body: BodyId;
  readonly table: StateTable;
  readonly start: number;
  readonly end: number;
  readonly rampIn: number;
  readonly rampOut: number;
  readonly kind: EncounterKind;
}

export interface ProbeTrajectory {
  readonly id: string;
  readonly name: string;
  /** `null` quando a sonda vive inteira dentro de janelas (Huygens). */
  readonly helio: StateTable | null;
  readonly encounters: readonly Encounter[];
  /** Primeiro e último instante com dados (dias desde J2000). */
  readonly launch: number;
  readonly end: number;
}

/** Tabela relativa em UA e UA/dia, convertendo de km e km/s se for o caso. */
function relativeTable(e: EncounterData, mu: number): StateTable {
  const s = e.units === 'km' ? e.s.map((v, i) => (i % 6 < 3 ? v / AU_KM : v / AU_PER_DAY_TO_KMS)) : e.s;
  return unpackTable({ t: e.t, s }, mu);
}

/** Fração da janela em que a posição relativa ganha peso, quando o JSON não diz. */
const BLEND_FRACTION = 0.25;

export function makeTrajectory(id: string, name: string, helio: StateTable | null, encounters: readonly Encounter[]): ProbeTrajectory {
  const starts = [...(helio ? [tableStart(helio)] : []), ...encounters.map((e) => e.start)];
  const ends = [...(helio ? [tableEnd(helio)] : []), ...encounters.map((e) => e.end)];
  return { id, name, helio, encounters, launch: Math.min(...starts), end: Math.max(...ends) };
}

export function loadTrajectory(data: ProbeData): ProbeTrajectory {
  const helio = data.helio.t.length > 0 ? unpackTable(data.helio, muAu(SUN_GM)) : null;
  const helioStart = helio ? tableStart(helio) : NaN;
  const encounters = data.encounters.map((e): Encounter => {
    if (!isBody(e.body)) throw new Error(`Corpo desconhecido no encontro: ${e.body}`);
    const table = relativeTable(e, muAu(BODIES[e.body].gm));
    const start = tableStart(table);
    const end = tableEnd(table);
    const departure = e.departure ?? Math.abs(start - helioStart) < 1e-6;
    const [rampIn, rampOut] = e.ramp ?? [departure ? 0 : BLEND_FRACTION * (end - start), BLEND_FRACTION * (end - start)];
    const kind: EncounterKind = departure ? 'departure' : e.ramp && e.ramp[1] === 0 ? 'orbit' : 'flyby';
    return { body: e.body, table, start, end, rampIn: rampIn!, rampOut: rampOut!, kind };
  });
  return makeTrajectory(data.id, data.name, helio, encounters);
}

const smoothstep = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};

/** Peso da posição relativa ao corpo: 1 no miolo da janela, 0 fora dela. */
export function encounterWeight(e: Encounter, t: number): number {
  if (t < e.start || t > e.end) return 0;
  const fromStart = e.rampIn > 0 ? smoothstep((t - e.start) / e.rampIn) : 1;
  const fromEnd = e.rampOut > 0 ? smoothstep((e.end - t) / e.rampOut) : 1;
  return Math.min(fromStart, fromEnd);
}

/** Estado heliocêntrico (UA, UA/dia) da sonda; `null` antes do lançamento e depois do fim dos dados. */
export function probeState(probe: ProbeTrajectory, t: number): TableState | null {
  if (t < probe.launch || t > probe.end) return null;
  let state: TableState | null = probe.helio ? interpolateState(probe.helio, t) : null;
  for (const e of probe.encounters) {
    const w = encounterWeight(e, t);
    if (w <= 0) continue;
    const body = bodyState(e.body, t);
    if (!body) continue;
    const rel = interpolateState(e.table, t);
    const here = { position: add(body.position, rel.position), velocity: add(body.velocity, rel.velocity) };
    state =
      !state || w >= 1
        ? here
        : { position: lerp(state.position, here.position, w), velocity: lerp(state.velocity, here.velocity, w) };
  }
  return state;
}

export const probePosition = (probe: ProbeTrajectory, t: number): Vec3 | null => probeState(probe, t)?.position ?? null;

/** Velocidade heliocêntrica (UA/dia); zero fora dos dados. */
export const probeVelocity = (probe: ProbeTrajectory, t: number): Vec3 => probeState(probe, t)?.velocity ?? [0, 0, 0];

/** O encontro mais interno em que a sonda está (o último com peso), ou `null` no espaço interplanetário. */
export function currentEncounter(probe: ProbeTrajectory, t: number): Encounter | null {
  let found: Encounter | null = null;
  for (const e of probe.encounters) if (encounterWeight(e, t) > 0) found = e;
  return found;
}

/** A órbita em que a missão termina em torno de um corpo (Júpiter, Saturno, o cometa), se houver. */
export const firstEncounter = (probe: ProbeTrajectory, body: BodyId): Encounter | null =>
  probe.encounters.find((e) => e.body === body && e.kind === 'orbit') ?? null;

export const speedKms = (v: Vec3) => norm(v) * AU_PER_DAY_TO_KMS;

/** Velocidade de escape do Sol à distância r (UA), em km/s. */
export const solarEscapeKms = (rAu: number) => Math.sqrt((2 * SUN_GM) / (rAu * AU_KM));

/** Tempo que a luz leva para percorrer `distanceAu` (s). */
export const lightTimeS = (distanceAu: number) => (distanceAu * AU_KM) / C_KMS;

/** Distância da sonda ao corpo (UA) no instante, ou `null` sem dados do corpo. */
export function distanceTo(probeAt: Vec3, body: BodyId, t: number): number | null {
  const state = bodyState(body, t);
  return state ? norm(sub(probeAt, state.position)) : null;
}

/** Posição e velocidade da sonda em relação a um corpo (UA, UA/dia). */
export function relativeState(probe: ProbeTrajectory, body: BodyId, t: number): TableState | null {
  const p = probeState(probe, t);
  const b = bodyState(body, t);
  return p && b ? { position: sub(p.position, b.position), velocity: sub(p.velocity, b.velocity) } : null;
}

// ── Análises dos encontros ───────────────────────────────────────────────────
/** Em km e km/s, para as contas com GM em km³/s². */
const toKm = (s: TableState) => ({ r: scale(s.position, AU_KM), v: scale(s.velocity, AU_PER_DAY_TO_KMS) });
const energyKm = (s: TableState, gm: number) => {
  const { r, v } = toKm(s);
  return dot(v, v) / 2 - gm / norm(r);
};

/** Mínimo de `f` em [lo, hi] por seção áurea. */
function goldenMin(f: (t: number) => number, lo: number, hi: number, iterations = 80): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = hi - g * (hi - lo);
  let b = lo + g * (hi - lo);
  let fa = f(a);
  let fb = f(b);
  for (let k = 0; k < iterations; k++) {
    if (fa < fb) {
      hi = b;
      b = a;
      fb = fa;
      a = hi - g * (hi - lo);
      fa = f(a);
    } else {
      lo = a;
      a = b;
      fa = fb;
      b = lo + g * (hi - lo);
      fb = f(b);
    }
  }
  return (lo + hi) / 2;
}

/** Maior aproximação na tabela relativa: a menor amostra no intervalo, refinada por seção áurea. */
export function closestApproach(table: StateTable, from = -Infinity, to = Infinity): { t: number; r: number } {
  let best = -1;
  let bestR = Infinity;
  for (let i = 0; i < table.t.length; i++) {
    if (table.t[i]! < from || table.t[i]! > to) continue;
    const r = Math.hypot(table.s[6 * i]!, table.s[6 * i + 1]!, table.s[6 * i + 2]!);
    if (r < bestR) {
      bestR = r;
      best = i;
    }
  }
  const lo = Math.max(table.t[Math.max(best - 1, 0)]!, from);
  const hi = Math.min(table.t[Math.min(best + 1, table.t.length - 1)]!, to);
  const dist = (t: number) => norm(interpolateState(table, t).position);
  const t = goldenMin(dist, lo, hi);
  return { t, r: dist(t) };
}

export interface FlybyAnalysis {
  readonly body: BodyId;
  /** Instante da maior aproximação (dias desde J2000). */
  readonly closestT: number;
  /** Distância ao centro do corpo (km). */
  readonly closestKm: number;
  /** Altitude acima do raio equatorial (km): das nuvens, nos gasosos. */
  readonly altitudeKm: number;
  /** Velocidade relativa na maior aproximação (km/s). */
  readonly relativeKms: number;
  /** Velocidade de excesso hiperbólico v∞ (km/s), v∞² = v² − 2μ/r. */
  readonly vInfKms: number;
  /** Deflexão prevista pela fórmula da hipérbole: sin(δ/2) = 1/(1 + r_p v∞²/μ). */
  readonly predictedDeflectionDeg: number;
  /** Deflexão da velocidade relativa medida nos dados (só nos planetas, entre as bordas da janela). */
  readonly deflectionDeg: number | null;
  /**
   * Velocidade antes e depois em relação ao corpo central da órbita (o Sol,
   * ou o planeta no sobrevoo de uma lua), e a velocidade orbital do corpo
   * visitado. Nos planetas, pelo modelo de cônicas: |V_planeta + v∞|.
   */
  readonly speedBeforeKms: number;
  readonly speedAfterKms: number;
  readonly bodySpeedKms: number;
  /** Sobrevoo de lua: período da órbita em torno do planeta antes e depois (dias). */
  readonly periodBeforeDays: number | null;
  readonly periodAfterDays: number | null;
}

/** Estado relativo em km nos dois lados de um instante, para as contas antes/depois. */
const MOON_SIDE_DAYS = 2;

export function analyzeFlyby(probe: ProbeTrajectory, e: Encounter): FlybyAnalysis {
  const body = BODIES[e.body];
  const closest = closestApproach(e.table);
  const closestKm = closest.r * AU_KM;
  const atClosest = interpolateState(e.table, closest.t);
  const relativeKms = speedKms(atClosest.velocity);
  const vInfKms = Math.sqrt(Math.max(relativeKms * relativeKms - (2 * body.gm) / closestKm, 0));
  const predicted = body.gm > 0 ? 2 * Math.asin(1 / (1 + (closestKm * vInfKms * vInfKms) / body.gm)) : 0;
  const bodyVelocity = bodyState(e.body, closest.t)!.velocity;

  let deflectionDeg: number | null = null;
  let speedBeforeKms: number;
  let speedAfterKms: number;
  let bodySpeedKms: number;
  let periodBeforeDays: number | null = null;
  let periodAfterDays: number | null = null;

  if (isMoon(e.body)) {
    // Lua: o efeito aparece na órbita em torno do planeta, dois dias antes e depois.
    const parent = body.parent!;
    const before = relativeState(probe, parent, closest.t - MOON_SIDE_DAYS)!;
    const after = relativeState(probe, parent, closest.t + MOON_SIDE_DAYS)!;
    const gm = BODIES[parent].gm;
    speedBeforeKms = speedKms(before.velocity);
    speedAfterKms = speedKms(after.velocity);
    bodySpeedKms = speedKms(sub(bodyVelocity, bodyState(parent, closest.t)!.velocity));
    const periodDays = (s: TableState) => {
      const energy = energyKm(s, gm);
      return energy < 0 ? orbitalPeriod(energy, gm) / DAY_S : null;
    };
    periodBeforeDays = periodDays(before);
    periodAfterDays = periodDays(after);
  } else {
    const incoming = interpolateState(e.table, e.start);
    const outgoing = interpolateState(e.table, e.end);
    // v∞ nas bordas da janela, onde a gravidade do corpo já é fraca.
    const vInfAt = (s: TableState) => Math.sqrt(Math.max(0, 2 * energyKm(s, body.gm)));
    const vInfEdges = body.gm > 0 ? (vInfAt(incoming) + vInfAt(outgoing)) / 2 : relativeKms;
    deflectionDeg = (angle(incoming.velocity, outgoing.velocity) * 180) / Math.PI;
    /** Vetor na direção de `v` com módulo `kms`. */
    const withSpeed = (v: Vec3, kms: number): Vec3 => scale(v, kms / norm(v));
    const bodyKms = withSpeed(bodyVelocity, speedKms(bodyVelocity));
    speedBeforeKms = norm(add(bodyKms, withSpeed(incoming.velocity, vInfEdges)));
    speedAfterKms = norm(add(bodyKms, withSpeed(outgoing.velocity, vInfEdges)));
    bodySpeedKms = norm(bodyKms);
  }

  return {
    body: e.body,
    closestT: closest.t,
    closestKm,
    altitudeKm: closestKm - body.radiusKm,
    relativeKms,
    vInfKms,
    predictedDeflectionDeg: (predicted * 180) / Math.PI,
    deflectionDeg,
    speedBeforeKms,
    speedAfterKms,
    bodySpeedKms,
    periodBeforeDays,
    periodAfterDays,
  };
}

export interface CaptureAnalysis {
  readonly body: BodyId;
  /** Primeira passagem pelo periapse (dias desde J2000). */
  readonly periapsisT: number;
  readonly periapsisKm: number;
  readonly altitudeKm: number;
  /** v∞ de chegada (km/s), pela energia da hipérbole. */
  readonly vInfKms: number;
  /** Período e apoapse (km, do centro) da órbita de captura. */
  readonly periodDays: number;
  readonly apoapsisKm: number;
  /** Δv da freada no periapse, no modelo de manobra instantânea (km/s). */
  readonly deltaVKms: number;
}

/**
 * Inserção em órbita: a energia relativa ao planeta é positiva antes da
 * freada (hipérbole) e negativa depois (elipse de captura). Os estados ficam
 * três dias antes e depois da primeira passagem pelo periapse.
 */
export function analyzeCapture(e: Encounter): CaptureAnalysis {
  const body = BODIES[e.body];
  const peri = closestApproach(e.table, e.start, e.start + 90);
  const before = interpolateState(e.table, peri.t - 3);
  const after = interpolateState(e.table, peri.t + 3);
  const e1 = energyKm(before, body.gm);
  const e2 = energyKm(after, body.gm);
  const rp = peri.r * AU_KM;
  const a = -body.gm / (2 * e2);
  return {
    body: e.body,
    periapsisT: peri.t,
    periapsisKm: rp,
    altitudeKm: rp - body.radiusKm,
    vInfKms: Math.sqrt(Math.max(2 * e1, 0)),
    periodDays: orbitalPeriod(e2, body.gm) / DAY_S,
    apoapsisKm: 2 * a - rp,
    deltaVKms: Math.sqrt(2 * (e1 + body.gm / rp)) - Math.sqrt(2 * (e2 + body.gm / rp)),
  };
}

export interface PerihelionAnalysis {
  readonly t: number;
  readonly distanceKm: number;
  readonly speedKms: number;
  /** Período da órbita em torno do Sol (dias), pela energia. */
  readonly periodDays: number;
}

/** Periélio mais próximo de `near` (±20 dias), pela trajetória da sonda. */
export function analyzePerihelion(probe: ProbeTrajectory, near: number): PerihelionAnalysis {
  const r = (t: number) => norm(probePosition(probe, t) ?? [Infinity, 0, 0]);
  let best = near;
  for (let t = near - 20; t <= near + 20; t += 0.25) if (r(t) < r(best)) best = t;
  const t = goldenMin(r, best - 0.25, best + 0.25);
  const state = probeState(probe, t)!;
  return {
    t,
    distanceKm: norm(state.position) * AU_KM,
    speedKms: speedKms(state.velocity),
    periodDays: orbitalPeriod(energyKm(state, SUN_GM), SUN_GM) / DAY_S,
  };
}

/** Altitude (km) acima do raio do corpo; nos gasosos, acima das nuvens. */
export const altitudeLabel = (body: BodyId) => (isGaseous(body) ? 'acima das nuvens' : 'acima da superfície');
