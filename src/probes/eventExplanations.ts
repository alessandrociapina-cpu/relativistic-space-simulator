/**
 * Explicações dos eventos das missões, no formato do modo Explicar: resumo,
 * detalhes e fórmulas em TeX com os números calculados dos dados do JPL (ou
 * da reconstrução, nas Veneras). Os fatos que não saem da trajetória ficam nas
 * notas de cada evento.
 */
import type { Formula } from '../ui/explanations';
import { formatProse as num, formatSpan } from '../ui/format';
import { texDuration, texNumber as n, texText } from '../ui/tex';
import { BODIES, bodyState, type BodyId } from './bodies';
import { craft, LIGHT_DAY_AU, MISSIONS, MISSION_LIST, ofBody, type MissionEvent, type ProbeMission } from './missions';
import { SUN_RADIUS_KM } from './planets';
import {
  AU_KM,
  DAY_S,
  altitudeLabel,
  encounterState,
  firstEncounter,
  lightTimeS,
  probePosition,
  probeState,
  relativeState,
  solarEscapeKms,
  speedKms,
  type ProbeTrajectory,
} from './probes';
import { explainApolloEvent } from './apolloExplanations';
import { interpolateState } from './ephemeris';
import { formatDate, formatDateTime, isoToDays } from './time';
import { norm, sub } from './vec3';

export interface EventExplanation {
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly formulas: readonly Formula[];
}

const tex = String.raw;
const EARTH_ORBIT_KMS = 29.78;
const EARTH_RADIUS_KM = 6371;
const MOON_DISTANCE_KM = 384_400;
const ARCSEC = (180 / Math.PI) * 3600;
const kms = (x: number) => `${num(x)} km/s`;
const km = (x: number) => `${num(Math.round(x))} km`;
/** "880 km", "6,86 milhões de km", "6,6 bilhões de km". */
export const distanceText = (x: number) =>
  x < 1e6 ? km(x) : x < 1e9 ? `${num(x / 1e6)} milhões de km` : `${num(x / 1e9)} bilhões de km`;
const au = (x: number) => `${num(x)} UA`;
const percent = (x: number) => `${num(x * 100)}%`;

/** Distâncias e velocidades da sonda do evento (a companheira, se for o caso). */
function situation(event: MissionEvent) {
  const trajectory = craft(event.craft ?? event.probeId).trajectory;
  const t = Math.min(Math.max(event.t, trajectory.launch), trajectory.end);
  const state = probeState(trajectory, t)!;
  const p = state.position;
  const toEarth = norm(sub(p, bodyState('earth', t)!.position));
  const r = norm(p);
  return { trajectory, r, toEarth, speed: speedKms(state.velocity), escape: solarEscapeKms(r) };
}

const lightFormula = (toEarthAu: number): Formula => ({
  tex: tex`t_{\text{luz}} = \frac{d_\oplus}{c} = \frac{${n(toEarthAu * AU_KM)}\ \mathrm{km}}{299\,792\ \mathrm{km/s}} = ${texDuration(lightTimeS(toEarthAu))}`,
  note: 'Tempo para um sinal de rádio ir da Terra à sonda.',
});

const escapeFormula = (r: number, speed: number, escape: number): Formula => ({
  tex: tex`v_{\text{esc}} = \sqrt{\frac{2\mu_\odot}{r}} = ${n(escape)}\ \mathrm{km/s} \quad ${speed > escape ? '<' : '>'} \quad v = ${n(speed)}\ \mathrm{km/s}`,
  note: `A ${num(r)} UA do Sol. Acima da velocidade de escape, a sonda nunca volta.`,
});

/** Estado relativo em km e km/s. */
function relativeKm(trajectory: ProbeTrajectory, body: BodyId, t: number) {
  const s = relativeState(trajectory, body, t);
  return s ? { distance: norm(s.position) * AU_KM, speed: speedKms(s.velocity) } : null;
}

// ── Lançamento ───────────────────────────────────────────────────────────────
/** Excesso hiperbólico de saída da Terra (km/s), no fim da janela de partida. */
export function departureVInf(mission: ProbeMission): number {
  if (mission.venera) return mission.venera.departureVInfKms;
  const departure = mission.trajectory.encounters.find((e) => e.kind === 'departure')!;
  const state = encounterState(departure, departure.end);
  const v = speedKms(state.velocity);
  return Math.sqrt(v * v - (2 * BODIES.earth.gm) / (norm(state.position) * AU_KM));
}

/** Horas da injeção até a sonda ficar mais longe da Terra que a Lua. */
function hoursToMoonDistance(trajectory: ProbeTrajectory): number | null {
  for (let t = trajectory.launch; t < trajectory.launch + 5; t += 0.005) {
    const d = relativeKm(trajectory, 'earth', t);
    if (d && d.distance > MOON_DISTANCE_KM) return (t - trajectory.launch) * 24;
  }
  return null;
}

const LAUNCH_NOTES: Readonly<Record<string, string>> = {
  mariner10:
    'A Mariner 10 partiu num Atlas-Centaur rumo a Vênus: foi a primeira sonda a usar a gravidade de um planeta para chegar a outro, Mercúrio, que de outro modo exigiria um foguete muito maior.',
  viking1:
    'A Viking 1 partiu num Titan IIIE–Centaur com um orbitador e um módulo de pouso esterilizado em forno, para não levar micróbios da Terra a Marte.',
  viking2: 'A Viking 2, gêmea da primeira, partiu 20 dias depois na mesma janela de lançamento para Marte, que se abre a cada ~26 meses.',
  magellan:
    'A Magellan subiu no ônibus espacial Atlantis e partiu da órbita da Terra com um estágio IUS. Foi a primeira sonda planetária lançada por um ônibus espacial.',
  dawn: 'A Dawn partiu num Delta II. Leve, com três motores iônicos, ela ganharia mais velocidade com eles ao longo dos anos do que o foguete lhe deu.',
  venera7:
    'A Venera 7 partiu de Baikonur num foguete Molniya, na janela que se abre a cada 19 meses, quando Vênus fica na posição certa para uma viagem curta.',
  pioneer10:
    'A Pioneer 10 partiu do Cabo Canaveral num Atlas-Centaur com um terceiro estágio de combustível sólido: foi a sonda mais rápida lançada até então.',
  pioneer11: 'A Pioneer 11 partiu 13 meses depois da irmã, com o mesmo foguete e quase a mesma rota até Júpiter.',
  voyager2:
    'A Voyager 2 partiu da Flórida num foguete Titan IIIE–Centaur, para aproveitar um alinhamento de Júpiter, Saturno, Urano e Netuno que se repete a cada ~175 anos: o Grand Tour.',
  voyager1:
    'A Voyager 1 partiu 16 dias depois da irmã, numa trajetória mais rápida: chegou a Júpiter quatro meses antes, e por isso ficou com o número 1.',
  venera13: 'A Venera 13 partiu de Baikonur num foguete Próton, com a irmã Venera 14 cinco dias depois.',
  galileo:
    'A Galileo subiu no ônibus espacial Atlantis e partiu da órbita da Terra com um estágio IUS. Depois do acidente da Challenger, o estágio Centaur, mais potente, foi proibido no ônibus: a Galileo precisou de uma rota longa, com estilingues em Vênus e duas vezes na Terra.',
  cassini:
    'A Cassini partiu num Titan IVB–Centaur com cerca de 5,7 toneladas, a Huygens incluída: uma das maiores sondas interplanetárias. Pesada demais para ir direto, ela pegou impulso em Vênus (duas vezes), na Terra e em Júpiter.',
  rosetta:
    'A Rosetta partiu de Kourou, na Guiana Francesa, num Ariane 5. Para alcançar um cometa que vai até além de Júpiter, precisou de dez anos e de quatro estilingues: três na Terra e um em Marte.',
  newhorizons:
    'A New Horizons partiu num Atlas V com um terceiro estágio Star 48B, leve e com um foguete enorme: a maior velocidade de partida já dada a uma sonda.',
  juno: 'A Juno partiu num Atlas V. É movida a energia solar, com três painéis de ~9 m: em Júpiter a luz do Sol é ~27 vezes mais fraca que na Terra.',
  parker:
    'A Parker partiu num Delta IV Heavy. Chegar perto do Sol é difícil: a Terra anda a 30 km/s em torno dele, e cair até lá exige cancelar quase toda essa velocidade. Por isso a Parker usa Vênus como freio, sete vezes.',
};

