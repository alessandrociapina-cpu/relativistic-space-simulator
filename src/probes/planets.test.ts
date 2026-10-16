import { describe, expect, it } from 'vitest';
import fixtures from './data/planet-fixtures.json';
import planetTables from './data/planets.json';
import { interpolatePosition, muAu, unpackTable } from './ephemeris';
import { PLANETS, PLANET_LIST, SUN_GM, keplerPosition, orbitPolyline, planetPosition, planetVelocity, type PlanetId } from './planets';
import { AU_KM } from './probes';
import { norm, sub, type Vec3 } from './vec3';

const errorKm = (id: PlanetId, row: readonly number[], position = planetPosition) =>
  norm(sub(position(id, row[0]!), [row[1]!, row[2]!, row[3]!] as Vec3)) * AU_KM;

const rows = (id: string) => (fixtures.bodies as Record<string, number[][]>)[id]!;

describe('posições dos planetas contra o JPL Horizons', () => {
  it.each(['mercury', 'venus', 'earth', 'mars'] as const)('%s (elementos de Kepler): erro < 50 000 km', (id) => {
    for (const row of rows(id)) expect(errorKm(id, row)).toBeLessThan(50_000);
  });

  it.each(['jupiter', 'saturn', 'uranus', 'neptune'] as const)('%s (tabela do Horizons): erro < 1 500 km', (id) => {
    for (const row of rows(id)) expect(errorKm(id, row)).toBeLessThan(1_500);
  });

  it('os elementos aproximados dos planetas externos erram até ~0,03 UA (por isso as tabelas)', () => {
    const kepler = (id: PlanetId, t: number) => keplerPosition(PLANETS[id], t);
    for (const id of ['jupiter', 'saturn', 'uranus', 'neptune'] as const) {
      for (const row of rows(id)) expect(errorKm(id, row, kepler) / AU_KM).toBeLessThan(0.03);
    }
  });

  it('os elementos de Plutão (só para desenhar a órbita) ficam a < 0,01 UA da tabela', () => {
    const table = unpackTable(planetTables.pluto, muAu(SUN_GM + PLANETS.pluto.gm));
    for (const t of [-10_000, 0, 5_675, 9_000]) {
      expect(norm(sub(keplerPosition(PLANETS.pluto, t), interpolatePosition(table, t)))).toBeLessThan(0.01);
    }
  });
});

describe('órbitas e velocidades', () => {
  it('a órbita desenhada fecha e fica entre o periélio e o afélio', () => {
    for (const planet of PLANET_LIST) {
      const [a, e] = planet.elements.value;
      const points = orbitPolyline(planet, 0, 128);
      expect(norm(sub(points[0]!, points[128]!))).toBeLessThan(1e-12);
      for (const p of points) {
        expect(norm(p)).toBeGreaterThanOrEqual(a * (1 - e) - 1e-9);
        expect(norm(p)).toBeLessThanOrEqual(a * (1 + e) + 1e-9);
      }
    }
  });

  it('a Terra anda ~29,8 km/s e Júpiter ~13 km/s em torno do Sol', () => {
    const kms = (id: PlanetId) => (norm(planetVelocity(id, 0)) * AU_KM) / 86_400;
    expect(kms('earth')).toBeCloseTo(29.8, 0);
    expect(kms('jupiter')).toBeGreaterThan(12.4);
    expect(kms('jupiter')).toBeLessThan(13.8);
  });
});
