/**
 * Sondas interplanetárias que o JPL Horizons não tem, reconstruídas pela
 * mecânica orbital a partir das datas da missão (cônicas encadeadas, com o
 * modelo de planetas do app):
 *
 * - Mariner 10: Terra → Vênus → Mercúrio por arcos de Lambert; os três
 *   sobrevoos de Mercúrio numa órbita de 176 dias (duas voltas de Mercúrio),
 *   com o plano de cada sobrevoo escolhido para a sonda voltar a Mercúrio e
 *   uma correção de rota no meio de cada volta.
 * - Viking 1 e 2: Lambert até Marte, captura no periapse, ajuste para a
 *   órbita de um sol que passa sobre o local de pouso, e o módulo de pouso:
 *   separação, queda até a atmosfera, descida freada e o ponto da superfície.
 * - Magellan: transferência do tipo IV (Lambert com uma volta completa),
 *   captura numa órbita quase polar de 3,26 h, aerofrenagem e o mergulho final.
 */
import { lambert, lambertRevs, type State } from '../kepler';
import { PLANETS, SUN_GM, planetPosition, planetVelocity, type PlanetId } from '../planets';
import { poleDirection, surfaceCoordinates, surfaceState } from '../rotation';
import { isoToDays } from '../time';
import { add, angle, cross, dot, norm, scale, sub, type Vec3 } from '../vec3';
import {
  AU_KM,
  BURN_EPS,
  DAY_S,
  arrivalPeriapsis,
  bisect,
  coast,
  deg,
  departurePeriapsis,
  flybyFromVInf,
  flybyWithPeriapsis,
  minimize,
  normalNear,
  normalsWithInclination,
  outgoingVInf,
  packHelio,
  packWindow,
  periodOf,
  round,
  sample,
  semiMajorFor,
  surfaceWindow,
  unit,
  visViva,
  type PackedWindow,
  type Sample,
} from './common';

export interface ReconstructedData {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly frame: string;
  readonly reconstruction: Record<string, unknown>;
  readonly helio: { t: number[]; s: number[] };
  readonly encounters: PackedWindow[];
}

const FRAME = 'eclíptica J2000 (ICRF); dias desde J2000; UA e UA/dia (janelas em km e km/s)';
const SOURCE = 'Reconstrução pela mecânica orbital (scripts/reconstruct.mjs)';
const KMS_PER_AU_DAY = AU_KM / DAY_S;

/** Estado heliocêntrico de um planeta em km e km/s. */
export const planetKm = (id: PlanetId, t: number): State => ({
  r: scale(planetPosition(id, t), AU_KM),
  v: scale(planetVelocity(id, t), KMS_PER_AU_DAY),
});

const iso = isoToDays;
const R = (id: PlanetId) => PLANETS[id].radiusKm;
const MU = (id: PlanetId) => PLANETS[id].gm;

/** Hipérbole de partida da Terra: periapse na órbita de estacionamento no instante da injeção, 3 dias de janela. */
function departureWindow(vInf: Vec3, tDep: number, parkingKm: number): { window: PackedWindow; c3: number } {
  const mu = MU('earth');
  const peri = departurePeriapsis(vInf, R('earth') + parkingKm, mu, normalNear(vInf));
  const end = tDep + 3;
  return {
    window: packWindow({
      body: 'earth',
      kind: 'departure',
      samples: [sample(tDep, peri), sample(end, coast(peri, tDep, end, mu))],
      mu,
      tolKm: 15,
      ramp: [0, 0.75],
    }),
    c3: dot(vInf, vInf),
  };
}

