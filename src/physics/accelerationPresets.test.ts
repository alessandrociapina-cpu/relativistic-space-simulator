import { describe, expect, it } from 'vitest';
import { DESTINATIONS, destinationMissionProfile } from './destinations';
import { ACCELERATION_PRESETS, assessMission, enduranceFor, presetsFor } from './accelerationPresets';

const proxima = DESTINATIONS.proxima;
const assess = (crew: 'crewed' | 'robotic', g: number, coastEta: number | null = null) =>
  assessMission(crew, g, destinationMissionProfile(proxima, g, coastEta));

describe('acelerações por tipo de nave', () => {
  it('tripulada: de 1 g a 30 g, mais a demonstração hipotética; robótica: de 0,3 g à demonstração', () => {
    expect(presetsFor('crewed').map((p) => p.label)).toEqual(['1 g', '1,5 g', '3 g', '6 g', '10 g', '30 g', '1,61 × 10⁶ g']);
    expect(presetsFor('robotic').map((p) => p.label)).toEqual(['0,3 g', '100 g', '10 000 g', '30 000 g', '1,61 × 10⁶ g']);
    expect(new Set(ACCELERATION_PRESETS.map((p) => p.id)).size).toBe(ACCELERATION_PRESETS.length);
  });

  it('a tolerância humana cai com a aceleração; a das máquinas é contínua até ~60 000 g', () => {
    const humans = presetsFor('crewed').filter((p) => !p.hypothetical);
    for (let i = 1; i < humans.length; i++) {
      // 10 g e 30 g usam imersão: mesmo assim, a tolerância nunca passa da de 1,5 g.
      expect(humans[i]!.enduranceS).toBeLessThan(humans[0]!.enduranceS);
    }
    expect(enduranceFor('robotic', 50_000).enduranceS).toBe(Infinity);
    expect(enduranceFor('robotic', 1e5).enduranceS).toBe(0);
    expect(enduranceFor('crewed', 0.8).enduranceS).toBe(Infinity);
    expect(enduranceFor('crewed', 80).enduranceS).toBe(0);
  });

  it('a 1 g a viagem tripulada a Proxima é suportável; a 30 g o empuxo dura meses e passa do limite', () => {
    expect(assess('crewed', 1).viability).toBe('ok');
    const fast = assess('crewed', 30);
    expect(fast.viability).toBe('over-limit');
    expect(fast.burnS / 86_400).toBeGreaterThan(100);
  });

  it('a demonstração é hipotética para tripulantes e para sondas', () => {
    expect(assess('crewed', 1.61e6).viability).toBe('hypothetical');
    expect(assess('robotic', 1.61e6).viability).toBe('hypothetical');
    expect(assess('robotic', 30_000).viability).toBe('ok');
  });

  it('com cruzeiro, o maior empuxo contínuo é uma queima só', () => {
    const coast = assess('crewed', 1, Math.atanh(0.5));
    const profile = destinationMissionProfile(proxima, 1, Math.atanh(0.5));
    expect(coast.burnS).toBe(profile.burnEndTau);
    expect(coast.burnS).toBeLessThan(profile.tauTotal / 2);
  });
});
