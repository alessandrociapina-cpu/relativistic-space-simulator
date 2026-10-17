/**
 * O piloto desliga e religa o motor (CLAUDE.md §4.2.8). O voo deixa de ser o
 * plano analítico e vira uma sequência de segmentos (empuxo, rampa, inércia),
 * deterministica em τ: a linha do tempo e o scrub continuam valendo.
 *
 * - Desligar: a aceleração cai linearmente até zero (rampa), a nave segue por
 *   inércia e o piloto automático religa o motor no ponto certo para frear com
 *   a aceleração do plano e parar no alvo (sem distância para isso, freia logo
 *   depois da rampa com a aceleração necessária). Parada antes, fica à deriva.
 * - Religar (na inércia): o piloto automático acelera de novo com a aceleração
 *   do plano e faz o flip no ponto certo, chegando mais cedo; sem distância
 *   para isso, freia na hora com a aceleração que for preciso (emergência).
 * - Com descansos da tripulação no plano (§4.2.9), a frenagem e a nova subida
 *   também alternam queimas e descansos, e o motor não aceita comandos num
 *   descanso (a tripulação se recupera; o piloto automático religa o motor).
 */
import {
  brakeSegments,
  brakeWithRests,
  burnEndAt,
  brakingDistance as restBrakingDistance,
  crewStrainAt,
  restPlanTolerance,
  restRoute,
  type RestCycle,
  type SegmentStart,
} from './crewRest';
import {
  C,
  computeFlightState,
  planSegments,
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
 * À deriva: se a inércia até a frenagem demora mais que tantas vezes a viagem
 * planejada (no relógio mais longo, o da Terra), a linha do tempo termina aí.
 */
const DRIFT_LIMIT_FACTOR = 100;

const planOf = (profile: MissionProfile) => profile.maneuvers?.plan ?? profile;

export { planSegments };

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
  brakeTau: number | null = flipTau,
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
  // A subida (queimas e descansos) termina no primeiro trecho que não acelera.
  const firstOff = segments.find((seg) => !((seg.kind === 'thrust' || seg.kind === 'cycles') && seg.accel > 0));
  const coast = segments.find((seg) => seg.kind === 'coast' && !seg.rest);
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
    brakeStartTau: end === 'arrival' && brakeTau !== null ? brakeTau : tauTotal,
    coastEta: coast ? coast.eta0 : null,
    ...(plan.crewRest && { crewRest: plan.crewRest }),
    maneuvers: { plan, firstTau, segments, end, flipTau },
  };
}

/** Frenagem até parar no alvo, com a aceleração `a` (> 0) que para a nave exatamente nele. */
const brakeToArrival = (start: SegmentStart, a: number): FlightSegment => ({
  kind: 'thrust',
  ...start,
  duration: (C / a) * start.eta0,
  accel: -a,
  toArrival: true,
});

/** Frenagem de emergência: a aceleração contínua que para a nave exatamente no alvo. */
const emergencyBrake = (start: SegmentStart) => brakeToArrival(start, (C2 / start.remaining0) * coshm1(start.eta0));

/** Início da primeira queima de uma frenagem (depois da inércia que a antecede, se houver). */
const firstBurnTau = (segments: readonly FlightSegment[]) => segments.find((seg) => seg.kind !== 'coast')!.startTau;

/** Frenagem a partir de `start` até parar no alvo com `a`: contínua, ou com descansos se houver ciclo. */
const brakeFrom = (start: SegmentStart, a: number, cycle: RestCycle | null): FlightSegment[] =>
  cycle ? brakeSegments(start, a, cycle) : [brakeToArrival(start, a)];

/**
 * Depois de desligar o motor: inércia até a distância que falta ser a de frear com
 * a aceleração do plano, L = (c²/α)(cosh η − 1) (com descansos, mais a distância
 * percorrida neles), e o piloto automático religa o motor ali (o flip). Sem essa
 * distância, freia já com a aceleração necessária, aₑ = (c²/L)(cosh η − 1) (com
 * descansos, com α e descansos mais curtos). Parada ou lenta demais para chegar
 * num tempo razoável, a nave fica à deriva.
 */
