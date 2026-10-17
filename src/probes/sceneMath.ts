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
import { BODIES, bodyPosition, bodyState, isBody, isMoon, isSmallBody, smallBodySpan, type BodyId } from './bodies';
import { muAu } from './ephemeris';
import { COMPANIONS, craft, isCompanionId, isProbeId, type CraftId } from './missions';
import { AU_KM, currentEncounter, encounterWeight, probePosition, probeState, type ProbeTrajectory } from './probes';
import { add, cross, lerp, norm, scale as scaleVec, sub, type Vec3 } from './vec3';

export type FocusId = 'sun' | BodyId | CraftId;
/** `log`: distâncias ao Sol em escala logarítmica (visão geral); `linear`: escala real. */
export type ScaleMode = 'log' | 'linear';
/** `auto`: o referencial do corpo em foco ou do encontro (em escala real); `sun`: sempre o do Sol. */
export type FrameMode = 'auto' | 'sun';

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
 * aproximação como a hipérbole que ela é. Na escala log, no Sol ou com o
 * referencial do Sol escolhido nos controles: heliocêntrico.
 */
export function frameBody(focus: FocusId, t: number, mode: ScaleMode, frameMode: FrameMode = 'auto'): BodyId | null {
  if (mode !== 'linear' || focus === 'sun' || frameMode === 'sun') return null;
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
  const companion = COMPANIONS.find((c) => c.id === id);
  return companion ? probePosition(craft(companion.parent).trajectory, t) : null;
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

// ── Rastros ──────────────────────────────────────────────────────────────────
/** Passo angular dos rastros em torno do corpo central do momento. */
const TRAIL_STEP_RAD = (3 * Math.PI) / 180;
/** Passo máximo dos rastros dentro das janelas de encontro (dias). */
const WINDOW_TRAIL_MAX_STEP_DAYS = 1;
/**
 * Órbitas rápidas que duram anos (Magellan, Dawn, Vikings): o rastro guarda
 * uma volta inteira a cada `RING_SPACING_DAYS`, com lacunas entre elas, e a
 * cena desenha a volta mais recente na hora. Vale para janelas longas e
 * órbitas mais curtas que `RING_PERIOD_DAYS`.
 */
const RING_SPACING_DAYS = 10;
const RING_PERIOD_DAYS = 5;
const RING_WINDOW_DAYS = 60;


/**
 * Pontos do rastro: o passo segue o giro da sonda em torno do corpo central
 * do momento (o Sol, ou o planeta/lua/cometa da janela), ~3° por ponto. Assim
 * um periélio da Parker ou uma passagem rente a Júpiter saem lisos sem
 * encher de pontos os anos de cruzeiro.
 */
export function trailPoints(trajectory: ProbeTrajectory): { times: number[]; points: TrailPoint[]; gaps: boolean[] } {
  const times: number[] = [];
  const points: TrailPoint[] = [];
  /** gaps[k]: não há linha entre o ponto k − 1 e o ponto k. */
  const gaps: boolean[] = [];
  let gapNext = false;
  /** Volta em andamento numa órbita rápida e longa: início e ângulo percorrido. */
  let ring: { start: number; angle: number } | null = null;
  for (let t = trajectory.launch; ; ) {
    const point = craftPoint(trajectory, t);
    const state = probeState(trajectory, t);
    if (point && state) {
      times.push(t);
      points.push(point);
      gaps.push(gapNext);
      gapNext = false;
    }
    if (t >= trajectory.end || !state) break;
    const e = currentEncounter(trajectory, t);
    if (e?.kind === 'surface') {
      // Pousado: o módulo fica no lugar (gira com o corpo); só a ponta final do pouso entra no rastro.
      gapNext = true;
      t = Math.min(e.end, trajectory.end);
      if (t === e.end && t < trajectory.end) t += 1e-6;
      continue;
    }
    const center = e ? bodyState(e.body, t) : null;
    const r = center ? sub(state.position, center.position) : state.position;
    const v = center ? sub(state.velocity, center.velocity) : state.velocity;
    const omega = norm(cross(r, v)) / Math.max(norm(r) ** 2, 1e-30);
    // Numa aproximação quase em linha reta o giro em torno do corpo é lento, e só o passo angular
    // pularia o sobrevoo inteiro: o passo também não passa de 1/4 do tempo para percorrer a distância
    // atual. E numa janela de encontro, onde a cena mistura a posição relativa ao corpo com a
    // heliocêntrica (e, na escala log, duas escalas), fica em no máximo 1 dia.
    const approach = (0.25 * norm(r)) / Math.max(norm(v), 1e-30);
    const maxStep = e ? WINDOW_TRAIL_MAX_STEP_DAYS : 30;
    const step = Math.min(Math.max(Math.min(TRAIL_STEP_RAD / omega, approach), 1 / 1440), maxStep);
    const period = e ? orbitPeriodDays(r, v, e.body) : null;
    const fastLongOrbit = e !== null && e.kind === 'orbit' && e.end - e.start > RING_WINDOW_DAYS && period !== null && period < RING_PERIOD_DAYS;
    if (!fastLongOrbit) {
      ring = null;
    } else {
      ring ??= { start: t, angle: 0 };
      ring.angle += omega * step;
      if (ring.angle >= 2 * Math.PI) {
        // Volta completa: pula até a próxima, deixando uma lacuna no rastro.
        const next: number = ring.start + RING_SPACING_DAYS;
        if (next > t + step && next < e.end) {
          ring = { start: next, angle: 0 };
          gapNext = true;
          t = next;
          continue;
        }
        ring = { start: t + step, angle: 0 };
      }
    }
    t = Math.min(t + step, trajectory.end);
  }
  return { times, points, gaps };
}

/** Período (dias) da elipse com posição e velocidade relativas ao corpo (UA, UA/dia), pela energia; null se não for fechada. */
function orbitPeriodDays(r: Vec3, v: Vec3, body: BodyId): number | null {
  const mu = muAu(BODIES[body].gm);
  if (mu <= 0) return null;
  const inverseA = 2 / norm(r) - (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / mu;
  return inverseA > 0 ? 2 * Math.PI * Math.sqrt(1 / (inverseA * inverseA * inverseA) / mu) : null;
}

/** Período da órbita em que a sonda está (dias), ou null fora de uma órbita fechada. */
export function localPeriodDays(trajectory: ProbeTrajectory, t: number): number | null {
  const e = currentEncounter(trajectory, t);
  const state = probeState(trajectory, t);
  if (!e || !state) return null;
  const c = bodyState(e.body, t);
  return c ? orbitPeriodDays(sub(state.position, c.position), sub(state.velocity, c.velocity), e.body) : null;
}
