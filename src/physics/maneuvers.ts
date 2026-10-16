/**
 * O piloto desliga e religa o motor (CLAUDE.md §4.2.8). O voo deixa de ser o
 * plano analítico e vira uma sequência de segmentos (empuxo, rampa, inércia),
 * deterministica em τ: a linha do tempo e o scrub continuam valendo.
 *
 * - Desligar: a aceleração cai linearmente até zero (rampa) e a nave segue por
 *   inércia até passar pelo alvo, ou fica à deriva se parar antes.
 * - Religar: o piloto automático refaz a rota para parar no alvo: acelera e
 *   freia com a aceleração do plano, ou, se já não há distância para isso,
 *   freia na hora com a aceleração que for preciso (frenagem de emergência).
 */
import {
  C,
  computeFlightState,
  segmentState,
  type FlightSegment,
  type ManeuverEnd,
  type MissionProfile,
} from './RelativityEngine';

const C2 = C * C;

/** acosh(1 + ε) e cosh η − 1 sem cancelamento (as mesmas do motor). */
const acosh1p = (eps: number) => Math.log1p(eps + Math.sqrt(eps * (2 + eps)));
const coshm1 = (eta: number) => 2 * Math.sinh(eta / 2) ** 2;

/** Quanto a rampa de desligamento dura em segundos reais, no multiplicador do momento. */
export const ENGINE_RAMP_REAL_S = 3;
/** A rampa nunca passa desta fração da viagem planejada (multiplicadores muito altos). */
const MAX_RAMP_FRACTION = 1 / 20;
/**
 * À deriva: se a passagem pelo alvo demora mais que tantas vezes a viagem
 * planejada (no relógio mais longo, o da Terra), a linha do tempo termina aí.
 */
const DRIFT_LIMIT_FACTOR = 100;

const planOf = (profile: MissionProfile) => profile.maneuvers?.plan ?? profile;

function segmentAt(profile: MissionProfile, kind: FlightSegment['kind'], startTau: number, duration: number, accel: number, extra: Partial<FlightSegment> = {}): FlightSegment {
  const s = computeFlightState(profile, startTau);
  return { kind, startTau, duration, accel, eta0: s.eta, remaining0: s.restDistanceRemainingM, earth0: s.earthTimeS, ...extra };
}

/** Os segmentos do plano analítico: acelerar, cruzar (se houver) e frear até o alvo. */
export function planSegments(plan: MissionProfile): FlightSegment[] {
  const a = plan.properAccel;
  const segments = [segmentAt(plan, 'thrust', 0, plan.burnEndTau, a)];
  if (plan.brakeStartTau > plan.burnEndTau) {
    segments.push(segmentAt(plan, 'coast', plan.burnEndTau, plan.brakeStartTau - plan.burnEndTau, 0));
  }
  segments.push(segmentAt(plan, 'thrust', plan.brakeStartTau, plan.tauTotal - plan.brakeStartTau, -a, { toArrival: true }));
  return segments;
}

/** Os segmentos do voo atual até τ (o último cortado em τ). */
function segmentsUntil(profile: MissionProfile, tau: number): FlightSegment[] {
  const all = profile.maneuvers?.segments ?? planSegments(profile);
  return all
    .filter((seg) => seg.startTau < tau)
    .map((seg) => (seg.startTau + seg.duration > tau ? { ...seg, duration: tau - seg.startTau } : seg));
}

/** Monta o perfil efetivo a partir dos segmentos (os campos que o resto do app lê). */
function buildProfile(
  plan: MissionProfile,
  firstTau: number,
  segments: FlightSegment[],
  end: ManeuverEnd,
  flipTau: number | null,
): MissionProfile {
  const last = segments.at(-1)!;
  const tauTotal = last.startTau + last.duration;
  const endState = segmentState(last, last.duration);
  // Pico de rapidez: nos extremos de cada segmento (dentro dele, η é monótona).
  let etaMax = 0;
  let peakTau = 0;
  let peakEarth = 0;
  for (const seg of segments) {
    const e = segmentState(seg, seg.duration);
    if (seg.eta0 > etaMax) [etaMax, peakTau, peakEarth] = [seg.eta0, seg.startTau, seg.earth0];
    if (e.eta > etaMax) [etaMax, peakTau, peakEarth] = [e.eta, seg.startTau + seg.duration, e.earthTimeS];
  }
  const firstOff = segments.find((seg) => seg.kind !== 'thrust' || seg.accel < 0);
  const brake = end === 'arrival' ? last : null;
  const coast = segments.find((seg) => seg.kind === 'coast');
  return {
    distanceM: plan.distanceM,
    properAccel: plan.properAccel,
    halfDistanceM: plan.halfDistanceM,
    gammaMax: Math.cosh(etaMax),
    etaMax,
    tauHalf: peakTau,
    tauTotal,
    tHalf: peakEarth,
    tTotal: endState.earthTimeS,
    burnEndTau: firstOff?.startTau ?? tauTotal,
    brakeStartTau: brake ? brake.startTau : tauTotal,
    coastEta: coast ? coast.eta0 : null,
    maneuvers: { plan, firstTau, segments, end, flipTau },
  };
}

/** Termina a inércia: até passar pelo alvo, ou à deriva se ela não acontece num tempo razoável. */
function coastToEnd(seg: FlightSegment, plan: MissionProfile): { segment: FlightSegment; end: ManeuverEnd } {
  const planSpan = Math.max(plan.tauTotal, plan.tTotal);
  const speed = C * Math.sinh(seg.eta0);
  const toFlyby = speed > 0 ? seg.remaining0 / speed : Infinity;
  if (toFlyby <= DRIFT_LIMIT_FACTOR * planSpan) return { segment: { ...seg, duration: toFlyby }, end: 'flyby' };
  // Parada (ou quase): a linha do tempo segue mais uma viagem planejada e termina.
  return { segment: { ...seg, duration: speed > 0 ? DRIFT_LIMIT_FACTOR * planSpan : planSpan }, end: 'drift' };
}