function explainLaunch(event: MissionEvent, mission: ProbeMission): EventExplanation {
  const vInf = departureVInf(mission);
  const trajectory = mission.trajectory;
  const helio = speedKms(interpolateState(trajectory.helio!, trajectory.launch + 3).velocity);
  const hours = mission.venera ? null : hoursToMoonDistance(trajectory);
  const probes = MISSION_LIST.filter((m) => m.group === 'probe');
  const ranking = [...probes].sort((a, b) => departureVInf(b) - departureVInf(a)).findIndex((m) => m.id === mission.id);
  const inward = helio < EARTH_ORBIT_KMS;
  return {
    title: event.title,
    summary:
      `${LAUNCH_NOTES[mission.id] ?? ''} Longe da Terra, sobram ${kms(vInf)} além do necessário para escapar dela` +
      (ranking === 0 ? ': o maior excesso de velocidade entre as sondas deste simulador.' : '.'),
    details: [
      'A velocidade que resta depois de vencer a gravidade da Terra é o excesso hiperbólico v∞. Somado (como vetor) aos ' +
        `${num(EARTH_ORBIT_KMS)} km/s da órbita da Terra, ele dá a velocidade em torno do Sol: ${kms(helio)}` +
        (inward ? ', menos que a da Terra: para cair rumo ao Sol, a sonda sai "para trás".' : '.'),
      ...(hours !== null ? [`A sonda passou pela distância da Lua ${num(hours)} horas depois de deixar a órbita da Terra.`] : []),
      ...(mission.venera
        ? [
            'Os dados do JPL não incluem as Veneras: esta rota foi reconstruída pela mecânica orbital. O arco de Lambert é a cônica em ' +
              `torno do Sol que liga a Terra, na partida, a Vênus, na chegada, em ${num(mission.venera.entryT - mission.venera.departureT)} dias.`,
          ]
        : mission.reconstructed
          ? [
              `Os dados do JPL não incluem a ${mission.name}: esta rota foi reconstruída pela mecânica orbital, com arcos de Lambert ` +
                'entre os planetas nas datas da missão (scripts/reconstruct.mjs).',
            ]
          : []),
      ...(mission.id === 'magellan'
        ? ['A transferência é do tipo IV: uma volta e meia em torno do Sol antes de chegar a Vênus, 15 meses depois, para chegar mais devagar e gastar menos na freada.']
        : []),
    ],
    formulas: [
      { card: true, tex: tex`v_\infty = \sqrt{v^2 - \frac{2\mu_\oplus}{r}} = ${n(vInf)}\ \mathrm{km/s}` },
      { tex: tex`C_3 = v_\infty^2 = ${n(vInf * vInf)}\ \mathrm{km^2/s^2}`, note: 'A energia de lançamento usada no projeto de missões.' },
      { tex: tex`v_\odot = ${n(helio)}\ \mathrm{km/s} \quad (\text{Terra: } ${n(EARTH_ORBIT_KMS)}\ \mathrm{km/s})` },
    ],
  };
}

// ── Sobrevoos ────────────────────────────────────────────────────────────────
/** Fatos de cada sobrevoo que não saem da trajetória. */
const FLYBY_NOTES: Readonly<Record<string, string>> = {
  'pioneer10-jupiter':
    'A primeira visita a Júpiter. Os cinturões de radiação eram muito mais intensos que o esperado e quase danificaram os instrumentos; o estilingue pôs a Pioneer 10 em rota de fuga do Sistema Solar.',
  'pioneer11-jupiter':
    'A Pioneer 11 passou bem mais perto que a irmã, rápida para atravessar a radiação, e Júpiter a lançou de volta através do Sistema Solar, rumo a Saturno.',
  'pioneer11-saturn':
    'A primeira visita a Saturno: a Pioneer 11 descobriu o anel F e testou a travessia do plano dos anéis que as Voyagers fariam depois.',
  'voyager1-jupiter':
    'A Voyager 1 descobriu vulcões ativos em Io, o primeiro vulcanismo visto fora da Terra, e um anel fino em torno de Júpiter.',
  'voyager1-titan':
    'A rota passou rente a Titã para estudar sua atmosfera espessa, de nitrogênio. O preço: a manobra tirou a Voyager 1 do plano dos planetas, rumo ao norte; ela não visitaria mais nenhum.',
  'voyager1-saturn': 'Saturno curvou a rota da Voyager 1 para fora do plano dos planetas, já desviada por Titã horas antes.',
  'voyager2-jupiter': 'A Voyager 2 fotografou Europa de perto e acompanhou a Grande Mancha Vermelha.',
  'voyager2-saturn': 'Com o desvio em Saturno, a Voyager 2 seguiu para Urano, abrindo a segunda metade do Grand Tour.',
  'voyager2-uranus':
    'Até hoje é a única visita a Urano: a Voyager 2 descobriu 10 luas novas e um campo magnético muito inclinado em relação ao eixo de rotação.',
  'voyager2-neptune':
    'Também a única visita a Netuno: a Voyager 2 viu a Grande Mancha Escura. A passagem perto do polo norte a desviou para o sul do plano dos planetas.',
  'voyager2-triton':
    'Tritão gira em torno de Netuno no sentido contrário ao da rotação do planeta: provavelmente um objeto do cinturão de Kuiper capturado. A Voyager 2 viu gêiseres na superfície gelada, a −235 °C.',
  'galileo-venus': 'O primeiro estilingue da rota: Vênus acelerou a Galileo para o encontro com a Terra.',
  'galileo-earth':
    'Ao observar a Terra como se fosse um planeta desconhecido, a Galileo detectou sinais de vida: oxigênio, metano fora do equilíbrio químico e emissões de rádio artificiais.',
  'galileo-gaspra': 'O primeiro sobrevoo de perto de um asteroide: Gaspra, um bloco irregular de ~18 km.',
  'galileo-earth-2': 'O segundo estilingue na Terra deu o impulso final para Júpiter.',
  'galileo-ida': 'Ida, de ~60 km, guardava uma surpresa: Dáctilo, a primeira lua descoberta em torno de um asteroide.',
  'galileo-io': 'Horas antes de entrar em órbita, a Galileo passou rente a Io: a gravidade da lua ajudou a frear a sonda.',
  'galileo-ganymede': 'Neste sobrevoo a Galileo descobriu que Ganimedes tem campo magnético próprio, a única lua conhecida com um.',
  'galileo-europa':
    'O sobrevoo mais baixo de Europa. O magnetômetro indicou um oceano de água salgada sob o gelo, e é por ele que a Galileo foi destruída no fim da missão.',
  'cassini-venus': 'O primeiro dos quatro estilingues da Cassini.',
  'cassini-venus-2': 'O segundo sobrevoo de Vênus, a caminho da Terra.',
  'cassini-earth': 'A Terra deu à Cassini o impulso para Júpiter.',
  'cassini-jupiter': 'Longe de Júpiter, mas o bastante para o estilingue: a Cassini observou o planeta junto com a Galileo, que estava em órbita.',
  'cassini-titan':
    'O primeiro sobrevoo próximo de Titã: o radar começou a mapear a superfície escondida pela névoa. Foram 127 sobrevoos próximos de Titã, e a gravidade da lua era o volante que mudava a órbita da Cassini a cada passagem.',
  'cassini-enceladus':
    'O mergulho mais fundo nos gêiseres do polo sul de Encélado: a Cassini atravessou vapor e grãos de gelo de um oceano escondido sob a crosta e encontrou hidrogênio, um sinal de atividade hidrotermal.',
  'rosetta-earth': 'O primeiro dos quatro estilingues da Rosetta.',
  'rosetta-mars':
    'Em Marte, a Rosetta passou na sombra do planeta, sem luz para os painéis solares: sobreviveu cerca de 25 minutos com as baterias.',
  'rosetta-earth-2': 'O segundo estilingue na Terra.',
  'rosetta-steins':
    'Šteins, de ~5 km, parece um diamante lapidado. O trecho dos dados do JPL é uma previsão da ESA anterior ao sobrevoo; a passagem real foi a cerca de 800 km.',
  'rosetta-earth-3': 'O último estilingue: a Terra pôs a Rosetta na órbita do cometa.',
  'rosetta-lutetia': 'Lutécia, de ~100 km, é um dos maiores asteroides já visitados.',
  'newhorizons-jupiter': 'O estilingue em Júpiter encurtou a viagem a Plutão em cerca de três anos.',
  'newhorizons-pluto':
    'Plutão revelou montanhas de gelo de água, uma planície de nitrogênio congelado em forma de coração e névoas em camadas. A sonda não tinha como frear: passou direto e levou cerca de 16 meses para transmitir todos os dados.',
  'newhorizons-arrokoth':
    'O objeto mais distante e mais primitivo já visitado: dois lóbulos colados suavemente, como um boneco de neve achatado, quase intocado desde a formação do Sistema Solar.',
  'juno-earth': 'Dois anos depois do lançamento, a Juno voltou à Terra para o estilingue que a levou a Júpiter.',
  'juno-ganymede': 'O sobrevoo mais próximo de Ganimedes desde a Galileo, em 2000.',
  'juno-europa': 'A passagem mais próxima de Europa desde a Galileo: fotos de alta resolução do gelo rachado.',
  'juno-io': 'Os sobrevoos mais próximos de Io desde a Galileo: a lua mais vulcânica do Sistema Solar, aquecida pelas marés de Júpiter.',
  'juno-io-2': 'Este segundo sobrevoo de Io completou a sequência que encurtou a órbita da Juno.',
  'mariner10-venus':
    'O primeiro estilingue gravitacional da história: Vênus freou a Mariner 10 em relação ao Sol, e ela caiu até a órbita de Mercúrio. Na passagem, fotografou as nuvens de Vênus em ultravioleta.',
  'mariner10-mercury':
    'A primeira visita a Mercúrio, pelo lado noturno: crateras como as da Lua e um campo magnético inesperado. A órbita da sonda dura 176 dias, exatamente dois anos de Mercúrio, para reencontrá-lo.',
  'mariner10-mercury-2':
    'O segundo encontro, seis meses depois, passou bem mais longe, sobre o polo sul iluminado, para fotografar outra região. Correções de rota de poucos m/s mantinham o compasso com Mercúrio.',
  'mariner10-mercury-3':
    'A passagem mais baixa: a 327 km, para medir o campo magnético de perto e confirmar que ele é do próprio planeta. Ao todo, ~45% da superfície foi fotografada, pois nos três encontros o mesmo lado estava iluminado.',
  'dawn-mars': 'Marte desviou e freou a Dawn rumo ao cinturão de asteroides; a sonda passou a ~550 km da superfície com os motores iônicos desligados.',
};

