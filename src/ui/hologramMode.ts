/**
 * Qual holograma o projetor central mostra em cada fase do voo. Segue a
 * cronologia do vídeo de referência, mas por critérios físicos (UA, γ, T da
 * CMB), então vale para qualquer destino e aceleração.
 */
import type { FlightState, MissionProfile } from '../physics/RelativityEngine';
import type { FlightMode } from '../store/useFlightStore';

export type HologramMode =
  | 'solar-system'
  | 'cmb-spectrum'
  | 'lux-curve'
  | 'countdown-flip'
  | 'eye-adaptation'
  | 'target-blueshift'
  | 'countdown-arrival'
  | 'none';

/** Duração das contagens holográficas antes do flip e da chegada (s de tempo próprio). */
export const HOLOGRAM_COUNTDOWN_S = 10;

export interface HologramContext {
  readonly mode: FlightMode;
  readonly flight: FlightState;
  readonly profile: MissionProfile;
  readonly sunDistanceAu: number;
  readonly cmbTempK: number;
  readonly cmbPeakNm: number;
}

const inRange = (x: number, min: number, max: number) => x >= min && x <= max;

export function selectHologramMode({ mode, flight, profile, sunDistanceAu, cmbTempK, cmbPeakNm }: HologramContext): HologramMode {
  // Pico de Wien da CMB atravessando a vizinhança do visível.
  const cmbNearVisible = inRange(cmbPeakNm, 260, 980);
  if (mode === 'manual') return cmbNearVisible ? 'cmb-spectrum' : 'none';

  const toFlip = profile.tauHalf - flight.tau;
  const toArrival = profile.tauTotal - flight.tau;
  if (toFlip > 0 && toFlip <= HOLOGRAM_COUNTDOWN_S) return 'countdown-flip';
  if (toArrival > 0 && toArrival <= HOLOGRAM_COUNTDOWN_S) return 'countdown-arrival';

  const accelerating = flight.phase === 'accelerating' && flight.tau > 0;
  const decelerating = flight.phase === 'decelerating';
  if (accelerating && inRange(sunDistanceAu, 5, 32)) return 'solar-system';
  // Na frenagem, o olho tem prioridade enquanto a luz é a mesma do white-out da ida
  // (o instante espelho de τ ≈ 150 s, quando ela parece ~1 260× mais fraca).
  if (decelerating && cmbTempK > 5000 && cmbTempK < 60_000) return 'eye-adaptation';
  if ((accelerating || decelerating) && cmbNearVisible) return 'cmb-spectrum';
  if (accelerating && cmbTempK > 15_000 && cmbTempK < 180_000) return 'lux-curve';
  if (decelerating && inRange(flight.gamma, 8, 220)) return 'target-blueshift';
  return 'none';
}
