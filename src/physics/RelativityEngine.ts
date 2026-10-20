/**
 * Motor de cinemática relativística (CLAUDE.md §3 e §4).
 *
 * Todo o estado é derivado da rapidez η em `number` IEEE 754 de 64 bits
 * (β = tanh η, γ = cosh η). Nenhuma grandeza é obtida por `1 − β`: perto de c
 * essa subtração perde todos os dígitos, mesmo em 64 bits.
 */

import type { ScriptPlan } from './missionScripts';

// ── §4.1 Constantes físicas exatas ───────────────────────────────────────────
/** Velocidade da luz (m/s). */
export const C = 299_792_458;
/** Gravidade padrão (m/s²). */
export const G0 = 9.80665;
/** Ano-luz (m). */
export const LIGHT_YEAR_M = 9.4607304725808e15;
/** Segundo-luz (m). */
export const LIGHT_SECOND_M = C;
/** Temperatura de repouso da CMB (K). */
export const T_CMB_0 = 2.72548;
/** Ano juliano (s): o mesmo ano usado na definição do ano-luz. */
export const JULIAN_YEAR_S = 31_557_600;

const C2 = C * C;

/** acosh(1 + ε) sem o arredondamento de `1 + ε` quando ε é pequeno. */
function acosh1p(eps: number): number {
  return Math.log1p(eps + Math.sqrt(eps * (2 + eps)));
}

/** cosh(η) − 1 = 2·sinh²(η/2), sem cancelamento quando η é pequeno. */
function coshm1(eta: number): number {
  const s = Math.sinh(eta / 2);
  return 2 * s * s;
}

// ── §3.1 Uniforms derivados da rapidez ───────────────────────────────────────
export interface ShaderKinematics {
  /** β = tanh η (vira 1.0 exato em float32 acima de γ ≈ 2896). */
  readonly uBeta: number;
  /** γ = cosh η. */
  readonly uGamma: number;
  /** δ = 1 − β, calculado sem subtração (Regra 2). Sempre > 0 para η finito. */
  readonly uOneMinusBeta: number;
}

export function computeShaderKinematics(eta: number): ShaderKinematics {
  const cosh = Math.cosh(eta);
  return {
    uBeta: Math.tanh(eta),
    uGamma: cosh,
    // Regra 2: 1 − tanh η = e^(−η) / cosh η
    uOneMinusBeta: Math.exp(-eta) / cosh,
  };
}

// ── §4.2 Perfil Flip-and-Burn (com cruzeiro opcional) ────────────────────────
export interface MissionProfile {
  /** Distância total em repouso D_total (m). */
  readonly distanceM: number;
  /** Aceleração própria α (m/s²). */
  readonly properAccel: number;
  /** Meio do caminho d½ = D_total / 2 (m). */
  readonly halfDistanceM: number;
  /** γ e η de pico: os do ponto médio no Flip-and-Burn, os de cruzeiro com inércia. */
  readonly gammaMax: number;
  readonly etaMax: number;
  /** Meio da missão em tempo próprio (s): o perfil é simétrico em torno dele. */
  readonly tauHalf: number;
  /** Tempo próprio total de bordo (s). */
  readonly tauTotal: number;
  /** Tempo da Terra no meio da missão (s). */
  readonly tHalf: number;
  /** Tempo da Terra total (s). */
  readonly tTotal: number;
  /** Fim da aceleração e início da frenagem (s de bordo); os dois valem τ½ no Flip-and-Burn. */
  readonly burnEndTau: number;
  readonly brakeStartTau: number;
  /** Rapidez de cruzeiro da fase de inércia; `null` no Flip-and-Burn puro. */
  readonly coastEta: number | null;
  /** O plano em segmentos, com queimas e descansos da tripulação (§4.2.9); ausente: o plano analítico. */
  readonly segments?: readonly FlightSegment[];
  /** O ciclo de queima e descanso, quando o plano o usa. */
  readonly crewRest?: CrewRestCycle;
  /** O voo depois de o piloto desligar ou religar o motor (ausente: o plano). */
  readonly maneuvers?: Maneuvers;
  /** Roteiro em fases (§4.2.11): onde cada fase e cada marco da história ficam no voo. */
  readonly script?: ScriptPlan;
}

