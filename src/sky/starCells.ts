/**
 * Estrelas reais (catálogo HYG, V ≤ 6,5) numa grade de células sobre as seis
 * faces de um cubo, lida pelo shader com uma única leitura de textura por
 * pixel. Cada célula guarda a estrela que mais brilha nela: posição (anos-luz,
 * no referencial da nave, relativa à nave no instante da montagem), cor e
 * luminosidade. O shader calcula direção e brilho a partir da posição atual da
 * nave, então a paralaxe e o 1/d² são exatos entre uma montagem e outra.
 */
import { LIGHT_YEAR_M } from '../physics/RelativityEngine';
import { PARSEC_M } from '../physics/destinations';
import { apply, equatorialUnit, length, scale, sub, type Mat3, type Vec3 } from './skyFrame';

export const PARSEC_LY = PARSEC_M / LIGHT_YEAR_M;
/** Estrelas sem paralaxe medida ficam a esta distância (pc). */
const UNKNOWN_DIST_PC = 1000;

/** Células por aresta de cada face do cubo (≈ 0,7° no centro da face). */
export const STAR_CELLS_N = 128;
/** Teto do σ da PSF no referencial de repouso (rad), igual ao do shader. */
export const STAR_SIGMA_MAX = 3e-3;
/** Brilho de exibição abaixo do qual a PSF não aparece na tela. */
const VISIBLE_AMP = 1e-3;
/** Brilho de exibição abaixo do qual a estrela nem entra na grade. */
const MIN_DISPLAY_AMP = 2e-3;

export interface CatalogStar {
  /** Posição heliocêntrica no referencial da nave (anos-luz). */
  readonly position: Vec3;
  /** Brilho aparente a 1 ano-luz, 10^(−0,4·V)·d² (d em anos-luz). */
  readonly luminosity: number;
  readonly temperatureK: number;
}

/** Temperatura de cor pelo índice B−V (Ballesteros, 2012). */
export function bvToTemperature(bv: number): number {
  const b = Math.min(Math.max(bv, -0.4), 2.0);
  return 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
}

/** Brilho de exibição de uma estrela: a escala de magnitudes comprimida para caber na tela (V = 0 → 2,2). */
export const displayAmplitude = (luminosity: number, distLy: number) => 2.2 * (luminosity / (distLy * distLy)) ** 0.8;

/** Halo das estrelas mais brilhantes que V ≈ 2 (multiplica o σ da PSF), igual ao do shader. */
export const starHalo = (amp: number) => 1 + 0.8 * Math.max(0, Math.sqrt(Math.min(amp, 16)) - 0.7);

/** Ângulo (rad) e fração de distância dentro dos quais uma estrela do catálogo é o próprio alvo. */
const TARGET_MATCH = { angle: 1e-3, distance: 0.05 } as const;

/** Partida fora do Sol: a posição da estrela de partida (ICRS, anos-luz) e a luminosidade do Sol, que vira estrela do céu. */
export interface CatalogOrigin {
  readonly positionLy: Vec3;
  readonly sunLuminosity: number;
}

/** Cor do Sol como estrela do céu (B − V = 0,65). */
const SUN_BV = 0.65;

/**
 * Lê o vetor plano do JSON (5 números por estrela) já no referencial da nave, com as posições a partir da
 * estrela de partida. O alvo (Sirius, por exemplo) e a estrela de partida saem do catálogo: o shader os
 * desenha à parte. Partindo de outra estrela, o Sol entra no céu (de Erid, uma estrela de magnitude 3,3).
 */
export function parseCatalog(
  flat: readonly number[],
  icrsToShip: Mat3,
  targetDistanceLy = Infinity,
  origin: CatalogOrigin | null = null,
): CatalogStar[] {
  const stars: CatalogStar[] = [];
  const originLy = origin?.positionLy ?? null;
  const originDistLy = originLy ? length(originLy) : 0;
  for (let i = 0; i + 4 < flat.length; i += 5) {
    const distPc = flat[i + 4]! > 0 ? flat[i + 4]! : UNKNOWN_DIST_PC;
    const distLy = distPc * PARSEC_LY;
    const helio = scale(equatorialUnit(flat[i]!, flat[i + 1]!), distLy);
    const rel = originLy ? sub(helio, originLy) : helio;
    const relLy = length(rel);
    // A própria estrela de partida (a posição do catálogo difere da do destino por arredondamento).
    if (originLy && relLy < TARGET_MATCH.distance * originDistLy) continue;
    const dir = apply(icrsToShip, scale(rel, 1 / relLy));
    const isTarget =
      Math.hypot(dir[0], dir[1]) < TARGET_MATCH.angle &&
      dir[2] < 0 &&
      Math.abs(relLy - targetDistanceLy) < TARGET_MATCH.distance * targetDistanceLy;
    if (isTarget) continue;
    stars.push({
      position: scale(dir, relLy),
      luminosity: 10 ** (-0.4 * flat[i + 2]!) * distLy * distLy,
      temperatureK: bvToTemperature(flat[i + 3]!),
    });
  }
  if (origin && originLy) {
    stars.push({
      position: apply(icrsToShip, scale(originLy, -1)),
      luminosity: origin.sunLuminosity,
      temperatureK: bvToTemperature(SUN_BV),
    });
  }
  return stars;
}

