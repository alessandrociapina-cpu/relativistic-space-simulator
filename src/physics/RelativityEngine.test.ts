import { describe, expect, it } from 'vitest';
import {
  C,
  G0,
  JULIAN_YEAR_S,
  LIGHT_SECOND_M,
  LIGHT_YEAR_M,
  computeFlightState,
  computeMissionProfile,
  computeNoBrakeProperTime,
  computeShaderKinematics,
  log10GammaFromRapidity,
  rapidityFromLog10Gamma,
  rocketMassRatio,
} from './RelativityEngine';
import {
  DESTINATIONS,
  DESTINATION_LIST,
  MAX_COAST_FRACTION,
  destinationMissionProfile,
  effectiveCoastEta,
  towardName,
} from './destinations';

const relErr = (actual: number, expected: number) => Math.abs(actual - expected) / Math.abs(expected);

/** 1 − tanh η = 2e^(−2η) / (1 + e^(−2η)), forma independente da usada no motor. */
const exactOneMinusTanh = (eta: number) => (2 * Math.exp(-2 * eta)) / (1 + Math.exp(-2 * eta));

const ALPHA = 1.61e6 * G0;
const proxima = computeMissionProfile(4.25 * LIGHT_YEAR_M, ALPHA);

// ── CLAUDE.md §8 — critérios de aceite obrigatórios ──────────────────────────
describe('§8.1 Proxima Centauri (D = 4,25 ly, α = 1,61×10⁶ G)', () => {
  it('tempo próprio total τ_total = 600 s ± 5 s', () => {
    expect(Math.abs(proxima.tauTotal - 600)).toBeLessThanOrEqual(5);
  });

  it('tempo da Terra t_total ≈ 4,25 anos', () => {
    expect(Math.abs(proxima.tTotal / JULIAN_YEAR_S - 4.25)).toBeLessThan(1e-3);
  });

  it('distância contraída no ponto médio = 19 ls ± 1 ls (≈ 5,7×10⁶ km)', () => {
    const mid = computeFlightState(proxima, proxima.tauHalf);
    expect(Math.abs(mid.contractedDistanceRemainingM / LIGHT_SECOND_M - 19)).toBeLessThanOrEqual(1);
    expect(relErr(mid.contractedDistanceRemainingM / 1e3, 5.7e6)).toBeLessThan(0.01);
  });
});

describe('§8.2 precisão de uOneMinusBeta', () => {
  it('η = 16 → uOneMinusBeta > 0 (≈ 2,533×10⁻¹⁴), nunca 0', () => {
    const { uOneMinusBeta } = computeShaderKinematics(16);
    expect(uOneMinusBeta).toBeGreaterThan(0);
    expect(relErr(uOneMinusBeta, exactOneMinusTanh(16))).toBeLessThan(1e-12);
    // continua > 0 depois de virar uniform float32 na GPU
    expect(Math.fround(uOneMinusBeta)).toBeGreaterThan(0);
  });

  it('a subtração ingênua 1 − β colapsa para 0 em float32 (motivo da Regra 2)', () => {
    const beta32 = Math.fround(Math.tanh(16));
    expect(Math.fround(1 - beta32)).toBe(0);
  });
});

describe('§3.1 Regra 3: 1 − β·cosθ como soma de termos não-negativos', () => {
  it('δ + β(1 − cosθ) = 1 − β·cosθ em toda a esfera', () => {
    for (const eta of [0, 0.5, 3, 10]) {
      const { uBeta, uOneMinusBeta } = computeShaderKinematics(eta);
      for (let deg = 0; deg <= 180; deg += 15) {
        const theta = (deg * Math.PI) / 180;
        const cos = Math.cos(theta);
        const oneMinusCos = cos >= 0 ? Math.sin(theta) ** 2 / (1 + cos) : 1 - cos;
        expect(uOneMinusBeta + uBeta * oneMinusCos).toBeCloseTo(1 - uBeta * cos, 12);
      }
    }
  });
});

