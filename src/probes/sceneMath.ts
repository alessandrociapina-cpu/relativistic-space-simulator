/**
 * Geometria da cena do Sistema Solar: o mapeamento das posições (UA) para a
 * tela em escala real ou logarítmica e a posição do corpo em foco, que vira a
 * origem da cena a cada frame (origem flutuante: tudo é desenhado relativo a
 * ele em 64 bits, então dá para aproximar de um planeta a 5 UA do Sol sem
 * tremer na GPU de 32 bits).
 */
import { MISSIONS, type ProbeId } from './missions';
import { PLANETS, planetPosition, type PlanetId } from './planets';
import { AU_KM, probePosition } from './probes';
import type { FocusId, ScaleMode } from './useProbeStore';
import { norm, scale as scaleVec, type Vec3 } from './vec3';

/** Escala log: R = K·log₁₀(1 + r/r₀). Terra em ~4,8, Júpiter em ~10, Netuno em ~18, Voyager 1 hoje em ~25. */
export const LOG_R0_AU = 0.5;
export const LOG_K = 10;

const radialLog = (r: number) => LOG_K * Math.log10(1 + r / LOG_R0_AU);

/** Posição heliocêntrica (UA) → coordenadas da cena. */
export function toDisplay(p: Vec3, mode: ScaleMode): Vec3 {
  if (mode === 'linear') return p;
  const r = norm(p);
  return r === 0 ? p : scaleVec(p, radialLog(r) / r);
}

/**
 * Quantas unidades da cena vale 1 UA perto de `p`. Na escala log usa a escala
 * tangencial R/r, para os planetas manterem o tamanho relativo à sua órbita.
 */
export function localScale(p: Vec3, mode: ScaleMode): number {
  if (mode === 'linear') return 1;
  const r = norm(p);
  return r < 1e-9 ? LOG_K / (LOG_R0_AU * Math.LN10) : radialLog(r) / r;
}

export const isProbe = (id: FocusId): id is ProbeId => id in MISSIONS;
export const isPlanet = (id: FocusId): id is PlanetId => id in PLANETS;

/** Posição heliocêntrica do foco; uma sonda antes do lançamento fica na Terra. */
export function focusPosition(focus: FocusId, t: number): Vec3 {
  if (focus === 'sun') return [0, 0, 0];
  if (isPlanet(focus)) return planetPosition(focus, t);
  return probePosition(MISSIONS[focus].trajectory, t) ?? planetPosition('earth', t);
}

/** Raio do corpo em UA (sondas: um ponto). */
export function bodyRadiusAu(focus: FocusId): number {
  if (focus === 'sun') return 695_700 / AU_KM;
  if (isPlanet(focus)) return PLANETS[focus].radiusKm / AU_KM;
  return 0;
}

/** Distância inicial da câmera ao focar um corpo (unidades da cena). */
export function viewDistance(focus: FocusId, t: number, mode: ScaleMode): number {
  if (focus === 'sun') return mode === 'log' ? 42 : 45;
  const s = localScale(focusPosition(focus, t), mode);
  // Planetas: ~60 raios, o bastante para ver o sobrevoo inteiro em escala real.
  if (isPlanet(focus)) return Math.max(bodyRadiusAu(focus) * 60 * s, mode === 'log' ? 0.02 : 1e-5);
  return mode === 'log' ? 3 : 0.6;
}
