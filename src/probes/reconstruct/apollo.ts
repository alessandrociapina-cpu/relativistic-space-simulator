/**
 * Missões Apollo à Lua (8, 10 a 17), reconstruídas a partir dos horários da
 * missão (NASA, "Apollo by the Numbers") e dos locais de pouso:
 *
 * - Ida: integração numérica Terra–Lua–Sol, de trás para frente, a partir do
 *   periselênio no instante da inserção em órbita lunar, até cair no perigeu
 *   da órbita de estacionamento (185 km) no instante da injeção translunar.
 *   O plano da órbita lunar contém o local de pouso no pouso e na partida.
 * - Órbita lunar: cônicas em torno da Lua com as queimas (LOI-1, LOI-2, ajuste
 *   de fase); o módulo lunar desce por uma elipse até 15 km (DOI), faz a
 *   descida motorizada, fica na superfície que gira, sobe até uma órbita de
 *   17 × 83 km e reencontra o módulo de comando (TPI, 130° de transferência).
 * - Volta: a queima TEI que leva à interface de entrada (121,9 km, −6,5°) no
 *   instante histórico, por tiro com integração numérica; depois a entrada
 *   na atmosfera e a amerissagem.
 * - Apollo 13: o periselênio do retorno livre a 254 km e a queima PC+2.
 */
import { lambert, type State } from '../kepler';
import { poleDirection, surfaceState } from '../rotation';
import { isoToDays } from '../time';
import { add, angle, cross, dot, norm, scale, sub, type Vec3 } from '../vec3';
import {
  BURN_EPS,
  DAY_S,
  arrivalPeriapsis,
  basisAround,
  bisect,
  coast,
  deg,
  interpolate,
  normalsWithInclination,
  packWindow,
  perpendicular,
  periodOf,
  rotate,
  round,
  sample,
  surfaceWindow,
  unit,
  visViva,
  type PackedWindow,
  type Sample,
} from './common';
import { MU_EARTH, MU_MOON, integrate, integrateTo, moonState } from './integrator';
import type { ReconstructedData } from './interplanetary';

const R_MOON = 1737.4;
const R_EARTH = 6378.1;
const PARKING_ALT_KM = 185;
const EI_ALT_KM = 121.9;
const ENTRY_ANGLE_DEG = -6.5;
const CSM_ALT_KM = 111;
const LOI1_APO_KM = 312;
const PDI_ALT_KM = 15;
const INSERTION_ORBIT_KM = [17, 83] as const;
const ASCENT_S = 432;
/** Transferência final do encontro: 130° em ~43 min, e 15 min de aproximação até a acoplagem. */
const TPI_TRANSFER_DEG = 130;
const TPI_TO_TPF_MIN = 43;
const TPF_TO_DOCK_MIN = 15;
/** Do início da janela da Lua ao periselênio, e da TEI ao fim dela (dias); 3 h de mistura em cada borda. */
const MOON_WINDOW_DAYS = 9 / 24;
const MOON_RAMP_DAYS = 3 / 24;

interface Site {
  readonly latDeg: number;
  readonly lonDeg: number;
}

export interface ApolloSpec {
  readonly id: string;
  readonly name: string;
  /** Nomes do módulo de comando e do módulo lunar. */
  readonly csm: string;
  readonly lm?: string;
  readonly launch: string;
  /** Fim da injeção translunar. */
  readonly tli: string;
  /** Inserção em órbita lunar (periselênio da chegada). */
  readonly loi?: string;
  /** Apollo 13: periselênio do retorno livre, altitude e a queima PC+2. */
  readonly pericynthion?: string;
  readonly pericynthionAltKm?: number;
  readonly pc2?: string;
  readonly undock?: string;
  /** Apollo 10: descida até 15,6 km sem pousar (DOI histórica). */
  readonly doi?: string;
  readonly lowPassAltKm?: number;
  readonly pdi?: string;
  readonly landing?: string;
  readonly liftoff?: string;
  readonly docking?: string;
  readonly tei?: string;
  readonly entry: string;
  readonly splashdown: string;
  /** Local de pouso (ou de referência, nas missões sem pouso). */
  readonly site: Site;
  /** Missões sem pouso: inclinação da órbita lunar (graus, retrógrada). */
  readonly inclinationDeg?: number;
}

