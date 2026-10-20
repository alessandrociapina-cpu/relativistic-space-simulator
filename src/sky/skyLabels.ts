/**
 * Rótulos dos objetos reais no telescópio: as estrelas com nome próprio do catálogo HYG, as galáxias com número
 * de Messier ou nome popular (OpenNGC), a Via Láctea vista de fora, o alvo e a estrela de partida. Cada rótulo
 * acompanha o objeto pela mesma física do shader, em 64 bits: a direção de origem pela posição da nave (paralaxe),
 * a aberração tan(θ'/2) = e^(−η)·tan(θ/2), que preserva o azimute em torno do eixo de voo, e o brilho do
 * instante (Doppler, beaming, diluição pela PSF e o sensor), para rotular só o que aparece na tela.
 */
import type { FlightState } from '../physics/RelativityEngine';
import type { Destination } from '../physics/destinations';
import { ORIGINS, originLuminosity, originPositionLy, type Origin } from '../physics/origins';
import { sensorLuminance } from '../physics/sensorResponse';
import galaxyCatalog from './data/galaxies.json';
import namedStarCatalog from './data/named-stars.json';
import { GALACTIC_CENTER_ICRS_LY, MILKY_WAY_INSIDE_LY, MILKY_WAY_NAME, parseGalaxies } from './galaxyCells';
import { skyFrameFor, type Vec3 } from './skyFrame';
import { STAR_SIGMA_MAX, displayAmplitude, parseNamedStars } from './starCells';

export type SkyLabelKind = 'star' | 'galaxy' | 'target' | 'origin';

export interface SkyLabelSource {
  readonly name: string;
  readonly kind: 'star' | 'galaxy';
  /** Posição no referencial da nave (alvo em −Z), a partir da estrela de partida (anos-luz). */
  readonly position: Vec3;
  /** Brilho aparente a 1 ano-luz, 10^(−0,4·V)·d², como no catálogo. */
  readonly luminosity: number;
  readonly temperatureK: number;
  /** σ físico da mancha de uma galáxia (anos-luz); 0 nas estrelas. */
  readonly sigmaLy: number;
  /** Só aparece a partir desta distância (a Via Láctea, vista de fora). */
  readonly minDistanceLy?: number;
}

/** O instrumento: direção, tela e exposição, como o shader os usa no mesmo quadro. */
export interface SkyView {
  readonly direction: 'front' | 'rear';
  /** Tamanho da tela em pixels CSS. */
  readonly widthPx: number;
  readonly heightPx: number;
  readonly tanHalfFovX: number;
  readonly tanHalfFovY: number;
  /** σ da PSF: o ângulo de um pixel do buffer (rad). */
  readonly psfAngleRad: number;
  readonly exposure: number;
  readonly backgroundGain: number;
  readonly sensorMode: number;
}

/** Um objeto fixo no eixo de voo: o alvo, no centro da vista da frente, ou a estrela de partida, no da de trás. */
export interface PinnedLabel {
  readonly name: string;
  readonly kind: 'target' | 'origin';
}

export interface SkyLabel {
  readonly name: string;
  readonly kind: SkyLabelKind;
  /** Posição do objeto na tela (pixels CSS a partir do canto superior esquerdo). */
  readonly x: number;
  readonly y: number;
  /** O nome vai à esquerda do marcador (perto da borda direita). */
  readonly flip: boolean;
}

/** Brilho linear (antes do tone mapping) a partir do qual o objeto é um ponto visível na tela. */
export const LABEL_MIN_BRIGHTNESS = 0.05;
/** Largura aproximada de um caractere do rótulo (px, fonte monoespaçada de 9 px), o fundo e a altura da linha. */
const CHAR_PX = 5;
const TEXT_PAD_PX = 4;
const LINE_PX = 11;
/** Do centro do marcador ao começo do nome. */
const TEXT_GAP_PX = 7;
const MARKER_PX = 9;

type Kinematics = Pick<FlightState, 'eta' | 'gamma' | 'beta' | 'oneMinusBeta'>;

/**
 * Onde a nave vê um objeto na posição relativa `rel`: tan(θ'/2) (θ' a partir do eixo de voo, −Z), o azimute
 * em torno do eixo e o Doppler D = γ(1 + β cos θ). Os dois hemisférios sem cancelamento: na frente,
 * tan(θ/2) = ρ/(1 − z); atrás, (1 + z)/ρ, e 1 − βz = δ + βρ²/(1 + z).
 */
