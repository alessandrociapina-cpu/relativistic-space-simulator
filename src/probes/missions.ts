/**
 * Catálogo das sondas e seus eventos. As datas de lançamento e de maior
 * aproximação saem dos dados do JPL; os marcos da heliosfera e do Pálido Ponto
 * Azul têm datas históricas fixas.
 */
import v1Data from './data/voyager1.json';
import v2Data from './data/voyager2.json';
import { planetPosition, type PlanetId } from './planets';
import {
  C_KMS,
  AU_KM,
  analyzeFlyby,
  loadTrajectory,
  probePosition,
  type FlybyAnalysis,
  type ProbeData,
  type ProbeTrajectory,
} from './probes';
import { DAY_MS, isoToDays } from './time';
import { norm, sub } from './vec3';

export type ProbeId = 'voyager1' | 'voyager2';

export type MissionEventKind =
  | 'launch'
  | 'flyby'
  | 'pale-blue-dot'
  | 'farthest'
  | 'termination-shock'
  | 'heliopause'
  | 'light-day';

export interface MissionEvent {
  readonly id: string;
  readonly probeId: ProbeId;
  readonly kind: MissionEventKind;
  /** Instante (dias desde J2000). */
  readonly t: number;
  readonly title: string;
  /** Planeta do sobrevoo. */
  readonly body?: PlanetId;
  readonly flyby?: FlybyAnalysis;
}

export interface ProbeMission {
  readonly id: ProbeId;
  readonly name: string;
  readonly color: string;
  readonly trajectory: ProbeTrajectory;
  readonly events: readonly MissionEvent[];
}

/** Um dia-luz em UA: c × 86 400 s. */
export const LIGHT_DAY_AU = (C_KMS * (DAY_MS / 1000)) / AU_KM;

/** Primeiro instante, depois de `from`, em que a sonda fica a `au` da Terra. */
export function firstEarthDistanceCrossing(probe: ProbeTrajectory, au: number, from: number, to: number): number | null {
  const excess = (t: number) => norm(sub(probePosition(probe, t)!, planetPosition('earth', t))) - au;
  const step = 15;
  for (let t = from; t + step <= to; t += step) {
    if (excess(t) < 0 && excess(t + step) >= 0) {
      let lo = t;
      let hi = t + step;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if (excess(mid) < 0) lo = mid;
        else hi = mid;
      }
      return hi;
    }
  }
  return null;
}

const FLYBY_TITLE: Partial<Record<PlanetId, string>> = {
  jupiter: 'Sobrevoo de Júpiter',
  saturn: 'Sobrevoo de Saturno',
  uranus: 'Sobrevoo de Urano',
  neptune: 'Sobrevoo de Netuno',
};

function buildMission(
  id: ProbeId,
  trajectory: ProbeTrajectory,
  color: string,
  milestones: Omit<MissionEvent, 'probeId'>[],
): ProbeMission {
  const events: MissionEvent[] = [
    { id: `${id}-launch`, probeId: id, kind: 'launch', t: trajectory.launch, title: `Lançamento da ${trajectory.name}` },
    ...trajectory.encounters
      .filter((e) => !e.departure)
      .map((e): MissionEvent => {
        const flyby = analyzeFlyby(e);
        return {
          id: `${id}-${e.body}`,
          probeId: id,
          kind: 'flyby',
          t: flyby.closestT,
          title: FLYBY_TITLE[e.body] ?? `Sobrevoo de ${e.body}`,
          body: e.body,
          flyby,
        };
      }),
    ...milestones.map((m) => ({ ...m, probeId: id })),
  ];
  return { id, name: trajectory.name, color, trajectory, events: events.sort((a, b) => a.t - b.t) };
}

const voyager1 = (() => {
  const trajectory = loadTrajectory(v1Data as ProbeData);
  const lightDay = firstEarthDistanceCrossing(trajectory, LIGHT_DAY_AU, isoToDays('2020-01-01'), isoToDays('2035-01-01'));
  return buildMission('voyager1', trajectory, '#f59e0b', [
    { id: 'voyager1-pale-blue-dot', kind: 'pale-blue-dot', t: isoToDays('1990-02-14'), title: 'O Pálido Ponto Azul' },
    {
      id: 'voyager1-farthest',
      kind: 'farthest',
      t: isoToDays('1998-02-17'),
      title: 'O objeto humano mais distante',
    },
    { id: 'voyager1-termination-shock', kind: 'termination-shock', t: isoToDays('2004-12-16'), title: 'Choque de terminação' },
    { id: 'voyager1-heliopause', kind: 'heliopause', t: isoToDays('2012-08-25'), title: 'Espaço interestelar' },
    ...(lightDay === null ? [] : [{ id: 'voyager1-light-day', kind: 'light-day' as const, t: lightDay, title: 'Um dia-luz da Terra' }]),
  ]);
})();

const voyager2 = buildMission('voyager2', loadTrajectory(v2Data as ProbeData), '#22d3ee', [
  { id: 'voyager2-termination-shock', kind: 'termination-shock', t: isoToDays('2007-08-30'), title: 'Choque de terminação' },
  { id: 'voyager2-heliopause', kind: 'heliopause', t: isoToDays('2018-11-05'), title: 'Espaço interestelar' },
]);

export const MISSIONS: Readonly<Record<ProbeId, ProbeMission>> = { voyager1, voyager2 };
export const MISSION_LIST: readonly ProbeMission[] = [voyager2, voyager1];

/** Todos os eventos, em ordem cronológica. */
export const ALL_EVENTS: readonly MissionEvent[] = MISSION_LIST.flatMap((m) => m.events).sort((a, b) => a.t - b.t);