/** Janela de sobrevoo (±`half` dias) com a hipérbole de chegada e a de saída emendadas no periapse. */
function flybyWindow(body: PlanetId, tp: number, geometry: { r: Vec3; vIn: Vec3; vOut: Vec3 }, half: number): PackedWindow {
  const mu = MU(body);
  const inState = { r: geometry.r, v: geometry.vIn };
  const outState = { r: geometry.r, v: geometry.vOut };
  return packWindow({
    body,
    kind: 'flyby',
    samples: [
      sample(tp - half, coast(inState, tp, tp - half, mu)),
      sample(tp, inState),
      sample(tp + BURN_EPS, outState),
      sample(tp + half, coast(outState, tp, tp + half, mu)),
    ],
    mu,
    tolKm: 15,
    ramp: [half * 0.5, half * 0.5],
  });
}

// ── Mariner 10 ───────────────────────────────────────────────────────────────

export function mariner10(): ReconstructedData {
  // Lançamento em 03/11/1973 05:45 UTC; injeção depois de ~30 min na órbita de estacionamento.
  const tDep = iso('1973-11-03T06:15Z');
  const tVenus = iso('1974-02-05T17:01Z');
  const tMercury = ['1974-03-29T20:47Z', '1974-09-21T20:59Z', '1975-03-16T22:39Z'].map(iso);
  // Altitudes das passagens por Mercúrio (km): lado noturno, 48 069 km sobre o polo sul iluminado, e rente.
  const altitudes = [703, 48_069, 327];
  // Correções de rota no meio de cada volta de 176 dias.
  const tTcm = [iso('1974-05-10'), iso('1974-10-30')];
  const tDataEnd = iso('2036-01-01');

  const earth = planetKm('earth', tDep);
  const venus = planetKm('venus', tVenus);
  const mercury = tMercury.map((t) => planetKm('mercury', t));
  const legA = lambert(earth.r, venus.r, (tVenus - tDep) * DAY_S, SUN_GM);
  const legB = lambert(venus.r, mercury[0]!.r, (tMercury[0]! - tVenus) * DAY_S, SUN_GM);

  const helio: Sample[] = [
    { t: tDep, r: earth.r, v: legA.v1 },
    { t: tVenus, r: venus.r, v: legA.v2 },
    { t: tVenus + BURN_EPS, r: venus.r, v: legB.v1 },
    { t: tMercury[0]!, r: mercury[0]!.r, v: legB.v2 },
  ];
  const departure = departureWindow(sub(legA.v1, earth.v), tDep, 185);
  const venusFlyby = flybyFromVInf(sub(legA.v2, venus.v), sub(legB.v1, venus.v), MU('venus'));
  const windows: PackedWindow[] = [departure.window, flybyWindow('venus', tVenus, venusFlyby, 3)];

  const muM = MU('mercury');
  const flybys: Record<string, number>[] = [];
  const tcms: number[] = [];
  let vInfIn = sub(legB.v2, mercury[0]!.v);
  for (let k = 0; k < 3; k++) {
    const rp = R('mercury') + altitudes[k]!;
    const tNext = k < 2 ? tMercury[k + 1]! : tMercury[2]! + 176;
    const target = planetKm('mercury', tNext).r;
    const here = mercury[k]!;
    // Plano do sobrevoo: o que devolve a sonda mais perto de Mercúrio na volta seguinte.
    const after = (theta: number): State => ({ r: here.r, v: add(here.v, outgoingVInf(vInfIn, rp, muM, theta)) });
    const miss = (theta: number) => norm(sub(coast(after(theta), tMercury[k]!, tNext, SUN_GM).r, target));
    const theta = minimize(miss, 0, 2 * Math.PI, 720);
    const out = after(theta);
    const geometry = flybyWithPeriapsis(vInfIn, sub(out.v, here.v), rp, muM);
    windows.push(flybyWindow('mercury', tMercury[k]!, geometry, 1));
    helio.push({ t: tMercury[k]! + BURN_EPS, r: here.r, v: out.v });
    flybys.push({ altitudeKm: round(altitudes[k]!, 0), vInfKms: round(norm(vInfIn)), missKm: round(miss(theta), 0) });

    if (k < 2) {
      const tc = tTcm[k]!;
      const before = coast(out, tMercury[k]!, tc, SUN_GM);
      const next = mercury[k + 1]!;
      const leg = lambert(before.r, next.r, (tMercury[k + 1]! - tc) * DAY_S, SUN_GM, cross(before.r, before.v));
      helio.push({ t: tc, r: before.r, v: before.v }, { t: tc + BURN_EPS, r: before.r, v: leg.v1 }, { t: tMercury[k + 1]!, r: next.r, v: leg.v2 });
      tcms.push(round(norm(sub(leg.v1, before.v)) * 1000, 1));
      vInfIn = sub(leg.v2, next.v);
    } else {
      helio.push(sample(tDataEnd, coast(out, tMercury[k]!, tDataEnd, SUN_GM)));
    }
  }

  return {
    id: 'mariner10',
    name: 'Mariner 10',
    source: SOURCE,
    frame: FRAME,
    reconstruction: {
      departureC3: round(departure.c3, 2),
      venusAltitudeKm: round(venusFlyby.rp - R('venus'), 0),
      venusDeltaVKms: round(venusFlyby.deltaV, 4),
      mercury: flybys,
      tcmMs: tcms,
      lastContact: '1975-03-24T12:21Z',
    },
    helio: packHelio(helio, SUN_GM),
    encounters: windows,
  };
}