function explainFlyby(event: MissionEvent, mission: ProbeMission): EventExplanation {
  const f = event.flyby!;
  const body = BODIES[f.body];
  const date = formatDate(event.t);
  const note = FLYBY_NOTES[event.id];
  const parkerNote =
    mission.id === 'parker'
      ? ['Cada passagem por Vênus tira velocidade da Parker em relação ao Sol, e o periélio seguinte fica mais perto dele.']
      : [];

  // Corpos pequenos: a gravidade não curva a rota.
  if (body.kind === 'asteroid' || body.kind === 'kbo') {
    const sun = norm(probePosition(mission.trajectory, f.closestT)!);
    return {
      title: event.title,
      summary:
        `Em ${date}, a ${mission.name} passa a ${km(f.closestKm)} de ${body.name}, a ${kms(f.relativeKms)}` +
        `, a ${au(sun)} do Sol. A gravidade de ${body.name} é fraca demais para desviar a sonda: o sobrevoo é só para observar.`,
      details: note ? [note] : [],
      formulas: [
        { card: true, tex: tex`d_{\min} = ${n(f.closestKm)}\ \mathrm{km}, \quad v_{\text{rel}} = ${n(f.relativeKms)}\ \mathrm{km/s}` },
        lightFormula(norm(sub(probePosition(mission.trajectory, f.closestT)!, bodyState('earth', f.closestT)!.position))),
      ],
    };
  }

  // Luas: o efeito aparece na órbita em torno do planeta.
  if (body.kind === 'moon') {
    const planet = BODIES[body.parent!];
    const periods = f.periodBeforeDays !== null && f.periodAfterDays !== null;
    return {
      title: event.title,
      summary:
        `Em ${date}, a ${mission.name} passa a ${km(f.altitudeKm)} da superfície de ${body.name}, a ${kms(f.relativeKms)}.` +
        (periods
          ? ` A gravidade da lua muda a órbita da sonda em torno de ${planet.name}: o período passa de ${num(f.periodBeforeDays!)} para ${num(f.periodAfterDays!)} dias.`
          : ` Em relação a ${planet.name}, a sonda passa de ${kms(f.speedBeforeKms)} para ${kms(f.speedAfterKms)}.`),
      details: [
        `É o mesmo estilingue dos planetas, em miniatura: ${body.name} anda a ${kms(f.bodySpeedKms)} em torno de ${planet.name}, e o desvio ` +
          `de ${num(f.predictedDeflectionDeg)}° na direção da sonda muda a energia da órbita.`,
        ...(note ? [note] : []),
      ],
      formulas: [
        {
          tex: tex`\sin\frac{\delta}{2} = \frac{1}{1 + r_p v_\infty^2/\mu} \;\Rightarrow\; \delta = ${n(f.predictedDeflectionDeg)}^\circ`,
          note: `r_p = ${km(f.closestKm)}, v∞ = ${kms(f.vInfKms)}, μ = ${num(body.gm)} km³/s².`,
        },
        ...(periods
          ? [
              {
                card: true,
                tex: tex`T = 2\pi\sqrt{\frac{a^3}{\mu_{\text{${planet.name}}}}}\colon\ ${n(f.periodBeforeDays!)} \to ${n(f.periodAfterDays!)}\ ${texText('dias')}`,
                note: 'Período da órbita em torno do planeta, pela energia antes e depois do sobrevoo.',
              },
            ]
          : []),
      ],
    };
  }

  const gain = f.speedAfterKms - f.speedBeforeKms;
  const deflection = f.deflectionDeg ?? f.predictedDeflectionDeg;
  // Plutão: massa pequena demais para um estilingue que se note.
  const effect =
    deflection < 1
      ? `${body.name} tem pouca massa: a gravidade mal desvia a trajetória, só ${num(deflection)}°, e a velocidade em relação ao Sol fica em ${kms(f.speedAfterKms)}.`
      : `A gravidade do planeta desvia a trajetória em ${num(deflection)}° e ${gain >= 0 ? 'acelera' : 'freia'} a sonda de ` +
        `${kms(f.speedBeforeKms)} para ${kms(f.speedAfterKms)} em relação ao Sol.`;
  return {
    title: event.title,
    summary:
      `Em ${date}, a ${mission.name} passa a ${km(f.closestKm)} do centro ${ofBody(f.body)} ` +
      `(${km(f.altitudeKm)} ${altitudeLabel(f.body)}). ${effect}`,
    details: [
      'No referencial do planeta, a sonda entra e sai com a mesma velocidade v∞: o sobrevoo só muda a direção. ' +
        `Mas ${body.name} anda a ${kms(f.bodySpeedKms)} em torno do Sol, e somar essa velocidade à direção ` +
        `nova muda a velocidade em relação ao Sol. É o estilingue gravitacional${gain < 0 ? ', aqui usado como freio' : ''}.`,
      'A energia vem do próprio planeta, que perde (ou ganha) uma fração desprezível da sua velocidade orbital.',
      ...(f.deflectionDeg !== null
        ? [
            `A fórmula da hipérbole prevê a deflexão a partir de r_p, v∞ e da massa do planeta: ${num(f.predictedDeflectionDeg)}°, ` +
              `contra ${num(f.deflectionDeg)}° medidos na trajetória do JPL.`,
          ]
        : []),
      ...parkerNote,
      ...(note ? [note] : []),
    ],
    formulas: [
      {
        tex: tex`\sin\frac{\delta}{2} = \frac{1}{1 + r_p v_\infty^2/\mu} \;\Rightarrow\; \delta = ${n(f.predictedDeflectionDeg)}^\circ`,
        ...(f.deflectionDeg !== null ? { note: `Nos dados do JPL: δ = ${num(f.deflectionDeg)}°.` } : {}),
      },
      {
        tex: tex`r_p = ${n(f.closestKm)}\ \mathrm{km}, \quad v_\infty = ${n(f.vInfKms)}\ \mathrm{km/s}, \quad \mu = ${n(body.gm)}\ \mathrm{km^3/s^2}`,
      },
      {
        card: true,
        tex: tex`|\vec V_{\text{planeta}} + \vec v_\infty|\colon\ ${n(f.speedBeforeKms)} \to ${n(f.speedAfterKms)}\ \mathrm{km/s}\ \ (${gain >= 0 ? '+' : ''}${n(gain)})`,
      },
    ],
  };
}

