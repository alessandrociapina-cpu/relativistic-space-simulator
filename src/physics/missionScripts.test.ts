import { describe, expect, it } from 'vitest';
import { G0, JULIAN_YEAR_S, LIGHT_YEAR_M, computeFlightState, flightSegments } from './RelativityEngine';
import { DESTINATIONS } from './destinations';
import { engineCommandAt } from './maneuvers';
import { MISSION_SCRIPTS, phaseIndexAt, scriptBeats, scriptProfile } from './missionScripts';
import { ORIGINS } from './origins';
import { INTERGALACTIC_DENSITY_CM3, gasDensityOnRoute } from '../sky/interstellarGas';

const DAY = 86_400;
const script = MISSION_SCRIPTS['tau-zero'];
const profile = scriptProfile(script, DESTINATIONS.intergalacticVoid.distanceLy * LIGHT_YEAR_M);
const plan = profile.script!;
const phase = (id: string) => plan.phases.find((p) => p.id === id)!;

describe('roteiro de Tau Zero (§4.2.11)', () => {
  it('as fases se encadeiam e a viagem para no vazio, a 40 milhões de anos-luz', () => {
    expect(plan.phases.map((p) => p.id)).toEqual(['partida', 'cruzeiro', 'decisao', 'fuga', 'reparo', 'frenagem']);
    plan.phases.forEach((p, i) => {
      expect(p.startTau).toBe(i === 0 ? 0 : plan.phases[i - 1]!.endTau);
      expect(p.endTau).toBeGreaterThan(p.startTau);
    });
    expect(flightSegments(profile)).toHaveLength(plan.phases.length);
    const end = computeFlightState(profile, profile.tauTotal);
    expect(end.phase).toBe('arrived');
    expect(end.eta).toBe(0);
    expect(end.restDistanceRemainingM).toBe(0);
    expect(phase('frenagem').x1 / LIGHT_YEAR_M).toBeCloseTo(4e7, 0);
  });

  it('os números do roteiro: < 5 anos de bordo, 40 milhões na Terra, γ ~ 1,5 × 10⁸', () => {
    expect(profile.tauTotal / JULIAN_YEAR_S).toBeCloseTo(4.89, 2);
    expect(profile.tTotal / JULIAN_YEAR_S / 4e7).toBeCloseTo(1, 6);
    expect(profile.gammaMax).toBeGreaterThan(1.4e8);
    expect(profile.gammaMax).toBeLessThan(1.5e8);
    // Partida: 0,5 g até 0,05c em ~35 dias.
    expect((phase('partida').endTau - phase('partida').startTau) / DAY).toBeCloseTo(35.4, 1);
    expect(Math.tanh(phase('partida').eta1)).toBeCloseTo(0.05, 12);
    // A nebulosa a 10 anos-luz, depois de ~1,4 ano de bordo e ~10 anos na Terra, com γ ≈ 32.
    expect(phase('cruzeiro').x1 / LIGHT_YEAR_M).toBeCloseTo(10, 9);
    expect(Math.cosh(phase('cruzeiro').eta1)).toBeCloseTo(32, 0);
    expect(phase('cruzeiro').earth1 / JULIAN_YEAR_S).toBeCloseTo(10.4, 1);
    // O reparo: 30 dias de bordo valem ~12 milhões de anos e de anos-luz.
    const repair = phase('reparo');
    expect((repair.endTau - repair.startTau) / DAY).toBeCloseTo(30, 9);
    expect((repair.earth1 - repair.earth0) / JULIAN_YEAR_S / 1e6).toBeCloseTo(11.9, 1);
    expect(repair.eta0).toBe(repair.eta1);
    // A frenagem desfaz o pico: a mesma rapidez a 10 g, ~1,9 ano de bordo.
    expect((phase('frenagem').endTau - phase('frenagem').startTau) / JULIAN_YEAR_S).toBeCloseTo((phase('fuga').eta1 * 299_792_458) / (10 * G0) / JULIAN_YEAR_S, 9);
    // A luz da Terra que chega na parada saiu de lá seis meses depois da nave.
    expect(computeFlightState(profile, profile.tauTotal).earthRadioTimeS / JULIAN_YEAR_S).toBeCloseTo(0.495, 2);
  });

  it('as fases de motor: acelera, desliga para o reparo e freia; o piloto não comanda o motor', () => {
    const mid = (id: string) => computeFlightState(profile, (phase(id).startTau + phase(id).endTau) / 2);
    expect(mid('fuga')).toMatchObject({ phase: 'accelerating', engine: 'thrust' });
    expect(mid('fuga').thrustAccel / G0).toBeCloseTo(10, 9);
    expect(mid('reparo')).toMatchObject({ phase: 'coasting', engine: 'off', thrustAccel: 0 });
    expect(mid('frenagem')).toMatchObject({ phase: 'decelerating', engine: 'thrust' });
    expect(profile.burnEndTau).toBe(phase('fuga').endTau);
    expect(profile.brakeStartTau).toBe(phase('frenagem').startTau);
    for (const id of ['fuga', 'reparo']) expect(engineCommandAt(profile, mid(id).tau)).toBeNull();
  });

  it('marcos em ordem, dentro da fuga, e os passos da história com a fase de cada instante', () => {
    for (const m of plan.milestones) {
      const s = computeFlightState(profile, m.tau);
      expect(s.positionM / LIGHT_YEAR_M / script.milestones.find((x) => x.id === m.id)!.atLy).toBeCloseTo(1, 6);
      expect(phaseIndexAt(plan, m.tau)).toBe(3);
    }
    const beats = scriptBeats(plan, profile.tauTotal);
    expect(beats.map((b) => b.id)).toEqual([
      'partida',
      'cruzeiro',
      'decisao',
      'fuga',
      'disco',
      'galaxia',
      'andromeda',
      'grupo-local',
      'reparo',
      'frenagem',
      'arrival',
    ]);
    expect(phaseIndexAt(plan, 0)).toBe(0);
    expect(phaseIndexAt(plan, profile.tauTotal)).toBe(plan.phases.length - 1);
  });

  it('o gás pelo caminho: ~1 átomo/cm³ na partida, o halo e o vazio entre as galáxias', () => {
    const gas = (ly: number) => gasDensityOnRoute(ORIGINS.sol, DESTINATIONS.intergalacticVoid, ly * LIGHT_YEAR_M);
    expect(gas(0)).toBeCloseTo(1, 1);
    expect(gas(3400)).toBeLessThan(0.03);
    expect(gas(100_000)).toBeLessThan(1e-4);
    expect(gas(4e7) / INTERGALACTIC_DENSITY_CM3).toBeCloseTo(1, 1);
    // Rumo ao centro galáctico, pelo plano, o gás fica mais denso.
    expect(gasDensityOnRoute(ORIGINS.sol, DESTINATIONS.sgrA, 26_000 * LIGHT_YEAR_M)).toBeGreaterThan(3);
  });
});
