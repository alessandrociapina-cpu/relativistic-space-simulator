/**
 * Catálogo de destinos pré-configurados (CLAUDE.md §4.3).
 */
import { G0, LIGHT_YEAR_M, computeMissionProfile, type MissionProfile } from './RelativityEngine';

/** Raio solar nominal IAU 2015 (m). */
export const SOLAR_RADIUS_M = 6.957e8;
/** GM☉/c² (m): metade do raio de Schwarzschild do Sol. */
export const SOLAR_GRAVITATIONAL_RADIUS_M = 1.32712440018e20 / 299_792_458 ** 2;
/** Massa de Sagittarius A* (M☉), ~4 milhões de massas solares (EHT, 2022). */
const SGR_A_MASS_SOLAR = 4.0e6;
/** Raio da sombra de um buraco negro de Schwarzschild, em GM/c²: o parâmetro de impacto crítico 3√3. */
const SHADOW_RADII = 3 * Math.sqrt(3);
/** Parsec (m). */
export const PARSEC_M = 3.0856775814913673e16;

/** Aceleração padrão sugerida: 1,61×10⁶ G (≈ 10 min de bordo até Proxima). */
export const DEFAULT_ACCEL_G = 1.61e6;

export type DestinationId =
  | 'proxima'
  | 'alphaCenA'
  | 'sirius'
  | 'tauCeti'
  | 'eridani40'
  | 'betaVirginis'
  | 'trappist1'
  | 'sgrA'
  | 'andromeda'
  | 'virgoCluster';

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
  /** Buraco negro: GM/c² (m), que dá a sombra (3√3·GM/c²) e o raio de Einstein da lente gravitacional. */
  readonly gravitationalRadiusM?: number;
  /** Galáxia elíptica (M87): o shader desenha o halo quase redondo de estrelas velhas, sem braços. */
  readonly elliptical?: boolean;
  /** Artigo do nome ("o Centro Galáctico", "a Galáxia de Andrômeda"); as estrelas vão sem artigo. */
  readonly article?: 'o' | 'a';
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
  alphaCenA: {
    id: 'alphaCenA',
    name: 'Alfa Centauri A',
    shortName: 'ALFA CEN A',
    kind: 'star',
    distanceLy: 4.37,
    temperatureK: 5790,
    radiusM: 1.2234 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 219.9021,
    decDeg: -60.8340,
    blurb: 'Uma gêmea um pouco maior do Sol, com Alfa Centauri B a ~23 UA; é a estrela de Pandora, em Avatar.',
    visualMag: 0.01,
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
  tauCeti: {
    id: 'tauCeti',
    name: 'Tau Ceti',
    shortName: 'TAU CETI',
    kind: 'star',
    distanceLy: 11.912,
    temperatureK: 5320,
    radiusM: 0.793 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 26.0170,
    decDeg: -15.9375,
    blurb: 'Uma estrela parecida com o Sol, na Baleia, com planetas candidatos; o destino do Hail Mary.',
    visualMag: 3.5,
  },
  eridani40: {
    id: 'eridani40',
    name: '40 Eridani A',
    shortName: '40 ERI A',
    kind: 'star',
    distanceLy: 16.34,
    temperatureK: 5126,
    radiusM: 0.804 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 63.8180,
    decDeg: -7.6529,
    blurb: 'Anã laranja num sistema triplo, em Erídano; em Project Hail Mary, a estrela de Erid, o planeta de Rocky.',
    visualMag: 4.43,
  },
  betaVirginis: {
    id: 'betaVirginis',
    name: 'Beta Virginis',
    shortName: 'BETA VIR',
    kind: 'star',
    // Paralaxe do Hipparcos (10,93 pc); no romance Tau Zero (1970), "32 anos-luz".
    distanceLy: 35.65,
    temperatureK: 6132,
    radiusM: 1.68 * SOLAR_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 177.6738,
    decDeg: 1.7647,
    blurb: 'Zavijava, uma estrela F9 um pouco maior que o Sol, na Virgem; o destino da Leonora Christine em Tau Zero.',
    visualMag: 3.6,
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
    // A sombra de 4 milhões de massas solares: 3√3·GM/c² ≈ 3,07 × 10¹⁰ m ≈ 44 R☉.
    radiusM: SHADOW_RADII * SGR_A_MASS_SOLAR * SOLAR_GRAVITATIONAL_RADIUS_M,
    gravitationalRadiusM: SGR_A_MASS_SOLAR * SOLAR_GRAVITATIONAL_RADIUS_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 266.4168,
    decDeg: -29.0078,
    blurb: 'O buraco negro de 4 milhões de massas solares no centro da Via Láctea, escondido atrás da poeira.',
    article: 'o',
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
    article: 'a',
  },
  virgoCluster: {
    id: 'virgoCluster',
    name: 'Aglomerado de Virgem (M87)',
    shortName: 'VIRGEM',
    kind: 'galaxy',
    elliptical: true,
    article: 'o',
    // 16,5 Mpc, até M87, a elíptica gigante no centro do aglomerado.
    distanceLy: 5.38e7,
    // estrelas velhas de uma elíptica
    temperatureK: 4800,
    // escala do halo desenhado (vai até ~3 raios)
    radiusM: 12_000 * PARSEC_M,
    defaultAccelG: DEFAULT_ACCEL_G,
    raDeg: 187.7059,
    decDeg: 12.3911,
    blurb:
      'Mais de mil galáxias a 54 milhões de anos-luz; no centro, a elíptica gigante M87, com o buraco negro fotografado em 2019.',
  },
};

/** "rumo a Sirius A", "rumo ao Centro Galáctico", "rumo à Galáxia de Andrômeda". */
export const towardName = (destination: Destination) =>
  `${destination.article === 'o' ? 'ao' : destination.article === 'a' ? 'à' : 'a'} ${destination.name}`;

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

/** O cruzeiro mais rápido que o planejamento aceita, como fração da rapidez do ponto médio. */
export const MAX_COAST_FRACTION = 0.999;

/**
 * O cruzeiro que a viagem usa: o escolhido, limitado logo abaixo da rapidez do
 * ponto médio. Acima dela não sobra trecho de inércia e `computeMissionProfile`
 * voltaria ao Flip-and-Burn sem aviso (ao trocar para uma aceleração menor).
 */
export function effectiveCoastEta(destination: Destination, accelG: number, coastEta: number | null): number | null {
  if (coastEta === null) return null;
  return Math.min(coastEta, destinationMissionProfile(destination, accelG).etaMax * MAX_COAST_FRACTION);
}
