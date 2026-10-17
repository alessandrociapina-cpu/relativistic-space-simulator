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

  it('a 1 g a viagem tripulada a Proxima é suportável; a 30 g o empuxo contínuo dura meses e passa do limite', () => {
    expect(assess('crewed', 1).viability).toBe('ok');
    const fast = assess('crewed', 30);
    expect(fast.viability).toBe('over-limit');
    expect(fast.rests).toBe(false);
    expect(fast.burnS / 86_400).toBeGreaterThan(100);
  });

  it('a aceleração personalizada aguenta o mesmo que o preset vizinho (3 g, 6 g, 10 g, 30 g)', () => {
    for (const preset of presetsFor('crewed').filter((p) => !p.hypothetical && p.accelG > 1.5)) {
      for (const g of [preset.accelG * 0.97, preset.accelG * 1.03]) {
        expect(enduranceFor('crewed', g).enduranceS).toBe(preset.enduranceS);
      }
    }
    // Dentro de cada faixa a tolerância não cresce com a aceleração: só muda de faixa para faixa (de proteção).
    const sweep = [1, 1.3, 2, 3, 3.4, 3.6, 5, 6, 6.4, 6.6, 9, 10, 11.9, 12.1, 30, 49];
    for (let i = 1; i < sweep.length; i++) {
      const [a, b] = [enduranceFor('crewed', sweep[i - 1]!), enduranceFor('crewed', sweep[i]!)];
      if (a.protection === b.protection) expect(b.enduranceS).toBeLessThanOrEqual(a.enduranceS);
    }
    expect(enduranceFor('crewed', 3.4).protection).toBe('assento reclinado contra o empuxo');
    expect(enduranceFor('crewed', 6.4).protection).toBe('traje anti-G');
    expect(enduranceFor('crewed', 11).protection).toBe('imersão em líquido');
  });

  it('as tolerâncias são frases completas, sem "aguenta" solto', () => {
    for (const p of ACCELERATION_PRESETS) expect(p.enduranceText).toMatch(/^(suportável por|suporta|nenhum)/);
    expect(enduranceFor('crewed', 8).text).toBe('suportável por até ~3 dias');
    expect(enduranceFor('robotic', 500).text).toBe('suporta empuxo contínuo');
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