/** Queimas e descansos alternados para a tripulação se recuperar (§4.2.9). */
export interface CrewRestCycle {
  /** Queima mais longa (s de bordo): uma fração da tolerância contínua. */
  readonly burnTau: number;
  /** Descanso entre queimas (s de bordo), por inércia, sem peso. */
  readonly restTau: number;
  /** Tolerância contínua à aceleração do plano (s). */
  readonly enduranceS: number;
  /** Quantas queimas o plano tem (aceleração e frenagem). */
  readonly burns: number;
}

// ── Motor desligado e religado pelo piloto: o voo em segmentos ──────────────
/**
 * Empuxo constante, rampa da aceleração até zero (desligando o motor), inércia ou
 * ciclos de queima e descanso da tripulação (`count` vezes: `burnTau` de empuxo e
 * `restTau` de inércia), calculados em forma fechada.
 */
export type SegmentKind = 'thrust' | 'ramp' | 'coast' | 'cycles';

export interface FlightSegment {
  readonly kind: SegmentKind;
  readonly startTau: number;
  /** Duração em tempo próprio (s). */
  readonly duration: number;
  /** Aceleração própria no início (m/s²): > 0 acelera rumo ao alvo, < 0 freia. Na rampa, cai linearmente até 0. */
  readonly accel: number;
  /** Estado no início: rapidez, distância que falta (m) e tempo da Terra (s). */
  readonly eta0: number;
  readonly remaining0: number;
  readonly earth0: number;
  /** Tempo de rádio da Terra no início (s): quando partiu da Terra a luz que chega agora à nave. */
  readonly radio0: number;
  /**
   * Frenagem que termina parada no alvo: a distância sai exata de (c²/|a|)(cosh η − 1), contada a
   * partir do fim (sem o cancelamento de D − x). Numa frenagem com descansos, cada trecho também.
   */
  readonly toArrival?: boolean;
  /** Com `toArrival`: a distância que ainda falta no fim do segmento (os trechos seguintes da frenagem). */
  readonly tailM?: number;
  /** Inércia para a tripulação se recuperar (na inércia comum, `undefined`). */
  readonly rest?: boolean;
  /** Os ciclos de `kind: 'cycles'`. */
  readonly cycle?: { readonly burnTau: number; readonly restTau: number; readonly count: number };
}

/** Como o voo termina: parado no alvo, passando por ele sem frear ou à deriva (parado ou lento demais). */
export type ManeuverEnd = 'arrival' | 'flyby' | 'drift';

export interface Maneuvers {
  /** O plano original (Flip-and-Burn ou com cruzeiro). */
  readonly plan: MissionProfile;
  /** Primeiro comando do piloto: antes dele, o voo é o do plano. */
  readonly firstTau: number;
  readonly segments: readonly FlightSegment[];
  readonly end: ManeuverEnd;
  /** Início da frenagem depois de um flip do piloto automático; `null` se não há flip depois do comando. */
  readonly flipTau: number | null;
}

/** Instante do flip (início da frenagem depois de acelerar), ou `null` se o voo não tem um. */
export function flipTauOf(profile: MissionProfile): number | null {
  const m = profile.maneuvers;
  if (!m) return profile.brakeStartTau;
  if (m.flipTau !== null) return m.flipTau;
  return m.plan.brakeStartTau <= m.firstTau ? m.plan.brakeStartTau : null;
}