// ── Consistência adicional do motor ──────────────────────────────────────────
describe('computeShaderKinematics', () => {
  it.each([0, 1e-6, 0.5, 3, 10, 16, 18, 24.5, 29.1])('η = %f: δ exato, positivo e β + δ = 1', (eta) => {
    const k = computeShaderKinematics(eta);
    expect(k.uOneMinusBeta).toBeGreaterThan(0);
    expect(relErr(k.uOneMinusBeta, exactOneMinusTanh(eta))).toBeLessThan(1e-12);
    expect(Math.fround(k.uOneMinusBeta)).toBeGreaterThan(0);
    expect(k.uBeta + k.uOneMinusBeta).toBeCloseTo(1, 15);
    expect(k.uGamma).toBeCloseTo(Math.cosh(eta), 12);
  });

  it('em repouso: β = 0, γ = 1, δ = 1', () => {
    expect(computeShaderKinematics(0)).toEqual({ uBeta: 0, uGamma: 1, uOneMinusBeta: 1 });
  });
});

describe('perfil Flip-and-Burn para Proxima', () => {
  it('no ponto médio: γ ≈ 3,53×10⁶ e a nave fica ≈ 12 µm/s abaixo de c (§3.1)', () => {
    const mid = computeFlightState(proxima, proxima.tauHalf);
    expect(relErr(mid.gamma, 3.53e6)).toBeLessThan(0.005);
    expect(Math.abs(C * mid.oneMinusBeta * 1e6 - 12)).toBeLessThan(0.1);
  });

  it('sem frenagem no ponto médio, chegaria em ≈ 13 s ≈ (c/α)·ln 2 (§4.2.5)', () => {
    const noBrake = computeNoBrakeProperTime(proxima);
    expect(Math.abs(noBrake - 13)).toBeLessThan(0.5);
    expect(relErr(noBrake, (C / ALPHA) * Math.LN2)).toBeLessThan(1e-6);
  });

  it('partida: x = 0, t = 0, γ = 1, L = D', () => {
    const s = computeFlightState(proxima, 0);
    expect(s).toMatchObject({ phase: 'accelerating', positionM: 0, earthTimeS: 0, gamma: 1 });
    expect(s.restDistanceRemainingM).toBe(proxima.distanceM);
  });

  it('chegada: x = D, t = t_total, γ = 1, L = 0', () => {
    const s = computeFlightState(proxima, proxima.tauTotal);
    expect(s).toMatchObject({ phase: 'arrived', gamma: 1, restDistanceRemainingM: 0 });
    expect(s.positionM).toBe(proxima.distanceM);
    expect(s.earthTimeS).toBe(proxima.tTotal);
  });

  it('τ fora de [0, τ_total] é limitado', () => {
    expect(computeFlightState(proxima, -10)).toEqual(computeFlightState(proxima, 0));
    expect(computeFlightState(proxima, proxima.tauTotal + 100)).toEqual(
      computeFlightState(proxima, proxima.tauTotal),
    );
  });

  it('é contínuo no flip', () => {
    const before = computeFlightState(proxima, proxima.tauHalf * (1 - 1e-12));
    const after = computeFlightState(proxima, proxima.tauHalf * (1 + 1e-12));
    expect(before.phase).toBe('accelerating');
    expect(after.phase).toBe('decelerating');
    expect(relErr(after.eta, before.eta)).toBeLessThan(1e-9);
    expect(relErr(after.positionM, before.positionM)).toBeLessThan(1e-6);
    expect(relErr(after.earthTimeS, before.earthTimeS)).toBeLessThan(1e-6);
  });

  it('é simétrico: γ(τ) = γ(τ_total − τ) e L_repouso(τ_total − τ) = x(τ)', () => {
    for (const f of [0.1, 0.3, 0.45]) {
      const a = computeFlightState(proxima, f * proxima.tauTotal);
      const b = computeFlightState(proxima, (1 - f) * proxima.tauTotal);
      expect(relErr(b.gamma, a.gamma)).toBeLessThan(1e-9);
      expect(relErr(b.restDistanceRemainingM, a.positionM)).toBeLessThan(1e-9);
    }
  });

  it('respeita dx/dτ = c·sinh η e dt/dτ = γ nas duas fases', () => {
    const h = 1e-3;
    for (const f of [0.2, 0.4, 0.6, 0.8]) {
      const tau = f * proxima.tauTotal;
      const s = computeFlightState(proxima, tau);
      const lo = computeFlightState(proxima, tau - h);
      const hi = computeFlightState(proxima, tau + h);
      const dxdtau = (hi.positionM - lo.positionM) / (2 * h);
      const dtdtau = (hi.earthTimeS - lo.earthTimeS) / (2 * h);
      expect(relErr(dxdtau, C * Math.sinh(s.eta))).toBeLessThan(1e-6);
      expect(relErr(dtdtau, s.gamma)).toBeLessThan(1e-6);
    }
  });

  it('γ e t crescem monotonicamente até o flip; t sempre cresce', () => {
    let prev = computeFlightState(proxima, 0);
    for (let i = 1; i <= 200; i++) {
      const s = computeFlightState(proxima, (i / 200) * proxima.tauTotal);
      expect(s.earthTimeS).toBeGreaterThan(prev.earthTimeS);
      expect(s.restDistanceRemainingM).toBeLessThan(prev.restDistanceRemainingM);
      if (s.tau <= proxima.tauHalf) expect(s.gamma).toBeGreaterThan(prev.gamma);
      prev = s;
    }
  });
});

