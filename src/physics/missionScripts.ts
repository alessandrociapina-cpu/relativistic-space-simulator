/**
 * Roteiros (CLAUDE.md §4.2.11): viagens em fases com acelerações diferentes, contadas como uma história. O
 * roteiro de Tau Zero (Poul Anderson, 1970) é a fuga da Leonora Christine até o plano do capítulo 10: com o
 * freio avariado, acelerar para fora da galáxia e parar no vazio, a 40 milhões de anos-luz, rumo a Virgem.
 *
 * Cada fase é um segmento de aceleração própria constante (ou de inércia), em forma fechada como os do motor
 * (§4.2.8): o voo inteiro vai em `MissionProfile.segments`, e `MissionProfile.script` guarda onde cada fase
 * começa e termina e onde a nave passa pelos marcos da história.
 */
import type { CrewKind } from './accelerationPresets';
import type { DestinationId } from './destinations';
import {
  C,
  G0,
  LIGHT_YEAR_M,
  computeFlightState,
  segmentState,
  type FlightSegment,
  type MissionProfile,
} from './RelativityEngine';

const C2 = C * C;
const DAY_S = 86_400;
/** acosh(1 + ε) e cosh η − 1 sem cancelamento (as mesmas do motor). */
const acosh1p = (eps: number) => Math.log1p(eps + Math.sqrt(eps * (2 + eps)));
const coshm1 = (eta: number) => 2 * Math.sinh(eta / 2) ** 2;
/** cosh η₁ − cosh η₀ como produto, sem cancelamento. */
const dCosh = (eta1: number, eta0: number) => 2 * Math.sinh((eta1 + eta0) / 2) * Math.sinh((eta1 - eta0) / 2);

export type ScriptId = 'tau-zero';

/** Até onde uma fase vai. */
export type PhaseEnd =
  /** Acelera até a velocidade β (fração de c). */
  | { readonly kind: 'beta'; readonly beta: number }
  /** Até a nave ter percorrido `ly` anos-luz desde a partida. */
  | { readonly kind: 'distance'; readonly ly: number }
  /** Por `seconds` de bordo (com o motor desligado, `accelG` = 0). */
  | { readonly kind: 'duration'; readonly seconds: number }
  /** Até a rapidez de pico com que as fases seguintes (inércia e a frenagem) param exatamente no destino. */
  | { readonly kind: 'peak' }
  /** Freia até parar no destino. */
  | { readonly kind: 'stop' };

/** Os textos de um passo da história: o que acontece, na obra e na física. */
export interface ScriptText {
  readonly title: string;
  /** Uma frase: o selo do console, a faixa de etapas e o topo do cartão. */
  readonly summary: string;
  /** Na obra. */
  readonly story: string;
  /** A física. */
  readonly physics: string;
}

export interface ScriptPhase extends ScriptText {
  readonly id: string;
  /** A aceleração em poucas palavras, para a faixa de etapas: "0,5 g", "motor desligado". */
  readonly badge: string;
  /** Aceleração própria (g): > 0 acelera, < 0 freia, 0 com o motor desligado. */
  readonly accelG: number;
  readonly until: PhaseEnd;
}

/** Um marco dentro de uma fase: a nave passa por uma distância da partida. */
export interface ScriptMilestone extends ScriptText {
  readonly id: string;
  readonly atLy: number;
}

export interface MissionScript {
  readonly id: ScriptId;
  readonly title: string;
  readonly destinationId: DestinationId;
  readonly crew: CrewKind;
  /** Peso sentido a bordo nas queimas (g): os campos internos da nave o seguram, qualquer que seja a aceleração. */
  readonly interiorG: number;
  readonly phases: readonly ScriptPhase[];
  readonly milestones: readonly ScriptMilestone[];
  /** A chegada: o último passo da história. */
  readonly arrival: ScriptText;
}