// Gauss–Legendre de 16 pontos em [−1, 1] (nós e pesos por Newton nos polinômios de Legendre).
const GL_N = 16;
const [GL_X, GL_W] = (() => {
  const x: number[] = [];
  const w: number[] = [];
  for (let i = 1; i <= GL_N; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (GL_N + 0.5));
    let dp = 1;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = 0;
      for (let j = 1; j <= GL_N; j++) {
        const p2 = p1;
        p1 = p0;
        p0 = ((2 * j - 1) * z * p1 - (j - 1) * p2) / j;
      }
      dp = (GL_N * (z * p0 - p1)) / (z * z - 1);
      const dz = p0 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * dp * dp));
  }
  return [x, w];
})();

/** ∫₀ˢ f(u) du por Gauss–Legendre. */
function integrate(f: (u: number) => number, s: number): number {
  let sum = 0;
  for (let i = 0; i < GL_N; i++) sum += GL_W[i]! * f(0.5 * s * (GL_X[i]! + 1));
  return 0.5 * s * sum;
}

export interface SegmentState {
  readonly eta: number;
  readonly remainingM: number;
  readonly earthTimeS: number;
  /** Tempo de rádio da Terra: ∫ e^(−η) dτ (s). */
  readonly radioTimeS: number;
  /** Aceleração própria no instante (m/s², com sinal). */
  readonly accel: number;
  /** Num descanso da tripulação. */
  readonly rest: boolean;
}

/** cosh η₁ − cosh η₀ e sinh η₁ − sinh η₀ como produtos, sem cancelamento. */
function hyperbolicDeltas(eta1: number, eta0: number): [dCosh: number, dSinh: number] {
  const half = (eta1 - eta0) / 2;
  const mid = (eta1 + eta0) / 2;
  return [2 * Math.sinh(mid) * Math.sinh(half), 2 * Math.cosh(mid) * Math.sinh(half)];
}

/** Σ sinh(x + jΔ) e Σ cosh(x + jΔ) para j = 1…k, em forma fechada. */
export function hyperbolicSums(x: number, d: number, k: number): [sinhSum: number, coshSum: number] {
  if (k <= 0) return [0, 0];
  const center = x + ((k + 1) * d) / 2;
  const ratio = Math.abs(d) < 1e-300 ? k : Math.sinh((k * d) / 2) / Math.sinh(d / 2);
  return [Math.sinh(center) * ratio, Math.cosh(center) * ratio];
}

/**
 * ∫ e^(−η) dτ numa queima com aceleração `a` de η₀ a η = η₀ + Δη: (c/a)(e^(−η₀) − e^(−η)), escrito como
 * produto (expm1), sem cancelamento quando Δη é pequeno.
 */
const burnRadio = (eta0: number, dEta: number, a: number) => (C / a) * Math.exp(-eta0) * -Math.expm1(-dEta);

/** Σ e^(−(x + jΔ)) para j = 1…k (os descansos de um bloco de ciclos), em forma fechada. */
function expSum(x: number, d: number, k: number): number {
  if (k <= 0) return 0;
  const ratio = Math.abs(d) < 1e-300 ? k : Math.expm1(-k * d) / Math.expm1(-d);
  return Math.exp(-x - d) * ratio;
}

