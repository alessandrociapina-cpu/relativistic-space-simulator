import { describe, expect, it } from 'vitest';
import { computeFlightState, withRapidity } from '../physics/RelativityEngine';
import { DESTINATIONS, destinationMissionProfile } from '../physics/destinations';
import { cmbTemperatureAhead, wienPeakNm } from '../physics/EyeAndPhotometry';
import { AU_M, arrivalDistanceM } from '../physics/sky';
import { hologramCountdownS, selectHologramMode, type HologramMode } from './hologramMode';
import { OORT_CLOUD_AU, SATURN_AU, routeGeometry, routePosition, sunMarkerPosition } from './routeScale';

const proxima = DESTINATIONS.proxima;
const profile = destinationMissionProfile(proxima);

function modeAt(tau: number, mode: 'autopilot' | 'manual' = 'autopilot'): HologramMode {
  const base = computeFlightState(profile, tau);
  const flight = mode === 'manual' ? withRapidity(base, base.eta) : base;
  const cmbTempK = cmbTemperatureAhead(flight.eta);
  return selectHologramMode({
    mode,
    flight,
    profile,
    sunDistanceAu: (AU_M + flight.positionM) / AU_M,
    cmbTempK,
    cmbPeakNm: wienPeakNm(cmbTempK),
  });
}

describe('cronologia dos hologramas na missão para Proxima', () => {
  it.each([
    [0, 'none'],
    [60, 'none'],
    [120, 'solar-system'],
    [150, 'cmb-spectrum'],
    [190, 'lux-curve'],
    [250, 'none'],
    [295, 'countdown-flip'],
    [300, 'none'],
    [420, 'eye-adaptation'],
    [449, 'eye-adaptation'],
    [462, 'cmb-spectrum'],
    [500, 'target-blueshift'],
    [595, 'countdown-arrival'],
    [profile.tauTotal, 'none'],
  ] as const)('τ = %f s → %s', (tau, expected) => {
    expect(modeAt(tau)).toBe(expected);
  });

  it('no Cruzeiro Livre só aparece o espectro da CMB', () => {
    expect(modeAt(150, 'manual')).toBe('cmb-spectrum');
    expect(modeAt(295, 'manual')).toBe('none');
  });
});

describe('hologramas em viagens longas', () => {
  const oneG = destinationMissionProfile(proxima, 1);
  const at = (tau: number, eyeDimmer?: number) => {
    const flight = computeFlightState(oneG, tau);
    const cmbTempK = cmbTemperatureAhead(flight.eta);
    return selectHologramMode({
      mode: 'autopilot',
      flight,
      profile: oneG,
      sunDistanceAu: (AU_M + flight.positionM) / AU_M,
      cmbTempK,
      cmbPeakNm: wienPeakNm(cmbTempK),
      ...(eyeDimmer === undefined ? {} : { eyeDimmer }),
    });
  };

  it('a contagem do flip e da chegada ocupa 1/60 da viagem (dias, não segundos)', () => {
    expect(hologramCountdownS(profile)).toBe(10);
    expect(at(oneG.brakeStartTau - oneG.tauTotal / 100)).toBe('countdown-flip');
    expect(at(oneG.tauTotal - oneG.tauTotal / 100)).toBe('countdown-arrival');
    expect(at(oneG.brakeStartTau - oneG.tauTotal / 30)).not.toBe('countdown-flip');
  });

  it('o holograma do olho só aparece quando a luz parece mesmo mais fraca', () => {
    const tau = 449;
    const base = { mode: 'autopilot' as const, profile, flight: computeFlightState(profile, tau) };
    const cmbTempK = cmbTemperatureAhead(base.flight.eta);
    const ctx = { ...base, sunDistanceAu: 1e5, cmbTempK, cmbPeakNm: wienPeakNm(cmbTempK) };
    expect(selectHologramMode({ ...ctx, eyeDimmer: 1286 })).toBe('eye-adaptation');
    expect(selectHologramMode({ ...ctx, eyeDimmer: 1.1 })).toBe('cmb-spectrum');
  });
});

describe('escala logarítmica da rota', () => {
  const geometry = routeGeometry(profile, arrivalDistanceM(proxima));
  const at = (tau: number) => routePosition(computeFlightState(profile, tau), profile, geometry);

  it('0 na partida, 0,5 no ponto médio, 1 na chegada', () => {
    expect(at(0)).toBeCloseTo(0, 9);
    expect(at(profile.tauHalf)).toBeCloseTo(0.5, 9);
    expect(at(profile.tauTotal)).toBeCloseTo(1, 9);
  });

  it('avança monotonicamente e é contínua no flip', () => {
    let prev = -1;
    for (let i = 0; i <= 400; i++) {
      const u = at((i / 400) * profile.tauTotal);
      expect(u).toBeGreaterThanOrEqual(prev);
      prev = u;
    }
    expect(at(profile.tauHalf * (1 + 1e-9))).toBeCloseTo(0.5, 6);
  });

  it('Saturno perto do Sol e a Nuvem de Oort antes do meio do caminho', () => {
    expect(sunMarkerPosition(SATURN_AU, geometry)).toBeCloseTo(0.095, 2);
    const oort = sunMarkerPosition(OORT_CLOUD_AU, geometry);
    expect(oort).toBeGreaterThan(0.3);
    expect(oort).toBeLessThan(0.5);
  });
});
