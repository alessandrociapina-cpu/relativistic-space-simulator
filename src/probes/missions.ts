/**
 * Catálogo das sondas e seus eventos. Lançamentos, sobrevoos, inserções em
 * órbita, pousos e fins de missão saem dos dados do JPL (ou da reconstrução,
 * nas Veneras); os marcos sem trajetória (Pálido Ponto Azul, heliopausa,
 * último contato, hibernação...) têm datas históricas fixas.
 */
import cassiniData from './data/cassini.json';
import galileoProbeData from './data/galileo-probe.json';
import galileoData from './data/galileo.json';
import huygensData from './data/huygens.json';
import junoData from './data/juno.json';
import newHorizonsData from './data/newhorizons.json';
import parkerData from './data/parker.json';
import pioneer10Data from './data/pioneer10.json';
import pioneer11Data from './data/pioneer11.json';
import rosettaData from './data/rosetta.json';
import v1Data from './data/voyager1.json';
import v2Data from './data/voyager2.json';
import { BODIES, bodyPosition, isMoon, type BodyId } from './bodies';
import {
  AU_KM,
  C_KMS,
  analyzeCapture,
  analyzeFlyby,
  analyzePerihelion,
  loadTrajectory,
  probePosition,
  type CaptureAnalysis,
  type FlybyAnalysis,
  type PerihelionAnalysis,
  type ProbeData,
  type ProbeTrajectory,
} from './probes';
import { DAY_MS, isoToDays } from './time';
import { reconstructVenera, type VeneraReconstruction } from './venera';
import { norm, sub } from './vec3';

export type ProbeId =
  | 'venera7'
  | 'pioneer10'
  | 'pioneer11'
  | 'voyager2'
  | 'voyager1'
  | 'venera13'
  | 'galileo'
  | 'cassini'
  | 'rosetta'
  | 'newhorizons'
  | 'juno'
  | 'parker';
/** Sondas levadas por outra e soltas no caminho. */
export type CompanionId = 'galileo-probe' | 'huygens';
export type CraftId = ProbeId | CompanionId;

export type MissionEventKind =
  | 'launch'
  | 'flyby'
  | 'capture'
  | 'arrival'
  | 'release'
  | 'entry'
  | 'landing'
  | 'end'
  | 'last-contact'
  | 'perihelion'
  | 'milestone'
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
  /** Corpo do evento: a câmera vai até ele em escala real. */
  readonly body?: BodyId;
  /** Sonda do evento, quando não é a principal (sonda atmosférica, Huygens). */
  readonly craft?: CraftId;
  readonly flyby?: FlybyAnalysis;
  readonly capture?: CaptureAnalysis;
  readonly perihelion?: PerihelionAnalysis;
}

export interface Companion {
  readonly id: CompanionId;
  readonly name: string;
  readonly color: string;
  readonly parent: ProbeId;
  readonly trajectory: ProbeTrajectory;
}

export interface ProbeMission {
  readonly id: ProbeId;
  readonly name: string;
  readonly color: string;
  readonly agency: string;
  /** Uma linha para o seletor de sondas. */
  readonly tagline: string;
  readonly trajectory: ProbeTrajectory;
  readonly companions: readonly Companion[];
  readonly events: readonly MissionEvent[];
  /** Rota reconstruída pela mecânica orbital, sem dados do JPL (Veneras). */
  readonly reconstruction?: VeneraReconstruction;
  /** Último contato de uma sonda que segue voando, muda (Pioneers). */
  readonly lastContact?: number;
  /** A missão terminou destruída ou pousada no fim dos dados (some da cena depois). */
  readonly endsAtTrajectoryEnd: boolean;
}

/** Um dia-luz em UA: c × 86 400 s. */
export const LIGHT_DAY_AU = (C_KMS * (DAY_MS / 1000)) / AU_KM;

