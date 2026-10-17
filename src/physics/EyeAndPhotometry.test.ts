import { describe, expect, it } from 'vitest';
import { computeFlightState, flipTauOf } from './RelativityEngine';
import { DESTINATIONS, destinationMissionProfile } from './destinations';
import { cutEngine, relightEngine } from './maneuvers';
import { computeBodyAngularRadii } from './sky';
import {
  WINDSHIELD_FOV_DEG,
  cmbTemperatureAhead,
  computeEyeTimeline,
  computePhotometryAndEyeState,
  formatRelativisticSpeedPercent,
  peakCmbLux,
  recommendedRearZoom,
  recommendedTelescopeZoom,
  steadyPupilMm,
  visibleLuxAhead,
  wienPeakNm,
} from './EyeAndPhotometry';

const relErr = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const etaOf = (gamma: number) => Math.acosh(gamma);

const proxima = DESTINATIONS.proxima;
const profile = destinationMissionProfile(proxima);
const timeline = computeEyeTimeline(profile);
const stateAt = (tau: number) => {
  const flight = computeFlightState(profile, tau);
  return computePhotometryAndEyeState(flight, profile, timeline, computeBodyAngularRadii(flight, proxima).targetRadiusRad);
};

describe('iluminância visível da CMB à frente (integral de Planck × V(λ))', () => {
  it('pico universal ≈ 11 065 lux (marco do vídeo)', () => {
    expect(relErr(peakCmbLux(), 11_065)).toBeLessThan(0.002);
  });

  it('γ = 9 356 → ≈ 10 796 lux (marco do vídeo)', () => {
    expect(relErr(visibleLuxAhead(etaOf(9356)), 10_796)).toBeLessThan(0.002);
  });

  it('o pico acontece perto de γ ≈ 7 000 e a luz cai dos dois lados', () => {
    expect(visibleLuxAhead(etaOf(7000))).toBeGreaterThan(visibleLuxAhead(etaOf(3000)));
    expect(visibleLuxAhead(etaOf(7000))).toBeGreaterThan(visibleLuxAhead(etaOf(30_000)));
  });

  it('nada no visível antes de γ ≈ 200 e só ~200 lux no ponto médio (cone sub-pixel)', () => {
    expect(visibleLuxAhead(etaOf(150))).toBeLessThan(0.01);
    expect(visibleLuxAhead(etaOf(1))).toBe(0);
    const mid = visibleLuxAhead(profile.etaMax);
    expect(mid).toBeGreaterThan(150);
    expect(mid).toBeLessThan(260);
  });

  it('CMB à frente: T₀·e^η e pico de Wien', () => {
    expect(cmbTemperatureAhead(0)).toBeCloseTo(2.72548, 10);
    expect(wienPeakNm(5778)).toBeCloseTo(501.5, 1);
  });
});

describe('olho do piloto na missão para Proxima', () => {
  it('parte adaptado ao escuro: pupila ≈ 7,9 mm e retina em 0 stop', () => {
    const s = stateAt(0);
    expect(s.pupilDiameterMm).toBeCloseTo(steadyPupilMm(0), 6);
    expect(s.pupilDiameterMm).toBeGreaterThan(7.5);
    expect(s.retinaStops).toBeCloseTo(0, 6);
  });

  it('no white-out da ida (τ = 150 s) a retina ainda está atrasada (≈ −2,7 stops)', () => {
    const s = stateAt(150);
    expect(s.retinaStops).toBeGreaterThan(-3.5);
    expect(s.retinaStops).toBeLessThan(-2);
    expect(s.dimmerFactor).toBe(1);
  });

  it('na frenagem, a mesma luz do white-out: retina ≈ −12,9 stops, pupila ≈ 2,14 mm, ≈ 1 260× mais escuro', () => {
    const s = stateAt(profile.tauTotal - 150);
    expect(s.whiteoutTau).toBeCloseTo(150, 9);
    expect(Math.abs(s.retinaStops - -12.9)).toBeLessThan(0.3);
    expect(Math.abs(s.pupilDiameterMm - 2.14)).toBeLessThan(0.03);
    expect(s.dimmerFactor).toBeGreaterThan(1100);
    expect(s.dimmerFactor).toBeLessThan(1450);
    // mesma luz nos dois instantes (simetria do Flip-and-Burn)
    expect(relErr(s.visibleLuxAhead, stateAt(150).visibleLuxAhead)).toBeLessThan(1e-9);
  });

  it('a linha do tempo é determinística: o scrub vê o mesmo estado', () => {
    expect(stateAt(420)).toEqual(stateAt(420));
    expect(timeline.peakLux).toBeCloseTo(peakCmbLux(), -1);
  });

  it('com manobras do piloto, o espelho é o instante da subida com a mesma rapidez', () => {
    const stateIn = (p: typeof profile) => {
      const eyes = computeEyeTimeline(p);
      return (tau: number) => {
        const flight = computeFlightState(p, tau);
        return computePhotometryAndEyeState(flight, p, eyes, computeBodyAngularRadii(flight, proxima).targetRadiusRad);
      };
    };
    // Motor desligado na frenagem (τ = 400 s): sem distância para frear com α depois da rampa, o piloto
    // automático freia com a > α, e τ_total − τ deixa de ser o instante da ida com a mesma luz.
    const cut = cutEngine(profile, 400, 3);
    const atCut = stateIn(cut);
    // Na frenagem, o instante com a mesma η do white-out da ida (τ = 150 s).
    const etaWhiteout = computeFlightState(profile, 150).eta;
    let lo = 403;
    let hi = cut.tauTotal;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (computeFlightState(cut, mid).eta > etaWhiteout) lo = mid;
      else hi = mid;
    }
    const s = atCut(lo);
    expect(s.whiteoutTau).toBeCloseTo(150, 6);
    expect(Math.abs(cut.tauTotal - lo - 150)).toBeGreaterThan(1); // τ_total − τ já não serve
    expect(s.dimmerFactor).toBeGreaterThan(100);
    // Desligado em 250 s (η ≈ 13) e religado: o piloto automático passa da η atingida antes do corte, e
    // logo depois do flip não há instante da subida com a mesma luz.
    const relit = relightEngine(cutEngine(profile, 250, 3), 260);
    const early = stateIn(relit)(flipTauOf(relit)! + 1);
    expect(early.whiteoutTau).toBeNull();
    expect(early.dimmerFactor).toBe(1);
  });
});

