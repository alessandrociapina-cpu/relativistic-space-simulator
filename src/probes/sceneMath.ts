/**
 * Geometria da cena do Sistema Solar: o mapeamento das posições (UA) para a
 * tela em escala real ou logarítmica e a posição do corpo em foco, que vira a
 * origem da cena a cada frame (origem flutuante: tudo é desenhado relativo a
 * ele em 64 bits, então dá para aproximar de um planeta a 5 UA do Sol sem
 * tremer na GPU de 32 bits).
 *
 * Na escala log, um sistema planetário (planeta, luas e as sondas nas janelas
 * de encontro) é desenhado com uma escala só, a tangencial do planeta: assim
 * as órbitas em torno dele não ficam achatadas pela compressão radial.
 */
import { BODIES, bodyPosition, isBody, isMoon, isSmallBody, smallBodySpan, type BodyId } from './bodies';
import { craft, isCompanionId, isProbeId, type CraftId } from './missions';
import { AU_KM, currentEncounter, encounterWeight, probePosition, type ProbeTrajectory } from './probes';
import { add, lerp, norm, scale as scaleVec, sub, type Vec3 } from './vec3';

export type FocusId = 'sun' | BodyId | CraftId;
/** `log`: distâncias ao Sol em escala logarítmica (visão geral); `linear`: escala real. */
export type ScaleMode = 'log' | 'linear';

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

/** Posição de algo perto do centro `c` (UA), com a escala única do sistema. */
export function nearDisplay(p: Vec3, c: Vec3, mode: ScaleMode): Vec3 {
  if (mode === 'linear') return p;
  return add(toDisplay(c, mode), scaleVec(sub(p, c), localScale(c, mode)));
}

export const isCraft = (id: FocusId): id is CraftId => isProbeId(id) || isCompanionId(id);
export const isBodyFocus = (id: FocusId): id is BodyId => isBody(id);

/** O centro do sistema de um corpo: o planeta, para uma lua; o próprio corpo, nos demais. */
export const systemCenter = (id: BodyId): BodyId => (isMoon(id) ? BODIES[id].parent! : id);

/** Corpo pequeno fora dos seus dados: usa a ponta mais próxima. */
function bodyPositionClamped(id: BodyId, t: number): Vec3 {
  if (isSmallBody(id)) {
    const [start, end] = smallBodySpan(id);
    return bodyPosition(id, Math.min(Math.max(t, start), end))!;
  }
  return bodyPosition(id, t)!;
}

/** Posição heliocêntrica de um corpo; corpos pequenos fora dos dados ficam na ponta mais próxima. */
export const framePosition = (id: BodyId, t: number): Vec3 => bodyPositionClamped(id, t);

/**
 * Referencial dos rastros: em escala real, o corpo em foco (ou o sistema do
 * encontro em que está a sonda em foco), que acompanha o corpo sem girar.
 * Assim uma órbita em torno de Júpiter ou do cometa aparece como órbita, e a
 * aproximação como a hipérbole que ela é. Na escala log e no Sol: heliocêntrico.
 */
export function frameBody(focus: FocusId, t: number, mode: ScaleMode): BodyId | null {
  if (mode !== 'linear' || focus === 'sun') return null;
  if (isBodyFocus(focus)) return focus;
  const { trajectory } = craft(focus);
  const e = currentEncounter(trajectory, Math.min(Math.max(t, trajectory.launch), trajectory.end));
  return e ? systemCenter(e.body) : null;
}

/** Posição de um corpo na cena (luas com a escala do seu planeta); `null` sem dados. */
export function bodyDisplay(id: BodyId, t: number, mode: ScaleMode): Vec3 | null {
  const p = bodyPosition(id, t);
  if (!p) return null;
  return isMoon(id) ? nearDisplay(p, bodyPosition(BODIES[id].parent!, t)!, mode) : toDisplay(p, mode);
}

