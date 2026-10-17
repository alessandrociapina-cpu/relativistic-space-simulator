/**
 * Mecânica orbital de dois corpos em variáveis universais (Curtis, "Orbital
 * Mechanics for Engineering Students", cap. 3 e 5): propagação de Kepler,
 * problema de Lambert e a cônica de um estado. Unidades: km, s, km³/s².
 */
import { add, cross, dot, norm, scale, sub, type Vec3 } from './vec3';

export interface State {
  readonly r: Vec3;
  readonly v: Vec3;
}

/** Funções de Stumpff C(z) e S(z), com série perto de z = 0. */
export function stumpff(z: number): { C: number; S: number } {
  if (Math.abs(z) < 1e-3) {
    return { C: 1 / 2 - z / 24 + (z * z) / 720, S: 1 / 6 - z / 120 + (z * z) / 5040 };
  }
  if (z > 0) {
    const s = Math.sqrt(z);
    return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * s * s) };
  }
  const s = Math.sqrt(-z);
  return { C: (Math.cosh(s) - 1) / -z, S: (Math.sinh(s) - s) / (s * s * s) };
}

/**
 * Estado depois de `dt` (negativo volta no tempo) numa cônica em torno de μ,
 * em unidades coerentes quaisquer (km e s, ou UA e dias). Sem gravidade
 * apreciável (μ = 0 ou v²r ≫ μ), segue em linha reta. A mesma conta está em
 * scripts/fetch-horizons.mjs, que escolhe as amostras das tabelas.
 */
export function propagate({ r: r0, v: v0 }: State, dt: number, mu: number): State {
  const r0n = norm(r0);
  const v2 = dot(v0, v0);
  if (dt === 0) return { r: r0, v: v0 };
  if (mu === 0 || v2 * r0n > 1e10 * mu) return { r: add(r0, scale(v0, dt)), v: v0 };
  const sqrtMu = Math.sqrt(mu);
  const rv = dot(r0, v0);
  const alpha = 2 / r0n - v2 / mu;

  // Anomalia universal χ: tem o sinal de dt e F(χ) cresce com χ, então o
  // Newton é protegido por bisseção (sempre com um lado finito). Na hipérbole,
  // |χ|√(−α) é a variação da anomalia hiperbólica H: o intervalo vai até
  // H = 700 (cosh e sinh estouram perto de 710; r ~ a·e⁷⁰⁰ está muito além de
  // qualquer trajetória). Chute inicial de Vallado, quando cai no intervalo.
  let lo = dt > 0 ? 0 : -Infinity;
  let hi = dt > 0 ? Infinity : 0;
  let chi = alpha > 1e-12 ? sqrtMu * dt * alpha : (sqrtMu * dt) / r0n;
  if (alpha < -1e-12) {
    const maxChi = 700 / Math.sqrt(-alpha);
    lo = Math.max(lo, -maxChi);
    hi = Math.min(hi, maxChi);
    const a = 1 / alpha;
    const sign = Math.sign(dt);
    const guess = sign * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (rv + sign * Math.sqrt(-mu * a) * (1 - r0n * alpha)));
    chi = guess > lo && guess < hi ? guess : Math.min(Math.max(chi, lo / 2), hi / 2);
  }
  // Bisseção também quando o Newton não encolhe o passo à metade a cada dois
  // (rtsafe, Numerical Recipes): longe da raiz numa hipérbole, F ~ e^H e cada
  // passo de Newton só desce uma unidade de H.
  let step = Infinity;
  let stepBefore = Infinity;
  for (let k = 0; k < 200; k++) {
    const z = alpha * chi * chi;
    const { C, S } = stumpff(z);
    const F = (rv / sqrtMu) * chi * chi * C + (1 - alpha * r0n) * chi * chi * chi * S + r0n * chi - sqrtMu * dt;
    const dF = (rv / sqrtMu) * chi * (1 - z * S) + (1 - alpha * r0n) * chi * chi * C + r0n;
    // Raiz exata: o passo de Newton seria nulo, na borda do intervalo, e cairia na bisseção.
    if (F === 0) break;
    // Estouro numérico (cosh enorme) só acontece com |χ| grande demais.
    if (Number.isNaN(F) ? chi > 0 : F > 0) hi = chi;
    else lo = chi;
    let next = chi - F / dF;
    if (!(next > lo && next < hi) || Math.abs(2 * F) > Math.abs(stepBefore * dF)) {
      next = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : 2 * chi;
    }
    stepBefore = step;
    step = next - chi;
    const done = Math.abs(step) <= 1e-13 * Math.max(1, Math.abs(chi));
    chi = next;
    if (done) break;
  }

  const z = alpha * chi * chi;
  const { C, S } = stumpff(z);
  const f = 1 - ((chi * chi) / r0n) * C;
  const g = dt - ((chi * chi * chi) / sqrtMu) * S;
  const r = add(scale(r0, f), scale(v0, g));
  const rn = norm(r);
  const fDot = (sqrtMu / (rn * r0n)) * (alpha * chi * chi * chi * S - chi);
  const gDot = 1 - ((chi * chi) / rn) * C;
  return { r, v: add(scale(r0, fDot), scale(v0, gDot)) };
}

