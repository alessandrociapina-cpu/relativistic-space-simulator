import { describe, expect, it } from 'vitest';
import { conicPolyline, lambert, lambertRevs, orbitalPeriod, propagate, specificEnergy } from './kepler';
import { cross, norm, sub, type Vec3 } from './vec3';

const MU_EARTH = 398_600;
const MU_SUN = 1.32712440018e11;
const AU = 149_597_870.7;

describe('propagação de Kepler em variáveis universais', () => {
  it('reproduz o exemplo 3.7 de Curtis (elipse, 1 hora)', () => {
    const { r, v } = propagate({ r: [7000, -12_124, 0], v: [2.6679, 4.621, 0] }, 3600, MU_EARTH);
    expect(r[0]).toBeCloseTo(-3297.8, 0);
    expect(r[1]).toBeCloseTo(7413.4, 0);
    expect(v[0]).toBeCloseTo(-8.2977, 3);
    // Curtis arredonda χ no meio da conta: a 4ª casa de vy não confere.
    expect(v[1]).toBeCloseTo(-0.96309, 2);
  });

  it('ida e volta numa hipérbole devolve o estado inicial e conserva a energia', () => {
    const start = { r: [6578, 0, 0] as Vec3, v: [0, 11.5, 0.8] as Vec3 };
    const out = propagate(start, 10 * 86_400, MU_EARTH);
    const back = propagate(out, -10 * 86_400, MU_EARTH);
    expect(norm(sub(back.r, start.r))).toBeLessThan(1e-4);
    expect(norm(sub(back.v, start.v))).toBeLessThan(1e-7);
    expect(specificEnergy(out, MU_EARTH)).toBeCloseTo(specificEnergy(start, MU_EARTH), 9);
    expect(specificEnergy(start, MU_EARTH)).toBeGreaterThan(0);
  });

  it('muitas voltas numa elipse e sem gravidade (linha reta)', () => {
    const leo = { r: [7000, 0, 0] as Vec3, v: [0, Math.sqrt(MU_EARTH / 7000), 0] as Vec3 };
    const period = 2 * Math.PI * Math.sqrt(7000 ** 3 / MU_EARTH);
    expect(norm(sub(propagate(leo, 25 * period, MU_EARTH).r, leo.r))).toBeLessThan(1e-3);
    expect(propagate({ r: [1, 2, 3], v: [1, 0, 0] }, 5, 0).r).toEqual([6, 2, 3]);
  });

  const relErr = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
  const angularMomentumErr = (s: { r: Vec3; v: Vec3 }, start: { r: Vec3; v: Vec3 }) =>
    norm(sub(cross(s.r, s.v), cross(start.r, start.v))) / norm(cross(start.r, start.v));

  it('sobrevoo hiperbólico rápido e intervalos longos: converge sem NaN e conserva energia e momento angular', () => {
    const MU_JUPITER = 126_686_534;
    const vInf = 30;
    const start = { r: [200_000, 0, 0] as Vec3, v: [0, Math.sqrt(vInf * vInf + (2 * MU_JUPITER) / 200_000), 0] as Vec3 };
    for (const years of [1, 50, 1e4]) {
      for (const sign of [1, -1]) {
        const dt = sign * years * 31_557_600;
        const s = propagate(start, dt, MU_JUPITER);
        expect([...s.r, ...s.v].every(Number.isFinite)).toBe(true);
        expect(relErr(specificEnergy(s, MU_JUPITER), specificEnergy(start, MU_JUPITER))).toBeLessThan(1e-12);
        // Longe do planeta, a distância cresce com v∞: r ≈ v∞·|dt|.
        expect(norm(s.r) / (vInf * Math.abs(dt))).toBeCloseTo(1, 2);
        // r e v ficam quase paralelos lá longe: r × v e a volta ao periapse perdem algarismos com r/b.
        expect(angularMomentumErr(s, start)).toBeLessThan(1e-11 * years);
        expect(norm(sub(propagate(s, -dt, MU_JUPITER).r, start.r)) / norm(s.r)).toBeLessThan(1e-11 * years);
      }
    }
  });

  it('volta de um chute ruim ou de um passo de Newton que fugiu para H ~ 700 sem esgotar as iterações', () => {
    // Antes paravam em 200 iterações longe da raiz: com F ~ e^H, o Newton só descia uma unidade de H por passo.
    const cases = [
      { mu: 5.479618758243372e-4, r0: 561.6611547421671, v: 1.3969957098544463e-3, th: 1.5994536144557265, dt: 6_765_268_273.6938305 },
      { mu: 3.1589838981728056, r0: 88_204_928.07439229, v: 2.7422318616881315e-4, th: 3.1049059783138335, dt: 7_160_026_697_158.583 },
    ];
    for (const { mu, r0, v, th, dt } of cases) {
      const start = { r: [r0, 0, 0] as Vec3, v: [v * Math.cos(th), v * Math.sin(th), 0] as Vec3 };
      const s = propagate(start, dt, mu);
      expect(relErr(specificEnergy(s, mu), specificEnergy(start, mu))).toBeLessThan(1e-9);
      expect(angularMomentumErr(s, start)).toBeLessThan(1e-9);
      expect(norm(sub(propagate(s, -dt, mu).r, start.r)) / norm(s.r)).toBeLessThan(1e-9);
    }
  });
});

