/**
 * Acelerações próprias oferecidas no planejamento da missão, por tipo de nave,
 * com os limites de tolerância humanos e mecânicos (tabela de tolerância a
 * +Gx por tempo de exposição, imersão em líquido, sondas e nanossondas).
 *
 * A tolerância de um ser humano cai com o tempo de exposição; a de uma
 * máquina quase não depende dele, desde que a aceleração seja contínua.
 */
import type { MissionProfile } from './RelativityEngine';
import { DEFAULT_ACCEL_G } from './destinations';

/** Quem vai a bordo: piloto humano ou sonda robótica. */
export type CrewKind = 'crewed' | 'robotic';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

export interface AccelerationPreset {
  readonly id: string;
  readonly crew: CrewKind;
  readonly accelG: number;
  /** Valor em texto: "1 g", "1,61 × 10⁶ g". */
  readonly label: string;
  readonly title: string;
  /** Como a nave ou o corpo aguentam essa aceleração. */
  readonly protection: string;
  readonly detail: string;
  /** Por quanto tempo seguido a aceleração é suportável (s); `Infinity` = indefinidamente. */
  readonly enduranceS: number;
  readonly enduranceText: string;
  /** Além de qualquer limite conhecido: só para ver os efeitos. */
  readonly hypothetical?: boolean;
}

export const DEMO_ACCEL_LABEL = '1,61 × 10⁶ g';

export const ACCELERATION_PRESETS: readonly AccelerationPreset[] = [
  {
    id: 'crew-1g',
    crew: 'crewed',
    accelG: 1,
    label: '1 g',
    title: 'Gravidade da Terra',
    protection: 'Nenhuma: o peso de sempre',
    detail: 'O ponto ótimo do corpo humano: dá para viver anos a bordo.',
    enduranceS: Infinity,
    enduranceText: 'anos',
  },
  {
    id: 'crew-1.5g',
    crew: 'crewed',
    accelG: 1.5,
    label: '1,5 g',
    title: 'Peso 50% maior',
    protection: 'Nenhuma',
    detail: 'Limite para manter a locomoção, a circulação e o coração sem colapso progressivo.',
    enduranceS: 21 * DAY,
    enduranceText: 'dias a semanas',
  },
  {
    id: 'crew-3g',
    crew: 'crewed',
    accelG: 3,
    label: '3 g',
    title: 'Deitado, peito para as costas',
    protection: 'Assento reclinado contra o empuxo',
    detail: 'Acima de 2 g por horas, os alvéolos colapsam e o coração entra em fadiga.',
    enduranceS: 4 * HOUR,
    enduranceText: 'horas',
  },
  {
    id: 'crew-6g',
    crew: 'crewed',
    accelG: 6,
    label: '6 g',
    title: 'Traje anti-G',
    protection: 'Traje pressurizado e manobra de esforço, deitado',
    detail: 'Em centrífuga, pessoas treinadas aguentam 8 g por ~3 min ou 6 g por ~10 min.',
    enduranceS: 10 * MINUTE,
    enduranceText: '~10 min',
  },
  {
    id: 'crew-10g',
    crew: 'crewed',
    accelG: 10,
    label: '10 g',
    title: 'Imersão em líquido',
    protection: 'Tanque com fluido da densidade do corpo',
    detail: 'O fluido equilibra a pressão sobre órgãos e vasos; os pulmões, cheios de ar, ainda limitam.',
    enduranceS: 3 * DAY,
    enduranceText: 'até ~3 dias, no limite',
  },
  {
    id: 'crew-30g',
    crew: 'crewed',
    accelG: 30,
    label: '30 g',
    title: 'Imersão e ventilação líquida',
    protection: 'Pulmões cheios de perfluorocarbono oxigenado',
    detail: 'Sem ar no tórax, o limite teórico sobe para 24 a 50 g; restam ossos, cérebro e ouvido interno.',
    enduranceS: 3 * HOUR,
    enduranceText: 'minutos a horas',
  },
  {
    id: 'crew-demo',
    crew: 'crewed',
    accelG: DEFAULT_ACCEL_G,
    label: DEMO_ACCEL_LABEL,
    title: 'Hipotética',
    protection: 'Nenhuma possível',
    detail: 'Ninguém sobreviveria: o simulador mostra o que um piloto veria. Proxima em 10 min de bordo.',
    enduranceS: 0,
    enduranceText: 'nenhum ser humano sobrevive',
    hypothetical: true,
  },
  {
    id: 'robot-0.3g',
    crew: 'robotic',
    accelG: 0.3,
    label: '0,3 g',
    title: 'Sonda convencional',
    protection: 'Antenas e painéis solares abertos',
    detail: 'Como a Voyager e a Cassini em trânsito: 0,1 a 0,5 g contínuos.',
    enduranceS: Infinity,
    enduranceText: 'contínua',
  },
  {
    id: 'robot-100g',
    crew: 'robotic',
    accelG: 100,
    label: '100 g',
    title: 'Sonda reforçada',
    protection: 'Estrutura rígida, antenas e painéis recolhidos',
    detail: 'Máquinas não desmaiam: a aceleração contínua só esbarra na resistência dos materiais.',
    enduranceS: Infinity,
    enduranceText: 'contínua',
  },
  {
    id: 'robot-10000g',
    crew: 'robotic',
    accelG: 10_000,
    label: '10 000 g',
    title: 'Eletrônica encapsulada',
    protection: 'Sem peças móveis, circuitos em resina epóxi',
    detail: 'Projéteis guiados funcionam depois de 10 000 a 15 500 g.',
    enduranceS: Infinity,
    enduranceText: 'contínua',
  },
  {
    id: 'robot-30000g',
    crew: 'robotic',
    accelG: 30_000,
    label: '30 000 g',
    title: 'Nanossonda (Starshot)',
    protection: 'Um único wafer de silício com vela de luz',
    detail: 'Empurrada por laser, aguenta 10 000 a 60 000 g por minutos.',
    enduranceS: Infinity,
    enduranceText: 'contínua',
  },
  {
    id: 'robot-demo',
    crew: 'robotic',
    accelG: DEFAULT_ACCEL_G,
    label: DEMO_ACCEL_LABEL,
    title: 'Hipotética',
    protection: 'Além de qualquer material conhecido',
    detail: 'Proxima em 10 min de bordo, com todos os efeitos em tempo real.',
    enduranceS: 0,
    enduranceText: 'nenhum material aguenta',
    hypothetical: true,
  },
];