export const APOLLO_SPECS: readonly ApolloSpec[] = [
  {
    id: 'apollo8',
    name: 'Apollo 8',
    csm: 'Apollo 8',
    launch: '1968-12-21T12:51:00Z',
    tli: '1968-12-21T15:47:05Z',
    loi: '1968-12-24T09:59:20Z',
    tei: '1968-12-25T06:10:16Z',
    entry: '1968-12-27T15:37:13Z',
    splashdown: '1968-12-27T15:51:42Z',
    // Plano de 12° que sobrevoa o futuro local da Apollo 11 (Mar da Tranquilidade), fotografado por ela.
    site: { latDeg: 0.674, lonDeg: 23.473 },
    inclinationDeg: 12,
  },
  {
    id: 'apollo10',
    name: 'Apollo 10',
    csm: 'Charlie Brown',
    lm: 'Snoopy',
    launch: '1969-05-18T16:49:00Z',
    tli: '1969-05-18T19:28:10Z',
    loi: '1969-05-21T20:44:54Z',
    undock: '1969-05-22T19:00:57Z',
    doi: '1969-05-22T20:35:02Z',
    lowPassAltKm: 15.6,
    docking: '1969-05-23T03:11:02Z',
    tei: '1969-05-24T10:25:28Z',
    entry: '1969-05-26T16:37:54Z',
    splashdown: '1969-05-26T16:52:23Z',
    site: { latDeg: 0.674, lonDeg: 23.473 },
    inclinationDeg: 1.2,
  },
  {
    id: 'apollo11',
    name: 'Apollo 11',
    csm: 'Columbia',
    lm: 'Eagle',
    launch: '1969-07-16T13:32:00Z',
    tli: '1969-07-16T16:22:13Z',
    loi: '1969-07-19T17:21:50Z',
    undock: '1969-07-20T17:44:00Z',
    pdi: '1969-07-20T20:05:05Z',
    landing: '1969-07-20T20:17:40Z',
    liftoff: '1969-07-21T17:54:00Z',
    docking: '1969-07-21T21:35:00Z',
    tei: '1969-07-22T04:55:42Z',
    entry: '1969-07-24T16:35:06Z',
    splashdown: '1969-07-24T16:50:35Z',
    site: { latDeg: 0.674, lonDeg: 23.473 },
  },
  {
    id: 'apollo12',
    name: 'Apollo 12',
    csm: 'Yankee Clipper',
    lm: 'Intrepid',
    launch: '1969-11-14T16:22:00Z',
    tli: '1969-11-14T19:15:04Z',
    loi: '1969-11-18T03:47:23Z',
    undock: '1969-11-19T04:16:02Z',
    pdi: '1969-11-19T06:42:38Z',
    landing: '1969-11-19T06:54:35Z',
    liftoff: '1969-11-20T14:25:47Z',
    docking: '1969-11-20T17:58:20Z',
    tei: '1969-11-21T20:49:16Z',
    entry: '1969-11-24T20:44:19Z',
    splashdown: '1969-11-24T20:58:25Z',
    site: { latDeg: -3.012, lonDeg: 336.578 },
  },
  {
    id: 'apollo13',
    name: 'Apollo 13',
    csm: 'Odyssey',
    launch: '1970-04-11T19:13:00Z',
    tli: '1970-04-11T21:54:37Z',
    pericynthion: '1970-04-15T00:21:35Z',
    pericynthionAltKm: 254,
    pc2: '1970-04-15T02:40:39Z',
    entry: '1970-04-17T17:53:46Z',
    splashdown: '1970-04-17T18:07:41Z',
    // Fra Mauro, o destino abandonado.
    site: { latDeg: -3.645, lonDeg: 342.529 },
    inclinationDeg: 10,
  },
  {
    id: 'apollo14',
    name: 'Apollo 14',
    csm: 'Kitty Hawk',
    lm: 'Antares',
    launch: '1971-01-31T21:03:02Z',
    tli: '1971-01-31T23:37:24Z',
    loi: '1971-02-04T06:59:42Z',
    undock: '1971-02-05T04:50:44Z',
    pdi: '1971-02-05T09:05:28Z',
    landing: '1971-02-05T09:18:11Z',
    liftoff: '1971-02-06T18:48:42Z',
    docking: '1971-02-06T20:35:42Z',
    tei: '1971-02-07T01:39:04Z',
    entry: '1971-02-09T20:50:47Z',
    splashdown: '1971-02-09T21:05:00Z',
    site: { latDeg: -3.645, lonDeg: 342.529 },
  },
  {
    id: 'apollo15',
    name: 'Apollo 15',
    csm: 'Endeavour',
    lm: 'Falcon',
    launch: '1971-07-26T13:34:00Z',
    tli: '1971-07-26T16:29:54Z',
    loi: '1971-07-29T20:05:46Z',
    undock: '1971-07-30T18:13:16Z',
    pdi: '1971-07-30T22:04:09Z',
    landing: '1971-07-30T22:16:29Z',
    liftoff: '1971-08-02T17:11:23Z',
    docking: '1971-08-02T19:09:47Z',
    tei: '1971-08-04T21:22:45Z',
    entry: '1971-08-07T20:32:55Z',
    splashdown: '1971-08-07T20:45:53Z',
    site: { latDeg: 26.132, lonDeg: 3.634 },
  },
  {
    id: 'apollo16',
    name: 'Apollo 16',
    csm: 'Casper',
    lm: 'Orion',
    launch: '1972-04-16T17:54:00Z',
    tli: '1972-04-16T20:33:18Z',
    loi: '1972-04-19T20:22:28Z',
    undock: '1972-04-20T18:07:31Z',
    pdi: '1972-04-21T02:11:25Z',
    landing: '1972-04-21T02:23:35Z',
    liftoff: '1972-04-24T01:25:47Z',
    docking: '1972-04-24T03:35:18Z',
    tei: '1972-04-25T02:15:33Z',
    entry: '1972-04-27T19:31:31Z',
    splashdown: '1972-04-27T19:45:05Z',
    site: { latDeg: -8.973, lonDeg: 15.5 },
  },
  {
    id: 'apollo17',
    name: 'Apollo 17',
    csm: 'America',
    lm: 'Challenger',
    launch: '1972-12-07T05:33:00Z',
    tli: '1972-12-07T08:51:28Z',
    loi: '1972-12-10T19:47:23Z',
    undock: '1972-12-11T17:20:56Z',
    pdi: '1972-12-11T19:42:53Z',
    landing: '1972-12-11T19:54:57Z',
    liftoff: '1972-12-14T22:54:37Z',
    docking: '1972-12-15T01:10:15Z',
    tei: '1972-12-16T23:35:09Z',
    entry: '1972-12-19T19:11:38Z',
    splashdown: '1972-12-19T19:24:59Z',
    site: { latDeg: 20.191, lonDeg: 30.772 },
  },
];

const iso = isoToDays;
const siteDir = (site: Site, t: number) => unit(surfaceState('moon', site.latDeg, site.lonDeg, R_MOON, t).r);
const toGeo = (s: State, t: number): State => {
  const m = moonState(t);
  return { r: add(s.r, m.r), v: add(s.v, m.v) };
};
const toMoon = (s: State, t: number): State => {
  const m = moonState(t);
  return { r: sub(s.r, m.r), v: sub(s.v, m.v) };
};
/** Ângulo (rad, em [0, 2π)) de `r` no plano de normal `n`, a partir de `ref`, no sentido do movimento. */
const planeAngle = (r: Vec3, ref: Vec3, n: Vec3) => (Math.atan2(dot(cross(ref, r), n), dot(ref, r)) + 2 * Math.PI) % (2 * Math.PI);
const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/** Newton com diferenças finitas para 2 incógnitas e 2 resíduos, com passo amortecido. */
function newton2(f: (x: readonly [number, number]) => [number, number], x0: [number, number], steps: [number, number], iterations = 40): [number, number] {
  let x = x0;
  let fx = f(x);
  for (let k = 0; k < iterations && Math.hypot(...fx) > 1e-7; k++) {
    const J = [0, 1].map((j) => {
      const xp: [number, number] = j === 0 ? [x[0] + steps[0], x[1]] : [x[0], x[1] + steps[1]];
      const fp = f(xp);
      return [(fp[0] - fx[0]) / steps[j]!, (fp[1] - fx[1]) / steps[j]!];
    });
    const det = J[0]![0]! * J[1]![1]! - J[1]![0]! * J[0]![1]!;
    const dx0 = (-fx[0] * J[1]![1]! + fx[1] * J[1]![0]!) / det;
    const dx1 = (-fx[1] * J[0]![0]! + fx[0] * J[0]![1]!) / det;
    let lambda = 1;
    for (let tries = 0; tries < 12; tries++, lambda /= 2) {
      const xn: [number, number] = [x[0] + lambda * dx0, x[1] + lambda * dx1];
      const fn = f(xn);
      if (Math.hypot(...fn) < Math.hypot(...fx)) {
        x = xn;
        fx = fn;
        break;
      }
    }
  }
  if (Math.hypot(...fx) > 1e-4) throw new Error(`Tiro não convergiu: resíduo ${fx.map((v) => v.toExponential(2)).join(', ')}`);
  return x;
}

/**
 * Newton para 3 incógnitas e 2 resíduos: em cada passo, a menor correção que
 * zera a aproximação linear (pseudo-inversa, J⁺ = Jᵀ(JJᵀ)⁻¹), com busca de passo.
 */
