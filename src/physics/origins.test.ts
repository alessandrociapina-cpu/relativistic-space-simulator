import { describe, expect, it } from 'vitest';
import catalog from '../sky/data/bright-stars.json';
import { skyFrameFor } from '../sky/skyFrame';
import { displayAmplitude, parseCatalog } from '../sky/starCells';
import { computeFlightState } from './RelativityEngine';
import { DESTINATIONS, SOLAR_RADIUS_M, destinationMissionProfile } from './destinations';
import { ORIGINS, canTravel, missionDestination, originLuminosity, originPositionLy } from './origins';
import { AU_M, computeBodyAngularRadii } from './sky';

const erid = ORIGINS.eridani40;

describe('partida de outra estrela (Erid, em 40 Eridani A)', () => {
  it('da Terra, o destino é o próprio catálogo', () => {
    expect(missionDestination(ORIGINS.sol, 'tauCeti')).toBe(DESTINATIONS.tauCeti);
    expect(originPositionLy(ORIGINS.sol)).toEqual([0, 0, 0]);
  });

  it('de Erid, Tau Ceti fica a 10,1 anos-luz e Proxima a 18,0; a magnitude do alvo segue a nova distância', () => {
    const tau = missionDestination(erid, 'tauCeti');
    expect(tau.distanceLy).toBeCloseTo(10.08, 2);
    expect(tau.visualMag! - DESTINATIONS.tauCeti.visualMag!).toBeCloseTo(5 * Math.log10(tau.distanceLy / 11.912), 10);
    expect(missionDestination(erid, 'proxima').distanceLy).toBeCloseTo(18.03, 2);
    // Muito longe, a direção quase não muda: o centro galáctico e Andrômeda continuam no mesmo lugar do céu.
    const sgr = missionDestination(erid, 'sgrA');
    expect(Math.abs(sgr.raDeg - DESTINATIONS.sgrA.raDeg)).toBeLessThan(0.05);
    expect(Math.abs(sgr.distanceLy - DESTINATIONS.sgrA.distanceLy)).toBeLessThan(17);
  });

  it('não dá para partir e chegar na mesma estrela', () => {
    expect(canTravel(erid, 'eridani40')).toBe(false);
    expect(canTravel(erid, 'tauCeti')).toBe(true);
    expect(canTravel(ORIGINS.sol, 'eridani40')).toBe(true);
  });

  it('de Erid, o Sol vira uma estrela de magnitude 3,3 e 40 Eridani A sai do catálogo', () => {
    const sunMag = -2.5 * Math.log10(originLuminosity(ORIGINS.sol) / 16.34 ** 2);
    expect(sunMag).toBeCloseTo(3.33, 1);
    const target = missionDestination(erid, 'tauCeti');
    const frame = skyFrameFor(target);
    const stars = parseCatalog(catalog.stars, frame.icrsToShip, target.distanceLy, {
      positionLy: originPositionLy(erid),
      sunLuminosity: originLuminosity(ORIGINS.sol),
    });
    const fromSol = parseCatalog(catalog.stars, skyFrameFor(DESTINATIONS.tauCeti).icrsToShip, DESTINATIONS.tauCeti.distanceLy);
    // Saem 40 Eridani A e Tau Ceti (o alvo); entra o Sol.
    expect(stars.length).toBe(fromSol.length);
    const sun = stars.at(-1)!;
    expect(Math.hypot(...sun.position)).toBeCloseTo(16.34, 1);
    expect(displayAmplitude(sun.luminosity, 16.34)).toBeCloseTo(2.2 * 10 ** (-0.4 * 0.8 * 3.33), 1);
    // Nenhuma estrela colada na partida (seria um ponto de brilho infinito).
    expect(Math.min(...stars.map((s) => Math.hypot(...s.position)))).toBeGreaterThan(1);
  });

  it('a estrela de partida atrás da nave: 40 Eridani A vista de Erid, a 0,22 UA', () => {
    const profile = destinationMissionProfile(missionDestination(erid, 'tauCeti'), 2.09, null);
    const flight = computeFlightState(profile, 0);
    const { sunRadiusRad } = computeBodyAngularRadii(flight, missionDestination(erid, 'tauCeti'), erid);
    expect(sunRadiusRad).toBeCloseTo(Math.asin((0.804 * SOLAR_RADIUS_M) / (0.22 * AU_M)), 12);
    // O Sol visto da Terra: 0,267°.
    const sol = computeBodyAngularRadii(flight, DESTINATIONS.tauCeti);
    expect((sol.sunRadiusRad * 180) / Math.PI).toBeCloseTo(0.2666, 3);
  });
});
