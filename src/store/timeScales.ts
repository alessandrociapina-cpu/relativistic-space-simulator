/**
 * Multiplicador de tempo próprio M_τ (§7.2) em degraus: de 0,1x a 1 ano de
 * bordo por segundo real. Cada missão mostra os 5 degraus em torno do que a
 * faz durar ~10 min na tela; a demonstração continua com 0,1x a 100x.
 */
import { JULIAN_YEAR_S, type MissionProfile } from '../physics/RelativityEngine';
import type { CriticalWindow } from '../physics/criticalEvents';

export interface TimeScaleStep {
  /** Segundos de bordo por segundo real. */
  readonly value: number;
  readonly label: string;
  readonly title: string;
}

export const TIME_SCALE_LADDER: readonly TimeScaleStep[] = [
  { value: 0.1, label: '0,1x', title: '0,1 s de bordo por segundo' },
  { value: 1, label: '1x', title: 'Tempo real' },
  { value: 5, label: '5x', title: '5 s de bordo por segundo' },
  { value: 20, label: '20x', title: '20 s de bordo por segundo' },
  { value: 100, label: '100x', title: '100 s de bordo por segundo' },
  { value: 3600, label: '1 h/s', title: '1 hora de bordo por segundo' },
  { value: 86_400, label: '1 dia/s', title: '1 dia de bordo por segundo' },
  { value: 604_800, label: '1 sem/s', title: '1 semana de bordo por segundo' },
  { value: JULIAN_YEAR_S / 12, label: '1 mês/s', title: '1 mês de bordo por segundo' },
  { value: JULIAN_YEAR_S, label: '1 ano/s', title: '1 ano de bordo por segundo' },
];

/** Duração na tela de uma viagem no degrau "natural". */
export const TARGET_TRIP_REAL_S = 600;
/** Cada janela crítica deve durar pelo menos isto em tempo real depois do Auto-Step Down. */
export const MIN_WINDOW_REAL_S = 20;
const VISIBLE_STEPS = 5;

const ladderIndex = (value: number) => TIME_SCALE_LADDER.findIndex((s) => s.value === value);

/** Degrau mais próximo (em escala log) do que faz a viagem durar ~10 min. */
function naturalIndex(profile: MissionProfile): number {
  const target = Math.log(profile.tauTotal / TARGET_TRIP_REAL_S);
  let best = 0;
  TIME_SCALE_LADDER.forEach((s, i) => {
    if (Math.abs(Math.log(s.value) - target) < Math.abs(Math.log(TIME_SCALE_LADDER[best]!.value) - target)) best = i;
  });
  return best;
}

export const naturalTimeScale = (profile: MissionProfile) => TIME_SCALE_LADDER[naturalIndex(profile)]!.value;

/** Os 5 degraus da missão: um abaixo do natural e três acima. */
export function timeScaleOptions(profile: MissionProfile): readonly TimeScaleStep[] {
  const start = Math.min(Math.max(naturalIndex(profile) - 1, 0), TIME_SCALE_LADDER.length - VISIBLE_STEPS);
  return TIME_SCALE_LADDER.slice(start, start + VISIBLE_STEPS);
}

/** Mantém o multiplicador se ele é um dos degraus da nova missão; senão, o natural. */
export function timeScaleForMission(current: number, profile: MissionProfile): number {
  return timeScaleOptions(profile).some((s) => s.value === current) ? current : naturalTimeScale(profile);
}

/**
 * Multiplicador do Auto-Step Down ao entrar numa janela crítica: o maior
 * degrau com que ela dura ≥ 20 s reais, nunca abaixo de 1x (na demonstração,
 * sempre 1x, como na §7.2).
 */
export function stepDownTimeScale(window: CriticalWindow): number {
  const limit = Math.max(1, (window.endTau - window.startTau) / MIN_WINDOW_REAL_S);
  return TIME_SCALE_LADDER.reduce((best, s) => (s.value <= limit && s.value > best ? s.value : best), 1);
}

export function timeScaleStep(value: number): TimeScaleStep {
  return TIME_SCALE_LADDER[ladderIndex(value)] ?? { value, label: `${value}x`, title: `${value} s de bordo por segundo` };
}
