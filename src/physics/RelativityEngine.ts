/**
 * Motor de cinemática relativística (CLAUDE.md §3 e §4).
 *
 * Todo o estado é derivado da rapidez η em `number` IEEE 754 de 64 bits
 * (β = tanh η, γ = cosh η). Nenhuma grandeza é obtida por `1 − β`: perto de c
 * essa subtração perde todos os dígitos, mesmo em 64 bits.
 */

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
  /** O voo depois de o piloto desligar ou religar o motor (ausente: o plano analítico). */
  readonly maneuvers?: Maneuvers;
}

// ── Motor desligado e religado pelo piloto: o voo em segmentos ──────────────
/** Empuxo constante, rampa da aceleração até zero (desligando o motor) ou inércia. */
export type SegmentKind = 'thrust' | 'ramp' | 'coast';

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
  /** Frenagem que termina parada no alvo: a distância sai exata de (c²/|a|)(cosh η − 1). */
  readonly toArrival?: boolean;
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
  /** Aceleração própria no instante (m/s², com sinal). */
  readonly accel: number;
}

/** Estado `s` segundos de bordo depois do início do segmento. */
export function segmentState(seg: FlightSegment, s: number): SegmentState {
  const { eta0, remaining0, earth0 } = seg;
  if (seg.kind === 'coast' || seg.accel === 0) {
    return { eta: eta0, remainingM: remaining0 - C * Math.sinh(eta0) * s, earthTimeS: earth0 + Math.cosh(eta0) * s, accel: 0 };
  }
  if (seg.kind === 'thrust') {
    const a = seg.accel;
    const eta = eta0 + (a * s) / C;
    // cosh η − cosh η₀ e sinh η − sinh η₀ como produtos, sem cancelamento.
    const half = (eta - eta0) / 2;
    const mid = (eta + eta0) / 2;
    const dCosh = 2 * Math.sinh(mid) * Math.sinh(half);
    const dSinh = 2 * Math.cosh(mid) * Math.sinh(half);
    const remainingM = seg.toArrival ? (C2 / Math.abs(a)) * coshm1(eta) : remaining0 - (C2 / a) * dCosh;
    return { eta, remainingM, earthTimeS: earth0 + (C / a) * dSinh, accel: a };
  }
  // Rampa: a(u) = a₀(1 − u/d), então η(u) = η₀ + (a₀/c)(u − u²/2d), integrado numericamente.
  const { accel: a0, duration: d } = seg;
  const etaAt = (u: number) => eta0 + (a0 / C) * (u - (u * u) / (2 * d));
  return {
    eta: etaAt(s),
    remainingM: remaining0 - C * integrate((u) => Math.sinh(etaAt(u)), s),
    earthTimeS: earth0 + integrate((u) => Math.cosh(etaAt(u)), s),
    accel: a0 * (1 - s / d),
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
  /** L_repouso = D_total − x(τ) (m). */
  readonly restDistanceRemainingM: number;
  /** L_contraída = L_repouso / γ, exibida no HUD (m). */
  readonly contractedDistanceRemainingM: number;
  readonly engine: EngineState;
  /** Aceleração própria do motor no instante (m/s²); 0 com o motor desligado. */
  readonly thrustAccel: number;
}

function stateFrom(
  t: number,
  phase: FlightPhase,
  eta: number,
  positionM: number,
  earthTimeS: number,
  restDistanceRemainingM: number,
  engine: EngineState,
  thrustAccel: number,
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
    restDistanceRemainingM,
    contractedDistanceRemainingM: restDistanceRemainingM / k.uGamma,
    engine,
    thrustAccel,
  };
}

/** Estado no voo em segmentos (depois do primeiro comando do piloto). */
function maneuveredState(profile: MissionProfile, m: Maneuvers, t: number): FlightState {
  const { segments } = m;
  let i = segments.length - 1;
  while (i > 0 && segments[i]!.startTau > t) i--;
  const seg = segments[i]!;
  const s = Math.min(Math.max(t - seg.startTau, 0), seg.duration);
  const st = segmentState(seg, s);
  const remainingM = Math.max(0, st.remainingM);
  const ended = t >= profile.tauTotal;
  const phase: FlightPhase = ended
    ? m.end === 'arrival'
      ? 'arrived'
      : m.end === 'flyby'
        ? 'flyby'
        : 'coasting'
    : seg.kind === 'coast'
      ? 'coasting'
      : seg.accel > 0
        ? 'accelerating'
        : 'decelerating';
  const engine: EngineState = ended || seg.kind === 'coast' ? 'off' : seg.kind === 'ramp' ? 'ramp' : 'thrust';
  const eta = ended && m.end === 'arrival' ? 0 : st.eta;
  return stateFrom(
    t,
    phase,
    eta,
    profile.distanceM - remainingM,
    st.earthTimeS,
    ended && m.end === 'arrival' ? 0 : remainingM,
    engine,
    engine === 'off' ? 0 : Math.abs(st.accel),
  );
}

export function computeFlightState(profile: MissionProfile, tau: number): FlightState {
  const m = profile.maneuvers;
  if (m) {
    const t = Math.min(Math.max(tau, 0), profile.tauTotal);
    return t >= m.firstTau ? maneuveredState(profile, m, t) : computeFlightState(m.plan, t);
  }
  const { distanceM, properAccel, burnEndTau, brakeStartTau, tauTotal, tTotal } = profile;
  const t = Math.min(Math.max(tau, 0), tauTotal);
  const cOverA = C / properAccel;
  const c2OverA = C2 / properAccel;

  let eta: number;
  let positionM: number;
  let restDistanceRemainingM: number;
  let earthTimeS: number;

  if (t <= burnEndTau) {
    // Fase 1 — aceleração
    eta = t / cOverA;
    positionM = c2OverA * coshm1(eta);
    restDistanceRemainingM = distanceM - positionM;
    earthTimeS = cOverA * Math.sinh(eta);
  } else if (t < brakeStartTau) {
    // Inércia (só no perfil com cruzeiro): rapidez constante η_c
    eta = profile.etaMax;
    const dt = t - burnEndTau;
    positionM = c2OverA * coshm1(eta) + C * Math.sinh(eta) * dt;
    restDistanceRemainingM = distanceM - positionM;
    earthTimeS = cOverA * Math.sinh(eta) + Math.cosh(eta) * dt;
  } else {
    // Fase 2 — frenagem: tudo em função do tempo próprio restante. A distância
    // restante sai direto da fórmula, não de D − x, para não perder precisão
    // na chegada.
    const tauRem = Math.max(0, tauTotal - t);
    eta = tauRem / cOverA;
    restDistanceRemainingM = c2OverA * coshm1(eta);
    positionM = distanceM - restDistanceRemainingM;
    earthTimeS = tTotal - cOverA * Math.sinh(eta);
  }

  const phase: FlightPhase =
    t <= burnEndTau ? 'accelerating' : t < brakeStartTau ? 'coasting' : t < tauTotal ? 'decelerating' : 'arrived';
  const thrusting = phase === 'accelerating' || phase === 'decelerating';
  return stateFrom(t, phase, eta, positionM, earthTimeS, restDistanceRemainingM, thrusting ? 'thrust' : 'off', thrusting ? properAccel : 0);
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