describe('perfil acelerar, cruzar e frear (1 g até Proxima, cruzeiro a 0,9c)', () => {
  const coastEta = Math.atanh(0.9);
  const coast = computeMissionProfile(4.25 * LIGHT_YEAR_M, G0, coastEta);
  const flip = computeMissionProfile(4.25 * LIGHT_YEAR_M, G0);

  it('fases: acelera até η_c, segue por inércia e freia simetricamente', () => {
    expect(coast.coastEta).toBe(coastEta);
    expect(coast.etaMax).toBe(coastEta);
    expect(coast.burnEndTau).toBeCloseTo((C / G0) * coastEta, 3);
    expect(coast.tauTotal - coast.brakeStartTau).toBeCloseTo(coast.burnEndTau, 3);
    expect(computeFlightState(coast, coast.burnEndTau / 2).phase).toBe('accelerating');
    expect(computeFlightState(coast, coast.tauHalf).phase).toBe('coasting');
    expect(computeFlightState(coast, coast.tauTotal - coast.burnEndTau / 2).phase).toBe('decelerating');
  });

  it('na inércia: η constante, dx/dτ = c·sinh η_c e dt/dτ = γ_c', () => {
    const a = computeFlightState(coast, coast.tauHalf - 1e5);
    const b = computeFlightState(coast, coast.tauHalf + 1e5);
    expect(a.eta).toBe(coastEta);
    expect(b.eta).toBe(coastEta);
    expect(relErr((b.positionM - a.positionM) / 2e5, C * Math.sinh(coastEta))).toBeLessThan(1e-9);
    expect(relErr((b.earthTimeS - a.earthTimeS) / 2e5, Math.cosh(coastEta))).toBeLessThan(1e-9);
  });

  it('é contínuo ao desligar e ao religar o motor, e chega exatamente ao alvo', () => {
    for (const edge of [coast.burnEndTau, coast.brakeStartTau]) {
      const before = computeFlightState(coast, edge * (1 - 1e-12));
      const after = computeFlightState(coast, edge * (1 + 1e-12));
      expect(relErr(after.eta, before.eta)).toBeLessThan(1e-9);
      expect(relErr(after.positionM, before.positionM)).toBeLessThan(1e-9);
      expect(relErr(after.earthTimeS, before.earthTimeS)).toBeLessThan(1e-9);
    }
    const end = computeFlightState(coast, coast.tauTotal);
    expect(end).toMatchObject({ phase: 'arrived', restDistanceRemainingM: 0, earthTimeS: coast.tTotal });
  });

  it('o meio da missão é o meio do caminho, e cruzar a 0,9c leva mais tempo que acelerar até 0,95c', () => {
    const mid = computeFlightState(coast, coast.tauHalf);
    expect(relErr(mid.positionM, coast.halfDistanceM)).toBeLessThan(1e-9);
    expect(coast.tauTotal).toBeGreaterThan(flip.tauTotal);
    expect(coast.tTotal).toBeGreaterThan(flip.tTotal);
  });

  it('cruzeiro acima da rapidez do ponto médio vira Flip-and-Burn', () => {
    expect(computeMissionProfile(4.25 * LIGHT_YEAR_M, G0, 5)).toEqual(flip);
    expect(flip).toMatchObject({ coastEta: null, burnEndTau: flip.tauHalf, brakeStartTau: flip.tauHalf });
  });

  it('rejeita cruzeiro sem velocidade', () => {
    expect(() => computeMissionProfile(LIGHT_YEAR_M, G0, 0)).toThrow(RangeError);
  });
});