/** A fuga da Leonora Christine (Tau Zero), da partida ao vazio do capítulo 10. */
const TAU_ZERO: MissionScript = {
  id: 'tau-zero',
  title: 'A fuga da Leonora Christine',
  destinationId: 'intergalacticVoid',
  crew: 'crewed',
  interiorG: 1,
  phases: [
    {
      id: 'partida',
      title: 'Partida',
      badge: '0,5 g',
      accelG: 0.5,
      until: { kind: 'beta', beta: 0.05 },
      summary: 'O estatorreator começa devagar: 0,5 g até 5 % da velocidade da luz.',
      story:
        'A Leonora Christine deixa o Sistema Solar com 25 homens e 25 mulheres, rumo a um planeta de Beta Virginis, a ' +
        'pouco mais de 30 anos-luz, para fundar a primeira colônia fora do Sistema Solar.',
      physics:
        'O estatorreator de Bussard não leva combustível: um campo magnético recolhe o hidrogênio do caminho e o ' +
        'queima por fusão. Devagar, ele recolhe pouco gás, e a partida é suave: 0,5 g até 0,05c (15 000 km/s), em ' +
        'pouco mais de um mês de bordo.',
    },
    {
      id: 'cruzeiro',
      title: 'Rumo a Beta Virginis',
      badge: '3 g',
      accelG: 3,
      until: { kind: 'distance', ly: 10 },
      summary: '3 g rumo a Beta Virginis; os campos internos mantêm 1 g a bordo.',
      story:
        'Com o estatorreator a pleno, a nave acelera a 3 g, e os campos internos mantêm o peso de 1 g a bordo. O plano ' +
        'é acelerar até o meio do caminho, virar a nave e frear do mesmo jeito.',
      physics:
        'A 3 g, em pouco mais de um ano de bordo a nave passa de 99,9 % da velocidade da luz e γ chega a 32: cada dia a ' +
        'bordo já vale um mês na Terra. Os 10 anos-luz até a nebulosa levam 1,3 ano de bordo e 10 anos na Terra.',
    },
    {
      id: 'decisao',
      title: 'A nebulosa e a decisão',
      badge: '3 g',
      accelG: 3,
      until: { kind: 'distance', ly: 10.5 },
      summary: 'Uma nebulosa avaria o freio: a tripulação decide fugir da galáxia.',
      story:
        'Uma pequena nebulosa, fora dos mapas, avaria o sistema de desaceleração. Para consertá-lo seria preciso ' +
        'desligar o estatorreator, mas os mesmos campos protegem a nave do gás interestelar, mortal àquela velocidade. ' +
        'No capítulo 10, Telander e Lindgren contam à tripulação que a Terra, Beta Virginis e a humanidade conhecida ' +
        'ficaram para trás; o pânico só cede quando Reymont impõe a ordem. O plano de Boudreau, Nilsson e Fedoroff: ' +
        'acelerar a dez gravidades ou mais para fora da galáxia, até um vazio de gás tão rarefeito que os campos ' +
        'possam ser desligados.',
      physics:
        'O gás entre as estrelas tem cerca de um átomo por centímetro cúbico. A γ ≈ 33, cada próton bate na proa ' +
        'com ~30 GeV, a energia de um acelerador de partículas, e o gás despeja dezenas de megawatts por metro ' +
        'quadrado: sem os campos, a nave não resistiria.',
    },
    {
      id: 'fuga',
      title: 'A fuga a 10 g',
      badge: '10 g',
      accelG: 10,
      until: { kind: 'peak' },
      summary: '10 g para fora da Via Láctea e do Grupo Local, rumo a Virgem.',
      story:
        'A Leonora Christine acelera a 10 g, e os campos internos seguram 1 g a bordo. No livro, a rota espirala ' +
        'pelo centro da galáxia, onde o gás mais denso alimenta melhor o estatorreator; aqui ela segue reta rumo ao ' +
        'Aglomerado de Virgem, perto do polo norte galáctico, e sai do disco quase na perpendicular.',
      physics:
        'Com aceleração própria constante, a rapidez η cresce em linha reta com o tempo de bordo, e γ = cosh η cresce ' +
        'exponencialmente: a 10 g, γ multiplica por e ≈ 2,7 a cada 35 dias de bordo. Em um ano e meio de bordo, γ vai ' +
        'de 33 a mais de 10⁸, e o relógio da Terra salta de 11 anos para 14 milhões.',
    },
    {
      id: 'reparo',
      title: 'O reparo',
      badge: 'motor desligado',
      accelG: 0,
      until: { kind: 'duration', seconds: 30 * DAY_S },
      summary: 'Motor desligado no vazio: 30 dias de bordo para consertar o freio.',
      story:
        'Longe de tudo, o gás é tão rarefeito que os campos podem ser desligados, e a tripulação conserta o sistema de ' +
        'desaceleração. O livro não diz quanto tempo isso leva: aqui, 30 dias de bordo.',
      physics:
        'Sem empuxo, γ fica parado em ~1,5 × 10⁸: os 30 dias de bordo valem 12 milhões de anos lá fora, e a nave ' +
        'percorre 12 milhões de anos-luz. A física de verdade é mais dura que o livro: mesmo no vazio, com um átomo a ' +
        'cada 4 metros cúbicos, cada próton chega com ~10¹⁷ eV, como os raios cósmicos mais energéticos, e a proa ' +
        'receberia centenas de bilhões de vezes a luz do Sol na Terra.',
    },
    {
      id: 'frenagem',
      title: 'Frenagem',
      badge: '10 g',
      accelG: -10,
      until: { kind: 'stop' },
      summary: 'Freio consertado: a nave gira e freia a 10 g até parar.',
      story:
        'Com o freio consertado, a nave gira 180° e freia a 10 g. No livro, o plano é frear numa nova família de ' +
        'galáxias e procurar um mundo para colonizar; aqui ela para no vazio, a 40 milhões de anos-luz, a distância ' +
        'do aglomerado do capítulo 10.',
      physics:
        'A frenagem é a fuga ao contrário: para perder a rapidez η ≈ 20 a 10 g, são quase 2 anos de bordo, enquanto ' +
        'mais 14 milhões de anos passam lá fora. γ volta a 1 com a mesma rapidez exponencial com que subiu.',
    },
  ],
  milestones: [
    {
      id: 'disco',
      title: 'Acima do disco',
      atLy: 3400,
      summary: 'A nave sobe acima do disco da Via Láctea.',
      story: 'A rota para Virgem sai do plano da galáxia quase na perpendicular, por cima do disco de estrelas, gás e poeira.',
      physics:
        'A 3 400 anos-luz da Terra, a nave está a mais de 1 kpc acima do plano: o gás frio ficou embaixo, e o que resta ' +
        'é o gás morno ionizado, cem vezes mais rarefeito, e o halo quente. Parada ali, a tripulação veria a Via Láctea ' +
        'só de um lado do céu, não mais como uma faixa em volta dele; a γ ≈ 35 000, o céu inteiro está espremido num ' +
        'ponto à frente.',
    },
    {
      id: 'galaxia',
      title: 'Fora da Via Láctea',
      atLy: 100_000,
      summary: 'A nave deixa a galáxia: a Via Láctea inteira fica para trás.',
      story: 'Os 100 bilhões de estrelas da Via Láctea, com o Sol entre elas, ficam para trás.',
      physics:
        'A 100 000 anos-luz, a nave já passou do disco e do grosso do halo de estrelas. Parada, a tripulação veria a ' +
        'galáxia inteira de fora. A γ ≈ 10⁶, a aberração junta quase todo o céu, a Via Láctea de trás inclusive, num ' +
        'ponto à frente da nave, desviado para o azul; atrás fica só um pedacinho de céu, desviado para o vermelho.',
    },
    {
      id: 'andromeda',
      title: 'Mais longe que Andrômeda',
      atLy: 2.537e6,
      summary: 'A nave passa a distância da Galáxia de Andrômeda.',
      story: 'A Leonora Christine já está mais longe da Terra que a Galáxia de Andrômeda, em outra direção do céu.',
      physics:
        'A 2,5 milhões de anos-luz, a distância da galáxia grande mais próxima. Na Terra, já se passaram 2,5 milhões ' +
        'de anos, mais ou menos o tempo desde o surgimento do gênero Homo, na África.',
    },
    {
      id: 'grupo-local',
      title: 'Fora do Grupo Local',
      atLy: 5e6,
      summary: 'O Grupo Local de galáxias fica para trás.',
      story:
        'Como Reymont avisa no capítulo 10, não há volta: na Terra já se passaram 5 milhões de anos, e a humanidade ' +
        'que a tripulação conheceu provavelmente não existe mais.',
      physics:
        'O Grupo Local, a Via Láctea, Andrômeda e dezenas de galáxias menores, tem cerca de 10 milhões de anos-luz de ' +
        'diâmetro. Fora dele, a nave entra no espaço entre os grupos de galáxias, onde o gás é o mais rarefeito do ' +
        'universo.',
    },
  ],
  arrival: {
    title: 'No vazio',
    summary: 'Parada a 40 milhões de anos-luz da Terra, no vazio rumo a Virgem.',
    story:
      'A tripulação viveu menos de 5 anos; na Terra, se passaram 40 milhões. Não há volta: o plano é seguir para uma ' +
      'nova família de galáxias e procurar um mundo.',
    physics:
      'Parada, a nave volta a ver o céu sem aberração nem Doppler, e ele é quase todo negro: nenhuma estrela por ' +
      'perto, a Via Láctea reduzida a uma mancha fraca lá atrás e, à frente, o Aglomerado de Virgem, a 14 milhões de ' +
      'anos-luz. A luz que chega agora da Terra partiu só seis meses depois da nave: em 40 milhões de anos de ' +
      'corrida, a nave chegou meio ano atrás dela.',
  },
};

