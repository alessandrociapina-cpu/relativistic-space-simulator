/**
 * Descanso da tripulação (CLAUDE.md §4.2.9). A tolerância humana a uma
 * aceleração contínua cai com o tempo de exposição (as curvas de tolerância a
 * +Gx da NASA; a imersão em líquido estudada em Johnsville, em 1958, levou a
 * ~31 g por segundos). Quando o empuxo contínuo do plano passaria do limite do
 * piloto, a rota alterna queimas e descansos por inércia (sem peso): cada
 * queima usa 90 % da tolerância e cada descanso dura a tolerância inteira (no
 * mínimo 1 h), o bastante para a carga voltar a zero com folga.
 *
 * Não há medidas de recuperação depois de horas ou dias perto do limite: o
 * simulador estima que o corpo se recupera sem peso no mesmo ritmo em que se
 * desgasta sob a aceleração (como no trabalho físico pesado), em no mínimo 1 h.
 */
import { enduranceFor, longestBurnS, type CrewKind } from './accelerationPresets';
import { MAX_COAST_FRACTION, destinationMissionProfile, type Destination } from './destinations';
import {
  C,
  G0,
  flightSegments,
  hyperbolicSums,
  segmentAt,
  segmentState,
  type CrewRestCycle,
  type FlightSegment,
  type FlightState,
  type MissionProfile,
} from './RelativityEngine';

const C2 = C * C;
const coshm1 = (eta: number) => 2 * Math.sinh(eta / 2) ** 2;
const acosh1p = (eps: number) => Math.log1p(eps + Math.sqrt(eps * (2 + eps)));

/** Cada queima usa esta fração da tolerância contínua (margem de 10 %). */
export const BURN_FRACTION = 0.9;
/** Descanso mínimo entre queimas (s). */
export const MIN_REST_S = 3600;
/** Até esta aceleração (g) o corpo aguenta indefinidamente: não há desgaste e a recuperação continua. */
export const SUSTAINABLE_G = 1.2;
/** A tolerância cai com ~g⁻³ (as curvas de +Gx caem entre g⁻³ e g⁻⁴ de minutos a horas). */
const TOLERANCE_EXPONENT = 3;

/** Queima mais longa e descanso entre queimas (s de bordo). */
export interface RestCycle {
  readonly burnTau: number;
  readonly restTau: number;
}

/** Estado no início de um trecho do voo. */
export type SegmentStart = Pick<FlightSegment, 'startTau' | 'eta0' | 'remaining0' | 'earth0'>;

/** O ciclo para uma tolerância contínua; `null` se o corpo aguenta indefinidamente (ou não aguenta). */
export function restCycleFor(enduranceS: number): RestCycle | null {
  if (!(enduranceS > 0 && Number.isFinite(enduranceS))) return null;
  return { burnTau: BURN_FRACTION * enduranceS, restTau: Math.max(enduranceS, MIN_REST_S) };
}

const endOf = (seg: FlightSegment): SegmentStart => {
  const e = segmentState(seg, seg.duration);
  return { startTau: seg.startTau + seg.duration, eta0: e.eta, remaining0: e.remainingM, earth0: e.earthTimeS };
};

/** Queimas inteiras e o resto de um empuxo total `total` em queimas de no máximo `burn`. */
function splitBurns(total: number, burn: number): { full: number; partial: number } {
  const full = Math.floor(total / burn + 1e-9);
  const partial = total - full * burn;
  return { full, partial: partial > 1e-9 * burn ? partial : 0 };
}

/** Descansos entre as queimas: um depois de cada queima inteira, menos depois da última. */
const restsOf = ({ full, partial }: { full: number; partial: number }) => (partial > 0 ? full : Math.max(full - 1, 0));

/**
 * Distância para acelerar de η₀ a η₁: a das queimas, (c²/a)(cosh η₁ − cosh η₀), mais a dos
 * descansos, que acontecem em η₀ + jΔη (Δη = a·b/c, uma queima inteira).
 */