describe('equação do foguete relativístico', () => {
  it('foguete de fótons: m₀/m₁ = e^(2η_max); 1 g até Proxima ≈ 39', () => {
    const p = computeMissionProfile(4.25 * LIGHT_YEAR_M, G0);
    expect(rocketMassRatio(p)).toBeCloseTo(Math.exp(2 * p.etaMax), 9);
    expect(rocketMassRatio(p)).toBeCloseTo(38.8, 1);
  });

  it('exaustão mais lenta exige muito mais massa: v_e = 0,1c eleva a razão à 10ª potência', () => {
    const p = computeMissionProfile(4.25 * LIGHT_YEAR_M, G0);
    expect(relErr(rocketMassRatio(p, 0.1), rocketMassRatio(p) ** 10)).toBeLessThan(1e-9);
  });

  it('cruzar mais devagar economiza combustível', () => {
    const coast = computeMissionProfile(4.25 * LIGHT_YEAR_M, G0, Math.atanh(0.5));
    expect(rocketMassRatio(coast)).toBeCloseTo(3, 9); // e^(2·atanh 0,5) = (1 + β)/(1 − β)
  });
});

describe('escala logarítmica de γ (mostrador do painel)', () => {
  it('log₁₀γ ↔ η: ida e volta exatas, inclusive perto de γ = 1', () => {
    expect(rapidityFromLog10Gamma(0)).toBe(0);
    expect(rapidityFromLog10Gamma(7.5)).toBeCloseTo(Math.acosh(10 ** 7.5), 12);
    for (const s of [1e-12, 1e-6, 0.01, 1, 3.5, 7.5]) {
      expect(relErr(log10GammaFromRapidity(rapidityFromLog10Gamma(s)), s)).toBeLessThan(1e-9);
    }
    // η = 18 ↔ log₁₀γ ≈ 7,5 (as duas faixas da §7.1 coincidem)
    expect(log10GammaFromRapidity(18)).toBeCloseTo(7.52, 2);
  });
});

describe('limites e validação', () => {
  it('limite newtoniano: 1 km a 1 m/s² → t ≈ τ ≈ 2√(D/α), x ≈ ½ατ²', () => {
    const p = computeMissionProfile(1000, 1);
    const newtonian = 2 * Math.sqrt(1000);
    expect(relErr(p.tTotal, newtonian)).toBeLessThan(1e-9);
    expect(relErr(p.tauTotal, newtonian)).toBeLessThan(1e-9);
    const s = computeFlightState(p, 10);
    expect(relErr(s.positionM, 0.5 * 1 * 10 ** 2)).toBeLessThan(1e-9);
  });

  it('1 G até Proxima: ≈ 3,54 anos de bordo e ≈ 5,88 anos na Terra', () => {
    const p = computeMissionProfile(4.25 * LIGHT_YEAR_M, G0);
    expect(p.tauTotal / JULIAN_YEAR_S).toBeCloseTo(3.54, 2);
    expect(p.tTotal / JULIAN_YEAR_S).toBeCloseTo(5.88, 2);
  });

  it.each([
    [0, ALPHA],
    [-1, ALPHA],
    [Number.NaN, ALPHA],
    [LIGHT_YEAR_M, 0],
    [LIGHT_YEAR_M, Number.POSITIVE_INFINITY],
  ])('rejeita D = %f, α = %f', (d, a) => {
    expect(() => computeMissionProfile(d, a)).toThrow(RangeError);
  });
});