function coastThenBrake(
  start: SegmentStart,
  plan: MissionProfile,
): { segments: FlightSegment[]; end: ManeuverEnd; flipTau: number | null; brakeTau: number | null } {
  const a = plan.properAccel;
  const cycle = plan.crewRest ?? null;
  const { eta0: eta, remaining0: remaining } = start;
  const brakingDistance = cycle ? restBrakingDistance(eta, a, cycle) : (C2 / a) * coshm1(eta);
  if (remaining < brakingDistance) {
    const segments = (cycle && brakeWithRests(start, cycle, a)) || [emergencyBrake(start)];
    return { segments, end: 'arrival', flipTau: null, brakeTau: firstBurnTau(segments) };
  }
  const planSpan = Math.max(plan.tauTotal, plan.tTotal);
  const speed = C * Math.sinh(eta);
  const coastTau = speed > 0 ? (remaining - brakingDistance) / speed : Infinity;
  if (!(coastTau <= DRIFT_LIMIT_FACTOR * planSpan)) {
    // A linha do tempo segue mais um trecho e termina.
    const drift = speed > 0 ? DRIFT_LIMIT_FACTOR * planSpan : planSpan;
    return { segments: [{ kind: 'coast', ...start, duration: drift, accel: 0 }], end: 'drift', flipTau: null, brakeTau: null };
  }
  if (coastTau === 0) return { segments: brakeFrom(start, a, cycle), end: 'arrival', flipTau: start.startTau, brakeTau: start.startTau };
  const coast: FlightSegment = { kind: 'coast', ...start, duration: coastTau, accel: 0 };
  const atFlip = segmentState(coast, coastTau);
  const flipTau = start.startTau + coastTau;
  const atFlipStart = { startTau: flipTau, eta0: eta, remaining0: atFlip.remainingM, earth0: atFlip.earthTimeS, radio0: atFlip.radioTimeS };
  const brake = brakeFrom(atFlipStart, a, cycle);
  return { segments: [coast, ...brake], end: 'arrival', flipTau, brakeTau: flipTau };
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

/** O motor pode ser desligado (empuxo) ou religado (inércia, antes do fim do voo e fora dos descansos)? */
export function engineCommandAt(profile: MissionProfile, tau: number): 'cut' | 'relight' | null {
  if (!(tau > 0 && tau < profile.tauTotal)) return null;
  const s = computeFlightState(profile, tau);
  if (s.engine === 'thrust') return 'cut';
  if (s.engine === 'off' && s.phase === 'coasting' && !s.crewRest) return 'relight';
  return null;
}

/**
 * Desliga o motor em τ: a aceleração cai linearmente até zero em `rampTau`
 * segundos de bordo, a nave segue por inércia e o piloto automático religa o
 * motor para frear e parar no alvo.
 */
export function cutEngine(profile: MissionProfile, tau: number, rampTau: number): MissionProfile {
  const plan = planOf(profile);
  const now = computeFlightState(profile, tau);
  if (now.engine !== 'thrust') return profile;
  const a0 = now.phase === 'decelerating' ? -now.thrustAccel : now.thrustAccel;
  const segments = segmentsUntil(profile, tau);
  const firstTau = Math.min(profile.maneuvers?.firstTau ?? tau, tau);
  let duration = Math.min(Math.max(rampTau, 1e-6), plan.tauTotal * MAX_RAMP_FRACTION);
  // Com descansos, a rampa não estica a queima em curso além do fim planejado (a tripulação está no limite).
  if (plan.crewRest) duration = Math.min(duration, Math.max(burnEndAt(profile, tau) - tau, 1e-6));

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
    radio0: now.earthRadioTimeS,
  };
  // Passa pelo alvo durante a rampa?
  const remainingAt = (s: number) => segmentState(ramp, s).remainingM;
  if (remainingAt(duration) <= 0) {
    const sFlyby = bisect(remainingAt, duration);
    return buildProfile(plan, firstTau, [...segments, { ...ramp, duration: sFlyby }], 'flyby', null);
  }
  const after = segmentState(ramp, duration);
  const rest = coastThenBrake(
    {
      startTau: tau + duration,
      eta0: stops ? 0 : after.eta,
      remaining0: after.remainingM,
      earth0: after.earthTimeS,
      radio0: after.radioTimeS,
    },
    plan,
  );
  return buildProfile(plan, firstTau, [...segments, ramp, ...rest.segments], rest.end, rest.flipTau, rest.brakeTau);
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
  const start = { eta0: eta, remaining0: remaining, earth0: now.earthTimeS, radio0: now.earthRadioTimeS };
  if (plan.crewRest) {
    const strain = crewStrainAt(profile, tau, restPlanTolerance({ ...plan, crewRest: plan.crewRest }));
    return relightWithRests(plan, firstTau, segments, { startTau: tau, ...start }, plan.crewRest, strain);
  }
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
      radio0: atFlip.radioTimeS,
      toArrival: true,
    };
    const added = accelTau > 0 ? [boost, brake] : [brake];
    return buildProfile(plan, firstTau, [...segments, ...added], 'arrival', accelTau > 0 ? flipTau : null, flipTau);
  }
  return buildProfile(plan, firstTau, [...segments, emergencyBrake({ startTau: tau, ...start })], 'arrival', null, tau);
}

/**
 * Religar com descansos da tripulação: se a tripulação ainda não se recuperou da última
 * queima (carga `strain`), o piloto automático espera o descanso terminar; depois, a nova
 * subida em queimas e descansos, um descanso no topo e a frenagem ao contrário. Sem
 * distância para isso, freia já com α e os descansos ajustados para parar no alvo (sem
 * distância nem para frear com α, frenagem de emergência contínua).
 */
function relightWithRests(
  plan: MissionProfile,
  firstTau: number,
  segments: FlightSegment[],
  start: SegmentStart,
  cycle: RestCycle,
  strain: number,
): MissionProfile {
  const a = plan.properAccel;
  const added: FlightSegment[] = [];
  let from = start;
  if (strain > 0 && start.eta0 > 0) {
    const wait: FlightSegment = { kind: 'coast', ...start, duration: strain * cycle.restTau, accel: 0, rest: true };
    const after = segmentState(wait, wait.duration);
    if (after.remainingM > 0) {
      added.push(wait);
      from = {
        startTau: start.startTau + wait.duration,
        eta0: start.eta0,
        remaining0: after.remainingM,
        earth0: after.earthTimeS,
        radio0: after.radioTimeS,
      };
    }
  }
  const route = restRoute(from, a, cycle);
  if (route) return buildProfile(plan, firstTau, [...segments, ...added, ...route.segments], 'arrival', route.flipTau);
  if (!(from.eta0 > 0)) return buildProfile(plan, firstTau, [...segments, emergencyBrake(start)], 'arrival', null, start.startTau);
  const brake = brakeWithRests(from, cycle, a) ?? [emergencyBrake(from)];
  return buildProfile(plan, firstTau, [...segments, ...added, ...brake], 'arrival', null, firstBurnTau(brake));
}

/** Rampa de desligamento em tempo de bordo: alguns segundos reais no multiplicador do momento. */
export const engineRampTau = (timeScale: number) => ENGINE_RAMP_REAL_S * timeScale;
