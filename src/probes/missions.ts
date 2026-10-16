/**
 * Catálogo das sondas e das missões Apollo, com seus eventos. Lançamentos,
 * sobrevoos, inserções em órbita, pousos e fins de missão saem dos dados do
 * JPL ou das reconstruções (Veneras no app; Mariner 10, Vikings, Magellan e
 * Apollo por `scripts/reconstruct.mjs`); os marcos sem trajetória (Pálido
 * Ponto Azul, heliopausa, último contato, hibernação...) têm datas fixas.
 */
import cassiniData from './data/cassini.json';
import dawnData from './data/dawn.json';
import magellanData from './data/magellan.json';
import mariner10Data from './data/mariner10.json';
import viking1LanderData from './data/viking1-lander.json';
import viking1Data from './data/viking1.json';
import viking2LanderData from './data/viking2-lander.json';
import viking2Data from './data/viking2.json';
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

export type ApolloId = 'apollo8' | 'apollo10' | 'apollo11' | 'apollo12' | 'apollo13' | 'apollo14' | 'apollo15' | 'apollo16' | 'apollo17';
export type ProbeId =
  | 'venera7'
  | 'pioneer10'
  | 'pioneer11'
  | 'mariner10'
  | 'viking1'
  | 'viking2'
  | 'voyager2'
  | 'voyager1'
  | 'venera13'
  | 'magellan'
  | 'galileo'
  | 'cassini'
  | 'rosetta'
  | 'newhorizons'
  | 'dawn'
  | 'juno'
  | 'parker'
  | ApolloId;
/** Sondas levadas por outra e soltas no caminho (e os módulos de pouso e lunares). */
export type CompanionId = 'galileo-probe' | 'huygens' | 'viking1-lander' | 'viking2-lander' | `${ApolloId}-lm`;
export type CraftId = ProbeId | CompanionId;
/** Grupos do seletor: sondas robóticas e missões tripuladas à Lua. */
export type MissionGroup = 'probe' | 'apollo';

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
  | 'tli'
  | 'loi'
  | 'liftoff'
  | 'docking'
  | 'tei'
  | 'splashdown'
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
  /** Números da reconstrução (módulos de pouso e lunares). */
  readonly info?: Readonly<Record<string, unknown>>;
}

export interface ProbeMission {
  readonly id: ProbeId;
  readonly name: string;
  readonly color: string;
  readonly agency: string;
  readonly group: MissionGroup;
  /** Uma linha para o seletor de sondas. */
  readonly tagline: string;
  readonly trajectory: ProbeTrajectory;
  readonly companions: readonly Companion[];
  readonly events: readonly MissionEvent[];
  /** Lançamento (dias desde J2000); os dados podem começar depois, na órbita de estacionamento. */
  readonly launchT: number;
  /** Rota reconstruída pela mecânica orbital, sem dados do JPL. */
  readonly reconstructed: boolean;
  /** Números da reconstrução feita por `scripts/reconstruct.mjs` (Δv, altitudes...). */
  readonly info?: Readonly<Record<string, unknown>>;
  /** Reconstrução das Veneras, feita no app. */
  readonly venera?: VeneraReconstruction;
  /** Pouso da própria sonda (Veneras): instante e corpo. */
  readonly landing?: { readonly t: number; readonly body: BodyId };
  /** Último contato de uma sonda que segue voando, muda (Pioneers, Mariner 10). */
  readonly lastContact?: number;
  /** A missão terminou destruída, pousada ou desligada no fim dos dados (some da cena depois). */
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
  readonly group?: MissionGroup;
  readonly companions?: readonly Omit<Companion, 'parent'>[];
  readonly milestones?: readonly Milestone[];
  readonly venera?: VeneraReconstruction;
  readonly info?: Readonly<Record<string, unknown>>;
  readonly landing?: { readonly t: number; readonly body: BodyId };
  readonly lastContact?: number;
  readonly endsAtTrajectoryEnd?: boolean;
  readonly launchTitle?: string;
  /** Lançamento, quando os dados começam depois dele (ISO). */
  readonly launch?: string;
  /** Sobrevoos e inserções em órbita automáticos, pelos encontros (falso nas Apollo, com eventos próprios). */
  readonly autoEvents?: boolean;
}

