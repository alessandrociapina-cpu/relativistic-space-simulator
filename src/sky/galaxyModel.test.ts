import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '../physics/destinations';
import {
  GALACTIC_CENTER,
  distanceToCenterKpc,
  marchGlow,
  milkyWayDisplay,
  relativeStarDensity,
  shipPositionKpc,
  skyMapKeyframes,
} from './galaxyModel';
import { skyFrameFor, type Vec3 } from './skyFrame';

const SUN: Vec3 = [0, 0, 0];
const lb = (lDeg: number, bDeg: number): Vec3 => {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
};

describe('Via Láctea vista da Terra', () => {
  it('a faixa no plano galáctico é várias vezes mais brilhante que os polos', () => {
    const pole = marchGlow(SUN, lb(0, 90)).intensity;
    for (const l of [30, 90, 180, 270, 330]) expect(marchGlow(SUN, lb(l, 0)).intensity).toBeGreaterThan(4 * pole);
  });

  it('o trecho mais brilhante fica rumo ao centro, nas janelas fora da poeira do plano (nuvens de Sagitário)', () => {
    const window = marchGlow(SUN, lb(0, -4));
    expect(window.intensity).toBeGreaterThan(5 * marchGlow(SUN, lb(180, 0)).intensity);
    expect(window.bulgeFraction).toBeGreaterThan(0.5);
    expect(marchGlow(SUN, lb(180, 0)).bulgeFraction).toBeLessThan(0.05);
  });

  it('o brilho de exibição deixa os polos escuros e a faixa visível', () => {
    expect(milkyWayDisplay(marchGlow(SUN, lb(0, 90)).intensity)).toBeLessThan(0.015);
    expect(milkyWayDisplay(marchGlow(SUN, lb(90, 0)).intensity)).toBeGreaterThan(0.04);
  });
});

describe('a viagem muda o céu', () => {
  const gc = skyFrameFor(DESTINATIONS.sgrA);
  const m31 = skyFrameFor(DESTINATIONS.andromeda);

  it('a rota até Sgr A* termina no centro do modelo', () => {
    expect(distanceToCenterKpc(shipPositionKpc(gc.targetGalactic, DESTINATIONS.sgrA.distanceLy))).toBeLessThan(1e-6);
    expect(distanceToCenterKpc(SUN)).toBeCloseTo(8.186, 2);
    expect(GALACTIC_CENTER[0]).toBeCloseTo(8.186, 2);
  });

  it('a densidade de estrelas cresce milhões de vezes até o aglomerado nuclear', () => {
    expect(relativeStarDensity(SUN)).toBeCloseTo(1, 6);
    const near = relativeStarDensity(shipPositionKpc(gc.targetGalactic, 25_000));
    const center = relativeStarDensity(shipPositionKpc(gc.targetGalactic, DESTINATIONS.sgrA.distanceLy));
    expect(near).toBeGreaterThan(100);
    expect(center).toBeGreaterThan(1e6);
  });

  it('no centro galáctico, o céu inteiro brilha milhares de vezes mais que a Via Láctea vista daqui', () => {
    const center = shipPositionKpc(gc.targetGalactic, DESTINATIONS.sgrA.distanceLy);
    expect(marchGlow(center, lb(0, 90)).intensity).toBeGreaterThan(1000 * marchGlow(SUN, lb(90, 0)).intensity);
  });

  it('a caminho de Andrômeda, as estrelas somem e a Via Láctea vira uma galáxia lá atrás', () => {
    const far = shipPositionKpc(m31.targetGalactic, 300_000);
    expect(relativeStarDensity(far)).toBeLessThan(1e-6);
    // Olhando para trás (para o Sol), o disco ainda brilha: o brilho superficial não cai com a distância.
    const back: Vec3 = [-m31.targetGalactic[0], -m31.targetGalactic[1], -m31.targetGalactic[2]];
    expect(marchGlow(far, back).intensity).toBeGreaterThan(0.5);
    // Para os lados, só o espaço intergaláctico.
    expect(marchGlow(far, lb(121, 68.4)).intensity).toBe(0);
  });

  it('mapas da rota: só o da Terra nas viagens curtas; mais densos perto do centro galáctico', () => {
    expect(skyMapKeyframes(skyFrameFor(DESTINATIONS.proxima).targetGalactic, 4.25)).toEqual([0]);
    const keys = skyMapKeyframes(gc.targetGalactic, DESTINATIONS.sgrA.distanceLy);
    expect(keys[0]).toBe(0);
    expect(keys.at(-1)).toBe(DESTINATIONS.sgrA.distanceLy);
    expect(keys.filter((d) => d > 26_000).length).toBeGreaterThan(5);
    // Andrômeda: nenhum adensamento no fim, fora da galáxia.
    const m31Keys = skyMapKeyframes(m31.targetGalactic, DESTINATIONS.andromeda.distanceLy);
    expect(m31Keys.filter((d) => d > 2.5e6).length).toBe(1);
  });
});
