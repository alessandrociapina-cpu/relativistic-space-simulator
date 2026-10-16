import { describe, expect, it } from 'vitest';
import { DESTINATIONS, destinationMissionProfile } from '../physics/destinations';
import { computeCriticalWindows } from '../physics/criticalEvents';
import {
  TIME_SCALE_LADDER,
  adjacentTimeScale,
  naturalTimeScale,
  stepDownTimeScale,
  timeScaleForMission,
  timeScaleStep,
} from './timeScales';

const demo = destinationMissionProfile(DESTINATIONS.proxima);
const proxima1g = destinationMissionProfile(DESTINATIONS.proxima, 1);
const andromeda1g = destinationMissionProfile(DESTINATIONS.andromeda, 1);

describe('degraus do multiplicador', () => {
  it('a escada vai de 0,01x a 25 anos/s, em ordem crescente', () => {
    expect(TIME_SCALE_LADDER[0]!.label).toBe('0,01x');
    expect(TIME_SCALE_LADDER.at(-1)!.label).toBe('25 anos/s');
    for (let i = 1; i < TIME_SCALE_LADDER.length; i++) {
      expect(TIME_SCALE_LADDER[i]!.value).toBeGreaterThan(TIME_SCALE_LADDER[i - 1]!.value);
    }
  });

  it('natural: 1x na demonstração, 1 dia/s a 1 g até Proxima, 1 mês/s até Andrômeda', () => {
    expect(naturalTimeScale(demo)).toBe(1);
    expect(naturalTimeScale(proxima1g)).toBe(86_400);
    expect(andromeda1g.tauTotal / naturalTimeScale(andromeda1g) / 60).toBeCloseTo(5.7, 1);
  });

  it('acelerações extremas: câmera lenta a 10⁷ g, séculos por segundo a 0,1 g até Andrômeda', () => {
    expect(naturalTimeScale(destinationMissionProfile(DESTINATIONS.proxima, 1e7))).toBeLessThan(1);
    const slow = destinationMissionProfile(DESTINATIONS.andromeda, 0.1);
    expect(slow.tauTotal / naturalTimeScale(slow)).toBeLessThan(1200);
  });

  it('◀ e ▶ percorrem a escada inteira e param nos extremos', () => {
    expect(adjacentTimeScale(1, 1)).toBe(5);
    expect(adjacentTimeScale(1, -1)).toBe(0.3);
    expect(adjacentTimeScale(0.01, -1)).toBe(0.01);
    expect(adjacentTimeScale(TIME_SCALE_LADDER.at(-1)!.value, 1)).toBe(TIME_SCALE_LADDER.at(-1)!.value);
    expect(adjacentTimeScale(2, 1)).toBe(5);
    expect(adjacentTimeScale(2, -1)).toBe(1);
    expect(timeScaleStep(86_400).label).toBe('1 dia/s');
  });

  it('trocar de missão mantém o multiplicador se a nova viagem ainda dura de 20 s a 3 h na tela', () => {
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
