import { describe, expect, it } from 'vitest';
import v1Data from './data/voyager1.json';
import v2Data from './data/voyager2.json';
import { planetPosition } from './planets';
import {
  AU_KM,
  analyzeFlyby,
  lightTimeS,
  loadTrajectory,
  probePosition,
  probeVelocity,
  solarEscapeKms,
  speedKms,
  type ProbeData,
} from './probes';
import { daysToMs, isoToDays } from './time';
import { norm, sub } from './vec3';

const v1 = loadTrajectory(v1Data as ProbeData);
const v2 = loadTrajectory(v2Data as ProbeData);
const flybys = (probe: typeof v1) => probe.encounters.filter((e) => !e.departure).map(analyzeFlyby);
const isoDay = (days: number) => new Date(daysToMs(days)).toISOString().slice(0, 10);
const sunDistance = (probe: typeof v1, iso: string) => norm(probePosition(probe, isoToDays(iso))!);

describe('trajetórias das Voyagers (JPL Horizons)', () => {
  it('começam no lançamento, coladas na Terra', () => {
    expect(isoDay(v1.launch)).toBe('1977-09-05');
    expect(isoDay(v2.launch)).toBe('1977-08-20');
    expect(probePosition(v1, v1.launch - 1)).toBeNull();
    for (const probe of [v1, v2]) {
      const atLaunch = probePosition(probe, probe.launch)!;
      expect(norm(sub(atLaunch, planetPosition('earth', probe.launch))) * AU_KM).toBeLessThan(15_000);
    }
  });

  it('marcos de distância: Pálido Ponto Azul a ~40,5 UA e heliopausas a ~121,6 e ~119 UA', () => {
    expect(sunDistance(v1, '1990-02-14')).toBeCloseTo(40.5, 0);
    expect(sunDistance(v1, '2012-08-25')).toBeCloseTo(121.6, 0);
    expect(sunDistance(v2, '2018-11-05')).toBeCloseTo(119, 0);
  });

  it('não salta nas bordas das janelas de encontro', () => {
    for (const probe of [v1, v2]) {
      for (const e of probe.encounters) {
        // A janela de partida começa no lançamento: antes dele não há sonda.
        for (const edge of e.departure ? [e.end] : [e.start, e.end]) {
          const dt = 0.01;
          const a = probePosition(probe, edge - dt)!;
          const b = probePosition(probe, edge + dt)!;
          const expected = norm(probeVelocity(probe, edge)) * 2 * dt;
          expect(norm(sub(b, a))).toBeLessThan(expected * 1.5 + 1e-7);
        }
      }
    }
  });
});

describe('sobrevoos: os números históricos saem dos dados', () => {
  const [v1Jupiter, v1Saturn] = flybys(v1);
  const [v2Jupiter, v2Saturn, v2Uranus, v2Neptune] = flybys(v2);

  it('datas e distâncias de maior aproximação', () => {
    expect(isoDay(v1Jupiter!.closestT)).toBe('1979-03-05');
    expect(v1Jupiter!.closestKm).toBeCloseTo(348_400, -3); // ~349 mil km do centro
    expect(isoDay(v1Saturn!.closestT)).toBe('1980-11-12');
    expect(v1Saturn!.altitudeKm).toBeCloseTo(124_000, -3); // ~124 mil km acima das nuvens
    expect(isoDay(v2Jupiter!.closestT)).toBe('1979-07-09');
    expect(isoDay(v2Saturn!.closestT)).toBe('1981-08-26');
    expect(isoDay(v2Uranus!.closestT)).toBe('1986-01-24');
    expect(v2Uranus!.altitudeKm).toBeCloseTo(81_500, -3);
    expect(isoDay(v2Neptune!.closestT)).toBe('1989-08-25');
    expect(v2Neptune!.closestKm).toBeCloseTo(29_200, -3);
  });

  it('a deflexão medida bate com a fórmula da hipérbole sin(δ/2) = 1/(1 + r_p v∞²/μ)', () => {
    for (const f of [...flybys(v1), ...flybys(v2)]) {
      expect(Math.abs(f.deflectionDeg - f.predictedDeflectionDeg)).toBeLessThan(1);
    }
  });

  it('Júpiter acelerou as duas em ~10 km/s; Netuno freou a Voyager 2', () => {
    for (const f of [v1Jupiter!, v2Jupiter!]) {
      const gain = f.helioSpeedAfterKms - f.helioSpeedBeforeKms;
      expect(gain).toBeGreaterThan(9);
      expect(gain).toBeLessThan(11.5);
    }
    expect(v2Neptune!.helioSpeedAfterKms).toBeLessThan(v2Neptune!.helioSpeedBeforeKms);
  });
});

describe('física de apoio', () => {
  it('a Voyager 1 passa da velocidade de escape do Sol graças a Júpiter', () => {
    const at = (iso: string) => {
      const t = isoToDays(iso);
      return { v: speedKms(probeVelocity(v1, t)), escape: solarEscapeKms(norm(probePosition(v1, t)!)) };
    };
    const before = at('1978-06-01');
    const after = at('1980-01-01');
    expect(before.v).toBeLessThan(before.escape);
    expect(after.v).toBeGreaterThan(after.escape);
  });

  it('a luz leva ~499 s para percorrer 1 UA', () => {
    expect(lightTimeS(1)).toBeCloseTo(499, 0);
  });
});