export function boostDistance(eta0: number, eta1: number, a: number, cycle: RestCycle): number {
  if (!(eta1 > eta0)) return 0;
  const rests = restsOf(splitBurns((C * (eta1 - eta0)) / a, cycle.burnTau));
  const dCosh = 2 * Math.sinh((eta1 + eta0) / 2) * Math.sinh((eta1 - eta0) / 2);
  return (C2 / a) * dCosh + cycle.restTau * C * hyperbolicSums(eta0, (a * cycle.burnTau) / C, rests)[0];
}

/**
 * Distância para frear de η até parar: a sequência da subida ao contrário (uma queima parcial,
 * depois inteiras), com os descansos em jΔη, j = 1, 2…
 */
export function brakingDistance(eta: number, a: number, cycle: RestCycle): number {
  const rests = restsOf(splitBurns((C * eta) / a, cycle.burnTau));
  return (C2 / a) * coshm1(eta) + cycle.restTau * C * hyperbolicSums(0, (a * cycle.burnTau) / C, rests)[0];
}

/** Acelera de η₀ até η₁: ciclos de queima e descanso e uma última queima, sem descanso depois. */
function boostSegments(start: SegmentStart, eta1: number, a: number, cycle: RestCycle): FlightSegment[] {
  if (!(eta1 > start.eta0)) return [];
  const { burnTau: b, restTau: r } = cycle;
  const split = splitBurns((C * (eta1 - start.eta0)) / a, b);
  const count = restsOf(split);
  const segments: FlightSegment[] = [];
  let at = start;
  if (count > 0) {
    const block: FlightSegment = { kind: 'cycles', ...at, duration: count * (b + r), accel: a, cycle: { burnTau: b, restTau: r, count } };
    segments.push(block);
    at = endOf(block);
  }
  segments.push({ kind: 'thrust', ...at, duration: (C * (eta1 - at.eta0)) / a, accel: a });
  return segments;
}

/** Freia de η até parar exatamente no alvo: queima parcial, descanso, ciclos e a última queima inteira. */
export function brakeSegments(start: SegmentStart, a: number, cycle: RestCycle): FlightSegment[] {
  const { burnTau: b, restTau: r } = cycle;
  const split = splitBurns((C * start.eta0) / a, b);
  const segments: FlightSegment[] = [];
  let at = start;
  if (split.full > 0 && split.partial > 0) {
    const first: FlightSegment = { kind: 'thrust', ...at, duration: split.partial, accel: -a };
    const rest: FlightSegment = { kind: 'coast', ...endOf(first), duration: r, accel: 0, rest: true };
    segments.push(first, rest);
    at = endOf(rest);
  }
  if (split.full > 1) {
    const count = split.full - 1;
    const block: FlightSegment = { kind: 'cycles', ...at, duration: count * (b + r), accel: -a, cycle: { burnTau: b, restTau: r, count } };
    segments.push(block);
    at = endOf(block);
  }
  segments.push({ kind: 'thrust', ...at, duration: (C * at.eta0) / a, accel: -a, toArrival: true });
  // A distância de cada trecho contada a partir do fim, como na última queima: sem o cancelamento
  // de subtrair do que faltava no início (até ~10²² m rumo a Andrômeda) o que já foi percorrido.
  let tail = 0;
  for (let i = segments.length - 2; i >= 0; i--) {
    tail = segmentState(segments[i + 1]!, 0).remainingM;
    const seg: FlightSegment = { ...segments[i]!, toArrival: true, tailM: tail };
    segments[i] = { ...seg, remaining0: segmentState(seg, 0).remainingM };
  }
  return segments;
}

/**
 * Freia já, com descansos, com a menor aceleração que para a nave no alvo: menor que a do
 * plano (religando perto do flip) ou maior (frenagem de emergência, além do limite). A
 * distância de frenagem cai com a aceleração, aos saltos (o número de descansos muda): uma
 * inércia curta antes da primeira queima cobre a diferença.
 */
