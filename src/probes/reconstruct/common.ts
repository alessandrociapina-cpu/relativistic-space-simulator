/**
 * Peças das reconstruções feitas fora do app (`scripts/reconstruct.mjs`):
 * trechos de cônica, manobras instantâneas, hipérboles de sobrevoo e de
 * captura, e a conversão para o formato das tabelas do JPL Horizons que o
 * app lê (`ProbeData`). As tabelas são enxugadas com a mesma interpolação do
 * app (Kepler + correção de Hermite), como faz `scripts/fetch-horizons.mjs`.
 *
 * Unidades internas: km, km/s, tempo em dias desde J2000 (TDB ≈ UTC).
 */
import { propagate, type State } from '../kepler';
import { add, cross, dot, norm, scale, sub, type Vec3 } from '../vec3';

export const AU_KM = 149_597_870.7;
export const DAY_S = 86_400;
/** Separação entre as duas amostras de uma manobra instantânea (dias, ~0,09 s). */
export const BURN_EPS = 1e-6;

/**
 * Convenção das manobras: o estado depois da queima é o do instante t, mas a
 * amostra fica em t + BURN_EPS (duas amostras não podem ter o mesmo instante).
 * Aqui ele é propagado esse ~0,09 s, para a tabela ficar coerente: na
 * interpolação, a diferença de velocidade entre uma amostra e a cônica que
 * chega a ela é multiplicada pela duração do trecho, e num trecho de anos
 * 10⁻⁶ km/s já viram dezenas de km.
 */
export function settleBurns(rows: readonly Sample[], mu: number): Sample[] {
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    return prev && r.t - prev.t < 1.5 * BURN_EPS ? sample(r.t, coast(r, prev.t, r.t, mu)) : r;
  });
}

/** Amostra de uma trajetória: instante (dias desde J2000), posição (km) e velocidade (km/s). */
export interface Sample {
  readonly t: number;
  readonly r: Vec3;
  readonly v: Vec3;
}

export const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));
/** Componente de `v` perpendicular ao unitário `n`, normalizada. */
export const perpendicular = (v: Vec3, n: Vec3): Vec3 => unit(sub(v, scale(n, dot(v, n))));

/** Gira `v` em torno do eixo unitário `axis` por `angle` (fórmula de Rodrigues). */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Dois unitários perpendiculares a `n` (base do plano normal). */
export function basisAround(n: Vec3): [Vec3, Vec3] {
  const hint: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = perpendicular(hint, n);
  return [e1, cross(n, e1)];
}

/** Estado propagado na cônica em torno de μ (km³/s²) de `t0` para `t1` (dias). */
export const coast = (s: State, t0: number, t1: number, mu: number): State => propagate(s, (t1 - t0) * DAY_S, mu);

export const sample = (t: number, s: State): Sample => ({ t, r: s.r, v: s.v });

/** Período (s) da órbita de semieixo `a` (km). */
export const periodOf = (a: number, mu: number) => 2 * Math.PI * Math.sqrt((a * a * a) / mu);
/** Semieixo (km) da órbita de período `p` (s). */
export const semiMajorFor = (p: number, mu: number) => Math.cbrt(mu * (p / (2 * Math.PI)) ** 2);

/** Velocidade no raio `r` de uma órbita de semieixo `a` (vis-viva; a < 0 na hipérbole). */
export const visViva = (r: number, a: number, mu: number) => Math.sqrt(mu * (2 / r - 1 / a));

// ── Interpolação e enxugamento (iguais aos do app) ───────────────────────────

