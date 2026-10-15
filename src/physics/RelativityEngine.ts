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

// ── §4.2 Perfil Flip-and-Burn ────────────────────────────────────────────────
export interface MissionProfile {
  /** Distância total em repouso D_total (m). */
  readonly distanceM: number;
  /** Aceleração própria α (m/s²). */
  readonly properAccel: number;
  /** Ponto de inversão d½ = D_total / 2 (m). */
  readonly halfDistanceM: number;
  readonly gammaMax: number;
  readonly etaMax: number;
  /** Tempo próprio até o flip (s). */
  readonly tauHalf: number;
  /** Tempo próprio total de bordo (s). */
  readonly tauTotal: number;
  /** Tempo da Terra até o flip (s). */
  readonly tHalf: number;
  /** Tempo da Terra total (s). */
  readonly tTotal: number;
}

export function computeMissionProfile(distanceM: number, properAccel: number): MissionProfile {
  if (!(distanceM > 0 && Number.isFinite(distanceM))) {
    throw new RangeError(`Distância inválida: ${distanceM}`);
  }
  if (!(properAccel > 0 && Number.isFinite(properAccel))) {
    throw new RangeError(`Aceleração própria inválida: ${properAccel}`);
  }

  const halfDistanceM = distanceM / 2;
  // γ_max − 1, mantido separado para preservar precisão em missões curtas
  const gammaMaxMinus1 = (properAccel * halfDistanceM) / C2;
  const etaMax = acosh1p(gammaMaxMinus1);
  const tauHalf = (C / properAccel) * etaMax;
  const tHalf = (C / properAccel) * Math.sinh(etaMax);

  return {
    distanceM,
    properAccel,
    halfDistanceM,
    gammaMax: 1 + gammaMaxMinus1,
    etaMax,
    tauHalf,
    tauTotal: 2 * tauHalf,
    tHalf,
    tTotal: 2 * tHalf,
  };
}

export type FlightPhase = 'accelerating' | 'decelerating' | 'arrived';

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
  const { distanceM, properAccel, tauHalf, tauTotal, tTotal } = profile;
  const t = Math.min(Math.max(tau, 0), tauTotal);
  const cOverA = C / properAccel;
  const c2OverA = C2 / properAccel;

  let eta: number;
  let positionM: number;
  let restDistanceRemainingM: number;
  let earthTimeS: number;

  if (t <= tauHalf) {
    // Fase 1 — aceleração
    eta = t / cOverA;
    positionM = c2OverA * coshm1(eta);
    restDistanceRemainingM = distanceM - positionM;
    earthTimeS = cOverA * Math.sinh(eta);
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
    phase: t <= tauHalf ? 'accelerating' : t < tauTotal ? 'decelerating' : 'arrived',
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

/**
 * §4.2.5 — Tempo próprio que a nave levaria do ponto médio até o alvo se, em
 * vez de frear, continuasse acelerando: (c/α)·[acosh(1 + αD/c²) − η_max].
 * Para γ_max ≫ 1 tende a (c/α)·ln 2.
 */
export function computeNoBrakeProperTime(profile: MissionProfile): number {
  const etaFull = acosh1p((profile.properAccel * profile.distanceM) / C2);
  return (C / profile.properAccel) * (etaFull - profile.etaMax);
}
