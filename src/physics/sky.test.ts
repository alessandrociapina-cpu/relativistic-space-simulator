import { describe, expect, it } from 'vitest';
import { computeFlightState } from './RelativityEngine';
import { DESTINATIONS, DESTINATION_LIST, SOLAR_RADIUS_M, destinationMissionProfile } from './destinations';
import { ARRIVAL_STANDOFF_RADII, AU_M, angularRadius, computeBodyAngularRadii, einsteinRadius } from './sky';

const proxima = DESTINATIONS.proxima;
const profile = destinationMissionProfile(proxima);

describe('raios angulares do Sol e do alvo', () => {
  it('na partida (1 UA do Sol), o Sol tem ≈ 0,26645° de raio e Proxima é sub-pixel', () => {
    const r = computeBodyAngularRadii(computeFlightState(profile, 0), proxima);
    expect((r.sunRadiusRad * 180) / Math.PI).toBeCloseTo(0.26645, 5);
    expect(r.targetRadiusRad).toBeGreaterThan(0);
    expect(r.targetRadiusRad).toBeLessThan(1e-8);
  });

  it('na chegada, todo alvo fica à distância de parada, e uma estrela ocupa mais da metade do para-brisa', () => {
    for (const d of DESTINATION_LIST) {
      const p = destinationMissionProfile(d);
      const r = computeBodyAngularRadii(computeFlightState(p, p.tauTotal), d);
      // No vazio intergaláctico não há alvo para desenhar.
      expect(r.targetRadiusRad).toBeCloseTo(d.kind === 'void' ? 0 : Math.asin(1 / ARRIVAL_STANDOFF_RADII[d.kind]), 12);
    }
    const arrival = computeBodyAngularRadii(computeFlightState(profile, profile.tauTotal), proxima);
    expect((2 * arrival.targetRadiusRad * 180) / Math.PI / 70).toBeGreaterThan(0.5);
  });

  it('na partida, Andrômeda tem o tamanho de céu da galáxia real (alguns graus)', () => {
    const andromeda = DESTINATIONS.andromeda;
    const r = computeBodyAngularRadii(computeFlightState(destinationMissionProfile(andromeda), 0), andromeda);
    expect((3 * r.targetRadiusRad * 180) / Math.PI).toBeGreaterThan(1.5);
    expect((3 * r.targetRadiusRad * 180) / Math.PI).toBeLessThan(3);
  });

  it('o Sol encolhe e o alvo cresce ao longo da viagem', () => {
    let prev = computeBodyAngularRadii(computeFlightState(profile, 0), proxima);
    for (let i = 1; i <= 100; i++) {
      const r = computeBodyAngularRadii(computeFlightState(profile, (i / 100) * profile.tauTotal), proxima);
      expect(r.sunRadiusRad).toBeLessThan(prev.sunRadiusRad);
      expect(r.targetRadiusRad).toBeGreaterThan(prev.targetRadiusRad);
      prev = r;
    }
  });

  it('no ponto médio, o Sol é ≈ R☉ / (UA + D/2)', () => {
    const mid = computeFlightState(profile, profile.tauHalf);
    const r = computeBodyAngularRadii(mid, proxima);
    expect(r.sunRadiusRad).toBeCloseTo(SOLAR_RADIUS_M / (AU_M + profile.halfDistanceM), 20);
  });

  it('angularRadius satura em 90° dentro do corpo', () => {
    expect(angularRadius(1, 0.5)).toBe(Math.PI / 2);
    expect(angularRadius(1, 2)).toBeCloseTo(Math.PI / 6, 15);
  });
});

describe('lente gravitacional de Sagittarius A* (raio de Einstein físico)', () => {
  const sgrA = DESTINATIONS.sgrA;
  const profile = destinationMissionProfile(sgrA);
  const LIGHT_YEAR_M = 9.4607304725808e15;

  it('a sombra é a de 4 milhões de massas solares: 3√3·GM/c² ≈ 44 R☉', () => {
    const gm = sgrA.gravitationalRadiusM!;
    expect(gm).toBeCloseTo(4e6 * 1476.625, -4);
    expect(sgrA.radiusM).toBeCloseTo(3 * Math.sqrt(3) * gm, 0);
    expect(sgrA.radiusM / SOLAR_RADIUS_M).toBeCloseTo(44.1, 0);
  });

  it('θE = 2√(GM/(c²D)): ~2,5 vezes a sombra na chegada, centenas de vezes a 1 ano-luz', () => {
    const arrival = computeBodyAngularRadii(computeFlightState(profile, profile.tauTotal), sgrA);
    expect(arrival.einsteinRadiusRad).toBeCloseTo(2 / Math.sqrt(8 * 3 * Math.sqrt(3)), 9);
    expect(arrival.einsteinRadiusRad / arrival.targetRadiusRad).toBeCloseTo(2.475, 3);
    expect(einsteinRadius(sgrA.gravitationalRadiusM!, LIGHT_YEAR_M)).toBeCloseTo(1.58e-3, 5);
    // Na borda da sombra o desvio θE²/θ é 4/(3√3) ≈ 0,77 rad em qualquer distância.
    for (const distanceM of [8 * sgrA.radiusM, 1e3 * sgrA.radiusM, LIGHT_YEAR_M]) {
      const thetaE = einsteinRadius(sgrA.gravitationalRadiusM!, distanceM);
      expect((thetaE * thetaE) / (sgrA.radiusM / distanceM)).toBeCloseTo(4 / (3 * Math.sqrt(3)), 12);
    }
    // Só o buraco negro tem lente.
    for (const d of DESTINATION_LIST.filter((d) => d.kind !== 'blackHole')) {
      const p = destinationMissionProfile(d);
      expect(computeBodyAngularRadii(computeFlightState(p, p.tauHalf), d).einsteinRadiusRad).toBe(0);
    }
  });
});
