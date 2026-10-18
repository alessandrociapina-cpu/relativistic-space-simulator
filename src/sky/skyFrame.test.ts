import { describe, expect, it } from 'vitest';
import { DESTINATION_LIST, DESTINATIONS } from '../physics/destinations';
import { ICRS_TO_GALACTIC, apply, dot, equatorialUnit, galacticLonLat, skyFrameFor } from './skyFrame';

describe('referenciais do céu', () => {
  it('ICRS → galáctico: Sgr A* fica no centro (l ≈ 0, b ≈ 0) e o polo norte galáctico em b = 90°', () => {
    const sgr = galacticLonLat(apply(ICRS_TO_GALACTIC, equatorialUnit(266.4168, -29.0078)));
    expect(Math.min(sgr.l, 360 - sgr.l)).toBeLessThan(0.1);
    expect(Math.abs(sgr.b)).toBeLessThan(0.1);
    const ngp = galacticLonLat(apply(ICRS_TO_GALACTIC, equatorialUnit(192.8595, 27.1283)));
    expect(ngp.b).toBeCloseTo(90, 2);
  });

  it('Proxima e Andrômeda nas coordenadas galácticas conhecidas', () => {
    const proxima = galacticLonLat(skyFrameFor(DESTINATIONS.proxima).targetGalactic);
    expect(proxima.l).toBeCloseTo(313.9, 0);
    expect(proxima.b).toBeCloseTo(-1.9, 0);
    const m31 = galacticLonLat(skyFrameFor(DESTINATIONS.andromeda).targetGalactic);
    expect(m31.l).toBeCloseTo(121.2, 0);
    expect(m31.b).toBeCloseTo(-21.6, 0);
    // M87, no centro do Aglomerado de Virgem, fica perto do polo norte galáctico: a viagem sai por cima do disco.
    const m87 = galacticLonLat(skyFrameFor(DESTINATIONS.virgoCluster).targetGalactic);
    expect(m87.l).toBeCloseTo(283.8, 0);
    expect(m87.b).toBeCloseTo(74.5, 0);
  });

  it('em todo destino, o alvo fica exatamente em −Z e o norte galáctico projetado em +Y', () => {
    for (const d of DESTINATION_LIST) {
      const { icrsToShip, shipToGalactic } = skyFrameFor(d);
      const target = apply(icrsToShip, equatorialUnit(d.raDeg, d.decDeg));
      expect(target[0]).toBeCloseTo(0, 12);
      expect(target[1]).toBeCloseTo(0, 12);
      expect(target[2]).toBeCloseTo(-1, 12);
      // Base ortonormal e destra.
      const [x, y, z] = icrsToShip;
      expect(dot(x, y)).toBeCloseTo(0, 12);
      expect(dot(y, z)).toBeCloseTo(0, 12);
      expect(dot(x, x)).toBeCloseTo(1, 12);
      // +Y da nave aponta para o hemisfério galáctico norte.
      expect(apply(shipToGalactic, [0, 1, 0])[2]).toBeGreaterThan(0);
    }
  });
});
