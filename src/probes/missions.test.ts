import katex from 'katex';
import { beforeEach, describe, expect, it } from 'vitest';
import { explainEvent } from './eventExplanations';
import { ALL_EVENTS, LIGHT_DAY_AU, MISSIONS } from './missions';
import { LOG_K, LOG_R0_AU, localScale, toDisplay, viewDistance } from './sceneMath';
import { daysToMs, isoToDays } from './time';
import { FLYBY_SLOWDOWN, PROBE_TIME_RANGE, useProbeStore } from './useProbeStore';
import { norm } from './vec3';

const isoDay = (days: number) => new Date(daysToMs(days)).toISOString().slice(0, 10);

describe('eventos das missões', () => {
  it('Voyager 2: lançamento, os quatro gigantes e a saída da heliosfera, em ordem', () => {
    expect(MISSIONS.voyager2.events.map((e) => e.title)).toEqual([
      'Lançamento da Voyager 2',
      'Sobrevoo de Júpiter',
      'Sobrevoo de Saturno',
      'Sobrevoo de Urano',
      'Sobrevoo de Netuno',
      'Choque de terminação',
      'Espaço interestelar',
    ]);
  });

  it('Voyager 1 chega a um dia-luz da Terra em novembro de 2026', () => {
    const lightDay = MISSIONS.voyager1.events.find((e) => e.kind === 'light-day')!;
    expect(isoDay(lightDay.t).slice(0, 7)).toBe('2026-11');
    expect(LIGHT_DAY_AU).toBeCloseTo(173.14, 2);
  });

  it('todas as explicações têm texto limpo e fórmulas válidas no KaTeX estrito', () => {
    for (const event of ALL_EVENTS) {
      const { title, summary, details, formulas } = explainEvent(event);
      expect(title.length).toBeGreaterThan(0);
      expect([summary, ...details, ...formulas.map((f) => f.tex)].join(' ')).not.toMatch(/NaN|undefined|Infinity|null/);
      for (const { tex } of formulas) {
        expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'error' })).not.toThrow();
      }
    }
  });

  it('o lançamento mostra o excesso hiperbólico v∞ calculado na saída da Terra', () => {
    const launch = explainEvent(MISSIONS.voyager1.events[0]!);
    expect(launch.formulas[0]!.tex).toMatch(/v_\\infty = \\sqrt/);
    expect(launch.summary).toMatch(/km\/s além do necessário para escapar/);
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

  it('focar um planeta aproxima a câmera a ~60 raios', () => {
    const t = isoToDays('1989-08-25');
    expect(viewDistance('neptune', t, 'linear')).toBeCloseTo((24_764 * 60) / 149_597_870.7, 9);
  });
});

describe('loop de tempo das sondas', () => {
  const initial = useProbeStore.getState();
  const store = () => useProbeStore.getState();
  beforeEach(() => useProbeStore.setState(initial, true));

  it('desacelera ao entrar na janela de um sobrevoo e volta ao ritmo depois', () => {
    const neptune = MISSIONS.voyager2.events.find((e) => e.body === 'neptune')!;
    store().setT(neptune.t - 10);
    store().setRate(30);
    store().togglePlay();
    store().tick(0.25); // 7,5 dias num frame: passa por cima do início da janela
    expect(store().t).toBeCloseTo(neptune.t - FLYBY_SLOWDOWN.windowDays, 9);
    expect(store().rate).toBe(FLYBY_SLOWDOWN.rate);
    for (let i = 0; i < 200 && store().slowdown; i++) store().tick(0.25);
    expect(store().rate).toBe(30);
    expect(store().eventId).toBe(neptune.id);
  });

  it('ir a um evento pausa, foca o planeta em escala real e abre o cartão', () => {
    store().jumpToEvent('voyager1-jupiter');
    expect(store()).toMatchObject({ playing: false, focus: 'jupiter', scale: 'linear', selected: 'voyager1', eventId: 'voyager1-jupiter' });
    store().jumpToEvent('voyager1-heliopause');
    expect(store()).toMatchObject({ focus: 'voyager1', eventId: 'voyager1-heliopause' });
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
