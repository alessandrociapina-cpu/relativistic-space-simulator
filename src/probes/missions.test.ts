import katex from 'katex';
import { beforeEach, describe, expect, it } from 'vitest';
import moonData from './data/moons.json';
import { BODIES, MOON_LIST, bodyPosition, moonPeriodDays, type MoonId } from './bodies';
import { explainEvent } from './eventExplanations';
import { ALL_EVENTS, LIGHT_DAY_AU, MISSIONS, MISSION_LIST } from './missions';
import { AU_KM } from './probes';
import { LOG_K, LOG_R0_AU, localScale, toDisplay, viewDistance } from './sceneMath';
import { daysToMs, isoToDays } from './time';
import { FLYBY_SLOWDOWN, PROBE_TIME_RANGE, useProbeStore } from './useProbeStore';
import { norm, sub } from './vec3';

const isoDay = (days: number) => new Date(daysToMs(days)).toISOString().slice(0, 10);

describe('catálogo das sondas', () => {
  it('12 sondas, em ordem de lançamento, da Venera 7 à Parker', () => {
    expect(MISSION_LIST.map((m) => m.id)).toEqual([
      'venera7',
      'pioneer10',
      'pioneer11',
      'voyager2',
      'voyager1',
      'venera13',
      'galileo',
      'cassini',
      'rosetta',
      'newhorizons',
      'juno',
      'parker',
    ]);
    const launches = MISSION_LIST.map((m) => m.trajectory.launch);
    expect([...launches].sort((a, b) => a - b)).toEqual(launches);
    expect(PROBE_TIME_RANGE.start).toBeLessThan(MISSIONS.venera7.trajectory.launch);
  });

  it('Voyager 2: lançamento, os quatro gigantes, Tritão e a saída da heliosfera, em ordem', () => {
    expect(MISSIONS.voyager2.events.map((e) => e.title)).toEqual([
      'Lançamento da Voyager 2',
      'Sobrevoo de Júpiter',
      'Sobrevoo de Saturno',
      'Sobrevoo de Urano',
      'Sobrevoo de Netuno',
      'Sobrevoo de Tritão',
      'Choque de terminação',
      'Espaço interestelar',
    ]);
  });

  it('Galileo e Cassini: a sonda companheira se separa antes de chegar e termina no destino', () => {
    const titles = MISSIONS.galileo.events.map((e) => e.title);
    expect(titles.indexOf('A sonda atmosférica se separa')).toBeLessThan(titles.indexOf('A sonda mergulha em Júpiter'));
    expect(titles.at(-1)).toBe('Mergulho final em Júpiter');
    expect(MISSIONS.cassini.events.map((e) => e.title)).toEqual(
      expect.arrayContaining(['A Huygens se separa', 'A Huygens pousa em Titã', 'Em órbita de Saturno', 'Mergulho em Saturno']),
    );
    expect(MISSIONS.cassini.companions[0]!.trajectory.launch).toBeGreaterThan(MISSIONS.cassini.events.find((e) => e.kind === 'capture')!.t);
  });

  it('sobrevoos repetidos são numerados (Parker passa sete vezes por Vênus)', () => {
    const venus = MISSIONS.parker.events.filter((e) => e.body === 'venus').map((e) => e.title);
    expect(venus[0]).toBe('1º sobrevoo de Vênus');
    expect(venus.at(-1)).toBe('7º sobrevoo de Vênus');
    expect(MISSIONS.rosetta.events.some((e) => e.title === 'Asteroide Lutécia')).toBe(true);
  });

  it('Voyager 1 chega a um dia-luz da Terra em novembro de 2026', () => {
    const lightDay = MISSIONS.voyager1.events.find((e) => e.kind === 'light-day')!;
    expect(isoDay(lightDay.t).slice(0, 7)).toBe('2026-11');
    expect(LIGHT_DAY_AU).toBeCloseTo(173.14, 2);
  });

  it('a New Horizons cruza a distância da Lua ~8 horas depois da injeção', () => {
    const e = MISSIONS.newhorizons.events.find((x) => x.id === 'newhorizons-moon-orbit')!;
    expect((e.t - MISSIONS.newhorizons.trajectory.launch) * 24).toBeCloseTo(8, 0);
  });
});