export function brakeWithRests(start: SegmentStart, cycle: RestCycle, a0: number): { segments: FlightSegment[]; accel: number } {
  const { eta0: eta, remaining0: remaining } = start;
  let lo = Math.log(a0) - 40;
  let hi = Math.log(a0) + 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (brakingDistance(eta, Math.exp(mid), cycle) > remaining) lo = mid;
    else hi = mid;
  }
  const a = Math.exp(hi);
  const gap = (remaining - brakingDistance(eta, a, cycle)) / (C * Math.sinh(eta));
  if (!(gap > 0)) return { segments: brakeSegments(start, a, cycle), accel: a };
  const wait: FlightSegment = { kind: 'coast', ...start, duration: gap, accel: 0, rest: true };
  return { segments: [wait, ...brakeSegments(endOf(wait), a, cycle)], accel: a };
}

/**
 * Rota até parar no alvo com descansos: acelera de η₀ até η_top, segue por inércia pelo menos
 * um descanso (o flip fica no fim dele) e freia com a sequência da subida ao contrário. η_top é
 * a maior rapidez que cabe na distância, no máximo `etaCap` (o cruzeiro escolhido: aí a inércia
 * do meio é o cruzeiro, `cruise`); `null` se nem a frenagem com um descanso antes cabe.
 */
export function restRoute(
  start: SegmentStart,
  a: number,
  cycle: RestCycle,
  etaCap = Infinity,
): { segments: FlightSegment[]; flipTau: number; cruise: boolean } | null {
  const { eta0, remaining0: distance } = start;
  const need = (eta: number) =>
    boostDistance(eta0, eta, a, cycle) + C * Math.sinh(eta) * cycle.restTau + brakingDistance(eta, a, cycle);
  if (need(eta0) > distance) return null;
  // A distância só cresce com η_top: bissecção até a maior que cabe (sem descansos ela seria a do flip).
  let lo = eta0;
  let hi = Math.max(eta0, Math.min(etaCap, acosh1p(((a * distance) / C2 + coshm1(eta0)) / 2)));
  const cruise = hi === etaCap && need(hi) <= distance;
  if (cruise) lo = hi;
  for (let i = 0; i < 200 && hi - lo > 1e-15 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) <= distance) lo = mid;
    else hi = mid;
  }
  const boost = boostSegments(start, lo, a, cycle);
  const top = boost.length > 0 ? endOf(boost.at(-1)!) : start;
  const speed = C * Math.sinh(top.eta0);
  const coastTau = Math.max(cycle.restTau, speed > 0 ? (top.remaining0 - brakingDistance(top.eta0, a, cycle)) / speed : 0);
  // O cruzeiro não é um descanso marcado (o piloto pode religar o motor), embora a tripulação se recupere nele.
  const coast: FlightSegment = { kind: 'coast', ...top, duration: coastTau, accel: 0, ...(!cruise && { rest: true }) };
  return { segments: [...boost, coast, ...brakeSegments(endOf(coast), a, cycle)], flipTau: top.startTau + coastTau, cruise };
}

/** O plano com descansos a partir do plano analítico (mesma distância, aceleração e cruzeiro). */
export function crewRestProfile(plan: MissionProfile, cycle: RestCycle, enduranceS: number): MissionProfile {
  const route = restRoute({ startTau: 0, eta0: 0, remaining0: plan.distanceM, earth0: 0 }, plan.properAccel, cycle, plan.coastEta ?? Infinity)!;
  const { segments, flipTau, cruise } = route;
  const last = segments.at(-1)!;
  const tauTotal = last.startTau + last.duration;
  const tTotal = segmentState(last, last.duration).earthTimeS;
  const top = segmentAt(segments, flipTau - 1e-9 * tauTotal);
  const burns = segments.reduce((n, seg) => n + (seg.kind === 'cycles' ? seg.cycle!.count : seg.kind === 'thrust' ? 1 : 0), 0);
  return {
    distanceM: plan.distanceM,
    properAccel: plan.properAccel,
    halfDistanceM: plan.halfDistanceM,
    gammaMax: Math.cosh(top.eta0),
    etaMax: top.eta0,
    // A frenagem é a subida ao contrário: o voo é simétrico em torno do meio.
    tauHalf: tauTotal / 2,
    tauTotal,
    tHalf: tTotal / 2,
    tTotal,
    burnEndTau: top.startTau,
    brakeStartTau: flipTau,
    coastEta: cruise ? top.eta0 : null,
    segments,
    crewRest: { ...cycle, enduranceS, burns },
  };
}

