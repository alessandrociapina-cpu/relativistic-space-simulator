/**
 * Qual holograma o projetor central mostra em cada fase do voo. Segue a
 * cronologia do vídeo de referência, mas por critérios físicos (UA, γ, T da
 * CMB), então vale para qualquer destino e aceleração.
 */
import type { FlightState, MissionProfile } from '../physics/RelativityEngine';
import type { CrewKind } from '../physics/accelerationPresets';
import { missionScaledS } from '../physics/criticalEvents';

export type HologramMode =
  | 'solar-system'
  | 'cmb-spectrum'
  | 'lux-curve'
  | 'countdown-flip'
  | 'eye-adaptation'
  | 'target-blueshift'
  | 'countdown-arrival'
  | 'none';

/** Duração das contagens holográficas antes do flip e da chegada na demonstração (s de bordo). */
export const HOLOGRAM_COUNTDOWN_S = 10;

/** Contagem holográfica na escala da missão: 10 s na demonstração, 1/60 da viagem nas longas. */
export const hologramCountdownS = (profile: MissionProfile) => missionScaledS(profile, HOLOGRAM_COUNTDOWN_S);

/** Fator "mais escuro" a partir do qual o holograma do olho tem o que mostrar. */
const EYE_HOLOGRAM_MIN_DIMMER = 2;

/** "Seus olhos depois do clarão": temperatura da CMB à frente, na frenagem, em que a luz é a do white-out. */
export const EYE_HOLOGRAM_CMB_K = { min: 5000, max: 60_000 } as const;

/** Blueshift do alvo: faixa de γ na frenagem. */
export const BLUESHIFT_HOLOGRAM_GAMMA = { min: 8, max: 220 } as const;

export interface HologramContext {
  /** O holograma dos olhos só existe com um piloto humano a bordo. */
  readonly crew: CrewKind;
  readonly flight: FlightState;
  readonly profile: MissionProfile;
  readonly sunDistanceAu: number;
  readonly cmbTempK: number;
  readonly cmbPeakNm: number;
  /** Quantas vezes a luz da ida parece mais fraca agora (sem valor, conta como relevante). */
  readonly eyeDimmer?: number;
}

const inRange = (x: number, min: number, max: number) => x >= min && x <= max;

export function selectHologramMode({
  crew,
  flight,
  profile,
  sunDistanceAu,
  cmbTempK,
  cmbPeakNm,
  eyeDimmer = Infinity,
}: HologramContext): HologramMode {
  // Pico de Wien da CMB atravessando a vizinhança do visível.
  const cmbNearVisible = inRange(cmbPeakNm, 260, 980);

  const countdown = hologramCountdownS(profile);
  const toFlip = profile.brakeStartTau - flight.tau;
  const toArrival = profile.tauTotal - flight.tau;
  if (toFlip > 0 && toFlip <= countdown) return 'countdown-flip';
  if (toArrival > 0 && toArrival <= countdown) return 'countdown-arrival';

  const accelerating = flight.phase === 'accelerating' && flight.tau > 0;
  const decelerating = flight.phase === 'decelerating';
  const inFlight = accelerating || decelerating || flight.phase === 'coasting';
  if (accelerating && inRange(sunDistanceAu, 5, 32)) return 'solar-system';
  // Na frenagem, o olho tem prioridade enquanto a luz é a mesma do white-out da ida
  // (o instante espelho de τ ≈ 150 s, quando ela parece ~1 260× mais fraca).
  if (
    crew === 'crewed' &&
    decelerating &&
    cmbTempK > EYE_HOLOGRAM_CMB_K.min &&
    cmbTempK < EYE_HOLOGRAM_CMB_K.max &&
    eyeDimmer >= EYE_HOLOGRAM_MIN_DIMMER
  ) {
    return 'eye-adaptation';
  }
  if (inFlight && cmbNearVisible) return 'cmb-spectrum';
  if (accelerating && cmbTempK > 15_000 && cmbTempK < 180_000) return 'lux-curve';
  if (decelerating && inRange(flight.gamma, BLUESHIFT_HOLOGRAM_GAMMA.min, BLUESHIFT_HOLOGRAM_GAMMA.max)) {
    return 'target-blueshift';
  }
  return 'none';
}