// ── Descida na atmosfera (Vikings) ───────────────────────────────────────────

/**
 * Da entrada na atmosfera ao pouso: ao longo do grande círculo (no corpo
 * girando) do ponto de entrada até o local de pouso, com a velocidade
 * horizontal caindo exponencialmente (o arrasto) e a altitude como potência
 * do tempo restante, ambas começando com a velocidade da chegada.
 */
function atmosphericDescent(body: PlanetId, entry: State, tEntry: number, tLand: number, site: { latDeg: number; lonDeg: number }): Sample[] {
  const radius = R(body);
  const T = (tLand - tEntry) * DAY_S;
  // Velocidade em relação ao solo que gira: a inercial menos ω × r (a velocidade de um ponto fixo ali).
  const start = surfaceCoordinates(body, entry.r, tEntry);
  const vFixed = sub(entry.v, surfaceState(body, start.latDeg, start.lonDeg, norm(entry.r), tEntry).v);
  const up = unit(entry.r);
  const vr = dot(vFixed, up);
  const vh = norm(sub(vFixed, scale(up, vr)));
  const h0 = norm(entry.r) - radius;

  const toVec = (c: { latDeg: number; lonDeg: number }): Vec3 => {
    const la = (c.latDeg * Math.PI) / 180;
    const lo = (c.lonDeg * Math.PI) / 180;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const a = toVec(start);
  const b = toVec(site);
  const arc = angle(a, b);
  const ground = arc * radius;
  // τ0 (1 − e^(−T/τ0)) = D/v_h: a velocidade horizontal inicial é a da chegada.
  const tau0 = ground / vh < T * 0.95 ? bisect((x) => x * (1 - Math.exp(-T / x)) - ground / vh, 1e-3, 1e6) : Infinity;
  const g = (tau: number) => (Number.isFinite(tau0) ? (1 - Math.exp(-tau / tau0)) / (1 - Math.exp(-T / tau0)) : tau / T);
  const p = Math.max(1.2, (-vr * T) / h0);
  const h = (tau: number) => h0 * Math.max(0, 1 - tau / T) ** p;
  const position = (tau: number): Vec3 => {
    const f = g(tau);
    const dir = add(scale(a, Math.sin((1 - f) * arc) / Math.sin(arc)), scale(b, Math.sin(f * arc) / Math.sin(arc)));
    const lat = (Math.asin(Math.max(-1, Math.min(1, dir[2]))) * 180) / Math.PI;
    const lon = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
    return surfaceState(body, lat, lon, radius + h(tau), tEntry + tau / DAY_S).r;
  };
  const fractions = [0, 0.01, 0.025, 0.05, 0.08, 0.12, 0.17, 0.23, 0.3, 0.38, 0.47, 0.57, 0.68, 0.8, 0.9, 0.96, 1];
  return fractions.map((f) => {
    const tau = f * T;
    if (f === 1) {
      const ground = surfaceState(body, site.latDeg, site.lonDeg, radius, tLand);
      return { t: tLand, r: ground.r, v: ground.v };
    }
    const d = 0.25;
    const v = scale(sub(position(Math.min(tau + d, T)), position(Math.max(tau - d, 0))), 1 / (Math.min(tau + d, T) - Math.max(tau - d, 0)));
    return { t: tEntry + tau / DAY_S, r: position(tau), v };
  });
}

// ── Viking 1 e 2 ─────────────────────────────────────────────────────────────

interface VikingSpec {
  readonly name: string;
  readonly landerName: string;
  readonly departure: string;
  readonly insertion: string;
  /** Período da órbita de captura (h), antes do ajuste para ~1 sol. */
  readonly capturePeriodH: number;
  readonly trim: string;
  readonly separation: string;
  readonly landing: string;
  readonly site: { readonly latDeg: number; readonly lonDeg: number };
  readonly orbiterEnd: string;
  readonly landerEnd: string;
}

const VIKINGS: Readonly<Record<'viking1' | 'viking2', VikingSpec>> = {
  // Lançamento em 20/08/1975 21:22 UTC (Titan IIIE/Centaur); órbita de Marte em 19/06/1976; pouso em Chryse Planitia.
  viking1: {
    name: 'Viking 1',
    landerName: 'Viking 1 (módulo de pouso)',
    departure: '1975-08-20T22:05Z',
    insertion: '1976-06-19T22:00Z',
    capturePeriodH: 42.3,
    trim: '1976-06-21T12:00Z',
    separation: '1976-07-20T08:51Z',
    landing: '1976-07-20T11:53Z',
    site: { latDeg: 22.7, lonDeg: 311.78 },
    orbiterEnd: '1980-08-17',
    landerEnd: '1982-11-11',
  },
  // Lançamento em 09/09/1975 18:39 UTC; órbita de Marte em 07/08/1976; pouso em Utopia Planitia.
  viking2: {
    name: 'Viking 2',
    landerName: 'Viking 2 (módulo de pouso)',
    departure: '1975-09-09T19:20Z',
    insertion: '1976-08-07T12:00Z',
    capturePeriodH: 27.3,
    trim: '1976-08-09T12:00Z',
    separation: '1976-09-03T19:40Z',
    landing: '1976-09-03T22:38Z',
    site: { latDeg: 48.27, lonDeg: 134.01 },
    orbiterEnd: '1978-07-25',
    landerEnd: '1980-04-11',
  },
};

const MARS_SOL_S = 88_775.244;
const PERIAPSIS_ALT_KM = 1500;
const ENTRY_ALT_KM = 244;
/** Do topo da atmosfera ao pouso (min) e inclinação da trajetória na entrada (graus). */
const ENTRY_MIN = 10.5;
const ENTRY_PATH_DEG = -16;

export function viking(id: 'viking1' | 'viking2'): { orbiter: ReconstructedData; lander: ReconstructedData } {
  const spec = VIKINGS[id];
  const mu = MU('mars');
  const radius = R('mars');
  const tDep = iso(spec.departure);
  const tMoi = iso(spec.insertion);
  const tTrim = iso(spec.trim);
  const tSep = iso(spec.separation);
  const tLand = iso(spec.landing);
  const tEntry = tLand - ENTRY_MIN / 1440;
  const tOrbEnd = iso(spec.orbiterEnd);
  const tLanderEnd = iso(spec.landerEnd);

  const earth = planetKm('earth', tDep);
  const mars = planetKm('mars', tMoi);
  const leg = lambert(earth.r, mars.r, (tMoi - tDep) * DAY_S, SUN_GM);
  const departure = departureWindow(sub(leg.v1, earth.v), tDep, 185);
  const vInfIn = sub(leg.v2, mars.v);

  // Captura: periapse a 1 500 km no plano que contém v∞ e o local de pouso no instante do pouso;
  // dos dois lados possíveis do planeta, o que passa mais baixo sobre o local.
  const rp = radius + PERIAPSIS_ALT_KM;
  const siteDir = unit(surfaceState('mars', spec.site.latDeg, spec.site.lonDeg, radius, tLand).r);
  const sideNormal = unit(cross(unit(vInfIn), siteDir));
  /** Anomalia verdadeira do local de pouso na órbita (contada do periapse, no sentido do movimento). */
  const anomalyOf = (peri: State, n: Vec3) => {
    const p = unit(peri.r);
    return (Math.atan2(dot(cross(p, siteDir), n), dot(p, siteDir)) + 2 * Math.PI) % (2 * Math.PI);
  };
  const { n: orbitNormal, hyper } = [sideNormal, scale(sideNormal, -1)]
    .map((n) => ({ n, hyper: arrivalPeriapsis(vInfIn, rp, mu, n) }))
    .reduce((best, o) => (Math.cos(anomalyOf(o.hyper, o.n)) > Math.cos(anomalyOf(best.hyper, best.n)) ? o : best));
  const psi = anomalyOf(hyper, orbitNormal);
  const pCap = spec.capturePeriodH * 3600;
  const capture: State = { r: hyper.r, v: scale(unit(hyper.v), visViva(rp, semiMajorFor(pCap, mu), mu)) };
  const moiDv = norm(hyper.v) - norm(capture.v);

  // Ajuste no periapse (só muda o apoapse): o período de ~1 sol que leva a sonda a passar
  // sobre o local de pouso no instante do pouso.
  const tTrimP = tMoi + (Math.max(1, Math.round(((tTrim - tMoi) * DAY_S) / pCap)) * pCap) / DAY_S;
  /** Tempo (s) do periapse até a anomalia verdadeira ψ, na órbita de periapse rp e período P. */
  const timeToAnomaly = (period: number) => {
    const a = semiMajorFor(period, mu);
    const e = 1 - rp / a;
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(psi / 2));
    const M = (E - e * Math.sin(E) + 2 * Math.PI) % (2 * Math.PI);
    return (M / (2 * Math.PI)) * period;
  };
  let pOp = MARS_SOL_S;
  let bestGap = Infinity;
  const revs = Math.round(((tLand - tTrimP) * DAY_S) / MARS_SOL_S);
  for (let n = revs - 2; n <= revs + 2; n++) {
    const f = (period: number) => tTrimP + (n * period + timeToAnomaly(period)) / DAY_S - tLand;
    const lo = 0.8 * MARS_SOL_S;
    const hi = 1.2 * MARS_SOL_S;
    if (n < 1 || Math.sign(f(lo)) === Math.sign(f(hi))) continue;
    const period = bisect(f, lo, hi);
    if (Math.abs(period - MARS_SOL_S) < bestGap) {
      bestGap = Math.abs(period - MARS_SOL_S);
      pOp = period;
    }
  }
  const atTrim = coast(capture, tMoi, tTrimP, mu);
  const operational: State = { r: atTrim.r, v: scale(unit(atTrim.v), visViva(rp, semiMajorFor(pOp, mu), mu)) };
  const trimDv = Math.abs(norm(atTrim.v) - norm(operational.v));
  const opAt = (t: number) => coast(operational, tTrimP, t, mu);

  const orbiterSamples: Sample[] = [
    sample(tMoi - 3, coast(hyper, tMoi, tMoi - 3, mu)),
    sample(tMoi, hyper),
    sample(tMoi + BURN_EPS, capture),
    sample(tTrimP, atTrim),
    sample(tTrimP + BURN_EPS, operational),
    sample(tOrbEnd, opAt(tOrbEnd)),
  ];
  const overSite = opAt(tLand);
  const orbiter: ReconstructedData = {
    id,
    name: spec.name,
    source: SOURCE,
    frame: FRAME,
    reconstruction: {
      departureC3: round(departure.c3, 2),
      arrivalVInfKms: round(norm(vInfIn)),
      insertionDeltaVKms: round(moiDv),
      trimDeltaVKms: round(trimDv),
      periapsisAltitudeKm: PERIAPSIS_ALT_KM,
      capturePeriodH: spec.capturePeriodH,
      operationalPeriodH: round(pOp / 3600, 2),
      inclinationDeg: round(deg(angle(orbitNormal, poleDirection('mars', tMoi))), 1),
      altitudeOverSiteKm: round(norm(overSite.r) - radius, 0),
      insertion: spec.insertion,
    },
    helio: packHelio(
      [
        { t: tDep, r: earth.r, v: leg.v1 },
        { t: tMoi, r: mars.r, v: leg.v2 },
      ],
      SUN_GM,
    ),
    encounters: [departure.window, packWindow({ body: 'mars', kind: 'orbit', samples: orbiterSamples, mu, tolKm: 15, ramp: [1, 0] })],
  };

  // Módulo de pouso: separa, cai até o topo da atmosfera (Lambert), desce freado e fica no solo.
  // O ponto de entrada fica atrás do local de pouso, na direção da passagem da sonda, à distância
  // (de 4° a 15°) que mais se aproxima da inclinação de entrada das Vikings (−16° a 244 km de altitude).
  const sep = opAt(tSep);
  const h = unit(sub(overSite.v, scale(siteDir, dot(overSite.v, siteDir))));
  const entryAt = (arcDeg: number) => {
    const a = (arcDeg * Math.PI) / 180;
    const r = scale(add(scale(siteDir, Math.cos(a)), scale(h, -Math.sin(a))), radius + ENTRY_ALT_KM);
    return { r, fall: lambert(sep.r, r, (tEntry - tSep) * DAY_S, mu, orbitNormal) };
  };
  const pathAngle = (e: { r: Vec3; fall: { v2: Vec3 } }) => 90 - deg(angle(e.r, e.fall.v2));
  const arcDeg = minimize((x) => Math.abs(pathAngle(entryAt(x)) - ENTRY_PATH_DEG), 4, 15, 110);
  const { r: entryR, fall } = entryAt(arcDeg);
  const entry: State = { r: entryR, v: fall.v2 };
  const descent = atmosphericDescent('mars', entry, tEntry, tLand, spec.site);
  const lander: ReconstructedData = {
    id: `${id}-lander`,
    name: spec.landerName,
    source: SOURCE,
    frame: FRAME,
    reconstruction: {
      deorbitDeltaVKms: round(norm(sub(fall.v1, sep.v))),
      entrySpeedKms: round(norm(fall.v2), 2),
      entryFlightPathDeg: round(90 - deg(angle(entryR, fall.v2)), 1),
      entryArcDeg: round(arcDeg, 1),
      site: spec.site,
    },
    helio: { t: [], s: [] },
    encounters: [
      packWindow({ body: 'mars', kind: 'orbit', samples: [sample(tSep, { r: sep.r, v: fall.v1 }), sample(tEntry, entry)], mu, tolKm: 1, ramp: [0, 0] }),
      packWindow({ body: 'mars', kind: 'orbit', samples: descent, mu: 0, gmOverride: 0, tolKm: 0.5, ramp: [0, 0] }),
      surfaceWindow('mars', spec.site.latDeg, spec.site.lonDeg, tLand, tLanderEnd),
    ],
  };
  return { orbiter, lander };
}