// ── Inserção em órbita ───────────────────────────────────────────────────────
const CAPTURE_NOTES: Readonly<Record<string, string>> = {
  galileo:
    'A freada somou o sobrevoo de Io, horas antes, e cerca de 49 minutos de motor. Ao mesmo tempo, a Galileo retransmitia os dados da sonda atmosférica, que mergulhava em Júpiter.',
  cassini:
    'Para entrar em órbita, a Cassini atravessou o plano dos anéis duas vezes, por uma brecha entre os anéis F e G, e ligou o motor por 96 minutos.',
  juno:
    'A Juno ligou o motor por 35 minutos. O plano de encurtar depois a órbita para 14 dias foi cancelado por causa de uma válvula de hélio lenta: a Juno seguiu na órbita de 53 dias.',
  viking1:
    'Depois, um ajuste no periapse deixou a órbita com período de ~1 sol (24,6 h): a cada volta a sonda passa sobre a mesma região de Marte. O pouso marcado para 4 de julho foi adiado: as fotos mostraram que o local era acidentado demais.',
  viking2: 'A órbita foi ajustada para ~1 sol e, mais tarde, inclinada até 75° para fotografar as regiões polares.',
  magellan:
    'Um motor de combustível sólido Star 48B queimou por 83 segundos. A órbita quase polar fica fixa no espaço enquanto Vênus gira por baixo, uma volta a cada 243 dias: em oito meses o radar viu o planeta inteiro.',
};

function explainCapture(event: MissionEvent, mission: ProbeMission): EventExplanation {
  const c = event.capture!;
  const body = BODIES[c.body];
  return {
    title: event.title,
    summary:
      `Em ${formatDateTime(event.t)}, a ${mission.name} passa a ${km(c.altitudeKm)} ${altitudeLabel(c.body)} ${ofBody(c.body)} e freia ` +
      `${num(c.deltaVKms * 1000)} m/s. Chegou com ${kms(c.vInfKms)} de sobra, rápida demais para ficar; depois da freada, fica presa numa ` +
      `órbita de ${num(c.periodDays)} dias que vai até ${distanceText(c.apoapsisKm)} do planeta.`,
    details: [
      'Quem decide se a sonda fica é a energia da órbita, ε = v²/2 − μ/r: positiva, a sonda passa e vai embora numa hipérbole; ' +
        'negativa, fica presa numa elipse. Frear no ponto mais baixo, onde a sonda é mais rápida, é o que dá mais efeito por ' +
        'quilo de combustível (o efeito Oberth).',
      ...(CAPTURE_NOTES[mission.id] ? [CAPTURE_NOTES[mission.id]!] : []),
    ],
    formulas: [
      { tex: tex`\varepsilon = \frac{v^2}{2} - \frac{\mu}{r}\colon\ ${n((c.vInfKms * c.vInfKms) / 2)} \to ${n(-body.gm / (c.apoapsisKm + c.periapsisKm))}\ \mathrm{km^2/s^2}` },
      { card: true, tex: tex`T = 2\pi\sqrt{\frac{a^3}{\mu}} = ${n(c.periodDays)}\ ${texText('dias')}, \quad a = ${n((c.apoapsisKm + c.periapsisKm) / 2)}\ \mathrm{km}` },
      {
        tex: tex`\Delta v = \sqrt{v_\infty^2 + \frac{2\mu}{r_p}} - \sqrt{\mu\left(\frac{2}{r_p} - \frac{1}{a}\right)} = ${n(c.deltaVKms * 1000)}\ \mathrm{m/s}`,
        note: 'Freada instantânea no periapse; a real, de vários minutos, gasta um pouco mais.',
      },
    ],
  };
}

// ── Chegada ao cometa ────────────────────────────────────────────────────────
function explainArrival(event: MissionEvent, mission: ProbeMission): EventExplanation {
  if (mission.id === 'dawn') return explainDawnArrival(event, mission);
  const rel = relativeKm(mission.trajectory, event.body!, event.t)!;
  const gm = BODIES[event.body!].gm;
  const escape = Math.sqrt((2 * gm) / rel.distance) * 1000;
  const sun = norm(probePosition(mission.trajectory, event.t)!);
  return {
    title: event.title,
    summary:
      `Em ${formatDate(event.t)}, depois de dez anos e 6,4 bilhões de km, a Rosetta chega a ${km(rel.distance)} do cometa 67P, ` +
      `a ${au(sun)} do Sol, andando a ${num(rel.speed * 1000)} m/s em relação a ele. É a primeira sonda a acompanhar um cometa.`,
    details: [
      `A gravidade do cometa, um bloco de ~4 km, é tão fraca que a velocidade de escape a essa distância é de ${num(escape * 100)} cm/s. ` +
        'Nas primeiras semanas a Rosetta voou em triângulos, com pequenas queimas nos vértices; depois desceu para órbitas lentas, ' +
        'de dias, a poucas dezenas de km.',
      'Lá de perto, o "pato de borracha": dois lóbulos ligados por um pescoço, coberto de poeira escura, penhascos e buracos.',
    ],
    formulas: [
      { card: true, tex: tex`v_{\text{esc}} = \sqrt{\frac{2\mu}{r}} = ${n(escape * 100)}\ \mathrm{cm/s}, \quad \mu = ${n(gm * 1e9)}\ \mathrm{m^3/s^2}` },
      lightFormula(norm(sub(probePosition(mission.trajectory, event.t)!, bodyState('earth', event.t)!.position))),
    ],
  };
}

/** Dawn chega a Vesta ou a Ceres: captura lenta, com o motor iônico, sem freada brusca. */
function explainDawnArrival(event: MissionEvent, mission: ProbeMission): EventExplanation {
  const body = BODIES[event.body!];
  const rel = relativeKm(mission.trajectory, event.body!, event.t)!;
  const escape = Math.sqrt((2 * body.gm) / rel.distance);
  const isVesta = event.body === 'vesta';
  const sun = norm(probePosition(mission.trajectory, event.t)!);
  return {
    title: event.title,
    summary:
      `Em ${formatDate(event.t)}, a ${au(sun)} do Sol, a Dawn é capturada por ${body.name} a ${km(rel.distance)} do centro, andando a ` +
      `${num(rel.speed * 1000)} m/s em relação a ${isVesta ? 'ele' : 'ela'}. ` +
      (isVesta
        ? 'Vesta, de ~525 km, é o segundo maior corpo do cinturão de asteroides e a origem de ~6% dos meteoritos que caem na Terra.'
        : 'Ceres, de ~940 km, é o maior corpo do cinturão de asteroides e um planeta anão: a Dawn foi a primeira sonda a orbitar dois corpos além da Terra.'),
    details: [
      'Não há freada no periapse, como nas inserções em órbita de planetas: o motor iônico, de empuxo minúsculo (~90 mN, o peso de uma folha de papel), ' +
        'foi igualando aos poucos a velocidade da Dawn à do asteroide, e ela entrou em órbita quase parada em relação a ele.',
      'Depois, a sonda desceu em espiral por órbitas cada vez mais baixas, de ~2 700 km a ~200 km de altitude, mapeando a superfície e o campo gravitacional.',
      ...(isVesta
        ? ['A Dawn encontrou em Vesta uma cratera de impacto gigante no polo sul, Rheasilvia, com um pico central de ~22 km de altura.']
        : ['Em Ceres, manchas brilhantes na cratera Occator: sais de carbonato deixados por salmoura que subiu do interior.']),
    ],
    formulas: [
      { card: true, tex: tex`v_{\text{esc}} = \sqrt{\frac{2\mu}{r}} = ${n(escape * 1000)}\ \mathrm{m/s}, \quad \mu = ${n(body.gm)}\ \mathrm{km^3/s^2}` },
      lightFormula(norm(sub(probePosition(mission.trajectory, event.t)!, bodyState('earth', event.t)!.position))),
    ],
  };
}

