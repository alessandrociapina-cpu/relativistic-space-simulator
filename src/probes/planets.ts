/**
 * Planetas do simulador de sondas, em posições heliocêntricas na eclíptica J2000.
 *
 * - Mercúrio a Marte: elementos de Kepler aproximados do JPL (E. M. Standish,
 *   Tabela 1, válida de 1800 a 2050), com erro de 1 000 a 45 000 km.
 * - Júpiter a Plutão: tabelas do JPL Horizons (baricentros dos sistemas, 1969 a
 *   2036, erro < 150 km); os elementos de Kepler deles erram até 0,03 UA e
 *   ficam só para desenhar as órbitas e para datas fora das tabelas.
 *
 * Nos sobrevoos a sonda é posicionada em relação ao planeta desenhado (ver
 * `probes.ts`), então eles passam no lugar exato em qualquer caso.
 */
import planetTables from './data/planets.json';
import { interpolatePosition, tableEnd, tableStart, unpackTable, type StateTable } from './ephemeris';
import { DAYS_PER_CENTURY } from './time';
import type { Vec3 } from './vec3';

export type PlanetId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

/** a (UA), e, I, L, ϖ (longitude do periélio), Ω (nodo), em graus; e as taxas por século. */
interface KeplerElements {
  readonly value: readonly [number, number, number, number, number, number];
  readonly rate: readonly [number, number, number, number, number, number];
}

export interface Planet {
  readonly id: PlanetId;
  readonly name: string;
  readonly color: string;
  readonly radiusKm: number;
  /** Parâmetro gravitacional GM (km³/s²). */
  readonly gm: number;
  readonly elements: KeplerElements;
}

/** JPL "Approximate Positions of the Planets", Tabela 1 (1800–2050); Terra = baricentro Terra–Lua. */
export const PLANETS: Readonly<Record<PlanetId, Planet>> = {
  mercury: {
    id: 'mercury',
    name: 'Mercúrio',
    color: '#a8a29e',
    radiusKm: 2439.7,
    gm: 22_031.9,
    elements: {
      value: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
      rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    },
  },
  venus: {
    id: 'venus',
    name: 'Vênus',
    color: '#e8cfa0',
    radiusKm: 6051.8,
    gm: 324_858.6,
    elements: {
      value: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
      rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    },
  },
  earth: {
    id: 'earth',
    name: 'Terra',
    color: '#4f8cf7',
    radiusKm: 6378.1,
    gm: 398_600.4,
    elements: {
      value: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
      rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
    },
  },
  mars: {
    id: 'mars',
    name: 'Marte',
    color: '#d9603b',
    radiusKm: 3396.2,
    gm: 42_828.4,
    elements: {
      value: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
      rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    },
  },
  jupiter: {
    id: 'jupiter',
    name: 'Júpiter',
    color: '#d8a874',
    radiusKm: 71_492,
    gm: 126_686_534,
    elements: {
      value: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
      rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    },
  },
  saturn: {
    id: 'saturn',
    name: 'Saturno',
    color: '#e6cf8f',
    radiusKm: 60_268,
    gm: 37_931_187,
    elements: {
      value: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
      rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    },
  },
  uranus: {
    id: 'uranus',
    name: 'Urano',
    color: '#9be7f2',
    radiusKm: 25_559,
    gm: 5_793_939,
    elements: {
      value: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
      rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    },
  },
  neptune: {
    id: 'neptune',
    name: 'Netuno',
    color: '#5b7cf0',
    radiusKm: 24_764,
    gm: 6_836_529,
    elements: {
      value: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
      rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    },
  },
  pluto: {
    id: 'pluto',
    name: 'Plutão',
    color: '#cdb59c',
    radiusKm: 1188.3,
    gm: 869.6,
    elements: {
      value: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
      rate: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
    },
  },
};

export const PLANET_LIST: readonly Planet[] = Object.values(PLANETS);

/** GM do Sol (km³/s²) e raio (km). */
export const SUN_GM = 1.32712440018e11;
export const SUN_RADIUS_KM = 695_700;

const DEG = Math.PI / 180;

/** Planetas com tabela do Horizons (baricentro do sistema). */
const TABLES: Partial<Record<PlanetId, StateTable>> = {
  jupiter: unpackTable(planetTables.jupiter),
  saturn: unpackTable(planetTables.saturn),
  uranus: unpackTable(planetTables.uranus),
  neptune: unpackTable(planetTables.neptune),
  pluto: unpackTable(planetTables.pluto),
};

/** Elementos no instante (dias desde J2000), em radianos. */
function elementsAt({ value, rate }: KeplerElements, days: number) {
  const T = days / DAYS_PER_CENTURY;
  const [a, e, i, L, peri, node] = value.map((v, k) => v + rate[k]! * T) as [number, number, number, number, number, number];
  return { a, e, i: i * DEG, L: L * DEG, peri: peri * DEG, node: node * DEG };
}

/** Anomalia excêntrica pela equação de Kepler M = E − e·sin E (Newton). */
function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 12; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/** Posição na órbita a partir da anomalia excêntrica E, já na eclíptica J2000. */
function orbitPoint(el: ReturnType<typeof elementsAt>, E: number): Vec3 {
  const { a, e, i, peri, node } = el;
  const w = peri - node;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(node);
  const sO = Math.sin(node);
  const ci = Math.cos(i);
  const si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

/** Posição pelos elementos de Kepler (UA, eclíptica J2000). */
export function keplerPosition(planet: Planet, days: number): Vec3 {
  const el = elementsAt(planet.elements, days);
  const M = Math.atan2(Math.sin(el.L - el.peri), Math.cos(el.L - el.peri));
  return orbitPoint(el, solveKepler(M, el.e));
}

/** Posição heliocêntrica do planeta (UA, eclíptica J2000). */
export function planetPosition(id: PlanetId, days: number): Vec3 {
  const table = TABLES[id];
  if (table && days >= tableStart(table) && days <= tableEnd(table)) return interpolatePosition(table, days);
  return keplerPosition(PLANETS[id], days);
}

/** Velocidade heliocêntrica (UA/dia) por diferença central. */
export function planetVelocity(id: PlanetId, days: number): Vec3 {
  const h = 0.01;
  const a = planetPosition(id, days - h);
  const b = planetPosition(id, days + h);
  return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h), (b[2] - a[2]) / (2 * h)];
}

/** A órbita como polígono fechado de `segments` pontos (elementos do instante). */
export function orbitPolyline(planet: Planet, days: number, segments = 256): Vec3[] {
  const el = elementsAt(planet.elements, days);
  return Array.from({ length: segments + 1 }, (_, k) => orbitPoint(el, (2 * Math.PI * k) / segments));
}
