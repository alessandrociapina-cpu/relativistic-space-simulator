import { describe, expect, it } from 'vitest';
import { BODIES, bodyState } from './bodies';
import { interpolateState } from './ephemeris';
import { COMPANIONS, MISSIONS, MISSION_LIST, type ProbeId } from './missions';
import { planetPosition } from './planets';
import {
  AU_KM,
  analyzeFlyby,
  firstEncounter,
  lightTimeS,
  probePosition,
  probeState,
  probeVelocity,
  relativeState,
  solarEscapeKms,
  speedKms,
  type ProbeTrajectory,
} from './probes';
import { daysToMs, isoToDays } from './time';
import { norm, sub } from './vec3';

const traj = (id: ProbeId) => MISSIONS[id].trajectory;
const flybys = (id: ProbeId) => MISSIONS[id].events.filter((e) => e.kind === 'flyby').map((e) => e.flyby!);
const flyby = (eventId: string) => MISSION_LIST.flatMap((m) => m.events).find((e) => e.id === eventId)!.flyby!;
const event = (eventId: string) => MISSION_LIST.flatMap((m) => m.events).find((e) => e.id === eventId)!;
const isoDay = (days: number) => new Date(daysToMs(days)).toISOString().slice(0, 10);
const sunDistance = (probe: ProbeTrajectory, iso: string) => norm(probePosition(probe, isoToDays(iso))!);
const ALL_TRAJECTORIES = [...MISSION_LIST.map((m) => m.trajectory), ...COMPANIONS.map((c) => c.trajectory)];

describe('tabelas do JPL com interpolação de Kepler', () => {
  it('a interpolação passa exatamente pelas amostras', () => {
    const table = traj('cassini').encounters.find((e) => e.body === 'saturn')!.table;
    for (const i of [0, 10, 500, 2000]) {
      const at = interpolateState(table, table.t[i]!);
      expect(at.position[0]).toBeCloseTo(table.s[6 * i]!, 15);
      expect(at.velocity[2]).toBeCloseTo(table.s[6 * i + 5]!, 15);
    }
  });

  it('nenhuma sonda salta nas bordas das janelas de encontro', () => {
    for (const probe of ALL_TRAJECTORIES) {
      for (const e of probe.encounters) {
        for (const edge of [e.start, e.end]) {
          if (edge - 0.01 < probe.launch || edge + 0.01 > probe.end) continue;
          const dt = 0.01;
          const a = probePosition(probe, edge - dt)!;
          const b = probePosition(probe, edge + dt)!;
          const expected = norm(probeVelocity(probe, edge)) * 2 * dt;
          expect(norm(sub(b, a)), `${probe.id} ${e.body}`).toBeLessThan(expected * 1.5 + 1e-7);
        }
      }
    }
  });

  it('a velocidade é a derivada da posição', () => {
    for (const probe of ALL_TRAJECTORIES) {
      const t = (probe.launch + probe.end) / 2;
      const h = 1e-3;
      const numeric = sub(probePosition(probe, t + h)!, probePosition(probe, t - h)!).map((x) => x / (2 * h));
      expect(norm(sub(numeric as unknown as [number, number, number], probeVelocity(probe, t))) / norm(probeVelocity(probe, t))).toBeLessThan(1e-3);
    }
  });
});

