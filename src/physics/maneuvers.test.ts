import { describe, expect, it } from 'vitest';
import { C, G0, computeFlightState, flipTauOf, segmentState, type FlightSegment } from './RelativityEngine';
import { computeCriticalWindows } from './criticalEvents';
import { DESTINATIONS, destinationMissionProfile } from './destinations';
import { cutEngine, engineCommandAt, planSegments, relightEngine } from './maneuvers';

const demo = destinationMissionProfile(DESTINATIONS.proxima);
const oneG = destinationMissionProfile(DESTINATIONS.proxima, 1);
const relErr = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

describe('segmentos do plano', () => {
  it('reproduzem o plano analítico em qualquer instante', () => {
    const segments = planSegments(oneG);
    for (const f of [0.1, 0.4, 0.5, 0.7, 0.99]) {
      const tau = f * oneG.tauTotal;
      const seg = [...segments].reverse().find((s) => s.startTau <= tau)!;
      const st = segmentState(seg, tau - seg.startTau);
      const ref = computeFlightState(oneG, tau);
      expect(relErr(st.eta, ref.eta)).toBeLessThan(1e-12);
      expect(relErr(st.remainingM, ref.restDistanceRemainingM)).toBeLessThan(1e-9);
      expect(relErr(st.earthTimeS, ref.earthTimeS)).toBeLessThan(1e-12);
    }
  });

  it('rampa: η sobe a₀d/2c e a integral numérica bate com Simpson fino', () => {
    const ramp: FlightSegment = { kind: 'ramp', startTau: 0, duration: 1e5, accel: 9.8, eta0: 0.5, remaining0: 1e17, earth0: 0 };
    const end = segmentState(ramp, ramp.duration);
    expect(end.eta).toBeCloseTo(0.5 + (9.8 * 1e5) / (2 * C), 14);
    expect(end.accel).toBe(0);
    // Simpson com 20 000 passos.
    const n = 20_000;
    const h = ramp.duration / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const u = i * h;
      const eta = 0.5 + (9.8 / C) * (u - (u * u) / (2 * ramp.duration));
      sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * Math.sinh(eta);
    }
    const travelled = (C * h * sum) / 3;
    expect(relErr(1e17 - end.remainingM, travelled)).toBeLessThan(1e-10);
  });
});

describe('desligar o motor', () => {
  it('na aceleração: rampa até 0, inércia com η constante e passagem pelo alvo sem frear', () => {
    const cut = cutEngine(demo, 100, 3);
    // Antes do comando, o plano; no comando, contínuo.
    expect(computeFlightState(cut, 50)).toEqual(computeFlightState(demo, 50));
    expect(relErr(computeFlightState(cut, 100).eta, computeFlightState(demo, 100).eta)).toBeLessThan(1e-12);
    const mid = computeFlightState(cut, 101.5);
    expect(mid.engine).toBe('ramp');
    expect(mid.thrustAccel / G0).toBeCloseTo(demo.properAccel / G0 / 2, -2);
    const coast1 = computeFlightState(cut, 200);
    const coast2 = computeFlightState(cut, 400);
    expect(coast1.engine).toBe('off');
    expect(coast1.thrustAccel).toBe(0);
    expect(coast1.phase).toBe('coasting');
    expect(coast2.eta).toBe(coast1.eta);
    expect(coast2.restDistanceRemainingM).toBeLessThan(coast1.restDistanceRemainingM);
    expect(cut.maneuvers!.end).toBe('flyby');
    const end = computeFlightState(cut, cut.tauTotal);
    expect(end.phase).toBe('flyby');
    expect(end.restDistanceRemainingM).toBeLessThan(1e-6 * demo.distanceM);
    expect(end.eta).toBeGreaterThan(0);
    // Sem frenagem não há flip nem chegada.
    expect(flipTauOf(cut)).toBeNull();
    expect(computeCriticalWindows(cut).some((w) => w.kind === 'pre-flip')).toBe(false);
  });

  it('o tempo da Terra e a distância percorrida só avançam', () => {
    const cut = cutEngine(oneG, 0.3 * oneG.tauTotal, 0.01 * oneG.tauTotal);
    let prev = computeFlightState(cut, 0);
    for (let i = 1; i <= 400; i++) {
      const s = computeFlightState(cut, (cut.tauTotal * i) / 400);
      expect(s.earthTimeS).toBeGreaterThanOrEqual(prev.earthTimeS);
      expect(s.positionM).toBeGreaterThanOrEqual(prev.positionM - 1e-3);
      prev = s;
    }
  });

  it('na frenagem, perto do fim: a nave para durante a rampa ou passa pelo alvo, nunca volta', () => {
    const cut = cutEngine(oneG, oneG.tauTotal - 0.002 * oneG.tauTotal, 0.04 * oneG.tauTotal);
    const end = computeFlightState(cut, cut.tauTotal);
    expect(['flyby', 'drift']).toContain(cut.maneuvers!.end);
    expect(end.restDistanceRemainingM).toBeGreaterThanOrEqual(0);
    expect(end.eta).toBeGreaterThanOrEqual(0);
  });

  it('só há comando válido em voo: desligar no empuxo, religar na inércia', () => {
    expect(engineCommandAt(demo, 0)).toBeNull();
    expect(engineCommandAt(demo, 100)).toBe('cut');
    const cut = cutEngine(demo, 100, 3);
    expect(engineCommandAt(cut, 101)).toBeNull();
    expect(engineCommandAt(cut, 200)).toBe('relight');
    expect(engineCommandAt(cut, cut.tauTotal)).toBeNull();
  });
});

