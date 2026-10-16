import { describe, expect, it } from 'vitest';
import { DESTINATIONS, destinationMissionProfile } from '../physics/destinations';
import { computeCriticalWindows } from '../physics/criticalEvents';
import {
  naturalTimeScale,
  stepDownTimeScale,
  timeScaleForMission,
  timeScaleOptions,
  type TimeScaleStep,
} from './timeScales';

const labels = (steps: readonly TimeScaleStep[]) => steps.map((s) => s.label);
const demo = destinationMissionProfile(DESTINATIONS.proxima);
const proxima1g = destinationMissionProfile(DESTINATIONS.proxima, 1);
const andromeda1g = destinationMissionProfile(DESTINATIONS.andromeda, 1);

describe('degraus do multiplicador por missão', () => {
  it('demonstração: 0,1x a 100x, com 1x como natural', () => {
    expect(labels(timeScaleOptions(demo))).toEqual(['0,1x', '1x', '5x', '20x', '100x']);
    expect(naturalTimeScale(demo)).toBe(1);
  });

  it('1 g até Proxima (3,5 anos de bordo): de 1 h/s a 1 ano/s, natural 1 dia/s', () => {
    expect(labels(timeScaleOptions(proxima1g))).toEqual(['1 h/s', '1 dia/s', '1 sem/s', '1 mês/s', '1 ano/s']);
    expect(naturalTimeScale(proxima1g)).toBe(86_400);
  });

  it('1 g até Andrômeda (28,6 anos): os cinco degraus mais rápidos, natural 1 mês/s', () => {
    expect(labels(timeScaleOptions(andromeda1g)).at(-1)).toBe('1 ano/s');
    expect(andromeda1g.tauTotal / naturalTimeScale(andromeda1g) / 60).toBeCloseTo(5.7, 1);
  });

  it('trocar de missão mantém o multiplicador quando ele continua disponível', () => {
    expect(timeScaleForMission(20, destinationMissionProfile(DESTINATIONS.sirius))).toBe(20);
    expect(timeScaleForMission(20, proxima1g)).toBe(86_400);
    expect(timeScaleForMission(604_800, andromeda1g)).toBe(604_800);
  });
});

describe('Auto-Step Down generalizado', () => {
  it('na demonstração reduz sempre para 1x (§7.2)', () => {
    for (const w of computeCriticalWindows(demo)) expect(stepDownTimeScale(w)).toBe(1);
  });

  it('a 1 g, cada janela crítica passa a durar ≥ 20 s reais, no maior degrau possível', () => {
    for (const w of computeCriticalWindows(andromeda1g)) {
      const scale = stepDownTimeScale(w);
      expect(scale).toBeGreaterThan(1);
      expect((w.endTau - w.startTau) / scale).toBeGreaterThanOrEqual(20);
    }
    const preFlip = computeCriticalWindows(proxima1g).find((w) => w.kind === 'pre-flip')!;
    expect(stepDownTimeScale(preFlip)).toBe(86_400);
  });
});
