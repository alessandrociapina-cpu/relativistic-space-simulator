import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '../physics/destinations';
import { ORIGINS } from '../physics/origins';
import { aberrate, placeSkyLabels, skyLabelSources, type SkyView } from './skyLabels';

const rest = { eta: 0, gamma: 1, beta: 0, oneMinusBeta: 1 };
const moving = (eta: number) => ({ eta, gamma: Math.cosh(eta), beta: Math.tanh(eta), oneMinusBeta: Math.exp(-eta) / Math.cosh(eta) });

/** O telescópio de 320 × 240 px com zoom `zoom` sobre os 70° do para-brisa. */
function view(direction: 'front' | 'rear', zoom: number, exposure = 200): SkyView {
  const tanY = Math.tan((35 * Math.PI) / 180) / zoom;
  return {
    direction,
    widthPx: 320,
    heightPx: 240,
    tanHalfFovX: (tanY * 4) / 3,
    tanHalfFovY: tanY,
    psfAngleRad: (2 * tanY) / 240,
    exposure,
    backgroundGain: 1,
    sensorMode: 0,
  };
}

describe('rótulos dos objetos reais no telescópio', () => {
  it('a aberração em 64 bits: tan(θ\'/2) = e^(−η)·tan(θ/2) e o Doppler γ(1 + β cos θ)', () => {
    const k = moving(10);
    const side = aberrate([1, 0, 0], k);
    expect(side.tanHalf).toBeCloseTo(Math.exp(-10), 15);
    expect(side.doppler / k.gamma).toBeCloseTo(1, 12);
    const ahead = aberrate([0, 0, -5], k);
    expect(ahead.tanHalf).toBe(0);
    expect(ahead.doppler / Math.exp(10)).toBeCloseTo(1, 12);
    // Atrás, D = e^(−η) sem cancelamento.
    const behind = aberrate([1e-9, 0, 1], k);
    expect(behind.doppler / Math.exp(-10)).toBeCloseTo(1, 6);
    // tan(θ/2) = (1 + z)/ρ ≈ 2 × 10⁹ atrás, comprimido por e^(−10).
    expect(behind.tanHalf / (2e9 * Math.exp(-10))).toBeCloseTo(1, 9);
  });

  it('da Terra, rumo a Proxima: o alvo fixo no centro e Alfa Centauri A ao lado', () => {
    const proxima = DESTINATIONS.proxima;
    const labels = placeSkyLabels(skyLabelSources(proxima, ORIGINS.sol), 0, rest, view('front', 13), [
      { name: proxima.name, kind: 'target' },
    ]);
    expect(labels[0]).toMatchObject({ name: 'Proxima Centauri', kind: 'target', x: 160, y: 120 });
    const alphaCen = labels.find((l) => l.name === 'Alfa Centauri A');
    expect(alphaCen).toBeDefined();
    // ~2,2° de Proxima, dentro do campo de 5,4° × 7,2°.
    expect(Math.hypot(alphaCen!.x - 160, alphaCen!.y - 120)).toBeGreaterThan(30);
  });

  it('a γ ≈ 3 × 10⁶, o céu inteiro cabe no telescópio voltado para a frente: estrelas de trás ganham nome', () => {
    const virgo = DESTINATIONS.intergalacticVoid;
    const k = moving(Math.acosh(2.83e6));
    const zoom = 0.253 * k.gamma;
    const labels = placeSkyLabels(skyLabelSources(virgo, ORIGINS.sol), 280, k, view('front', zoom), [], 8);
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.length).toBeLessThanOrEqual(8);
    for (const l of labels) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThanOrEqual(320);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(240);
    }
    // Nenhum nome em cima de outro.
    const names = new Set(labels.map((l) => l.name));
    expect(names.size).toBe(labels.length);
  });

  it('atrás, a estrela de partida fica fixa no centro', () => {
    const labels = placeSkyLabels(skyLabelSources(DESTINATIONS.proxima, ORIGINS.sol), 0, rest, view('rear', 13), [
      { name: 'Sol', kind: 'origin' },
    ]);
    expect(labels[0]).toMatchObject({ name: 'Sol', kind: 'origin', x: 160, y: 120 });
  });

  it('no vazio, com a exposição do campo profundo, as galáxias de Virgem têm nome', () => {
    const virgo = DESTINATIONS.intergalacticVoid;
    const labels = placeSkyLabels(skyLabelSources(virgo, ORIGINS.sol), virgo.distanceLy, rest, view('front', 13, 200 * 40), [], 8);
    expect(labels.some((l) => l.kind === 'galaxy' && /^M\d+/.test(l.name))).toBe(true);
  });

  it('o alvo sai da lista (tem o rótulo fixo); partindo de Erid, o Sol entra como estrela', () => {
    const sirius = skyLabelSources(DESTINATIONS.sirius, ORIGINS.sol);
    expect(sirius.some((s) => s.name === 'Sírius')).toBe(false);
    expect(sirius.some((s) => s.name === 'Canopus')).toBe(true);
    const fromErid = skyLabelSources(DESTINATIONS.tauCeti, ORIGINS.eridani40);
    expect(fromErid.some((s) => s.name === 'Sol' && s.kind === 'star')).toBe(true);
    expect(skyLabelSources(DESTINATIONS.andromeda, ORIGINS.sol).some((s) => s.name === 'Andrômeda (M31)')).toBe(false);
  });
});
