/**
 * A missão no endereço: `#viagem?o=eridani40&d=tauCeti&g=2.09&c=eridian` abre o planejamento com essa
 * missão carregada, `#viagem?f=hail-mary` com uma missão da ficção e `#viagem?aba=ficcao` no menu da ficção.
 * O embarque grava a missão no endereço (sem nova entrada no histórico): copiar a barra de endereço
 * compartilha a viagem.
 */
import { SCIFI_MISSIONS, type CrewKind, type SciFiMission } from '../physics/accelerationPresets';
import { DEFAULT_REST_RATIO, REST_RATIOS, plannedCoastEta } from '../physics/crewRest';
import { DESTINATIONS } from '../physics/destinations';
import { ORIGINS, canTravel, missionDestination } from '../physics/origins';
import type { MissionChoice } from '../store/useFlightStore';
import { APP_HASH, SCIFI_TAB_PARAM } from './appMode';

/** Faixa da aceleração personalizada do planejamento (g). */
export const MIN_ACCEL_G = 0.1;
export const MAX_ACCEL_G = 1e7;

export type PlannerTab = 'plan' | 'scifi';

export interface MissionLink {
  /** A missão do link; ausente num link só para o menu da ficção. */
  readonly choice?: MissionChoice;
  readonly tab: PlannerTab;
}

const CREW_KINDS: readonly CrewKind[] = ['crewed', 'robotic', 'eridian'];

/**
 * A missão da ficção como escolha do planejamento: o alvo visto da partida e o cruzeiro limitado à
 * aceleração.
 */
export function sciFiChoice(mission: SciFiMission, restRatio: number): MissionChoice {
  const origin = ORIGINS[mission.originId ?? 'sol'];
  const destination = missionDestination(origin, mission.destinationId);
  const coastEta = plannedCoastEta(destination, mission.accelG, mission.coastEta, mission.crew, restRatio);
  return { origin, destination, crew: mission.crew, accelG: mission.accelG, coastEta, restRatio };
}

/**
 * Âncora da missão. Os números vão com todos os dígitos (`String` devolve o menor texto que volta ao mesmo
 * double): a aceleração de um preset continua sendo a do preset e a missão da ficção é reconhecida.
 */
export function missionHash(choice: MissionChoice): string {
  const params = new URLSearchParams();
  if (choice.origin.id !== 'sol') params.set('o', choice.origin.id);
  params.set('d', choice.destination.id);
  params.set('g', String(choice.accelG));
  params.set('c', choice.crew);
  if (choice.coastEta !== null) params.set('e', String(choice.coastEta));
  if (choice.restRatio !== DEFAULT_REST_RATIO) params.set('r', String(choice.restRatio));
  return `${APP_HASH.relativistic}?${params}`;
}

/** Âncora de uma missão da ficção (o descanso só quando não é o padrão). */
export function sciFiHash(mission: SciFiMission, restRatio: number = DEFAULT_REST_RATIO): string {
  const params = new URLSearchParams({ f: mission.id });
  if (restRatio !== DEFAULT_REST_RATIO) params.set('r', String(restRatio));
  return `${APP_HASH.relativistic}?${params}`;
}

/** O endereço completo de uma âncora, para copiar e compartilhar. */
export const absoluteLink = (hash: string) => `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;

const has = <K extends string>(record: Readonly<Record<K, unknown>>, key: string | null): key is K =>
  key !== null && Object.prototype.hasOwnProperty.call(record, key);

/**
 * Lê o link de uma âncora `#viagem?…`; `null` sem parâmetros ou com uma missão inválida (o planejamento
 * abre com a missão atual). Partida e destino na mesma estrela voltam à partida da Terra, e a tripulação
 * eridiana fora de Erid vira piloto humano, como no planejamento.
 */
export function parseMissionLink(hash: string): MissionLink | null {
  const query = hash.indexOf('?');
  if (query < 0 || hash.slice(0, query) !== APP_HASH.relativistic) return null;
  const params = new URLSearchParams(hash.slice(query + 1));
  const tab: PlannerTab = params.get('aba') === SCIFI_TAB_PARAM ? 'scifi' : 'plan';
  const ratio = Number(params.get('r') ?? DEFAULT_REST_RATIO);
  const restRatio = (REST_RATIOS as readonly number[]).includes(ratio) ? ratio : DEFAULT_REST_RATIO;

  const sciFi = SCIFI_MISSIONS.find((m) => m.id === params.get('f'));
  if (sciFi) return { choice: sciFiChoice(sciFi, restRatio), tab };

  const destinationId = params.get('d');
  if (!has(DESTINATIONS, destinationId)) return tab === 'scifi' ? { tab } : null;
  const originId = params.get('o') ?? 'sol';
  const origin = has(ORIGINS, originId) && canTravel(ORIGINS[originId], destinationId) ? ORIGINS[originId] : ORIGINS.sol;
  const accelG = Number(params.get('g'));
  if (!Number.isFinite(accelG) || accelG < MIN_ACCEL_G || accelG > MAX_ACCEL_G) return tab === 'scifi' ? { tab } : null;
  const crewParam = params.get('c') as CrewKind | null;
  const crew: CrewKind =
    crewParam && CREW_KINDS.includes(crewParam) && (crewParam !== 'eridian' || origin.id === 'eridani40') ? crewParam : 'crewed';
  const eta = params.get('e');
  const cruise = eta === null ? null : Number(eta);
  if (cruise !== null && !(Number.isFinite(cruise) && cruise > 0)) return tab === 'scifi' ? { tab } : null;
  const destination = missionDestination(origin, destinationId);
  // O cruzeiro limitado à aceleração, como no embarque do planejamento.
  const coastEta = plannedCoastEta(destination, accelG, cruise, crew, restRatio);
  return { choice: { origin, destination, accelG, coastEta, crew, restRatio }, tab };
}
