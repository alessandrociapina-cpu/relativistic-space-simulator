import { describe, expect, it } from 'vitest';
import { DESTINATIONS, destinationMissionProfile } from './destinations';
import {
  ACCELERATION_PRESETS,
  SCIFI_MISSIONS,
  assessMission,
  enduranceFor,
  findPreset,
  findSciFiMission,
  presetsFor,
} from './accelerationPresets';
import { missionProfileFor } from './crewRest';

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

const YEAR = 365.25 * 86_400;
const scifi = (id: string) => SCIFI_MISSIONS.find((m) => m.id === id)!;
const scifiProfile = (id: string, restRatio?: number) => {
  const m = scifi(id);
  return missionProfileFor(DESTINATIONS[m.destinationId], m.accelG, m.coastEta, m.crew, restRatio);
};

describe('missões da ficção científica hard e projetos reais', () => {
  it('cada missão usa um preset de aceleração e um destino do catálogo, com textos completos', () => {
    expect(SCIFI_MISSIONS.map((m) => m.id)).toEqual(['venture-star', 'tau-zero', 'expanse', 'deep-sea', 'starshot']);
    for (const m of SCIFI_MISSIONS) {
      expect(findPreset(m.crew, m.accelG)).toBeDefined();
      expect(DESTINATIONS[m.destinationId]).toBeDefined();
      for (const text of [m.note, m.story, m.physics, m.simulator]) expect(text.length).toBeGreaterThan(60);
      // pt-BR: vírgula decimal nos números do texto.
      expect(`${m.note} ${m.story} ${m.physics} ${m.simulator}`).not.toMatch(/\d\.\d/);
    }
  });

  it('todas são suportáveis (com descansos, quando a tripulação precisa deles)', () => {
    for (const m of SCIFI_MISSIONS) {
      for (const restRatio of [3, 5]) {
        const profile = scifiProfile(m.id, restRatio);
        expect(assessMission(m.crew, m.accelG, profile).viability, m.id).toBe('ok');
      }
    }
    expect(scifiProfile('venture-star').crewRest).toBeDefined();
    expect(scifiProfile('expanse').crewRest).toBeDefined();
    expect(scifiProfile('deep-sea').crewRest).toBeDefined();
    expect(scifiProfile('tau-zero').crewRest).toBeUndefined();
    expect(scifiProfile('starshot').crewRest).toBeUndefined();
  });

  it('Venture Star: como no filme, ~5 anos de bordo e ~6,6 na Terra; com piloto acordado, descansos alongam a viagem', () => {
    const m = scifi('venture-star');
    const film = destinationMissionProfile(DESTINATIONS.proxima, m.accelG, m.coastEta);
    expect(film.tauTotal / YEAR).toBeCloseTo(4.93, 2);
    expect(film.tTotal / YEAR).toBeCloseTo(6.6, 2);
    expect(Math.tanh(film.etaMax)).toBeCloseTo(0.7, 12);
    // 6,7 meses de bordo até 0,7c (Newton daria 5,4).
    expect(film.burnEndTau / (YEAR / 12)).toBeCloseTo(6.72, 2);
    const awake = scifiProfile('venture-star');
    expect(awake.crewRest!.burns).toBe(22);
    expect(awake.tauTotal / YEAR).toBeCloseTo(6.55, 2);
    expect(awake.tTotal / YEAR).toBeCloseTo(8.03, 2);
  });

  it('Tau Zero: 1 g até Andrômeda em ~28,6 anos de bordo; até TRAPPIST-1, 7,28 anos de bordo e 41,5 na Terra', () => {
    const profile = scifiProfile('tau-zero');
    expect(profile.tauTotal / YEAR).toBeCloseTo(28.6, 1);
    expect(profile.tTotal / YEAR / 1e6).toBeCloseTo(2.537, 3);
    const trappist = destinationMissionProfile(DESTINATIONS.trappist1, 1, null);
    expect(trappist.tauTotal / YEAR).toBeCloseTo(7.28, 2);
    expect(trappist.tTotal / YEAR).toBeCloseTo(41.5, 1);
  });

  it('Starshot: queima de ~3,4 min até 0,2c e ~21 anos de viagem', () => {
    const profile = scifiProfile('starshot');
    expect(profile.burnEndTau / 60).toBeCloseTo(3.44, 2);
    expect(profile.tTotal / YEAR).toBeCloseTo(21.25, 2);
    expect(Math.exp(profile.etaMax)).toBeCloseTo(1.22, 2);
  });

  it('Mar profundo: centenas de queimas e de um a um ano e meio de bordo até Sirius; The Expanse, milhares', () => {
    for (const [restRatio, years] of [
      [3, 1.09],
      [5, 1.49],
    ] as const) {
      const profile = scifiProfile('deep-sea', restRatio);
      expect(profile.crewRest!.burns).toBeGreaterThan(100);
      expect(profile.crewRest!.burns).toBeLessThan(1000);
      expect(profile.tauTotal / YEAR).toBeCloseTo(years, 2);
    }
    expect(scifiProfile('expanse').crewRest!.burns).toBeGreaterThan(1000);
  });

  it('a escolha do planejamento reconhece a missão carregada, e só ela', () => {
    for (const m of SCIFI_MISSIONS) expect(findSciFiMission(m)?.id).toBe(m.id);
    const venture = scifi('venture-star');
    expect(findSciFiMission({ ...venture, coastEta: venture.coastEta! + 5e-4 })?.id).toBe('venture-star');
    expect(findSciFiMission({ ...venture, coastEta: venture.coastEta! + 0.01 })).toBeUndefined();
    expect(findSciFiMission({ ...venture, coastEta: null })).toBeUndefined();
    expect(findSciFiMission({ ...venture, crew: 'robotic' })).toBeUndefined();
    expect(findSciFiMission({ destinationId: 'proxima', crew: 'crewed', accelG: 1.61e6, coastEta: null })).toBeUndefined();
  });
});
