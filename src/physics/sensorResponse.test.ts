import { describe, expect, it } from 'vitest';
import { buildSensorLut, resolvedTargetGain, sampleSensorLut, sensorLuminance, sensorRgb } from './sensorResponse';

describe('tabela do sensor (sampleBlackbodySensor no shader)', () => {
  const lut = buildSensorLut();

  it('reproduz a conta direta com erro < 1% da CMB em repouso ao centro galáctico', () => {
    for (const t of [300, 800, 1500, 3042, 5778, 9940, 3e4, 1e6, 1e9, 1e12]) {
      const exact = sensorRgb(t);
      const table = sampleSensorLut(lut, t);
      // Canais cortados em 0 (cores fora do gamut) viram ~10⁻³⁸ na tabela: erro relativo ao canal mais forte.
      const strongest = Math.max(...exact);
      for (let c = 0; c < 3; c++) expect(Math.abs(table[c]! - exact[c]!) / strongest).toBeLessThan(0.01);
    }
  });

  it('é zero abaixo de 250 K, como no shader', () => {
    expect(sampleSensorLut(lut, 200)).toEqual([0, 0, 0]);
    expect(sensorRgb(249)).toEqual([0, 0, 0]);
  });

  it('o canal Y da cor coincide com a luminância usada na autoexposição', () => {
    const [r, g, b] = sensorRgb(5778);
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(sensorLuminance(5778, 0), 5);
  });
});

describe('alvo grande no para-brisa', () => {
  it('clareia uma anã vermelha que cobre metade da tela, e não mexe num alvo pontual', () => {
    const big = resolvedTargetGain({ eta: 0, sensorMode: 0, targetTempK: 3042, targetRadiusRestRad: 0.34, exposure: 200 });
    expect(big).toBeGreaterThan(10);
    const point = resolvedTargetGain({ eta: 0, sensorMode: 0, targetTempK: 3042, targetRadiusRestRad: 1e-6, exposure: 200 });
    expect(point).toBe(1);
  });

  it('nunca escurece: uma estrela quente já brilhante fica como está', () => {
    expect(resolvedTargetGain({ eta: 0, sensorMode: 0, targetTempK: 30_000, targetRadiusRestRad: 0.34, exposure: 200 })).toBe(1);
  });
});