function newtonMinNorm(
  f: (x: readonly number[]) => [number, number],
  x0: readonly number[],
  step: number | readonly number[],
  iterations = 25,
): number[] {
  let x = [...x0];
  let fx = f(x);
  const h = (j: number) => (typeof step === 'number' ? step : step[j]!);
  for (let k = 0; k < iterations && Math.hypot(...fx) > 1e-7; k++) {
    const J = x.map((_, j) => {
      const xp = [...x];
      xp[j]! += h(j);
      const fp = f(xp);
      return [(fp[0] - fx[0]) / h(j), (fp[1] - fx[1]) / h(j)] as const;
    });
    // JJᵀ (2×2) e a correção dx = −Jᵀ (JJᵀ)⁻¹ f.
    const a = J.reduce((acc, c) => acc + c[0] * c[0], 0);
    const b = J.reduce((acc, c) => acc + c[0] * c[1], 0);
    const d = J.reduce((acc, c) => acc + c[1] * c[1], 0);
    const det = a * d - b * b;
    const y0 = (d * fx[0] - b * fx[1]) / det;
    const y1 = (a * fx[1] - b * fx[0]) / det;
    const dx = J.map((c) => -(c[0] * y0 + c[1] * y1));
    let lambda = 1;
    for (let tries = 0; tries < 8; tries++, lambda /= 2) {
      const xn = x.map((v, j) => v + lambda * dx[j]!);
      const fn = f(xn);
      if (Math.hypot(...fn) < Math.hypot(...fx)) {
        x = xn;
        fx = fn;
        break;
      }
    }
  }
  if (Math.hypot(...fx) > 1e-4) throw new Error(`Tiro não convergiu: resíduo ${fx.map((v) => v.toExponential(2)).join(', ')}`);
  return x;
}

/** Direção da órbita: o plano de normal `n` (retrógrado em relação à rotação da Lua). */
export function orbitPlane(spec: ApolloSpec, tRef: number, tLand?: number, tLiftoff?: number): Vec3 {
  const pole = poleDirection('moon', tRef);
  if (tLand !== undefined && tLiftoff !== undefined) {
    const n = unit(cross(siteDir(spec.site, tLand), siteDir(spec.site, tLiftoff)));
    return dot(n, pole) > 0 ? scale(n, -1) : n;
  }
  const [n] = normalsWithInclination(siteDir(spec.site, tRef), pole, 180 - spec.inclinationDeg!);
  return n!;
}

/**
 * Chegada: o periselênio (raio rp, no plano n, no instante tP) cuja trajetória,
 * integrada para trás, chega ao perigeu de 185 km no instante da injeção.
 */
function solveTranslunar(n: Vec3, rp: number, tP: number, tTli: number, allowTilt = false): { peri: State; rows: Sample[]; tilt: number } {
  const [e1, e2] = basisAround(n);
  /** Periselênio no plano n; com `tilt`, a velocidade sai do plano girando em torno do raio (a LOI a traz de volta). */
  const periAt = (phi: number, vp: number, tilt = 0): State => {
    const r = scale(add(scale(e1, Math.cos(phi)), scale(e2, Math.sin(phi))), rp);
    return { r, v: scale(rotate(unit(cross(n, r)), unit(r), tilt), vp) };
  };
  const rPark = R_EARTH + PARKING_ALT_KM;
  // Resíduos lisos: o perigeu da órbita osculadora no instante da TLI (raio e instante), em vez do
  // raio e da velocidade radial nesse instante, que oscilam muito com φ.
  const residual = ([phi, vp]: readonly [number, number]): [number, number] => {
    const back = integrateTo(toGeo(periAt(phi, vp), tP), tP, tTli);
    const { rp: perigee, tSince } = perigeeOf(back);
    return [(perigee - rPark) / 100, tSince / 60];
  };
  // Chute: a hipérbole que chega de frente para o movimento da Lua (a Lua alcança a nave), projetada no plano.
  const moonV = moonState(tP).v;
  const sIn = perpendicular(scale(moonV, -1), n);
  const guess = arrivalPeriapsis(scale(sIn, 0.85), rp, MU_MOON, n);
  const phi0 = Math.atan2(dot(guess.r, e2), dot(guess.r, e1));
  // Varredura em torno do chute (e, se o Newton não convergir, na volta inteira) e depois Newton.
  const scan = (phis: number[], dvs: number[]): [number, number] => {
    let best: [number, number] = [phi0, norm(guess.v)];
    let bestF = Infinity;
    for (const p of phis) {
      for (const dv of dvs) {
        const x: [number, number] = [p, norm(guess.v) + dv];
        const fx = Math.hypot(...residual(x));
        if (fx < bestF) {
          bestF = fx;
          best = x;
        }
      }
    }
    return best;
  };
  const near = Array.from({ length: 81 }, (_, i) => phi0 + ((i - 40) * Math.PI) / 120);
  const around = Array.from({ length: 180 }, (_, i) => (i * Math.PI) / 90);
  let solution: [number, number] | null = null;
  for (const [phis, dvs] of [
    [near, [-0.06, -0.03, 0, 0.03, 0.06]],
    [around, [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15]],
  ] as const) {
    try {
      solution = newton2(residual, scan([...phis], [...dvs]), [1e-6, 1e-7]);
      break;
    } catch {
      // tenta a varredura seguinte
    }
  }
  let tilt = 0;
  if (!solution && allowTilt) {
    // Sem solução no plano: a hipérbole chega um pouco inclinada (a menor inclinação que fecha a conta).
    const tilted = (x: readonly number[]): [number, number] => {
      const back = integrateTo(toGeo(periAt(x[0]!, x[1]!, x[2]!), tP), tP, tTli);
      const { rp: perigee, tSince } = perigeeOf(back);
      return [(perigee - rPark) / 100, tSince / 60];
    };
    const start = scan([...around], [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15]);
    try {
      const x = newtonMinNorm(tilted, [start[0], start[1], 0], [1e-6, 1e-7, 1e-6]);
      solution = [x[0]!, x[1]!];
      tilt = x[2]!;
    } catch {
      solution = null;
    }
  }
  if (!solution) throw new Error('Sem trajetória translunar para este periselênio');
  const [phi, vp] = solution;
  const peri = periAt(phi, vp, tilt);
  return { peri, rows: integrate(toGeo(peri, tP), tP, tTli), tilt };
}

/**
 * Apollo 13: o plano do retorno livre não é conhecido. Entre os planos que
 * passam por Fra Mauro, o de menor inclinação em que existe a trajetória
 * (periselênio a 254 km no instante histórico, vindo da TLI histórica).
 */
function solveFreeReturn(spec: ApolloSpec, rp: number, tP: number, tTli: number): { n: Vec3; peri: State; rows: Sample[]; tilt: number } {
  const pole = poleDirection('moon', tP);
  for (const inc of [5, 7.5, 10, 12.5, 15, 20, 25, 30, 40]) {
    for (const n of normalsWithInclination(siteDir(spec.site, tP), pole, 180 - inc)) {
      try {
        return { n, ...solveTranslunar(n, rp, tP, tTli) };
      } catch {
        // próximo plano
      }
    }
  }
  throw new Error(`${spec.name}: sem retorno livre`);
}

