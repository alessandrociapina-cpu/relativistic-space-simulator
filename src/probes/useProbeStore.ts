import { useEffect } from 'react';
import { create } from 'zustand';
import { BODIES, isMoon } from './bodies';
import { ALL_EVENTS, MISSIONS, craft, type MissionEvent, type ProbeId } from './missions';
import { AU_KM, distanceTo, probePosition } from './probes';
import type { FocusId, ScaleMode } from './sceneMath';
import { DAYS_PER_YEAR, isoToDays } from './time';

export type { FocusId, ScaleMode } from './sceneMath';

/** Datas cobertas pelo simulador: da Apollo 8 (dezembro de 1968) ao fim das tabelas do JPL (2036). */
export const PROBE_TIME_RANGE = { start: isoToDays('1968-12-01'), end: isoToDays('2035-12-31') } as const;
/** Abre pouco antes do lançamento da Voyager 2. */
const INITIAL_T = isoToDays('1977-08-10');

export interface ProbeRate {
  /** Dias por segundo real. */
  readonly value: number;
  readonly label: string;
}

export const PROBE_RATES: readonly ProbeRate[] = [
  { value: 1 / 1440, label: '1 min/s' },
  { value: 1 / 144, label: '10 min/s' },
  { value: 1 / 24, label: '1 h/s' },
  { value: 0.25, label: '6 h/s' },
  { value: 1, label: '1 dia/s' },
  { value: 7, label: '1 sem/s' },
  { value: DAYS_PER_YEAR / 12, label: '1 mês/s' },
  { value: DAYS_PER_YEAR, label: '1 ano/s' },
];

/** Perto de cada encontro da sonda escolhida (±3 dias) o tempo desacelera para 6 h/s: o encontro dura ~24 s na tela. */
export const FLYBY_SLOWDOWN = { windowDays: 3, rate: 0.25 } as const;
/** Nas Apollo, os eventos são separados por horas: ±20 min a 1 min/s, ~40 s na tela. */
export const APOLLO_SLOWDOWN = { windowDays: 20 / 1440, rate: 1 / 1440 } as const;
const MAX_FRAME_DT_S = 0.25;
/** Eventos em que vale desacelerar: os que acontecem perto de um corpo. */
const SLOW_KINDS: ReadonlySet<MissionEvent['kind']> = new Set(['flyby', 'capture', 'arrival', 'entry', 'landing', 'end', 'perihelion']);

/** Pedido de reposicionar a câmera (distância em unidades da cena), atendido pela cena. */
export interface ViewRequest {
  readonly distance: number | null;
  readonly nonce: number;
}

interface ProbeStore {
  readonly t: number;
  readonly playing: boolean;
  readonly rate: number;
  readonly autoSlow: boolean;
  /** Taxa a restaurar e instante em que a desaceleração de um encontro termina. */
  readonly slowdown: { readonly until: number; readonly resumeRate: number } | null;
  readonly focus: FocusId;
  readonly selected: ProbeId;
  readonly scale: ScaleMode;
  /** As outras sondas na cena (desligado: só a escolhida, as companheiras e a sonda em foco, com seus rastros). */
  readonly showOthers: boolean;
  /** Evento cujo cartão está aberto (alcançado na reprodução ou escolhido na lista). */
  readonly eventId: string | null;
  readonly view: ViewRequest;

  setT: (t: number) => void;
  togglePlay: () => void;
  setRate: (rate: number) => void;
  setAutoSlow: (on: boolean) => void;
  setFocus: (focus: FocusId) => void;
  setSelected: (id: ProbeId) => void;
  setScale: (scale: ScaleMode) => void;
  setShowOthers: (on: boolean) => void;
  showEvent: (id: string | null) => void;
  /** Vai para o evento: pausa, foca o corpo certo e abre o cartão. */
  jumpToEvent: (id: string) => void;
  tick: (dtRealS: number) => void;
}

const clampT = (t: number) => Math.min(Math.max(t, PROBE_TIME_RANGE.start), PROBE_TIME_RANGE.end);
const slowdownFor = (id: ProbeId) => (MISSIONS[id].group === 'apollo' ? APOLLO_SLOWDOWN : FLYBY_SLOWDOWN);
/** Nas Apollo todo evento desacelera; nas sondas, os que acontecem perto de um corpo. */
const isSlow = (e: MissionEvent) => MISSIONS[e.probeId].group === 'apollo' || SLOW_KINDS.has(e.kind);

/**
 * Onde a câmera fica num evento: perto do corpo, em escala real (a órbita de
 * captura inteira, na inserção; o Sol, no periélio); nos demais, a sonda na
 * escala atual.
 */
