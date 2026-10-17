/**
 * Marcos do voo e contagens regressivas, emitidos pelo loop de tempo próprio
 * e consumidos pelos alertas sonoros.
 */
import { flipTauOf, type MissionProfile } from '../physics/RelativityEngine';
import type { CriticalWindow } from '../physics/criticalEvents';

export type MilestoneKind = 'ignition' | 'cmb-entry' | 'flip' | 'arrival';

export interface Milestone {
  readonly kind: MilestoneKind;
  readonly tau: number;
}

export type FlightEvent =
  | { readonly type: 'countdown'; readonly target: MilestoneKind; readonly secondsLeft: number }
  | { readonly type: 'milestone'; readonly kind: MilestoneKind }
  /** Começo (`resting`) ou fim de um descanso da tripulação (§4.2.9). */
  | { readonly type: 'crew-rest'; readonly resting: boolean };

/** A contagem regressiva começa 3 s (tempo real) antes de cada marco. */
export const COUNTDOWN_FROM_S = 3;

/** Ciclos de queima e descanso mais curtos que isso na tela (s reais) não tocam o aviso, para não virar ruído. */
export const CREW_REST_CHIME_MIN_CYCLE_S = 4;

/**
 * Aviso de cabine quando um descanso da tripulação começa ou termina entre dois frames do loop, se o
 * ciclo (queima + descanso) dura ao menos 4 s reais no multiplicador do momento.
 */
export function detectCrewRestEvent(
  wasResting: boolean,
  resting: boolean,
  cycleS: number,
  timeScale: number,
): FlightEvent | null {
  if (wasResting === resting || !(cycleS / timeScale >= CREW_REST_CHIME_MIN_CYCLE_S)) return null;
  return { type: 'crew-rest', resting };
}

/**
 * Marcos em voo, ordenados por τ: entradas da CMB no visível, flip (início da
 * frenagem) e chegada. Depois de o piloto mexer no motor, só há flip se o piloto
 * automático fizer um, e só há chegada se a nave for parar no alvo.
 */
export function computeMilestones(profile: MissionProfile, windows: readonly CriticalWindow[]): Milestone[] {
  const milestones: Milestone[] = windows
    .filter((w) => w.kind === 'cmb-visible')
    .map((w) => ({ kind: 'cmb-entry', tau: w.startTau }));
  const flip = flipTauOf(profile);
  if (flip !== null) milestones.push({ kind: 'flip', tau: flip });
  if (!profile.maneuvers || profile.maneuvers.end === 'arrival') milestones.push({ kind: 'arrival', tau: profile.tauTotal });
  return milestones.sort((a, b) => a.tau - b.tau);
}

/**
 * Eventos de um passo do relógio de bordo de τ₀ a τ₁ com multiplicador M_τ:
 * os marcos cruzados em (τ₀, τ₁] e um bipe quando o tempo **real** até o
 * próximo marco, (τ − τ₁)/M_τ, cruza 3, 2 ou 1 s. Assim a contagem soa em
 * segundos de relógio de parede a qualquer multiplicador.
 */
export function detectFlightEvents(
  milestones: readonly Milestone[],
  tau0: number,
  tau1: number,
  timeScale: number,
): FlightEvent[] {
  const events: FlightEvent[] = milestones
    .filter((m) => m.tau > tau0 && m.tau <= tau1)
    .map((m) => ({ type: 'milestone', kind: m.kind }));

  const next = milestones.find((m) => m.tau > tau1);
  if (next) {
    const before = (next.tau - tau0) / timeScale;
    const after = (next.tau - tau1) / timeScale;
    // Se um passo cruzar mais de um segundo, vale o mais próximo do marco.
    for (let n = 1; n <= COUNTDOWN_FROM_S; n++) {
      if (before > n && after <= n) {
        events.push({ type: 'countdown', target: next.kind, secondsLeft: n });
        break;
      }
    }
  }
  return events;
}

type FlightEventListener = (event: FlightEvent) => void;
const listeners = new Set<FlightEventListener>();

export function onFlightEvent(listener: FlightEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitFlightEvents(events: readonly FlightEvent[]): void {
  for (const event of events) for (const listener of listeners) listener(event);
}
