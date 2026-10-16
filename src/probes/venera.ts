/**
 * Venera 7 e Venera 13. O JPL Horizons não tem as trajetórias soviéticas,
 * então elas são reconstruídas pela mecânica orbital a partir das datas de
 * partida e de pouso, com o mesmo modelo de planetas do resto do simulador:
 *
 * - arco heliocêntrico de Lambert: a cônica em torno do Sol que vai da Terra,
 *   na injeção para Vênus, a Vênus, na entrada na atmosfera;
 * - partida: hipérbole em torno da Terra a partir de uma órbita de 200 km,
 *   saindo na direção do excesso de velocidade v∞ que o arco pede;
 * - chegada: hipérbole em torno de Vênus até 125 km de altitude, mirando o
 *   lado voltado para a Terra (os módulos transmitiam direto para cá);
 *   depois a descida até o solo e o tempo de transmissão de lá.
 *
 * Correções de rota e o ponto exato de pouso não entram: é a rota que a
 * física exige entre as duas datas, não a telemetria da missão.
 */
import { PLANETS, SUN_GM, planetPosition, planetVelocity } from './planets';
import { lambert, propagate, type State } from './kepler';
import { muAu, unpackTable, type StateTable } from './ephemeris';
import { AU_KM, AU_PER_DAY_TO_KMS, DAY_S, makeTrajectory, type Encounter, type ProbeTrajectory } from './probes';
import { isoToDays } from './time';
import { add, cross, dot, norm, scale, sub, type Vec3 } from './vec3';

export type VeneraId = 'venera7' | 'venera13';

interface VeneraSpec {
  readonly name: string;
  /** Injeção para Vênus (UTC): cerca de uma hora depois do lançamento, a partir da órbita de estacionamento. */
  readonly departure: string;
  /** Pouso (UTC). */
  readonly landing: string;
  /** Da entrada na atmosfera (125 km) ao pouso, em minutos. */
  readonly descentMin: number;
  /** Tempo de transmissão do solo, em minutos. */
  readonly surfaceMin: number;
}

export const VENERA_SPECS: Readonly<Record<VeneraId, VeneraSpec>> = {
  // Lançamento em 17/08/1970 05:38 UTC; pouso em 15/12/1970 05:34 UTC, 35 min depois da entrada; 23 min de sinal do solo.
  venera7: { name: 'Venera 7', departure: '1970-08-17T06:38Z', landing: '1970-12-15T05:34Z', descentMin: 35, surfaceMin: 23 },
  // Lançamento em 30/10/1981 06:04 UTC; pouso em 01/03/1982 03:57 UTC, ~1 h depois da entrada; 127 min no solo.
  venera13: { name: 'Venera 13', departure: '1981-10-30T07:04Z', landing: '1982-03-01T03:57Z', descentMin: 62, surfaceMin: 127 },
};

const PARKING_ALTITUDE_KM = 200;
const ENTRY_ALTITUDE_KM = 125;
/** Raio do periapse da hipérbole de chegada (dentro do planeta: a rota termina na atmosfera). */
const IMPACT_PERIAPSIS = 0.5;
const APPROACH_DAYS = 3;

export interface VeneraReconstruction {
  readonly id: VeneraId;
  readonly trajectory: ProbeTrajectory;
  /** Injeção, entrada na atmosfera, pouso e fim do sinal (dias desde J2000). */
  readonly departureT: number;
  readonly entryT: number;
  readonly landingT: number;
  readonly endT: number;
  readonly departureVInfKms: number;
  readonly arrivalVInfKms: number;
  /** Velocidade em relação a Vênus na entrada na atmosfera (km/s). */
  readonly entrySpeedKms: number;
  /** Ângulo percorrido em torno do Sol (graus). */
  readonly transferAngleDeg: number;
}

const unit = (v: Vec3) => scale(v, 1 / norm(v));
/** Componente de `v` perpendicular a `n` (unitário), normalizada. */
const perpendicular = (v: Vec3, n: Vec3) => unit(sub(v, scale(n, dot(v, n))));

/** Tabela (UA, UA/dia) a partir de estados em km e km/s. */
function table(rows: readonly { t: number; state: State }[], muKm: number): StateTable {
  return unpackTable(
    {
      t: rows.map((r) => r.t),
      s: rows.flatMap(({ state }) => [...scale(state.r, 1 / AU_KM), ...scale(state.v, 1 / AU_PER_DAY_TO_KMS)]),
    },
    muAu(muKm),
  );
}

const encounter = (body: Encounter['body'], t: StateTable, kind: Encounter['kind'], rampIn: number, rampOut: number): Encounter => ({
  body,
  table: t,
  site: null,
  start: t.t[0]!,
  end: t.t[t.t.length - 1]!,
  rampIn,
  rampOut,
  kind,
});

/**
 * Hipérbole em torno de um planeta com periapse `rp` (km) e assíntota `s`
 * (unitária): a de saída (v∞ ao longo de +s) ou a de chegada (vinda de −s).
 * A base (p, q) do plano orbital segue o lado `side` (unitário, ⟂ s).
 */
function hyperbola(vInf: number, rp: number, mu: number, s: Vec3, side: Vec3, outgoing: boolean) {
  const e = 1 + (rp * vInf * vInf) / mu;
  const thetaInf = Math.acos(-1 / e);
  const c = Math.cos(thetaInf);
  const sn = Math.sin(thetaInf);
  // Saída: r̂ → +s quando ν → θ∞. Chegada: r̂ → −s quando ν → −θ∞, curvando para o lado `side`.
  const p = outgoing ? sub(scale(s, c), scale(side, sn)) : add(scale(s, -c), scale(side, sn));
  const q = outgoing ? add(scale(s, sn), scale(side, c)) : add(scale(side, c), scale(s, sn));
  const vp = Math.sqrt(vInf * vInf + (2 * mu) / rp);
  return { periapsis: { r: scale(p, rp), v: scale(q, vp) } as State, e, a: mu / (vInf * vInf) };
}