/**
 * Problema de Lambert: as velocidades da cônica que liga r1 a r2 em `dt`
 * segundos, com menos de uma volta, girando no sentido de `normal` (o norte
 * da eclíptica: prógrado, como os planetas). A variável z da equação de tempo
 * é achada por bisseção.
 */
export function lambert(r1: Vec3, r2: Vec3, dt: number, mu: number, normal: Vec3 = [0, 0, 1]): { v1: Vec3; v2: Vec3 } {
  const r1n = norm(r1);
  const r2n = norm(r2);
  let theta = Math.acos(Math.min(Math.max(dot(r1, r2) / (r1n * r2n), -1), 1));
  if (dot(cross(r1, r2), normal) < 0) theta = 2 * Math.PI - theta;
  const A = Math.sin(theta) * Math.sqrt((r1n * r2n) / (1 - Math.cos(theta)));
  const y = (z: number) => {
    const { C, S } = stumpff(z);
    return r1n + r2n + (A * (z * S - 1)) / Math.sqrt(C);
  };
  // F cresce com z; onde y < 0 a cônica não existe e F conta como negativa.
  const F = (z: number) => {
    const yz = y(z);
    if (yz < 0) return -Infinity;
    const { C, S } = stumpff(z);
    return (yz / C) ** 1.5 * S + A * Math.sqrt(yz) - Math.sqrt(mu) * dt;
  };
  let lo = -100;
  let hi = 4 * Math.PI * Math.PI - 1e-9;
  while (F(lo) > 0 && lo > -1e4) lo *= 2;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (F(mid) < 0) lo = mid;
    else hi = mid;
  }
  const yz = y((lo + hi) / 2);
  const f = 1 - yz / r1n;
  const g = A * Math.sqrt(yz / mu);
  const gDot = 1 - yz / r2n;
  return { v1: scale(sub(r2, scale(r1, f)), 1 / g), v2: scale(sub(scale(r2, gDot), r1), 1 / g) };
}

/**
 * Lambert com `revs` voltas completas antes de chegar (sentido direto). Com
 * N ≥ 1 voltas, z fica em (4π²N², 4π²(N+1)²) e o tempo de voo tem um mínimo
 * no meio: acima dele há duas cônicas, uma de cada lado do mínimo (abaixo,
 * nenhuma). Devolve as soluções encontradas, com o semieixo maior de cada uma.
 */