// ── Separação, entrada, pouso e fim ──────────────────────────────────────────
function explainRelease(event: MissionEvent, mission: ProbeMission): EventExplanation {
  if (event.craft === 'viking1-lander' || event.craft === 'viking2-lander') {
    const lander = craft(event.craft);
    const info = mission.companions[0]?.info ?? {};
    const rel = relativeKm(lander.trajectory, 'mars', event.t)!;
    const landing = mission.events.find((e) => e.kind === 'landing')!;
    const dv = Number(info['deorbitDeltaVKms']) * 1000;
    return {
      title: event.title,
      summary:
        `Em ${formatDateTime(event.t)}, a ${km(rel.distance - BODIES.mars.radiusKm)} de altitude, o módulo de pouso se separa do orbitador e ` +
        `freia ${num(dv)} m/s para cair em direção a Marte. A queda até o topo da atmosfera e a descida levam ${formatSpan((landing.t - event.t) * DAY_S)}.`,
      details: [
        'O módulo descia dentro de uma cápsula com escudo de calor. Na reconstrução, a queda é o arco de Lambert entre o ponto de separação e o topo da atmosfera, atrás do local de pouso.',
      ],
      formulas: [{ card: true, tex: tex`\Delta v_{\text{saída de órbita}} = ${n(dv)}\ \mathrm{m/s}` }],
    };
  }
  const companion = craft(event.craft!);
  const isHuygens = event.craft === 'huygens';
  const target: BodyId = isHuygens ? 'titan' : 'jupiter';
  const arrival = isHuygens ? MISSIONS.cassini.events.find((e) => e.id === 'cassini-huygens-landing')! : MISSIONS.galileo.events.find((e) => e.id === 'galileo-entry')!;
  const distance = relativeKm(companion.trajectory, target, event.t)!.distance;
  return {
    title: event.title,
    summary:
      `Em ${formatDate(event.t)}, a ${mission.name} solta ${isHuygens ? 'a Huygens' : 'a sonda atmosférica'}, a ${distanceText(distance)} ` +
      `${ofBody(target)}. Sem motor, ela segue sozinha a mesma cônica até a chegada, ${formatSpan((arrival.t - event.t) * DAY_S)} depois.`,
    details: isHuygens
      ? [
          'A Huygens, da ESA, não tinha motor: a Cassini mirou Titã com antecedência e a soltou girando, como um pião, para manter a direção.',
          'Dias depois, a Cassini manobrou para não seguir a Huygens e passar a ~60 000 km de Titã, recebendo os dados da descida.',
        ]
      : [
          'A sonda atmosférica não tinha motor nem receptor: só um transmissor, baterias e seis instrumentos. A Galileo a apontou para ' +
            'Júpiter cinco meses antes e depois corrigiu a própria rota para não segui-la.',
        ],
    formulas: [{ card: true, tex: tex`d = ${n(distance)}\ \mathrm{km}, \quad \Delta t = ${texDuration((arrival.t - event.t) * DAY_S)}` }],
  };
}

/** Rotação de Júpiter no equador (km/s): 2πR em 9 h 55 min. */
const JUPITER_EQUATOR_KMS = (2 * Math.PI * 71_492) / (9.925 * 3600);

function explainEntry(event: MissionEvent): EventExplanation {
  const companion = craft(event.craft!);
  const rel = relativeKm(companion.trajectory, 'jupiter', companion.trajectory.end)!;
  const altitude = rel.distance - BODIES.jupiter.radiusKm;
  const airSpeed = rel.speed - JUPITER_EQUATOR_KMS;
  return {
    title: event.title,
    summary:
      `Em ${formatDateTime(event.t)}, a sonda atmosférica da Galileo entra em Júpiter a ${kms(rel.speed)} em relação ao centro do ` +
      `planeta. Como ela chega perto do equador, no sentido da rotação, o choque com o ar é a ~${kms(airSpeed)}: ainda assim a entrada ` +
      'mais rápida já feita por um objeto humano, com um plasma de ~14 000 K à frente do escudo de calor.',
    details: [
      'Depois da freada, de centenas de g, um paraquedas abriu e a sonda desceu transmitindo para a Galileo por 58 minutos, até a ' +
        'pressão e o calor a calarem, a cerca de 23 vezes a pressão do ar na Terra.',
      'Ela mediu ventos de centenas de km/h, menos água do que se esperava e a composição do hidrogênio e do hélio de Júpiter.',
      `Quase toda essa velocidade é a queda no poço gravitacional de Júpiter: a ${km(altitude)} das nuvens, a velocidade de escape é ` +
        `${kms(Math.sqrt((2 * BODIES.jupiter.gm) / rel.distance))}.`,
    ],
    formulas: [
      {
        card: true,
        tex: tex`v = \sqrt{v_\infty^2 + \frac{2\mu_{\text{J}}}{r}} \approx ${n(rel.speed)}\ \mathrm{km/s}`,
        note: `Nos dados do JPL, a ${km(altitude)} acima das nuvens.`,
      },
      {
        tex: tex`v_{\text{ar}} \approx v - \frac{2\pi R_{\text{J}}}{9{,}93\ \mathrm{h}} = ${n(rel.speed)} - ${n(JUPITER_EQUATOR_KMS)} = ${n(airSpeed)}\ \mathrm{km/s}`,
        note: 'A atmosfera gira com o planeta: no equador, a 12,6 km/s.',
      },
    ],
  };
}

function explainLanding(event: MissionEvent, mission: ProbeMission): EventExplanation {
  if (mission.venera) {
    const rec = mission.venera;
    const v7 = mission.id === 'venera7';
    return {
      title: event.title,
      summary: v7
        ? `Em ${formatDateTime(event.t)}, a Venera 7 pousa em Vênus e transmite do solo por 23 minutos: os primeiros dados vindos da ` +
          'superfície de outro planeta. Mediu ~475 °C e ~90 vezes a pressão do ar na Terra.'
        : `Em ${formatDateTime(event.t)}, a Venera 13 pousa em Vênus e resiste ${formatSpan(127 * 60)} (o projeto previa 32 minutos): ` +
          'tirou as primeiras fotos coloridas da superfície, gravou o som do vento e analisou o solo, parecido com basalto.',
      details: [
        `Na reconstrução, a cápsula chega com v∞ = ${kms(rec.arrivalVInfKms)} e cai no poço gravitacional de Vênus até ` +
          `${kms(rec.entrySpeedKms)} na entrada da atmosfera, a 125 km de altitude.`,
        v7
          ? 'O sinal chegou 100 vezes mais fraco que o esperado, provavelmente porque a cápsula tombou de lado; só uma nova análise das ' +
            'gravações, semanas depois, confirmou que ela tinha transmitido do solo.'
          : 'A cápsula foi resfriada antes da entrada e desceu blindada como um submarino: a 457 °C e 89 bar, todo eletrônico acaba cozinhando.',
      ],
      formulas: [
        { card: true, tex: tex`v_{\text{entrada}} = \sqrt{v_\infty^2 + \frac{2\mu_{\text{V}}}{r}} = ${n(rec.entrySpeedKms)}\ \mathrm{km/s}` },
        {
          tex: tex`v_\infty^{\text{saída}} = ${n(rec.departureVInfKms)}, \quad v_\infty^{\text{chegada}} = ${n(rec.arrivalVInfKms)}\ \mathrm{km/s}`,
          note: 'Do arco de Lambert entre a Terra e Vênus nas datas da missão.',
        },
      ],
    };
  }
  if (event.craft === 'viking1-lander' || event.craft === 'viking2-lander') {
    const info = mission.companions[0]?.info ?? {};
    const entry = Number(info['entrySpeedKms']);
    const toEarth = norm(sub(probePosition(craft(event.craft).trajectory, event.t)!, bodyState('earth', event.t)!.position));
    const v1 = event.craft === 'viking1-lander';
    return {
      title: event.title,
      summary: v1
        ? `Em ${formatDateTime(event.t)}, o módulo da Viking 1 pousa em Chryse Planitia: o primeiro pouso bem-sucedido em Marte, ` +
          'e as primeiras fotos da superfície, um deserto de pedras sob um céu cor de salmão.'
        : `Em ${formatDateTime(event.t)}, o módulo da Viking 2 pousa em Utopia Planitia, mais ao norte, onde depois veria geada no inverno marciano.`,
      details: [
        `A cápsula entra na atmosfera a ${kms(entry)}; o escudo de calor freia até ~250 m/s, um paraquedas abre a ~6 km e, no fim, três ` +
          'retrofoguetes levam o módulo ao solo a ~2,4 m/s.',
        'Os dois módulos procuraram vida no solo com três experimentos biológicos. Os resultados foram ambíguos, e até hoje se discute se a química do solo os explica.',
        'O sinal levava ' + formatSpan(lightTimeS(toEarth)) + ' para chegar à Terra: tudo no pouso era automático.',
      ],
      formulas: [
        { card: true, tex: tex`v_{\text{entrada}} = ${n(entry)}\ \mathrm{km/s}` },
        lightFormula(toEarth),
      ],
    };
  }
  if (event.craft === 'huygens') {
    const toEarth = norm(sub(probePosition(craft('huygens').trajectory, event.t)!, bodyState('earth', event.t)!.position));
    return {
      title: event.title,
      summary:
        `Em ${formatDateTime(event.t)}, depois de 2 h 27 min de descida de paraquedas, a Huygens pousa em Titã: o pouso mais distante ` +
        `da Terra até hoje, a ${au(toEarth)}.`,
      details: [
        'Na descida, a câmera viu canais de drenagem e um litoral: Titã tem chuva e rios, mas de metano, a −180 °C.',
        'Pousou num chão úmido e macio, entre seixos de gelo de água, e transmitiu do solo por 72 minutos, até a Cassini sumir no horizonte.',
      ],
      formulas: [lightFormula(toEarth)],
    };
  }
  // Philae
  const release = isoToDays('2014-11-12T08:35Z');
  const rel = relativeKm(mission.trajectory, 'comet67p', release)!;
  return {
    title: event.title,
    summary:
      `Em ${formatDateTime(event.t)}, o Philae pousa no cometa 67P, o primeiro pouso num cometa. Solto pela Rosetta a ${km(rel.distance)} ` +
      'do centro, desceu sete horas sem motor.',
    details: [
      'Os arpões que deviam prendê-lo não dispararam: com gravidade quase nula, o Philae quicou duas vezes e parou na sombra de um ' +
        'penhasco. Trabalhou ~60 horas com a bateria, mandou os dados e adormeceu; deu sinal de novo em junho de 2015.',
    ],
    formulas: [{ card: true, tex: tex`d_{\text{separação}} = ${n(rel.distance)}\ \mathrm{km}, \quad v_{\text{Rosetta}} = ${n(rel.speed * 1000)}\ \mathrm{m/s}` }],
  };
}

