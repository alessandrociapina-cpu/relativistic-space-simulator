import { describe, expect, it } from 'vitest';
import { conicPolyline, lambert, orbitalPeriod, propagate, specificEnergy } from './kepler';
import { norm, sub, type Vec3 } from './vec3';

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