export function aberrate(rel: Vec3, k: Kinematics) {
  const r = Math.hypot(rel[0], rel[1], rel[2]);
  const x = rel[0] / r;
  const y = rel[1] / r;
  const z = rel[2] / r;
  const rho = Math.hypot(x, y);
  const tanHalfSource = z <= 0 ? rho / (1 - z) : (1 + z) / rho;
  const oneMinusBetaZ = z <= 0 ? 1 - k.beta * z : k.oneMinusBeta + (k.beta * rho * rho) / (1 + z);
  return {
    distanceLy: r,
    tanHalf: Math.exp(-k.eta) * tanHalfSource,
    cosPhi: rho > 0 ? x / rho : 1,
    sinPhi: rho > 0 ? y / rho : 0,
    doppler: k.gamma * oneMinusBetaZ,
  };
}

/** A posição na tela (NDC, −1 a 1) de uma direção observada; `null` fora do hemisfério do instrumento. */
function project(tanHalf: number, cosPhi: number, sinPhi: number, view: SkyView): { x: number; y: number } | null {
  if (view.direction === 'front') {
    if (!(tanHalf < 1)) return null;
    const tan = (2 * tanHalf) / (1 - tanHalf * tanHalf);
    return { x: (tan * cosPhi) / view.tanHalfFovX, y: (tan * sinPhi) / view.tanHalfFovY };
  }
  if (!(tanHalf > 1)) return null;
  // Atrás, o ângulo a partir de +Z tem tan(ψ'/2) = 1/tan(θ'/2), e a direita da câmera é −X.
  const u = 1 / tanHalf;
  const tan = (2 * u) / (1 - u * u);
  return { x: (-tan * cosPhi) / view.tanHalfFovX, y: (tan * sinPhi) / view.tanHalfFovY };
}

/**
 * O brilho que o shader dá ao ponto (linear, antes do tone mapping): o do catálogo, 2,2·(L/d²)^0,8, pelo sensor
 * na temperatura deslocada, pelo beaming D² com a diluição da PSF e pela exposição; numa galáxia, o pico cai
 * com o alargamento σ_PSF/σ_ef da mancha.
 */