/** Estado `s` segundos de bordo depois do início do segmento. */
export function segmentState(seg: FlightSegment, s: number): SegmentState {
  const { eta0, remaining0, earth0, radio0 } = seg;
  if (seg.kind === 'coast' || seg.accel === 0) {
    return {
      eta: eta0,
      remainingM: seg.toArrival ? (seg.tailM ?? 0) + C * Math.sinh(eta0) * (seg.duration - s) : remaining0 - C * Math.sinh(eta0) * s,
      earthTimeS: earth0 + Math.cosh(eta0) * s,
      radioTimeS: radio0 + Math.exp(-eta0) * s,
      accel: 0,
      rest: seg.rest === true,
    };
  }
  if (seg.kind === 'thrust') {
    const a = seg.accel;
    const eta = eta0 + (a * s) / C;
    const [dCosh, dSinh] = hyperbolicDeltas(eta, eta0);
    const remainingM = !seg.toArrival
      ? remaining0 - (C2 / a) * dCosh
      : seg.tailM === undefined
        ? (C2 / Math.abs(a)) * coshm1(eta)
        : seg.tailM + (C2 / Math.abs(a)) * hyperbolicDeltas(eta, eta0 + (a * seg.duration) / C)[0];
    return { eta, remainingM, earthTimeS: earth0 + (C / a) * dSinh, radioTimeS: radio0 + burnRadio(eta0, eta - eta0, a), accel: a, rest: false };
  }
  if (seg.kind === 'cycles') {
    // k ciclos completos: as queimas somam (c²/a)(cosh η_k − cosh η₀) de distância; os descansos, que
    // acontecem nas rapidezes η₀ + jΔη (j = 1…k), r·c·Σ sinh(η₀ + jΔη).
    const { burnTau: b, restTau: r, count } = seg.cycle!;
    const a = seg.accel;
    const k = Math.min(Math.floor(s / (b + r)), count);
    const local = s - k * (b + r);
    const dEta = (a * b) / C;
    const etaK = eta0 + k * dEta;
    const [burnCosh, burnSinh] = hyperbolicDeltas(etaK, eta0);
    const [restSinh, restCosh] = hyperbolicSums(eta0, dEta, k);
    const remainingK = remaining0 - (C2 / a) * burnCosh - r * C * restSinh;
    const earthK = earth0 + (C / a) * burnSinh + r * restCosh;
    // Rádio: as queimas somam (c/a)(e^(−η₀) − e^(−η_k)) e os descansos r·Σ e^(−(η₀ + jΔη)), só termos positivos.
    const radioK = radio0 + burnRadio(eta0, k * dEta, a) + r * expSum(eta0, dEta, k);
    const eta = k === count ? etaK : etaK + (a * Math.min(local, b)) / C;
    const resting = k === count ? 0 : Math.max(0, local - b);
    // Na frenagem até o alvo, a distância sai do que falta percorrer (só termos positivos):
    // as queimas até o fim do bloco, os descansos à frente e o resto do descanso em curso.
    const ahead = (): number => {
      const etaEnd = eta0 + count * dEta;
      const burns = (C2 / Math.abs(a)) * hyperbolicDeltas(eta, etaEnd)[0];
      if (k === count) return burns;
      const inRest = local >= b;
      const restsAhead = hyperbolicSums(eta0 + (inRest ? k + 1 : k) * dEta, dEta, count - k - (inRest ? 1 : 0))[0];
      return burns + r * C * restsAhead + (inRest ? C * Math.sinh(eta) * (r - resting) : 0);
    };
    if (k === count) {
      return {
        eta: etaK,
        remainingM: seg.toArrival ? (seg.tailM ?? 0) + ahead() : remainingK,
        earthTimeS: earthK,
        radioTimeS: radioK,
        accel: 0,
        rest: true,
      };
    }
    const [dCosh, dSinh] = hyperbolicDeltas(eta, etaK);
    return {
      eta,
      remainingM: seg.toArrival ? (seg.tailM ?? 0) + ahead() : remainingK - (C2 / a) * dCosh - C * Math.sinh(eta) * resting,
      earthTimeS: earthK + (C / a) * dSinh + Math.cosh(eta) * resting,
      radioTimeS: radioK + burnRadio(etaK, eta - etaK, a) + Math.exp(-eta) * resting,
      accel: local < b ? a : 0,
      rest: local >= b,
    };
  }
  // Rampa: a(u) = a₀(1 − u/d), então η(u) = η₀ + (a₀/c)(u − u²/2d), integrado numericamente.
  const { accel: a0, duration: d } = seg;
  const etaAt = (u: number) => eta0 + (a0 / C) * (u - (u * u) / (2 * d));
  return {
    eta: etaAt(s),
    remainingM: remaining0 - C * integrate((u) => Math.sinh(etaAt(u)), s),
    earthTimeS: earth0 + integrate((u) => Math.cosh(etaAt(u)), s),
    radioTimeS: radio0 + integrate((u) => Math.exp(-etaAt(u)), s),
    accel: a0 * (1 - s / d),
    rest: false,
  };
}