/** Bissecção em [0, s₁] para f(s) = 0, com f(0) > 0 ≥ f(s₁). */
function bisect(f: (s: number) => number, s1: number): number {
  let lo = 0;
  let hi = s1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** O motor pode ser desligado (empuxo) ou religado (inércia, antes do fim do voo)? */
export function engineCommandAt(profile: MissionProfile, tau: number): 'cut' | 'relight' | null {
  if (!(tau > 0 && tau < profile.tauTotal)) return null;
  const s = computeFlightState(profile, tau);
  if (s.engine === 'thrust') return 'cut';
  if (s.engine === 'off' && s.phase === 'coasting') return 'relight';
  return null;
}

/**
 * Desliga o motor em τ: a aceleração cai linearmente até zero em `rampTau`
 * segundos de bordo e a nave segue por inércia.
 */
export function cutEngine(profile: MissionProfile, tau: number, rampTau: number): MissionProfile {
  const plan = planOf(profile);
  const now = computeFlightState(profile, tau);
  if (now.engine !== 'thrust') return profile;
  const a0 = now.phase === 'decelerating' ? -now.thrustAccel : now.thrustAccel;
  const segments = segmentsUntil(profile, tau);
  const firstTau = Math.min(profile.maneuvers?.firstTau ?? tau, tau);
  let duration = Math.min(Math.max(rampTau, 1e-6), plan.tauTotal * MAX_RAMP_FRACTION);

  // Freando, a nave pode parar durante a rampa: η(u) = η₀ + (a₀/c)(u − u²/2d) chega a 0 antes de d.
  let stops = false;
  if (a0 < 0) {
    const k = (2 * now.eta * C) / (a0 * duration);
    if (1 + k >= 0) {
      duration = duration * (1 - Math.sqrt(1 + k));
      stops = true;
    }
  }
  const ramp: FlightSegment = {
    kind: 'ramp',
    startTau: tau,
    duration,
    accel: a0,
    eta0: now.eta,
    remaining0: now.restDistanceRemainingM,
    earth0: now.earthTimeS,
  };
  // Passa pelo alvo durante a rampa?
  const remainingAt = (s: number) => segmentState(ramp, s).remainingM;
  if (remainingAt(duration) <= 0) {
    const sFlyby = bisect(remainingAt, duration);
    return buildProfile(plan, firstTau, [...segments, { ...ramp, duration: sFlyby }], 'flyby', null);
  }
  const after = segmentState(ramp, duration);
  const coast: FlightSegment = {
    kind: 'coast',
    startTau: tau + duration,
    duration: 0,
    accel: 0,
    eta0: stops ? 0 : after.eta,
    remaining0: after.remainingM,
    earth0: after.earthTimeS,
  };
  const { segment, end } = coastToEnd(coast, plan);
  return buildProfile(plan, firstTau, [...segments, ramp, segment], end, null);
}

/**
 * Religa o motor em τ (em inércia): o piloto automático refaz a rota para
 * parar no alvo. Com distância de sobra, acelera com α e faz o flip no ponto
 * certo; sem ela, freia na hora com a aceleração necessária.
 */
export function relightEngine(profile: MissionProfile, tau: number): MissionProfile {
  const plan = planOf(profile);
  const now = computeFlightState(profile, tau);
  if (now.engine !== 'off' || now.phase !== 'coasting') return profile;
  const a = plan.properAccel;
  const eta = now.eta;
  const remaining = now.restDistanceRemainingM;
  const segments = segmentsUntil(profile, tau);
  const firstTau = Math.min(profile.maneuvers?.firstTau ?? tau, tau);
  const start = { eta0: eta, remaining0: remaining, earth0: now.earthTimeS };
  const brakingDistance = (C2 / a) * coshm1(eta);

  if (remaining >= brakingDistance) {
    // Acelerar de η até η_p e frear de η_p a 0 cobre exatamente a distância:
    // (c²/α)[(cosh η_p − cosh η) + (cosh η_p − 1)] = L.
    const etaPeak = acosh1p(((a * remaining) / C2 + coshm1(eta)) / 2);
    const accelTau = (C / a) * Math.max(0, etaPeak - eta);
    const boost: FlightSegment = { kind: 'thrust', startTau: tau, duration: accelTau, accel: a, ...start };
    const atFlip = segmentState(boost, accelTau);
    const flipTau = tau + accelTau;
    const brake: FlightSegment = {
      kind: 'thrust',
      startTau: flipTau,
      duration: (C / a) * atFlip.eta,
      accel: -a,
      eta0: atFlip.eta,
      remaining0: atFlip.remainingM,
      earth0: atFlip.earthTimeS,
      toArrival: true,
    };
    const added = accelTau > 0 ? [boost, brake] : [brake];
    return buildProfile(plan, firstTau, [...segments, ...added], 'arrival', accelTau > 0 ? flipTau : null);
  }

  // Frenagem de emergência: a aceleração que para a nave exatamente no alvo.
  const emergency = (C2 / remaining) * coshm1(eta);
  const brake: FlightSegment = {
    kind: 'thrust',
    startTau: tau,
    duration: (C / emergency) * eta,
    accel: -emergency,
    ...start,
    toArrival: true,
  };
  return buildProfile(plan, firstTau, [...segments, brake], 'arrival', null);
}

/** Rampa de desligamento em tempo de bordo: alguns segundos reais no multiplicador do momento. */
export const engineRampTau = (timeScale: number) => ENGINE_RAMP_REAL_S * timeScale;