function explainEnd(event: MissionEvent, mission: ProbeMission): EventExplanation {
  const trajectory = mission.trajectory;
  const final = firstEncounter(trajectory, event.body!);
  const state = final ? encounterState(final, trajectory.end) : null;
  const speed = state ? speedKms(state.velocity) : 0;
  const toEarth = norm(sub(probePosition(trajectory, trajectory.end)!, bodyState('earth', trajectory.end)!.position));
  if (mission.id === 'viking1' || mission.id === 'viking2') {
    const v1 = mission.id === 'viking1';
    return {
      title: event.title,
      summary:
        `Em ${formatDate(event.t)}, sem gás para controlar a orientação, o orbitador da ${mission.name} é desligado depois de ` +
        `${formatSpan((event.t - mission.launchT) * DAY_S)} de missão. ` +
        (v1 ? 'Antes, foi posto numa órbita mais alta, para não cair em Marte antes de 2019.' : 'Ele segue em órbita de Marte, mudo.'),
      details: [
        'Os dois orbitadores fotografaram Marte inteiro com resolução de até ~150 m: vales de rios secos, vulcões gigantes e calotas polares. Também retransmitiam os dados dos módulos de pouso.',
      ],
      formulas: [lightFormula(toEarth)],
    };
  }
  if (mission.id === 'magellan') {
    return {
      title: event.title,
      summary:
        `Em ${formatDateTime(event.t)}, a Magellan perde contato depois de mergulhar de propósito na atmosfera de Vênus, a ${kms(speed)}: ` +
        'um último experimento para medir a densidade do ar em grande altitude. Ela se desintegrou nos dias seguintes.',
      details: [
        'Em quatro anos, o radar mapeou 98% da superfície de Vênus, escondida sob nuvens permanentes: planícies vulcânicas, coroas, crateras pouco erodidas e quase nenhum sinal de placas tectônicas.',
      ],
      formulas: [lightFormula(toEarth), { card: true, tex: tex`v = ${n(speed)}\ \mathrm{km/s}`, note: 'Velocidade em relação a Vênus no fim da reconstrução.' }],
    };
  }
  if (mission.id === 'dawn') {
    const ceres = relativeKm(trajectory, 'ceres', event.t);
    return {
      title: event.title,
      summary:
        `Em ${formatDate(event.t)}, a Dawn esgota a hidrazina dos propulsores de orientação e não consegue mais apontar a antena para a Terra. ` +
        'Ela fica numa órbita estável em torno de Ceres, escolhida para não cair no planeta anão por décadas.',
      details: [
        'Ceres tem gelo e talvez salmoura no subsolo: a órbita alta protege o planeta anão de contaminação com micróbios da Terra.',
        ...(ceres ? [`No fim dos dados do JPL, a sonda estava a ${km(ceres.distance)} do centro de Ceres.`] : []),
      ],
      formulas: [lightFormula(toEarth)],
    };
  }
  if (mission.id === 'rosetta') {
    return {
      title: event.title,
      summary:
        `Em ${formatDateTime(event.t)}, a Rosetta encerra a missão pousando devagar no cometa, a ${num(speed * 1000)} m/s, tirando fotos ` +
        'até o fim. O cometa se afastava do Sol e a luz já não bastava para os painéis solares.',
      details: [`O pouso foi na região Ma’at, perto de poços ativos. O último sinal levou ${formatSpan(lightTimeS(toEarth))} para chegar à Terra.`],
      formulas: [lightFormula(toEarth)],
    };
  }
  const isGalileo = mission.id === 'galileo';
  return {
    title: event.title,
    summary:
      `Em ${formatDateTime(event.t)}, sem combustível, a ${mission.name} mergulha ${ofBody(event.body!)} a ${kms(speed)} e se desintegra. ` +
      (isGalileo
        ? 'Foi de propósito: para nunca cair em Europa, onde a sonda tinha encontrado indícios de um oceano, e contaminá-la com micróbios da Terra.'
        : 'Foi de propósito: para nunca cair em Encélado ou Titã, onde pode haver ambientes habitáveis, e contaminá-los com micróbios da Terra.'),
    details: [
      isGalileo
        ? 'Em 34 órbitas, a Galileo descobriu os indícios do oceano de Europa, o campo magnético de Ganimedes e vulcões em atividade em Io, com uma antena de ganho baixo: a principal nunca abriu.'
        : 'Até o último segundo, a Cassini mandou dados da atmosfera de Saturno. O sinal chegou à Terra com o atraso da luz, quando a sonda já não existia.',
    ],
    formulas: [
      lightFormula(toEarth),
      { card: true, tex: tex`v = ${n(speed)}\ \mathrm{km/s}`, note: `Velocidade em relação a ${BODIES[event.body!].name} no fim dos dados do JPL.` },
    ],
  };
}

// ── Último contato e periélio ────────────────────────────────────────────────
function explainLastContact(event: MissionEvent, mission: ProbeMission): EventExplanation {
  const { r, toEarth, speed, escape } = situation(event);
  if (mission.id === 'mariner10') {
    const tcm = (mission.info?.['tcmMs'] as number[] | undefined) ?? [];
    return {
      title: event.title,
      summary:
        `Em ${formatDateTime(event.t)}, sem nitrogênio para controlar a orientação, a Mariner 10 recebe o comando de desligar o transmissor. ` +
        `Ela segue a ${au(r)} do Sol, na órbita de 176 dias que a faz reencontrar Mercúrio a cada duas voltas dele.`,
      details: [
        'Foi a única sonda a visitar Mercúrio até a MESSENGER, em 2008.',
        ...(tcm.length
          ? [`Na reconstrução, cada volta de 176 dias precisou de uma correção de ${tcm.map((x) => `${num(x)} m/s`).join(' e ')} para reencontrar Mercúrio no dia certo.`]
          : []),
      ],
      formulas: [lightFormula(toEarth), escapeFormula(r, speed, escape)],
    };
  }
  if (event.craft === 'viking1-lander' || event.craft === 'viking2-lander') {
    const landing = mission.events.find((e) => e.kind === 'landing')!;
    const v1 = event.craft === 'viking1-lander';
    return {
      title: event.title,
      summary:
        `Em ${formatDate(event.t)}, depois de ${formatSpan((event.t - landing.t) * DAY_S)} na superfície, a Terra perde contato com o módulo de ` +
        `pouso da ${mission.name}. ` +
        (v1 ? 'Um comando errado apagou a orientação da antena.' : 'A bateria falhou.'),
      details: ['Os módulos mediram o tempo de Marte por anos: temperatura, pressão (que varia com as estações, quando parte da atmosfera congela nos polos) e ventos.'],
      formulas: [lightFormula(toEarth)],
    };
  }
  const p10 = mission.id === 'pioneer10';
  return {
    title: event.title,
    summary: p10
      ? `Em ${formatDate(event.t)}, a ${au(r)} do Sol, a Terra recebe o último sinal da Pioneer 10, já fraco demais para trazer dados. ` +
        'A sonda segue rumo à região de Aldebarã, que alcançaria em cerca de 2 milhões de anos.'
      : `Em ${formatDate(event.t)}, a ${au(r)} do Sol, a energia da Pioneer 11 já não dá para operar os instrumentos, e a NASA encerra ` +
        'os contatos. Ela segue rumo à constelação de Águia.',
    details: [
      'As Pioneers carregam uma placa de ouro com um homem, uma mulher e a posição do Sol entre os pulsares: uma mensagem para quem a encontrar.',
      'Nas duas surgiu uma freada inexplicada de ~10⁻⁹ m/s², a "anomalia das Pioneers". Em 2012 ela foi explicada: era o calor dos ' +
        'geradores nucleares, irradiado mais para um lado da sonda, empurrando-a de leve.',
    ],
    formulas: [lightFormula(toEarth), escapeFormula(r, speed, escape)],
  };
}