function buildMission(spec: MissionSpec): ProbeMission {
  const { id, trajectory } = spec;
  const launchT = spec.launch ? isoToDays(spec.launch) : trajectory.launch;
  const autoEvents = spec.autoEvents ?? true;
  const events: MissionEvent[] = [
    {
      id: `${id}-launch`,
      probeId: id,
      kind: 'launch',
      t: launchT,
      title: spec.launchTitle ?? `Lançamento da ${trajectory.name}`,
      ...(spec.group === 'apollo' ? { body: 'earth' as const } : {}),
    },
  ];

  const flybys = autoEvents ? trajectory.encounters.filter((e) => e.kind === 'flyby') : [];
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

  // Inserção em órbita de um planeta (a primeira janela de órbita em torno dele; não nas Veneras).
  const captured = new Set<BodyId>();
  for (const e of trajectory.encounters) {
    if (!autoEvents || e.kind !== 'orbit' || !e.table || BODIES[e.body].kind !== 'planet' || spec.venera || captured.has(e.body)) continue;
    captured.add(e.body);
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
    group: spec.group ?? 'probe',
    tagline: spec.tagline,
    trajectory,
    companions: (spec.companions ?? []).map((c) => ({ ...c, parent: id })),
    events: events.sort((a, b) => a.t - b.t),
    launchT,
    reconstructed: spec.venera !== undefined || spec.info !== undefined,
    ...(spec.info ? { info: spec.info } : {}),
    ...(spec.venera ? { venera: spec.venera } : {}),
    ...(spec.landing ? { landing: spec.landing } : {}),
    ...(spec.lastContact !== undefined ? { lastContact: spec.lastContact } : {}),
    endsAtTrajectoryEnd: spec.endsAtTrajectoryEnd ?? false,
  };
}

const load = (data: unknown) => loadTrajectory(data as ProbeData);
/** Números da reconstrução gravados no JSON. */
const infoOf = (data: unknown) => (data as { reconstruction: Record<string, unknown> }).reconstruction;

