import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '../physics/destinations';
import catalog from './data/bright-stars.json';
import { skyFrameFor, type Vec3 } from './skyFrame';
import {
  STAR_CELLS_N,
  buildStarCells,
  bvToTemperature,
  cubeFace,
  displayAmplitude,
  needsRebuild,
  packStar,
  parseCatalog,
} from './starCells';

const proximaFrame = skyFrameFor(DESTINATIONS.proxima);
const stars = parseCatalog(catalog.stars, proximaFrame.icrsToShip, DESTINATIONS.proxima.distanceLy);

/** Estrela mais brilhante vista da nave a `shipLy` anos-luz do Sol. */
function brightestFrom(shipLy: number) {
  return stars
    .map((s) => {
      const d = Math.hypot(s.position[0], s.position[1], s.position[2] + shipLy);
      return { star: s, amp: displayAmplitude(s.luminosity, d), distLy: d };
    })
    .sort((a, b) => b.amp - a.amp)[0]!;
}

describe('catálogo de estrelas reais', () => {
  it('8 920 estrelas até V = 6,5, das mais brilhantes para as mais fracas', () => {
    expect(catalog.count).toBe(8920);
    expect(catalog.stars.length).toBe(5 * 8920);
    expect(catalog.stars[2]).toBeLessThan(catalog.stars[catalog.stars.length - 3]!);
  });

  it('cor pelo índice B−V: Sol ≈ 5 800 K, estrelas azuis mais quentes, vermelhas mais frias', () => {
    expect(bvToTemperature(0.656)).toBeGreaterThan(5600);
    expect(bvToTemperature(0.656)).toBeLessThan(6000);
    expect(bvToTemperature(-0.2)).toBeGreaterThan(12_000);
    expect(bvToTemperature(1.5)).toBeLessThan(4000);
  });

  it('da Terra, Sirius é a mais brilhante; chegando a Proxima, Alfa Centauri A (a ~0,18 ano-luz) domina', () => {
    expect(brightestFrom(0).distLy).toBeCloseTo(8.6, 0);
    const arrival = brightestFrom(DESTINATIONS.proxima.distanceLy);
    expect(arrival.distLy).toBeLessThan(0.25);
    expect(arrival.amp).toBeGreaterThan(50 * brightestFrom(0).amp);
  });

  it('o alvo sai do catálogo (o shader o desenha à parte)', () => {
    const sirius = skyFrameFor(DESTINATIONS.sirius);
    expect(parseCatalog(catalog.stars, sirius.icrsToShip, DESTINATIONS.sirius.distanceLy).length).toBe(8919);
    // Beta Virginis (V = 3,6), o destino da Leonora Christine, também.
    const betaVir = skyFrameFor(DESTINATIONS.betaVirginis);
    expect(parseCatalog(catalog.stars, betaVir.icrsToShip, DESTINATIONS.betaVirginis.distanceLy).length).toBe(8919);
    expect(stars.length).toBe(8920); // Proxima (V = 11) nem está no catálogo
  });

  it('empacota temperatura e luminosidade num float32 exato', () => {
    const packed = packStar(9940, 279);
    expect(Math.fround(packed)).toBe(packed);
    const t10 = Math.floor(packed / 1024);
    expect(t10 * 10).toBe(9940);
    expect(10 ** ((packed - t10 * 1024) / 100 - 2)).toBeCloseTo(279, -1);
  });

  it('cada estrela é dona da célula onde está, e a célula guarda a posição relativa à nave', () => {
    const build = buildStarCells(stars, 0);
    const sirius = brightestFrom(0).star;
    const dir = sirius.position.map((x) => x / Math.hypot(...sirius.position)) as unknown as Vec3;
    const { face, u, v } = cubeFace(dir);
    const i = Math.floor(((u + 1) / 2) * STAR_CELLS_N);
    const j = Math.floor(((v + 1) / 2) * STAR_CELLS_N);
    const cell = (face * STAR_CELLS_N + j) * STAR_CELLS_N + i;
    expect(build.data[cell * 4]).toBeCloseTo(sirius.position[0], 3);
    expect(build.data[cell * 4 + 2]).toBeCloseTo(sirius.position[2], 3);
    expect(build.starCount).toBe(8920);
  });

  it('remonta quando a paralaxe da estrela mais próxima muda o bastante', () => {
    const build = buildStarCells(stars, 0);
    expect(needsRebuild(build, 0.001)).toBe(false);
    expect(needsRebuild(build, 0.05)).toBe(true);
  });
});
