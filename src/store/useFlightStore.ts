import { create } from 'zustand';
import { computeFlightState, type FlightState, type MissionProfile } from '../physics/RelativityEngine';
import type { CrewKind } from '../physics/accelerationPresets';
import { DESTINATIONS, type Destination, type DestinationId } from '../physics/destinations';
import {
  DEFAULT_REST_RATIO,
  crewStatusAt,
  crewToleranceFor,
  missionProfileFor,
  type CrewStatus,
  type CrewTolerance,
} from '../physics/crewRest';
import { computeCriticalWindows, firstWindowStartingIn, type CriticalWindow } from '../physics/criticalEvents';
import {
  computeEyeTimeline,
  computePhotometryAndEyeState,
  type EyeTimeline,
  type PhotometryAndEyeState,
} from '../physics/EyeAndPhotometry';
import { cutEngine, engineCommandAt, engineRampTau, relightEngine } from '../physics/maneuvers';
import { computeBodyAngularRadii } from '../physics/sky';
import { activeEffects, newAnnouncements, type EffectId } from '../ui/explanations';
import { stepDownTimeScale } from './timeScales';
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

/** O que define uma missão no planejamento. */
export interface MissionChoice {
  readonly destination: Destination;
  /** Aceleração própria em múltiplos de g₀. */
  readonly accelG: number;
  /** Rapidez de cruzeiro (acelerar, cruzar e frear); `null` no Flip-and-Burn. */
  readonly coastEta: number | null;
  /** Piloto humano (olho do piloto no para-brisa) ou sonda robótica (câmeras). */
  readonly crew: CrewKind;
  /** Com piloto humano e descansos: quantas vezes o descanso dura a queima (3 ou 5). */
  readonly restRatio: number;
}

export interface FlightStore extends MissionChoice {
  /** O voo efetivo: o plano, ou o plano com os comandos do piloto no motor. */
  readonly profile: MissionProfile;
  /** O plano da missão, como saiu do planejamento. */
  readonly plannedProfile: MissionProfile;
  readonly criticalWindows: readonly CriticalWindow[];
  readonly milestones: readonly Milestone[];
  /** Adaptação do olho pré-calculada para a missão inteira. */
  readonly eyeTimeline: EyeTimeline;
  /** Tempo próprio de bordo (s). */
  readonly tau: number;
  readonly playing: boolean;
  /** Segundos reais até a ignição durante a contagem regressiva; `null` fora dela. */
  readonly ignitionCountdownS: number | null;
  /** Multiplicador de tempo próprio M_τ: segundos de bordo por segundo real (ver `timeScales`). */
  readonly timeScale: number;
  /** Desacelera M_τ ao entrar em um evento crítico (1x na demonstração). */
  readonly autoStepDown: boolean;
  /** O usuário já mexeu no multiplicador (some o aviso "acelere o tempo"). */
  readonly timeScaleTouched: boolean;
  /** Snapshot cinemático lido pelos monitores e pelo HUD. */
  readonly flight: FlightState;
  /** Luz da CMB à frente, olho do piloto e auto-zoom, no mesmo instante de `flight`. */
  readonly photometry: PhotometryAndEyeState;
  /** Tolerância do piloto humano à aceleração do plano; `null` na sonda robótica. */
  readonly crewTolerance: CrewTolerance | null;
  /** Estado da tripulação no instante de `flight` (§4.2.9); `null` na sonda robótica. */
  readonly crewStatus: CrewStatus | null;
  /** Último efeito que começou em voo (cartão do modo Explicar); `null` se não há ou foi dispensado. */
  readonly insight: EffectId | null;
  /** Efeitos já anunciados nesta missão: cada um ganha um cartão por voo. */
  readonly announcedEffects: readonly EffectId[];

  /** Nova missão (planejamento): parada em τ = 0. */
  configureMission: (choice: MissionChoice) => void;
  setDestination: (id: DestinationId) => void;
  setAccelG: (accelG: number) => void;
  setCoastEta: (coastEta: number | null) => void;
  setCrew: (crew: CrewKind) => void;
  /** Partida (com contagem regressiva a partir de τ = 0), pausa, retomada ou aborto da contagem. */
  togglePlay: () => void;
  seek: (tau: number) => void;
  setTimeScale: (timeScale: number) => void;
  setAutoStepDown: (on: boolean) => void;
  /** Desliga o motor (a aceleração cai aos poucos até zero) ou o religa (piloto automático até o alvo). */
  toggleEngine: () => void;
  showInsight: (id: EffectId | null) => void;
  /** Avança o relógio de bordo por `dtRealS` segundos reais (chamado a cada frame). */
  tick: (dtRealS: number) => void;
}

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

function derivePhotometry(
  flight: FlightState,
  { profile, eyeTimeline, destination }: Pick<FlightStore, 'profile' | 'eyeTimeline' | 'destination'>,
): PhotometryAndEyeState {
  const targetRadiusRad = computeBodyAngularRadii(flight, destination).targetRadiusRad;
  return computePhotometryAndEyeState(flight, profile, eyeTimeline, targetRadiusRad);
}

