/**
 * Estrela e planeta de partida da viagem: o Sol e a Terra (padrão) ou 40 Eridani A e Erid, o planeta de
 * Rocky em Project Hail Mary. A distância e a direção do alvo passam a ser as vistas da partida: o resto do
 * simulador continua com o alvo em −Z e a nave andando da estrela de partida até ele.
 */
import { LIGHT_YEAR_M } from './RelativityEngine';
import { DESTINATIONS, SOLAR_RADIUS_M, type Destination, type DestinationId } from './destinations';
import { AU_M } from './sky';
import { equatorialUnit, length, scale, sub, type Vec3 } from '../sky/skyFrame';

export type OriginId = 'sol' | 'eridani40';

export interface Origin {
  readonly id: OriginId;
  /** A estrela de partida ("Sol", "40 Eridani A"). */
  readonly starName: string;
  /** Rótulo curto dos monitores ("SOL", "40 ERI A"). */
  readonly shortName: string;
  /** O planeta de partida ("Terra", "Erid"). */
  readonly homeName: string;
  /** Com as preposições: "da Terra" / "de Erid", "na Terra" / "em Erid", "à Terra" / "a Erid". */
  readonly ofHome: string;
  readonly inHome: string;
  readonly toHome: string;
  readonly starTempK: number;
  readonly starRadiusM: number;
  /** Magnitude visual absoluta da estrela (V a 10 pc). */
  readonly absMagV: number;
  /** Raio da órbita do planeta de partida (m): a nave parte dele. */
  readonly homeOrbitM: number;
  /** A mesma estrela no catálogo de destinos (não dá para partir e chegar nela). */
  readonly destinationId?: DestinationId;
  /** Os planetas e a Nuvem de Oort (hologramas, rota, explicações) só existem na partida do Sol. */
  readonly solarSystem: boolean;
  /** Uma linha para o planejamento. */
  readonly blurb: string;
}

export const ORIGINS: Readonly<Record<OriginId, Origin>> = {
  sol: {
    id: 'sol',
    starName: 'Sol',
    shortName: 'SOL',
    homeName: 'Terra',
    ofHome: 'da Terra',
    inHome: 'na Terra',
    toHome: 'à Terra',
    starTempK: 5778,
    starRadiusM: SOLAR_RADIUS_M,
    absMagV: 4.83,
    homeOrbitM: AU_M,
    solarSystem: true,
    blurb: 'A partida de sempre, da órbita da Terra.',
  },
  eridani40: {
    id: 'eridani40',
    starName: '40 Eridani A',
    shortName: '40 ERI A',
    homeName: 'Erid',
    ofHome: 'de Erid',
    inHome: 'em Erid',
    toHome: 'a Erid',
    starTempK: 5126,
    starRadiusM: 0.804 * SOLAR_RADIUS_M,
    // V = 4,43 a 16,34 anos-luz (5,01 pc).
    absMagV: 5.93,
    // O ano de Erid tem ~42 dias em torno de uma estrela de 0,78 M☉: a = (P²M)^(1/3) ≈ 0,22 UA.
    homeOrbitM: 0.22 * AU_M,
    destinationId: 'eridani40',
    solarSystem: false,
    blurb: 'De Erid, o planeta de Rocky (Project Hail Mary), em órbita de 40 Eridani A.',
  },
};

export const ORIGIN_LIST: readonly Origin[] = Object.values(ORIGINS);

/** Posição da estrela de partida (ICRS, anos-luz, com o Sol na origem). */
export function originPositionLy(origin: Origin): Vec3 {
  if (!origin.destinationId) return [0, 0, 0];
  const star = DESTINATIONS[origin.destinationId];
  return scale(equatorialUnit(star.raDeg, star.decDeg), star.distanceLy);
}

const DEG = Math.PI / 180;
const PARSEC_LY = 3.2615637771674337;

/** Luminosidade da estrela de partida na unidade do catálogo (10^(−0,4 V)·d², d em anos-luz). */
export const originLuminosity = (origin: Origin) => 10 ** (-0.4 * origin.absMagV) * (10 * PARSEC_LY) ** 2;

/** Distância da nave à estrela de partida (anos-luz) depois de percorrer `positionM` desde o planeta. */
export const originDistanceLy = (origin: Origin, positionM: number) => (origin.homeOrbitM + positionM) / LIGHT_YEAR_M;

/**
 * O destino visto da partida: distância e direção (α, δ) a partir da estrela de partida, e a magnitude do
 * alvo corrigida pela nova distância. Da Terra, o próprio catálogo.
 */
export function missionDestination(origin: Origin, destination: Destination | DestinationId): Destination {
  const base = DESTINATIONS[typeof destination === 'string' ? destination : destination.id];
  if (!origin.destinationId) return base;
  const rel = sub(scale(equatorialUnit(base.raDeg, base.decDeg), base.distanceLy), originPositionLy(origin));
  const distanceLy = length(rel);
  const raDeg = (Math.atan2(rel[1], rel[0]) / DEG + 360) % 360;
  const decDeg = Math.asin(rel[2] / distanceLy) / DEG;
  return {
    ...base,
    distanceLy,
    raDeg,
    decDeg,
    ...(base.visualMag === undefined ? {} : { visualMag: base.visualMag + 5 * Math.log10(distanceLy / base.distanceLy) }),
  };
}

/** Destinos possíveis de uma partida: todos menos a própria estrela. */
export const canTravel = (origin: Origin, destinationId: DestinationId) => origin.destinationId !== destinationId;
