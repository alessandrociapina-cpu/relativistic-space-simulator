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

interface FlightStore {
  readonly mode: FlightMode;
  readonly destination: Destination;
  /** Aceleração própria em múltiplos de g₀. */
  readonly accelG: number;
  readonly profile: MissionProfile;
  readonly criticalWindows: readonly CriticalWindow[];
  /** Tempo próprio do Autopilot (s). */
  readonly tau: number;
  readonly playing: boolean;
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
  return {
    destination,
    accelG,
    profile,
    criticalWindows: computeCriticalWindows(profile),
    tau: 0,
    playing: false,
  };
}

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
          ? { mode, playing: false, manualEta: Math.min(get().flight.eta, MAX_MANUAL_ETA) }
          : { mode },
      );
    },
    setDestination: (id) => update(newMission(DESTINATIONS[id], get().accelG)),
    setAccelG: (accelG) => update(newMission(get().destination, accelG)),
    togglePlay: () => {
      const { playing, tau, profile } = get();
      if (playing) update({ playing: false });
      else update({ playing: true, tau: tau >= profile.tauTotal ? 0 : tau });
    },
    seek: (tau) => update({ tau: clamp(tau, 0, get().profile.tauTotal) }),
    setTimeScale: (timeScale) => set({ timeScale }),
    setAutoStepDown: (autoStepDown) => set({ autoStepDown }),
    setManualEta: (eta) => update({ manualEta: clamp(eta, 0, MAX_MANUAL_ETA) }),

    tick: (dtRealS) => {
      const s = get();
      if (s.mode !== 'autopilot' || !s.playing) return;
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
    },
  };
});
