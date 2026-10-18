import { describe, expect, it } from 'vitest';
import { formatAngle, formatEnergyEv, formatProse, formatSpan, formatWavelengthNm } from './format';
import { LIGHT_YEAR_M } from '../physics/RelativityEngine';
import { texAngle, texDistance, texDuration, texEnergyEv, texNumber, texSpeed, texWavelengthNm } from './tex';

describe('números em TeX', () => {
  it('vírgula decimal sem espaço e milhares com espaço fino', () => {
    expect(texNumber(2.72548, 4)).toBe('2{,}725');
    expect(texNumber(11_069)).toBe('11\\,069');
    expect(texNumber(289_777)).toBe('289\\,777');
    expect(texNumber(0)).toBe('0');
    expect(texNumber(-0.5)).toBe('-0{,}500');
  });

  it('potência de 10 fora de [10⁻³, 10⁶)', () => {
    expect(texNumber(3.532e6, 4)).toBe('3{,}532 \\times 10^{6}');
    expect(texNumber(4.01e-14)).toBe('4{,}01 \\times 10^{-14}');
  });

  it('unidades escolhidas pela ordem de grandeza', () => {
    expect(texSpeed(12.02e-6)).toBe('12{,}02\\ \\mu\\mathrm{m/s}');
    expect(texWavelengthNm(0.19)).toBe('190\\ \\mathrm{pm}');
    expect(texEnergyEv(3.7e3)).toBe('3{,}70\\ \\mathrm{keV}');
    expect(texDuration(598.8)).toBe('\\text{9 min 59 s}');
  });

  it('distâncias como nos visores; acima de 10⁷ anos-luz, a potência de 10 fora do \\text', () => {
    expect(texDistance(26_700 * LIGHT_YEAR_M)).toBe('\\text{26 700 anos-luz}');
    expect(texDistance(5.38e7 * LIGHT_YEAR_M)).toBe('5{,}380 \\times 10^{7}\\ \\text{anos-luz}');
  });

  it('ângulos entre chaves, para aceitar o sinal de minuto/segundo depois de uma potência', () => {
    expect(texAngle(Math.PI / 6)).toBe('{30{,}0}^\\circ');
    expect(texAngle(1e-10)).toBe("{2{,}06 \\times 10^{-5}}''");
  });
});

describe('texto corrido das explicações', () => {
  it('números sem ambiguidade em pt-BR', () => {
    expect(formatProse(2697)).toBe('2 697');
    expect(formatProse(2.697)).toBe('2,7');
    expect(formatProse(3.53e6)).toBe('3,53 × 10⁶');
  });

  it('durações por extenso', () => {
    expect(formatSpan(4.43)).toBe('4,4 s');
    expect(formatSpan(1348.4)).toBe('22 min 28 s');
    expect(formatSpan(25_603)).toBe('7 h 07 min');
    expect(formatSpan(2.794e6)).toBe('32,3 dias');
    expect(formatSpan(4.25 * 31_557_600)).toBe('4,25 anos');
  });

  it('ângulos, comprimentos de onda e energias', () => {
    expect(formatAngle(Math.PI / 6)).toBe('30,0°');
    expect(formatAngle(1 / 1348)).toBe('2,55′');
    expect(formatAngle(1 / 2.794e6)).toBe('0,0738″');
    expect(formatWavelengthNm(1.063e6)).toBe('1,06 mm');
    expect(formatWavelengthNm(394.2)).toBe('394 nm');
    expect(formatEnergyEv(2.62e15)).toBe('2,62 PeV');
  });
});
