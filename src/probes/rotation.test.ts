import { describe, expect, it } from 'vitest';
import { bodyPosition } from './bodies';
import { poleDirection, surfaceCoordinates, surfaceState } from './rotation';
import { isoToDays } from './time';
import { angle, dot, norm, scale, sub, type Vec3 } from './vec3';

const unit = (v: Vec3) => scale(v, 1 / norm(v));

describe('rotação IAU dos corpos', () => {
  it('Marte gira uma vez a cada 24 h 37 min e o ponto da superfície volta ao lugar', () => {
    const t = isoToDays('1976-07-20T11:53Z');
    const a = surfaceState('mars', 22.7, 311.8, 3396.2, t);
    const sol = 360 / 350.89198226;
    // Só a precessão lenta do polo (0,1° por século) separa os dois pontos: ~0,2 m.
    expect(norm(sub(surfaceState('mars', 22.7, 311.8, 3396.2, t + sol).r, a.r))).toBeLessThan(1e-3);
    // Velocidade da rotação no equador: 2πR / dia sideral ≈ 0,24 km/s.
    expect(norm(surfaceState('mars', 0, 0, 3396.2, t).v)).toBeCloseTo(0.2408, 3);
    // Polo norte de Marte: ~25° de inclinação em relação à órbita (o eixo da eclíptica serve de aproximação).
    expect((angle(poleDirection('mars', t), [0, 0, 1]) * 180) / Math.PI).toBeGreaterThan(24);
    expect((angle(poleDirection('mars', t), [0, 0, 1]) * 180) / Math.PI).toBeLessThan(28);
  });

  it('a Lua mostra sempre a mesma face: o ponto sub-Terra fica perto de (0°, 0°)', () => {
    for (const iso of ['1969-07-20T20:17Z', '1971-02-05T09:18Z', '1972-12-11T19:55Z']) {
      const t = isoToDays(iso);
      const toEarth = unit(sub(bodyPosition('earth', t)!, bodyPosition('moon', t)!));
      const { latDeg, lonDeg } = surfaceCoordinates('moon', toEarth, t);
      // Librações de até ~8° em longitude e ~7° em latitude.
      expect(Math.abs(latDeg)).toBeLessThan(8);
      expect(Math.min(lonDeg, 360 - lonDeg)).toBeLessThan(9);
    }
  });

  it('coordenadas e posição da superfície são inversas uma da outra', () => {
    const t = isoToDays('1980-01-01');
    for (const body of ['mars', 'moon', 'venus'] as const) {
      const { r } = surfaceState(body, -33.5, 123.4, 1000, t);
      const { latDeg, lonDeg } = surfaceCoordinates(body, r, t);
      expect(latDeg).toBeCloseTo(-33.5, 9);
      expect(lonDeg).toBeCloseTo(123.4, 9);
      expect(Math.abs(dot(unit(r), poleDirection(body, t)) - Math.sin((-33.5 * Math.PI) / 180))).toBeLessThan(1e-12);
    }
  });
});