/**
 * Perfil da missão. Sem `coastEta`, é o Flip-and-Burn da §4.2: acelera até o
 * meio do caminho e freia. Com `coastEta` menor que a rapidez do ponto médio,
 * desliga o motor ao atingi-la, segue por inércia e freia no trecho final
 * (acelerar, cruzar e frear). Acima dela, o cruzeiro nunca é atingido.
 */
export function computeMissionProfile(
  distanceM: number,
  properAccel: number,
  coastEta: number | null = null,
): MissionProfile {
  if (!(distanceM > 0 && Number.isFinite(distanceM))) {
    throw new RangeError(`Distância inválida: ${distanceM}`);
  }
  if (!(properAccel > 0 && Number.isFinite(properAccel))) {
    throw new RangeError(`Aceleração própria inválida: ${properAccel}`);
  }
  if (coastEta !== null && !(coastEta > 0)) {
    throw new RangeError(`Rapidez de cruzeiro inválida: ${coastEta}`);
  }

  const cOverA = C / properAccel;
  const halfDistanceM = distanceM / 2;
  // γ_max − 1, mantido separado para preservar precisão em missões curtas
  const gammaMaxMinus1 = (properAccel * halfDistanceM) / C2;
  const flipEta = acosh1p(gammaMaxMinus1);

  if (coastEta === null || coastEta >= flipEta) {
    const tauHalf = cOverA * flipEta;
    const tHalf = cOverA * Math.sinh(flipEta);
    return {
      distanceM,
      properAccel,
      halfDistanceM,
      gammaMax: 1 + gammaMaxMinus1,
      etaMax: flipEta,
      tauHalf,
      tauTotal: 2 * tauHalf,
      tHalf,
      tTotal: 2 * tHalf,
      burnEndTau: tauHalf,
      brakeStartTau: tauHalf,
      coastEta: null,
    };
  }

  // Inércia a β_c = tanh η_c: dx/dτ = c·sinh η_c e dt/dτ = cosh η_c.
  const burnTau = cOverA * coastEta;
  const burnTime = cOverA * Math.sinh(coastEta);
  const coastDistance = distanceM - 2 * (C2 / properAccel) * coshm1(coastEta);
  const coastTau = coastDistance / (C * Math.sinh(coastEta));
  const tauTotal = 2 * burnTau + coastTau;
  const tTotal = 2 * burnTime + coastTau * Math.cosh(coastEta);
  return {
    distanceM,
    properAccel,
    halfDistanceM,
    gammaMax: 1 + coshm1(coastEta),
    etaMax: coastEta,
    tauHalf: tauTotal / 2,
    tauTotal,
    tHalf: tTotal / 2,
    tTotal,
    burnEndTau: burnTau,
    brakeStartTau: burnTau + coastTau,
    coastEta,
  };
}

/**
 * Razão de massa m₀/m₁ do foguete relativístico ideal que ganha e depois perde
 * a rapidez de pico: Δη = (v_e/c)·ln(m₀/m₁), com Δη = 2·η_max. O foguete de
 * fótons (v_e = c) é o limite teórico.
 */
export function rocketMassRatio(profile: MissionProfile, exhaustBeta = 1): number {
  return Math.exp((2 * profile.etaMax) / exhaustBeta);
}

/** `coasting`: motor desligado (inércia). `flyby`: o voo terminou passando pelo alvo sem frear. */
export type FlightPhase = 'accelerating' | 'coasting' | 'decelerating' | 'arrived' | 'flyby';

/** `ramp`: o piloto desligou o motor e a aceleração está caindo até zero. */
export type EngineState = 'thrust' | 'ramp' | 'off';

