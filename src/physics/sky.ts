/**
 * Geometria dos corpos no céu (a estrela de partida atrás, o alvo à frente), calculada em 64 bits
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
export const ARRIVAL_STANDOFF_RADII: Readonly<Record<TargetKind, number>> = { star: 3, blackHole: 8, galaxy: 6, void: 0 };

export function angularRadius(radiusM: number, distanceM: number): number {
  // No vazio não há alvo (raio 0), nem na chegada, a distância 0.
  if (radiusM <= 0) return 0;
  return Math.asin(Math.min(1, radiusM / distanceM));
}

export interface BodyAngularRadii {
  readonly sunRadiusRad: number;
  readonly targetRadiusRad: number;
  /** Raio de Einstein da lente gravitacional do alvo (rad); 0 se o alvo não é um buraco negro. */
  readonly einsteinRadiusRad: number;
}

/**
 * Raio de Einstein de um buraco negro visto de `distanceM`, para fontes muito mais distantes que ele
 * (o fundo de estrelas e a Via Láctea): θ_E = √(4GM/(c²·D)) = 2√((GM/c²)/D). Para quem está longe, o anel
 * fica muito maior que a sombra (θ_E/θ_sombra ≈ 0,38·√(D·c²/GM)); a 8 raios da sombra, ~2,5 vezes.
 */
export function einsteinRadius(gravitationalRadiusM: number, distanceM: number): number {
  return 2 * Math.sqrt(gravitationalRadiusM / distanceM);
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

/** A estrela de partida e a órbita do planeta de onde a nave sai (a `Origin` de origins.ts). */
export interface DepartureStar {
  readonly starRadiusM: number;
  readonly homeOrbitM: number;
}

const SUN_DEPARTURE: DepartureStar = { starRadiusM: SOLAR_RADIUS_M, homeOrbitM: AU_M };

export function computeBodyAngularRadii(
  flight: FlightState,
  destination: Destination,
  departure: DepartureStar = SUN_DEPARTURE,
): BodyAngularRadii {
  const targetDistanceM = targetViewDistanceM(flight, destination);
  return {
    // A estrela de partida fica atrás, a uma órbita do planeta mais o caminho percorrido.
    sunRadiusRad: angularRadius(departure.starRadiusM, departure.homeOrbitM + flight.positionM),
    targetRadiusRad: angularRadius(destination.radiusM, targetDistanceM),
    einsteinRadiusRad: destination.gravitationalRadiusM ? einsteinRadius(destination.gravitationalRadiusM, targetDistanceM) : 0,
  };
}