function brightness(source: SkyLabelSource, distanceLy: number, doppler: number, tanHalf: number, k: Kinematics, view: SkyView): number {
  const sinObs = Number.isFinite(tanHalf) ? (2 * tanHalf) / (1 + tanHalf * tanHalf) : 0;
  const cone = k.gamma * view.psfAngleRad;
  const psfDilution = 1 / (1 + cone * cone * Math.exp(-sinObs * sinObs * k.gamma * k.gamma));
  const beaming = Math.min(doppler * doppler * psfDilution, 65);
  let peak = displayAmplitude(source.luminosity, distanceLy);
  if (source.sigmaLy > 0) {
    const sigmaPsf = Math.min(Math.max(view.psfAngleRad * doppler, 1e-9), STAR_SIGMA_MAX);
    peak *= sigmaPsf / Math.hypot(sigmaPsf, source.sigmaLy / distanceLy);
  }
  return sensorLuminance(source.temperatureK * doppler, view.sensorMode) * peak * beaming * view.exposure * view.backgroundGain;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Os rótulos da tela: os objetos fixos no eixo do instrumento primeiro, depois, entre os que aparecem, os mais
 * brilhantes vistos dali (L/d², sem o Doppler: a ordem não pula com a posição na tela, e a Grande Nuvem de
 * Magalhães não perde a vez para estrelas fracas desviadas para o azul), até `max`, sem um nome cobrir outro.
 */
export function placeSkyLabels(
  sources: readonly SkyLabelSource[],
  shipDistanceLy: number,
  k: Kinematics,
  view: SkyView,
  pinned: readonly PinnedLabel[] = [],
  max = 8,
): SkyLabel[] {
  const candidates: { name: string; kind: SkyLabelKind; x: number; y: number; score: number }[] = pinned.map((p) => ({
    ...p,
    x: view.widthPx / 2,
    y: view.heightPx / 2,
    score: Infinity,
  }));
  for (const source of sources) {
    const rel: Vec3 = [source.position[0], source.position[1], source.position[2] + shipDistanceLy];
    const seen = aberrate(rel, k);
    if (!(seen.distanceLy > 0) || seen.distanceLy < (source.minDistanceLy ?? 0)) continue;
    const ndc = project(seen.tanHalf, seen.cosPhi, seen.sinPhi, view);
    if (!ndc || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
    if (!(brightness(source, seen.distanceLy, seen.doppler, seen.tanHalf, k, view) >= LABEL_MIN_BRIGHTNESS)) continue;
    candidates.push({
      name: source.name,
      kind: source.kind,
      x: ((ndc.x + 1) / 2) * view.widthPx,
      y: ((1 - ndc.y) / 2) * view.heightPx,
      score: source.luminosity / (seen.distanceLy * seen.distanceLy),
    });
  }
  candidates.sort((a, b) => b.score - a.score);

  const placed: SkyLabel[] = [];
  const boxes: Box[] = [];
  for (const c of candidates) {
    if (placed.length >= max) break;
    const textWidth = c.name.length * CHAR_PX + TEXT_PAD_PX;
    const flip = c.x + TEXT_GAP_PX + textWidth > view.widthPx;
    const marker: Box = { left: c.x - MARKER_PX / 2, top: c.y - MARKER_PX / 2, right: c.x + MARKER_PX / 2, bottom: c.y + MARKER_PX / 2 };
    const text: Box = flip
      ? { left: c.x - TEXT_GAP_PX - textWidth, top: c.y - LINE_PX / 2, right: c.x - TEXT_GAP_PX, bottom: c.y + LINE_PX / 2 }
      : { left: c.x + TEXT_GAP_PX, top: c.y - LINE_PX / 2, right: c.x + TEXT_GAP_PX + textWidth, bottom: c.y + LINE_PX / 2 };
    if (boxes.some((b) => overlaps(b, text) || overlaps(b, marker))) continue;
    boxes.push(marker, text);
    placed.push({ name: c.name, kind: c.kind, x: c.x, y: c.y, flip });
  }
  return placed;
}

let cached: { trip: string; sources: readonly SkyLabelSource[] } | null = null;

/**
 * Os objetos que podem ganhar rótulo numa viagem (partida e destino), no referencial da nave: as estrelas com
 * nome e as galáxias rotuladas, sem o alvo (que tem o rótulo fixo), e a Via Láctea vista de fora.
 */
export function skyLabelSources(destination: Destination, origin: Origin): readonly SkyLabelSource[] {
  const trip = `${origin.id}>${destination.id}`;
  if (cached?.trip === trip) return cached.sources;
  const { icrsToShip } = skyFrameFor(destination);
  const originLy = originPositionLy(origin);
  const stars = parseNamedStars(
    namedStarCatalog,
    icrsToShip,
    destination.kind === 'star' ? destination.distanceLy : Infinity,
    origin.destinationId ? { positionLy: originLy, sunLuminosity: originLuminosity(ORIGINS.sol) } : null,
  );
  const labels: Readonly<Record<string, string>> = galaxyCatalog.labels;
  const galaxies = parseGalaxies(galaxyCatalog, icrsToShip, destination, originLy, GALACTIC_CENTER_ICRS_LY).filter(
    (g) => g.name === MILKY_WAY_NAME || labels[g.name],
  );
  const sources: SkyLabelSource[] = [
    ...stars.map((s) => ({ name: s.name, kind: 'star' as const, position: s.position, luminosity: s.luminosity, temperatureK: s.temperatureK, sigmaLy: 0 })),
    ...galaxies.map((g) => ({
      name: g.name === MILKY_WAY_NAME ? MILKY_WAY_NAME : labels[g.name]!,
      kind: 'galaxy' as const,
      position: g.position,
      luminosity: g.luminosity,
      temperatureK: g.temperatureK,
      sigmaLy: g.sigmaLy,
      // Dentro dela (como na grade de galáxias), a Via Láctea é o brilho difuso, não um objeto.
      ...(g.name === MILKY_WAY_NAME ? { minDistanceLy: MILKY_WAY_INSIDE_LY } : {}),
    })),
  ];
  cached = { trip, sources };
  return sources;
}
