/**
 * Galáxias reais (OpenNGC, B ≤ 12,5) numa grade de células sobre as seis faces de um cubo, como as estrelas
 * (`starCells.ts`), lida pelo shader com quatro leituras de textura por pixel. Cada célula guarda as duas
 * galáxias que mais brilham nela (num aglomerado, uma só deixaria a mancha da vizinha cortada na borda da
 * célula): posição (anos-luz, no referencial da nave, relativa à nave na montagem), brilho, tamanho e cor. O shader desenha uma mancha com o tamanho aparente de agora (o raio físico dividido pela distância),
 * então a paralaxe, o tamanho e o 1/d² ficam exatos entre uma montagem e outra.
 *
 * Fora da galáxia, a própria Via Láctea entra na grade como galáxia (a ~26 700 anos-luz do Sol, rumo a Sgr
 * A*): dentro dela, o modelo do brilho difuso (`galaxyModel.ts`) a desenha.
 */
import { DESTINATIONS, type Destination } from '../physics/destinations';
import { PARSEC_LY, STAR_SIGMA_MAX, cubeFace, displayAmplitude } from './starCells';
import { apply, equatorialUnit, length, scale, sub, type Mat3, type Vec3 } from './skyFrame';

/** Células por aresta de cada face do cubo (≈ 1,8° no centro da face). */
export const GALAXY_CELLS_N = 64;
/** Galáxias guardadas em cada célula, e texels por galáxia (posição e brilho; σ físico e cor). */
export const GALAXY_SLOTS = 2;
const TEXELS_PER_SLOT = 2;
/** Brilho de exibição abaixo do qual a mancha não aparece na tela (o mesmo limiar das estrelas). */
const VISIBLE_AMP = 1e-3;
const MPC_LY = 1e6 * PARSEC_LY;
const ARCMIN = Math.PI / (180 * 60);
/** O desvio-padrão da mancha é um terço do raio D25 (a isofota de 25 mag/″², nas bordas da galáxia). */
const SIGMA_PER_RADIUS = 1 / 3;

/** A Via Láctea vista de fora: M_V ≈ −20,9 e disco de ~30 kpc (raio D25 de ~15 kpc). */
const MILKY_WAY = { absMagV: -20.9, radiusKpc: 15, temperatureK: 5800 } as const;
/** Dentro deste raio (anos-luz, em torno do centro galáctico), a Via Láctea é o brilho difuso do modelo. */
export const MILKY_WAY_INSIDE_LY = 300_000;
/** O centro galáctico (Sgr A*) em ICRS, anos-luz: a Via Láctea vista de fora. */
export const GALACTIC_CENTER_ICRS_LY = scale(
  equatorialUnit(DESTINATIONS.sgrA.raDeg, DESTINATIONS.sgrA.decDeg),
  DESTINATIONS.sgrA.distanceLy,
);
/** O nome da própria Via Láctea na grade (e no rótulo do telescópio). */
export const MILKY_WAY_NAME = 'Via Láctea';

export interface CatalogGalaxy {
  readonly name: string;
  /** Posição heliocêntrica no referencial da nave (anos-luz). */
  readonly position: Vec3;
  /** Brilho aparente a 1 ano-luz, 10^(−0,4·V)·d² (d em anos-luz), como o das estrelas. */
  readonly luminosity: number;
  /** Desvio-padrão físico da mancha (anos-luz): o raio D25 sobre 3. */
  readonly sigmaLy: number;
  readonly temperatureK: number;
}

export interface GalaxyCatalogJson {
  readonly names: readonly string[];
  readonly galaxies: readonly number[];
  /** Rótulos das galáxias com número de Messier ou nome popular, pelo nome do OpenNGC. */
  readonly labels?: Readonly<Record<string, string>>;
}

/** Ângulo (rad) e fração de distância dentro dos quais uma galáxia do catálogo é o próprio alvo (Andrômeda, M87). */
const TARGET_MATCH = { angle: 0.01, distance: 0.3 } as const;

/**
 * As galáxias do catálogo no referencial da nave, a partir da estrela de partida, mais a Via Láctea. A
 * galáxia que é o alvo da viagem sai: o shader a desenha à parte.
 */