/**
 * Missões com pouso: o plano que contém o local de pouso no pouso e na
 * decolagem; se não houver trajetória de chegada nele, o plano mais próximo
 * que passe pelo local no pouso (a decolagem fica para uma mudança de plano
 * do CSM, como as das Apollo 15 a 17).
 */
function solveLanding(
  spec: ApolloSpec,
  rp: number,
  tP: number,
  tTli: number,
  tLand: number,
  tLiftoff: number,
): { n: Vec3; peri: State; rows: Sample[]; tilt: number } {
  const n0 = orbitPlane(spec, tLand, tLand, tLiftoff);
  try {
    return { n: n0, ...solveTranslunar(n0, rp, tP, tTli, true) };
  } catch {
    // tenta planos vizinhos
  }
  const s = siteDir(spec.site, tLand);
  const pole = poleDirection('moon', tLand);
  const i0 = 180 - deg(angle(n0, pole));
  for (const di of [2.5, -2.5, 5, -5, 7.5, -7.5, 10, -10, 15, -15, 20, -20]) {
    const inc = i0 + di;
    if (inc <= Math.abs(spec.site.latDeg) || inc >= 90) continue;
    const normals = normalsWithInclination(s, pole, 180 - inc).sort((a, b) => angle(a, n0) - angle(b, n0));
    for (const n of normals) {
      try {
        return { n, ...solveTranslunar(n, rp, tP, tTli) };
      } catch {
        // próximo
      }
    }
  }
  throw new Error(`${spec.name}: sem trajetória de chegada`);
}

/** Perigeu da órbita osculadora em torno da Terra: raio (km) e tempo desde a passagem (s; negativo antes dela). */
function perigeeOf({ r, v }: State): { rp: number; tSince: number } {
  const rn = norm(r);
  const h = cross(r, v);
  const eVec = sub(scale(cross(v, h), 1 / MU_EARTH), scale(r, 1 / rn));
  const e = norm(eVec);
  const energy = dot(v, v) / 2 - MU_EARTH / rn;
  const a = -MU_EARTH / (2 * energy);
  const rp = (dot(h, h) / MU_EARTH) / (1 + e);
  const radial = dot(r, v);
  const cosNu = Math.max(-1, Math.min(1, dot(eVec, r) / (e * rn)));
  const nu = radial >= 0 ? Math.acos(cosNu) : -Math.acos(cosNu);
  if (e < 1) {
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    return { rp, tSince: (E - e * Math.sin(E)) / Math.sqrt(MU_EARTH / (a * a * a)) };
  }
  const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
  return { rp, tSince: (e * Math.sinh(H) - H) / Math.sqrt(MU_EARTH / (-a * -a * -a)) };
}

/**
 * Saída: a queima que leva à interface de entrada no instante histórico.
 * Componentes tangencial e radial no plano da órbita, mais a fora do plano
 * que for necessária para mirar a Terra (a menor possível).
 */
function solveTransearth(
  start: State,
  tBurn: number,
  tEi: number,
  guessKms: number,
  warm?: readonly number[],
): { burn: State; rows: Sample[]; dv: Vec3; x: number[] } {
  const geo = toGeo(start, tBurn);
  const t = unit(start.v);
  const r = perpendicular(start.r, t);
  const h = unit(cross(start.r, start.v));
  const rEi = R_EARTH + EI_ALT_KM;
  const dvOf = (x: readonly number[]): Vec3 => add(add(scale(t, x[0]!), scale(r, x[1]!)), scale(h, x[2]!));
  const withDv = (x: readonly number[]): State => ({ r: geo.r, v: add(geo.v, dvOf(x)) });
  const residual = (x: readonly number[]): [number, number] => {
    const end = integrateTo(withDv(x), tBurn, tEi);
    const gamma = 90 - deg(angle(end.r, end.v));
    return [(norm(end.r) - rEi) / 100, (gamma - ENTRY_ANGLE_DEG) / 0.1];
  };
  let x: number[] | null = null;
  if (warm) {
    try {
      x = newtonMinNorm(residual, warm, 1e-7);
    } catch {
      x = null;
    }
  }
  if (!x) {
    let best = [guessKms, 0, 0];
    let bestF = Math.hypot(...residual(best));
    for (let i = -6; i <= 6; i++) {
      for (let j = -3; j <= 3; j++) {
        const trial = [guessKms + i * 0.02, j * 0.05, 0];
        const fx = Math.hypot(...residual(trial));
        if (fx < bestF) {
          bestF = fx;
          best = trial;
        }
      }
    }
    x = newtonMinNorm(residual, best, 1e-7);
  }
  const burn = withDv(x);
  return { burn, rows: integrate(burn, tBurn, tEi), dv: dvOf(x), x };
}

/**
 * Onde a TEI sai mais barata: compara 12 pontos de uma volta da órbita
 * (instantes tTei + δ) por um teste rápido, resolve a queima nos dois
 * melhores e refina por seção áurea. Devolve o ângulo do ponto no plano.
 */
function bestTeiAngle(orbitAt: (t: number) => State, tTei: number, tEi: number, n: Vec3, ref: Vec3): number {
  const s0 = orbitAt(tTei);
  const a = 1 / (2 / norm(s0.r) - dot(s0.v, s0.v) / MU_MOON);
  const period = periodOf(a, MU_MOON) / DAY_S;
  const rEi = R_EARTH + EI_ALT_KM;
  const quick = (delta: number) => {
    const st = orbitAt(tTei + delta);
    const geo = toGeo(st, tTei + delta);
    const t = unit(st.v);
    const r = perpendicular(st.r, t);
    let best = Infinity;
    for (const dt of [0.9, 1.0, 1.1, 1.2]) {
      for (const dr of [-0.1, 0, 0.1]) {
        const end = integrateTo({ r: geo.r, v: add(geo.v, add(scale(t, dt), scale(r, dr))) }, tTei + delta, tEi);
        best = Math.min(best, Math.hypot((norm(end.r) - rEi) / 100, (90 - deg(angle(end.r, end.v)) - ENTRY_ANGLE_DEG) / 0.1));
      }
    }
    return best;
  };
  const deltas = Array.from({ length: 12 }, (_, k) => (k / 12 - 0.5) * period);
  const ranked = deltas.map((d) => ({ d, q: quick(d) })).sort((x, y) => x.q - y.q);
  let warm: number[] | undefined;
  const cost = (delta: number) => {
    try {
      const sol = solveTransearth(orbitAt(tTei + delta), tTei + delta, tEi, 1.0, warm);
      warm = sol.x;
      return Math.hypot(...sol.x);
    } catch {
      return Infinity;
    }
  };
  let best = ranked[0]!.d;
  let bestCost = Infinity;
  for (const { d } of ranked.slice(0, 2)) {
    warm = undefined;
    const c = cost(d);
    if (c < bestCost) {
      bestCost = c;
      best = d;
    }
  }
  if (!Number.isFinite(bestCost)) throw new Error('Nenhuma TEI possível na órbita');
  cost(best);
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = best - period / 12;
  let hi = best + period / 12;
  let c = hi - g * (hi - lo);
  let d = lo + g * (hi - lo);
  let fc = cost(c);
  let fd = cost(d);
  for (let k = 0; k < 6; k++) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - g * (hi - lo);
      fc = cost(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + g * (hi - lo);
      fd = cost(d);
    }
  }
  const delta = Math.min(fc, fd) <= bestCost ? (fc < fd ? c : d) : best;
  return planeAngle(orbitAt(tTei + delta).r, ref, n);
}

