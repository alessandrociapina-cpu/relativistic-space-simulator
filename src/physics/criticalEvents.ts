/**
 * Eventos críticos do voo (CLAUDE.md §7.2), em intervalos de tempo próprio τ.
 * O Auto-Step Down reduz o multiplicador para 1x ao entrar em um deles.
 */
import { C, type MissionProfile } from './RelativityEngine';

/** Faixa de γ em que a CMB atravessa o espectro visível. */
export const CMB_VISIBLE_GAMMA = { min: 400, max: 15_000 } as const;

/** Duração (tempo próprio) da janela que antecede o flip. */
export const PRE_FLIP_WINDOW_S = 10;

export type CriticalEventKind = 'cmb-visible' | 'pre-flip';

export interface CriticalWindow {
  readonly kind: CriticalEventKind;
  readonly startTau: number;
  readonly endTau: number;
}

const ETA_CMB_MIN = Math.acosh(CMB_VISIBLE_GAMMA.min);
const ETA_CMB_MAX = Math.acosh(CMB_VISIBLE_GAMMA.max);

/** Janelas críticas da missão, ordenadas pelo início. */
export function computeCriticalWindows(profile: MissionProfile): CriticalWindow[] {
  const { tauHalf, tauTotal, etaMax, properAccel } = profile;
  const cOverA = C / properAccel;
  const windows: CriticalWindow[] = [
    { kind: 'pre-flip', startTau: Math.max(0, tauHalf - PRE_FLIP_WINDOW_S), endTau: tauHalf },
  ];

  if (etaMax > ETA_CMB_MIN) {
    // Na aceleração, γ sobe pela faixa; na frenagem, desce por ela (simétrico).
    const enter = cOverA * ETA_CMB_MIN;
    const exit = Math.min(cOverA * ETA_CMB_MAX, tauHalf);
    windows.push(
      { kind: 'cmb-visible', startTau: enter, endTau: exit },
      { kind: 'cmb-visible', startTau: tauTotal - exit, endTau: tauTotal - enter },
    );
  }

  return windows.sort((a, b) => a.startTau - b.startTau);
}

/** Primeira janela que começa em (fromTau, toTau], ou `null`. */
export function firstWindowStartingIn(
  windows: readonly CriticalWindow[],
  fromTau: number,
  toTau: number,
): CriticalWindow | null {
  return windows.find((w) => w.startTau > fromTau && w.startTau <= toTau) ?? null;
}

/** Janelas ativas no instante τ. */
export function activeWindowsAt(windows: readonly CriticalWindow[], tau: number): CriticalWindow[] {
  return windows.filter((w) => tau >= w.startTau && tau <= w.endTau);
}
