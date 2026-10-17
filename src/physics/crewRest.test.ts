import { describe, expect, it } from 'vitest';
import {
  C,
  ascentTauAt,
  computeFlightState,
  flightSegments,
  flipTauOf,
  segmentState,
  type FlightSegment,
  type MissionProfile,
} from './RelativityEngine';
import { assessMission } from './accelerationPresets';
import { computeCriticalWindows } from './criticalEvents';
import {
  crewStatusAt,
  crewStrainAt,
  crewToleranceFor,
  missionProfileFor,
  plannedCoastEta,
  restCycleFor,
} from './crewRest';
import { DESTINATIONS, DESTINATION_LIST, destinationMissionProfile } from './destinations';
import { cutEngine, engineCommandAt, relightEngine } from './maneuvers';

const DAY = 86_400;
const proxima = DESTINATIONS.proxima;
const tenG = missionProfileFor(proxima, 10, null, 'crewed');
const relErr = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

/** O fim de um segmento como início do próximo. */
const endOf = (seg: FlightSegment, kind: FlightSegment['kind'], duration: number, accel: number, extra: Partial<FlightSegment> = {}): FlightSegment => {
  const e = segmentState(seg, seg.duration);
  return { kind, startTau: seg.startTau + seg.duration, duration, accel, eta0: e.eta, remaining0: e.remainingM, earth0: e.earthTimeS, ...extra };
};

/** Maior carga da tripulação ao longo do voo, em `n` amostras. */
function maxStrain(profile: MissionProfile, accelG: number, n = 3000): number {
  const tol = crewToleranceFor(accelG);
  let max = 0;
  for (let i = 0; i <= n; i++) max = Math.max(max, crewStrainAt(profile, (i / n) * profile.tauTotal, tol));
  return max;
}

describe('ciclo de queima e descanso', () => {
  it('cada queima usa 90 % da tolerância; o descanso dura 3× a queima (ou 5×), no mínimo 1 h', () => {
    const cycle = restCycleFor(3 * DAY)!;
    expect(cycle.burnTau).toBeCloseTo(2.7 * DAY, 6);
    expect(cycle.restTau).toBeCloseTo(8.1 * DAY, 6);
    expect(restCycleFor(3 * DAY, 5)!.restTau).toBeCloseTo(13.5 * DAY, 6);
    expect(restCycleFor(600)).toEqual({ burnTau: 540, restTau: 3600 });
    expect(restCycleFor(600, 5)).toEqual({ burnTau: 540, restTau: 3600 });
    // Um descanso leva a carga de 100 % a zero: a recuperação é a do ciclo.
    expect(crewToleranceFor(10).recoveryS).toBeCloseTo(8.1 * DAY, 6);
    expect(crewToleranceFor(10, 5).recoveryS).toBeCloseTo(13.5 * DAY, 6);
    expect(restCycleFor(Infinity)).toBeNull();
    expect(restCycleFor(0)).toBeNull();
  });

  it('o segmento de ciclos em forma fechada bate com as queimas e os descansos um a um', () => {
    for (const accel of [98.0665, -98.0665]) {
      const [b, r, count] = [2.7 * DAY, 3 * DAY, 9];
      const eta0 = accel > 0 ? 0.4 : 0.4 + (count * accel * -b) / C;
      const block: FlightSegment = {
        kind: 'cycles',
        startTau: 0,
        duration: count * (b + r),
        accel,
        eta0,
        remaining0: 4e16,
        earth0: 0,
        cycle: { burnTau: b, restTau: r, count },
      };
      // A mesma sequência, segmento a segmento.
      const steps: FlightSegment[] = [{ ...block, kind: 'thrust', duration: b }];
      for (let i = 0; i < count; i++) {
        steps.push(endOf(steps.at(-1)!, 'coast', r, 0, { rest: true }));
        if (i < count - 1) steps.push(endOf(steps.at(-1)!, 'thrust', b, accel));
      }
      for (const f of [0.01, 0.13, 0.5, 0.77, 0.999, 1]) {
        const s = f * block.duration;
        const step = [...steps].reverse().find((seg) => seg.startTau <= s)!;
        const ref = segmentState(step, s - step.startTau);
        const st = segmentState(block, s);
        expect(relErr(st.eta, ref.eta)).toBeLessThan(1e-12);
        expect(relErr(st.remainingM, ref.remainingM)).toBeLessThan(1e-12);
        expect(relErr(st.earthTimeS, ref.earthTimeS)).toBeLessThan(1e-12);
        expect(st.rest).toBe(step.kind === 'coast');
      }
    }
  });
});

