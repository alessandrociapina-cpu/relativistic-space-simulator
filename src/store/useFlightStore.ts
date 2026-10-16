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
  computeEyeTimeline,
  computePhotometryAndEyeState,
  type EyeTimeline,
  type PhotometryAndEyeState,
} from '../physics/EyeAndPhotometry';
import { computeBodyAngularRadii } from '../physics/sky';
import { activeEffects, newAnnouncements, type EffectId } from '../ui/explanations';
import { stepDownTimeScale, timeScaleForMission } from './timeScales';
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

/** Faixa do slider logarítmico do Cruzeiro Livre: log₁₀γ ∈ [0, 7,5] (η ≈ 18). */
export const MAX_LOG10_GAMMA = 7.5;
export const MAX_MANUAL_ETA = rapidityFromLog10Gamma(MAX_LOG10_GAMMA);

export interface FlightStore {
  readonly mode: FlightMode;
  readonly destination: Destination;
  /** Aceleração própria em múltiplos de g₀. */
  readonly accelG: number;
  /** Rapidez de cruzeiro (acelerar, cruzar e frear); `null` no Flip-and-Burn. */
  readonly coastEta: number | null;
  readonly profile: MissionProfile;
  readonly criticalWindows: readonly CriticalWindow[];
  readonly milestones: readonly Milestone[];
  /** Adaptação do olho pré-calculada para a missão inteira. */
  readonly eyeTimeline: EyeTimeline;
  /** Tempo próprio do Autopilot (s). */
  readonly tau: number;
  readonly playing: boolean;
  /** Segundos reais até a ignição durante a contagem regressiva; `null` fora dela. */
  readonly ignitionCountdownS: number | null;
  /** Multiplicador de tempo próprio M_τ: segundos de bordo por segundo real (ver `timeScales`). */
  readonly timeScale: number;
  /** Desacelera M_τ ao entrar em um evento crítico (1x na demonstração). */
  readonly autoStepDown: boolean;
  /** Rapidez imposta no Cruzeiro Livre. */
  readonly manualEta: number;
  /** Snapshot cinemático lido pelos monitores e pelo HUD. */
  readonly flight: FlightState;
  /** Luz da CMB à frente, olho do piloto e auto-zoom, no mesmo instante de `flight`. */
  readonly photometry: PhotometryAndEyeState;
  /** Último efeito que começou em voo (cartão do modo Explicar); `null` se não há ou foi dispensado. */
  readonly insight: EffectId | null;
  /** Efeitos já anunciados nesta missão: cada um ganha um cartão por voo. */
  readonly announcedEffects: readonly EffectId[];

  setMode: (mode: FlightMode) => void;
  setDestination: (id: DestinationId) => void;
  setAccelG: (accelG: number) => void;
  setCoastEta: (coastEta: number | null) => void;
  /** Partida (com contagem regressiva a partir de τ = 0), pausa, retomada ou aborto da contagem. */
  togglePlay: () => void;
  seek: (tau: number) => void;
  setTimeScale: (timeScale: number) => void;
  setAutoStepDown: (on: boolean) => void;
  setManualEta: (eta: number) => void;
  showInsight: (id: EffectId | null) => void;
  /** Avança o relógio de bordo por `dtRealS` segundos reais (chamado a cada frame). */
  tick: (dtRealS: number) => void;
}

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

function deriveFlight(profile: MissionProfile, tau: number, mode: FlightMode, manualEta: number): FlightState {
  const state = computeFlightState(profile, tau);
  return mode === 'manual' ? withRapidity(state, manualEta) : state;
}

function derivePhotometry(
  flight: FlightState,
  { profile, eyeTimeline, destination }: Pick<FlightStore, 'profile' | 'eyeTimeline' | 'destination'>,
): PhotometryAndEyeState {
  const targetRadiusRad = computeBodyAngularRadii(flight, destination).targetRadiusRad;
  return computePhotometryAndEyeState(flight, profile, eyeTimeline, targetRadiusRad);
}

/** Explicações de um voo novo: nenhum efeito anunciado ainda. */
function newFlightLog(): Pick<FlightStore, 'insight' | 'announcedEffects'> {
  return { insight: null, announcedEffects: [] };
}