export function reconstructVenera(id: VeneraId): VeneraReconstruction {
  const spec = VENERA_SPECS[id];
  const departureT = isoToDays(spec.departure);
  const landingT = isoToDays(spec.landing);
  const entryT = landingT - spec.descentMin / 1440;
  const endT = landingT + spec.surfaceMin / 1440;

  // Arco de Lambert entre a Terra na partida e Vênus na entrada.
  const earthR = scale(planetPosition('earth', departureT), AU_KM);
  const earthV = scale(planetVelocity('earth', departureT), AU_PER_DAY_TO_KMS);
  const venusR = scale(planetPosition('venus', entryT), AU_KM);
  const venusV = scale(planetVelocity('venus', entryT), AU_PER_DAY_TO_KMS);
  const { v1, v2 } = lambert(earthR, venusR, (entryT - departureT) * DAY_S, SUN_GM);
  const helio = table(
    [
      { t: departureT, state: { r: earthR, v: v1 } },
      { t: entryT, state: { r: venusR, v: v2 } },
    ],
    SUN_GM,
  );

  // Partida: periapse a 200 km no instante da injeção; a cônica faz o resto.
  const muEarth = PLANETS.earth.gm;
  const vInfDep = sub(v1, earthV);
  const sDep = unit(vInfDep);
  const north: Vec3 = [0, 0, 1];
  const normal = perpendicular(Math.abs(dot(north, sDep)) > 0.99 ? [1, 0, 0] : north, sDep);
  const depart = hyperbola(norm(vInfDep), PLANETS.earth.radiusKm + PARKING_ALTITUDE_KM, muEarth, sDep, cross(normal, sDep), true);
  const departureEnd = departureT + APPROACH_DAYS;
  const departureTable = table(
    [
      { t: departureT, state: depart.periapsis },
      { t: departureEnd, state: propagate(depart.periapsis, APPROACH_DAYS * DAY_S, muEarth) },
    ],
    muEarth,
  );

  // Chegada: mira o lado de Vênus voltado para a Terra, com o periapse dentro do planeta.
  const muVenus = PLANETS.venus.gm;
  const radius = PLANETS.venus.radiusKm;
  const vInfArr = sub(v2, venusV);
  const sArr = unit(vInfArr);
  const toEarth = sub(scale(planetPosition('earth', entryT), AU_KM), venusR);
  const arrive = hyperbola(norm(vInfArr), IMPACT_PERIAPSIS * radius, muVenus, sArr, perpendicular(toEarth, sArr), false);
  // Tempo do periapse até a entrada (antes dele): r = a(e cosh F − 1), t = √(a³/μ)(e sinh F − F).
  const rEntry = radius + ENTRY_ALTITUDE_KM;
  const F = -Math.acosh((rEntry / arrive.a + 1) / arrive.e);
  const entryToPeriS = -Math.sqrt(arrive.a ** 3 / muVenus) * (arrive.e * Math.sinh(F) - F);
  const at = (t: number) => propagate(arrive.periapsis, (t - entryT) * DAY_S - entryToPeriS, muVenus);
  const entryState = at(entryT);
  const approachTable = table(
    [
      { t: entryT - APPROACH_DAYS, state: at(entryT - APPROACH_DAYS) },
      { t: entryT, state: entryState },
    ],
    muVenus,
  );

  // Descida: freada brusca no alto da atmosfera e queda lenta até o solo,
  // na vertical do ponto de entrada; depois, parado no solo até o fim do sinal.
  const up = unit(entryState.r);
  const descentMin = spec.descentMin;
  const profile: readonly [number, number][] = [
    [0, ENTRY_ALTITUDE_KM],
    [0.05, 65],
    [0.3, 42],
    [0.65, 18],
    [1, 0],
  ];
  const descentRows = profile.map(([f, h], i) => {
    const prev = profile[Math.max(i - 1, 0)]!;
    const next = profile[Math.min(i + 1, profile.length - 1)]!;
    const rate = i === profile.length - 1 ? 0 : (next[1] - prev[1]) / ((next[0] - prev[0]) * descentMin * 60);
    return { t: entryT + (f * descentMin) / 1440, state: { r: scale(up, radius + h), v: scale(up, rate) } };
  });
  const ground: State = { r: scale(up, radius), v: [0, 0, 0] };
  const surfaceTable = table([...descentRows, { t: endT, state: ground }], 0);

  const trajectory = makeTrajectory(id, spec.name, helio, [
    encounter('earth', departureTable, 'departure', 0, APPROACH_DAYS * 0.25),
    encounter('venus', approachTable, 'orbit', 1, 0),
    encounter('venus', surfaceTable, 'orbit', 0, 0),
  ]);

  const angle = Math.acos(dot(unit(earthR), unit(venusR)));
  return {
    id,
    trajectory,
    departureT,
    entryT,
    landingT,
    endT,
    departureVInfKms: norm(vInfDep),
    arrivalVInfKms: norm(vInfArr),
    entrySpeedKms: norm(entryState.v),
    transferAngleDeg: ((cross(earthR, venusR)[2] < 0 ? 2 * Math.PI - angle : angle) * 180) / Math.PI,
  };
}