describe('plano com descansos (10 g até Proxima)', () => {
  const rest = tenG.crewRest!;

  it('queimas de até 2,7 dias e descansos de 8,1 dias: 66 queimas e ~1,96 ano de bordo, contra ~271 dias sem descanso', () => {
    expect(rest.burnTau).toBeCloseTo(2.7 * DAY, 6);
    expect(rest.restTau).toBeCloseTo(8.1 * DAY, 6);
    expect(rest.burns).toBe(66);
    expect(tenG.tauTotal / DAY).toBeCloseTo(715.7, 0);
    expect(destinationMissionProfile(proxima, 10).tauTotal / DAY).toBeCloseTo(270.7, 0);
    for (const seg of flightSegments(tenG)) {
      if (seg.kind === 'thrust') expect(seg.duration).toBeLessThanOrEqual(rest.burnTau * (1 + 1e-9));
      if (seg.kind === 'cycles') expect(seg.cycle!.burnTau).toBeLessThanOrEqual(rest.burnTau * (1 + 1e-9));
      if (seg.kind === 'coast') expect(seg.duration).toBeGreaterThanOrEqual(rest.restTau * (1 - 1e-9));
    }
  });

  it('para exatamente no alvo, sem saltos de distância entre os trechos', () => {
    const end = computeFlightState(tenG, tenG.tauTotal);
    expect(end.phase).toBe('arrived');
    expect(end.restDistanceRemainingM).toBe(0);
    for (const seg of flightSegments(tenG).slice(1)) {
      const before = computeFlightState(tenG, seg.startTau - 1e-3);
      const after = computeFlightState(tenG, seg.startTau);
      const travelled = C * Math.sinh(before.eta) * 1e-3;
      expect(Math.abs(before.restDistanceRemainingM - travelled - after.restDistanceRemainingM)).toBeLessThan(1e-9 * tenG.distanceM);
    }
  });

  it('é simétrico: a frenagem repete a subida ao contrário', () => {
    for (const f of [0.05, 0.2, 0.33, 0.45]) {
      const tau = f * tenG.tauTotal;
      expect(computeFlightState(tenG, tenG.tauTotal - tau).eta).toBeCloseTo(computeFlightState(tenG, tau).eta, 9);
    }
    expect(relErr(computeFlightState(tenG, tenG.tauHalf).earthTimeS, tenG.tHalf)).toBeLessThan(1e-10);
    expect(flipTauOf(tenG)).toBe(tenG.brakeStartTau);
    // O descanso do meio dura pelo menos um descanso; a sobra de distância (o número de descansos muda aos
    // saltos com a rapidez de pico) o alonga um pouco.
    expect(tenG.brakeStartTau - tenG.burnEndTau).toBeGreaterThanOrEqual(rest.restTau);
    expect(tenG.brakeStartTau - tenG.burnEndTau).toBeLessThan(3 * rest.restTau);
  });

  it('a carga nunca passa de 90 % e o estado acompanha queimas e descansos', () => {
    expect(maxStrain(tenG, 10)).toBeLessThanOrEqual(0.9 + 1e-9);
    const tol = crewToleranceFor(10);
    const status = (tau: number) => crewStatusAt(tenG, computeFlightState(tenG, tau), tol, true);
    const burning = status(0.5 * DAY);
    expect(burning.condition).toBe('thrust');
    expect(burning.accelG).toBeCloseTo(10, 9);
    expect(burning.untilChangeS! / DAY).toBeCloseTo(2.2, 9);
    const resting = status(2.7 * DAY + DAY);
    expect(resting.condition).toBe('rest');
    expect(resting.untilChangeS! / DAY).toBeCloseTo(7.1, 9);
    expect(resting.strain).toBeCloseTo(0.9 - 1 / 8.1, 9);
    expect(crewStatusAt(tenG, computeFlightState(tenG, 0), tol, false).condition).toBe('ready');
    expect(status(tenG.tauTotal).condition).toBe('arrived');
  });

  it('janelas críticas: o flip no fim do descanso do meio; CMB simétrica rumo a Andrômeda a 30 g', () => {
    const pre = computeCriticalWindows(tenG).find((w) => w.kind === 'pre-flip')!;
    expect(pre.endTau).toBe(tenG.brakeStartTau);
    const andromeda = missionProfileFor(DESTINATIONS.andromeda, 30, null, 'crewed');
    const cmb = computeCriticalWindows(andromeda).filter((w) => w.kind === 'cmb-visible');
    expect(cmb).toHaveLength(2);
    expect(relErr(cmb[0]!.startTau, andromeda.tauTotal - cmb[1]!.endTau)).toBeLessThan(1e-6);
    expect(computeFlightState(andromeda, cmb[0]!.startTau).gamma).toBeCloseTo(400, 3);
  });

  it('o instante da subida com a mesma rapidez conta os descansos', () => {
    const tau = 10 * (rest.burnTau + rest.restTau) + 0.4 * rest.burnTau;
    const eta = computeFlightState(tenG, tau).eta;
    expect(ascentTauAt(tenG, eta, tenG.tauTotal)).toBeCloseTo(tau, 3);
  });
});

