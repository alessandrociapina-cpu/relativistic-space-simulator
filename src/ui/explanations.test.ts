import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { computeFlightState, rocketMassRatio } from '../physics/RelativityEngine';
import type { CrewKind } from '../physics/accelerationPresets';
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
function contextFactory(destination: Destination, accelG = destination.defaultAccelG, coastEta: number | null = null) {
  const profile = destinationMissionProfile(destination, accelG, coastEta);
  const timeline = computeEyeTimeline(profile);
  return (tau: number, crew: CrewKind = 'crewed'): ExplainContext => {
    const flight = computeFlightState(profile, tau);
    const targetRadiusRad = computeBodyAngularRadii(flight, destination).targetRadiusRad;
    return {
      crew,
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
      'target-blueshift',
      'arrival',
    ]);
  });

  it('a 1x, os cartões chegam com pelo menos 6 s de intervalo (o tempo mínimo de cada um na tela)', () => {
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i]!.tau - onsets[i - 1]!.tau).toBeGreaterThanOrEqual(6);
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

describe('viagens longas e perfil com cruzeiro', () => {
  it('1 g até Proxima: os efeitos de γ ≈ 3 aparecem, e o olho acompanha a luz (sem "mais escuro")', () => {
    const at = contextFactory(proxima, 1);
    const total = destinationMissionProfile(proxima, 1).tauTotal;
    const ids = announcementTimeline(at, total, total / 4000).map((o) => o.id);
    // A 1 g o Sistema Solar fica para trás em dias, a ~1 % de c, antes de qualquer efeito óptico.
    expect(ids).toEqual([
      'kinematics',
      'solar-system',
      'aberration',
      'doppler',
      'time-dilation',
      'length-contraction',
      'flip',
      'braking',
      'arrival',
    ]);
  });

  it('1 g até Andrômeda: a CMB aparece e o alvo azulado na frenagem', () => {
    const andromeda = DESTINATIONS.andromeda;
    const at = contextFactory(andromeda, 1);
    const total = destinationMissionProfile(andromeda, 1).tauTotal;
    const ids = announcementTimeline(at, total, total / 6000).map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['cmb-visible', 'illuminance', 'hot-cone', 'cmb-xray', 'target-blueshift']));
  });

  it('acelerar, cruzar e frear: a inércia é anunciada e o flip antecede o início da frenagem', () => {
    const coastEta = Math.atanh(0.9);
    const at = contextFactory(proxima, 1, coastEta);
    const profile = destinationMissionProfile(proxima, 1, coastEta);
    const onsets = announcementTimeline(at, profile.tauTotal, profile.tauTotal / 4000);
    const ids = onsets.map((o) => o.id);
    expect(ids.indexOf('coasting')).toBeLessThan(ids.indexOf('flip'));
    expect(onsets.find((o) => o.id === 'flip')!.tau).toBeLessThan(profile.brakeStartTau);
    expect(onsets.find((o) => o.id === 'braking')!.tau).toBeCloseTo(profile.brakeStartTau, -5);
    const coast = explainEffect('coasting', at(profile.tauHalf));
    expect(coast.summary).toContain('0,9000 c');
  });

  it('combustível: a razão de massa do foguete de fótons aparece no texto', () => {
    const rocket = explainEffect('rocket', contextFactory(proxima, 1)(0));
    const ratio = rocketMassRatio(destinationMissionProfile(proxima, 1));
    expect(ratio).toBeCloseTo(38.8, 1);
    expect(rocket.summary).toContain(`${formatProse(ratio)} vezes`);
  });
});

describe('efeitos ativos', () => {
  it('em repouso, antes da partida, só a missão e o combustível', () => {
    expect(activeEffects(proximaAt(0))).toEqual(['mission', 'rocket']);
  });

  it('no flip, o que é próprio do instante vem primeiro', () => {
    const effects = activeEffects(proximaAt(tauHalf - 5));
    expect(effects[0]).toBe('flip');
    expect(effects).toContain('cmb-xray');
    expect(effects.slice(-2)).toEqual(['mission', 'rocket']);
    expect(headlineEffect(effects)).toBe('flip');
  });

  it('numa sonda robótica o ofuscamento é o da câmera, sem olho', () => {
    const glare = explainEffect('illuminance', proximaAt(160, 'robotic'));
    expect(glare.summary).toContain('câmera');
    expect(glare.details.join(' ')).not.toContain('pupila');
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

  it('CMB à frente: T = T₀·e^η e o pico de Wien', () => {
    const cmb = explainEffect('cmb-visible', proximaAt(150));
    expect(cmb.summary).toContain('7 350 K');
    expect(cmb.summary).toContain('394 nm');
  });

  it('qualquer efeito, em qualquer instante, destino e modo, gera texto limpo e TeX válido', () => {
    for (const destination of DESTINATION_LIST) {
      for (const [accelG, coastEta] of [
        [1, null],
        [1, Math.atanh(0.9)],
        [destination.defaultAccelG, null],
        [destination.defaultAccelG, 12],
      ] as const) {
        const at = contextFactory(destination, accelG, coastEta);
        const total = destinationMissionProfile(destination, accelG, coastEta).tauTotal;
        for (let i = 0; i <= 12; i++) {
          const tau = (i / 12) * total;
          for (const ctx of [at(tau), at(tau, 'robotic')]) {
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
