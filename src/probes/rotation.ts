/**
 * Rotação dos corpos com sondas pousadas (relatório do grupo de trabalho da
 * IAU, Archinal et al. 2011): direção do polo norte (α₀, δ₀) no ICRF e o
 * ângulo W do meridiano principal, contado a partir do nodo do equador do
 * corpo no equador celeste. Serve para pôr um módulo de pouso no lugar certo
 * da superfície enquanto o corpo gira (Vikings em Marte, módulos lunares das
 * Apollo) e para desenhar as órbitas em relação ao equador.
 */
import type { BodyId } from './bodies';
import { cross, scale, type Vec3 } from './vec3';

const DEG = Math.PI / 180;
/** Obliquidade da eclíptica J2000 (graus): equatorial → eclíptica. */
const OBLIQUITY_DEG = 23.4392911;

interface Orientation {
  /** Polo norte (graus, equatorial J2000). */
  readonly ra: number;
  readonly dec: number;
  /** Meridiano principal (graus) e taxa de rotação (graus/dia). */
  readonly w: number;
  readonly wRate: number;
}

/** Ângulos da Lua: termos periódicos E1…E13 (graus), d em dias desde J2000. */
function moonOrientation(d: number): Orientation {
  const T = d / 36_525;
  const E = [
    125.045 - 0.0529921 * d,
    250.089 - 0.1059842 * d,
    260.008 + 13.0120009 * d,
    176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d,
    311.589 + 26.4057084 * d,
    134.963 + 13.064993 * d,
    276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d,
    15.134 - 0.1589763 * d,
    119.743 + 0.0036096 * d,
    239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ].map((e) => e * DEG);
  const s = (k: number) => Math.sin(E[k - 1]!);
  const c = (k: number) => Math.cos(E[k - 1]!);
  return {
    ra: 269.9949 + 0.0031 * T - 3.8787 * s(1) - 0.1204 * s(2) + 0.07 * s(3) - 0.0172 * s(4) + 0.0072 * s(6) - 0.0052 * s(10) + 0.0043 * s(13),
    dec:
      66.5392 + 0.013 * T + 1.5419 * c(1) + 0.0239 * c(2) - 0.0278 * c(3) + 0.0068 * c(4) - 0.0029 * c(6) + 0.0009 * c(7) + 0.0008 * c(10) - 0.0009 * c(13),
    w:
      38.3213 +
      13.17635815 * d -
      1.4e-12 * d * d +
      3.561 * s(1) +
      0.1208 * s(2) -
      0.0642 * s(3) +
      0.0158 * s(4) +
      0.0252 * s(5) -
      0.0066 * s(6) -
      0.0047 * s(7) -
      0.0046 * s(8) +
      0.0028 * s(9) +
      0.0052 * s(10) +
      0.004 * s(11) +
      0.0019 * s(12) -
      0.0044 * s(13),
    wRate: 13.17635815,
  };
}

/** Modelos com polo e rotação uniformes (os termos periódicos de Marte, de centésimos de grau, ficam de fora). */
const UNIFORM: Partial<Record<BodyId, (d: number) => Orientation>> = {
  mars: (d) => {
    const T = d / 36_525;
    return { ra: 317.68143 - 0.1061 * T, dec: 52.8865 - 0.0609 * T, w: 176.63 + 350.89198226 * d, wRate: 350.89198226 };
  },
  venus: (d) => ({ ra: 272.76, dec: 67.16, w: 160.2 - 1.4813688 * d, wRate: -1.4813688 }),
  moon: moonOrientation,
};

export const hasRotationModel = (body: BodyId) => body in UNIFORM;

const rx = (v: Vec3, a: number): Vec3 => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
const rz = (v: Vec3, a: number): Vec3 => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];

/** Vetor fixo no corpo (x no meridiano principal, z no polo norte) → eclíptica J2000. */
function toEcliptic(o: Orientation, v: Vec3): Vec3 {
  return rx(rz(rx(rz(v, o.w * DEG), (90 - o.dec) * DEG), (o.ra + 90) * DEG), -OBLIQUITY_DEG * DEG);
}

function orientation(body: BodyId, d: number): Orientation {
  const model = UNIFORM[body];
  if (!model) throw new Error(`Sem modelo de rotação: ${body}`);
  return model(d);
}

/** Polo norte do corpo (unitário, eclíptica J2000). */
export const poleDirection = (body: BodyId, d: number): Vec3 => toEcliptic(orientation(body, d), [0, 0, 1]);

/**
 * Posição (km) e velocidade (km/s) de um ponto da superfície em relação ao
 * centro do corpo, na eclíptica J2000: latitude e longitude leste em graus,
 * `radiusKm` do centro. A velocidade é a da rotação, ω × r.
 */
export function surfaceState(body: BodyId, latDeg: number, lonDeg: number, radiusKm: number, d: number): { r: Vec3; v: Vec3 } {
  const o = orientation(body, d);
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const r = toEcliptic(o, scale([Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)], radiusKm));
  const omega = scale(toEcliptic(o, [0, 0, 1]), (o.wRate * DEG) / 86_400);
  return { r, v: cross(omega, r) };
}

/** Latitude e longitude leste (graus) de uma direção na eclíptica J2000 sobre o corpo girando. */
export function surfaceCoordinates(body: BodyId, dir: Vec3, d: number): { latDeg: number; lonDeg: number } {
  const o = orientation(body, d);
  // Inversa de toEcliptic: as mesmas rotações ao contrário.
  const v = rz(rx(rz(rx(dir, OBLIQUITY_DEG * DEG), -(o.ra + 90) * DEG), -(90 - o.dec) * DEG), -o.w * DEG);
  const latDeg = (Math.atan2(v[2], Math.hypot(v[0], v[1])) * 180) / Math.PI;
  const lonDeg = (((Math.atan2(v[1], v[0]) * 180) / Math.PI) % 360 + 360) % 360;
  return { latDeg, lonDeg };
}