export function parseGalaxies(
  json: GalaxyCatalogJson,
  icrsToShip: Mat3,
  destination: Pick<Destination, 'kind' | 'distanceLy'>,
  originLy: Vec3 = [0, 0, 0],
  galacticCenterIcrsLy?: Vec3,
): CatalogGalaxy[] {
  const out: CatalogGalaxy[] = [];
  const flat = json.galaxies;
  for (let i = 0, k = 0; i + 5 < flat.length; i += 6, k++) {
    const distLy = flat[i + 2]! * MPC_LY;
    const rel = sub(scale(equatorialUnit(flat[i]!, flat[i + 1]!), distLy), originLy);
    const relLy = length(rel);
    const dir = apply(icrsToShip, scale(rel, 1 / relLy));
    const isTarget =
      destination.kind === 'galaxy' &&
      Math.hypot(dir[0], dir[1]) < TARGET_MATCH.angle &&
      dir[2] < 0 &&
      Math.abs(relLy - destination.distanceLy) < TARGET_MATCH.distance * destination.distanceLy;
    if (isTarget) continue;
    out.push({
      name: json.names[k]!,
      position: scale(dir, relLy),
      luminosity: 10 ** (-0.4 * flat[i + 3]!) * distLy * distLy,
      // O diâmetro maior (′) vezes a distância dá o raio D25 físico.
      sigmaLy: ((flat[i + 4]! * ARCMIN) / 2) * distLy * SIGMA_PER_RADIUS,
      temperatureK: flat[i + 5]!,
    });
  }
  if (galacticCenterIcrsLy) {
    const rel = sub(galacticCenterIcrsLy, originLy);
    out.push({
      name: MILKY_WAY_NAME,
      position: apply(icrsToShip, rel),
      luminosity: 10 ** (-0.4 * MILKY_WAY.absMagV) * (10 * PARSEC_LY) ** 2,
      sigmaLy: MILKY_WAY.radiusKpc * 1000 * PARSEC_LY * SIGMA_PER_RADIUS,
      temperatureK: MILKY_WAY.temperatureK,
    });
  }
  return out;
}

/**
 * Brilho de pico da mancha de uma galáxia, para um σ de PSF `sigmaPsf` (rad): o da estrela de mesmo brilho
 * total, dividido pelo alargamento σ_eff/σ_PSF (não pelo quadrado, que conservaria o fluxo: as galáxias
 * grandes, como as Nuvens de Magalhães, sumiriam numa tela de brilho comprimido). Igual ao do shader.
 */
export function galaxyPeak(amp: number, sigmaRad: number, sigmaPsf: number): { readonly peak: number; readonly sigmaEff: number } {
  const sigmaEff = Math.hypot(sigmaPsf, sigmaRad);
  return { peak: (amp * sigmaPsf) / sigmaEff, sigmaEff };
}

export interface GalaxyCellsBuild {
  /** RGBA32F: largura 4N (duas galáxias de dois texels por célula), altura 6N (face f nas linhas f·N a f·N + N − 1). */
  readonly data: Float32Array;
  /** Posição da nave (anos-luz desde a estrela de partida, ao longo de −Z) usada como origem das posições. */
  readonly shipDistanceLy: number;
  /** Distância da galáxia mais próxima (anos-luz): decide quando remontar. */
  readonly nearestLy: number;
  readonly galaxyCount: number;
}

/**
 * Monta a grade para a nave a `shipDistanceLy` da estrela de partida rumo ao alvo (−Z). Cada célula fica
 * com a galáxia que mais contribui no seu centro (no maior σ de PSF possível, o de pior caso). A Via Láctea
 * só entra fora dela, a mais de `MILKY_WAY_INSIDE_LY` do centro galáctico.
 */