// ── Veneras (reconstruídas) ──────────────────────────────────────────────────
function venera(id: 'venera7' | 'venera13', color: string, tagline: string): ProbeMission {
  const rec = reconstructVenera(id);
  return buildMission({
    id,
    color,
    agency: 'União Soviética',
    tagline,
    trajectory: rec.trajectory,
    venera: rec,
    landing: { t: rec.landingT, body: 'venus' },
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

// ── Mariner 10 (reconstruída) ────────────────────────────────────────────────
const mariner10 = buildMission({
  id: 'mariner10',
  color: '#2dd4bf',
  agency: 'NASA',
  tagline: 'A primeira em Mercúrio e o primeiro estilingue planetário, em Vênus',
  trajectory: load(mariner10Data),
  info: infoOf(mariner10Data),
  launch: '1973-11-03T05:45Z',
  lastContact: isoToDays('1975-03-24T12:21Z'),
  milestones: [{ key: 'last-contact', kind: 'last-contact', t: isoToDays('1975-03-24T12:21Z'), title: 'Fim da missão' }],
});

// ── Vikings (reconstruídas) ──────────────────────────────────────────────────
function viking(
  id: 'viking1' | 'viking2',
  data: unknown,
  landerData: unknown,
  colors: readonly [string, string],
  tagline: string,
  launch: string,
  siteName: string,
): ProbeMission {
  const trajectory = load(data);
  const lander = load(landerData);
  const landerId: CompanionId = `${id}-lander`;
  const landingT = lander.encounters.find((e) => e.kind === 'surface')!.start;
  return buildMission({
    id,
    color: colors[0],
    agency: 'NASA',
    tagline,
    trajectory,
    info: infoOf(data),
    launch,
    endsAtTrajectoryEnd: true,
    companions: [{ id: landerId, name: `${trajectory.name} · pouso`, color: colors[1], trajectory: lander, info: infoOf(landerData) }],
    milestones: [
      { key: 'release', kind: 'release', t: lander.launch, title: 'O módulo de pouso se separa', craft: landerId, body: 'mars' },
      { key: 'landing', kind: 'landing', t: landingT, title: `Pouso em ${siteName}`, craft: landerId, body: 'mars' },
      { key: 'end', kind: 'end', t: trajectory.end, title: 'O orbitador é desligado', body: 'mars' },
      { key: 'lander-end', kind: 'last-contact', t: lander.end, title: 'Último contato do módulo de pouso', craft: landerId, body: 'mars' },
    ],
  });
}

const viking1 = viking(
  'viking1',
  viking1Data,
  viking1LanderData,
  ['#ef4444', '#fca5a5'],
  'O primeiro pouso bem-sucedido em Marte, em Chryse Planitia',
  '1975-08-20T21:22Z',
  'Chryse Planitia',
);
const viking2 = viking(
  'viking2',
  viking2Data,
  viking2LanderData,
  ['#f97316', '#fdba74'],
  'Pousou em Utopia Planitia; os orbitadores mapearam Marte',
  '1975-09-09T18:39Z',
  'Utopia Planitia',
);

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

// ── Magellan (reconstruída) ──────────────────────────────────────────────────
const magellan = (() => {
  const trajectory = load(magellanData);
  return buildMission({
    id: 'magellan',
    color: '#e879f9',
    agency: 'NASA',
    tagline: 'Mapeou 98% de Vênus por radar e estreou a aerofrenagem',
    trajectory,
    info: infoOf(magellanData),
    launch: '1989-05-04T18:47Z',
    endsAtTrajectoryEnd: true,
    milestones: [
      { key: 'mapping', kind: 'milestone', t: isoToDays('1990-09-15'), title: 'Começa o mapeamento por radar', body: 'venus' },
      { key: 'aerobraking', kind: 'milestone', t: isoToDays('1993-05-25'), title: 'Aerofrenagem', body: 'venus' },
      { key: 'aerobraking-end', kind: 'milestone', t: isoToDays('1993-08-03'), title: 'Fim da aerofrenagem', body: 'venus' },
      { key: 'end', kind: 'end', t: trajectory.end, title: 'Mergulho na atmosfera de Vênus', body: 'venus' },
    ],
  });
})();

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

// ── Dawn ─────────────────────────────────────────────────────────────────────
const dawn = buildMission({
  id: 'dawn',
  color: '#818cf8',
  agency: 'NASA',
  tagline: 'A primeira a orbitar dois corpos, Vesta e Ceres, com motor iônico',
  trajectory: load(dawnData),
  launch: '2007-09-27T11:34Z',
  endsAtTrajectoryEnd: true,
  milestones: [
    { key: 'vesta', kind: 'arrival', t: isoToDays('2011-07-16T04:47Z'), title: 'Em órbita de Vesta', body: 'vesta' },
    { key: 'vesta-departure', kind: 'milestone', t: isoToDays('2012-09-05T06:26Z'), title: 'Deixa Vesta rumo a Ceres', body: 'vesta' },
    { key: 'ceres', kind: 'arrival', t: isoToDays('2015-03-06T12:29Z'), title: 'Em órbita de Ceres', body: 'ceres' },
    { key: 'end', kind: 'end', t: isoToDays('2018-10-31'), title: 'Fim da missão: acaba a hidrazina', body: 'ceres' },
  ],
});

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

// ── Apollo (reconstruídas) ───────────────────────────────────────────────────
const APOLLO_DATA = import.meta.glob<{ default: unknown }>('./data/apollo*.json', { eager: true });
const apolloData = (file: string) => APOLLO_DATA[`./data/${file}.json`]?.default;

/** Horários da missão (UTC) e nomes, gravados no JSON pela reconstrução. */
interface ApolloTimeline {
  readonly csm: string;
  readonly lm?: string;
  readonly launch: string;
  readonly tli: string;
  readonly loi?: string;
  readonly pericynthion?: string;
  readonly pc2?: string;
  readonly undock?: string;
  readonly landing?: string;
  readonly liftoff?: string;
  readonly docking?: string;
  readonly tei?: string;
  readonly entry: string;
  readonly splashdown: string;
}

const APOLLO_SITES: Partial<Record<ApolloId, string>> = {
  apollo11: 'no Mar da Tranquilidade',
  apollo12: 'no Oceano das Tempestades',
  apollo14: 'em Fra Mauro',
  apollo15: 'em Hadley–Apeninos',
  apollo16: 'em Descartes',
  apollo17: 'em Taurus–Littrow',
};

/** Instante em que a nave fica mais perto (ou mais longe) do corpo, numa faixa de tempo. */
function extremeDistance(trajectory: ProbeTrajectory, body: BodyId, from: number, to: number, farthest: boolean): number {
  const d = (t: number) => norm(sub(probePosition(trajectory, t)!, bodyPosition(body, t)!)) * (farthest ? -1 : 1);
  let best = from;
  for (let t = from; t <= to; t += 1 / 1440) if (d(t) < d(best)) best = t;
  return best;
}

function apollo(id: ApolloId, colors: readonly [string, string], tagline: string, extra: (ctx: { trajectory: ProbeTrajectory; lm: ProbeTrajectory | null; lmId: CompanionId }) => Milestone[] = () => []): ProbeMission {
  const data = apolloData(id)!;
  const info = infoOf(data);
  const m = info['mission'] as ApolloTimeline;
  const trajectory = load(data);
  const lmData = apolloData(`${id}-lm`);
  const lm = lmData ? load(lmData) : null;
  const lmId: CompanionId = `${id}-lm`;
  const d = isoToDays;
  const optional = (iso: string | undefined, event: Omit<Milestone, 't'>): Milestone[] => (iso ? [{ ...event, t: d(iso) }] : []);
  return buildMission({
    id,
    color: colors[0],
    agency: 'NASA',
    group: 'apollo',
    tagline,
    trajectory,
    info,
    launch: m.launch,
    autoEvents: false,
    endsAtTrajectoryEnd: true,
    companions: lm ? [{ id: lmId, name: m.lm!, color: colors[1], trajectory: lm, info: infoOf(lmData) }] : [],
    milestones: [
      { key: 'tli', kind: 'tli', t: d(m.tli), title: 'Injeção translunar', body: 'earth' },
      ...optional(m.loi, { key: 'loi', kind: 'loi', title: 'Em órbita da Lua', body: 'moon' }),
      ...optional(m.undock, { key: 'undock', kind: 'release', title: `O ${m.lm} se separa do ${m.csm}`, craft: lmId, body: 'moon' }),
      ...optional(m.landing, { key: 'landing', kind: 'landing', title: `O ${m.lm} pousa ${APOLLO_SITES[id] ?? 'na Lua'}`, craft: lmId, body: 'moon' }),
      ...optional(m.liftoff, { key: 'liftoff', kind: 'liftoff', title: `O ${m.lm} decola da Lua`, craft: lmId, body: 'moon' }),
      ...optional(m.docking, { key: 'docking', kind: 'docking', title: 'Reencontro e acoplagem em órbita da Lua', craft: lmId, body: 'moon' }),
      ...optional(m.tei, { key: 'tei', kind: 'tei', title: 'Rumo à Terra', body: 'moon' }),
      { key: 'entry', kind: 'entry', t: d(m.entry), title: 'Reentrada na atmosfera', body: 'earth' },
      { key: 'splashdown', kind: 'splashdown', t: d(m.splashdown), title: 'Amerissagem no Pacífico', body: 'earth' },
      ...extra({ trajectory, lm, lmId }),
    ],
  });
}

const APOLLO_LIST: readonly ProbeMission[] = [
  apollo('apollo8', ['#fcd34d', '#fde68a'], 'Os primeiros humanos a orbitar a Lua, no Natal de 1968', () => [
    { key: 'earthrise', kind: 'milestone', t: isoToDays('1968-12-24T16:40Z'), title: 'O nascer da Terra', body: 'moon' },
  ]),
  apollo('apollo10', ['#a3e635', '#d9f99d'], 'O ensaio geral: o módulo lunar desceu a 15 km da superfície', ({ lm, lmId }) => [
    {
      key: 'low-pass',
      kind: 'milestone',
      t: extremeDistance(lm!, 'moon', lm!.launch, lm!.launch + 0.3, false),
      title: 'O Snoopy passa a 15 km da Lua',
      craft: lmId,
      body: 'moon',
    },
  ]),
  apollo('apollo11', ['#38bdf8', '#bae6fd'], 'O primeiro pouso tripulado na Lua', ({ lmId }) => [
    { key: 'first-step', kind: 'milestone', t: isoToDays('1969-07-21T02:56Z'), title: 'O primeiro passo na Lua', craft: lmId, body: 'moon' },
  ]),
  apollo('apollo12', ['#60a5fa', '#bfdbfe'], 'Pouso de precisão ao lado da sonda Surveyor 3'),
  apollo('apollo13', ['#f87171', '#fecaca'], 'A explosão e a volta pela face oculta da Lua', ({ trajectory }) => [
    { key: 'explosion', kind: 'milestone', t: isoToDays('1970-04-14T03:07:53Z'), title: 'Explosão no módulo de serviço', body: 'earth' },
    { key: 'pericynthion', kind: 'milestone', t: isoToDays('1970-04-15T00:21:35Z'), title: 'A volta pela face oculta da Lua', body: 'moon' },
    {
      key: 'record',
      kind: 'milestone',
      t: extremeDistance(trajectory, 'earth', isoToDays('1970-04-14T18:00Z'), isoToDays('1970-04-15T06:00Z'), true),
      title: 'Recorde: os humanos mais longe da Terra',
      body: 'earth',
    },
    { key: 'pc2', kind: 'milestone', t: isoToDays('1970-04-15T02:40:39Z'), title: 'Queima PC+2: a volta mais rápida', body: 'moon' },
  ]),
  apollo('apollo14', ['#c084fc', '#e9d5ff'], 'Fra Mauro, o destino que a Apollo 13 não alcançou'),
  apollo('apollo15', ['#f472b6', '#fbcfe8'], 'O primeiro jipe lunar, ao pé dos montes Apeninos'),
  apollo('apollo16', ['#fb923c', '#fed7aa'], 'As terras altas de Descartes'),
  apollo('apollo17', ['#e2e8f0', '#f8fafc'], 'A última viagem de humanos à Lua, até hoje', ({ lmId }) => [
    { key: 'last-step', kind: 'milestone', t: isoToDays('1972-12-14T05:40Z'), title: 'O último passo na Lua', craft: lmId, body: 'moon' },
  ]),
];

/** Sondas em ordem de lançamento, depois as Apollo. */
export const MISSION_LIST: readonly ProbeMission[] = [
  venera7,
  pioneer10,
  pioneer11,
  mariner10,
  viking1,
  viking2,
  voyager2,
  voyager1,
  venera13,
  magellan,
  galileo,
  cassini,
  rosetta,
  newhorizons,
  dawn,
  juno,
  parker,
  ...APOLLO_LIST,
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
