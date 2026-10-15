/**
 * Catálogo de destinos pré-configurados (CLAUDE.md §4.3).
 */
import { G0, LIGHT_YEAR_M, computeMissionProfile, type MissionProfile } from './RelativityEngine';

/** Raio solar nominal IAU 2015 (m). */
export const SOLAR_RADIUS_M = 6.957e8;

/** Aceleração padrão sugerida: 1,61×10⁶ G (≈ 10 min de bordo até Proxima). */
export const DEFAULT_ACCEL_G = 1.61e6;

export type DestinationId = 'proxima' | 'sirius' | 'trappist1' | 'sgrA' | 'andromeda';

export interface Destination {
  readonly id: DestinationId;
  readonly name: string;
  /** Distância em repouso D_total (anos-luz). */
  readonly distanceLy: number;
  /** Temperatura de corpo negro do alvo (K). */
  readonly temperatureK: number;
  /** Raio do alvo (R☉). */
  readonly radiusSolar: number;
  /** Aceleração própria padrão (múltiplos de g₀). */
  readonly defaultAccelG: number;
}

export const DESTINATIONS: Readonly<Record<DestinationId, Destination>> = {
  proxima: {
    id: 'proxima',
    name: 'Proxima Centauri',
    distanceLy: 4.25,
    temperatureK: 3042,
    radiusSolar: 0.154,
    defaultAccelG: DEFAULT_ACCEL_G,
  },
  sirius: {
    id: 'sirius',
    name: 'Sirius A',
    distanceLy: 8.6,
    temperatureK: 9940,
    radiusSolar: 1.711,
    defaultAccelG: DEFAULT_ACCEL_G,
  },
  trappist1: {
    id: 'trappist1',
    name: 'TRAPPIST-1',
    distanceLy: 39.6,
    temperatureK: 2566,
    radiusSolar: 0.119,
    defaultAccelG: DEFAULT_ACCEL_G,
  },
  sgrA: {
    id: 'sgrA',
    name: 'Centro Galáctico (Sagittarius A*)',
    distanceLy: 26_700,
    // disco de acreção / aglomerado central
    temperatureK: 12_000,
    radiusSolar: 15,
    defaultAccelG: DEFAULT_ACCEL_G,
  },
  andromeda: {
    id: 'andromeda',
    name: 'Galáxia de Andrômeda (M31)',
    distanceLy: 2.537e6,
    // núcleo integrado
    temperatureK: 5800,
    radiusSolar: 1000,
    defaultAccelG: DEFAULT_ACCEL_G,
  },
};

/** Destinos na ordem de exibição (do mais próximo ao mais distante). */
export const DESTINATION_LIST: readonly Destination[] = Object.values(DESTINATIONS);

export function destinationMissionProfile(
  destination: Destination,
  accelG: number = destination.defaultAccelG,
): MissionProfile {
  return computeMissionProfile(destination.distanceLy * LIGHT_YEAR_M, accelG * G0);
}