/** Raízes λ (escala da velocidade numa queima tangencial) de `miss`, em [0,95, 1,05]. */
function phaseRoots(miss: (lambda: number) => number): number[] {
  const roots: number[] = [];
  for (let i = 0; i < 200; i++) {
    const a = 0.95 + (i * 0.1) / 200;
    const b = 0.95 + ((i + 1) * 0.1) / 200;
    const fa = miss(a);
    const fb = miss(b);
    if (Math.sign(fa) === Math.sign(fb) || Math.abs(fa - fb) > 1) continue;
    roots.push(bisect(miss, a, b, 50));
  }
  return roots;
}

/** Entrada na atmosfera até a amerissagem: ~2 300 km sobre o solo, altitudes de uma reentrada Apollo. */
function entryProfile(ei: State, tEi: number, tSplash: number): Sample[] {
  const T = (tSplash - tEi) * DAY_S;
  const up = unit(ei.r);
  const n = unit(cross(ei.r, ei.v));
  const vr = dot(ei.v, up);
  const vh = norm(sub(ei.v, scale(up, vr)));
  const total = 2300 / R_EARTH;
  const ground = total * R_EARTH;
  const tau0 = bisect((x) => x * (1 - Math.exp(-T / x)) - ground / vh, 1, 1e5);
  const g = (tau: number) => (1 - Math.exp(-tau / tau0)) / (1 - Math.exp(-T / tau0));
  // Altitude (km) ao longo da reentrada: mergulho, patamar de frenagem a ~60 km, paraquedas a 7 km.
  const knots: readonly [number, number][] = [
    [0, EI_ALT_KM],
    [0.07, 80],
    [0.15, 62],
    [0.3, 58],
    [0.45, 45],
    [0.58, 25],
    [0.66, 7],
    [1, 0],
  ];
  const h = (tau: number) => {
    const x = tau / T;
    const k = Math.max(1, knots.findIndex(([f]) => f >= x));
    const [f0, h0] = knots[k - 1]!;
    const [f1, h1] = knots[k]!;
    return h0 + ((h1 - h0) * (x - f0)) / (f1 - f0);
  };
  const position = (tau: number) => scale(rotate(up, n, total * g(tau)), R_EARTH + h(tau));
  const fractions = [0, 0.02, 0.05, 0.09, 0.14, 0.2, 0.27, 0.35, 0.45, 0.55, 0.62, 0.7, 0.8, 0.9, 1];
  return fractions.map((f) => {
    const tau = f * T;
    if (f === 0) return { t: tEi, r: ei.r, v: ei.v };
    if (f === 1) return { t: tSplash, r: position(T), v: [0, 0, 0] };
    const d = 4;
    return { t: tEi + tau / DAY_S, r: position(tau), v: scale(sub(position(tau + d), position(tau - d)), 1 / (2 * d)) };
  });
}

/** Trajetória do módulo de comando em órbita lunar, por trechos de cônica com queimas. */
class LunarOrbit {
  readonly samples: Sample[] = [];
  private state: State;
  private t: number;
  constructor(start: State, t: number) {
    this.state = start;
    this.t = t;
    this.samples.push(sample(t, start));
  }
  at(t: number): State {
    if (t < this.t) return interpolate(this.samples, t, MU_MOON);
    return coast(this.state, this.t, t, MU_MOON);
  }
  /** Queima instantânea em t: o estado antes e o novo depois. */
  burn(t: number, after: (before: State) => State): { before: State; after: State } {
    const before = this.at(t);
    const next = after(before);
    this.samples.push(sample(t, before), sample(t + BURN_EPS, next));
    // O estado depois da queima vale no instante t (a amostra em t + BURN_EPS é acertada ao empacotar).
    this.state = next;
    this.t = t;
    return { before, after: next };
  }
  end(t: number) {
    this.samples.push(sample(t, this.at(t)));
  }
}

/** Altitudes (km) do periselênio e do aposselênio da órbita do estado. */
function apsidesKm(s: State): [number, number] {
  const r = norm(s.r);
  const a = 1 / (2 / r - dot(s.v, s.v) / MU_MOON);
  const h = norm(cross(s.r, s.v));
  const e = Math.sqrt(Math.max(0, 1 - (h * h) / (MU_MOON * a)));
  return [round(a * (1 - e) - R_MOON, 0), round(a * (1 + e) - R_MOON, 0)];
}

/** Velocidade horizontal (no plano n) de módulo `speed` no ponto r. */
const horizontal = (r: Vec3, n: Vec3, speed: number): Vec3 => scale(unit(cross(n, r)), speed);

export interface ApolloOutputs {
  readonly csm: ReconstructedData;
  readonly lm: ReconstructedData | null;
}