/** Nova missão parada no instante da partida. */
function newMission(destination: Destination, accelG: number, coastEta: number | null) {
  const profile = destinationMissionProfile(destination, accelG, coastEta);
  const criticalWindows = computeCriticalWindows(profile);
  return {
    destination,
    accelG,
    coastEta,
    profile,
    criticalWindows,
    milestones: computeMilestones(profile, criticalWindows),
    eyeTimeline: computeEyeTimeline(profile),
    tau: 0,
    playing: false,
    ignitionCountdownS: null,
    ...newFlightLog(),
  };
}

const countdown = (target: MilestoneKind, secondsLeft: number): FlightEvent => ({
  type: 'countdown',
  target,
  secondsLeft,
});

export const useFlightStore = create<FlightStore>()((set, get) => {
  /** Aplica `patch` e recalcula os snapshots `flight` e `photometry`. */
  const update = (patch: Partial<FlightStore>) => {
    const next = { ...get(), ...patch };
    const flight = deriveFlight(next.profile, next.tau, next.mode, next.manualEta);
    set({ ...patch, flight, photometry: derivePhotometry(flight, next) });
  };

  const initial = newMission(DESTINATIONS.proxima, DESTINATIONS.proxima.defaultAccelG, null);
  /** Troca de missão: mantém o multiplicador se ele ainda faz sentido para a nova viagem. */
  const remission = (destination: Destination, accelG: number, coastEta: number | null) => {
    const mission = newMission(destination, accelG, coastEta);
    update({ ...mission, timeScale: timeScaleForMission(get().timeScale, mission.profile) });
  };
  const initialFlight = computeFlightState(initial.profile, 0);

  return {
    ...initial,
    mode: 'autopilot',
    timeScale: 1,
    autoStepDown: true,
    manualEta: 0,
    flight: initialFlight,
    photometry: derivePhotometry(initialFlight, initial),

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
    setDestination: (id) => remission(DESTINATIONS[id], get().accelG, get().coastEta),
    setAccelG: (accelG) => remission(get().destination, accelG, get().coastEta),
    setCoastEta: (coastEta) => remission(get().destination, get().accelG, coastEta),
    togglePlay: () => {
      const { playing, ignitionCountdownS, tau, profile } = get();
      if (ignitionCountdownS !== null) return update({ ignitionCountdownS: null });
      if (playing) return update({ playing: false });
      if (tau > 0 && tau < profile.tauTotal) return update({ playing: true });
      // Partida (ou repetição): contagem regressiva antes da ignição.
      update({ tau: 0, ignitionCountdownS: COUNTDOWN_FROM_S, ...newFlightLog() });
      emitFlightEvents([countdown('ignition', COUNTDOWN_FROM_S)]);
    },
    // O scrub não anuncia efeitos e dispensa o cartão, que falaria de outro instante.
    seek: (tau) => update({ tau: clamp(tau, 0, get().profile.tauTotal), insight: null }),
    setTimeScale: (timeScale) => set({ timeScale }),
    setAutoStepDown: (autoStepDown) => set({ autoStepDown }),
    setManualEta: (eta) => update({ manualEta: clamp(eta, 0, MAX_MANUAL_ETA) }),
    showInsight: (insight) => set({ insight }),

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
      if (s.autoStepDown) {
        // Detecta a entrada mesmo que um frame longo pule por cima do início.
        const entered = firstWindowStartingIn(s.criticalWindows, s.tau, tau);
        const slower = entered ? stepDownTimeScale(entered) : timeScale;
        if (entered && slower < timeScale) {
          tau = entered.startTau;
          timeScale = slower;
        }
      }
      update({ tau, timeScale, playing: tau < s.profile.tauTotal });
      emitFlightEvents(detectFlightEvents(s.milestones, s.tau, tau, s.timeScale));

      // Efeitos que começaram neste passo: o mais próprio do instante vira o cartão.
      const fresh = newAnnouncements(activeEffects(s), activeEffects(get()), s.announcedEffects);
      if (fresh.length > 0) set({ insight: fresh[0]!, announcedEffects: [...s.announcedEffects, ...fresh] });
    },
  };
});