export const presetsFor = (crew: CrewKind) => ACCELERATION_PRESETS.filter((p) => p.crew === crew);

export const findPreset = (crew: CrewKind, accelG: number) =>
  ACCELERATION_PRESETS.find((p) => p.crew === crew && p.accelG === accelG);

/** Faixas de tolerância para uma aceleração qualquer (a melhor proteção disponível em cada faixa). */
const CREW_BANDS: readonly { maxG: number; enduranceS: number; text: string; protection: string }[] = [
  { maxG: 1.2, enduranceS: Infinity, text: 'anos', protection: 'nenhuma' },
  { maxG: 1.5, enduranceS: 21 * DAY, text: 'dias a semanas', protection: 'nenhuma' },
  { maxG: 10, enduranceS: 3 * DAY, text: 'até ~3 dias', protection: 'imersão em líquido' },
  { maxG: 50, enduranceS: 3 * HOUR, text: 'minutos a horas', protection: 'imersão e ventilação líquida' },
];
const ROBOT_BANDS: readonly { maxG: number; protection: string }[] = [
  { maxG: 0.5, protection: 'sonda convencional' },
  { maxG: 100, protection: 'sonda reforçada' },
  { maxG: 15_500, protection: 'eletrônica encapsulada' },
  { maxG: 60_000, protection: 'nanossonda de estado sólido' },
];

export interface Endurance {
  readonly enduranceS: number;
  readonly text: string;
  readonly protection: string;
}

/** Tolerância a uma aceleração contínua qualquer, para a nave escolhida. */
export function enduranceFor(crew: CrewKind, accelG: number): Endurance {
  const preset = findPreset(crew, accelG);
  if (preset) return { enduranceS: preset.enduranceS, text: preset.enduranceText, protection: preset.protection };
  if (crew === 'crewed') {
    const band = CREW_BANDS.find((b) => accelG <= b.maxG);
    return band
      ? { enduranceS: band.enduranceS, text: band.text, protection: band.protection }
      : { enduranceS: 0, text: 'nenhum ser humano sobrevive', protection: 'nenhuma possível' };
  }
  const band = ROBOT_BANDS.find((b) => accelG <= b.maxG);
  return band
    ? { enduranceS: Infinity, text: 'contínua', protection: band.protection }
    : { enduranceS: 0, text: 'nenhum material aguenta', protection: 'além de qualquer material conhecido' };
}

/** Maior trecho de empuxo contínuo: a viagem inteira no Flip-and-Burn, cada queima no perfil com cruzeiro. */
export const longestBurnS = (profile: MissionProfile) =>
  profile.coastEta === null ? profile.tauTotal : profile.burnEndTau;

export type MissionViability = 'ok' | 'over-limit' | 'hypothetical';

export interface MissionAssessment {
  readonly viability: MissionViability;
  readonly endurance: Endurance;
  readonly burnS: number;
}

/** A nave aguenta o empuxo desta missão? */
export function assessMission(crew: CrewKind, accelG: number, profile: MissionProfile): MissionAssessment {
  const endurance = enduranceFor(crew, accelG);
  const burnS = longestBurnS(profile);
  const viability: MissionViability =
    endurance.enduranceS === 0 ? 'hypothetical' : burnS <= endurance.enduranceS ? 'ok' : 'over-limit';
  return { viability, endurance, burnS };
}