function explainPerihelion(event: MissionEvent): EventExplanation {
  const p = event.perihelion!;
  const solarRadii = p.distanceKm / SUN_RADIUS_KM;
  const flux = (AU_KM / p.distanceKm) ** 2;
  return {
    title: event.title,
    summary:
      `Em ${formatDateTime(event.t)}, a Parker passa a ${distanceText(p.distanceKm - SUN_RADIUS_KM)} da superfície do Sol ` +
      `(${num(solarRadii)} raios solares do centro), a ${kms(p.speedKms)}: o objeto mais rápido e o que mais se aproximou do Sol já feito pelo homem.`,
    details: [
      `Ali a luz do Sol é ${num(flux)} vezes mais intensa que na Terra. O escudo de carbono, de 11 cm, chega a cerca de 1 400 °C ` +
        'na face voltada para o Sol, enquanto os instrumentos atrás dele ficam perto da temperatura ambiente.',
      `A órbita leva ${num(p.periodDays)} dias, como a de Mercúrio, e a velocidade no periélio sai da conservação de energia: quanto ` +
        'mais perto do Sol, mais rápido.',
    ],
    formulas: [
      { card: true, tex: tex`v = \sqrt{\mu_\odot\left(\frac{2}{r} - \frac{1}{a}\right)} = ${n(p.speedKms)}\ \mathrm{km/s}` },
      { tex: tex`\frac{F}{F_\oplus} = \left(\frac{1\ \text{UA}}{r}\right)^2 = ${n(flux)}, \quad r = ${n(solarRadii)}\,R_\odot` },
    ],
  };
}

// ── Marcos sem trajetória própria ────────────────────────────────────────────
function explainMilestone(event: MissionEvent, mission: ProbeMission): EventExplanation {
  const { r, toEarth } = situation(event);
  const sunlight = 1 / (r * r);
  switch (event.id) {
    case 'galileo-sl9': {
      const toJupiter = norm(sub(probePosition(mission.trajectory, event.t)!, bodyState('jupiter', event.t)!.position));
      return {
        title: event.title,
        summary:
          'Em julho de 1994, os fragmentos do cometa Shoemaker–Levy 9, despedaçado por Júpiter dois anos antes, caíram no planeta ' +
          `no lado oposto à Terra. A Galileo, a ${au(toJupiter)} de Júpiter, era o único observatório com visão direta dos impactos.`,
        details: ['Foi a primeira colisão entre corpos do Sistema Solar observada de perto. As manchas escuras dos impactos duraram meses.'],
        formulas: [lightFormula(toEarth)],
      };
    }
    case 'cassini-grand-finale': {
      const state = relativeState(mission.trajectory, 'saturn', event.t + 3)!;
      const { r: rr, v } = { r: norm(state.position) * AU_KM, v: speedKms(state.velocity) };
      const energy = (v * v) / 2 - BODIES.saturn.gm / rr;
      const periodDays = (2 * Math.PI * Math.sqrt((-BODIES.saturn.gm / (2 * energy)) ** 3 / BODIES.saturn.gm)) / DAY_S;
      return {
        title: event.title,
        summary:
          'Com o combustível acabando, a Cassini começa o Grand Finale: 22 mergulhos pela brecha de ~2 000 km entre os anéis e as ' +
          `nuvens de Saturno, onde nenhuma sonda tinha passado, em órbitas de ${num(periodDays)} dias.`,
        details: [
          'Nas passagens, a Cassini mediu a massa dos anéis e o campo gravitacional de Saturno por dentro, e provou partículas dos anéis caindo no planeta.',
        ],
        formulas: [{ card: true, tex: tex`T = 2\pi\sqrt{\frac{a^3}{\mu_{\text{S}}}} = ${n(periodDays)}\ ${texText('dias')}` }],
      };
    }
    case 'rosetta-hibernation':
    case 'rosetta-wake-up': {
      const sleeping = event.id === 'rosetta-hibernation';
      return {
        title: event.title,
        summary: sleeping
          ? `Em ${formatDate(event.t)}, a ${au(r)} do Sol, a Rosetta desliga quase tudo e hiberna por 31 meses: a luz ali é ` +
            `${percent(sunlight)} da que chega à Terra, pouco para os painéis solares manterem a sonda acordada.`
          : `Em ${formatDate(event.t)}, a ${au(r)} do Sol e voltando, o despertador interno religa a Rosetta. Depois de horas de ` +
            'espera, o primeiro sinal chega à Terra: a sonda sobreviveu à hibernação.',
        details: ['Só os aquecedores e um relógio ficaram ligados. A sonda girava devagar para se estabilizar, sem contato com a Terra.'],
        formulas: [{ card: true, tex: tex`\frac{F}{F_\oplus} = \left(\frac{1\ \text{UA}}{r}\right)^2 = ${n(sunlight)}, \quad r = ${n(r)}\ \text{UA}` }],
      };
    }
    case 'rosetta-comet-perihelion': {
      const comet = norm(bodyState('comet67p', event.t)!.position);
      const rel = relativeKm(mission.trajectory, 'comet67p', event.t)!;
      return {
        title: event.title,
        summary:
          `Em ${formatDate(event.t)}, o cometa passa o ponto mais perto do Sol, a ${au(comet)}. Aquecido, solta gás e poeira em jatos, ` +
          `e a Rosetta acompanha de longe, a ${km(rel.distance)}, para não ser atingida pelos grãos.`,
        details: [
          'Na época da atividade máxima, o cometa perdia toneladas de gelo e poeira por segundo. A Rosetta mediu a água dele, com uma ' +
            'proporção de deutério diferente da dos oceanos da Terra.',
        ],
        formulas: [lightFormula(toEarth)],
      };
    }
    case 'newhorizons-moon-orbit': {
      const hours = (event.t - mission.trajectory.launch) * 24;
      return {
        title: event.title,
        summary: `${num(hours)} horas depois de deixar a órbita da Terra, a New Horizons passa pela distância da Lua, que a Apollo levava três dias para cruzar.`,
        details: ['Não houve encontro com a Lua: ela estava em outro ponto da órbita. A sonda seguia para um estilingue em Júpiter.'],
        formulas: [{ card: true, tex: tex`\bar v = \frac{${n(MOON_DISTANCE_KM)}\ \mathrm{km}}{${n(hours)}\ \mathrm{h}} = ${n(MOON_DISTANCE_KM / (hours * 3600))}\ \mathrm{km/s}` }],
      };
    }
    case 'parker-corona': {
      const radii = (r * AU_KM) / SUN_RADIUS_KM;
      return {
        title: event.title,
        summary:
          `Em ${formatDate(event.t)}, a ${num(radii)} raios solares do centro do Sol, a Parker cruza pela primeira vez a superfície ` +
          'crítica de Alfvén e entra na coroa: abaixo dela, o plasma ainda está preso ao campo magnético do Sol.',
        details: [
          'Acima dessa superfície, o vento solar escapa mais rápido que as ondas magnéticas e nunca mais volta. A NASA chamou o momento de "tocar o Sol".',
        ],
        formulas: [{ card: true, tex: tex`r = ${n(r * AU_KM)}\ \mathrm{km} = ${n(radii)}\,R_\odot` }],
      };
    }
    case 'magellan-mapping': {
      const period = Number(mission.info?.['mappingPeriodH']);
      return {
        title: event.title,
        summary:
          `Em ${formatDate(event.t)}, a Magellan começa a mapear Vênus por radar, que atravessa as nuvens. A cada volta de ${num(period)} h, ` +
          'ela grava uma faixa de ~20 km de largura perto do periapse e transmite os dados para a Terra no resto da órbita.',
        details: ['O radar de abertura sintética combina ecos de vários pontos da órbita para obter detalhes de ~100 m, a partir de 300 km de altitude.'],
        formulas: [{ card: true, tex: tex`T = 2\pi\sqrt{\frac{a^3}{\mu_{\text{V}}}} = ${n(period)}\ \mathrm{h}` }, lightFormula(toEarth)],
      };
    }
    case 'magellan-aerobraking':
    case 'magellan-aerobraking-end': {
      const passes = Number(mission.info?.['aerobrakingPasses']);
      const dv = Number(mission.info?.['aerobrakingDeltaVPerPassMs']);
      const total = Number(mission.info?.['aerobrakingTotalDeltaVKms']);
      const final = Number(mission.info?.['finalPeriodMin']);
      const starting = event.id === 'magellan-aerobraking';
      return {
        title: event.title,
        summary: starting
          ? `Em ${formatDate(event.t)}, a Magellan baixa o periapse para ~140 km, dentro do topo da atmosfera de Vênus, e começa a primeira aerofrenagem ` +
            'de uma sonda planetária: em vez de queimar combustível, usa o atrito com o ar para encolher a órbita.'
          : `Em ${formatDate(event.t)}, depois de ${num(passes)} passagens pelo ar, o apoapse desceu de 8 500 km para ~540 km. Uma queima ergue ` +
            `o periapse para fora da atmosfera, e a órbita final dura ${num(final)} minutos, boa para medir o campo gravitacional.`,
        details: [
          `Na reconstrução, cada passagem tira ~${num(dv)} m/s; somadas, ${kms(total)}, que custariam centenas de quilos de combustível. ` +
            'A técnica foi depois usada em Marte pela Mars Global Surveyor e pelas sondas seguintes.',
        ],
        formulas: [
          { card: true, tex: tex`\Delta v_{\text{total}} = N\,\Delta v_1 = ${n(passes, 3)} \times ${n(dv)}\ \mathrm{m/s} = ${n(total)}\ \mathrm{km/s}` },
          { tex: tex`T_{\text{final}} = ${n(final)}\ \text{min}` },
        ],
      };
    }
    case 'dawn-vesta-departure': {
      const rel = relativeKm(mission.trajectory, 'vesta', event.t)!;
      return {
        title: event.title,
        summary:
          `Em ${formatDate(event.t)}, depois de 14 meses em órbita, a Dawn sai de Vesta subindo em espiral com o motor iônico, a ${km(rel.distance)} ` +
          'do centro. Nenhuma sonda tinha saído da órbita de um corpo para orbitar outro.',
        details: [
          'Com o motor iônico ligado quase o tempo todo, a Dawn acumulou ~11 km/s de mudança de velocidade na missão, mais que o próprio foguete lhe deu: um recorde para propulsão de uma sonda.',
        ],
        formulas: [{ card: true, tex: tex`\Delta v = v_e \ln\frac{m_0}{m_1} \approx 11\ \mathrm{km/s}`, note: 'Equação do foguete: o íon de xenônio sai a ~30 km/s.' }],
      };
    }
    default:
      return { title: event.title, summary: formatDate(event.t), details: [], formulas: [lightFormula(toEarth)] };
  }
}

