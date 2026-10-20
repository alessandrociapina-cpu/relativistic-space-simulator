/**
 * Densidade do gás no caminho da nave (átomos de hidrogênio por cm³), para a radiação na proa (§10) e o
 * roteiro de Tau Zero (§4.2.11): o disco de gás frio e morno, a camada de gás ionizado, o halo quente da Via
 * Láctea e o gás entre as galáxias. Um modelo suave, para ordens de grandeza: perto do Sol, ~1 átomo/cm³ no
 * plano (a média sobre nuvens densas e bolhas quentes); no espaço entre os grupos de galáxias, ~2,5 × 10⁻⁷.
 *
 * Coordenadas: galácticas heliocêntricas em kpc, como o modelo da Via Láctea (`galaxyModel.ts`).
 */
import { C, LIGHT_YEAR_M } from '../physics/RelativityEngine';
import type { Destination } from '../physics/destinations';
import { originPositionLy, type Origin } from '../physics/origins';
import { GALACTIC_CENTER, KPC_LY } from './galaxyModel';
import { ICRS_TO_GALACTIC, add, apply, length, scale, skyFrameFor, sub, type Vec3 } from './skyFrame';

/** Gás neutro do disco: ~1 átomo/cm³ no plano perto do Sol, escala de altura ~150 pc. */
const DISK = { density: 1, scaleZ: 0.15 } as const;
/** Gás ionizado morno (a camada de Reynolds): ~0,03 átomo/cm³, escala de altura ~1 kpc. */
const IONIZED = { density: 0.03, scaleZ: 1 } as const;
/** O disco de gás fica mais denso rumo ao centro (escala radial, kpc; nunca mais perto que 1 kpc). */
const DISK_SCALE_R = 3.5;
/** Halo quente (Miller & Bregman 2013, β ≈ 0,5): n ≈ 1,35 × 10⁻² · r^(−1,5) cm⁻³, com r em kpc. */
const HALO = { density: 1.35e-2, slope: 1.5, core: 1 } as const;
/** Gás entre as galáxias: a densidade média dos bárions do universo, ~0,25 átomo por metro cúbico. */
export const INTERGALACTIC_DENSITY_CM3 = 2.5e-7;

const R_SUN = Math.hypot(GALACTIC_CENTER[0], GALACTIC_CENTER[1]);

/** Densidade do gás (átomos/cm³) num ponto (galáctico heliocêntrico, kpc). */
export function gasDensityAt(p: Vec3): number {
  const rel = sub(p, GALACTIC_CENTER);
  const z = Math.abs(p[2]);
  const radial = Math.exp(-(Math.max(Math.hypot(rel[0], rel[1]), 1) - R_SUN) / DISK_SCALE_R);
  const disk = radial * (DISK.density * Math.exp(-z / DISK.scaleZ) + IONIZED.density * Math.exp(-z / IONIZED.scaleZ));
  const halo = HALO.density * Math.max(length(rel), HALO.core) ** -HALO.slope;
  return disk + halo + INTERGALACTIC_DENSITY_CM3;
}

/** Densidade do gás na posição da nave, a `positionM` metros da partida rumo ao alvo. */
export function gasDensityOnRoute(origin: Origin, destination: Destination, positionM: number): number {
  const home = scale(apply(ICRS_TO_GALACTIC, originPositionLy(origin)), 1 / KPC_LY);
  const ship = add(home, scale(skyFrameFor(destination).targetGalactic, positionM / LIGHT_YEAR_M / KPC_LY));
  return gasDensityAt(ship);
}

/** Energia de repouso do próton (eV e J). */
export const PROTON_REST_EV = 938.27208816e6;
const PROTON_REST_J = 1.50327761802e-10;

/**
 * O gás batendo na proa à rapidez η: a energia de cada próton, (γ − 1)·m_p c², e a potência por área, o fluxo
 * γ·n·βc (o gás chega mais denso por γ no referencial da nave) vezes essa energia. γ − 1 = 2 sinh²(η/2), sem
 * cancelamento.
 */
export function bowRadiation(eta: number, densityCm3: number): { readonly protonEv: number; readonly powerWm2: number } {
  const gammaM1 = 2 * Math.sinh(eta / 2) ** 2;
  return {
    protonEv: gammaM1 * PROTON_REST_EV,
    powerWm2: Math.cosh(eta) * densityCm3 * 1e6 * Math.tanh(eta) * C * gammaM1 * PROTON_REST_J,
  };
}
