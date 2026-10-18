/**
 * Escala do mapa "Rota · escala log": logarítmica a partir da estrela de partida (o Sol, ou 40 Eridani A) na
 * primeira metade e espelhada a partir do alvo na segunda, com METADE no centro.
 */
import type { FlightState, MissionProfile } from '../physics/RelativityEngine';
import { AU_M } from '../physics/sky';

export const SATURN_AU = 9.5;
/** Ponto representativo da Nuvem de Oort (que vai de ~2 000 a ~100 000 UA). */
export const OORT_CLOUD_AU = 10_000;

export interface RouteGeometry {
  /** Distância da estrela de partida ao planeta de onde a nave sai (m): o início do mapa. */
  readonly startM: number;
  /** Distância à estrela de partida no ponto médio (m). */
  readonly halfwaySunDistanceM: number;
  /** Distância ao alvo na chegada (m): o ponto de observação final. */
  readonly arrivalTargetDistanceM: number;
}

export function routeGeometry(profile: MissionProfile, arrivalTargetDistanceM: number, startM: number = AU_M): RouteGeometry {
  return { startM, halfwaySunDistanceM: startM + profile.halfDistanceM, arrivalTargetDistanceM };
}

/** Posição de um ponto a `distanceM` da estrela de partida, na primeira metade do mapa (0 a 0,5). */
const startPosition = (distanceM: number, geometry: RouteGeometry) =>
  (0.5 * Math.log(distanceM / geometry.startM)) / Math.log(geometry.halfwaySunDistanceM / geometry.startM);

/** Posição de um marco a `au` do Sol (partida da Terra), na primeira metade do mapa (0 a 0,5). */
export const sunMarkerPosition = (au: number, geometry: RouteGeometry) => startPosition(au * AU_M, geometry);

/** Posição da nave no mapa: 0 na órbita do planeta de partida, 0,5 no ponto médio, 1 na chegada. */
export function routePosition(flight: FlightState, profile: MissionProfile, geometry: RouteGeometry): number {
  if (flight.positionM <= profile.halfDistanceM) {
    return startPosition(geometry.startM + flight.positionM, geometry);
  }
  const end = geometry.arrivalTargetDistanceM;
  const toTarget = flight.restDistanceRemainingM + end;
  return 1 - (0.5 * Math.log(toTarget / end)) / Math.log((profile.halfDistanceM + end) / end);
}