/** Primeiro instante em [from, to] em que a sonda passa a ficar a mais de `au` do corpo. */
export function firstDistanceCrossing(probe: ProbeTrajectory, body: BodyId, au: number, from: number, to: number, step = 15): number | null {
  const excess = (t: number) => norm(sub(probePosition(probe, t)!, bodyPosition(body, t)!)) - au;
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

/** "de Júpiter", "da Terra", "da Lua", "do cometa 67P". */
export function ofBody(id: BodyId): string {
  const { name, kind } = BODIES[id];
  if (kind === 'comet') return `do ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  return id === 'earth' || id === 'moon' ? `da ${name}` : `de ${name}`;
}

const ORDINAL = ['1º', '2º', '3º', '4º', '5º', '6º', '7º'];

function flybyTitle(body: BodyId, index: number, count: number): string {
  const kind = BODIES[body].kind;
  if (kind === 'asteroid') return `Asteroide ${BODIES[body].name}`;
  if (kind === 'kbo') return `Sobrevoo de ${BODIES[body].name}`;
  return count > 1 ? `${ORDINAL[index]} sobrevoo ${ofBody(body)}` : `Sobrevoo ${ofBody(body)}`;
}

type Milestone = Omit<MissionEvent, 'probeId' | 'id'> & { readonly key: string };

interface MissionSpec {
  readonly id: ProbeId;
  readonly color: string;
  readonly agency: string;
  readonly tagline: string;
  readonly trajectory: ProbeTrajectory;
  readonly companions?: readonly Omit<Companion, 'parent'>[];
  readonly milestones?: readonly Milestone[];
  readonly reconstruction?: VeneraReconstruction;
  readonly lastContact?: number;
  readonly endsAtTrajectoryEnd?: boolean;
  /** Data do evento de chegada (órbita sem freada única, como no cometa). */
  readonly launchTitle?: string;
}

function buildMission(spec: MissionSpec): ProbeMission {
  const { id, trajectory } = spec;
  const events: MissionEvent[] = [
    { id: `${id}-launch`, probeId: id, kind: 'launch', t: trajectory.launch, title: spec.launchTitle ?? `Lançamento da ${trajectory.name}` },
  ];

  const flybys = trajectory.encounters.filter((e) => e.kind === 'flyby');
  const seen = new Map<BodyId, number>();
  for (const e of flybys) {
    const count = flybys.filter((f) => f.body === e.body).length;
    const index = seen.get(e.body) ?? 0;
    seen.set(e.body, index + 1);
    const flyby = analyzeFlyby(trajectory, e);
    events.push({
      id: index === 0 ? `${id}-${e.body}` : `${id}-${e.body}-${index + 1}`,
      probeId: id,
      kind: 'flyby',
      t: flyby.closestT,
      title: flybyTitle(e.body, index, count),
      body: e.body,
      flyby,
    });
  }

  // Inserção em órbita de um planeta (as órbitas que terminam a missão, salvo nas Veneras e no cometa).
  for (const e of trajectory.encounters) {
    if (e.kind !== 'orbit' || BODIES[e.body].kind !== 'planet' || spec.reconstruction) continue;
    const capture = analyzeCapture(e);
    events.push({
      id: `${id}-capture`,
      probeId: id,
      kind: 'capture',
      t: capture.periapsisT,
      title: `Em órbita ${ofBody(e.body)}`,
      body: e.body,
      capture,
    });
  }

  for (const m of spec.milestones ?? []) {
    const { key, ...event } = m;
    events.push({ ...event, id: `${id}-${key}`, probeId: id });
  }

  return {
    id,
    name: trajectory.name,
    color: spec.color,
    agency: spec.agency,
    tagline: spec.tagline,
    trajectory,
    companions: (spec.companions ?? []).map((c) => ({ ...c, parent: id })),
    events: events.sort((a, b) => a.t - b.t),
    ...(spec.reconstruction ? { reconstruction: spec.reconstruction } : {}),
    ...(spec.lastContact !== undefined ? { lastContact: spec.lastContact } : {}),
    endsAtTrajectoryEnd: spec.endsAtTrajectoryEnd ?? false,
  };
}

const load = (data: unknown) => loadTrajectory(data as ProbeData);

// ── Veneras (reconstruídas) ──────────────────────────────────────────────────
function venera(id: 'venera7' | 'venera13', color: string, tagline: string): ProbeMission {
  const rec = reconstructVenera(id);
  return buildMission({
    id,
    color,
    agency: 'União Soviética',
    tagline,
    trajectory: rec.trajectory,
    reconstruction: rec,
    endsAtTrajectoryEnd: true,
    milestones: [{ key: 'landing', kind: 'landing', t: rec.landingT, title: 'Pouso em Vênus', body: 'venus' }],
  });
}

const venera7 = venera('venera7', '#fb923c', 'Primeiro pouso em outro planeta');
const venera13 = venera('venera13', '#f87171', 'Fotos coloridas e som da superfície de Vênus');

// ── Pioneers ─────────────────────────────────────────────────────────────────
const pioneer10 = buildMission({
  id: 'pioneer10',
  color: '#a3e635',
  agency: 'NASA',
  tagline: 'Primeira a cruzar o cinturão de asteroides e a visitar Júpiter',
  trajectory: load(pioneer10Data),
  lastContact: isoToDays('2003-01-23'),
  milestones: [{ key: 'last-contact', kind: 'last-contact', t: isoToDays('2003-01-23'), title: 'Último sinal' }],
});

const pioneer11 = buildMission({
  id: 'pioneer11',
  color: '#4ade80',
  agency: 'NASA',
  tagline: 'Primeira a visitar Saturno',
  trajectory: load(pioneer11Data),
  lastContact: isoToDays('1995-09-30'),
  milestones: [{ key: 'last-contact', kind: 'last-contact', t: isoToDays('1995-09-30'), title: 'Fim dos contatos' }],
});

// ── Voyagers ─────────────────────────────────────────────────────────────────
const voyager1 = (() => {
  const trajectory = load(v1Data);
  const lightDay = firstDistanceCrossing(trajectory, 'earth', LIGHT_DAY_AU, isoToDays('2020-01-01'), isoToDays('2035-01-01'));
  return buildMission({
    id: 'voyager1',
    color: '#f59e0b',
    agency: 'NASA',
    tagline: 'Júpiter, Saturno e Titã; o objeto humano mais distante',
    trajectory,
    milestones: [
      { key: 'pale-blue-dot', kind: 'pale-blue-dot', t: isoToDays('1990-02-14'), title: 'O Pálido Ponto Azul' },
      { key: 'farthest', kind: 'farthest', t: isoToDays('1998-02-17'), title: 'O objeto humano mais distante' },
      { key: 'termination-shock', kind: 'termination-shock', t: isoToDays('2004-12-16'), title: 'Choque de terminação' },
      { key: 'heliopause', kind: 'heliopause', t: isoToDays('2012-08-25'), title: 'Espaço interestelar' },
      ...(lightDay === null ? [] : [{ key: 'light-day', kind: 'light-day' as const, t: lightDay, title: 'Um dia-luz da Terra' }]),
    ],
  });
})();

const voyager2 = buildMission({
  id: 'voyager2',
  color: '#22d3ee',
  agency: 'NASA',
  tagline: 'O Grand Tour: Júpiter, Saturno, Urano e Netuno',
  trajectory: load(v2Data),
  milestones: [
    { key: 'termination-shock', kind: 'termination-shock', t: isoToDays('2007-08-30'), title: 'Choque de terminação' },
    { key: 'heliopause', kind: 'heliopause', t: isoToDays('2018-11-05'), title: 'Espaço interestelar' },
  ],
});

// ── Galileo ──────────────────────────────────────────────────────────────────
const galileo = (() => {
  const trajectory = load(galileoData);
  const probe = load(galileoProbeData);
  return buildMission({
    id: 'galileo',
    color: '#a78bfa',
    agency: 'NASA',
    tagline: 'A primeira a orbitar Júpiter, com uma sonda na atmosfera',
    trajectory,
    endsAtTrajectoryEnd: true,
    companions: [{ id: 'galileo-probe', name: 'Sonda atmosférica', color: '#ddd6fe', trajectory: probe }],
    milestones: [
      { key: 'sl9', kind: 'milestone', t: isoToDays('1994-07-19'), title: 'Cometa Shoemaker–Levy 9 atinge Júpiter' },
      { key: 'release', kind: 'release', t: probe.launch, title: 'A sonda atmosférica se separa', craft: 'galileo-probe' },
      { key: 'entry', kind: 'entry', t: probe.end, title: 'A sonda mergulha em Júpiter', craft: 'galileo-probe', body: 'jupiter' },
      { key: 'end', kind: 'end', t: trajectory.end, title: 'Mergulho final em Júpiter', body: 'jupiter' },
    ],
  });
})();

// ── Cassini–Huygens ──────────────────────────────────────────────────────────
const cassini = (() => {
  const trajectory = load(cassiniData);
  const huygens = load(huygensData);
  return buildMission({
    id: 'cassini',
    color: '#fde047',
    agency: 'NASA, ESA e ASI',
    tagline: '13 anos em órbita de Saturno; a Huygens pousou em Titã',
    trajectory,
    endsAtTrajectoryEnd: true,
    companions: [{ id: 'huygens', name: 'Huygens', color: '#fef9c3', trajectory: huygens }],
    milestones: [
      { key: 'release', kind: 'release', t: huygens.launch, title: 'A Huygens se separa', craft: 'huygens' },
      // Os dados do JPL são a descida prevista, que chega ao solo perto do pouso real (11:38 UTC).
      { key: 'huygens-landing', kind: 'landing', t: isoToDays('2005-01-14T11:38Z'), title: 'A Huygens pousa em Titã', craft: 'huygens', body: 'titan' },
      { key: 'grand-finale', kind: 'milestone', t: isoToDays('2017-04-26'), title: 'Grand Finale: entre os anéis e o planeta', body: 'saturn' },
      { key: 'end', kind: 'end', t: trajectory.end, title: 'Mergulho em Saturno', body: 'saturn' },
    ],
  });
})();

// ── Rosetta ──────────────────────────────────────────────────────────────────
const rosetta = (() => {
  const trajectory = load(rosettaData);
  return buildMission({
    id: 'rosetta',
    color: '#60a5fa',
    agency: 'ESA',
    tagline: 'Dois anos em órbita de um cometa; o Philae pousou nele',
    trajectory,
    endsAtTrajectoryEnd: true,
    milestones: [
      { key: 'hibernation', kind: 'milestone', t: isoToDays('2011-06-08'), title: 'Hibernação' },
      { key: 'wake-up', kind: 'milestone', t: isoToDays('2014-01-20'), title: 'Despertar' },
      { key: 'arrival', kind: 'arrival', t: isoToDays('2014-08-06'), title: 'Chegada ao cometa 67P', body: 'comet67p' },
      { key: 'philae', kind: 'landing', t: isoToDays('2014-11-12T15:34Z'), title: 'O Philae pousa no cometa', body: 'comet67p' },
      { key: 'comet-perihelion', kind: 'milestone', t: isoToDays('2015-08-13'), title: 'O cometa no periélio', body: 'comet67p' },
      { key: 'end', kind: 'end', t: trajectory.end, title: 'Pouso final no cometa', body: 'comet67p' },
    ],
  });
})();

// ── New Horizons ─────────────────────────────────────────────────────────────
const newhorizons = (() => {
  const trajectory = load(newHorizonsData);
  const moonOrbit = firstDistanceCrossing(trajectory, 'earth', 384_400 / AU_KM, trajectory.launch, trajectory.launch + 2, 0.01);
  return buildMission({
    id: 'newhorizons',
    color: '#f472b6',
    agency: 'NASA',
    tagline: 'Plutão e Arrokoth, o objeto mais distante já visitado',
    trajectory,
    milestones:
      moonOrbit === null ? [] : [{ key: 'moon-orbit', kind: 'milestone', t: moonOrbit, title: 'Passa a órbita da Lua' }],
  });
})();

// ── Juno ─────────────────────────────────────────────────────────────────────
const juno = buildMission({
  id: 'juno',
  color: '#e2e8f0',
  agency: 'NASA',
  tagline: 'Órbitas polares rentes a Júpiter, movida a energia solar',
  trajectory: load(junoData),
});

// ── Parker ───────────────────────────────────────────────────────────────────
const parker = (() => {
  const trajectory = load(parkerData);
  const record = analyzePerihelion(trajectory, isoToDays('2024-12-24'));
  return buildMission({
    id: 'parker',
    color: '#f43f5e',
    agency: 'NASA',
    tagline: 'Mergulhos na coroa do Sol; o objeto mais rápido já feito',
    trajectory,
    milestones: [
      { key: 'corona', kind: 'milestone', t: isoToDays('2021-04-28T09:33Z'), title: 'Dentro da coroa solar' },
      { key: 'perihelion', kind: 'perihelion', t: record.t, title: 'Recorde: o mais perto do Sol', perihelion: record },
    ],
  });
})();

/** Em ordem de lançamento. */
export const MISSION_LIST: readonly ProbeMission[] = [
  venera7,
  pioneer10,
  pioneer11,
  voyager2,
  voyager1,
  venera13,
  galileo,
  cassini,
  rosetta,
  newhorizons,
  juno,
  parker,
];
export const MISSIONS = Object.fromEntries(MISSION_LIST.map((m) => [m.id, m])) as Readonly<Record<ProbeId, ProbeMission>>;
export const COMPANIONS: readonly Companion[] = MISSION_LIST.flatMap((m) => m.companions);

/** Todos os eventos, em ordem cronológica. */
export const ALL_EVENTS: readonly MissionEvent[] = MISSION_LIST.flatMap((m) => m.events).sort((a, b) => a.t - b.t);

export const isProbeId = (id: string): id is ProbeId => id in MISSIONS;
export const isCompanionId = (id: string): id is CompanionId => COMPANIONS.some((c) => c.id === id);

/** Trajetória, nome e cor de qualquer sonda (principal ou companheira). */
export function craft(id: CraftId): { readonly name: string; readonly color: string; readonly trajectory: ProbeTrajectory } {
  return isProbeId(id) ? MISSIONS[id] : COMPANIONS.find((c) => c.id === id)!;
}

/** Lua do sobrevoo (para escolher a escala de câmera). */
export const isMoonFlyby = (e: MissionEvent) => e.kind === 'flyby' && e.body !== undefined && isMoon(e.body);
