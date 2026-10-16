/**
 * Referenciais do céu: equatorial (ICRS/J2000), galáctico e o da nave, em que o
 * alvo fica exatamente em −Z (CLAUDE.md §5) e o norte galáctico, projetado,
 * aponta para +Y. Assim a Via Láctea fica na horizontal rumo ao centro galáctico.
 */
import type { Destination } from '../physics/destinations';

export type Vec3 = readonly [number, number, number];
/** Matriz 3×3 por linhas: (Mv)ᵢ = linha i · v. */
export type Mat3 = readonly [Vec3, Vec3, Vec3];

const DEG = Math.PI / 180;

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));
export const apply = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
const multiply = (a: Mat3, b: Mat3): Mat3 => {
  const bt = transpose(b);
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])],
  ];
};

/** Vetor unitário equatorial a partir de ascensão reta e declinação (graus). */
export function equatorialUnit(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/**
 * ICRS → galáctico (Hipparcos, vol. 1, §1.5.3): as linhas são os eixos
 * galácticos x (centro, l = 0), y (l = 90°) e z (polo norte) em coordenadas ICRS.
 */
export const ICRS_TO_GALACTIC: Mat3 = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

/** Polo norte galáctico em ICRS. */
const GALACTIC_NORTH: Vec3 = ICRS_TO_GALACTIC[2];

/** Coordenadas galácticas (l, b em graus) de um vetor galáctico. */
export function galacticLonLat(v: Vec3): { l: number; b: number } {
  const u = normalize(v);
  const l = Math.atan2(u[1], u[0]) / DEG;
  return { l: l < 0 ? l + 360 : l, b: Math.asin(u[2]) / DEG };
}

export interface SkyFrame {
  /** ICRS → nave: linhas = eixos X, Y, Z da nave em ICRS. */
  readonly icrsToShip: Mat3;
  /** Nave → galáctico (heliocêntrico). */
  readonly shipToGalactic: Mat3;
  /** Direção do alvo, unitária, no referencial galáctico. */
  readonly targetGalactic: Vec3;
}

/** Referencial da nave para um destino: alvo em −Z, norte galáctico projetado em +Y. */
export function skyFrameFor(destination: Pick<Destination, 'raDeg' | 'decDeg'>): SkyFrame {
  const forward = equatorialUnit(destination.raDeg, destination.decDeg);
  const zAxis = scale(forward, -1);
  const yAxis = normalize(sub(GALACTIC_NORTH, scale(forward, dot(GALACTIC_NORTH, forward))));
  const xAxis = cross(yAxis, zAxis);
  const icrsToShip: Mat3 = [xAxis, yAxis, zAxis];
  return {
    icrsToShip,
    shipToGalactic: multiply(ICRS_TO_GALACTIC, transpose(icrsToShip)),
    targetGalactic: apply(ICRS_TO_GALACTIC, forward),
  };
}