export interface FlightState {
  /** Tempo próprio de bordo τ (s), limitado a [0, τ_total]. */
  readonly tau: number;
  readonly phase: FlightPhase;
  readonly eta: number;
  readonly beta: number;
  readonly gamma: number;
  /** 1 − β sem subtração (ver `computeShaderKinematics`). */
  readonly oneMinusBeta: number;
  /** Posição x(τ) no referencial de repouso Terra–alvo (m). */
  readonly positionM: number;
  /** Tempo da Terra t(τ) (s). */
  readonly earthTimeS: number;
  /**
   * Tempo de rádio da Terra (s): o instante, no relógio da Terra, em que partiu a luz (ou o sinal de
   * rádio) que chega agora à nave, t − x/c = ∫ e^(−η) dτ. A integral soma só termos positivos e é exata
   * em 64 bits em qualquer regime (t − x/c perderia todos os dígitos perto de c).
   */
  readonly earthRadioTimeS: number;
  /** L_repouso = D_total − x(τ) (m). */
  readonly restDistanceRemainingM: number;
  /** L_contraída = L_repouso / γ, exibida no HUD (m). */
  readonly contractedDistanceRemainingM: number;
  readonly engine: EngineState;
  /** Aceleração própria do motor no instante (m/s²); 0 com o motor desligado. */
  readonly thrustAccel: number;
  /** Na inércia de um descanso da tripulação (§4.2.9). */
  readonly crewRest: boolean;
}

function stateFrom(
  t: number,
  phase: FlightPhase,
  eta: number,
  positionM: number,
  earthTimeS: number,
  earthRadioTimeS: number,
  restDistanceRemainingM: number,
  engine: EngineState,
  thrustAccel: number,
  crewRest = false,
): FlightState {
  const k = computeShaderKinematics(eta);
  return {
    tau: t,
    phase,
    eta,
    beta: k.uBeta,
    gamma: k.uGamma,
    oneMinusBeta: k.uOneMinusBeta,
    positionM,
    earthTimeS,
    earthRadioTimeS,
    restDistanceRemainingM,
    contractedDistanceRemainingM: restDistanceRemainingM / k.uGamma,
    engine,
    thrustAccel,
    crewRest,
  };
}

/**
 * Na metade de subida do voo: acelerando, ou num descanso da tripulação antes do fim da subida
 * (§4.2.9). Os descansos são inércia, mas o céu, os hologramas e o olho seguem a subida.
 */
export const isAscending = (profile: MissionProfile, flight: FlightState) =>
  flight.phase === 'accelerating' || (flight.crewRest && flight.tau <= profile.burnEndTau);

/** Na metade de frenagem: freando, ou num descanso da tripulação depois do início da frenagem. */
export const isDescending = (profile: MissionProfile, flight: FlightState) =>
  flight.phase === 'decelerating' || (flight.crewRest && flight.tau >= profile.brakeStartTau);

/** Os segmentos do plano: os do plano com descansos, ou acelerar, cruzar (se houver) e frear até o alvo. */
export function planSegments(plan: MissionProfile): FlightSegment[] {
  if (plan.segments) return [...plan.segments];
  const at = (kind: SegmentKind, startTau: number, duration: number, accel: number, extra: Partial<FlightSegment> = {}): FlightSegment => {
    const s = computeFlightState(plan, startTau);
    return {
      kind,
      startTau,
      duration,
      accel,
      eta0: s.eta,
      remaining0: s.restDistanceRemainingM,
      earth0: s.earthTimeS,
      radio0: s.earthRadioTimeS,
      ...extra,
    };
  };
  const a = plan.properAccel;
  const segments = [at('thrust', 0, plan.burnEndTau, a)];
  if (plan.brakeStartTau > plan.burnEndTau) segments.push(at('coast', plan.burnEndTau, plan.brakeStartTau - plan.burnEndTau, 0));
  segments.push(at('thrust', plan.brakeStartTau, plan.tauTotal - plan.brakeStartTau, -a, { toArrival: true }));
  return segments;
}

/** Os segmentos do voo efetivo, do início ao fim (com os comandos do piloto, se houver). */
export const flightSegments = (profile: MissionProfile): FlightSegment[] =>
  profile.maneuvers ? [...profile.maneuvers.segments] : planSegments(profile);