/** Estado interpolado como em `ephemeris.ts`: Kepler a partir da amostra anterior, corrigido para chegar à seguinte. */
export function interpolate(samples: readonly Sample[], t: number, mu: number): State {
  const last = samples.length - 1;
  if (last === 0 || t <= samples[0]!.t || t >= samples[last]!.t) {
    const a = last === 0 || t <= samples[0]!.t ? samples[0]! : samples[last]!;
    return coast(a, a.t, t, mu);
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  return blend(samples[lo]!, samples[lo + 1]!, t, mu);
}

function blend(a: Sample, b: Sample, t: number, mu: number, end: State = coast(a, a.t, b.t, mu)): State {
  const h = (b.t - a.t) * DAY_S;
  const u = (t - a.t) / (b.t - a.t);
  const p = coast(a, a.t, t, mu);
  const dr = sub(b.r, end.r);
  const dv = sub(b.v, end.v);
  const h01 = u * u * (3 - 2 * u);
  const h11 = u * u * (u - 1) * h;
  const d01 = (6 * u * (1 - u)) / h;
  const d11 = u * (3 * u - 2);
  return { r: add(p.r, add(scale(dr, h01), scale(dv, h11))), v: add(p.v, add(scale(dr, d01), scale(dv, d11))) };
}

/**
 * Mantém só as amostras de que a interpolação precisa para errar menos de
 * `tolKm` nos pontos descartados (crescimento em passos dobrados e bisseção,
 * como no script do Horizons).
 */
export function decimate(rows: readonly Sample[], tolKm: number, mu: number): Sample[] {
  const fits = (i: number, j: number) => {
    const end = coast(rows[i]!, rows[i]!.t, rows[j]!.t, mu);
    for (let k = i + 1; k < j; k++) {
      const p = blend(rows[i]!, rows[j]!, rows[k]!.t, mu, end);
      if (norm(sub(p.r, rows[k]!.r)) > tolKm) return false;
    }
    return true;
  };
  const last = rows.length - 1;
  const kept = [rows[0]!];
  let i = 0;
  while (i < last) {
    let good = i + 1;
    let bad = -1;
    for (let span = 2; ; span *= 2) {
      const j = Math.min(i + span, last);
      if (!fits(i, j)) {
        bad = j;
        break;
      }
      good = j;
      if (j === last) break;
    }
    while (bad > 0 && bad - good > 1) {
      const mid = (good + bad) >> 1;
      if (fits(i, mid)) good = mid;
      else bad = mid;
    }
    kept.push(rows[good]!);
    i = good;
  }
  return kept;
}

/** Ordena e tira repetidas (mesmo instante). */
export function sortSamples(rows: readonly Sample[]): Sample[] {
  return [...rows].sort((a, b) => a.t - b.t).filter((r, i, all) => i === 0 || r.t - all[i - 1]!.t > 1e-9);
}

// ── Formato dos JSON do app ──────────────────────────────────────────────────

export interface PackedWindow {
  readonly body: string;
  readonly kind?: string;
  readonly departure?: boolean;
  readonly ramp?: readonly number[];
  readonly gm?: number;
  readonly site?: readonly number[];
  readonly units?: 'km';
  readonly t: readonly number[];
  readonly s: readonly number[];
}

/** Tabela heliocêntrica em UA e UA/dia (como as do Horizons); `mu` é o GM do Sol (km³/s²). */
export function packHelio(rows: readonly Sample[], mu: number): { t: number[]; s: number[] } {
  const kms = AU_KM / DAY_S;
  const settled = settleBurns(sortSamples(rows), mu);
  return {
    t: settled.map((r) => Number(r.t.toFixed(7))),
    s: settled.flatMap((r) => [...r.r.map((x) => Number((x / AU_KM).toPrecision(14))), ...r.v.map((x) => Number((x / kms).toPrecision(14)))]),
  };
}

/**
 * Casas decimais de posição (km) e velocidade (km/s): metro e 0,1 mm/s. Numa
 * órbita baixa, 1 km de arredondamento perto do periapse já muda o período em
 * ~0,1% e a sonda escorrega centenas de km por volta; com 1 m, ~0,2 km por volta.
 */
const decimalsFor = (_tolKm: number): [number, number] => [3, 7];

/** A amostra como ela fica no JSON. */
function rounded(r: Sample, tolKm: number): Sample {
  const [p, v] = decimalsFor(tolKm);
  const round = (x: number, d: number) => Number(x.toFixed(d));
  return {
    t: Number(r.t.toFixed(7)),
    r: r.r.map((x) => round(x, p)) as unknown as Vec3,
    v: r.v.map((x) => round(x, v)) as unknown as Vec3,
  };
}

/** Janela relativa em km e km/s, com as casas decimais que a tolerância pede. */
export function packKm(rows: readonly Sample[], tolKm: number): { units: 'km'; t: number[]; s: number[] } {
  const kept = rows.map((r) => rounded(r, tolKm));
  return { units: 'km', t: kept.map((r) => r.t), s: kept.flatMap((r) => [...r.r, ...r.v]) };
}

/**
 * Pontos de controle a cada `maxGapDays` entre amostras distantes, seguindo a
 * própria interpolação (numa cônica, a órbita exata). Sem eles, uma órbita de
 * anos guardada por duas amostras acumularia o erro do arredondamento em
 * centenas de voltas sem que o enxugamento visse.
 */
function densify(rows: readonly Sample[], mu: number, maxGapDays: number): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!;
    out.push(a);
    const b = rows[i + 1];
    // Numa elipse, pelo menos 8 pontos por volta: o erro de fase aparece no meio da volta.
    const inverseA = mu > 0 ? 2 / norm(a.r) - dot(a.v, a.v) / mu : 0;
    const gap = inverseA > 0 ? Math.min(maxGapDays, periodOf(1 / inverseA, mu) / DAY_S / 8) : maxGapDays;
    if (!b || b.t - a.t <= gap) continue;
    const n = Math.ceil((b.t - a.t) / gap);
    for (let k = 1; k < n; k++) {
      const t = a.t + ((b.t - a.t) * k) / n;
      out.push(sample(t, blend(a, b, t, mu)));
    }
  }
  return out;
}

