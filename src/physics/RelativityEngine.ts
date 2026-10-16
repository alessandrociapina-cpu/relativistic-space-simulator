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

/** `coasting`: motor desligado na fase de inércia do perfil com cruzeiro. */
export type FlightPhase = 'accelerating' | 'coasting' | 'decelerating' | 'arrived';

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
}

export function computeFlightState(profile: MissionProfile, tau: number): FlightState {
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

  const k = computeShaderKinematics(eta);

  return {
    tau: t,
    phase: t <= burnEndTau ? 'accelerating' : t < brakeStartTau ? 'coasting' : t < tauTotal ? 'decelerating' : 'arrived',
    eta,
    beta: k.uBeta,
    gamma: k.uGamma,
    oneMinusBeta: k.uOneMinusBeta,
    positionM,
    earthTimeS,
    restDistanceRemainingM,
    contractedDistanceRemainingM: restDistanceRemainingM / k.uGamma,
  };
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
