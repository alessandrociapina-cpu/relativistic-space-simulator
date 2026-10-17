/**
 * Acelerações próprias oferecidas no planejamento da missão, por tipo de nave,
 * com os limites de tolerância humanos e mecânicos (tabela de tolerância a
 * +Gx por tempo de exposição, imersão em líquido, sondas e nanossondas).
 *
 * A tolerância de um ser humano cai com o tempo de exposição; a de uma
 * máquina quase não depende dele, desde que a aceleração seja contínua.
 */
import type { MissionProfile } from './RelativityEngine';
import { DEFAULT_ACCEL_G, type DestinationId } from './destinations';

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
  /** A tolerância numa frase: "suportável por até ~3 dias, no limite", "suporta empuxo contínuo". */
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
    detail: 'O ponto ótimo do corpo humano: dá para viver anos a bordo, como na Leonora Christine (Tau Zero, de Poul Anderson).',
    enduranceS: Infinity,
    enduranceText: 'suportável por anos',
  },
  {
    id: 'crew-1.5g',
    crew: 'crewed',
    accelG: 1.5,
    label: '1,5 g',
    title: 'Peso 50% maior',
    protection: 'Nenhuma',
    detail:
      'Limite para manter a locomoção e a circulação sem colapso progressivo; a ISV Venture Star (Avatar) queima assim ' +
      'por meses, com todos a bordo em criossono.',
    enduranceS: 21 * DAY,
    enduranceText: 'suportável por dias a semanas',
  },
  {
    id: 'crew-3g',
    crew: 'crewed',
    accelG: 3,
    label: '3 g',
    title: 'Deitado, peito para as costas',
    protection: 'Assento reclinado contra o empuxo',
    detail:
      'Assento reclinado (crash couch, como em The Expanse): acima de 2 g por horas, os alvéolos colapsam e o voo exige ' +
      'pausas sem peso.',
    enduranceS: 4 * HOUR,
    enduranceText: 'suportável por algumas horas',
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
    enduranceText: 'suportável por ~10 min',
  },
  {
    id: 'crew-10g',
    crew: 'crewed',
    accelG: 10,
    label: '10 g',
    title: 'Imersão em líquido',
    protection: 'Tanque com fluido da densidade do corpo',
    detail:
      'Tanque com fluido, como as cascas de aceleração de Guerra Sem Fim (Joe Haldeman): o fluido equilibra a pressão ' +
      'sobre órgãos e vasos, mas o ar nos pulmões ainda limita (no livro, os soldados respiram o fluido e chegam a 25 g).',
    enduranceS: 3 * DAY,
    enduranceText: 'suportável por até ~3 dias, no limite',
  },
  {
    id: 'crew-30g',
    crew: 'crewed',
    accelG: 30,
    label: '30 g',
    title: 'Imersão e ventilação líquida',
    protection: 'Pulmões cheios de perfluorocarbono oxigenado',
    detail:
      'Respiração líquida, como o "estado de mar profundo" de A Floresta Sombria (Cixin Liu): sem ar no tórax, o limite ' +
      'teórico sobe para 24 a 50 g; restam ossos, cérebro e ouvido interno.',
    enduranceS: 3 * HOUR,
    enduranceText: 'suportável por minutos a horas',
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
    enduranceText: 'suporta empuxo contínuo',
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
    enduranceText: 'suporta empuxo contínuo',
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
    enduranceText: 'suporta empuxo contínuo',
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
    enduranceText: 'suporta empuxo contínuo',
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

/**
 * Faixas de tolerância para uma aceleração qualquer, as mesmas dos presets (a proteção de cada um vale
 * até o meio do caminho para o seguinte): 5,9 g e 6,1 g aguentam o mesmo que o preset de 6 g.
 */
const CREW_BANDS: readonly { maxG: number; enduranceS: number; text: string; protection: string }[] = [
  { maxG: 1.2, enduranceS: Infinity, text: 'suportável por anos', protection: 'nenhuma' },
  { maxG: 1.5, enduranceS: 21 * DAY, text: 'suportável por dias a semanas', protection: 'nenhuma' },
  { maxG: 3.5, enduranceS: 4 * HOUR, text: 'suportável por algumas horas', protection: 'assento reclinado contra o empuxo' },
  { maxG: 6.5, enduranceS: 10 * MINUTE, text: 'suportável por ~10 min', protection: 'traje anti-G' },
  { maxG: 12, enduranceS: 3 * DAY, text: 'suportável por até ~3 dias', protection: 'imersão em líquido' },
  { maxG: 50, enduranceS: 3 * HOUR, text: 'suportável por minutos a horas', protection: 'imersão e ventilação líquida' },
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
    ? { enduranceS: Infinity, text: 'suporta empuxo contínuo', protection: band.protection }
    : { enduranceS: 0, text: 'nenhum material aguenta', protection: 'além de qualquer material conhecido' };
}

/**
 * Maior trecho de empuxo contínuo: a viagem inteira no Flip-and-Burn, cada queima no perfil com
 * cruzeiro, a queima entre dois descansos no plano com descansos da tripulação (§4.2.9).
 */
export const longestBurnS = (profile: MissionProfile) =>
  profile.crewRest ? profile.crewRest.burnTau : profile.coastEta === null ? profile.tauTotal : profile.burnEndTau;

export type MissionViability = 'ok' | 'over-limit' | 'hypothetical';

export interface MissionAssessment {
  readonly viability: MissionViability;
  readonly endurance: Endurance;
  readonly burnS: number;
  /** O plano alterna queimas e descansos para a tripulação se recuperar. */
  readonly rests: boolean;
}

/** A nave aguenta o empuxo desta missão? */
export function assessMission(crew: CrewKind, accelG: number, profile: MissionProfile): MissionAssessment {
  const endurance = enduranceFor(crew, accelG);
  const burnS = longestBurnS(profile);
  const viability: MissionViability =
    endurance.enduranceS === 0 ? 'hypothetical' : burnS <= endurance.enduranceS ? 'ok' : 'over-limit';
  return { viability, endurance, burnS, rests: profile.crewRest !== undefined };
}

/**
 * Missões de referência da ficção científica hard e de um projeto real, carregadas em um clique no
 * planejamento (menu "Ficção científica hard"). Cada uma usa um preset de aceleração e um destino do
 * catálogo; os textos contam o que acontece na obra, a física por trás e onde o simulador difere.
 */
export interface SciFiMission {
  readonly id: string;
  readonly label: string;
  readonly work: string;
  /** Autor, meio e ano: "romance de Poul Anderson (1970)". */
  readonly credit: string;
  readonly destinationId: DestinationId;
  readonly crew: CrewKind;
  readonly accelG: number;
  /** Rapidez de cruzeiro (`Math.atanh(beta)`) ou `null` para acelerar e frear. */
  readonly coastEta: number | null;
  /** Resumo numa linha. */
  readonly note: string;
  /** O que acontece na obra. */
  readonly story: string;
  /** A física da propulsão e da proteção do corpo. */
  readonly physics: string;
  /** Como o simulador reproduz a viagem e onde ela difere da obra. */
  readonly simulator: string;
  /** Rótulo da mesma viagem sem descansos, quando na obra ninguém viaja acordado. */
  readonly withoutRests?: string;
  /** Um projeto real, não uma obra de ficção. */
  readonly real?: true;
}

export const SCIFI_MISSIONS: readonly SciFiMission[] = [
  {
    id: 'venture-star',
    label: 'ISV Venture Star',
    work: 'Avatar',
    credit: 'filme de James Cameron (2009)',
    destinationId: 'proxima',
    crew: 'crewed',
    accelG: 1.5,
    coastEta: Math.atanh(0.7),
    note:
      'Avatar (James Cameron): acelera a 1,5 g até 0,7c com vela a laser e antimatéria, cruza por inércia e freia a ' +
      '1,5 g, com todos a bordo em criossono.',
    story:
      'A nave leva colonos e soldados da Terra a Pandora, uma lua do gigante gasoso Polifemo, no sistema de Alfa ' +
      'Centauri A, a 4,37 anos-luz. Ninguém viaja acordado: a tripulação e os passageiros dormem em criossono, e Jake ' +
      'Sully acorda depois de 5 anos, 9 meses e 22 dias.',
    physics:
      'Na partida, lasers no Sistema Solar empurram uma vela de luz; perto de Alfa Centauri, os motores de matéria e ' +
      'antimatéria freiam a nave. A 1,5 g, chegar a 0,7c leva 6,7 meses de bordo: os 5,5 meses que costumam ser ' +
      'citados saem da conta de Newton, v = at, que ignora a relatividade. O que cresce na proporção do tempo de bordo ' +
      'é a rapidez η = atanh(v/c), não a velocidade.',
    simulator:
      'O destino aqui é Proxima, 0,12 ano-luz mais perto que Alfa Centauri A. Um piloto acordado aguenta 1,5 g por ' +
      'semanas, não por meses: com piloto humano, o simulador divide a aceleração e a frenagem em queimas com ' +
      'descansos sem peso, e a viagem fica mais longa que a do filme. Sem os descansos, como no filme, os números ' +
      'ficam perto dos da ficção.',
    withoutRests: 'Como no filme, sem descansos (todos em criossono)',
  },
  {
    id: 'tau-zero',
    label: 'Leonora Christine',
    work: 'Tau Zero',
    credit: 'romance de Poul Anderson (1970)',
    destinationId: 'andromeda',
    crew: 'crewed',
    accelG: 1,
    coastEta: null,
    note:
      'Tau Zero (Poul Anderson): um estatorreator de Bussard mantém 1 g contínuo; com a dilatação do tempo, os 2,5 ' +
      'milhões de anos-luz até Andrômeda levam ~28,6 anos de bordo.',
    story:
      'Vinte e cinco homens e vinte e cinco mulheres partem para colonizar Beta Virginis, a pouco mais de 30 ' +
      'anos-luz, numa nave que acelera sem parar, com o peso de sempre a bordo. No caminho, uma nebulosa avaria o ' +
      'sistema de frenagem; sem poder desligar o motor, que também protege a nave do gás interestelar, a tripulação ' +
      'segue acelerando. O fator τ = √(1 − v²/c²) = 1/γ, a razão entre o tempo de bordo e o da Terra, cai cada vez ' +
      'mais: eles veem galáxias passarem e assistem ao fim do Universo.',
    physics:
      'O estatorreator recolhe com um campo magnético o hidrogênio do meio interestelar e o queima por fusão: quanto ' +
      'mais rápido, mais combustível entra. Com aceleração constante, o tempo de bordo cresce só com o logaritmo da ' +
      'distância, τ ≈ 2(c/α) ln(αD/c²): a 1 g, Andrômeda fica a ~28,6 anos de bordo, enquanto passam 2,5 milhões de ' +
      'anos na Terra. O preço é o funil: para 1 g, o campo teria de varrer o gás de um círculo de ~3\u00a0500 km de raio ' +
      '(estimativa de Peter Schattschneider).',
    simulator:
      'Beta Virginis não está no catálogo, e no livro a nave nunca freia: aqui, a viagem que o mesmo motor tornaria ' +
      'possível, com flip no meio do caminho e frenagem até Andrômeda. A 1 g, o corpo não precisa de descansos. Até ' +
      'TRAPPIST-1, a 39,6 anos-luz, perto da distância de Beta Virginis, seriam 7,28 anos de bordo e 41,5 na Terra.',
  },
  {
    id: 'expanse',
    label: 'Rocinante',
    work: 'The Expanse',
    credit: 'romances de James S. A. Corey (2011–2021) e série de TV',
    destinationId: 'proxima',
    crew: 'crewed',
    accelG: 3,
    coastEta: null,
    note:
      'The Expanse (James S. A. Corey): motor Epstein e tripulação deitada nos assentos articulados (crash couches) a ' +
      '3 g, alternando queimas com pausas sem peso.',
    story:
      'O motor Epstein, um motor de fusão muito eficiente, permite queimas longas, e as viagens entre a Terra, Marte, ' +
      'o Cinturão e Júpiter levam dias ou semanas. Nas manobras fortes, a tripulação fica nos assentos articulados, ' +
      'que injetam o "suco" (juice), um coquetel de drogas que ajuda o corpo a aguentar a aceleração. Às outras ' +
      'estrelas, a série vai pelos anéis, não pelo motor.',
    physics:
      'O assento reclinado põe o empuxo de frente para o peito (+Gx), a direção que o corpo aguenta melhor: o sangue ' +
      'não foge da cabeça. Mesmo assim, horas sob 3 g pesam sobre os pulmões e o coração, e a tripulação precisa de ' +
      'pausas.',
    simulator:
      'O simulador leva a Rocinante a Proxima pelo motor, o que a série faria pelos anéis. Com o limite de ~4 h a 3 g ' +
      'deitado, o piloto automático alterna milhares de queimas curtas com descansos sem peso.',
  },
  {
    id: 'deep-sea',
    label: 'Mar profundo',
    work: 'A Floresta Sombria · Guerra Sem Fim',
    credit: 'romances de Cixin Liu (2008) e Joe Haldeman (1974)',
    destinationId: 'sirius',
    crew: 'crewed',
    accelG: 30,
    coastEta: null,
    note:
      'A Floresta Sombria (Cixin Liu) e Guerra Sem Fim (Joe Haldeman): cabine inundada com líquido respirável ' +
      'oxigenado, para queimas de dezenas de g.',
    story:
      'Em A Floresta Sombria, as naves de guerra da Terra inundam as cabines com um fluido de aceleração rico em ' +
      'oxigênio; a tripulação, sedada, respira o líquido, e só então a nave libera a potência máxima, de mais de ' +
      '100 g. Uma nave que acelera assim sem o "estado de mar profundo" mata quem está a bordo. Em Guerra Sem Fim, os ' +
      'soldados entram em cascas de aceleração cheias de fluido, respiram fluorocarbono oxigenado e aguentam 25 g.',
    physics:
      'Um corpo cheio de líquido não tem cavidades de ar para esmagar: a pressão fica igual dentro e fora, como num ' +
      'peixe de águas profundas (daí o nome). A respiração líquida com perfluorocarbono já foi testada em animais e em ' +
      'bebês prematuros, mas esse líquido tem quase o dobro da densidade da água, e os órgãos ainda pesam sobre os ' +
      'tecidos. O limite teórico fica entre 24 e 50 g, por minutos a horas; restam ossos, cérebro e ouvido interno.',
    simulator:
      'Os livros não vão a Sirius: o destino é uma escolha do simulador. A 30 g, o limite de ~3 h força centenas de ' +
      'queimas curtas entre descansos sem peso, e os 8,6 anos-luz levam entre um ano e um ano e meio de bordo, ' +
      'conforme o descanso.',
  },
  {
    id: 'starshot',
    label: 'Starshot',
    work: 'Breakthrough Starshot',
    credit: 'projeto real, anunciado em 2016',
    real: true,
    destinationId: 'proxima',
    crew: 'robotic',
    accelG: 30_000,
    coastEta: Math.atanh(0.2),
    note:
      'Breakthrough Starshot: nanossonda de poucos gramas empurrada por laser a dezenas de milhares de g por minutos, ' +
      'até 0,2c; chega em ~20 anos.',
    story:
      'O projeto, anunciado em 2016 por Yuri Milner e Stephen Hawking, quer mandar a Alfa Centauri uma frota de chips ' +
      'de poucos gramas, cada um com uma vela de luz de alguns metros. Lasers no solo, com ~100 GW, empurram cada vela ' +
      'por alguns minutos até 0,2c; a sonda passa direto pelo sistema, fotografa e transmite, e as imagens levam mais ' +
      '4,2 anos para chegar à Terra.',
    physics:
      'A aceleração vem só da pressão da luz: numa vela que reflete tudo, F = 2P/c, ~670 N com 100 GW, uma força ' +
      'enorme para poucos gramas. Conforme a massa e o tamanho da vela, isso dá de 10\u00a0000 a 60\u00a0000 g. A vela precisa ' +
      'refletir quase toda a luz: absorver uma fração mínima de 100 GW a vaporizaria.',
    simulator:
      'A queima dura só ~3,4 minutos de bordo. A sonda real não freia e passa por Alfa Centauri a 0,2c; o simulador ' +
      'freia no fim, a 30\u00a0000 g, para parar em Proxima. A 0,2c, a aberração e o Doppler ainda são discretos: a luz ' +
      'que vem da frente chega com frequência 22 % maior.',
  },
];

/** A missão da ficção que a escolha reproduz (o cruzeiro com tolerância de 10⁻³ em η), se houver. */
export const findSciFiMission = (choice: {
  readonly destinationId: DestinationId;
  readonly crew: CrewKind;
  readonly accelG: number;
  readonly coastEta: number | null;
}): SciFiMission | undefined =>
  SCIFI_MISSIONS.find(
    (m) =>
      m.destinationId === choice.destinationId &&
      m.crew === choice.crew &&
      m.accelG === choice.accelG &&
      (m.coastEta === null
        ? choice.coastEta === null
        : choice.coastEta !== null && Math.abs(choice.coastEta - m.coastEta) < 1e-3),
  );
