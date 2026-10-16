import type { FlightPhase } from '../physics/RelativityEngine';

export interface EngineSound {
  /** Fundamental do zumbido (Hz); o sub-harmônico fica uma oitava abaixo. */
  readonly humHz: number;
  /** Corte do passa-baixa do ronco (Hz). */
  readonly cutoffHz: number;
  /** Ganho do motor antes do volume geral (0–1). */
  readonly gain: number;
}

/** log₁₀γ a partir do qual o timbre para de mudar. */
const LOG10_GAMMA_SATURATION = 7;
/** Motor desligado: só um zumbido de fundo, quase inaudível. */
export const IDLE_ENGINE_GAIN = 0.06;

/**
 * Timbre do motor: o empuxo liga o ronco e log₁₀γ abre o filtro e sobe o tom,
 * acompanhando o regime relativístico sem ficar estridente.
 */
export function engineSound(gamma: number, thrusting: boolean): EngineSound {
  const x = Math.min(Math.log10(Math.max(gamma, 1)) / LOG10_GAMMA_SATURATION, 1);
  return {
    humHz: 40 + 50 * x,
    cutoffHz: 160 + 1240 * x,
    gain: thrusting ? 0.5 + 0.3 * x : IDLE_ENGINE_GAIN,
  };
}

/** Há empuxo só com o voo rodando, na aceleração ou na frenagem. */
export function isThrusting(playing: boolean, phase: FlightPhase): boolean {
  return playing && (phase === 'accelerating' || phase === 'decelerating');
}