/** O segmento em curso no instante τ (o último que começou até lá). */
export function segmentAt(segments: readonly FlightSegment[], tau: number): FlightSegment {
  let i = segments.length - 1;
  while (i > 0 && segments[i]!.startTau > tau) i--;
  return segments[i]!;
}

/**
 * Primeiro instante em que o voo chegou à rapidez η acelerando (numa queima, ou no
 * meio dos ciclos de queima e descanso), antes de `beforeTau`; `null` se não chegou.
 */
export function ascentTauAt(profile: MissionProfile, eta: number, beforeTau: number): number | null {
  for (const seg of flightSegments(profile)) {
    if (seg.startTau >= beforeTau) break;
    if (seg.accel <= 0 || seg.kind === 'coast' || eta < seg.eta0) continue;
    const cOverA = C / seg.accel;
    let tau: number | null = null;
    if (seg.kind === 'thrust') {
      if (eta <= seg.eta0 + seg.duration / cOverA) tau = seg.startTau + cOverA * (eta - seg.eta0);
    } else if (seg.kind === 'cycles') {
      const { burnTau: b, restTau: r, count } = seg.cycle!;
      const dEta = b / cOverA;
      const j = Math.min(Math.floor((eta - seg.eta0) / dEta), count - 1);
      if (eta <= seg.eta0 + count * dEta) tau = seg.startTau + j * (b + r) + cOverA * (eta - seg.eta0 - j * dEta);
    } else {
      // Rampa: η(u) = η₀ + (a₀/c)(u − u²/2d), crescente até o fim.
      const k = (eta - seg.eta0) * cOverA;
      const d = seg.duration;
      if (k <= d / 2) tau = seg.startTau + d * (1 - Math.sqrt(1 - (2 * k) / d));
    }
    // Um bloco cortado por um comando do piloto termina antes do fim dos ciclos.
    if (tau !== null && tau <= seg.startTau + seg.duration) return tau < beforeTau ? tau : null;
  }
  return null;
}

/** Estado num voo em segmentos: o plano com descansos ou o voo depois de um comando do piloto. */
function segmentedState(profile: MissionProfile, segments: readonly FlightSegment[], end: ManeuverEnd, t: number): FlightState {
  const seg = segmentAt(segments, t);
  const s = Math.min(Math.max(t - seg.startTau, 0), seg.duration);
  const st = segmentState(seg, s);
  const remainingM = Math.max(0, st.remainingM);
  const ended = t >= profile.tauTotal;
  const off = seg.kind === 'coast' || (seg.kind === 'cycles' && st.accel === 0);
  const phase: FlightPhase = ended
    ? end === 'arrival'
      ? 'arrived'
      : end === 'flyby'
        ? 'flyby'
        : 'coasting'
    : off
      ? 'coasting'
      : seg.accel > 0
        ? 'accelerating'
        : 'decelerating';
  const engine: EngineState = ended || off ? 'off' : seg.kind === 'ramp' ? 'ramp' : 'thrust';
  const eta = ended && end === 'arrival' ? 0 : st.eta;
  return stateFrom(
    t,
    phase,
    eta,
    profile.distanceM - remainingM,
    st.earthTimeS,
    st.radioTimeS,
    ended && end === 'arrival' ? 0 : remainingM,
    engine,
    engine === 'off' ? 0 : Math.abs(st.accel),
    !ended && st.rest,
  );
}

