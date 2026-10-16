import { describe, expect, it } from 'vitest';
import { JULIAN_YEAR_S, LIGHT_SECOND_M, LIGHT_YEAR_M } from '../physics/RelativityEngine';
import {
  formatCompact,
  formatDistance,
  formatDuration,
  formatFixed,
  formatGamma,
  formatProse,
  formatReadout,
  formatRouteDistance,
  formatScientific,
  formatSpaceNumber,
  formatSpan,
  formatVelocity,
} from './format';

describe('formatação pt-BR', () => {
  it('notação científica com expoente sobrescrito', () => {
    expect(formatScientific(3_531_700)).toBe('3,53 × 10⁶');
    expect(formatScientific(2.5328e-14)).toBe('2,53 × 10⁻¹⁴');
    expect(formatScientific(9.999e5)).toBe('1,00 × 10⁶');
    expect(formatScientific(0)).toBe('0');
  });

  it('γ e valores compactos', () => {
    expect(formatGamma(1)).toBe('1,000');
    expect(formatGamma(984.8)).toBe('984,800');
    expect(formatGamma(3.5317e6)).toBe('3,53 × 10⁶');
    expect(formatCompact(1.61e6)).toBe('1,61 × 10⁶');
    expect(formatCompact(26_700)).toBe('2,67 × 10⁴');
    expect(formatCompact(4.25)).toBe('4,25');
  });

  it('relógios truncam como um relógio', () => {
    expect(formatDuration(0)).toBe('0,0 s');
    expect(formatDuration(59.99)).toBe('59,9 s');
    expect(formatDuration(299.44)).toBe('04:59,4');
    expect(formatDuration(599.99)).toBe('09:59,9');
    expect(formatDuration(3 * 3600 + 62)).toBe('03:01:02');
    expect(formatDuration(10 * 86_400)).toBe('10,00 dias');
    expect(formatDuration(4.25 * JULIAN_YEAR_S)).toBe('4,250 anos');
    expect(formatDuration(2.537e6 * JULIAN_YEAR_S)).toBe('2 537 000 anos');
  });

  it('distâncias em anos-luz, UA, segundos-luz e km', () => {
    expect(formatDistance(4.25 * LIGHT_YEAR_M)).toBe('4,250 anos-luz');
    expect(formatDistance(26_700 * LIGHT_YEAR_M)).toBe('26 700 anos-luz');
    expect(formatDistance(1.5e12)).toBe('10,03 UA');
    expect(formatDistance(18.99 * LIGHT_SECOND_M)).toBe('18,99 s-luz');
    expect(formatDistance(1234)).toBe('1,234 km');
    expect(formatDistance(0)).toBe('0 km');
  });

  it('milhares separados por espaço e distâncias da rota', () => {
    expect(formatSpaceNumber(3_123_953)).toBe('3 123 953');
    expect(formatSpaceNumber(11_065.4)).toBe('11 065');
    expect(formatSpaceNumber(42)).toBe('42');
    expect(formatRouteDistance(15 * 1.495978707e11)).toBe('15,0 UA');
    expect(formatRouteDistance(1.495978707e11)).toBe('1,00 UA');
    expect(formatRouteDistance(4.25 * LIGHT_YEAR_M)).toBe('4,25 a.l.');
    expect(formatRouteDistance(2.537e6 * LIGHT_YEAR_M)).toBe('2 537 000 a.l.');
  });

  it('visores ao vivo mantêm a largura: zeros à direita e milhar com espaço', () => {
    // 4,57 → 4,40 (não "4,4"): o número não encolhe e não empurra o texto.
    expect(formatReadout(4.4)).toBe('4,40');
    expect(formatReadout(4.57)).toBe('4,57');
    expect(formatReadout(0.5)).toBe('0,500');
    expect(formatReadout(12_345)).toBe('12 345');
    expect(formatReadout(3.2e6)).toBe('3,20 × 10⁶');
    expect(formatSpan(12 * 86_400)).toBe('12,0 dias');
    expect(formatSpan(4.4)).toBe('4,4 s');
    expect(formatFixed(6955.1234, 3)).toBe('6 955,123');
    expect(formatGamma(6955.1234)).toBe('6 955,123');
    // O texto corrido continua sem zeros à direita.
    expect(formatProse(4.4)).toBe('4,4');
    expect(formatProse(1)).toBe('1');
  });

  it('velocidade: fração de c até 0,99c, depois c − v', () => {
    expect(formatVelocity(0.5, 0.5)).toBe('0,5000 c');
    expect(formatVelocity(1 - 4.0086e-14, 4.0086e-14)).toBe('c − 12,02 µm/s');
    expect(formatVelocity(1, 1.1e-25)).toBe('c − 3,30 × 10⁻¹⁷ m/s');
  });
});