describe('quem não precisa de descansos', () => {
  it('1 g, sonda robótica e a demonstração hipotética seguem o plano analítico', () => {
    for (const [g, crew] of [
      [1, 'crewed'],
      [10, 'robotic'],
      [proxima.defaultAccelG, 'crewed'],
    ] as const) {
      const profile = missionProfileFor(proxima, g, null, crew);
      expect(profile.crewRest).toBeUndefined();
      expect(profile.tauTotal).toBe(destinationMissionProfile(proxima, g).tauTotal);
    }
    const tol = crewToleranceFor(proxima.defaultAccelG);
    const demo = missionProfileFor(proxima, proxima.defaultAccelG, null, 'crewed');
    expect(crewStatusAt(demo, computeFlightState(demo, 100), tol, true).condition).toBe('hypothetical');
  });

  it('com o plano de descansos, o veredito é suportável e a maior queima é a do ciclo', () => {
    for (const g of [1.5, 3, 6, 10, 30]) {
      const profile = missionProfileFor(proxima, g, null, 'crewed');
      const a = assessMission('crewed', g, profile);
      expect(a.viability).toBe('ok');
      expect(a.rests).toBe(true);
      expect(a.burnS).toBe(profile.crewRest!.burnTau);
    }
  });

  it('com descansos de 5× a queima, a viagem fica mais longa e a carga continua no limite planejado', () => {
    const five = missionProfileFor(proxima, 10, null, 'crewed', 5);
    expect(five.crewRest!.restTau).toBeCloseTo(13.5 * DAY, 6);
    expect(five.tauTotal).toBeGreaterThan(tenG.tauTotal);
    expect(five.tauTotal / DAY).toBeCloseTo(928.8, 0);
    const tol = crewToleranceFor(10, 5);
    let max = 0;
    for (let i = 0; i <= 3000; i++) max = Math.max(max, crewStrainAt(five, (i / 3000) * five.tauTotal, tol));
    expect(max).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it('o cruzeiro fica abaixo da rapidez de pico com descansos', () => {
    const flip = missionProfileFor(DESTINATIONS.trappist1, 10, null, 'crewed').etaMax;
    expect(plannedCoastEta(DESTINATIONS.trappist1, 10, 50, 'crewed')).toBeCloseTo(0.999 * flip, 12);
    const cruise = missionProfileFor(DESTINATIONS.trappist1, 10, Math.atanh(0.9), 'crewed');
    expect(cruise.coastEta).toBeCloseTo(Math.atanh(0.9), 12);
    expect(cruise.brakeStartTau - cruise.burnEndTau).toBeGreaterThan(10 * cruise.crewRest!.restTau);
  });
});

describe('motor desligado e religado com descansos', () => {
  it('no descanso o motor não aceita comandos; na queima, desligar leva à frenagem com descansos até o alvo', () => {
    const rest = tenG.crewRest!;
    expect(engineCommandAt(tenG, rest.burnTau + 0.5 * rest.restTau)).toBeNull();
    for (const f of [0.1, 0.3, 0.6, 0.9]) {
      let tau = f * tenG.tauTotal;
      while (engineCommandAt(tenG, tau) !== 'cut') tau += rest.burnTau / 5;
      const cut = cutEngine(tenG, tau, 3 * 3600);
      const end = computeFlightState(cut, cut.tauTotal);
      expect(end.phase).toBe('arrived');
      expect(end.restDistanceRemainingM).toBe(0);
      expect(maxStrain(cut, 10)).toBeLessThanOrEqual(0.9 + 1e-9);
      if (f > 0.5) {
        // Na frenagem, sem distância para frear com α e descansos inteiros: α e descansos um pouco mais curtos.
        const brake = flightSegments(cut).find((seg) => seg.kind === 'cycles' && seg.startTau > tau)!;
        expect(brake.accel).toBe(-tenG.properAccel);
        expect(brake.cycle!.restTau).toBeLessThan(rest.restTau);
        expect(brake.cycle!.restTau).toBeGreaterThan(0.95 * rest.restTau);
      }
    }
  });

  it('religar logo depois de uma queima espera a tripulação se recuperar', () => {
    const trappist = DESTINATIONS.trappist1;
    const plan = missionProfileFor(trappist, 10, Math.atanh(0.9), 'crewed');
    const tau = plan.burnEndTau + 3600;
    expect(engineCommandAt(plan, tau)).toBe('relight');
    const relit = relightEngine(plan, tau);
    const tol = crewToleranceFor(10);
    expect(crewStatusAt(relit, computeFlightState(relit, tau + 60), tol, true).condition).toBe('rest');
    expect(maxStrain(relit, 10)).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(relit.tauTotal).toBeLessThan(plan.tauTotal);
    expect(computeFlightState(relit, relit.tauTotal).phase).toBe('arrived');
  });

  it('todo destino e aceleração humana: chega parado, com a carga no limite planejado', () => {
    for (const destination of DESTINATION_LIST) {
      for (const g of [1.5, 3, 6, 10, 30]) {
        const profile = missionProfileFor(destination, g, null, 'crewed');
        const end = computeFlightState(profile, profile.tauTotal);
        expect(end.phase).toBe('arrived');
        expect(maxStrain(profile, g, 600)).toBeLessThanOrEqual(0.9 + 1e-9);
      }
    }
  });
});
