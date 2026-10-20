import { describe, expect, it } from 'vitest';
import { DESTINATIONS, destinationMissionProfile } from './destinations';
import { rocketMassRatio } from './RelativityEngine';
import {
  ACCELERATION_PRESETS,
  SCIFI_MISSIONS,
  assessMission,
  enduranceFor,
  findPreset,
  findSciFiMission,
  presetsFor,
} from './accelerationPresets';
import { choiceProfile } from './crewRest';
import { ORIGINS, missionDestination } from './origins';

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
/** O alvo da missão visto da partida dela. */
const scifiTarget = (id: string) => {
  const m = scifi(id);
  return missionDestination(ORIGINS[m.originId ?? 'sol'], m.destinationId);
};
const scifiProfile = (id: string, restRatio?: number) => {
  const m = scifi(id);
  return choiceProfile({ destination: scifiTarget(id), accelG: m.accelG, coastEta: m.coastEta, crew: m.crew, script: m.script, ...(restRatio && { restRatio }) });
};
const choiceOf = (id: string) => ({ ...scifi(id), originId: scifi(id).originId ?? ('sol' as const) });

describe('missões da ficção científica hard e projetos reais', () => {
  it('cada missão usa um preset de aceleração e um destino do catálogo, com textos completos', () => {
    expect(SCIFI_MISSIONS.map((m) => m.id)).toEqual([
      'venture-star',
      'hail-mary',
      'blip-a',
      'tau-zero',
      'tau-zero-virgem',
      'expanse',
      'deep-sea',
      'starshot',
    ]);
    for (const m of SCIFI_MISSIONS) {
      expect(findPreset(m.crew, m.accelG)).toBeDefined();
      expect(DESTINATIONS[m.destinationId]).toBeDefined();
      for (const text of [m.note, m.story, m.physics, m.simulator]) expect(text.length).toBeGreaterThan(60);
      // pt-BR: vírgula decimal nos números do texto.
      expect(`${m.note} ${m.story} ${m.physics} ${m.simulator}`).not.toMatch(/\d\.\d/);
    }
  });

  it('todas são suportáveis (com descansos, quando a tripulação humana precisa deles)', () => {
    for (const m of SCIFI_MISSIONS) {
      for (const restRatio of [3, 5]) {
        const profile = scifiProfile(m.id, restRatio);
        expect(assessMission(m.crew, m.accelG, profile).viability, m.id).toBe('ok');
      }
    }
    for (const id of ['venture-star', 'hail-mary', 'expanse', 'deep-sea']) expect(scifiProfile(id).crewRest, id).toBeDefined();
    for (const id of ['blip-a', 'tau-zero', 'tau-zero-virgem', 'starshot']) expect(scifiProfile(id).crewRest, id).toBeUndefined();
  });

  it('Venture Star: até Alfa Centauri A, como no filme, ~5 anos de bordo; com piloto acordado, descansos alongam a viagem', () => {
    const m = scifi('venture-star');
    expect(m.destinationId).toBe('alphaCenA');
    const film = destinationMissionProfile(DESTINATIONS.alphaCenA, m.accelG, m.coastEta);
    expect(film.tauTotal / YEAR).toBeCloseTo(5.05, 2);
    expect(film.tTotal / YEAR).toBeCloseTo(6.77, 2);
    expect(Math.tanh(film.etaMax)).toBeCloseTo(0.7, 12);
    // 6,7 meses de bordo até 0,7c (Newton daria 5,4).
    expect(film.burnEndTau / (YEAR / 12)).toBeCloseTo(6.72, 2);
    const awake = scifiProfile('venture-star');
    expect(awake.crewRest!.burns).toBe(22);
    expect(awake.tauTotal / YEAR).toBeCloseTo(6.68, 2);
    expect(awake.tTotal / YEAR).toBeCloseTo(8.2, 2);
  });

  it('Hail Mary: 1,5 g até Tau Ceti em 3,9 anos de bordo e 13,1 na Terra, a 0,995c, razão de massa ~416', () => {
    const m = scifi('hail-mary');
    const book = destinationMissionProfile(DESTINATIONS.tauCeti, m.accelG, m.coastEta);
    expect(book.tauTotal / YEAR).toBeCloseTo(3.9, 1);
    expect(book.tTotal / YEAR).toBeCloseTo(13.14, 2);
    expect(Math.tanh(book.etaMax)).toBeCloseTo(0.995, 3);
    expect(Math.exp(2 * book.etaMax)).toBeCloseTo(416, -1);
    // Acordado, com descansos, a viagem passa de 9 anos de bordo.
    expect(scifiProfile('hail-mary').tauTotal / YEAR).toBeGreaterThan(9);
  });

  it('Blip-A: de Erid a Tau Ceti (10,1 anos-luz) a 2,09 g, 2,9 anos de bordo, contra 4,3 anos e 4,6c pela conta de Newton', () => {
    const m = scifi('blip-a');
    expect(m.originId).toBe('eridani40');
    expect(m.crew).toBe('eridian');
    const target = scifiTarget('blip-a');
    expect(target.distanceLy).toBeCloseTo(10.08, 2);
    const profile = scifiProfile('blip-a');
    expect(profile.tauTotal / YEAR).toBeCloseTo(2.93, 2);
    expect(Math.tanh(profile.etaMax)).toBeCloseTo(0.9964, 4);
    expect(Math.exp(2 * profile.etaMax)).toBeCloseTo(561, -1);
    // Newton: metade do caminho com d/2 = ½·a·t², v = a·t.
    const a = m.accelG * 9.80665;
    const halfS = Math.sqrt((target.distanceLy * 9.4607304725808e15) / a);
    expect((2 * halfS) / YEAR).toBeCloseTo(4.32, 2);
    expect((a * halfS) / 299_792_458).toBeCloseTo(4.66, 2);
    expect(Math.exp((2 * a * halfS) / 299_792_458)).toBeGreaterThan(11_000);
  });

  it('Tau Zero, o plano: 1 g até Beta Virginis (35,65 anos-luz) em 7,09 anos de bordo e 37,5 na Terra', () => {
    expect(scifi('tau-zero').destinationId).toBe('betaVirginis');
    const profile = scifiProfile('tau-zero');
    expect(profile.tauTotal / YEAR).toBeCloseTo(7.09, 2);
    expect(profile.tTotal / YEAR).toBeCloseTo(37.5, 1);
    expect(profile.gammaMax).toBeCloseTo(19.4, 1);
    expect(Math.tanh(profile.etaMax)).toBeCloseTo(0.9987, 4);
    expect(rocketMassRatio(profile)).toBeCloseTo(1500, -2);
  });

  it('Tau Zero, a fuga: o roteiro do capítulo 10, em seis fases até o vazio, a 40 milhões de anos-luz rumo a Virgem', () => {
    const m = scifi('tau-zero-virgem');
    expect(m.script).toBe('tau-zero');
    expect(m.destinationId).toBe('intergalacticVoid');
    const profile = scifiProfile('tau-zero-virgem');
    expect(profile.script?.phases).toHaveLength(6);
    expect(profile.tauTotal / YEAR).toBeCloseTo(4.89, 2);
    expect(profile.tTotal / YEAR / 1e6).toBeCloseTo(40, 3);
    expect(profile.gammaMax / 1e8).toBeCloseTo(1.45, 2);
    // e^(2η) ≈ 10¹⁷: o foguete de fótons não daria conta; o estatorreator recolhe o combustível do caminho.
    expect(Math.log10(rocketMassRatio(profile))).toBeCloseTo(16.9, 1);
    // Os campos internos seguram 1 g a bordo: o veredito é suportável, sem descansos.
    expect(assessMission(m.crew, m.accelG, profile).endurance.enduranceS).toBe(Infinity);
    // A escolha da ficção leva o roteiro, e o link volta a ela.
    expect(findSciFiMission({ ...choiceOf('tau-zero-virgem') })?.id).toBe('tau-zero-virgem');
    expect(findSciFiMission({ ...choiceOf('tau-zero-virgem'), script: undefined })).toBeUndefined();
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

  it('a escolha do planejamento reconhece a missão carregada, e só ela (com a partida certa)', () => {
    for (const m of SCIFI_MISSIONS) expect(findSciFiMission(choiceOf(m.id))?.id).toBe(m.id);
    const venture = choiceOf('venture-star');
    expect(findSciFiMission({ ...venture, coastEta: venture.coastEta! + 5e-4 })?.id).toBe('venture-star');
    expect(findSciFiMission({ ...venture, coastEta: venture.coastEta! + 0.01 })).toBeUndefined();
    expect(findSciFiMission({ ...venture, coastEta: null })).toBeUndefined();
    expect(findSciFiMission({ ...venture, crew: 'robotic' })).toBeUndefined();
    // A Blip-A só com a partida de Erid.
    expect(findSciFiMission({ ...choiceOf('blip-a'), originId: 'sol' })).toBeUndefined();
    expect(findSciFiMission({ originId: 'sol', destinationId: 'proxima', crew: 'crewed', accelG: 1.61e6, coastEta: null })).toBeUndefined();
  });

  it('tripulação eridiana: 2,09 g é o peso de casa; acima, as faixas humanas na escala de Erid', () => {
    expect(presetsFor('eridian').map((p) => p.label)).toEqual(['2,09 g']);
    expect(enduranceFor('eridian', 2.09).enduranceS).toBe(Infinity);
    expect(enduranceFor('eridian', 2.4).enduranceS).toBe(Infinity);
    expect(enduranceFor('eridian', 6).enduranceS).toBe(enduranceFor('crewed', 6 / 2.09).enduranceS);
    expect(enduranceFor('eridian', 200).enduranceS).toBe(0);
  });
});