export function lambertRevs(
  r1: Vec3,
  r2: Vec3,
  dt: number,
  mu: number,
  revs: number,
  normal: Vec3 = [0, 0, 1],
): { v1: Vec3; v2: Vec3; a: number }[] {
  if (revs < 1) {
    const { v1, v2 } = lambert(r1, r2, dt, mu, normal);
    return [{ v1, v2, a: -mu / (2 * specificEnergy({ r: r1, v: v1 }, mu)) }];
  }
  const r1n = norm(r1);
  const r2n = norm(r2);
  let theta = Math.acos(Math.min(Math.max(dot(r1, r2) / (r1n * r2n), -1), 1));
  if (dot(cross(r1, r2), normal) < 0) theta = 2 * Math.PI - theta;
  const A = Math.sin(theta) * Math.sqrt((r1n * r2n) / (1 - Math.cos(theta)));
  const y = (z: number) => {
    const { C, S } = stumpff(z);
    return r1n + r2n + (A * (z * S - 1)) / Math.sqrt(C);
  };
  /** Tempo de voo (s) em função de z; infinito onde a cônica não existe. */
  const tof = (z: number) => {
    const yz = y(z);
    if (!(yz > 0)) return Infinity;
    const { C, S } = stumpff(z);
    return ((yz / C) ** 1.5 * S + A * Math.sqrt(yz)) / Math.sqrt(mu);
  };
  const edge = 1e-9;
  const zLo = (2 * Math.PI * revs) ** 2 + edge;
  const zHi = (2 * Math.PI * (revs + 1)) ** 2 - edge;

  // Mínimo do tempo de voo por seção áurea.
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = zLo;
  let hi = zHi;
  let a = hi - g * (hi - lo);
  let b = lo + g * (hi - lo);
  let ta = tof(a);
  let tb = tof(b);
  for (let k = 0; k < 200; k++) {
    if (ta < tb) {
      hi = b;
      b = a;
      tb = ta;
      a = hi - g * (hi - lo);
      ta = tof(a);
    } else {
      lo = a;
      a = b;
      ta = tb;
      b = lo + g * (hi - lo);
      tb = tof(b);
    }
  }
  const zMin = (lo + hi) / 2;
  if (!(tof(zMin) < dt)) return [];

  /** Raiz de tof(z) = dt num lado do mínimo, onde tof é monótona. */
  const root = (from: number, to: number) => {
    let p = from;
    let q = to;
    for (let k = 0; k < 200; k++) {
      const mid = (p + q) / 2;
      if (tof(mid) > dt) p = mid;
      else q = mid;
    }
    return (p + q) / 2;
  };
  return [root(zLo, zMin), root(zHi, zMin)].map((z) => {
    const yz = y(z);
    const f = 1 - yz / r1n;
    const gg = A * Math.sqrt(yz / mu);
    const gDot = 1 - yz / r2n;
    const v1 = scale(sub(r2, scale(r1, f)), 1 / gg);
    return { v1, v2: scale(sub(scale(r2, gDot), r1), 1 / gg), a: -mu / (2 * specificEnergy({ r: r1, v: v1 }, mu)) };
  });
}

/** Energia específica ε = v²/2 − μ/r: negativa na elipse, positiva na hipérbole. */
export const specificEnergy = ({ r, v }: State, mu: number) => dot(v, v) / 2 - mu / norm(r);

/** Período (s) da elipse de energia ε < 0: T = 2π √(a³/μ), a = −μ/(2ε). */
export function orbitalPeriod(energy: number, mu: number): number {
  const a = -mu / (2 * energy);
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
}

/**
 * A elipse que passa pelo estado, como polígono fechado de `segments` pontos
 * (null para órbitas abertas). Serve para desenhar órbitas de cometas e
 * asteroides a partir de um vetor de estado.
 */
export function conicPolyline({ r, v }: State, mu: number, segments = 128): Vec3[] | null {
  const h = cross(r, v);
  const rn = norm(r);
  const eVec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rn));
  const e = norm(eVec);
  const energy = dot(v, v) / 2 - mu / rn;
  if (energy >= 0 || e >= 1) return null;
  const a = -mu / (2 * energy);
  const p = e > 1e-9 ? scale(eVec, 1 / e) : scale(r, 1 / rn);
  const hn = norm(h);
  const q = cross(scale(h, 1 / hn), p);
  const semiLatus = a * (1 - e * e);
  return Array.from({ length: segments + 1 }, (_, k) => {
    const nu = (2 * Math.PI * k) / segments;
    const radius = semiLatus / (1 + e * Math.cos(nu));
    return add(scale(p, radius * Math.cos(nu)), scale(q, radius * Math.sin(nu)));
  });
}