export function computeFlightState(profile: MissionProfile, tau: number): FlightState {
  const m = profile.maneuvers;
  if (m) {
    const t = Math.min(Math.max(tau, 0), profile.tauTotal);
    return t >= m.firstTau ? segmentedState(profile, m.segments, m.end, t) : computeFlightState(m.plan, t);
  }
  if (profile.segments) return segmentedState(profile, profile.segments, 'arrival', Math.min(Math.max(tau, 0), profile.tauTotal));
  const { distanceM, properAccel, burnEndTau, brakeStartTau, tauTotal, tTotal } = profile;
  const t = Math.min(Math.max(tau, 0), tauTotal);
  const cOverA = C / properAccel;
  const c2OverA = C2 / properAccel;

  let eta: number;
  let positionM: number;
  let restDistanceRemainingM: number;
  let earthTimeS: number;
  // Rádio da Terra: ∫ e^(−η) dτ, (c/α)(1 − e^(−η)) em cada queima e e^(−η_c)·Δτ na inércia.
  const burnRadioTo = (eta: number) => -cOverA * Math.expm1(-eta);
  let earthRadioTimeS: number;

  if (t <= burnEndTau) {
    // Fase 1 — aceleração
    eta = t / cOverA;
    positionM = c2OverA * coshm1(eta);
    restDistanceRemainingM = distanceM - positionM;
    earthTimeS = cOverA * Math.sinh(eta);
    earthRadioTimeS = burnRadioTo(eta);
  } else if (t < brakeStartTau) {
    // Inércia (só no perfil com cruzeiro): rapidez constante η_c
    eta = profile.etaMax;
    const dt = t - burnEndTau;
    positionM = c2OverA * coshm1(eta) + C * Math.sinh(eta) * dt;
    restDistanceRemainingM = distanceM - positionM;
    earthTimeS = cOverA * Math.sinh(eta) + Math.cosh(eta) * dt;
    earthRadioTimeS = burnRadioTo(eta) + Math.exp(-eta) * dt;
  } else {
    // Fase 2 — frenagem: tudo em função do tempo próprio restante. A distância
    // restante sai direto da fórmula, não de D − x, para não perder precisão
    // na chegada.
    const tauRem = Math.max(0, tauTotal - t);
    eta = tauRem / cOverA;
    restDistanceRemainingM = c2OverA * coshm1(eta);
    positionM = distanceM - restDistanceRemainingM;
    earthTimeS = tTotal - cOverA * Math.sinh(eta);
    // O total (subida, cruzeiro e frenagem) menos o que falta da frenagem: t_total − D/c na chegada.
    const etaPeak = burnEndTau / cOverA;
    const radioTotal = 2 * burnRadioTo(etaPeak) + Math.exp(-etaPeak) * (brakeStartTau - burnEndTau);
    earthRadioTimeS = radioTotal - burnRadioTo(eta);
  }

  const phase: FlightPhase =
    t <= burnEndTau ? 'accelerating' : t < brakeStartTau ? 'coasting' : t < tauTotal ? 'decelerating' : 'arrived';
  const thrusting = phase === 'accelerating' || phase === 'decelerating';
  return stateFrom(
    t,
    phase,
    eta,
    positionM,
    earthTimeS,
    earthRadioTimeS,
    restDistanceRemainingM,
    thrusting ? 'thrust' : 'off',
    thrusting ? properAccel : 0,
  );
}

/** η a partir de log₁₀γ, sem perder precisão perto de γ = 1 (slider logarítmico). */
export function rapidityFromLog10Gamma(log10Gamma: number): number {
  return acosh1p(Math.expm1(log10Gamma * Math.LN10));
}

/** log₁₀γ a partir de η: inversa de `rapidityFromLog10Gamma`. */
export function log10GammaFromRapidity(eta: number): number {
  return Math.log1p(coshm1(eta)) / Math.LN10;
}

/**
 * §4.2.5 — Tempo próprio que a nave levaria do ponto médio até o alvo se, em
 * vez de frear, continuasse acelerando: (c/α)·[acosh(1 + αD/c²) − η_max].
 * Para γ_max ≫ 1 tende a (c/α)·ln 2. Só faz sentido no Flip-and-Burn puro.
 */
export function computeNoBrakeProperTime(profile: MissionProfile): number {
  const etaFull = acosh1p((profile.properAccel * profile.distanceM) / C2);
  return (C / profile.properAccel) * (etaFull - profile.etaMax);
}