export function buildGalaxyCells(galaxies: readonly CatalogGalaxy[], shipDistanceLy: number, n = GALAXY_CELLS_N): GalaxyCellsBuild {
  const width = GALAXY_SLOTS * TEXELS_PER_SLOT * n;
  const data = new Float32Array(width * 6 * n * 4);
  // A contribuição de cada galáxia guardada, por célula e posição (a melhor primeiro).
  const score = new Float32Array(n * 6 * n * GALAXY_SLOTS);
  const ship: Vec3 = [0, 0, -shipDistanceLy];
  let nearestLy = Infinity;
  let galaxyCount = 0;
  const cellAngle = 2 / n;

  for (const galaxy of galaxies) {
    const rel = sub(galaxy.position, ship);
    const dist = length(rel);
    if (!(dist > 0)) continue;
    if (galaxy.name === MILKY_WAY_NAME && dist < MILKY_WAY_INSIDE_LY) continue;
    nearestLy = Math.min(nearestLy, dist);
    const amp = displayAmplitude(galaxy.luminosity, dist);
    const sigmaRad = galaxy.sigmaLy / dist;
    const { peak, sigmaEff } = galaxyPeak(amp, sigmaRad, STAR_SIGMA_MAX);
    if (peak < VISIBLE_AMP * 1.01) continue;
    galaxyCount++;
    const dir = scale(rel, 1 / dist);
    // Até onde a mancha (no maior σ de PSF) ainda passa do limiar visível.
    const reach = sigmaEff * Math.sqrt(2 * Math.log(peak / VISIBLE_AMP));
    for (let face = 0; face < 6; face++) {
      const axis = face >> 1;
      const sign = face % 2 === 0 ? 1 : -1;
      const along = dir[axis]! * sign;
      if (along <= Math.cos(Math.min(Math.PI / 2, reach + 0.96))) continue;
      const others = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
      const u = dir[others[0]!]! / along;
      const v = dir[others[1]!]! / along;
      const span = Math.min(n, Math.ceil((reach / cellAngle) * (1 + u * u + v * v)) + 1);
      const ci = Math.min(Math.max(Math.floor(((u + 1) / 2) * n), 0), n - 1);
      const cj = Math.min(Math.max(Math.floor(((v + 1) / 2) * n), 0), n - 1);
      const cosLimit = Math.cos(reach + cellAngle);
      for (let j = Math.max(0, cj - span); j <= Math.min(n - 1, cj + span); j++) {
        const cv = ((j + 0.5) / n) * 2 - 1;
        for (let i = Math.max(0, ci - span); i <= Math.min(n - 1, ci + span); i++) {
          const cu = ((i + 0.5) / n) * 2 - 1;
          const cos = (along * (1 + u * cu + v * cv)) / Math.sqrt(1 + cu * cu + cv * cv);
          if (cos <= cosLimit) continue;
          const sin2 = Math.max(0, 1 - cos * cos);
          const s = peak * Math.exp((-0.5 * sin2) / (sigmaEff * sigmaEff));
          const cell = (face * n + j) * n + i;
          const k = cell * GALAXY_SLOTS;
          if (s <= score[k + 1]!) continue;
          // Os texels da célula, lado a lado: as duas galáxias, cada uma com posição e brilho; σ físico e cor.
          const a = ((face * n + j) * width + GALAXY_SLOTS * TEXELS_PER_SLOT * i) * 4;
          const slot = TEXELS_PER_SLOT * 4;
          let at = a + slot;
          if (s > score[k]!) {
            // A nova é a melhor: a que estava em primeiro passa para o segundo lugar.
            data.copyWithin(a + slot, a, a + slot);
            score[k + 1] = score[k]!;
            score[k] = s;
            at = a;
          } else score[k + 1] = s;
          data[at] = rel[0];
          data[at + 1] = rel[1];
          data[at + 2] = rel[2];
          data[at + 3] = galaxy.luminosity;
          data[at + 4] = galaxy.sigmaLy;
          data[at + 5] = galaxy.temperatureK;
          data[at + 6] = 0;
          data[at + 7] = 0;
        }
      }
    }
  }
  return { data, shipDistanceLy, nearestLy, galaxyCount };
}

/** A nave andou o bastante para a paralaxe mudar a dona de alguma célula? */
export function needsGalaxyRebuild(build: GalaxyCellsBuild, shipDistanceLy: number): boolean {
  return Math.abs(shipDistanceLy - build.shipDistanceLy) > 0.01 * build.nearestLy;
}

/** A face e a célula de uma direção, como no shader (para os testes). */
export function galaxyCellOf(dir: Vec3, n = GALAXY_CELLS_N): number {
  const { face, u, v } = cubeFace(dir);
  const i = Math.min(Math.floor(((u + 1) / 2) * n), n - 1);
  const j = Math.min(Math.floor(((v + 1) / 2) * n), n - 1);
  return (face * n + j) * n + i;
}
