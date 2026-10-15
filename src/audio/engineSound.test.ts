import { describe, expect, it } from 'vitest';
import { IDLE_ENGINE_GAIN, engineSound, isThrusting } from './engineSound';

describe('timbre do motor', () => {
  it('em repouso e sem empuxo: grave, fechado e quase mudo', () => {
    expect(engineSound(1, false)).toEqual({ humHz: 40, cutoffHz: 160, gain: IDLE_ENGINE_GAIN });
  });

  it('o empuxo liga o ronco e γ sobe o tom e abre o filtro', () => {
    const low = engineSound(10, true);
    const high = engineSound(1e5, true);
    expect(low.gain).toBeGreaterThan(IDLE_ENGINE_GAIN);
    expect(high.humHz).toBeGreaterThan(low.humHz);
    expect(high.cutoffHz).toBeGreaterThan(low.cutoffHz);
    expect(high.gain).toBeGreaterThan(low.gain);
  });

  it('satura a partir de γ = 10⁷ (Andrômeda soa como Proxima no pico)', () => {
    expect(engineSound(2e12, true)).toEqual(engineSound(1e7, true));
    expect(engineSound(1e7, true)).toEqual({ humHz: 90, cutoffHz: 1400, gain: 0.8 });
  });
});

describe('empuxo', () => {
  it('só no Autopilot rodando, na aceleração ou na frenagem', () => {
    expect(isThrusting('autopilot', true, 'accelerating')).toBe(true);
    expect(isThrusting('autopilot', true, 'decelerating')).toBe(true);
    expect(isThrusting('autopilot', false, 'accelerating')).toBe(false);
    expect(isThrusting('autopilot', true, 'arrived')).toBe(false);
    expect(isThrusting('manual', true, 'cruise')).toBe(false);
  });
});
