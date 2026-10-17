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
    const ramp: FlightSegment = { kind: 'ramp', startTau: 0, duration: 1e5, accel: 9.8, eta0: 0.5, remaining0: 1e17, earth0: 0, radio0: 0 };
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
  it('na aceleração: rampa até 0, inércia com η constante e frenagem automática que para no alvo', () => {
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

    // O piloto automático religa o motor quando a distância que falta é a de frear com α: o flip.
    expect(cut.maneuvers!.end).toBe('arrival');
    const flip = flipTauOf(cut)!;
    expect(flip).toBeGreaterThan(400);
    const atFlip = computeFlightState(cut, flip);
    const coshm1 = 2 * Math.sinh(atFlip.eta / 2) ** 2;
    expect(relErr(atFlip.restDistanceRemainingM, (C * C * coshm1) / demo.properAccel)).toBeLessThan(1e-9);
    expect(computeFlightState(cut, flip - 1).phase).toBe('coasting');
    const braking = computeFlightState(cut, flip + 1);
    expect(braking.phase).toBe('decelerating');
    expect(braking.engine).toBe('thrust');
    expect(relErr(braking.thrustAccel, demo.properAccel)).toBeLessThan(1e-12);
    // A frenagem desfaz a subida: dura cη/α, e a posição é contínua no flip (em ±1 ms a nave anda 2 ms a c·sinh η).
    expect(cut.tauTotal - flip).toBeCloseTo((C / demo.properAccel) * coast1.eta, 6);
    const before = computeFlightState(cut, flip - 1e-3);
    const after = computeFlightState(cut, flip + 1e-3);
    const travelled = 2e-3 * C * Math.sinh(coast1.eta);
    expect(relErr(before.restDistanceRemainingM - after.restDistanceRemainingM, travelled)).toBeLessThan(1e-4);
    const end = computeFlightState(cut, cut.tauTotal);
    expect(end.phase).toBe('arrived');
    expect(end.eta).toBe(0);
    expect(end.restDistanceRemainingM).toBe(0);
    // O flip entra nas janelas críticas (Auto-Step Down, contagem "FRENAGEM EM").
    expect(computeCriticalWindows(cut).some((w) => w.kind === 'pre-flip' && w.endTau === flip)).toBe(true);
  });

  it('na frenagem: sem distância para frear com α, o piloto automático freia logo depois da rampa com mais força', () => {
    const cut = cutEngine(demo, 0.75 * demo.tauTotal, 3);
    expect(computeFlightState(cut, 0.75 * demo.tauTotal + 1.5).engine).toBe('ramp');
    const braking = computeFlightState(cut, 0.75 * demo.tauTotal + 3.5);
    expect(braking.phase).toBe('decelerating');
    expect(braking.engine).toBe('thrust');
    expect(braking.thrustAccel).toBeGreaterThan(demo.properAccel);
    expect(cut.maneuvers!.end).toBe('arrival');
    const end = computeFlightState(cut, cut.tauTotal);
    expect(end.phase).toBe('arrived');
    expect(end.restDistanceRemainingM).toBe(0);
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

  it('só há comando válido em voo: desligar no empuxo (também na frenagem automática), religar na inércia', () => {
    expect(engineCommandAt(demo, 0)).toBeNull();
    expect(engineCommandAt(demo, 100)).toBe('cut');
    const cut = cutEngine(demo, 100, 3);
    expect(engineCommandAt(cut, 101)).toBeNull();
    expect(engineCommandAt(cut, 200)).toBe('relight');
    expect(engineCommandAt(cut, flipTauOf(cut)! + 1)).toBe('cut');
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

  it('religar antes da frenagem automática chega mais cedo', () => {
    const cut = cutEngine(oneG, 0.2 * oneG.tauTotal, 0.01 * oneG.tauTotal);
    const relit = relightEngine(cut, 0.3 * oneG.tauTotal);
    expect(relit.tauTotal).toBeLessThan(cut.tauTotal);
    expect(flipTauOf(relit)!).toBeLessThan(flipTauOf(cut)!);
  });

  it('desligar de novo depois de religar volta à inércia', () => {
    const cut = cutEngine(oneG, 0.2 * oneG.tauTotal, 0.01 * oneG.tauTotal);
    const relit = relightEngine(cut, 0.3 * oneG.tauTotal);
    const again = cutEngine(relit, 0.35 * oneG.tauTotal, 0.01 * oneG.tauTotal);
    expect(again.maneuvers!.firstTau).toBe(0.2 * oneG.tauTotal);
    expect(computeFlightState(again, 0.5 * oneG.tauTotal).engine).toBe('off');
  });
});