export interface WindowSpec {
  readonly body: string;
  readonly kind: 'departure' | 'flyby' | 'orbit';
  readonly samples: readonly Sample[];
  /** GM da interpolação (km³/s²): o do corpo, ou 0 nas descidas freadas. */
  readonly mu: number;
  readonly tolKm: number;
  readonly ramp: readonly [number, number];
  /** GM gravado no JSON quando difere do corpo (descidas). */
  readonly gmOverride?: number;
}

export function packWindow(w: WindowSpec): PackedWindow {
  // O enxugamento trabalha com os números já arredondados como no JSON, e com pontos de controle.
  const truth = densify(settleBurns(sortSamples(w.samples), w.mu), w.mu, 2).map((r) => rounded(r, w.tolKm));
  const kept = decimate(truth, w.tolKm, w.mu);
  return {
    body: w.body,
    kind: w.kind,
    ...(w.kind === 'departure' ? { departure: true } : {}),
    ramp: [Number(w.ramp[0].toFixed(6)), Number(w.ramp[1].toFixed(6))],
    ...(w.gmOverride !== undefined ? { gm: w.gmOverride } : {}),
    ...packKm(kept, w.tolKm),
  };
}

/** Pouso: ponto da superfície que gira com o corpo, de `start` a `end`. */
export const surfaceWindow = (body: string, latDeg: number, lonDeg: number, start: number, end: number): PackedWindow => ({
  body,
  kind: 'surface',
  site: [latDeg, lonDeg],
  t: [Number(start.toFixed(7)), Number(end.toFixed(7))],
  s: [],
});

// ── Hipérboles ───────────────────────────────────────────────────────────────

/** Meia deflexão de uma hipérbole: sin(δ/2) = 1/e, e = 1 + r_p v∞²/μ. */
export const halfDeflection = (vInf: number, rp: number, mu: number) => Math.asin(1 / (1 + (rp * vInf * vInf) / mu));

export interface FlybyGeometry {
  /** Raio do periapse (km). */
  readonly rp: number;
  /** Periapse e velocidades de chegada e de saída nele (km/s). */
  readonly r: Vec3;
  readonly vIn: Vec3;
  readonly vOut: Vec3;
  /** Diferença entre as velocidades no periapse: a manobra que a reconstrução precisa (0 num sobrevoo balístico perfeito). */
  readonly deltaV: number;
  /** Deflexão total (graus). */
  readonly deflectionDeg: number;
}

/**
 * Hipérbole de sobrevoo que liga v∞ de chegada a v∞ de saída (vetores, km/s):
 * o periapse sai da deflexão, δ = δ_in/2 + δ_out/2. Com módulos diferentes,
 * cada metade é uma hipérbole com o seu v∞ e o mesmo periapse, e a diferença
 * de velocidade nele é a correção que a rota precisaria.
 */
export function flybyFromVInf(vInfIn: Vec3, vInfOut: Vec3, mu: number): FlybyGeometry {
  const a = norm(vInfIn);
  const b = norm(vInfOut);
  const sIn = unit(vInfIn);
  const sOut = unit(vInfOut);
  const delta = Math.atan2(norm(cross(sIn, sOut)), dot(sIn, sOut));
  let lo = 1e-3;
  let hi = 1e10;
  for (let k = 0; k < 200; k++) {
    const mid = Math.sqrt(lo * hi);
    if (halfDeflection(a, mid, mu) + halfDeflection(b, mid, mu) > delta) lo = mid;
    else hi = mid;
  }
  const rp = Math.sqrt(lo * hi);
  return flybyWithPeriapsis(vInfIn, vInfOut, rp, mu);
}

