import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '../physics/destinations';
import galaxyCatalog from './data/galaxies.json';
import { GALAXY_CELLS_N, MILKY_WAY_INSIDE_LY, buildGalaxyCells, galaxyCellOf, galaxyPeak, parseGalaxies } from './galaxyCells';
import { equatorialUnit, length, scale, skyFrameFor, sub } from './skyFrame';
import { STAR_SIGMA_MAX, displayAmplitude } from './starCells';

const gc = scale(equatorialUnit(DESTINATIONS.sgrA.raDeg, DESTINATIONS.sgrA.decDeg), DESTINATIONS.sgrA.distanceLy);
const forVoid = () =>
  parseGalaxies(galaxyCatalog, skyFrameFor(DESTINATIONS.intergalacticVoid).icrsToShip, DESTINATIONS.intergalacticVoid, [0, 0, 0], gc);

/** A galáxia dona da célula na direção dela, vista da nave a `shipLy` (e o brilho com que aparece). */
function ownerAt(name: string, shipLy: number) {
  const galaxies = forVoid();
  const g = galaxies.find((x) => x.name === name)!;
  const build = buildGalaxyCells(galaxies, shipLy);
  const rel = sub(g.position, [0, 0, -shipLy]);
  const dist = length(rel);
  const cell = galaxyCellOf(scale(rel, 1 / dist));
  const n = GALAXY_CELLS_N;
  const row = Math.floor(cell / n);
  const a = (row * 4 * n + 4 * (cell % n)) * 4;
  return { luminosity: build.data[a + 3]!, galaxy: g, dist, amp: displayAmplitude(g.luminosity, dist), build };
}

describe('galáxias do OpenNGC no céu (§12)', () => {
  it('o catálogo traz as Nuvens de Magalhães, Andrômeda, M33, M81, Centaurus A e o Aglomerado de Virgem', () => {
    const names = galaxyCatalog.names;
    for (const n of ['ESO056-115', 'NGC0292', 'NGC0224', 'NGC0598', 'NGC3031', 'NGC5128', 'NGC4486', 'NGC4472']) expect(names).toContain(n);
    expect(names.length).toBeGreaterThan(600);
    // Seis números por galáxia, e Andrômeda a 2,5 milhões de anos-luz.
    expect(galaxyCatalog.galaxies.length).toBe(6 * names.length);
    const m31 = forVoid().find((g) => g.name === 'NGC0224')!;
    expect(length(m31.position) / 2.54e6).toBeCloseTo(1, 1);
  });

  it('da Terra, Andrômeda e a Grande Nuvem de Magalhães são manchas visíveis; a Via Láctea é o brilho difuso', () => {
    const m31 = ownerAt('NGC0224', 0);
    expect(m31.luminosity).toBe(Math.fround(m31.galaxy.luminosity));
    const lmc = ownerAt('ESO056-115', 0);
    expect(lmc.luminosity).toBe(Math.fround(lmc.galaxy.luminosity));
    // A Grande Nuvem cobre graus de céu: muitas células.
    const sigma = lmc.galaxy.sigmaLy / lmc.dist;
    expect(sigma).toBeGreaterThan(0.02);
    expect(galaxyPeak(lmc.amp, sigma, STAR_SIGMA_MAX).peak).toBeGreaterThan(0.05);
    // Dentro da galáxia, a Via Láctea não entra na grade.
    expect(forVoid().some((g) => g.name === 'Via Láctea')).toBe(true);
    expect(MILKY_WAY_INSIDE_LY).toBeGreaterThan(100_000);
  });

  it('no vazio, a 40 milhões de anos-luz, as galáxias de Virgem brilham à frente como estrelas fracas', () => {
    const m87 = ownerAt('NGC4486', 4e7);
    // M87 a ~14 milhões de anos-luz: V ≈ 6, no limite do olho.
    expect(m87.dist / 1.38e7).toBeCloseTo(1, 1);
    const v = -2.5 * Math.log10(m87.galaxy.luminosity / (m87.dist * m87.dist));
    expect(v).toBeGreaterThan(5.5);
    expect(v).toBeLessThan(6.5);
    expect(m87.luminosity).toBeGreaterThan(0);
    // A Via Láctea, lá atrás, ainda entra (fraquinha), e Andrômeda continua no catálogo.
    const mw = ownerAt('Via Láctea', 4e7);
    expect(mw.dist).toBeGreaterThan(3.9e7);
    expect(mw.build.galaxyCount).toBeGreaterThan(10);
  });

  it('a galáxia que é o alvo sai do catálogo (o shader a desenha à parte)', () => {
    const andromeda = parseGalaxies(galaxyCatalog, skyFrameFor(DESTINATIONS.andromeda).icrsToShip, DESTINATIONS.andromeda);
    expect(andromeda.some((g) => g.name === 'NGC0224')).toBe(false);
    expect(andromeda.some((g) => g.name === 'NGC0598')).toBe(true);
    const virgo = parseGalaxies(galaxyCatalog, skyFrameFor(DESTINATIONS.virgoCluster).icrsToShip, DESTINATIONS.virgoCluster);
    expect(virgo.some((g) => g.name === 'NGC4486')).toBe(false);
    expect(virgo.some((g) => g.name === 'NGC4472')).toBe(true);
  });
});
