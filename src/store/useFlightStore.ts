import { create } from 'zustand';
import {
  computeFlightState,
  rapidityFromLog10Gamma,
  withRapidity,
  type FlightState,
  type MissionProfile,
} from '../physics/RelativityEngine';
import {
  DESTINATIONS,
  destinationMissionProfile,
  type Destination,
  type DestinationId,
} from '../physics/destinations';
import { computeCriticalWindows, firstWindowStartingIn, type CriticalWindow } from '../physics/criticalEvents';
import {
  COUNTDOWN_FROM_S,
  computeMilestones,
  detectFlightEvents,
  emitFlightEvents,
  type FlightEvent,
  type Milestone,
  type MilestoneKind,
} from './flightEvents';

// Estado cinemático global em 64 bits. Os monitores 3D leem com
// `useFlightStore.getState()` dentro do useFrame, sem re-render do React; o
// HUD e os controles assinam só os campos que exibem.

export type FlightMode = 'autopilot' | 'manual';

/** Multiplicadores de tempo próprio M_τ (§7.2). */
export const TIME_SCALES = [0.1, 1, 5, 20, 100] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

/** Faixa do slider logarítmico do Cruzeiro Livre: log₁₀γ ∈ [0, 7,5] (η ≈ 18). */
export const MAX_LOG10_GAMMA = 7.5;
export const MAX_MANUAL_ETA = rapidityFromLog10Gamma(MAX_LOG10_GAMMA);

export interface FlightStore {
  readonly mode: FlightMode;
  readonly destination: Destination;
  /** Aceleração própria em múltiplos de g₀. */
  readonly accelG: number;
  readonly profile: MissionProfile;
  readonly criticalWindows: readonly CriticalWindow[];
  readonly milestones: readonly Milestone[];
  /** Tempo próprio do Autopilot (s). */
  readonly tau: number;
  readonly playing: boolean;
  /** Segundos reais até a ignição durante a contagem regressiva; `null` fora dela. */
  readonly ignitionCountdownS: number | null;
  readonly timeScale: TimeScale;
  /** Reduz M_τ para 1x ao entrar em um evento crítico. */
  readonly autoStepDown: boolean;
  /** Rapidez imposta no Cruzeiro Livre. */
  readonly manualEta: number;
  /** Snapshot cinemático lido pelos monitores e pelo HUD. */
  readonly flight: FlightState;

  setMode: (mode: FlightMode) => void;
  setDestination: (id: DestinationId) => void;
  setAccelG: (accelG: number) => void;
  /** Partida (com contagem regressiva a partir de τ = 0), pausa, retomada ou aborto da contagem. */
  togglePlay: () => void;
  seek: (tau: number) => void;
  setTimeScale: (timeScale: TimeScale) => void;
  setAutoStepDown: (on: boolean) => void;
  setManualEta: (eta: number) => void;
  /** Avança o relógio de bordo por `dtRealS` segundos reais (chamado a cada frame). */
  tick: (dtRealS: number) => void;
}

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

function deriveFlight(profile: MissionProfile, tau: number, mode: FlightMode, manualEta: number): FlightState {
  const state = computeFlightState(profile, tau);
  return mode === 'manual' ? withRapidity(state, manualEta) : state;
}

/** Nova missão parada no instante da partida. */
function newMission(destination: Destination, accelG: number) {
  const profile = destinationMissionProfile(destination, accelG);
  const criticalWindows = computeCriticalWindows(profile);
  return {
    destination,
    accelG,
    profile,
    criticalWindows,
    milestones: computeMilestones(profile, criticalWindows),
    tau: 0,
    playing: false,
    ignitionCountdownS: null,
  };
}

const countdown = (target: MilestoneKind, secondsLeft: number): FlightEvent => ({
  type: 'countdown',
  target,
  secondsLeft,
});

export const useFlightStore = create<FlightStore>()((set, get) => {
  /** Aplica `patch` e recalcula o snapshot `flight`. */
  const update = (patch: Partial<FlightStore>) => {
    const next = { ...get(), ...patch };
    set({ ...patch, flight: deriveFlight(next.profile, next.tau, next.mode, next.manualEta) });
  };

  const initial = newMission(DESTINATIONS.proxima, DESTINATIONS.proxima.defaultAccelG);

  return {
    ...initial,
    mode: 'autopilot',
    timeScale: 1,
    autoStepDown: true,
    manualEta: 0,
    flight: computeFlightState(initial.profile, 0),

    setMode: (mode) => {
      if (mode === get().mode) return;
      // O Cruzeiro Livre começa na rapidez atual e congela posição e relógios.
      update(
        mode === 'manual'
          ? {
              mode,
              playing: false,
              ignitionCountdownS: null,
              manualEta: Math.min(get().flight.eta, MAX_MANUAL_ETA),
            }
          : { mode },
      );
    },
    setDestination: (id) => update(newMission(DESTINATIONS[id], get().accelG)),
    setAccelG: (accelG) => update(newMission(get().destination, accelG)),
    togglePlay: () => {
      const { playing, ignitionCountdownS, tau, profile } = get();
      if (ignitionCountdownS !== null) return update({ ignitionCountdownS: null });
      if (playing) return update({ playing: false });
      if (tau > 0 && tau < profile.tauTotal) return update({ playing: true });
      // Partida (ou repetição): contagem regressiva antes da ignição.
      update({ tau: 0, ignitionCountdownS: COUNTDOWN_FROM_S });
      emitFlightEvents([countdown('ignition', COUNTDOWN_FROM_S)]);
    },
    seek: (tau) => update({ tau: clamp(tau, 0, get().profile.tauTotal) }),
    setTimeScale: (timeScale) => set({ timeScale }),
    setAutoStepDown: (autoStepDown) => set({ autoStepDown }),
    setManualEta: (eta) => update({ manualEta: clamp(eta, 0, MAX_MANUAL_ETA) }),

    tick: (dtRealS) => {
      const s = get();
      if (s.mode !== 'autopilot') return;

      if (s.ignitionCountdownS !== null) {
        // Contagem em segundos reais, independente de M_τ.
        const left = s.ignitionCountdownS - dtRealS;
        const events: FlightEvent[] = [];
        for (let n = 1; n < COUNTDOWN_FROM_S; n++) {
          if (s.ignitionCountdownS > n && left <= n) events.push(countdown('ignition', n));
        }
        if (left <= 0) {
          set({ ignitionCountdownS: null, playing: true });
          events.push({ type: 'milestone', kind: 'ignition' });
        } else {
          set({ ignitionCountdownS: left });
        }
        emitFlightEvents(events);
        return;
      }

      if (!s.playing) return;
      let tau = Math.min(s.tau + dtRealS * s.timeScale, s.profile.tauTotal);
      let timeScale = s.timeScale;
      if (s.autoStepDown && timeScale > 1) {
        // Detecta a entrada mesmo que um frame longo pule por cima do início.
        const entered = firstWindowStartingIn(s.criticalWindows, s.tau, tau);
        if (entered) {
          tau = entered.startTau;
          timeScale = 1;
        }
      }
      update({ tau, timeScale, playing: tau < s.profile.tauTotal });
      emitFlightEvents(detectFlightEvents(s.milestones, s.tau, tau, s.timeScale));
    },
  };
});