// ── Magellan ─────────────────────────────────────────────────────────────────

export function magellan(): ReconstructedData {
  const mu = MU('venus');
  const radius = R('venus');
  // STS-30 lançou em 04/05/1989 18:47 UTC; o estágio IUS fez a injeção ~7 h depois.
  const tDep = iso('1989-05-05T01:50Z');
  const tMoi = iso('1990-08-10T17:00Z');
  const tAeroStart = iso('1993-05-25');
  const tAeroEnd = iso('1993-08-03');
  const tEnd = iso('1994-10-13T10:05Z');

  const earth = planetKm('earth', tDep);
  const venus = planetKm('venus', tMoi);
  // Tipo IV: uma volta e meia em torno do Sol; das duas cônicas, a de menor C3.
  const options = lambertRevs(earth.r, venus.r, (tMoi - tDep) * DAY_S, SUN_GM, 1);
  const leg = options.reduce((best, o) => (norm(sub(o.v1, earth.v)) < norm(sub(best.v1, earth.v)) ? o : best));
  const departure = departureWindow(sub(leg.v1, earth.v), tDep, 300);
  const vInfIn = sub(leg.v2, venus.v);

  // Órbita de mapeamento: 294 km × 3,26 h, inclinação de 85,5° e periapse perto de 10° N.
  const rp = radius + 294;
  const pole = poleDirection('venus', tMoi);
  const hyper = normalsWithInclination(vInfIn, pole, 85.5)
    .map((n) => arrivalPeriapsis(vInfIn, rp, mu, n))
    .reduce((best, c) =>
      Math.abs(surfaceCoordinates('venus', c.r, tMoi).latDeg - 9.5) < Math.abs(surfaceCoordinates('venus', best.r, tMoi).latDeg - 9.5) ? c : best,
    );
  const pMap = 3.26 * 3600;
  const aMap = semiMajorFor(pMap, mu);
  const mapping: State = { r: hyper.r, v: scale(unit(hyper.v), visViva(rp, aMap, mu)) };
  const samples: Sample[] = [sample(tMoi - 3, coast(hyper, tMoi, tMoi - 3, mu)), sample(tMoi, hyper), sample(tMoi + BURN_EPS, mapping)];

  // Aerofrenagem: no primeiro apoapse depois do início, o periapse desce a 140 km;
  // cada passagem pelo periapse tira a mesma velocidade, até o apoapse chegar a 541 km no fim.
  // Na tabela, o arrasto de 4 passagens seguidas vira uma manobra só (a curva é a mesma na tela).
  const pDir = unit(mapping.r);
  const n = unit(cross(mapping.r, mapping.v));
  const aDir = scale(pDir, -1);
  const along = cross(n, pDir);
  const kStart = Math.ceil((tAeroStart - tMoi) / (pMap / DAY_S) - 0.5);
  const tApo0 = tMoi + ((kStart + 0.5) * pMap) / DAY_S;
  const raMap = 2 * aMap - rp;
  const apoBefore = coast(mapping, tMoi, tApo0, mu);
  const rpAero = radius + 140;
  const raTarget = radius + 541;
  const GROUP = 4;
  const simulate = (dv: number, record: boolean) => {
    let ra = raMap;
    let t = tApo0 + periodOf((ra + rpAero) / 2, mu) / 2 / DAY_S;
    let count = 0;
    const passes: { t: number; vBefore: number; vAfter: number; a: number }[] = [];
    while (t < tAeroEnd) {
      const a = (ra + rpAero) / 2;
      const vBefore = visViva(rpAero, a, mu);
      const vAfter = vBefore - dv * GROUP;
      const aNew = 1 / (2 / rpAero - (vAfter * vAfter) / mu);
      ra = 2 * aNew - rpAero;
      if (record) passes.push({ t, vBefore, vAfter, a: aNew });
      count += GROUP;
      t += (GROUP * periodOf(aNew, mu)) / DAY_S;
    }
    return { ra, passes, count };
  };
  const dvPass = bisect((dv) => simulate(dv, false).ra - raTarget, 0, 0.02);
  const aero = simulate(dvPass, true);
  const vApoLowered = visViva(raMap, (raMap + rpAero) / 2, mu);
  samples.push(sample(tApo0, apoBefore), { t: tApo0 + BURN_EPS, r: scale(aDir, raMap), v: scale(along, -vApoLowered) });
  for (const pass of aero.passes) {
    samples.push({ t: pass.t, r: scale(pDir, rpAero), v: scale(along, pass.vBefore) });
    samples.push({ t: pass.t + BURN_EPS, r: scale(pDir, rpAero), v: scale(along, pass.vAfter) });
    // Apoapse seguinte: ponto de controle para o enxugamento medir o efeito acumulado das passagens.
    const ra = 2 * pass.a - rpAero;
    for (let k = 0; k < GROUP; k++) {
      samples.push({ t: pass.t + ((k + 0.5) * periodOf(pass.a, mu)) / DAY_S, r: scale(aDir, ra), v: scale(along, -visViva(ra, pass.a, mu)) });
    }
  }
  // No apoapse seguinte, o periapse sobe a 180 km: órbita final de 180 × 541 km.
  const last = aero.passes[aero.passes.length - 1]!;
  const tApoFinal = last.t + ((GROUP - 0.5) * periodOf(last.a, mu)) / DAY_S;
  const vApoEnd = visViva(raTarget, last.a, mu);
  const rpFinal = radius + 180;
  const aFinal = (raTarget + rpFinal) / 2;
  const finalOrbit: State = { r: scale(aDir, raTarget), v: scale(along, -visViva(raTarget, aFinal, mu)) };
  samples.push({ t: tApoFinal, r: scale(aDir, raTarget), v: scale(along, -vApoEnd) }, sample(tApoFinal + BURN_EPS, finalOrbit));

  // Mergulho final: o periapse desce para dentro da atmosfera e a sonda chega a 130 km no último contato.
  const rDeep = radius + 80;
  const rLoss = radius + 130;
  const descentTime = (r0: number) => {
    const a = (r0 + rDeep) / 2;
    const e = (r0 - rDeep) / (r0 + rDeep);
    const E = 2 * Math.PI - Math.acos((1 - rLoss / a) / e);
    return (E - e * Math.sin(E) - Math.PI) / Math.sqrt(mu / (a * a * a));
  };
  let tBurn = tEnd - 0.03;
  for (let k = 0; k < 20; k++) tBurn = tEnd - descentTime(norm(coast(finalOrbit, tApoFinal, tBurn, mu).r)) / DAY_S;
  const atBurn = coast(finalOrbit, tApoFinal, tBurn, mu);
  const r0 = norm(atBurn.r);
  const horizontal = unit(sub(atBurn.v, scale(unit(atBurn.r), dot(atBurn.v, unit(atBurn.r)))));
  const plunge: State = { r: atBurn.r, v: scale(horizontal, visViva(r0, (r0 + rDeep) / 2, mu)) };
  samples.push(sample(tBurn, atBurn), sample(tBurn + BURN_EPS, plunge), sample(tEnd, coast(plunge, tBurn, tEnd, mu)));

  return {
    id: 'magellan',
    name: 'Magellan',
    source: SOURCE,
    frame: FRAME,
    reconstruction: {
      departureC3: round(departure.c3, 2),
      transferRevolutions: 1,
      arrivalVInfKms: round(norm(vInfIn)),
      insertionDeltaVKms: round(norm(hyper.v) - norm(mapping.v)),
      mappingPeriodH: 3.26,
      aerobrakingPasses: aero.count,
      aerobrakingDeltaVPerPassMs: round(dvPass * 1000, 2),
      aerobrakingTotalDeltaVKms: round(dvPass * aero.count),
      finalPeriodMin: round(periodOf(aFinal, mu) / 60, 1),
    },
    helio: packHelio(
      [
        { t: tDep, r: earth.r, v: leg.v1 },
        { t: tMoi, r: venus.r, v: leg.v2 },
      ],
      SUN_GM,
    ),
    encounters: [departure.window, packWindow({ body: 'venus', kind: 'orbit', samples, mu, tolKm: 50, ramp: [1, 0] })],
  };
}