describe('catálogo de destinos (§4.3)', () => {
  it('ids batem com as chaves e a ordem é crescente em distância', () => {
    for (const [key, d] of Object.entries(DESTINATIONS)) expect(d.id).toBe(key);
    const distances = DESTINATION_LIST.map((d) => d.distanceLy);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it('"rumo a" com o artigo do nome: estrelas sem artigo, o aglomerado e a galáxia com contração', () => {
    expect(towardName(DESTINATIONS.betaVirginis)).toBe('a Beta Virginis');
    expect(towardName(DESTINATIONS.sgrA)).toBe('ao Centro Galáctico (Sagittarius A*)');
    expect(towardName(DESTINATIONS.andromeda)).toBe('à Galáxia de Andrômeda (M31)');
    expect(towardName(DESTINATIONS.virgoCluster)).toBe('ao Aglomerado de Virgem (M87)');
  });

  it.each([
    ['proxima', 10.0, 0],
    ['betaVirginis', 11.3, 1],
    ['sgrA', 15.5, 1],
    ['andromeda', 18.4, 1],
    ['virgoCluster', 20.3, 1],
  ] as const)('%s a 1,61×10⁶ G: ≈ %f min de bordo', (id, minutes, digits) => {
    const p = destinationMissionProfile(DESTINATIONS[id]);
    expect(p.tauTotal / 60).toBeCloseTo(minutes, digits);
  });

  it('todos os destinos mantêm uOneMinusBeta > 0 em float32 no pico', () => {
    for (const d of DESTINATION_LIST) {
      const p = destinationMissionProfile(d);
      const mid = computeFlightState(p, p.tauHalf);
      expect(Math.fround(mid.oneMinusBeta)).toBeGreaterThan(0);
      // L_contraída no flip ≈ c²/α ≈ 19 ls, independente do destino
      expect(Math.abs(mid.contractedDistanceRemainingM / LIGHT_SECOND_M - 19)).toBeLessThanOrEqual(1);
    }
  });

  it('o cruzeiro escolhido a 1,61×10⁶ G continua cruzeiro ao trocar para 1 g (limitado abaixo do ponto médio)', () => {
    const proxima = DESTINATIONS.proxima;
    const flipEta = destinationMissionProfile(proxima, 1).etaMax;
    // Sem o limite, η = 5 passa da rapidez do ponto médio a 1 g e a viagem vira Flip-and-Burn sem aviso.
    expect(destinationMissionProfile(proxima, 1, 5).coastEta).toBeNull();
    const eta = effectiveCoastEta(proxima, 1, 5)!;
    expect(eta).toBeCloseTo(flipEta * MAX_COAST_FRACTION, 12);
    expect(destinationMissionProfile(proxima, 1, eta).coastEta).toBe(eta);
    expect(effectiveCoastEta(proxima, 1.61e6, 5)).toBe(5);
    expect(effectiveCoastEta(proxima, 1, null)).toBeNull();
  });
});

describe('tempo de rádio da Terra (t − x/c = ∫ e^(−η) dτ)', () => {
  const C_M_S = 299_792_458;
  const proxima = DESTINATIONS.proxima;
  /** Cresce sempre e chega a t_total − D/c na parada no alvo. */
  function checkRadio(profile: ReturnType<typeof destinationMissionProfile>, tol: number) {
    let prev = -1;
    for (let i = 0; i <= 2000; i++) {
      const s = computeFlightState(profile, (i / 2000) * profile.tauTotal);
      expect(s.earthRadioTimeS).toBeGreaterThanOrEqual(prev);
      expect(s.earthRadioTimeS).toBeLessThanOrEqual(s.earthTimeS);
      prev = s.earthRadioTimeS;
    }
    const end = computeFlightState(profile, profile.tauTotal);
    const expected = profile.tTotal - profile.distanceM / C_M_S;
    expect(Math.abs(end.earthRadioTimeS - expected)).toBeLessThan(tol);
  }

  it('na demonstração: (c/α)(1 − e^(−η)) na subida, ~19 s de notícias da Terra até o meio do caminho', () => {
    const demo = destinationMissionProfile(proxima);
    const cOverA = C_M_S / demo.properAccel;
    const mid = computeFlightState(demo, demo.tauHalf);
    expect(mid.earthRadioTimeS).toBeCloseTo(cOverA * (1 - Math.exp(-demo.etaMax)), 12);
    expect(mid.earthRadioTimeS).toBeCloseTo(19, 0);
    // Exata também no início, onde t − x/c = τ(1 − η/2 + …) e a subtração perderia os dígitos.
    const eta = 1e-3 / cOverA;
    expect(computeFlightState(demo, 1e-3).earthRadioTimeS).toBeCloseTo(1e-3 * (1 - eta / 2 + (eta * eta) / 6), 15);
    checkRadio(demo, 1e-6);
  });

  it('com cruzeiro, a 1 g e rumo a Andrômeda, chega a t_total − D/c', () => {
    checkRadio(destinationMissionProfile(proxima, 1, Math.atanh(0.9)), 1e-3);
    checkRadio(destinationMissionProfile(proxima, 1), 1e-3);
    // Rumo a Andrômeda, t_total − D/c perde ~10⁻² s de precisão na subtração; a integral, não.
    checkRadio(destinationMissionProfile(DESTINATIONS.andromeda, 1), 1e2);
  });
});