export function apollo(spec: ApolloSpec): ApolloOutputs {
  const tTli = iso(spec.tli);
  const tIns = iso(spec.launch) + 12 / 1440;
  const tEi = iso(spec.entry);
  const tSplash = iso(spec.splashdown);
  const landing = spec.landing ? { pdi: iso(spec.pdi!), land: iso(spec.landing), liftoff: iso(spec.liftoff!) } : null;
  const freeReturn = spec.pericynthion !== undefined;
  const tP = iso(spec.loi ?? spec.pericynthion!);
  const rp = R_MOON + (spec.pericynthionAltKm ?? CSM_ALT_KM);

  const tRef = landing ? landing.land : spec.doi ? iso(spec.doi) + 1 / 24 : tP + 10 / 24;
  const { n, peri, rows: outbound, tilt } = freeReturn
    ? solveFreeReturn(spec, rp, tP, tTli)
    : landing
      ? solveLanding(spec, rp, tP, tTli, landing.land, landing.liftoff)
      : (() => {
          const plane = orbitPlane(spec, tRef);
          return { n: plane, ...solveTranslunar(plane, rp, tP, tTli) };
        })();

  // Órbita de estacionamento: circular, no plano da injeção, do fim da subida (lançamento + 12 min) à TLI.
  const tli = outbound[0]!;
  const parking: State = { r: tli.r, v: scale(unit(tli.v), Math.sqrt(MU_EARTH / norm(tli.r))) };
  const earthPole: Vec3 = [0, Math.sin((23.4392911 * Math.PI) / 180), Math.cos((23.4392911 * Math.PI) / 180)];
  const info: Record<string, unknown> = {
    tliDeltaVKms: round(norm(tli.v) - norm(parking.v)),
    parkingInclinationDeg: round(deg(angle(cross(parking.r, parking.v), earthPole)), 1),
    lunarOrbitInclinationDeg: round(180 - deg(angle(n, poleDirection('moon', tP))), 1),
    ...(tilt ? { loiPlaneChangeDeg: round(deg(Math.abs(tilt)), 2) } : {}),
  };

  // ── Na Lua ──
  const moonSamples: Sample[] = outbound.filter((s) => s.t >= tP - MOON_WINDOW_DAYS).map((s) => sample(s.t, toMoon(s, s.t)));
  let lm: ReconstructedData | null = null;
  let tDepart: number;
  let inbound: Sample[];

  if (freeReturn) {
    // Apollo 13: retorno livre pela face oculta e a queima PC+2 para chegar antes.
    const tPc2 = iso(spec.pc2!);
    const coastRows = integrate(toGeo(peri, tP), tP, tPc2);
    moonSamples.push(...coastRows.slice(1).map((s) => sample(s.t, toMoon(s, s.t))));
    const atBurn = toMoon(coastRows[coastRows.length - 1]!, tPc2);
    const back = solveTransearth(atBurn, tPc2, tEi, 0.26);
    info['pc2OutOfPlaneMs'] = round(Math.abs(back.x[2]!) * 1000, 1);
    moonSamples.push(sample(tPc2 + BURN_EPS, toMoon(back.burn, tPc2)));
    info['pc2DeltaVKms'] = round(norm(back.dv));
    info['pericynthionAltKm'] = spec.pericynthionAltKm;
    inbound = back.rows;
    tDepart = tPc2;
  } else {
    const orbit = new LunarOrbit(peri, tP);
    const r1 = R_MOON + LOI1_APO_KM;
    // LOI-1 já no plano da órbita lunar (se a chegada vier inclinada, a queima corrige o plano).
    const loi = orbit.burn(tP, (b) => ({ r: b.r, v: horizontal(b.r, n, visViva(rp, (rp + r1) / 2, MU_MOON)) }));
    info['loiDeltaVKms'] = round(norm(sub(loi.before.v, loi.after.v)));
    const p1 = periodOf((rp + r1) / 2, MU_MOON) / DAY_S;

    const tTei = iso(spec.tei!);
    // Plano em que a TEI é calculada e a referência dos ângulos nele (muda com a mudança de plano do CSM).
    let nFinal = n;
    let refDir = basisAround(n)[0];
    let teiAngle = 0;
    let tFinalPhase: number;
    if (!landing && !spec.doi) {
      // Apollo 8: circulariza no periselênio depois de duas voltas.
      orbit.burn(tP + 2 * p1, (b) => ({ r: b.r, v: horizontal(b.r, n, Math.sqrt(MU_MOON / norm(b.r))) }));
      teiAngle = bestTeiAngle((t) => orbit.at(t), tTei, tEi, n, refDir);
      tFinalPhase = tP + 2 * p1 + 1 / 24;
    } else {
      // Ponto mais baixo da descida (PDI, ou a passagem rasante da Apollo 10) e a elipse de descida até ele.
      const rLow = R_MOON + (spec.lowPassAltKm ?? PDI_ALT_KM);
      const descentAngle = (rDoi: number, tSpan: number) => (visViva(rLow, (rDoi + rLow) / 2, MU_MOON) * tSpan * DAY_S) / (2 * rLow);
      const lowPoint = (rDoi: number) => {
        if (spec.doi) {
          const tDoi = iso(spec.doi);
          const tLow = tDoi + periodOf((rDoi + rLow) / 2, MU_MOON) / 2 / DAY_S;
          return { tDoi, tLow, dir: siteDir(spec.site, tLow) };
        }
        const span = landing!.land - landing!.pdi;
        const dir = rotate(siteDir(spec.site, landing!.land), n, -descentAngle(rDoi, span));
        return { tDoi: landing!.pdi - periodOf((rDoi + rLow) / 2, MU_MOON) / 2 / DAY_S, tLow: landing!.pdi, dir };
      };
      // LOI-2: depois de k voltas (1 a 6), com o outro ápside escolhido para o CSM estar oposto ao ponto
      // baixo no instante da DOI. Das soluções, a mais perto da órbita circular de 111 km.
      const tryLoi2 = (k: number, ro: number) => {
        const t2 = tP + k * p1;
        const before = orbit.at(t2);
        const a = (norm(before.r) + ro) / 2;
        const after: State = { r: before.r, v: horizontal(before.r, n, visViva(norm(before.r), a, MU_MOON)) };
        let low = lowPoint(R_MOON + CSM_ALT_KM);
        for (let it = 0; it < 3; it++) low = lowPoint(norm(coast(after, t2, low.tDoi, MU_MOON).r));
        const csm = coast(after, t2, low.tDoi, MU_MOON);
        return { t2, after, low, miss: wrap(planeAngle(csm.r, scale(low.dir, -1), n)) };
      };
      let choice: ReturnType<typeof tryLoi2> | null = null;
      let choiceGap = Infinity;
      for (let k = 1; k <= 6; k++) {
        const grid = Array.from({ length: 311 }, (_, i) => R_MOON + 40 + i);
        for (let i = 0; i + 1 < grid.length; i++) {
          const a = tryLoi2(k, grid[i]!);
          const b = tryLoi2(k, grid[i + 1]!);
          if (Math.sign(a.miss) === Math.sign(b.miss) || Math.abs(a.miss - b.miss) > 1) continue;
          const ro = bisect((x) => tryLoi2(k, x).miss, grid[i]!, grid[i + 1]!, 50);
          const gap = Math.abs(ro - (R_MOON + CSM_ALT_KM));
          if (gap < choiceGap) {
            choiceGap = gap;
            choice = tryLoi2(k, ro);
          }
        }
      }
      if (!choice) throw new Error(`${spec.name}: sem fase para a DOI`);
      const { t2, after: loi2State, low } = choice;
      orbit.burn(t2, () => loi2State);
      // Ponto ideal da TEI, pela órbita depois da LOI-2 (a fase muda, a geometria quase não).
      if (!landing) teiAngle = bestTeiAngle((t) => orbit.at(t), tTei, tEi, n, refDir);
      info['csmOrbitKm'] = apsidesKm(loi2State);

      // Módulo lunar: junto do CSM até a DOI, elipse de descida até o ponto baixo.
      const tUndock = iso(spec.undock!);
      const atDoi = orbit.at(low.tDoi);
      const rDoi = norm(atDoi.r);
      const doiState: State = { r: atDoi.r, v: horizontal(atDoi.r, n, visViva(rDoi, (rDoi + rLow) / 2, MU_MOON)) };
      const atLow = coast(doiState, low.tDoi, low.tLow, MU_MOON);
      const lmWindows: PackedWindow[] = [];
      const lmInfo: Record<string, unknown> = { doiDeltaVKms: round(norm(sub(atDoi.v, doiState.v)), 4), lowAltitudeKm: round(norm(atLow.r) - R_MOON, 1) };
      const descentOrbit: Sample[] = [sample(tUndock, orbit.at(tUndock)), sample(low.tDoi, atDoi), sample(low.tDoi + BURN_EPS, doiState)];

      // Subida e reencontro: o LM sai do ponto `start` (no instante tStart) numa órbita conhecida.
      const tDock = iso(spec.docking!);
      const tTpf = tDock - TPF_TO_DOCK_MIN / 1440;
      const tTpi = tTpf - TPI_TO_TPF_MIN / 1440;
      let lmBeforeTpi: (t: number) => State;
      let lmInsertion: { t: number; state: State } | null = null;
      if (landing) {
        // Descida motorizada: desacelera por igual do periselênio (15 km) até o local de pouso.
        const span = (landing.land - landing.pdi) * DAY_S;
        const psi = descentAngle(rDoi, landing.land - landing.pdi);
        const pdiDir = unit(atLow.r);
        const descentPos = (tau: number) => {
          const x = tau / span;
          return scale(rotate(pdiDir, n, psi * (2 * x - x * x)), R_MOON + (PDI_ALT_KM * (1 + Math.cos(Math.PI * x))) / 2);
        };
        const ground = surfaceState('moon', spec.site.latDeg, spec.site.lonDeg, R_MOON, landing.land);
        const descent = profileSamples(descentPos, span, landing.pdi, { r: atLow.r, v: atLow.v }, { r: ground.r, v: ground.v });
        lmInfo['descentRangeKm'] = round(psi * R_MOON, 0);
        descentOrbit.push(sample(landing.pdi, atLow));

        // Mudança de plano do CSM (LOPC) no primeiro nodo depois do pouso, se o local na decolagem
        // estiver fora do plano: o novo plano é o mais próximo que contém o local na decolagem.
        const liftoffSite = siteDir(spec.site, landing.liftoff);
        const n2 = unit(sub(n, scale(liftoffSite, dot(n, liftoffSite))));
        if (angle(n, n2) > 1e-4) {
          const across = (t: number) => dot(orbit.at(t).r, n2);
          let tNode = landing.land + 1 / 24;
          while (Math.sign(across(tNode)) === Math.sign(across(tNode + 2 / 1440))) tNode += 2 / 1440;
          tNode = bisect(across, tNode, tNode + 2 / 1440, 50);
          const lopc = orbit.burn(tNode, (b) => {
            const up = unit(b.r);
            const vr = dot(b.v, up);
            const vt = norm(sub(b.v, scale(up, vr)));
            return { r: b.r, v: add(scale(up, vr), scale(unit(cross(n2, up)), vt)) };
          });
          info['lopcDeltaVMs'] = round(norm(sub(lopc.after.v, lopc.before.v)) * 1000, 1);
          info['lopcDeg'] = round(deg(angle(n, n2)), 2);
          info['lopc'] = round(tNode, 6);
          nFinal = n2;
          refDir = basisAround(n2)[0];
        }
        teiAngle = bestTeiAngle((t) => orbit.at(t), tTei, tEi, nFinal, refDir);

        // Subida até a órbita de 17 × 83 km, acelerando por igual a partir do solo, no plano do CSM.
        const rIns = R_MOON + INSERTION_ORBIT_KM[0];
        const aIns = R_MOON + (INSERTION_ORBIT_KM[0] + INSERTION_ORBIT_KM[1]) / 2;
        const vIns = visViva(rIns, aIns, MU_MOON);
        const psiA = (vIns * ASCENT_S) / (2 * rIns);
        const liftoffDir = siteDir(spec.site, landing.liftoff);
        const insDir = rotate(liftoffDir, nFinal, psiA);
        const insertion: State = { r: scale(insDir, rIns), v: horizontal(insDir, nFinal, vIns) };
        const ascentPos = (tau: number) => {
          const x = tau / ASCENT_S;
          return scale(rotate(liftoffDir, nFinal, psiA * x * x), R_MOON + (INSERTION_ORBIT_KM[0] * (1 - Math.cos(Math.PI * x))) / 2);
        };
        const pad = surfaceState('moon', spec.site.latDeg, spec.site.lonDeg, R_MOON, landing.liftoff);
        const tInsertion = landing.liftoff + ASCENT_S / DAY_S;
        const ascent = profileSamples(ascentPos, ASCENT_S, landing.liftoff, { r: pad.r, v: pad.v }, insertion);
        lmInfo['ascentRangeKm'] = round(psiA * R_MOON, 0);
        lmInsertion = { t: tInsertion, state: insertion };
        lmBeforeTpi = (t) => coast(insertion, tInsertion, t, MU_MOON);
        lmWindows.push(
          packWindow({ body: 'moon', kind: 'orbit', samples: descentOrbit, mu: MU_MOON, tolKm: 1, ramp: [0, 0] }),
          packWindow({ body: 'moon', kind: 'orbit', samples: descent, mu: 0, gmOverride: 0, tolKm: 0.2, ramp: [0, 0] }),
          surfaceWindow('moon', spec.site.latDeg, spec.site.lonDeg, landing.land, landing.liftoff),
          packWindow({ body: 'moon', kind: 'orbit', samples: ascent, mu: 0, gmOverride: 0, tolKm: 0.2, ramp: [0, 0] }),
        );
      } else {
        // Apollo 10: segue na elipse de descida, passando rente ao local da Apollo 11 a cada volta.
        lmBeforeTpi = (t) => coast(doiState, low.tDoi, t, MU_MOON);
      }

      // CSM: ajuste de fase (queima tangencial) para estar 130° à frente do LM na transferência final.
      // Das soluções, a que deixa o CSM mais perto do ponto ideal da TEI (menos ajuste depois).
      const lopcAt = info['lopc'] as number | undefined;
      const tPhase = landing ? Math.max(landing.land + 2 / 24, lopcAt !== undefined ? lopcAt + 1 / 24 : -Infinity) : low.tLow + 1 / 24;
      const lmAtTpi = lmBeforeTpi(tTpi);
      const target = TPI_TRANSFER_DEG * (Math.PI / 180);
      const afterPhase = (lambda: number): State => {
        const before = orbit.at(tPhase);
        return { r: before.r, v: scale(before.v, lambda) };
      };
      const phaseMiss = (lambda: number) => wrap(planeAngle(coast(afterPhase(lambda), tPhase, tTpf, MU_MOON).r, lmAtTpi.r, nFinal) - target);
      const teiMiss = (lambda: number) => Math.abs(wrap(planeAngle(coast(afterPhase(lambda), tPhase, tTei, MU_MOON).r, refDir, nFinal) - teiAngle));
      const roots = phaseRoots(phaseMiss);
      // Peso alto para |λ − 1|: uma órbita excêntrica do CSM encarece o encontro; a fase da TEI ainda tem o ajuste final.
      const rendezvousCost = (x: number) => teiMiss(x) + 30 * Math.abs(x - 1);
      const lambda = roots.length ? roots.reduce((b, x) => (rendezvousCost(x) < rendezvousCost(b) ? x : b)) : 1;
      const phase = orbit.burn(tPhase, (b) => ({ r: b.r, v: scale(b.v, lambda) }));
      info['csmPhasingDeltaVMs'] = round(norm(sub(phase.after.v, phase.before.v)) * 1000, 1);

      // Transferência final do LM até o CSM (TPI → TPF) e aproximação até a acoplagem.
      const csmTpf = orbit.at(tTpf);
      const tpi = lambert(lmAtTpi.r, csmTpf.r, (tTpf - tTpi) * DAY_S, MU_MOON, nFinal);
      lmInfo['tpiDeltaVMs'] = round(norm(sub(tpi.v1, lmAtTpi.v)) * 1000, 1);
      lmInfo['tpfDeltaVMs'] = round(norm(sub(csmTpf.v, tpi.v2)) * 1000, 1);
      const rendezvous: Sample[] = [
        ...(lmInsertion ? [sample(lmInsertion.t, lmInsertion.state)] : descentOrbit.slice(0, 3)),
        sample(tTpi, lmAtTpi),
        { t: tTpi + BURN_EPS, r: lmAtTpi.r, v: tpi.v1 },
        { t: tTpf, r: csmTpf.r, v: tpi.v2 },
        sample(tTpf + BURN_EPS, csmTpf),
        sample(tDock, orbit.at(tDock)),
      ];
      lmWindows.push(packWindow({ body: 'moon', kind: 'orbit', samples: rendezvous, mu: MU_MOON, tolKm: 1, ramp: [0, 0] }));
      lm = {
        id: `${spec.id}-lm`,
        name: spec.lm!,
        source: 'Reconstrução pela mecânica orbital (scripts/reconstruct.mjs)',
        frame: 'eclíptica J2000 (ICRF); dias desde J2000; janelas em km e km/s',
        reconstruction: lmInfo,
        helio: { t: [], s: [] },
        encounters: lmWindows,
      };
      tFinalPhase = tDock + 1 / 24;
    }

    // Ajuste final de fase do CSM: estar no ponto ideal da TEI no instante histórico.
    const finalMiss = (lambda: number) => {
      const before = orbit.at(tFinalPhase);
      return wrap(planeAngle(coast({ r: before.r, v: scale(before.v, lambda) }, tFinalPhase, tTei, MU_MOON).r, refDir, nFinal) - teiAngle);
    };
    const finalRoots = phaseRoots(finalMiss);
    if (finalRoots.length) {
      const lambda = finalRoots.reduce((b, x) => (Math.abs(x - 1) < Math.abs(b - 1) ? x : b));
      const trim = orbit.burn(tFinalPhase, (b) => ({ r: b.r, v: scale(b.v, lambda) }));
      info['csmTeiPhasingDeltaVMs'] = round(norm(sub(trim.after.v, trim.before.v)) * 1000, 1);
    }

    // TEI: a queima que leva à interface de entrada no instante histórico.
    const atTei = orbit.at(tTei);
    const back = solveTransearth(atTei, tTei, tEi, 1.0);
    orbit.end(tTei);
    moonSamples.push(...orbit.samples, sample(tTei + BURN_EPS, toMoon(back.burn, tTei)));
    info['teiDeltaVKms'] = round(norm(back.dv));
    info['teiOutOfPlaneMs'] = round(Math.abs(back.x[2]!) * 1000, 1);
    inbound = back.rows;
    tDepart = tTei;
  }

  moonSamples.push(...inbound.filter((s) => s.t > tDepart + BURN_EPS && s.t <= tDepart + MOON_WINDOW_DAYS).map((s) => sample(s.t, toMoon(s, s.t))));
  const moonStart = tP - MOON_WINDOW_DAYS;
  const moonEnd = tDepart + MOON_WINDOW_DAYS;
  const coreStart = moonStart + MOON_RAMP_DAYS;
  const coreEnd = moonEnd - MOON_RAMP_DAYS;

  // ── Janelas da Terra ──
  const ei = inbound[inbound.length - 1]!;
  const earthSamples: Sample[] = [
    sample(tIns, coast(parking, tTli, tIns, MU_EARTH)),
    sample(tTli, parking),
    { t: tTli + BURN_EPS, r: tli.r, v: tli.v },
    ...outbound.slice(1).filter((s) => s.t <= coreStart),
    ...inbound.filter((s) => s.t >= coreEnd),
  ];
  const entry = entryProfile(ei, tEi, tSplash);
  const maxDistance = Math.max(...[...outbound, ...inbound].map((s) => norm(s.r)));
  info['entrySpeedKms'] = round(norm(ei.v), 2);
  info['maxDistanceKm'] = round(maxDistance, 0);
  // Horários da missão e nomes, para os eventos no app.
  const { id: _id, name: _name, inclinationDeg: _inc, ...timeline } = spec;
  info['mission'] = timeline;

  const csm: ReconstructedData = {
    id: spec.id,
    name: spec.name,
    source: 'Reconstrução pela mecânica orbital (scripts/reconstruct.mjs)',
    frame: 'eclíptica J2000 (ICRF); dias desde J2000; janelas em km e km/s',
    reconstruction: info,
    helio: { t: [], s: [] },
    encounters: [
      packWindow({ body: 'earth', kind: 'departure', samples: earthSamples, mu: MU_EARTH, tolKm: 10, ramp: [0, 0] }),
      packWindow({ body: 'moon', kind: freeReturn ? 'flyby' : 'orbit', samples: moonSamples, mu: MU_MOON, tolKm: 1, ramp: [MOON_RAMP_DAYS, MOON_RAMP_DAYS] }),
      packWindow({ body: 'earth', kind: 'orbit', samples: entry, mu: 0, gmOverride: 0, tolKm: 1, ramp: [0, 0] }),
    ],
  };
  return { csm, lm };
}

/** Amostras de um perfil de posição (km) em `span` segundos, com velocidade por diferenças centrais. */
function profileSamples(position: (tau: number) => Vec3, span: number, t0: number, first: State, last: State): Sample[] {
  const fractions = [0, 0.03, 0.07, 0.12, 0.18, 0.25, 0.33, 0.42, 0.52, 0.62, 0.72, 0.81, 0.88, 0.94, 0.98, 1];
  return fractions.map((f) => {
    if (f === 0) return sample(t0, first);
    if (f === 1) return sample(t0 + span / DAY_S, last);
    const tau = f * span;
    const d = Math.min(1, span * 0.002);
    return { t: t0 + tau / DAY_S, r: position(tau), v: scale(sub(position(tau + d), position(tau - d)), 1 / (2 * d)) };
  });
}