describe('Voyagers', () => {
  it('começam no lançamento, coladas na Terra', () => {
    expect(isoDay(traj('voyager1').launch)).toBe('1977-09-05');
    expect(isoDay(traj('voyager2').launch)).toBe('1977-08-20');
    expect(probePosition(traj('voyager1'), traj('voyager1').launch - 1)).toBeNull();
    for (const probe of [traj('voyager1'), traj('voyager2')]) {
      const atLaunch = probePosition(probe, probe.launch)!;
      expect(norm(sub(atLaunch, planetPosition('earth', probe.launch))) * AU_KM).toBeLessThan(15_000);
    }
  });

  it('marcos de distância: Pálido Ponto Azul a ~40,5 UA e heliopausas a ~121,6 e ~119 UA', () => {
    expect(sunDistance(traj('voyager1'), '1990-02-14')).toBeCloseTo(40.5, 0);
    expect(sunDistance(traj('voyager1'), '2012-08-25')).toBeCloseTo(121.6, 0);
    expect(sunDistance(traj('voyager2'), '2018-11-05')).toBeCloseTo(119, 0);
  });

  it('sobrevoos: datas e distâncias históricas', () => {
    expect(isoDay(flyby('voyager1-jupiter').closestT)).toBe('1979-03-05');
    expect(flyby('voyager1-jupiter').closestKm).toBeCloseTo(348_400, -3);
    expect(flyby('voyager1-saturn').altitudeKm).toBeCloseTo(124_000, -3);
    expect(flyby('voyager1-titan').closestKm).toBeCloseTo(6600, -2);
    expect(isoDay(flyby('voyager2-uranus').closestT)).toBe('1986-01-24');
    expect(flyby('voyager2-uranus').altitudeKm).toBeCloseTo(81_500, -3);
    expect(flyby('voyager2-neptune').closestKm).toBeCloseTo(29_200, -3);
    expect(flyby('voyager2-triton').closestKm).toBeCloseTo(40_000, -4);
  });

  it('Júpiter acelerou as duas em ~10 km/s; Netuno freou a Voyager 2', () => {
    for (const f of [flyby('voyager1-jupiter'), flyby('voyager2-jupiter')]) {
      expect(f.speedAfterKms - f.speedBeforeKms).toBeGreaterThan(9);
      expect(f.speedAfterKms - f.speedBeforeKms).toBeLessThan(11.5);
    }
    expect(flyby('voyager2-neptune').speedAfterKms).toBeLessThan(flyby('voyager2-neptune').speedBeforeKms);
  });
});

describe('sobrevoos de planetas: a deflexão medida bate com a fórmula da hipérbole', () => {
  it('sin(δ/2) = 1/(1 + r_p v∞²/μ), em todas as sondas', () => {
    for (const m of MISSION_LIST) {
      for (const f of flybys(m.id)) {
        if (f.deflectionDeg === null || BODIES[f.body].gm === 0) continue;
        // Rente ao planeta, o achatamento (J2) entra na conta e a fórmula da esfera erra um pouco mais.
        const close = f.closestKm < 2 * BODIES[f.body].radiusKm;
        expect(Math.abs(f.deflectionDeg - f.predictedDeflectionDeg), `${m.id} ${f.body}`).toBeLessThan(close ? 3 : 1);
      }
    }
  });
});

