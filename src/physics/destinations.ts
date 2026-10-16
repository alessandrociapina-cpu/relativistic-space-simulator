/**
 * Catálogo de destinos pré-configurados (CLAUDE.md §4.3).
 */
import { G0, LIGHT_YEAR_M, computeMissionProfile, type MissionProfile } from './RelativityEngine';

/** Raio solar nominal IAU 2015 (m). */
export const SOLAR_RADIUS_M = 6.957e8;
/** Parsec (m). */
export const PARSEC_M = 3.0856775814913673e16;

/** Aceleração padrão sugerida: 1,61×10⁶ G (≈ 10 min de bordo até Proxima). */
export const DEFAULT_ACCEL_G = 1.61e6;

export type DestinationId = 'proxima' | 'sirius' | 'trappist1' | 'sgrA' | 'andromeda';

/** Como o alvo é desenhado no shader (`uTargetType`: 0, 1, 2). */
export type TargetKind = 'star' | 'blackHole' | 'galaxy';

export interface Destination {
  readonly id: DestinationId;
  readonly name: string;
  /** Nome curto para rótulos do cockpit. */
  readonly shortName: string;
  readonly kind: TargetKind;
  /** Distância em repouso D_total (anos-luz). */
  readonly distanceLy: number;
  /** Temperatura de corpo negro do alvo (K). */
  readonly temperatureK: number;
  /** Raio do alvo (m): da estrela, da sombra do buraco negro ou do disco da galáxia. */
  readonly radiusM: number;
  /** Aceleração própria padrão (múltiplos de g₀). */
  readonly defaultAccelG: number;
  /** Direção no céu (ICRS/J2000): ascensão reta e declinação (graus). Orienta o céu real. */
  readonly raDeg: number;
  readonly decDeg: number;
  /** Uma linha para o planejamento da missão. */
  readonly blurb: string;
  /** Magnitude visual vista da Terra (estrelas): o brilho do alvo como ponto, antes de virar disco. */
  readonly visualMag?: number;
}

export const DESTINATIONS: Readonly<Record<DestinationId, Destination>> = {
  proxima: {
    id: 'proxima',
    name: 'Proxima Centauri',
    shortName: 'PROXIMA',
    kind: 'star',
    distanceLy: 4.25,
    temperatureK: 3042,
    radiusM: 0.154 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 217.4289,
    decDeg: -62.6795,
    blurb: 'A estrela mais próxima do Sol: uma anã vermelha em Centauro, ao lado de Alfa Centauri A e B.',
    visualMag: 11.13,
  },
  sirius: {
    id: 'sirius',
    name: 'Sirius A',
    shortName: 'SIRIUS',
    kind: 'star',
    distanceLy: 8.6,
    temperatureK: 9940,
    radiusM: 1.711 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 101.2872,
    decDeg: -16.7161,
    blurb: 'A estrela mais brilhante do céu noturno, branco-azulada, no Cão Maior.',
    visualMag: -1.46,
  },
  trappist1: {
    id: 'trappist1',
    name: 'TRAPPIST-1',
    shortName: 'TRAPPIST-1',
    kind: 'star',
    distanceLy: 39.6,
    temperatureK: 2566,
    radiusM: 0.119 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 346.6223,
    decDeg: -5.0414,
    blurb: 'Anã ultrafria em Aquário com sete planetas do tamanho da Terra.',
    visualMag: 18.8,
  },
  sgrA: {
    id: 'sgrA',
    name: 'Centro Galáctico (Sagittarius A*)',
    shortName: 'SGR A*',
    kind: 'blackHole',
    distanceLy: 26_700,
    // disco de acreção / aglomerado central
    temperatureK: 12_000,
    radiusM: 15 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 266.4168,
    decDeg: -29.0078,
    blurb: 'O buraco negro de 4 milhões de massas solares no centro da Via Láctea, escondido atrás da poeira.',
  },
  andromeda: {
    id: 'andromeda',
    name: 'Galáxia de Andrômeda (M31)',
    shortName: 'ANDROMEDA',
    kind: 'galaxy',
    distanceLy: 2.537e6,
    // núcleo integrado
    temperatureK: 5800,
    // escala do disco desenhado (bojo e braços vão até ~3 raios): ~3° de céu vista da Terra
    radiusM: 10_000 * PARSEC_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 10.6847,
    decDeg: 41.2692,
    blurb: 'A grande galáxia espiral vizinha, a 2,5 milhões de anos-luz: a viagem sai da Via Láctea.',
  },
};

/** Destinos na ordem de exibição (do mais próximo ao mais distante). */
export const DESTINATION_LIST: readonly Destination[] = Object.values(DESTINATIONS);

/** Aceleração da viagem tripulada: 1 g, o peso de sempre a bordo. */
export const CREWED_ACCEL_G = 1;

export function destinationMissionProfile(
  destination: Destination,
  accelG: number = destination.defaultAccelG,
  coastEta: number | null = null,
): MissionProfile {
  return computeMissionProfile(destination.distanceLy * LIGHT_YEAR_M, accelG * G0, coastEta);
}