// ── Voyagers ─────────────────────────────────────────────────────────────────
export function explainEvent(event: MissionEvent): EventExplanation {
  const mission = MISSIONS[event.probeId];
  if (mission.group === 'apollo') return explainApolloEvent(event, mission);
  const name = mission.name;
  const date = formatDate(event.t);

  switch (event.kind) {
    case 'launch':
      return explainLaunch(event, mission);
    case 'flyby':
      return explainFlyby(event, mission);
    case 'capture':
      return explainCapture(event, mission);
    case 'arrival':
      return explainArrival(event, mission);
    case 'release':
      return explainRelease(event, mission);
    case 'entry':
      return explainEntry(event);
    case 'landing':
      return explainLanding(event, mission);
    case 'end':
      return explainEnd(event, mission);
    case 'last-contact':
      return explainLastContact(event, mission);
    case 'perihelion':
      return explainPerihelion(event);
    case 'milestone':
      return explainMilestone(event, mission);
  }

  const { r, toEarth, speed, escape } = situation(event);
  switch (event.kind) {
    case 'pale-blue-dot': {
      const theta = (2 * EARTH_RADIUS_KM) / (toEarth * AU_KM);
      return {
        title: event.title,
        summary:
          `Em ${date}, a ${num(toEarth)} UA da Terra, a Voyager 1 virou a câmera para trás e fotografou o próprio ` +
          `planeta: um ponto de ${num(theta * ARCSEC)}″, menor que um pixel da câmera. A foto inspirou Carl Sagan a ` +
          'escrever "Pálido Ponto Azul".',
        details: [
          'Fez parte do "Retrato de Família", um mosaico com seis planetas. Foram as últimas imagens da Voyager 1: as ' +
            'câmeras foram desligadas logo depois, para poupar energia.',
          `A luz refletida pela Terra levou ${formatSpan(lightTimeS(toEarth))} para chegar à sonda.`,
        ],
        formulas: [
          { card: true, tex: tex`\theta = \frac{2R_\oplus}{d} = \frac{2 \times ${n(EARTH_RADIUS_KM, 4)}\ \mathrm{km}}{${n(toEarth * AU_KM)}\ \mathrm{km}} = ${n(theta * ARCSEC)}''` },
          lightFormula(toEarth),
        ],
      };
    }

    case 'farthest': {
      const p10 = norm(probePosition(MISSIONS.pioneer10.trajectory, event.t)!);
      return {
        title: event.title,
        summary:
          `Em ${date}, a ${num(r)} UA do Sol, a Voyager 1 alcança a Pioneer 10 e passa a ser o objeto feito pelo homem ` +
          'mais distante. Lançada cinco anos depois, ela é mais rápida graças aos estilingues de Júpiter e Saturno.',
        details: [
          `A Voyager 1 se afasta do Sol a ${kms(speed)}, contra ${kms(speedKms(probeState(MISSIONS.pioneer10.trajectory, event.t)!.velocity))} ` +
            `da Pioneer 10, que está a ${au(p10)} do Sol. As duas já estão acima da velocidade de escape do Sol nessa distância (${kms(escape)}).`,
        ],
        formulas: [escapeFormula(r, speed, escape), lightFormula(toEarth)],
      };
    }

    case 'termination-shock':
      return {
        title: event.title,
        summary:
          `Em ${date}, a ${num(r)} UA do Sol, a ${name} atravessa o choque de terminação: o vento solar, que sai do ` +
          'Sol a ~400 km/s, freia de repente para baixo da velocidade do som ao encontrar a pressão do gás interestelar.',
        details: [
          'A pressão do vento solar cai com o quadrado da distância. Onde ela se iguala à do meio interestelar, o vento ' +
            'precisa desacelerar, como a água de uma torneira que se espalha ao bater na pia.',
          'A Voyager 1 cruzou o choque a ~94 UA e a Voyager 2 a ~84 UA: a heliosfera não é uma esfera, é achatada pelo ' +
            'movimento do Sol na galáxia.',
        ],
        formulas: [{ card: true, tex: tex`p_{\text{vento}} = \rho\,v^2 \propto \frac{1}{r^2}` }, lightFormula(toEarth)],
      };

    case 'heliopause':
      return {
        title: event.title,
        summary:
          `Em ${date}, a ${num(r)} UA do Sol, a ${name} cruza a heliopausa, a fronteira onde o vento solar termina, e ` +
          'entra no espaço interestelar.',
        details: [
          'Do lado de fora o plasma é dezenas de vezes mais denso e vem de outras estrelas. A Voyager 1 cruzou em 2012 e ' +
            'a Voyager 2, que ainda tinha o detector de plasma funcionando, confirmou a travessia diretamente em 2018.',
          `Os sinais da ${name} levavam ${formatSpan(lightTimeS(toEarth))} para chegar à Terra.`,
        ],
        formulas: [lightFormula(toEarth), escapeFormula(r, speed, escape)],
      };

    case 'light-day':
      return {
        title: event.title,
        summary:
          `Em ${date}, a Voyager 1 fica a um dia-luz da Terra: um comando enviado hoje só chega amanhã, e a resposta, ` +
          'depois de amanhã. É o primeiro objeto humano a essa distância.',
        details: [
          'A distância à Terra oscila ao longo do ano, porque a Terra dá voltas em torno do Sol, mas cresce ~3,6 UA por ' +
            'ano: a sonda se afasta do Sol a cerca de 17 km/s.',
          'O transmissor da sonda tem cerca de 23 W, e o sinal chega tão fraco que só as antenas gigantes da Rede de ' +
            'Espaço Profundo da NASA conseguem captá-lo.',
        ],
        formulas: [
          { card: true, tex: tex`d = c \times 1\ \text{dia} = ${n(LIGHT_DAY_AU, 4)}\ \text{UA} = ${n(LIGHT_DAY_AU * AU_KM)}\ \mathrm{km}` },
          { tex: tex`v = ${n(speed)}\ \mathrm{km/s} \approx ${n((speed * 365.25 * 86_400) / AU_KM)}\ ${texText('UA por ano')}` },
        ],
      };
  }
  // Os tipos das Apollo (TLI, LOI, decolagem...) só aparecem nelas, explicadas acima.
  return { title: event.title, summary: `${date}: ${event.title}.`, details: [], formulas: [lightFormula(toEarth)] };
}
