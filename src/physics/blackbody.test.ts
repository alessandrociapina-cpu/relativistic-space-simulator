import { describe, expect, it } from 'vitest';
import { blackbodyCssColor, blackbodyLinearRgb, blackbodyLuminance } from './blackbody';
import { instrumentAutoExposure, sensorLuminance } from './sensorResponse';

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('corpo negro', () => {
  it('luminância de uma superfície a 5 778 K ≈ 1,9×10⁹ cd/m² (ordem do disco solar)', () => {
    const l = blackbodyLuminance(5778);
    expect(l).toBeGreaterThan(1.6e9);
    expect(l).toBeLessThan(2.1e9);
    expect(blackbodyLuminance(100)).toBe(0);
  });

  it('cresce com T e entra em Rayleigh–Jeans (∝ T) acima de 10⁹ K', () => {
    expect(blackbodyLuminance(12_000)).toBeGreaterThan(blackbodyLuminance(6000));
    expect(blackbodyLuminance(4e9) / blackbodyLuminance(2e9)).toBeCloseTo(2, 6);
  });

  it('cor normalizada para luminância 1', () => {
    const [r, g, b] = blackbodyLinearRgb(6500);
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 2);
  });

  it('resposta do sensor igual à do shader (estrela tipo solar ≈ 1,7×10⁻³)', () => {
    expect(sensorLuminance(5778, 0)).toBeCloseTo(1.728e-3, 5);
    expect(sensorLuminance(200, 0)).toBe(0);
    // IV vê um corpo de 481 K como o visível vê o Sol
    expect(sensorLuminance(5778 / 12, 1)).toBeCloseTo(sensorLuminance(5778, 0), 12);
  });

  it('autoexposição: céu estrelado em repouso, escurece com a CMB e mede pelo alvo resolvido', () => {
    const base = { sensorMode: 0, psfAngleRad: 4e-4, targetTempK: 3042, defaultExposure: 200 };
    expect(instrumentAutoExposure({ ...base, eta: 0, gamma: 1, targetRadiusRestRad: 1e-9 })).toBe(200);
    const mid = Math.acosh(3.53e6);
    const atMid = instrumentAutoExposure({ ...base, eta: mid, gamma: 3.53e6, psfAngleRad: 6e-9, targetRadiusRestRad: 1e-9 });
    expect(atMid).toBeLessThan(1);
    const arrival = instrumentAutoExposure({ ...base, eta: 0, gamma: 1, targetRadiusRestRad: 0.0167 });
    expect(arrival * sensorLuminance(3042, 0)).toBeCloseTo(0.6, 9);
  });

  it('3 000 K é alaranjado, 6 500 K quase branco e 30 000 K azulado', () => {
    const [r3, g3, b3] = channels(blackbodyCssColor(3000));
    expect(r3).toBeGreaterThan(g3!);
    expect(g3).toBeGreaterThan(b3!);
    expect(Math.min(...channels(blackbodyCssColor(6500)))).toBeGreaterThan(220);
    const [r30, , b30] = channels(blackbodyCssColor(30_000));
    expect(b30).toBeGreaterThan(r30!);
  });
});
