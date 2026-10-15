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
 * esta distância (em raios do alvo), onde ele ocupa ≈ 0,95° de raio angular:
 * ~35% da altura do telescópio em "x 13", como no vídeo de referência.
 */
export const ARRIVAL_STANDOFF_RADII = 60;

export function angularRadius(radiusM: number, distanceM: number): number {
  return Math.asin(Math.min(1, radiusM / distanceM));
}

export interface BodyAngularRadii {
  readonly sunRadiusRad: number;
  readonly targetRadiusRad: number;
}

/** Distância do ponto de observação final ao centro do alvo (m). */
export function arrivalDistanceM(destination: Destination): number {
  return ARRIVAL_STANDOFF_RADII * destination.radiusSolar * SOLAR_RADIUS_M;
}

export function computeBodyAngularRadii(flight: FlightState, destination: Destination): BodyAngularRadii {
  return {
    sunRadiusRad: angularRadius(SOLAR_RADIUS_M, AU_M + flight.positionM),
    targetRadiusRad: angularRadius(
      destination.radiusSolar * SOLAR_RADIUS_M,
      flight.restDistanceRemainingM + arrivalDistanceM(destination),
    ),
  };
}