function deriveCrewStatus(
  flight: FlightState,
  { profile, crewTolerance, playing }: Pick<FlightStore, 'profile' | 'crewTolerance' | 'playing'>,
): CrewStatus | null {
  return crewTolerance && crewStatusAt(profile, flight, crewTolerance, playing || flight.tau > 0);
}

/** Explicações de um voo novo: nenhum efeito anunciado ainda. */
function newFlightLog(): Pick<FlightStore, 'insight' | 'announcedEffects'> {
  return { insight: null, announcedEffects: [] };
}

/** O voo efetivo e o que depende dele: janelas críticas, marcos e a curva de luz. */
function flightPlan(profile: MissionProfile) {
  const criticalWindows = computeCriticalWindows(profile);
  return {
    profile,
    criticalWindows,
    milestones: computeMilestones(profile, criticalWindows),
    eyeTimeline: computeEyeTimeline(profile),
  };
}

/** Nova missão parada no instante da partida. */
function newMission({ destination, accelG, coastEta, crew, restRatio }: MissionChoice) {
  // Com piloto humano além da tolerância contínua, o plano alterna queimas e descansos.
  const profile = missionProfileFor(destination, accelG, coastEta, crew, restRatio);
  return {
    destination,
    accelG,
    coastEta,
    crew,
    restRatio,
    crewTolerance: crew === 'crewed' ? crewToleranceFor(accelG, restRatio) : null,
    plannedProfile: profile,
    ...flightPlan(profile),
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
    const flight = computeFlightState(next.profile, next.tau);
    set({ ...patch, flight, photometry: derivePhotometry(flight, next), crewStatus: deriveCrewStatus(flight, next) });
  };

  // A demonstração clássica: Proxima a 1,61×10⁶ g, com o olho de um piloto (hipotético).
  const initial = newMission({
    destination: DESTINATIONS.proxima,
    accelG: DESTINATIONS.proxima.defaultAccelG,
    coastEta: null,
    crew: 'crewed',
    restRatio: DEFAULT_REST_RATIO,
  });
  /** Troca de missão: começa sempre em tempo real (1 s/s); o painel sugere acelerar. */
  const remission = (patch: Partial<MissionChoice>) => {
    const { destination, accelG, coastEta, crew, restRatio } = get();
    update({ ...newMission({ destination, accelG, coastEta, crew, restRatio, ...patch }), timeScale: 1 });
  };
  const initialFlight = computeFlightState(initial.profile, 0);

  return {
    ...initial,
    timeScale: 1,
    autoStepDown: true,
    timeScaleTouched: false,
    flight: initialFlight,
    photometry: derivePhotometry(initialFlight, initial),
    crewStatus: deriveCrewStatus(initialFlight, initial),

    configureMission: (choice) => remission(choice),
    setDestination: (id) => remission({ destination: DESTINATIONS[id] }),
    setAccelG: (accelG) => remission({ accelG }),
    setCoastEta: (coastEta) => remission({ coastEta }),
    setCrew: (crew) => remission({ crew }),
    togglePlay: () => {
      const { playing, ignitionCountdownS, tau, profile, plannedProfile } = get();
      if (ignitionCountdownS !== null) return update({ ignitionCountdownS: null });
      if (playing) return update({ playing: false });
      if (tau > 0 && tau < profile.tauTotal) return update({ playing: true });
      // Partida (ou repetição): contagem regressiva antes da ignição, de volta ao plano.
      const replan = profile === plannedProfile ? {} : flightPlan(plannedProfile);
      update({ tau: 0, ignitionCountdownS: COUNTDOWN_FROM_S, ...replan, ...newFlightLog() });
      emitFlightEvents([countdown('ignition', COUNTDOWN_FROM_S)]);
    },
    // O scrub não anuncia efeitos e dispensa o cartão, que falaria de outro instante. O slider guarda só
    // ~15 algarismos: no fim da linha do tempo, τ fica a um fio de τ_total e ainda não seria a chegada.
    seek: (tau) => {
      const { tauTotal } = get().profile;
      update({ tau: tau >= tauTotal * (1 - 1e-13) ? tauTotal : clamp(tau, 0, tauTotal), insight: null });
    },
    setTimeScale: (timeScale) => set({ timeScale, timeScaleTouched: true }),
    setAutoStepDown: (autoStepDown) => set({ autoStepDown }),
    toggleEngine: () => {
      const { profile, tau, timeScale } = get();
      const command = engineCommandAt(profile, tau);
      if (!command) return;
      const next = command === 'cut' ? cutEngine(profile, tau, engineRampTau(timeScale)) : relightEngine(profile, tau);
      // O cartão em tela falava do voo antigo (o flip planejado, por exemplo): sai.
      update({ ...flightPlan(next), insight: null });
    },
    showInsight: (insight) => set({ insight }),

    tick: (dtRealS) => {
      const s = get();
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