/** Face e coordenadas (u, v ∈ [−1, 1]) de uma direção no cubo, como no shader. */
export function cubeFace(d: Vec3): { face: number; u: number; v: number } {
  const ax = Math.abs(d[0]);
  const ay = Math.abs(d[1]);
  const az = Math.abs(d[2]);
  if (ax >= ay && ax >= az) return { face: d[0] > 0 ? 0 : 1, u: d[1] / ax, v: d[2] / ax };
  if (ay >= az) return { face: d[1] > 0 ? 2 : 3, u: d[0] / ay, v: d[2] / ay };
  return { face: d[2] > 0 ? 4 : 5, u: d[0] / az, v: d[1] / az };
}

/** Empacota temperatura e luminosidade num float32 exato: T/10 · 1024 + 100·(log₁₀L + 2). */
export function packStar(temperatureK: number, luminosity: number): number {
  const t10 = Math.min(Math.max(Math.round(temperatureK / 10), 100), 4000);
  const q = Math.min(Math.max(Math.round((Math.log10(luminosity) + 2) * 100), 0), 1023);
  return t10 * 1024 + q;
}

export interface StarCellsBuild {
  /** RGBA32F: largura N, altura 6N (face f ocupa as linhas f·N a f·N + N − 1). */
  readonly data: Float32Array;
  /** Posição da nave (anos-luz desde a estrela de partida, ao longo de −Z) usada como origem das posições. */
  readonly shipDistanceLy: number;
  /** Distância da estrela mais próxima (anos-luz): decide quando remontar. */
  readonly nearestLy: number;
  readonly starCount: number;
}

/**
 * Monta a grade para a nave a `shipDistanceLy` da estrela de partida rumo ao alvo (−Z).
 * Cada célula fica com a estrela que mais contribui no seu centro.
 */
export function buildStarCells(stars: readonly CatalogStar[], shipDistanceLy: number, n = STAR_CELLS_N): StarCellsBuild {
  const data = new Float32Array(n * 6 * n * 4);
  const score = new Float32Array(n * 6 * n);
  const ship: Vec3 = [0, 0, -shipDistanceLy];
  let nearestLy = Infinity;
  let starCount = 0;
  const cellAngle = 2 / n;

  for (const star of stars) {
    const rel = sub(star.position, ship);
    const dist = length(rel);
    if (!(dist > 0)) continue;
    nearestLy = Math.min(nearestLy, dist);
    const amp = displayAmplitude(star.luminosity, dist);
    if (amp < MIN_DISPLAY_AMP) continue;
    starCount++;
    const dir = scale(rel, 1 / dist);
    const sigma = STAR_SIGMA_MAX * starHalo(amp);
    // Até onde a PSF (no maior σ possível) ainda passa do limiar visível.
    const reach = sigma * Math.sqrt(2 * Math.log(Math.max(amp, VISIBLE_AMP * 1.01) / VISIBLE_AMP));
    const packed = packStar(star.temperatureK, star.luminosity);
    // Todas as faces que a PSF pode tocar (perto das arestas, mais de uma).
    for (let face = 0; face < 6; face++) {
      const axis = face >> 1;
      const sign = face % 2 === 0 ? 1 : -1;
      const along = dir[axis]! * sign;
      if (along <= 0.3) continue;
      const others = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
      const u = dir[others[0]!]! / along;
      const v = dir[others[1]!]! / along;
      if (Math.abs(u) > 1.1 || Math.abs(v) > 1.1) continue;
      const span = Math.ceil((reach / cellAngle) * (1 + u * u + v * v)) + 1;
      const ci = Math.floor(((u + 1) / 2) * n);
      const cj = Math.floor(((v + 1) / 2) * n);
      const cosLimit = Math.cos(reach + cellAngle);
      // Centro da célula (1, cu, cv) na face, normalizado: cos = (along + u·cu + v·cv)/|(1, cu, cv)|, com
      // (along, u·along, v·along) = dir.
      for (let j = Math.max(0, cj - span); j <= Math.min(n - 1, cj + span); j++) {
        const cv = ((j + 0.5) / n) * 2 - 1;
        for (let i = Math.max(0, ci - span); i <= Math.min(n - 1, ci + span); i++) {
          const cu = ((i + 0.5) / n) * 2 - 1;
          const cos = (along * (1 + u * cu + v * cv)) / Math.sqrt(1 + cu * cu + cv * cv);
          if (cos <= cosLimit) continue;
          const sin2 = Math.max(0, 1 - cos * cos);
          const s = amp * Math.exp((-0.5 * sin2) / (sigma * sigma));
          const cell = (face * n + j) * n + i;
          if (s <= score[cell]!) continue;
          score[cell] = s;
          data[cell * 4] = rel[0];
          data[cell * 4 + 1] = rel[1];
          data[cell * 4 + 2] = rel[2];
          data[cell * 4 + 3] = packed;
        }
      }
    }
  }
  return { data, shipDistanceLy, nearestLy, starCount };
}

/** A nave andou o bastante para a paralaxe mudar a dona de alguma célula? */
export function needsRebuild(build: StarCellsBuild, shipDistanceLy: number): boolean {
  return Math.abs(shipDistanceLy - build.shipDistanceLy) > 0.002 * build.nearestLy;
}
