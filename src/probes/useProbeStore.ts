import { useEffect } from 'react';
import { create } from 'zustand';
import { BODIES, isMoon } from './bodies';
import { ALL_EVENTS, MISSIONS, craft, type MissionEvent, type ProbeId } from './missions';
import { AU_KM, distanceTo, probePosition } from './probes';
import type { FocusId, ScaleMode } from './sceneMath';
import { DAYS_PER_YEAR, isoToDays } from './time';

export type { FocusId, ScaleMode } from './sceneMath';

/** Datas cobertas pelo simulador: da Venera 7 (1970) ao fim das tabelas do JPL (2036). */
export const PROBE_TIME_RANGE = { start: isoToDays('1970-08-01'), end: isoToDays('2035-12-31') } as const;
/** Abre pouco antes do lançamento da Voyager 2. */
const INITIAL_T = isoToDays('1977-08-10');

export interface ProbeRate {
  /** Dias por segundo real. */
  readonly value: number;
  readonly label: string;
}

export const PROBE_RATES: readonly ProbeRate[] = [
  { value: 1 / 24, label: '1 h/s' },
  { value: 0.25, label: '6 h/s' },
  { value: 1, label: '1 dia/s' },
  { value: 7, label: '1 sem/s' },
  { value: DAYS_PER_YEAR / 12, label: '1 mês/s' },
  { value: DAYS_PER_YEAR, label: '1 ano/s' },
];

/** Perto de cada encontro da sonda escolhida (±3 dias) o tempo desacelera para 6 h/s: o encontro dura ~24 s na tela. */
export const FLYBY_SLOWDOWN = { windowDays: 3, rate: 0.25 } as const;
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
  showEvent: (id: string | null) => void;
  /** Vai para o evento: pausa, foca o corpo certo e abre o cartão. */
  jumpToEvent: (id: string) => void;
  tick: (dtRealS: number) => void;
}

const clampT = (t: number) => Math.min(Math.max(t, PROBE_TIME_RANGE.start), PROBE_TIME_RANGE.end);
const slowStart = (e: MissionEvent) => e.t - FLYBY_SLOWDOWN.windowDays;

/**
 * Onde a câmera fica num evento: perto do corpo, em escala real (a órbita de
 * captura inteira, na inserção; o Sol, no periélio); nos demais, a sonda na
 * escala atual.
 */
export function eventView(event: MissionEvent): { focus: FocusId; scale: ScaleMode | null; distance: number | null } {
  if (event.kind === 'perihelion') return { focus: 'sun', scale: 'linear', distance: 0.25 };
  if (event.capture) return { focus: event.capture.body, scale: 'linear', distance: (event.capture.apoapsisKm * 1.25) / AU_KM };
  if (event.body) {
    // ~60 raios do corpo (40 numa lua), ou mais longe se a sonda estiver além disso (a Rosetta chega ao cometa a 120 km).
    const p = probePosition(craft(event.craft ?? event.probeId).trajectory, event.t);
    const away = p ? (distanceTo(p, event.body, event.t) ?? 0) : 0;
    const radii = (BODIES[event.body].radiusKm * (isMoon(event.body) ? 40 : 60)) / AU_KM;
    return { focus: event.body, scale: 'linear', distance: Math.max(radii, 2.5 * away) };
  }
  return { focus: event.craft ?? event.probeId, scale: null, distance: null };
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
    if (s.autoSlow && rate > FLYBY_SLOWDOWN.rate) {
      // Entrada na janela de um encontro, mesmo que um frame longo pule por cima dela.
      const entered = events.find((e) => SLOW_KINDS.has(e.kind) && slowStart(e) > s.t && slowStart(e) <= t);
      if (entered) {
        t = slowStart(entered);
        slowdown = { until: entered.t + FLYBY_SLOWDOWN.windowDays, resumeRate: rate };
        rate = FLYBY_SLOWDOWN.rate;
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
