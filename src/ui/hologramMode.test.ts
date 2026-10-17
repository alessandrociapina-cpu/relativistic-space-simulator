import { describe, expect, it } from 'vitest';
import { computeFlightState } from '../physics/RelativityEngine';
import { DESTINATIONS, destinationMissionProfile } from '../physics/destinations';
import { missionProfileFor } from '../physics/crewRest';
import { cmbTemperatureAhead, wienPeakNm } from '../physics/EyeAndPhotometry';
import { AU_M, arrivalDistanceM } from '../physics/sky';
import { hologramCountdownS, selectHologramMode, type HologramMode } from './hologramMode';
import { OORT_CLOUD_AU, SATURN_AU, routeGeometry, routePosition, sunMarkerPosition } from './routeScale';

const proxima = DESTINATIONS.proxima;
const profile = destinationMissionProfile(proxima);

function modeAt(tau: number): HologramMode {
  const flight = computeFlightState(profile, tau);
  const cmbTempK = cmbTemperatureAhead(flight.eta);
  return selectHologramMode({
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
    [449, 'cmb-spectrum'],
    [462, 'cmb-spectrum'],
    [500, 'target-blueshift'],
    [595, 'countdown-arrival'],
    [profile.tauTotal, 'none'],
  ] as const)('τ = %f s → %s', (tau, expected) => {
    expect(modeAt(tau)).toBe(expected);
  });
});

describe('hologramas em viagens longas', () => {
  const oneG = destinationMissionProfile(proxima, 1);
  const at = (tau: number) => {
    const flight = computeFlightState(oneG, tau);
    const cmbTempK = cmbTemperatureAhead(flight.eta);
    return selectHologramMode({
      flight,
      profile: oneG,
      sunDistanceAu: (AU_M + flight.positionM) / AU_M,
      cmbTempK,
      cmbPeakNm: wienPeakNm(cmbTempK),
    });
  };

  it('a contagem do flip e da chegada ocupa 1/60 da viagem (dias, não segundos)', () => {
    expect(hologramCountdownS(profile)).toBe(10);
    expect(at(oneG.brakeStartTau - oneG.tauTotal / 100)).toBe('countdown-flip');
    expect(at(oneG.tauTotal - oneG.tauTotal / 100)).toBe('countdown-arrival');
    expect(at(oneG.brakeStartTau - oneG.tauTotal / 30)).not.toBe('countdown-flip');
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

describe('descansos da tripulação', () => {
  it('a curva de luz na subida e o alvo azulado na frenagem continuam nos descansos (o projetor não pisca)', () => {
    const plan = missionProfileFor(DESTINATIONS.andromeda, 10, null, 'crewed');
    const modeIn = (tau: number) => {
      const flight = computeFlightState(plan, tau);
      const cmbTempK = cmbTemperatureAhead(flight.eta);
      return {
        flight,
        mode: selectHologramMode({ flight, profile: plan, sunDistanceAu: (AU_M + flight.positionM) / AU_M, cmbTempK, cmbPeakNm: wienPeakNm(cmbTempK) }),
      };
    };
    const seen = { lux: false, blue: false };
    for (let i = 1; i < 6000; i++) {
      const { flight, mode } = modeIn((i / 6000) * plan.tauTotal);
      if (!flight.crewRest) continue;
      const tK = cmbTemperatureAhead(flight.eta);
      if (flight.tau < plan.burnEndTau && tK > 16_000 && tK < 170_000 && wienPeakNm(tK) < 250) {
        expect(mode).toBe('lux-curve');
        seen.lux = true;
      }
      if (flight.tau > plan.brakeStartTau && flight.gamma > 9 && flight.gamma < 200 && plan.tauTotal - flight.tau > hologramCountdownS(plan)) {
        expect(mode).toBe('target-blueshift');
        seen.blue = true;
      }
    }
    expect(seen).toEqual({ lux: true, blue: true });
  });
});
