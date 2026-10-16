/**
 * Eventos críticos do voo (CLAUDE.md §7.2), em intervalos de tempo próprio τ.
 * O Auto-Step Down desacelera o multiplicador ao entrar em um deles.
 */
import { C, computeFlightState, flipTauOf, segmentState, type MissionProfile } from './RelativityEngine';

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

/** Amostras por segmento ao procurar a faixa da CMB num voo com manobras. */
const SAMPLES_PER_SEGMENT = 240;

/**
 * Janelas de um voo em que o piloto desligou ou religou o motor: as do plano
 * até o primeiro comando e, depois, a faixa da CMB procurada segmento a
 * segmento (amostras e bissecção) e o flip do piloto automático, se houver.
 */
function maneuveredWindows(profile: MissionProfile): CriticalWindow[] {
  const m = profile.maneuvers!;
  const windows: CriticalWindow[] = computeCriticalWindows(m.plan)
    .filter((w) => w.kind === 'cmb-visible' && w.startTau < m.firstTau)
    .map((w) => ({ ...w, endTau: Math.min(w.endTau, m.firstTau) }));
  const flip = flipTauOf(profile);
  if (flip !== null) windows.push({ kind: 'pre-flip', startTau: Math.max(0, flip - preFlipWindowS(profile)), endTau: flip });

  const inBand = (eta: number) => eta >= ETA_CMB_MIN && eta <= ETA_CMB_MAX;
  const etaAt = (tau: number) => computeFlightState(profile, tau).eta;
  const edge = (lo: number, hi: number, loInside: boolean) => {
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (inBand(etaAt(mid)) === loInside) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let open: number | null = null;
  let prevTau = m.firstTau;
  let prevInside = inBand(etaAt(m.firstTau));
  if (prevInside) {
    // A janela do plano que estava aberta no comando continua.
    const carried = windows.findIndex((w) => w.kind === 'cmb-visible' && w.endTau === m.firstTau);
    open = carried >= 0 ? windows.splice(carried, 1)[0]!.startTau : m.firstTau;
  }
  for (const seg of m.segments.filter((s) => s.startTau + s.duration > m.firstTau)) {
    for (let i = 1; i <= SAMPLES_PER_SEGMENT; i++) {
      const tau = seg.startTau + (seg.duration * i) / SAMPLES_PER_SEGMENT;
      if (tau <= prevTau) continue;
      const inside = inBand(segmentState(seg, tau - seg.startTau).eta);
      if (inside !== prevInside) {
        const at = edge(prevTau, tau, prevInside);
        if (inside) open = at;
        else if (open !== null) {
          windows.push({ kind: 'cmb-visible', startTau: open, endTau: at });
          open = null;
        }
        prevInside = inside;
      }
      prevTau = tau;
    }
  }
  if (open !== null) windows.push({ kind: 'cmb-visible', startTau: open, endTau: profile.tauTotal });
  return windows.sort((a, b) => a.startTau - b.startTau);
}

/** Janelas críticas da missão, ordenadas pelo início. */
export function computeCriticalWindows(profile: MissionProfile): CriticalWindow[] {
  if (profile.maneuvers) return maneuveredWindows(profile);
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