/** O plano para a nave escolhida: com piloto humano e empuxo contínuo além da tolerância, com descansos. */
export function crewAwareProfile(plan: MissionProfile, crew: CrewKind, accelG: number): MissionProfile {
  if (crew !== 'crewed') return plan;
  const { enduranceS } = enduranceFor('crewed', accelG);
  const cycle = restCycleFor(enduranceS);
  if (!cycle || longestBurnS(plan) <= cycle.burnTau) return plan;
  return crewRestProfile(plan, cycle, enduranceS);
}

/** O plano da missão escolhida no planejamento. */
export const missionProfileFor = (destination: Destination, accelG: number, coastEta: number | null, crew: CrewKind) =>
  crewAwareProfile(destinationMissionProfile(destination, accelG, coastEta), crew, accelG);

/**
 * O cruzeiro limitado a 0,999 da rapidez de pico sem cruzeiro (com os descansos da tripulação, se
 * houver): trocar para uma aceleração menor não vira Flip-and-Burn sem aviso (`effectiveCoastEta`).
 */
export function plannedCoastEta(destination: Destination, accelG: number, coastEta: number | null, crew: CrewKind): number | null {
  if (coastEta === null) return null;
  return Math.min(coastEta, missionProfileFor(destination, accelG, null, crew).etaMax * MAX_COAST_FRACTION);
}

// ── Carga na tripulação ──────────────────────────────────────────────────────

/** A tolerância de referência do plano: a aceleração escolhida, a proteção dela e a recuperação. */
export interface CrewTolerance {
  readonly accelG: number;
  /** Tolerância contínua a `accelG` (s): `Infinity` sem limite, 0 sem chance. */
  readonly enduranceS: number;
  /** Tempo para a carga cair de 100 % a 0 sem peso (s). */
  readonly recoveryS: number;
}

export function crewToleranceFor(accelG: number): CrewTolerance {
  const { enduranceS } = enduranceFor('crewed', accelG);
  return { accelG, enduranceS, recoveryS: Math.max(Number.isFinite(enduranceS) ? enduranceS : 0, MIN_REST_S) };
}

/** A tolerância de um plano com descansos (a mesma de `crewToleranceFor`, sem procurar o preset de novo). */
export const restPlanTolerance = (plan: MissionProfile & { crewRest: CrewRestCycle }): CrewTolerance => ({
  accelG: plan.properAccel / G0,
  enduranceS: plan.crewRest.enduranceS,
  recoveryS: plan.crewRest.restTau,
});

/** Tolerância contínua (s) a uma aceleração `g` qualquer, a partir da do plano (~g⁻³). */
function enduranceAt(g: number, tol: CrewTolerance): number {
  if (g <= SUSTAINABLE_G) return Infinity;
  if (tol.enduranceS > 0 && Number.isFinite(tol.enduranceS)) return tol.enduranceS * (tol.accelG / g) ** TOLERANCE_EXPONENT;
  // Plano sem limite (até 1,2 g) numa frenagem de emergência, ou hipotético (0: sem chance).
  return enduranceFor('crewed', g).enduranceS;
}

/** A carga depois de `dt` segundos no segmento: sobe com 1/tolerância sob peso e cai com 1/recuperação sem ele. */
function advanceStrain(strain: number, seg: FlightSegment, dt: number, tol: CrewTolerance): number {
  if (!(dt > 0)) return strain;
  const recover = (s: number, t: number) => Math.max(0, s - t / tol.recoveryS);
  const load = (s: number, accel: number, t: number) => {
    const e = enduranceAt(Math.abs(accel) / G0, tol);
    return e === Infinity ? recover(s, t) : s + t / e;
  };
  switch (seg.kind) {
    case 'coast':
      return recover(strain, dt);
    case 'thrust':
      return load(strain, seg.accel, dt);
    case 'ramp': {
      const n = 32;
      let s = strain;
      for (let i = 0; i < n; i++) s = load(s, seg.accel * (1 - ((i + 0.5) * dt) / (n * seg.duration)), dt / n);
      return s;
    }
    case 'cycles': {
      const { burnTau: b, restTau: r, count } = seg.cycle!;
      const e = enduranceAt(Math.abs(seg.accel) / G0, tol);
      const up = e === Infinity ? 0 : b / e;
      const down = r / tol.recoveryS;
      // Cada ciclo soma up − down (sem passar de zero para baixo).
      const k = Math.min(Math.floor(dt / (b + r)), count);
      const s = Math.max(0, strain + k * (up - down));
      const local = dt - k * (b + r);
      if (k === count || !(local > 0)) return s;
      return local < b ? load(s, seg.accel, local) : recover(s + up, local - b);
    }
  }
}