describe('problema de Lambert', () => {
  it('reproduz o exemplo 5.2 de Curtis', () => {
    const { v1, v2 } = lambert([5000, 10_000, 2100], [-14_600, 2500, 7000], 3600, MU_EARTH);
    expect(v1[0]).toBeCloseTo(-5.9925, 3);
    expect(v1[1]).toBeCloseTo(1.9254, 3);
    expect(v1[2]).toBeCloseTo(3.2456, 3);
    expect(v2[0]).toBeCloseTo(-3.3125, 3);
    expect(v2[1]).toBeCloseTo(-4.1966, 3);
    expect(v2[2]).toBeCloseTo(-0.38529, 3);
  });

  it('a cônica de Lambert, propagada, chega ao ponto de destino (transferência Terra–Vênus)', () => {
    const r1: Vec3 = [AU, 0, 0];
    const r2: Vec3 = [-0.5 * 0.723 * AU, 0.866 * 0.723 * AU, 0];
    const dt = 120 * 86_400;
    const { v1 } = lambert(r1, r2, dt, MU_SUN);
    expect(norm(sub(propagate({ r: r1, v: v1 }, dt, MU_SUN).r, r2))).toBeLessThan(1);
  });
});

describe('Lambert com voltas completas', () => {
  it('as duas soluções de uma volta chegam ao destino no tempo pedido (transferência do tipo IV, como a da Magellan)', () => {
    const r1: Vec3 = [AU, 0, 0];
    const r2: Vec3 = [0.2 * 0.723 * AU, -0.98 * 0.723 * AU, 0.01 * AU];
    const dt = 460 * 86_400;
    const solutions = lambertRevs(r1, r2, dt, MU_SUN, 1);
    expect(solutions).toHaveLength(2);
    for (const { v1, a } of solutions) {
      const end = propagate({ r: r1, v: v1 }, dt, MU_SUN);
      expect(norm(sub(end.r, r2)) / AU).toBeLessThan(1e-9);
      expect(a).toBeGreaterThan(0);
    }
    expect(Math.abs(solutions[0]!.a - solutions[1]!.a) / AU).toBeGreaterThan(1e-3);
    // Pouco tempo para uma volta inteira: não há solução.
    expect(lambertRevs(r1, r2, 100 * 86_400, MU_SUN, 1)).toHaveLength(0);
  });

  it('sem voltas, coincide com o Lambert simples', () => {
    const [only] = lambertRevs([5000, 10_000, 2100], [-14_600, 2500, 7000], 3600, MU_EARTH, 0);
    expect(only!.v1[0]).toBeCloseTo(-5.9925, 3);
  });
});

describe('órbitas fechadas', () => {
  it('o período sai da energia e a elipse desenhada passa pelo estado', () => {
    const state = { r: [AU, 0, 0] as Vec3, v: [0, 29.78, 0] as Vec3 };
    expect(orbitalPeriod(specificEnergy(state, MU_SUN), MU_SUN) / 86_400).toBeCloseTo(365.2, 0);
    const points = conicPolyline(state, MU_SUN, 64)!;
    expect(norm(sub(points[0]!, points[64]!))).toBeLessThan(1e-3);
    expect(Math.min(...points.map((p) => norm(sub(p, state.r))))).toBeLessThan(1e-3 * AU);
    expect(conicPolyline({ r: [AU, 0, 0], v: [0, 50, 0] }, MU_SUN)).toBeNull();
  });
});
