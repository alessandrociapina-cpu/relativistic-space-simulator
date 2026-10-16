/**
 * Eventos críticos do voo (CLAUDE.md §7.2), em intervalos de tempo próprio τ.
 * O Auto-Step Down desacelera o multiplicador ao entrar em um deles.
 */
import { C, type MissionProfile } from './RelativityEngine';

/** Faixa de γ em que a CMB atravessa o espectro visível. */
export const CMB_VISIBLE_GAMMA = { min: 400, max: 15_000 } as const;

/** Duração (tempo próprio) da janela que antecede o flip na missão de demonstração. */
export const PRE_FLIP_WINDOW_S = 10;

/** Duração de referência das missões: a demonstração leva ~10 min de bordo. */
const REFERENCE_MISSION_S = 600;

/**
 * Uma duração da demonstração (em s de bordo) na escala da missão: igual em
 * missões de até 10 min, proporcional a τ_total nas mais longas. Assim "os 10 s
 * antes do flip" viram ~21 dias numa viagem de 3,5 anos a 1 g.
 */
export function missionScaledS(profile: MissionProfile, demoSeconds: number): number {
  return Math.max(demoSeconds, (profile.tauTotal * demoSeconds) / REFERENCE_MISSION_S);
}

/** Janela que antecede o início da frenagem (o flip). */
export const preFlipWindowS = (profile: MissionProfile) => missionScaledS(profile, PRE_FLIP_WINDOW_S);

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
  const { brakeStartTau, tauTotal, etaMax, properAccel } = profile;
  const cOverA = C / properAccel;
  const windows: CriticalWindow[] = [
    { kind: 'pre-flip', startTau: Math.max(0, brakeStartTau - preFlipWindowS(profile)), endTau: brakeStartTau },
  ];

  if (etaMax > ETA_CMB_MIN) {
    const enter = cOverA * ETA_CMB_MIN;
    if (etaMax > ETA_CMB_MAX) {
      // γ sobe pela faixa na aceleração e desce por ela na frenagem (simétrico).
      const exit = cOverA * ETA_CMB_MAX;
      windows.push(
        { kind: 'cmb-visible', startTau: enter, endTau: exit },
        { kind: 'cmb-visible', startTau: tauTotal - exit, endTau: tauTotal - enter },
      );
    } else {
      // O pico (ou o cruzeiro) fica dentro da faixa: uma janela só, da entrada à saída.
      windows.push({ kind: 'cmb-visible', startTau: enter, endTau: tauTotal - enter });
    }
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
