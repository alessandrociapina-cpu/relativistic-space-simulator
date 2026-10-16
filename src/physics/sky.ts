/**
 * Geometria dos corpos no céu (Sol atrás, alvo à frente), calculada em 64 bits
 * no referencial de repouso. A aberração é aplicada no shader.
 */
import type { FlightState } from './RelativityEngine';
import { SOLAR_RADIUS_M, type Destination, type TargetKind } from './destinations';

/** Unidade astronômica (m): a nave parte da órbita da Terra. */
export const AU_M = 1.495978707e11;

/**
 * O motor leva a nave até o centro do alvo; para a câmera, a chegada fica a
 * esta distância, em raios do alvo. A 3 raios uma estrela tem 19,5° de raio e
 * ocupa mais da metade da altura do para-brisa (70°); o buraco negro e a
 * galáxia ficam mais longe, para o disco de acreção e os braços caberem.
 */
export const ARRIVAL_STANDOFF_RADII: Readonly<Record<TargetKind, number>> = { star: 3, blackHole: 8, galaxy: 6 };

export function angularRadius(radiusM: number, distanceM: number): number {
  return Math.asin(Math.min(1, radiusM / distanceM));
}

export interface BodyAngularRadii {
  readonly sunRadiusRad: number;
  readonly targetRadiusRad: number;
}

/** Distância do ponto de observação final ao centro do alvo (m). */
export function arrivalDistanceM(destination: Destination): number {
  return ARRIVAL_STANDOFF_RADII[destination.kind] * destination.radiusM;
}

/**
 * Distância da câmera ao centro do alvo: ≈ L_repouso durante a viagem (o céu da
 * partida fica exato) e a distância de parada na chegada.
 */
export function targetViewDistanceM(flight: FlightState, destination: Destination): number {
  return Math.hypot(flight.restDistanceRemainingM, arrivalDistanceM(destination));
}

export function computeBodyAngularRadii(flight: FlightState, destination: Destination): BodyAngularRadii {
  return {
    sunRadiusRad: angularRadius(SOLAR_RADIUS_M, AU_M + flight.positionM),
    targetRadiusRad: angularRadius(destination.radiusM, targetViewDistanceM(flight, destination)),
  };
}