export const MISSION_SCRIPTS: Readonly<Record<ScriptId, MissionScript>> = { 'tau-zero': TAU_ZERO };

// ── O voo do roteiro ─────────────────────────────────────────────────────────

/** Onde e quando uma fase começa e termina. */
export interface PhaseTiming {
  readonly id: string;
  readonly startTau: number;
  readonly endTau: number;
  readonly eta0: number;
  readonly eta1: number;
  /** Distância percorrida desde a partida (m), no início e no fim. */
  readonly x0: number;
  readonly x1: number;
  /** Tempo da Terra (s), no início e no fim. */
  readonly earth0: number;
  readonly earth1: number;
}

export interface ScriptPlan {
  readonly id: ScriptId;
  readonly phases: readonly PhaseTiming[];
  /** Instante em que a nave passa por cada marco (s de bordo). */
  readonly milestones: readonly { readonly id: string; readonly tau: number }[];
}

type Start = Pick<FlightSegment, 'startTau' | 'eta0' | 'remaining0' | 'earth0' | 'radio0'>;

/** Estado no fim de um segmento, como início do seguinte. */
function endOf(seg: FlightSegment): Start {
  const s = segmentState(seg, seg.duration);
  return { startTau: seg.startTau + seg.duration, eta0: s.eta, remaining0: s.remainingM, earth0: s.earthTimeS, radio0: s.radioTimeS };
}

