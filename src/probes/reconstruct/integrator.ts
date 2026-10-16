/**
 * Integração numérica no referencial geocêntrico (eclíptica J2000, km, km/s):
 * Terra, Lua (pela série de Fourier do app) e Sol, com os termos indiretos
 * do referencial que acompanha a Terra. Dormand–Prince 5(4) com passo
 * adaptativo.
 */
import { moonOffset } from '../bodies';
import { planetPosition, planetVelocity, SUN_GM, PLANETS } from '../planets';
import { add, norm, scale, sub, type Vec3 } from '../vec3';
import { AU_KM, DAY_S, type Sample } from './common';

export const MU_EARTH = PLANETS.earth.gm;
export const MU_MOON = 4902.8;
const KMS_PER_AU_DAY = AU_KM / DAY_S;

/** Estado geocêntrico da Lua (km, km/s). */
export function moonState(t: number): { r: Vec3; v: Vec3 } {
  const o = moonOffset('moon', t);
  return { r: scale(o.position, AU_KM), v: scale(o.velocity, KMS_PER_AU_DAY) };
}

/** Sol visto da Terra (km): o oposto da posição heliocêntrica da Terra. */
const sunFromEarth = (t: number): Vec3 => scale(planetPosition('earth', t), -AU_KM);

/**
 * Posição numa grade fixa (passo `step` dias) com interpolação de Hermite
 * cúbica, calculada sob demanda: a Lua a cada hora erra ~10 m, e é muito mais
 * barata que somar a série a cada avaliação da aceleração.
 */
function gridded(step: number, state: (t: number) => { r: Vec3; v: Vec3 }): (t: number) => Vec3 {
  const cache = new Map<number, { r: Vec3; v: Vec3 }>();
  const node = (k: number) => {
    let s = cache.get(k);
    if (!s) {
      s = state(k * step);
      cache.set(k, s);
    }
    return s;
  };
  const h = step * DAY_S;
  return (t: number) => {
    const k = Math.floor(t / step);
    const a = node(k);
    const b = node(k + 1);
    const u = t / step - k;
    const h00 = 2 * u * u * u - 3 * u * u + 1;
    const h10 = u * u * u - 2 * u * u + u;
    const h01 = -2 * u * u * u + 3 * u * u;
    const h11 = u * u * u - u * u;
    return [0, 1, 2].map((c) => h00 * a.r[c]! + h10 * h * a.v[c]! + h01 * b.r[c]! + h11 * h * b.v[c]!) as unknown as Vec3;
  };
}

const moonFast = gridded(1 / 24, moonState);
const sunFast = gridded(0.25, (t) => ({ r: sunFromEarth(t), v: scale(planetVelocity('earth', t), -KMS_PER_AU_DAY) }));

/** Aceleração (km/s²) em r, no instante t: Terra + perturbação da Lua e do Sol (direta e indireta). */
function acceleration(r: Vec3, t: number): Vec3 {
  const third = (mu: number, body: Vec3): Vec3 => {
    const d = sub(r, body);
    const dn = norm(d);
    const bn = norm(body);
    return add(scale(d, -mu / (dn * dn * dn)), scale(body, -mu / (bn * bn * bn)));
  };
  const rn = norm(r);
  return add(add(scale(r, -MU_EARTH / (rn * rn * rn)), third(MU_MOON, moonFast(t))), third(SUN_GM, sunFast(t)));
}

type Y = readonly [number, number, number, number, number, number];
const deriv = (y: Y, t: number): Y => {
  const a = acceleration([y[0], y[1], y[2]], t);
  return [y[3], y[4], y[5], a[0], a[1], a[2]];
};

const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A: readonly (readonly number[])[] = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const B = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const BS = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

/**
 * Integra de `t0` a `t1` (dias; t1 < t0 volta no tempo) e devolve os estados
 * em cada passo aceito, terminando exatamente em t1. `maxStepS` limita o
 * passo, para o enxugamento ter pontos de controle no cruzeiro.
 */
export function integrate(start: { r: Vec3; v: Vec3 }, t0: number, t1: number, maxStepS = 1800, rtol = 1e-11): Sample[] {
  const dir = Math.sign(t1 - t0);
  const total = Math.abs(t1 - t0) * DAY_S;
  let y: Y = [...start.r, ...start.v] as unknown as Y;
  let s = 0;
  let h = Math.min(60, maxStepS, total);
  const out: Sample[] = [{ t: t0, r: start.r, v: start.v }];
  while (s < total) {
    if (s + h > total) h = total - s;
    const k: Y[] = [];
    for (let i = 0; i < 7; i++) {
      const yi = y.map((yv, c) => yv + dir * h * A[i]!.reduce((acc, aij, j) => acc + aij * k[j]![c]!, 0)) as unknown as Y;
      k.push(deriv(yi, t0 + (dir * (s + C[i]! * h)) / DAY_S));
    }
    const next = y.map((yv, c) => yv + dir * h * B.reduce((acc, b, j) => acc + b * k[j]![c]!, 0)) as unknown as Y;
    let err = 0;
    for (let c = 0; c < 6; c++) {
      const e = h * B.reduce((acc, b, j) => acc + (b - BS[j]!) * k[j]![c]!, 0);
      const scaleC = (c < 3 ? 1e-6 : 1e-9) + rtol * Math.max(Math.abs(y[c]!), Math.abs(next[c]!));
      err = Math.max(err, Math.abs(e) / scaleC);
    }
    if (err <= 1) {
      s += h;
      y = next;
      out.push({ t: t0 + (dir * s) / DAY_S, r: [y[0], y[1], y[2]], v: [y[3], y[4], y[5]] });
    }
    h = Math.min(maxStepS, h * Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(err, 1e-12), -0.2))));
  }
  return dir > 0 ? out : out.reverse();
}

/** Só o estado final da integração. */
export function integrateTo(start: { r: Vec3; v: Vec3 }, t0: number, t1: number): { r: Vec3; v: Vec3 } {
  const rows = integrate(start, t0, t1, 3600);
  const last = t1 >= t0 ? rows[rows.length - 1]! : rows[0]!;
  return { r: last.r, v: last.v };
}
