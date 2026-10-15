/**
 * Geometria dos corpos no céu (Sol atrás, alvo à frente), calculada em 64 bits
 * no referencial de repouso. A aberração é aplicada no shader.
 */
import type { FlightState } from './RelativityEngine';
import { SOLAR_RADIUS_M, type Destination } from './destinations';

/** Unidade astronômica (m): a nave parte da órbita da Terra. */
export const AU_M = 1.495978707e11;

/**
 * O motor leva a nave até o centro do alvo; para a câmera, a chegada fica a
 * esta distância (em raios do alvo), onde ele ocupa ≈ 5,7° de raio angular.
 */
export const ARRIVAL_STANDOFF_RADII = 10;

export function angularRadius(radiusM: number, distanceM: number): number {
  return Math.asin(Math.min(1, radiusM / distanceM));
}

export interface BodyAngularRadii {
  readonly sunRadiusRad: number;
  readonly targetRadiusRad: number;
}

export function computeBodyAngularRadii(flight: FlightState, destination: Destination): BodyAngularRadii {
  const targetRadiusM = destination.radiusSolar * SOLAR_RADIUS_M;
  return {
    sunRadiusRad: angularRadius(SOLAR_RADIUS_M, AU_M + flight.positionM),
    targetRadiusRad: angularRadius(
      targetRadiusM,
      flight.restDistanceRemainingM + ARRIVAL_STANDOFF_RADII * targetRadiusM,
    ),
  };
}