describe('explicações dos eventos', () => {
  it('todas têm texto limpo e fórmulas válidas no KaTeX estrito', () => {
    for (const event of ALL_EVENTS) {
      const { title, summary, details, formulas } = explainEvent(event);
      expect(title.length, event.id).toBeGreaterThan(0);
      expect(summary.length, event.id).toBeGreaterThan(40);
      expect(formulas.length, event.id).toBeGreaterThan(0);
      expect([summary, ...details, ...formulas.map((f) => f.tex), ...formulas.map((f) => f.note ?? '')].join(' '), event.id).not.toMatch(
        /NaN|undefined|Infinity|null|\bde de\b|\[object/,
      );
      for (const { tex } of formulas) {
        expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'error' }), `${event.id}: ${tex}`).not.toThrow();
      }
    }
  });

  it('o lançamento mostra o excesso hiperbólico v∞ calculado na saída da Terra', () => {
    const launch = explainEvent(MISSIONS.voyager1.events[0]!);
    expect(launch.formulas[0]!.tex).toMatch(/v_\\infty = \\sqrt/);
    expect(launch.summary).toMatch(/km\/s além do necessário para escapar/);
    expect(explainEvent(MISSIONS.newhorizons.events[0]!).summary).toMatch(/o maior excesso de velocidade/);
  });

  it('a inserção em órbita mostra a freada e o período da órbita de captura', () => {
    const juno = explainEvent(MISSIONS.juno.events.find((e) => e.kind === 'capture')!);
    expect(juno.summary).toMatch(/órbita de 53,\d dias/);
    expect(juno.formulas.some((f) => f.tex.includes('\\Delta v'))).toBe(true);
  });
});

describe('luas', () => {
  it('a série de Fourier ajustada erra menos de 150 km, e os períodos são os conhecidos', () => {
    for (const series of Object.values(moonData.moons)) expect(series.maxErrorKm).toBeLessThan(150);
    expect(moonPeriodDays('io')).toBeCloseTo(1.769, 3);
    expect(moonPeriodDays('titan')).toBeCloseTo(15.945, 2);
    expect(moonPeriodDays('charon')).toBeCloseTo(6.387, 3);
    expect(moonPeriodDays('moon')).toBeCloseTo(27.32, 2);
  });

  it('cada lua fica na distância certa do seu planeta', () => {
    const expectedKm: Partial<Record<MoonId, number>> = { moon: 384_400, io: 421_700, titan: 1_221_900, triton: 354_800, charon: 19_600 };
    const t = isoToDays('2010-01-01');
    for (const moon of MOON_LIST) {
      const km = norm(sub(bodyPosition(moon.id, t)!, bodyPosition(BODIES[moon.id].parent!, t)!)) * AU_KM;
      const expected = expectedKm[moon.id as MoonId];
      // A Lua varia ±6% entre perigeu e apogeu.
      if (expected) expect(Math.abs(km / expected - 1), moon.id).toBeLessThan(0.08);
    }
  });
});

