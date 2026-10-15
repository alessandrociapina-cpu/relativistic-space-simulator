/**
 * Escala do mapa "ROUTE · LOG SCALE": logarítmica a partir do Sol na primeira
 * metade e espelhada a partir do alvo na segunda, com HALFWAY no centro.
 */
import type { FlightState, MissionProfile } from '../physics/RelativityEngine';
import { AU_M } from '../physics/sky';

export const SATURN_AU = 9.5;
/** Ponto representativo da Nuvem de Oort (que vai de ~2 000 a ~100 000 UA). */
export const OORT_CLOUD_AU = 10_000;

export interface RouteGeometry {
  /** Distância ao Sol no ponto médio (m). */
  readonly halfwaySunDistanceM: number;
  /** Distância ao alvo na chegada (m): o ponto de observação final. */
  readonly arrivalTargetDistanceM: number;
}

export function routeGeometry(profile: MissionProfile, arrivalTargetDistanceM: number): RouteGeometry {
  return { halfwaySunDistanceM: AU_M + profile.halfDistanceM, arrivalTargetDistanceM };
}

/** Posição de um marco a `au` do Sol, na primeira metade do mapa (0 a 0,5). */
export function sunMarkerPosition(au: number, geometry: RouteGeometry): number {
  return (0.5 * Math.log(au)) / Math.log(geometry.halfwaySunDistanceM / AU_M);
}

/** Posição da nave no mapa: 0 na órbita da Terra, 0,5 no ponto médio, 1 na chegada. */
export function routePosition(flight: FlightState, profile: MissionProfile, geometry: RouteGeometry): number {
  if (flight.positionM <= profile.halfDistanceM) {
    return sunMarkerPosition((AU_M + flight.positionM) / AU_M, geometry);
  }
  const end = geometry.arrivalTargetDistanceM;
  const toTarget = flight.restDistanceRemainingM + end;
  return 1 - (0.5 * Math.log(toTarget / end)) / Math.log((profile.halfDistanceM + end) / end);
}