/** Distância percorrida num segmento (m), em forma fechada e só com termos positivos. */
function segmentDistance(seg: FlightSegment): number {
  if (seg.kind === 'coast' || seg.accel === 0) return C * Math.sinh(seg.eta0) * seg.duration;
  const eta1 = seg.eta0 + (seg.accel * seg.duration) / C;
  return (C2 / Math.abs(seg.accel)) * Math.abs(dCosh(eta1, seg.eta0));
}

/**
 * Rapidez de pico da fase `peak`: a maior que, somada à inércia das fases de motor desligado seguintes e à
 * frenagem final, cabe exatamente na distância que falta.
 */
function peakRapidity(start: Start, a: number, rest: readonly ScriptPhase[]): number {
  const coastS = rest.reduce((sum, p) => sum + (p.until.kind === 'duration' && p.accelG === 0 ? p.until.seconds : 0), 0);
  const brake = rest.find((p) => p.until.kind === 'stop');
  if (!brake) throw new Error('Roteiro: a fase de pico precisa de uma frenagem até parar depois dela.');
  const ab = Math.abs(brake.accelG * G0);
  const need = (eta: number) => (C2 / a) * dCosh(eta, start.eta0) + C * Math.sinh(eta) * coastS + (C2 / ab) * coshm1(eta);
  let lo = start.eta0;
  let hi = acosh1p((a * start.remaining0) / C2 + coshm1(start.eta0));
  for (let i = 0; i < 200 && hi - lo > 1e-15 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) <= start.remaining0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * O voo do roteiro até o destino a `distanceM`: um segmento por fase, a última freando até parar no
 * destino. O perfil é o de um voo em segmentos (como o plano com descansos), com o roteiro em `script`.
 */
export function scriptProfile(script: MissionScript, distanceM: number): MissionProfile {
  const segments: FlightSegment[] = [];
  const timings: PhaseTiming[] = [];
  let start: Start = { startTau: 0, eta0: 0, remaining0: distanceM, earth0: 0, radio0: 0 };
  let x = 0;
  script.phases.forEach((phase, i) => {
    const a = phase.accelG * G0;
    const until = phase.until;
    let seg: FlightSegment;
    if (until.kind === 'stop') {
      const ab = Math.abs(a);
      seg = { kind: 'thrust', ...start, duration: (start.eta0 * C) / ab, accel: -ab, toArrival: true };
    } else if (until.kind === 'duration' && a === 0) {
      seg = { kind: 'coast', ...start, duration: until.seconds, accel: 0 };
    } else {
      const eta1 =
        until.kind === 'beta'
          ? Math.atanh(until.beta)
          : until.kind === 'distance'
            ? acosh1p(coshm1(start.eta0) + (a * (until.ly * LIGHT_YEAR_M - x)) / C2)
            : until.kind === 'duration'
              ? start.eta0 + (a * until.seconds) / C
              : peakRapidity(start, a, script.phases.slice(i + 1));
      seg = { kind: 'thrust', ...start, duration: ((eta1 - start.eta0) * C) / a, accel: a };
    }
    const next = endOf(seg);
    const dx = segmentDistance(seg);
    timings.push({
      id: phase.id,
      startTau: seg.startTau,
      endTau: next.startTau,
      eta0: seg.eta0,
      eta1: until.kind === 'stop' ? 0 : next.eta0,
      x0: x,
      x1: x + dx,
      earth0: seg.earth0,
      earth1: next.earth0,
    });
    segments.push(seg);
    x += dx;
    start = next;
  });

  const tauTotal = start.startTau;
  const tTotal = start.earth0;
  const peak = timings.reduce((best, p) => (p.eta1 > best.eta1 ? p : best));
  const brake = timings[script.phases.findIndex((p) => p.until.kind === 'stop')]!;
  const profile: MissionProfile = {
    distanceM,
    properAccel: Math.max(...script.phases.map((p) => Math.abs(p.accelG))) * G0,
    halfDistanceM: distanceM / 2,
    gammaMax: Math.cosh(peak.eta1),
    etaMax: peak.eta1,
    tauHalf: tauTotal / 2,
    tauTotal,
    tHalf: tTotal / 2,
    tTotal,
    // A subida termina no pico (o motor desliga para o reparo) e a frenagem começa no flip.
    burnEndTau: peak.endTau,
    brakeStartTau: brake.startTau,
    coastEta: null,
    segments,
  };
  const milestones = script.milestones.map((m) => ({ id: m.id, tau: tauAtDistance(profile, m.atLy * LIGHT_YEAR_M) }));
  return { ...profile, script: { id: script.id, phases: timings, milestones } };
}

/** Instante (s de bordo) em que a nave passa a `xM` metros da partida, por bissecção (a posição só cresce). */
function tauAtDistance(profile: MissionProfile, xM: number): number {
  let lo = 0;
  let hi = profile.tauTotal;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * profile.tauTotal; i++) {
    const mid = (lo + hi) / 2;
    if (computeFlightState(profile, mid).positionM < xM) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** A fase em curso no instante τ (a primeira no τ = 0; a última na chegada). */
export function phaseIndexAt(plan: ScriptPlan, tau: number): number {
  const i = plan.phases.findIndex((p) => tau < p.endTau);
  return i < 0 ? plan.phases.length - 1 : i;
}

/** Um passo da história: o começo de uma fase, um marco no caminho ou a chegada. */
export interface ScriptBeat {
  readonly id: string;
  readonly kind: 'phase' | 'milestone' | 'arrival';
  readonly tau: number;
}

/** Os passos da história em ordem: o começo de cada fase, os marcos e a chegada. */
export function scriptBeats(plan: ScriptPlan, tauTotal: number): ScriptBeat[] {
  return [
    ...plan.phases.map((p): ScriptBeat => ({ id: p.id, kind: 'phase', tau: p.startTau })),
    ...plan.milestones.map((m): ScriptBeat => ({ id: m.id, kind: 'milestone', tau: m.tau })),
    { id: 'arrival', kind: 'arrival' as const, tau: tauTotal },
  ].sort((a, b) => a.tau - b.tau);
}

/** Os textos de um passo da história. */
export function beatText(script: MissionScript, beat: Pick<ScriptBeat, 'id' | 'kind'>): ScriptText {
  if (beat.kind === 'arrival') return script.arrival;
  if (beat.kind === 'milestone') return script.milestones.find((m) => m.id === beat.id)!;
  return script.phases.find((p) => p.id === beat.id)!;
}