/** Ponto de uma trajetória na cena: heliocêntrico, centro do sistema do encontro e peso da janela. */
export interface TrailPoint {
  readonly p: Vec3;
  readonly c: Vec3 | null;
  readonly w: number;
}

/** A sonda no instante, com o que a cena precisa para desenhá-la em qualquer escala. */
export function craftPoint(trajectory: ProbeTrajectory, t: number): TrailPoint | null {
  const p = probePosition(trajectory, t);
  if (!p) return null;
  const e = currentEncounter(trajectory, t);
  if (!e) return { p, c: null, w: 0 };
  // Janela de lua dentro da do planeta: o peso que vale é o da janela do planeta.
  const center = systemCenter(e.body);
  const outer = trajectory.encounters.find((x) => x.body === center && encounterWeight(x, t) > 0) ?? e;
  const c = bodyPosition(center, t);
  return c ? { p, c, w: encounterWeight(outer, t) } : { p, c: null, w: 0 };
}

export function pointDisplay({ p, c, w }: TrailPoint, mode: ScaleMode): Vec3 {
  if (mode === 'linear' || !c || w <= 0) return toDisplay(p, mode);
  return lerp(toDisplay(p, mode), nearDisplay(p, c, mode), w);
}

/** Posição heliocêntrica do foco (sondas antes do lançamento: a Terra ou a nave-mãe; depois do fim: o último ponto). */
export function focusPosition(focus: FocusId, t: number): Vec3 {
  if (focus === 'sun') return [0, 0, 0];
  if (isBodyFocus(focus)) return bodyPositionClamped(focus, t);
  const { trajectory } = craft(focus);
  if (t < trajectory.launch) {
    const parent = isCompanionId(focus) ? craftParentPosition(focus, t) : null;
    return parent ?? bodyPosition('earth', t)!;
  }
  return probePosition(trajectory, Math.min(t, trajectory.end))!;
}

/** Companheira antes de se separar: está na nave-mãe. */
function craftParentPosition(id: CraftId, t: number): Vec3 | null {
  if (!isCompanionId(id)) return null;
  const parent = id === 'huygens' ? 'cassini' : 'galileo';
  return probePosition(craft(parent).trajectory, t);
}

/** Posição do foco na cena. */
export function focusDisplay(focus: FocusId, t: number, mode: ScaleMode): Vec3 {
  if (focus === 'sun') return [0, 0, 0];
  if (isBodyFocus(focus)) {
    const p = bodyPositionClamped(focus, t);
    return isMoon(focus) ? nearDisplay(p, bodyPosition(BODIES[focus].parent!, t)!, mode) : toDisplay(p, mode);
  }
  const { trajectory } = craft(focus);
  const point = t >= trajectory.launch ? craftPoint(trajectory, Math.min(t, trajectory.end)) : null;
  return point ? pointDisplay(point, mode) : toDisplay(focusPosition(focus, t), mode);
}

/** Raio do corpo em UA (sondas: um ponto). */
export function bodyRadiusAu(focus: FocusId): number {
  if (focus === 'sun') return 695_700 / AU_KM;
  if (isBodyFocus(focus)) return BODIES[focus].radiusKm / AU_KM;
  return 0;
}

/** Distância inicial da câmera ao focar um corpo (unidades da cena). */
export function viewDistance(focus: FocusId, t: number, mode: ScaleMode): number {
  if (focus === 'sun') return mode === 'log' ? 42 : 45;
  const center = isBodyFocus(focus) ? systemCenter(focus) : null;
  const s = localScale(focusPosition(center ?? focus, t), mode);
  // Corpos: ~60 raios, o bastante para ver um sobrevoo inteiro em escala real.
  if (isBodyFocus(focus)) return Math.max(bodyRadiusAu(focus) * 60 * s, mode === 'log' ? 1e-4 : 1e-7);
  return mode === 'log' ? 3 : 0.6;
}