describe('religar o motor: o piloto automático para no alvo', () => {
  it('com distância de sobra: acelera, faz o flip e para exatamente no alvo', () => {
    const cut = cutEngine(oneG, 0.2 * oneG.tauTotal, 0.01 * oneG.tauTotal);
    const tau = 0.3 * oneG.tauTotal;
    const relit = relightEngine(cut, tau);
    expect(relit.maneuvers!.end).toBe('arrival');
    const flip = flipTauOf(relit)!;
    expect(flip).toBeGreaterThan(tau);
    expect(computeFlightState(relit, (tau + flip) / 2).phase).toBe('accelerating');
    expect(computeFlightState(relit, (flip + relit.tauTotal) / 2).phase).toBe('decelerating');
    const end = computeFlightState(relit, relit.tauTotal);
    expect(end.phase).toBe('arrived');
    expect(end.eta).toBe(0);
    expect(end.restDistanceRemainingM).toBe(0);
    // Logo antes do fim, a distância que falta é a da frenagem exata, sem resíduo.
    const near = computeFlightState(relit, relit.tauTotal - 10);
    const coshm1 = 2 * Math.sinh(near.eta / 2) ** 2;
    expect(relErr(near.restDistanceRemainingM, (C * C * coshm1) / oneG.properAccel)).toBeLessThan(1e-9);
    // A posição é contínua no flip.
    const before = computeFlightState(relit, flip - 1e-3);
    const after = computeFlightState(relit, flip + 1e-3);
    expect(relErr(after.restDistanceRemainingM, before.restDistanceRemainingM)).toBeLessThan(1e-9);
    // O flip entra nas janelas críticas e o voo leva mais que o plano (houve inércia).
    expect(computeCriticalWindows(relit).some((w) => w.kind === 'pre-flip' && w.endTau === flip)).toBe(true);
    expect(relit.tauTotal).toBeGreaterThan(oneG.tauTotal);
  });

  it('sem distância para frear com α: frenagem de emergência, mais forte que o plano', () => {
    const cut = cutEngine(demo, 0.45 * demo.tauTotal, 3);
    // Bem perto do alvo, a frenagem a α já não cabe.
    const tau = cut.tauTotal - 0.5;
    const relit = relightEngine(cut, tau);
    const braking = computeFlightState(relit, tau + 1e-4);
    expect(braking.phase).toBe('decelerating');
    expect(braking.thrustAccel).toBeGreaterThan(demo.properAccel);
    expect(flipTauOf(relit)).toBeNull();
    const end = computeFlightState(relit, relit.tauTotal);
    expect(end.phase).toBe('arrived');
    expect(end.restDistanceRemainingM).toBe(0);
  });

  it('desligar de novo depois de religar volta à inércia', () => {
    const cut = cutEngine(oneG, 0.2 * oneG.tauTotal, 0.01 * oneG.tauTotal);
    const relit = relightEngine(cut, 0.3 * oneG.tauTotal);
    const again = cutEngine(relit, 0.35 * oneG.tauTotal, 0.01 * oneG.tauTotal);
    expect(again.maneuvers!.firstTau).toBe(0.2 * oneG.tauTotal);
    expect(computeFlightState(again, 0.5 * oneG.tauTotal).engine).toBe('off');
  });
});