describe('Pioneers, Galileo, Cassini, New Horizons e Rosetta: números históricos nos dados', () => {
  it('Pioneers: Júpiter a ~132 mil e ~42 mil km das nuvens; Saturno a ~21 mil km', () => {
    expect(isoDay(flyby('pioneer10-jupiter').closestT)).toBe('1973-12-04');
    expect(flyby('pioneer10-jupiter').altitudeKm).toBeCloseTo(132_000, -4);
    expect(flyby('pioneer11-jupiter').altitudeKm).toBeCloseTo(42_000, -3);
    expect(isoDay(flyby('pioneer11-saturn').closestT)).toBe('1979-09-01');
    expect(flyby('pioneer11-saturn').altitudeKm).toBeCloseTo(21_000, -3);
  });

  it('Galileo: VEEGA, Gaspra, Ida e as luas', () => {
    expect(isoDay(flyby('galileo-venus').closestT)).toBe('1990-02-10');
    expect(flyby('galileo-earth').altitudeKm).toBeCloseTo(960, -2);
    expect(flyby('galileo-earth-2').altitudeKm).toBeCloseTo(300, -2);
    expect(flyby('galileo-gaspra').closestKm).toBeGreaterThan(1500);
    expect(flyby('galileo-gaspra').closestKm).toBeLessThan(1700);
    expect(flyby('galileo-io').altitudeKm).toBeCloseTo(900, -2);
    expect(flyby('galileo-ganymede').altitudeKm).toBeCloseTo(835, -2);
    expect(flyby('galileo-europa').altitudeKm).toBeCloseTo(196, -2);
  });

  it('Galileo: a sonda atmosférica entra em Júpiter a ~60 km/s (~47 km/s em relação ao ar, que gira junto) e a orbitadora cai em 21/09/2003', () => {
    const probe = COMPANIONS.find((c) => c.id === 'galileo-probe')!.trajectory;
    const rel = relativeState(probe, 'jupiter', probe.end)!;
    expect(speedKms(rel.velocity)).toBeGreaterThan(59);
    expect(speedKms(rel.velocity)).toBeLessThan(61);
    expect(isoDay(probe.end)).toBe('1995-12-07');
    expect(isoDay(traj('galileo').end)).toBe('2003-09-21');
    const final = relativeState(traj('galileo'), 'jupiter', traj('galileo').end)!;
    expect(norm(final.position) * AU_KM).toBeCloseTo(BODIES.jupiter.radiusKm, -1);
  });

  it('Cassini: Vênus, Terra, captura em Saturno, Titã e o fim', () => {
    expect(flyby('cassini-venus').altitudeKm).toBeCloseTo(284, -1);
    expect(flyby('cassini-venus-2').altitudeKm).toBeCloseTo(600, -2);
    expect(flyby('cassini-earth').altitudeKm).toBeCloseTo(1171, -2);
    const capture = event('cassini-capture').capture!;
    expect(isoDay(capture.periapsisT)).toBe('2004-07-01');
    expect(capture.periodDays).toBeCloseTo(116, -1);
    expect(flyby('cassini-titan').altitudeKm).toBeCloseTo(1174, -2);
    expect(isoDay(traj('cassini').end)).toBe('2017-09-15');
  });

  it('Huygens: a descida prevista chega ao solo de Titã', () => {
    const huygens = COMPANIONS.find((c) => c.id === 'huygens')!.trajectory;
    const rel = relativeState(huygens, 'titan', isoToDays('2005-01-14T11:38Z'))!;
    expect(norm(rel.position) * AU_KM - BODIES.titan.radiusKm).toBeLessThan(2);
  });

  it('New Horizons: Plutão a ~12 500 km e Arrokoth a ~3 500 km do centro', () => {
    expect(isoDay(flyby('newhorizons-pluto').closestT)).toBe('2015-07-14');
    expect(flyby('newhorizons-pluto').altitudeKm).toBeCloseTo(12_500, -3);
    expect(flyby('newhorizons-arrokoth').closestKm).toBeCloseTo(3500, -2);
    expect(flyby('newhorizons-jupiter').closestKm / 1e6).toBeCloseTo(2.3, 1);
  });

  it('Rosetta: Marte a ~250 km, Lutécia a ~3 200 km e o pouso final no cometa', () => {
    expect(flyby('rosetta-mars').altitudeKm).toBeCloseTo(250, -1);
    expect(flyby('rosetta-lutetia').closestKm).toBeCloseTo(3200, -2);
    const end = relativeState(traj('rosetta'), 'comet67p', traj('rosetta').end)!;
    expect(norm(end.position) * AU_KM).toBeLessThan(5);
    expect(firstEncounter(traj('rosetta'), 'comet67p')).not.toBeNull();
  });
});

