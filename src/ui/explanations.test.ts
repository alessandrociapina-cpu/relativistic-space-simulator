import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { computeFlightState, withRapidity } from '../physics/RelativityEngine';
import { DESTINATIONS, DESTINATION_LIST, destinationMissionProfile, type Destination } from '../physics/destinations';
import { computeEyeTimeline, computePhotometryAndEyeState } from '../physics/EyeAndPhotometry';
import { computeBodyAngularRadii } from '../physics/sky';
import {
  EFFECT_ORDER,
  activeEffects,
  explainEffect,
  headlineEffect,
  newAnnouncements,
  type EffectId,
  type ExplainContext,
} from './explanations';
import { formatProse } from './format';

/** Contexto das explicações no instante τ, como o store o monta. */
function contextFactory(destination: Destination, accelG = destination.defaultAccelG) {
  const profile = destinationMissionProfile(destination, accelG);
  const timeline = computeEyeTimeline(profile);
  return (tau: number, manualEta?: number): ExplainContext => {
    const base = computeFlightState(profile, tau);
    const flight = manualEta === undefined ? base : withRapidity(base, manualEta);
    const targetRadiusRad = computeBodyAngularRadii(flight, destination).targetRadiusRad;
    return {
      mode: manualEta === undefined ? 'autopilot' : 'manual',
      destination,
      accelG,
      profile,
      flight,
      photometry: computePhotometryAndEyeState(flight, profile, timeline, targetRadiusRad),
    };
  };
}

const proxima = DESTINATIONS.proxima;
const proximaAt = contextFactory(proxima);
const { tauHalf, tauTotal } = destinationMissionProfile(proxima);

/** Voo contínuo em passos de `dt`: instante de cada anúncio, como no loop do store. */
function announcementTimeline(at: (tau: number) => ExplainContext, total: number, dt = 0.05) {
  const announced: EffectId[] = [];
  const onsets: { id: EffectId; tau: number }[] = [];
  let before = activeEffects(at(0));
  for (let step = 1; step * dt < total + dt; step++) {
    const tau = Math.min(step * dt, total);
    const after = activeEffects(at(tau));
    const fresh = newAnnouncements(before, after, announced);
    announced.push(...fresh);
    onsets.push(...fresh.map((id) => ({ id, tau })));
    before = after;
  }
  return onsets;
}

describe('cronologia dos cartões na missão para Proxima', () => {
  const onsets = announcementTimeline(proximaAt, tauTotal);

  it('cada efeito é anunciado uma vez, na ordem em que surge', () => {
    expect(onsets.map((o) => o.id)).toEqual([
      'kinematics',
      'aberration',
      'doppler',
      'time-dilation',
      'length-contraction',
      'solar-system',
      'cmb-visible',
      'illuminance',
      'hot-cone',
      'cmb-xray',
      'flip',
      'braking',
      'eye-adaptation',
      'target-blueshift',
      'arrival',
    ]);
  });

  it('a 1x, os cartões chegam com pelo menos 10 s de intervalo', () => {
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i]!.tau - onsets[i - 1]!.tau).toBeGreaterThanOrEqual(9.99);
    }
  });

  it('marcos nos instantes físicos', () => {
    const at = (id: EffectId) => onsets.find((o) => o.id === id)!.tau;
    expect(at('kinematics')).toBeLessThan(0.1);
    expect(at('cmb-visible')).toBeCloseTo(126.9, 0); // γ = 400
    expect(at('flip')).toBeCloseTo(tauHalf - 10, 1);
    expect(at('braking')).toBeCloseTo(tauHalf, 1);
    expect(at('arrival')).toBe(tauTotal);
  });
});

describe('efeitos ativos', () => {
  it('em repouso, antes da partida, só a missão', () => {
    expect(activeEffects(proximaAt(0))).toEqual(['mission']);
  });

  it('no flip, o que é próprio do instante vem primeiro', () => {
    const effects = activeEffects(proximaAt(tauHalf - 5));
    expect(effects[0]).toBe('flip');
    expect(effects).toContain('cmb-xray');
    expect(effects.at(-1)).toBe('mission');
    expect(headlineEffect(effects)).toBe('flip');
  });

  it('no Cruzeiro Livre não há marcos de missão', () => {
    const effects = activeEffects(proximaAt(100, 9));
    expect(effects).toEqual(expect.arrayContaining(['kinematics', 'doppler', 'cmb-visible']));
    for (const id of ['mission', 'flip', 'braking', 'solar-system', 'arrival'] as const) {
      expect(effects).not.toContain(id);
    }
    expect(activeEffects(proximaAt(100, 0))).toEqual([]);
  });

  it('o anúncio exige a transição: efeito já ativo ou já anunciado não volta', () => {
    expect(newAnnouncements([], ['kinematics', 'mission'], [])).toEqual(['kinematics']);
    expect(newAnnouncements(['kinematics'], ['aberration', 'kinematics'], [])).toEqual(['aberration']);
    expect(newAnnouncements([], ['cmb-visible'], ['cmb-visible'])).toEqual([]);
  });
});

describe('textos e fórmulas com os valores do instante', () => {
  it('ponto médio: 19 segundos-luz contraídos e ~13 s sem frenagem (§4.2)', () => {
    const flip = explainEffect('flip', proximaAt(tauHalf - 5));
    expect(flip.details.join(' ')).toContain('18,99 s-luz');
    expect(flip.formulas.at(-1)!.tex).toContain('13{,}2');
  });

  it('frenagem: o fator "mais escuro" é o mesmo do holograma', () => {
    const ctx = proximaAt(449);
    const eye = explainEffect('eye-adaptation', ctx);
    expect(eye.summary).toContain(`${formatProse(ctx.photometry.dimmerFactor)} vezes mais fraca`);
  });

  it('CMB à frente: T = T₀·e^η e o pico de Wien', () => {
    const cmb = explainEffect('cmb-visible', proximaAt(150));
    expect(cmb.summary).toContain('7 350 K');
    expect(cmb.summary).toContain('394 nm');
  });

  it('qualquer efeito, em qualquer instante, destino e modo, gera texto limpo e TeX válido', () => {
    for (const destination of DESTINATION_LIST) {
      for (const accelG of [1, destination.defaultAccelG]) {
        const at = contextFactory(destination, accelG);
        const total = destinationMissionProfile(destination, accelG).tauTotal;
        for (let i = 0; i <= 12; i++) {
          const tau = (i / 12) * total;
          for (const ctx of [at(tau), at(tau, i * 1.5)]) {
            for (const id of EFFECT_ORDER) {
              const { summary, details, formulas } = explainEffect(id, ctx);
              expect([summary, ...details, ...formulas.map((f) => f.tex)].join(' ')).not.toMatch(
                /NaN|undefined|Infinity|null/,
              );
              for (const { tex } of formulas) {
                expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'error' })).not.toThrow();
              }
            }
          }
        }
      }
    }
  }, 60_000);
});