/** Carga acumulada na tripulação no instante τ (1 = o limite do corpo). */
export function crewStrainAt(profile: MissionProfile, tau: number, tol: CrewTolerance): number {
  let strain = 0;
  for (const seg of flightSegments(profile)) {
    if (seg.startTau >= tau) break;
    strain = advanceStrain(strain, seg, Math.min(tau, seg.startTau + seg.duration) - seg.startTau, tol);
  }
  return strain;
}

/** Até quando a queima (motor ligado) ou o descanso (desligado) em curso vai. */
function phaseEndTau(segments: readonly FlightSegment[], tau: number, engineOn: boolean): number {
  const startIndex = segments.indexOf(segmentAt(segments, tau));
  for (const seg of segments.slice(startIndex)) {
    if (seg.kind === 'cycles') {
      const { burnTau: b, restTau: r } = seg.cycle!;
      const k = Math.max(0, Math.floor((tau - seg.startTau) / (b + r)));
      const cycleStart = seg.startTau + k * (b + r);
      if (tau < seg.startTau) return engineOn ? seg.startTau + b : seg.startTau;
      return engineOn ? cycleStart + b : cycleStart + b + r;
    }
    const off = seg.kind === 'coast';
    if (off !== !engineOn) return Math.max(tau, seg.startTau);
  }
  const last = segments.at(-1)!;
  return last.startTau + last.duration;
}

/** Fim da queima em curso no instante τ (s de bordo). */
export const burnEndAt = (profile: MissionProfile, tau: number) => phaseEndTau(flightSegments(profile), tau, true);
/** Início da próxima queima, no descanso (ou na inércia) em curso no instante τ (s de bordo). */
export const nextBurnAt = (profile: MissionProfile, tau: number) => phaseEndTau(flightSegments(profile), tau, false);

export type CrewCondition = 'ready' | 'easy' | 'thrust' | 'rest' | 'coast' | 'over-limit' | 'hypothetical' | 'arrived';

export interface CrewStatus {
  readonly condition: CrewCondition;
  /** Carga acumulada: 1 = o limite do corpo. */
  readonly strain: number;
  /** Aceleração sentida agora (g). */
  readonly accelG: number;
  /** Até o fim da queima ou do descanso em curso (s de bordo); `null` quando não se aplica. */
  readonly untilChangeS: number | null;
}

/** O estado do piloto humano no instante do voo. */
export function crewStatusAt(profile: MissionProfile, flight: FlightState, tol: CrewTolerance, started: boolean): CrewStatus {
  const accelG = flight.thrustAccel / G0;
  if (tol.enduranceS === 0) return { condition: 'hypothetical', strain: started ? Infinity : 0, accelG, untilChangeS: null };
  const strain = crewStrainAt(profile, flight.tau, tol);
  if (flight.phase === 'arrived' || flight.phase === 'flyby') return { condition: 'arrived', strain, accelG, untilChangeS: null };
  if (!started) return { condition: 'ready', strain, accelG, untilChangeS: null };
  const engineOn = flight.engine !== 'off';
  const untilChangeS = phaseEndTau(flightSegments(profile), flight.tau, engineOn) - flight.tau;
  if (strain > 1 + 1e-9) return { condition: 'over-limit', strain, accelG, untilChangeS };
  if (engineOn) return { condition: accelG <= SUSTAINABLE_G ? 'easy' : 'thrust', strain, accelG, untilChangeS };
  return { condition: flight.crewRest ? 'rest' : 'coast', strain, accelG, untilChangeS };
}