export function eventView(event: MissionEvent): { focus: FocusId; scale: ScaleMode | null; distance: number | null } {
  if (event.kind === 'perihelion') return { focus: 'sun', scale: 'linear', distance: 0.25 };
  if (event.capture) return { focus: event.capture.body, scale: 'linear', distance: (event.capture.apoapsisKm * 1.25) / AU_KM };
  if (event.body) {
    // ~60 raios do corpo (40 numa lua; 6 nas Apollo, para ver a órbita baixa e o pouso), ou mais longe se a
    // sonda estiver além disso (a Rosetta chega ao cometa a 120 km).
    const trajectory = craft(event.craft ?? event.probeId).trajectory;
    const p = probePosition(trajectory, Math.min(Math.max(event.t, trajectory.launch), trajectory.end));
    const away = p ? (distanceTo(p, event.body, event.t) ?? 0) : 0;
    // Pousos e separações de módulos de pouso: mais perto, para ver a descida.
    const lander = event.craft !== undefined && (event.kind === 'landing' || event.kind === 'release' || event.kind === 'last-contact');
    const radii = MISSIONS[event.probeId].group === 'apollo' ? 6 : lander ? 8 : isMoon(event.body) ? 40 : 60;
    return { focus: event.body, scale: 'linear', distance: Math.max((BODIES[event.body].radiusKm * radii) / AU_KM, 2.5 * away) };
  }
  return { focus: event.craft ?? event.probeId, scale: null, distance: null };
}

const SHOW_OTHERS_KEY = 'relsim:probes-others';

function loadShowOthers(): boolean {
  try {
    return localStorage.getItem(SHOW_OTHERS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const useProbeStore = create<ProbeStore>()((set, get) => ({
  t: INITIAL_T,
  playing: false,
  rate: 7,
  autoSlow: true,
  slowdown: null,
  focus: 'sun',
  selected: 'voyager2',
  scale: 'log',
  showOthers: loadShowOthers(),
  eventId: null,
  view: { distance: null, nonce: 0 },

  setT: (t) => set({ t: clampT(t), slowdown: null }),
  togglePlay: () => {
    const { playing, t } = get();
    set({ playing: !playing, t: !playing && t >= PROBE_TIME_RANGE.end ? PROBE_TIME_RANGE.start : t });
  },
  setRate: (rate) => set({ rate, slowdown: null }),
  setAutoSlow: (autoSlow) => set({ autoSlow }),
  setFocus: (focus) => set((s) => ({ focus, view: { distance: null, nonce: s.view.nonce + 1 } })),
  setSelected: (selected) => set({ selected, eventId: null }),
  setScale: (scale) => set((s) => ({ scale, view: { distance: null, nonce: s.view.nonce + 1 } })),
  setShowOthers: (showOthers) => {
    try {
      localStorage.setItem(SHOW_OTHERS_KEY, showOthers ? 'on' : 'off');
    } catch {
      // sem armazenamento: a escolha vale só nesta sessão
    }
    set({ showOthers });
  },
  showEvent: (eventId) => set({ eventId }),
  jumpToEvent: (id) => {
    const event = ALL_EVENTS.find((e) => e.id === id);
    if (!event) return;
    const view = eventView(event);
    set((s) => ({
      t: clampT(event.t),
      playing: false,
      slowdown: null,
      eventId: id,
      selected: event.probeId,
      focus: view.focus,
      scale: view.scale ?? s.scale,
      view: { distance: view.distance, nonce: s.view.nonce + 1 },
    }));
  },

  tick: (dtRealS) => {
    const s = get();
    if (!s.playing) return;
    let rate = s.rate;
    let slowdown = s.slowdown;
    let t = s.t + Math.min(dtRealS, MAX_FRAME_DT_S) * rate;
    const events = MISSIONS[s.selected].events;

    if (slowdown && t >= slowdown.until) {
      rate = slowdown.resumeRate;
      slowdown = null;
    }
    const slow = slowdownFor(s.selected);
    if (s.autoSlow && rate > slow.rate) {
      // Entrada na janela de um encontro, mesmo que um frame longo pule por cima dela.
      const entered = events.find((e) => isSlow(e) && e.t - slow.windowDays > s.t && e.t - slow.windowDays <= t);
      if (entered) {
        t = entered.t - slow.windowDays;
        slowdown = { until: entered.t + slow.windowDays, resumeRate: rate };
        rate = slow.rate;
      }
    }

    const crossed = events.filter((e) => e.t > s.t && e.t <= t);
    const playing = t < PROBE_TIME_RANGE.end;
    set({
      t: clampT(t),
      rate,
      slowdown,
      playing,
      eventId: crossed.length > 0 ? crossed[crossed.length - 1]!.id : s.eventId,
    });
  },
}));

/** Loop de tempo do simulador de sondas (requestAnimationFrame). */
export function useProbeLoop() {
  useEffect(() => {
    let last = performance.now();
    let id = requestAnimationFrame(function frame(now) {
      const dt = Math.max((now - last) / 1000, 0);
      last = now;
      useProbeStore.getState().tick(dt);
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, []);
}
