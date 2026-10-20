import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { computeFlightState, flipTauOf, rocketMassRatio, type MissionProfile } from '../physics/RelativityEngine';
import { cutEngine, relightEngine } from '../physics/maneuvers';
import { ERID_G, SCIFI_MISSIONS, type CrewKind } from '../physics/accelerationPresets';
import { choiceProfile, missionProfileFor } from '../physics/crewRest';
import { DESTINATIONS, DESTINATION_LIST, destinationMissionProfile, type Destination } from '../physics/destinations';
import { computeEyeTimeline, computePhotometryAndEyeState } from '../physics/EyeAndPhotometry';
import { ORIGINS, canTravel, missionDestination } from '../physics/origins';
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
import { sciFiChoice } from './missionLink';

/** Contexto das explicações no instante τ, como o store o monta. */
function contextFactory(destination: Destination, accelG = destination.defaultAccelG, coastEta: number | null = null) {
  return profileContext(destination, accelG, destinationMissionProfile(destination, accelG, coastEta));
}

/** O mesmo, num perfil qualquer (com as manobras do piloto). */
function profileContext(destination: Destination, accelG: number, profile: MissionProfile) {
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
      'ism-radiation',
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

  it('meio interestelar: prótons de ~3 PeV e ~10¹⁷ W/m² no meio do caminho; ~8,4 GeV e ~4 MW/m² em γ = 10', () => {
    const mid = explainEffect('ism-radiation', proximaAt(tauHalf));
    expect(mid.summary).toMatch(/3,31 PeV/);
    expect(mid.formulas[1]!.tex).toMatch(/10\^\{17\}/);
    const tau10 = (Math.acosh(10) * 299_792_458) / destinationMissionProfile(proxima).properAccel;
    const at10 = explainEffect('ism-radiation', proximaAt(tau10));
    expect(at10.summary).toMatch(/8,44 GeV/);
    // β = 0,995, com o gás perto do Sol (1,03 átomo/cm³ no modelo da rota): 4,04 × 10⁶ W/m² por átomo/cm³.
    expect(at10.summary).toMatch(/1,03 átomo\/cm³ aqui/);
    expect(at10.summary).toMatch(/4,16 × 10⁶ W/);
    expect(activeEffects(proximaAt(tau10 - 0.01))).not.toContain('ism-radiation');
    expect(activeEffects(proximaAt(tau10 + 0.01))).toContain('ism-radiation');
  });

  it('meio interestelar no roteiro de Tau Zero: o gás cai de ~1 átomo/cm³ para ~10⁻⁷ fora das galáxias', () => {
    const choice = sciFiChoice(SCIFI_MISSIONS.find((m) => m.script === 'tau-zero')!, 3);
    const profile = choiceProfile(choice);
    const plan = profile.script!;
    const repair = plan.phases.find((p) => p.id === 'reparo')!;
    const ctx = { ...choice, profile } as const;
    const at = (tau: number) => {
      const flight = computeFlightState(profile, tau);
      return { ...ctx, flight, photometry: computePhotometryAndEyeState(flight, profile, computeEyeTimeline(profile), 0) };
    };
    const inVoid = explainEffect('ism-radiation', at((repair.startTau + repair.endTau) / 2));
    expect(inVoid.summary).toMatch(/× 10⁻⁷ átomo\/cm³ aqui/);
    // ~10¹⁷ eV por próton e ~10¹⁴ W/m² mesmo no vazio, a γ ≈ 1,5 × 10⁸.
    expect(inVoid.summary).toMatch(/1\d\d PeV/);
    expect(inVoid.summary).toMatch(/× 10¹⁴ W/);
    // O reparo, a missão em fases e a frenagem têm textos próprios; o vazio não tem alvo azulado.
    expect(explainEffect('coasting', at((repair.startTau + repair.endTau) / 2)).summary).toMatch(/reparo do freio/);
    expect(explainEffect('mission', at(0)).details).toHaveLength(plan.phases.length + 2);
    const braking = plan.phases.find((p) => p.id === 'frenagem')!;
    const mid = at((braking.startTau + braking.endTau) / 2);
    expect(explainEffect('braking', mid).details[0]).toMatch(/não no instante espelho/);
    expect(activeEffects(mid)).not.toContain('target-blueshift');
    // Todas as fórmulas do roteiro passam no KaTeX estrito, no começo, no meio e no fim de cada fase.
    for (const p of plan.phases) {
      for (const tau of [p.startTau, (p.startTau + p.endTau) / 2, p.endTau]) {
        for (const id of EFFECT_ORDER) {
          for (const { tex } of explainEffect(id, at(tau)).formulas) {
            expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'error' })).not.toThrow();
          }
        }
      }
    }
  });

  it('dilatação do tempo: o rádio da Terra chega de ~19 s depois da partida no meio do caminho', () => {
    const mid = explainEffect('time-dilation', proximaAt(tauHalf));
    expect(mid.details.join(' ')).toMatch(/partiu 19,0 s depois da partida/);
    expect(mid.formulas.some((f) => f.tex.includes('t_{\\text{rádio}}'))).toBe(true);
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

  it('partindo de Erid com a tripulação eridiana: Erid nos textos, sem Sistema Solar, e TeX válido', () => {
    const erid = ORIGINS.eridani40;
    for (const destination of DESTINATION_LIST.filter((d) => canTravel(erid, d.id))) {
      const target = missionDestination(erid, destination);
      const base = profileContext(target, ERID_G, destinationMissionProfile(target, ERID_G));
      const total = destinationMissionProfile(target, ERID_G).tauTotal;
      for (let i = 0; i <= 8; i++) {
        const ctx = { ...base((i / 8) * total, 'eridian'), origin: erid };
        expect(activeEffects(ctx)).not.toContain('solar-system');
        for (const id of EFFECT_ORDER) {
          const { summary, details, formulas } = explainEffect(id, ctx);
          const text = [summary, ...details, ...formulas.map((f) => f.tex)].join(' ');
          expect(text).not.toMatch(/NaN|undefined|Infinity|null/);
          if (id === 'time-dilation') expect(text).toContain('Erid');
          for (const { tex } of formulas) {
            expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'error' })).not.toThrow();
          }
        }
      }
    }
  }, 60_000);

  it('com o motor desligado e religado: inércia até a frenagem automática, texto limpo e TeX válido', () => {
    const demo = destinationMissionProfile(proxima);
    const cut = cutEngine(demo, 100, 3);
    const coasting = profileContext(proxima, proxima.defaultAccelG, cut)(200);
    const { summary } = explainEffect('coasting', coasting);
    expect(summary).toContain('religa o motor');
    expect(summary).not.toMatch(/passa pelo alvo/);

    for (const destination of DESTINATION_LIST) {
      const plan = destinationMissionProfile(destination, 1);
      const profiles = [
        cutEngine(plan, 0.25 * plan.tauTotal, 0.01 * plan.tauTotal),
        cutEngine(plan, 0.8 * plan.tauTotal, 0.01 * plan.tauTotal),
        relightEngine(cutEngine(plan, 0.2 * plan.tauTotal, 0.01 * plan.tauTotal), 0.3 * plan.tauTotal),
      ];
      for (const profile of profiles) {
        const at = profileContext(destination, 1, profile);
        const flip = flipTauOf(profile);
        const instants = [0.3, 0.6, 0.9, 1].map((f) => f * profile.tauTotal);
        if (flip !== null) instants.push(flip - 1, flip + 1);
        for (const tau of instants) {
          for (const id of EFFECT_ORDER) {
            const { summary: text, details, formulas } = explainEffect(id, at(tau));
            expect([text, ...details, ...formulas.map((f) => f.tex)].join(' ')).not.toMatch(/NaN|undefined|Infinity|null/);
            for (const { tex } of formulas) {
              expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'error' })).not.toThrow();
            }
          }
        }
      }
    }
  }, 60_000);

  it('piloto humano com descansos: o descanso é anunciado, a inércia não, e todo texto e TeX valem', () => {
    const plan = missionProfileFor(proxima, 10, null, 'crewed');
    const at = profileContext(proxima, 10, plan);
    const rest = plan.crewRest!;
    // No primeiro descanso: o efeito do descanso, com a contagem até a próxima queima.
    const inRest = at(rest.burnTau + 0.5 * rest.restTau);
    expect(inRest.flight.crewRest).toBe(true);
    expect(activeEffects(inRest)).toContain('crew-rest');
    expect(activeEffects(inRest)).not.toContain('coasting');
    expect(explainEffect('crew-rest', inRest).summary).toMatch(/próxima queima a 10 g começa em 4,05 dias/);

    for (const destination of DESTINATION_LIST) {
      for (const [accelG, coastEta] of [
        [10, null],
        [30, Math.atanh(0.9)],
        [6, null],
      ] as const) {
        const profile = missionProfileFor(destination, accelG, coastEta, 'crewed');
        const burn = computeFlightState(profile, profile.tauTotal * 0.3).engine === 'thrust' ? 0.3 : 0.31;
        const profiles = [profile, cutEngine(profile, profile.tauTotal * burn, 3600)];
        for (const p of profiles) {
          const ctxAt = profileContext(destination, accelG, p);
          for (let i = 0; i <= 16; i++) {
            const ctx = ctxAt((i / 16) * p.tauTotal);
            for (const id of EFFECT_ORDER) {
              const { summary, details, formulas } = explainEffect(id, ctx);
              expect([summary, ...details, ...formulas.map((f) => f.tex)].join(' ')).not.toMatch(/NaN|undefined|Infinity|null/);
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