describe('escala da cena', () => {
  it('a escala log é monotônica e preserva a direção', () => {
    let prev = 0;
    for (const r of [0.1, 0.39, 1, 5.2, 30, 120, 172]) {
      const d = toDisplay([r, 0, 0], 'log');
      expect(d[0]).toBeGreaterThan(prev);
      expect(d[1]).toBe(0);
      prev = d[0];
    }
    expect(norm(toDisplay([1, 0, 0], 'log'))).toBeCloseTo(LOG_K * Math.log10(1 + 1 / LOG_R0_AU), 12);
    expect(toDisplay([3, 4, 0], 'linear')).toEqual([3, 4, 0]);
  });

  it('o tamanho local na escala log é a escala tangencial R/r, contínua no Sol', () => {
    expect(localScale([1e-12, 0, 0], 'log')).toBeCloseTo(localScale([1e-6, 0, 0], 'log'), 4);
    expect(localScale([5.2, 0, 0], 'log')).toBeCloseTo(norm(toDisplay([5.2, 0, 0], 'log')) / 5.2, 12);
  });

  it('focar um corpo aproxima a câmera a ~60 raios', () => {
    const t = isoToDays('1989-08-25');
    expect(viewDistance('neptune', t, 'linear')).toBeCloseTo((24_764 * 60) / 149_597_870.7, 9);
    expect(viewDistance('comet67p', isoToDays('2015-01-01'), 'linear')).toBeCloseTo((2 * 60) / 149_597_870.7, 12);
  });
});

describe('loop de tempo das sondas', () => {
  const initial = useProbeStore.getState();
  const store = () => useProbeStore.getState();
  beforeEach(() => useProbeStore.setState(initial, true));

  it('desacelera ao entrar na janela de um sobrevoo da sonda escolhida e volta ao ritmo depois', () => {
    const neptune = MISSIONS.voyager2.events.find((e) => e.body === 'neptune')!;
    store().setT(neptune.t - 10);
    store().setRate(30);
    store().togglePlay();
    store().tick(0.25); // 7,5 dias num frame: passa por cima do início da janela
    expect(store().t).toBeCloseTo(neptune.t - FLYBY_SLOWDOWN.windowDays, 9);
    expect(store().rate).toBe(FLYBY_SLOWDOWN.rate);
    for (let i = 0; i < 200 && store().slowdown; i++) store().tick(0.25);
    expect(store().rate).toBe(30);
    // O cartão fica com o último evento cruzado: Tritão, horas depois de Netuno.
    expect(store().eventId).toBe('voyager2-triton');
  });

  it('os encontros de outras sondas não desaceleram nem abrem cartão', () => {
    const v1Jupiter = MISSIONS.voyager1.events.find((e) => e.id === 'voyager1-jupiter')!;
    store().setT(v1Jupiter.t - 5);
    store().setRate(7);
    store().togglePlay();
    for (let i = 0; i < 20; i++) store().tick(0.25);
    expect(store().slowdown).toBeNull();
    expect(store().eventId).toBeNull();
  });

  it('ir a um evento pausa, escolhe a sonda e põe a câmera no lugar certo', () => {
    store().jumpToEvent('voyager1-jupiter');
    expect(store()).toMatchObject({ playing: false, focus: 'jupiter', scale: 'linear', selected: 'voyager1', eventId: 'voyager1-jupiter' });
    store().jumpToEvent('voyager1-heliopause');
    expect(store()).toMatchObject({ focus: 'voyager1', eventId: 'voyager1-heliopause' });
    store().jumpToEvent('juno-capture');
    expect(store()).toMatchObject({ focus: 'jupiter', scale: 'linear', selected: 'juno' });
    expect(store().view.distance! * AU_KM).toBeGreaterThan(8e6);
    store().jumpToEvent('juno-ganymede');
    expect(store().focus).toBe('ganymede');
    store().jumpToEvent('parker-perihelion');
    expect(store()).toMatchObject({ focus: 'sun', scale: 'linear' });
    store().jumpToEvent('cassini-release');
    expect(store().focus).toBe('huygens');
  });

  it('para no fim do intervalo e recomeça do início', () => {
    store().setT(PROBE_TIME_RANGE.end - 1);
    store().setRate(365.25);
    store().togglePlay();
    store().tick(0.25);
    expect(store()).toMatchObject({ t: PROBE_TIME_RANGE.end, playing: false });
    store().togglePlay();
    expect(store().t).toBe(PROBE_TIME_RANGE.start);
  });
});
