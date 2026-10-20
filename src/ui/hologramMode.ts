/**
 * Qual holograma o projetor central mostra em cada fase do voo. Segue a
 * cronologia do vídeo de referência, mas por critérios físicos (UA, γ, T da
 * CMB), então vale para qualquer destino e aceleração.
 */
import { flipTauOf, isAscending, isDescending, type FlightState, type MissionProfile } from '../physics/RelativityEngine';
import { missionScaledS } from '../physics/criticalEvents';

export type HologramMode =
  | 'solar-system'
  | 'cmb-spectrum'
  | 'lux-curve'
  | 'countdown-flip'
  | 'target-blueshift'
  | 'countdown-arrival'
  | 'none';

/** Duração das contagens holográficas antes do flip e da chegada na demonstração (s de bordo). */
export const HOLOGRAM_COUNTDOWN_S = 10;

/** Contagem holográfica na escala da missão: 10 s na demonstração, 1/60 da viagem nas longas. */
export const hologramCountdownS = (profile: MissionProfile) => missionScaledS(profile, HOLOGRAM_COUNTDOWN_S);

/** Blueshift do alvo: faixa de γ na frenagem. */
export const BLUESHIFT_HOLOGRAM_GAMMA = { min: 8, max: 220 } as const;

export interface HologramContext {
  readonly flight: FlightState;
  readonly profile: MissionProfile;
  readonly sunDistanceAu: number;
  readonly cmbTempK: number;
  readonly cmbPeakNm: number;
  /** Há um alvo para ver à frente (no vazio intergaláctico, não). */
  readonly hasTarget?: boolean;
}

const inRange = (x: number, min: number, max: number) => x >= min && x <= max;

export function selectHologramMode({ flight, profile, sunDistanceAu, cmbTempK, cmbPeakNm, hasTarget = true }: HologramContext): HologramMode {
  // Pico de Wien da CMB atravessando a vizinhança do visível.
  const cmbNearVisible = inRange(cmbPeakNm, 260, 980);

  const countdown = hologramCountdownS(profile);
  const flip = flipTauOf(profile);
  const toFlip = flip === null ? -1 : flip - flight.tau;
  // À deriva não há chegada; passando pelo alvo, a contagem é a da passagem.
  const toArrival = profile.maneuvers?.end === 'drift' ? -1 : profile.tauTotal - flight.tau;
  if (toFlip > 0 && toFlip <= countdown) return 'countdown-flip';
  if (toArrival > 0 && toArrival <= countdown) return 'countdown-arrival';

  // Os descansos da tripulação contam na metade em que acontecem: o projetor não pisca a cada ciclo.
  const accelerating = isAscending(profile, flight) && flight.tau > 0;
  const decelerating = isDescending(profile, flight);
  const inFlight = accelerating || decelerating || flight.phase === 'coasting';
  if (accelerating && inRange(sunDistanceAu, 5, 32)) return 'solar-system';
  if (inFlight && cmbNearVisible) return 'cmb-spectrum';
  if (accelerating && cmbTempK > 15_000 && cmbTempK < 180_000) return 'lux-curve';
  if (hasTarget && decelerating && inRange(flight.gamma, BLUESHIFT_HOLOGRAM_GAMMA.min, BLUESHIFT_HOLOGRAM_GAMMA.max)) {
    return 'target-blueshift';
  }
  return 'none';
}