describe('alertas e véu', () => {
  it('aviso de ofuscamento na aceleração com γ ∈ [200, 12 000] ou com luz > 1 500 lux', () => {
    expect(stateAt(118).isEyeHazard).toBe(true); // γ ≈ 250, ainda escuro: aviso antecipado
    expect(stateAt(118).visibleLuxAhead).toBeLessThan(1);
    expect(stateAt(50).isEyeHazard).toBe(false);
    expect(stateAt(profile.tauHalf).isEyeHazard).toBe(false);
  });

  it('HUD fosco durante o white-out da ida, não no ponto médio', () => {
    expect(stateAt(170).isWhiteoutHudActive).toBe(true);
    expect(stateAt(profile.tauHalf).isWhiteoutHudActive).toBe(false);
  });

  it('a mesma luz estoura o para-brisa na ida e vira névoa fraca na frenagem', () => {
    const perceivedGlare = (tau: number) => {
      const s = stateAt(tau);
      return s.glareIntensity * s.eyeSensitivity;
    };
    expect(perceivedGlare(160)).toBeGreaterThan(0.7);
    expect(perceivedGlare(profile.tauTotal - 150)).toBeLessThan(perceivedGlare(150) / 10);
    expect(stateAt(profile.tauTotal - 150).isWhiteoutHudActive).toBe(false);
  });
});

describe('auto-zoom do telescópio', () => {
  it('x 13 na partida; na reta final abre até o alvo caber em 35% da altura (no mínimo x 1)', () => {
    expect(stateAt(0).recommendedTelescopeZoom).toBe(13);
    expect(stateAt(profile.tauTotal).recommendedTelescopeZoom).toBe(1);
    // Alguns segundos antes da chegada o zoom já está abaixo de x 13, com o alvo em 35%.
    const tau = profile.tauTotal - 12;
    const zoom = stateAt(tau).recommendedTelescopeZoom;
    expect(zoom).toBeLessThan(13);
    expect(zoom).toBeGreaterThan(1);
    const flight = computeFlightState(profile, tau);
    const radius = computeBodyAngularRadii(flight, proxima).targetRadiusRad;
    const apparent = 2 * Math.atan(Math.exp(-flight.eta) * Math.tan(radius / 2));
    const fill = (2 * apparent) / ((WINDSHIELD_FOV_DEG / zoom) * (Math.PI / 180));
    expect(fill).toBeCloseTo(0.35, 6);
  });

  it('visão traseira: o Sol em 35% da altura na partida, até x 400', () => {
    const sun = computeBodyAngularRadii(computeFlightState(profile, 0), proxima).sunRadiusRad;
    const zoom = recommendedRearZoom(0, sun);
    expect((2 * sun) / ((WINDSHIELD_FOV_DEG / zoom) * (Math.PI / 180))).toBeCloseTo(0.35, 4);
    expect(recommendedRearZoom(0, 1e-9)).toBe(400);
    // A aberração amplia o que fica atrás: o zoom cai à medida que η cresce.
    expect(recommendedRearZoom(2, sun)).toBeLessThan(zoom);
  });

  it('acompanha 0,253·γ no regime relativístico (≈ 8,9×10⁵ no ponto médio)', () => {
    expect(relErr(recommendedTelescopeZoom(etaOf(1047), 1e-9), 265)).toBeLessThan(0.01);
    expect(relErr(stateAt(profile.tauHalf).recommendedTelescopeZoom, 0.253 * profile.gammaMax)).toBeLessThan(1e-6);
  });
});

describe('formatRelativisticSpeedPercent', () => {
  it('agrupa os noves de 3 em 3 sem perder precisão', () => {
    expect(formatRelativisticSpeedPercent(etaOf(3_123_953))).toBe('99.999 999 999 994 9 %');
    expect(formatRelativisticSpeedPercent(etaOf(265))).toBe('99.999 29 %');
  });

  it('velocidades baixas em formato simples', () => {
    expect(formatRelativisticSpeedPercent(0)).toBe('0.000 %');
    expect(formatRelativisticSpeedPercent(Math.atanh(0.00106))).toBe('0.106 %');
    expect(formatRelativisticSpeedPercent(Math.atanh(0.5))).toBe('50.0 %');
    expect(formatRelativisticSpeedPercent(Math.atanh(0.995))).toBe('99.500 %');
  });

  it('Andrômeda no pico (γ ≈ 2×10¹²) continua legível', () => {
    expect(formatRelativisticSpeedPercent(29.07)).toMatch(/^99\.999 999 999 999 999 999 999 9\d{2} %$/);
  });
});