/** Geometria de sobrevoo com periapse `rp` dado, no plano de v∞_in e v∞_out. */
export function flybyWithPeriapsis(vInfIn: Vec3, vInfOut: Vec3, rp: number, mu: number): FlybyGeometry {
  const sIn = unit(vInfIn);
  const sOut = unit(vInfOut);
  const n = unit(cross(sIn, sOut));
  const q = rotate(sIn, n, halfDeflection(norm(vInfIn), rp, mu));
  const p = cross(q, n);
  const vpIn = Math.sqrt(dot(vInfIn, vInfIn) + (2 * mu) / rp);
  const vpOut = Math.sqrt(dot(vInfOut, vInfOut) + (2 * mu) / rp);
  return {
    rp,
    r: scale(p, rp),
    vIn: scale(q, vpIn),
    vOut: scale(q, vpOut),
    deltaV: Math.abs(vpOut - vpIn),
    deflectionDeg: (Math.atan2(norm(cross(sIn, sOut)), dot(sIn, sOut)) * 180) / Math.PI,
  };
}

/**
 * v∞ de saída de um sobrevoo balístico com periapse `rp`: v∞_in girado pela
 * deflexão em torno do eixo de ângulo `theta` no plano B (perpendicular a v∞_in).
 */
export function outgoingVInf(vInfIn: Vec3, rp: number, mu: number, theta: number): Vec3 {
  const s = unit(vInfIn);
  const [e1, e2] = basisAround(s);
  const axis = add(scale(e1, Math.cos(theta)), scale(e2, Math.sin(theta)));
  return rotate(vInfIn, axis, 2 * halfDeflection(norm(vInfIn), rp, mu));
}

/**
 * Periapse (km, km/s) da hipérbole de chegada com v∞ `vInfIn`, raio `rp` e
 * normal da órbita `normal` (unitária, perpendicular a v∞).
 */
export function arrivalPeriapsis(vInfIn: Vec3, rp: number, mu: number, normal: Vec3): State {
  const q = rotate(unit(vInfIn), normal, halfDeflection(norm(vInfIn), rp, mu));
  const p = cross(q, normal);
  return { r: scale(p, rp), v: scale(q, Math.sqrt(dot(vInfIn, vInfIn) + (2 * mu) / rp)) };
}

/**
 * Periapse da hipérbole de partida (saída ao longo de v∞) a partir de uma
 * órbita de estacionamento de raio `rp`, com a normal `normal` (⟂ v∞).
 */
export function departurePeriapsis(vInfOut: Vec3, rp: number, mu: number, normal: Vec3): State {
  const q = rotate(unit(vInfOut), normal, -halfDeflection(norm(vInfOut), rp, mu));
  const p = cross(q, normal);
  return { r: scale(p, rp), v: scale(q, Math.sqrt(dot(vInfOut, vInfOut) + (2 * mu) / rp)) };
}

/** Normal ⟂ `s` mais próxima da direção `hint` (o norte da eclíptica, por padrão). */
export const normalNear = (s: Vec3, hint: Vec3 = [0, 0, 1]): Vec3 =>
  Math.abs(dot(unit(hint), unit(s))) > 0.999 ? perpendicular([1, 0, 0], unit(s)) : perpendicular(hint, unit(s));

/**
 * Normais ⟂ `s` com inclinação `iDeg` em relação ao polo `pole` (0, 1 ou 2
 * soluções): n = cos θ e1 + sin θ e2 com n·polo = cos i.
 */
export function normalsWithInclination(s: Vec3, pole: Vec3, iDeg: number): Vec3[] {
  const [e1, e2] = basisAround(unit(s));
  const A = dot(e1, pole);
  const B = dot(e2, pole);
  const amp = Math.hypot(A, B);
  const c = Math.cos((iDeg * Math.PI) / 180);
  if (amp < Math.abs(c)) return [];
  const theta0 = Math.atan2(B, A);
  const d = Math.acos(c / amp);
  return [theta0 + d, theta0 - d].map((th) => add(scale(e1, Math.cos(th)), scale(e2, Math.sin(th))));
}

/** Busca o mínimo de f em [lo, hi]: varredura em `n` pontos e refinamento por seção áurea. */
export function minimize(f: (x: number) => number, lo: number, hi: number, n = 360): number {
  let best = lo;
  let bestF = Infinity;
  for (let k = 0; k <= n; k++) {
    const x = lo + ((hi - lo) * k) / n;
    const fx = f(x);
    if (fx < bestF) {
      bestF = fx;
      best = x;
    }
  }
  const step = (hi - lo) / n;
  let a = best - step;
  let b = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let k = 0; k < 100; k++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** Raiz de f em [lo, hi] por bisseção (f(lo) e f(hi) de sinais opostos). */
export function bisect(f: (x: number) => number, lo: number, hi: number, iterations = 100): number {
  let flo = f(lo);
  for (let k = 0; k < iterations; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

export const deg = (rad: number) => (rad * 180) / Math.PI;
export const round = (x: number, digits = 3) => Number(x.toFixed(digits));