describe('Juno e Parker', () => {
  it('Juno: captura numa órbita de 53 dias, encurtada por Ganimedes, Europa e Io até ~33 dias', () => {
    const capture = event('juno-capture').capture!;
    expect(capture.periodDays).toBeCloseTo(53.5, 0);
    expect(capture.deltaVKms).toBeGreaterThan(0.49);
    expect(capture.deltaVKms).toBeLessThan(0.56);
    expect(flyby('juno-ganymede').periodBeforeDays).toBeCloseTo(53, 0);
    expect(flyby('juno-ganymede').periodAfterDays).toBeCloseTo(43, 0);
    expect(flyby('juno-europa').periodAfterDays).toBeCloseTo(38, 0);
    expect(flyby('juno-io-2').periodAfterDays).toBeCloseTo(33, 0);
    expect(flyby('juno-ganymede').altitudeKm).toBeCloseTo(1038, -2);
  });

  it('Parker: Vênus freia a sonda sete vezes e o periélio de 24/12/2024 chega a 9,86 raios solares e ~191 km/s', () => {
    const venus = flybys('parker');
    expect(venus).toHaveLength(7);
    for (const f of venus) expect(f.speedAfterKms).toBeLessThan(f.speedBeforeKms);
    const p = event('parker-perihelion').perihelion!;
    expect(isoDay(p.t)).toBe('2024-12-24');
    expect(p.distanceKm / 695_700).toBeCloseTo(9.86, 1);
    expect(p.speedKms).toBeGreaterThan(189);
    expect(p.speedKms).toBeLessThan(193);
    expect(p.periodDays).toBeCloseTo(88, -1);
  });
});

describe('Veneras reconstruídas por Lambert', () => {
  it('partem da Terra, entram em Vênus a ~11 km/s e terminam no solo', () => {
    for (const id of ['venera7', 'venera13'] as const) {
      const rec = MISSIONS[id].reconstruction!;
      const c3 = rec.departureVInfKms ** 2;
      expect(c3).toBeGreaterThan(5);
      expect(c3).toBeLessThan(20);
      expect(rec.entrySpeedKms).toBeGreaterThan(10.8);
      expect(rec.entrySpeedKms).toBeLessThan(11.8);
      const start = relativeState(rec.trajectory, 'earth', rec.departureT)!;
      expect(norm(start.position) * AU_KM - BODIES.earth.radiusKm).toBeCloseTo(200, 0);
      const entry = relativeState(rec.trajectory, 'venus', rec.entryT)!;
      expect(norm(entry.position) * AU_KM - BODIES.venus.radiusKm).toBeCloseTo(125, 0);
      const ground = relativeState(rec.trajectory, 'venus', rec.landingT + 0.001)!;
      expect(norm(ground.position) * AU_KM).toBeCloseTo(BODIES.venus.radiusKm, 0);
      expect(probeState(rec.trajectory, rec.endT + 0.01)).toBeNull();
    }
    expect(MISSIONS.venera7.reconstruction!.entrySpeedKms).toBeCloseTo(11.5, 1);
  });

  it('o arco heliocêntrico liga a Terra a Vênus nas datas da missão', () => {
    const rec = MISSIONS.venera7.reconstruction!;
    const mid = (rec.departureT + rec.entryT) / 2;
    const r = norm(probePosition(rec.trajectory, mid)!);
    expect(r).toBeGreaterThan(0.72);
    expect(r).toBeLessThan(1);
    expect(rec.entryT - rec.departureT).toBeCloseTo(120, 0);
    expect(bodyState('venus', rec.landingT)).not.toBeNull();
  });
});

describe('física de apoio', () => {
  it('a Voyager 1 passa da velocidade de escape do Sol graças a Júpiter', () => {
    const at = (iso: string) => {
      const t = isoToDays(iso);
      return { v: speedKms(probeVelocity(traj('voyager1'), t)), escape: solarEscapeKms(norm(probePosition(traj('voyager1'), t)!)) };
    };
    expect(at('1978-06-01').v).toBeLessThan(at('1978-06-01').escape);
    expect(at('1980-01-01').v).toBeGreaterThan(at('1980-01-01').escape);
  });

  it('a luz leva ~499 s para percorrer 1 UA', () => {
    expect(lightTimeS(1)).toBeCloseTo(499, 0);
  });

  it('sobrevoos de luas e de asteroides usam a janela relativa ao próprio corpo', () => {
    const io = traj('juno').encounters.find((e) => e.body === 'io')!;
    expect(analyzeFlyby(traj('juno'), io).periodAfterDays).not.toBeNull();
    const gaspra = traj('galileo').encounters.find((e) => e.body === 'gaspra')!;
    expect(analyzeFlyby(traj('galileo'), gaspra).predictedDeflectionDeg).toBe(0);
  });
});
