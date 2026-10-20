/**
 * Multiplicador de tempo próprio M_τ (§7.2) em degraus: de 0,01x a 25 anos de
 * bordo por segundo real, para cobrir da aceleração mais alta (Proxima em
 * segundos) à mais baixa (Andrômeda em séculos). O "natural" de cada missão é
 * o degrau que a faz durar ~10 min na tela.
 */
import { JULIAN_YEAR_S, type MissionProfile } from '../physics/RelativityEngine';
import type { CriticalWindow } from '../physics/criticalEvents';

export interface TimeScaleStep {
  /** Segundos de bordo por segundo real. */
  readonly value: number;
  readonly label: string;
  readonly title: string;
}

// Nenhum degrau entre 1 e 5 s/s: na demonstração a janela da CMB (68 s) cai sempre para 1 s/s.
// Rótulos em "tempo de bordo por segundo real", como o título do controle.
export const TIME_SCALE_LADDER: readonly TimeScaleStep[] = [
  { value: 0.01, label: '0,01 s/s', title: '0,01 s de bordo por segundo (câmera lenta)' },
  { value: 0.03, label: '0,03 s/s', title: '0,03 s de bordo por segundo (câmera lenta)' },
  { value: 0.1, label: '0,1 s/s', title: '0,1 s de bordo por segundo' },
  { value: 0.3, label: '0,3 s/s', title: '0,3 s de bordo por segundo' },
  { value: 1, label: '1 s/s', title: 'Tempo real: 1 segundo de bordo por segundo' },
  { value: 5, label: '5 s/s', title: '5 s de bordo por segundo' },
  { value: 20, label: '20 s/s', title: '20 s de bordo por segundo' },
  { value: 100, label: '100 s/s', title: '100 s de bordo por segundo' },
  { value: 600, label: '10 min/s', title: '10 minutos de bordo por segundo' },
  { value: 3600, label: '1 h/s', title: '1 hora de bordo por segundo' },
  { value: 21_600, label: '6 h/s', title: '6 horas de bordo por segundo' },
  { value: 86_400, label: '1 dia/s', title: '1 dia de bordo por segundo' },
  { value: 604_800, label: '1 sem/s', title: '1 semana de bordo por segundo' },
  { value: JULIAN_YEAR_S / 12, label: '1 mês/s', title: '1 mês de bordo por segundo' },
  { value: JULIAN_YEAR_S / 4, label: '3 meses/s', title: '3 meses de bordo por segundo' },
  { value: JULIAN_YEAR_S, label: '1 ano/s', title: '1 ano de bordo por segundo' },
  { value: 5 * JULIAN_YEAR_S, label: '5 anos/s', title: '5 anos de bordo por segundo' },
  { value: 25 * JULIAN_YEAR_S, label: '25 anos/s', title: '25 anos de bordo por segundo' },
];

/** Duração na tela de uma viagem no degrau "natural". */
export const TARGET_TRIP_REAL_S = 600;
/** Cada janela crítica deve durar pelo menos isto em tempo real depois do Auto-Step Down. */
export const MIN_WINDOW_REAL_S = 20;
/** Trocar de missão mantém o multiplicador se a nova viagem durar entre isto na tela. */
const KEEP_TRIP_REAL_S = { min: 20, max: 3 * 3600 } as const;

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

/** Mantém o multiplicador se a nova viagem ainda dura um tempo razoável na tela; senão, o natural. */
export function timeScaleForMission(current: number, profile: MissionProfile): number {
  const realS = profile.tauTotal / current;
  return ladderIndex(current) >= 0 && realS >= KEEP_TRIP_REAL_S.min && realS <= KEEP_TRIP_REAL_S.max
    ? current
    : naturalTimeScale(profile);
}

/** Degrau vizinho (−1 mais lento, +1 mais rápido); fica no extremo da escada. */
export function adjacentTimeScale(current: number, direction: -1 | 1): number {
  const i = ladderIndex(current);
  if (i < 0) {
    // Fora da escada: o primeiro degrau na direção pedida.
    const next = direction > 0 ? TIME_SCALE_LADDER.find((s) => s.value > current) : [...TIME_SCALE_LADDER].reverse().find((s) => s.value < current);
    return (next ?? TIME_SCALE_LADDER[direction > 0 ? TIME_SCALE_LADDER.length - 1 : 0]!).value;
  }
  return TIME_SCALE_LADDER[Math.min(Math.max(i + direction, 0), TIME_SCALE_LADDER.length - 1)]!.value;
}

/** Cada fase de um roteiro (§4.2.11) começa no degrau que a faz durar perto disto na tela (s reais). */
export const PHASE_REAL_S = 40;

/** O degrau mais próximo (em escala log) do que faz uma fase de `durationS` de bordo durar ~40 s na tela. */
export function phaseTimeScale(durationS: number): number {
  const target = Math.log(durationS / PHASE_REAL_S);
  return TIME_SCALE_LADDER.reduce((best, s) => (Math.abs(Math.log(s.value) - target) < Math.abs(Math.log(best) - target) ? s.value : best), 1);
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
  return TIME_SCALE_LADDER[ladderIndex(value)] ?? { value, label: `${value} s/s`, title: `${value} s de bordo por segundo` };
}
