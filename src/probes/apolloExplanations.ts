/**
 * Explicações dos eventos das missões Apollo, com os números das
 * reconstruções (`scripts/reconstruct.mjs`): Δv das queimas, velocidades,
 * altitudes e tempos de voo. Os fatos históricos que não saem da trajetória
 * (tripulações, frases, navios de resgate) ficam nas tabelas abaixo.
 */
import type { Formula } from '../ui/explanations';
import { formatProse as num, formatSpan } from '../ui/format';
import { texDuration, texNumber as n } from '../ui/tex';
import { bodyState } from './bodies';
import { craft, type ApolloId, type MissionEvent, type ProbeMission } from './missions';
import { AU_KM, DAY_S, probeState, relativeState, speedKms } from './probes';
import { formatDateTime, isoToDays } from './time';
import { norm, sub } from './vec3';

export interface ApolloExplanation {
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly formulas: readonly Formula[];
}

const tex = String.raw;
const MU_EARTH = 398_600.4;
const MU_MOON = 4902.8;
const R_EARTH = 6378.1;
const R_MOON = 1737.4;
const G0 = 9.80665;
const kms = (x: number) => `${num(x)} km/s`;
/** Velocidades próximas entre si: duas casas decimais ("10,95 km/s"). */
const kms2 = (x: number) => `${x.toFixed(2).replace('.', ',')} km/s`;
const ms = (x: number) => `${num(Math.round(x))} m/s`;
const km = (x: number) => `${num(Math.round(x))} km`;

/** Comandante, piloto do módulo de comando e piloto do módulo lunar. */
const CREWS: Readonly<Record<ApolloId, readonly [string, string, string]>> = {
  apollo8: ['Frank Borman', 'Jim Lovell', 'Bill Anders'],
  apollo10: ['Thomas Stafford', 'John Young', 'Eugene Cernan'],
  apollo11: ['Neil Armstrong', 'Michael Collins', 'Buzz Aldrin'],
  apollo12: ['Pete Conrad', 'Richard Gordon', 'Alan Bean'],
  apollo13: ['Jim Lovell', 'Jack Swigert', 'Fred Haise'],
  apollo14: ['Alan Shepard', 'Stuart Roosa', 'Edgar Mitchell'],
  apollo15: ['David Scott', 'Alfred Worden', 'James Irwin'],
  apollo16: ['John Young', 'Ken Mattingly', 'Charles Duke'],
  apollo17: ['Eugene Cernan', 'Ronald Evans', 'Harrison Schmitt'],
};

/** Navio que recolheu a cápsula. */
const RECOVERY: Readonly<Record<ApolloId, string>> = {
  apollo8: 'USS Yorktown',
  apollo10: 'USS Princeton',
  apollo11: 'USS Hornet',
  apollo12: 'USS Hornet',
  apollo13: 'USS Iwo Jima',
  apollo14: 'USS New Orleans',
  apollo15: 'USS Okinawa',
  apollo16: 'USS Ticonderoga',
  apollo17: 'USS Ticonderoga',
};

const LANDING_NOTES: Partial<Record<ApolloId, string>> = {
  apollo11:
    'Na descida, o computador disparou os alarmes 1202 e 1201 (sobrecarga), e o ponto previsto era um campo de pedras: Armstrong pilotou à mão até uma área plana e pousou com ~25 segundos de combustível de reserva. "Houston, aqui Base da Tranquilidade. A Águia pousou."',
  apollo12:
    'Um pouso de precisão: a 180 m da sonda Surveyor 3, que estava ali desde 1967. Os astronautas trouxeram peças dela para estudar como o equipamento envelheceu na Lua.',
  apollo14: 'Alan Shepard, o primeiro americano no espaço (1961), foi o mais velho a andar na Lua, aos 47 anos, e jogou duas bolas de golfe.',
  apollo15:
    'A primeira das missões J, com três dias na Lua e o jipe lunar (LRV). A tripulação achou a "Rocha do Gênesis", um pedaço de crosta lunar primitiva com ~4 bilhões de anos.',
  apollo16: 'O único pouso nas terras altas centrais. O pouso atrasou ~6 horas por um problema no motor do módulo de comando, que quase cancelou a descida.',
  apollo17: 'Harrison Schmitt, geólogo, foi o único cientista a pisar na Lua. Encontraram solo alaranjado, de vidro vulcânico.',
};

/** Números da reconstrução (com padrão para campos ausentes). */
const infoNumber = (mission: ProbeMission, key: string): number => {
  const value = mission.info?.[key];
  return typeof value === 'number' ? value : NaN;
};
const timeline = (mission: ProbeMission) => (mission.info?.['mission'] ?? {}) as Readonly<Record<string, string | undefined>>;
const tOf = (mission: ProbeMission, key: string): number | null => {
  const iso = timeline(mission)[key];
  return iso ? isoToDays(iso) : null;
};
const names = (mission: ProbeMission) => ({ csm: timeline(mission)['csm'] ?? mission.name, lm: timeline(mission)['lm'] ?? 'módulo lunar' });

/** Distância e velocidade em relação a um corpo (km, km/s). */
function relative(mission: ProbeMission, body: 'earth' | 'moon', t: number, craftId?: string) {
  const trajectory = craftId ? craft(craftId as never).trajectory : mission.trajectory;
  const s = relativeState(trajectory, body, Math.min(Math.max(t, trajectory.launch), trajectory.end));
  return s ? { distance: norm(s.position) * AU_KM, speed: speedKms(s.velocity) } : { distance: NaN, speed: NaN };
}

const circular = (mu: number, r: number) => Math.sqrt(mu / r);
const periodMin = (mu: number, a: number) => (2 * Math.PI * Math.sqrt((a * a * a) / mu)) / 60;

export function explainApolloEvent(event: MissionEvent, mission: ProbeMission): ApolloExplanation {
  const id = mission.id as ApolloId;
  const crew = CREWS[id];
  const { csm, lm } = names(mission);
  const when = formatDateTime(event.t);
  const title = event.title;

  switch (event.kind) {
    case 'launch': {
      const rPark = R_EARTH + 185;
      const v = circular(MU_EARTH, rPark);
      return {
        title,
        summary:
          `Em ${when}, a ${mission.name} parte do Centro Espacial Kennedy num Saturno V, o maior foguete já usado com sucesso: ` +
          `${crew[0]} (comandante), ${crew[1]} (módulo de comando) e ${crew[2]} (módulo lunar). Doze minutos depois a nave está numa ` +
          `órbita de estacionamento a ~185 km de altitude, dando uma volta na Terra a cada ${num(periodMin(MU_EARTH, rPark))} minutos.`,
        details: [
          'O Saturno V tinha 111 m e ~2 900 toneladas no lançamento; os cinco motores F-1 do primeiro estágio queimavam ~13 toneladas de combustível por segundo. Da órbita só chegavam o terceiro estágio (S-IVB) e a nave: o módulo de comando, o de serviço e o lunar.',
          'Na órbita de estacionamento a tripulação conferia os sistemas por uma volta e meia antes de seguir para a Lua.',
          'Esta rota foi reconstruída pela mecânica orbital: integração numérica da Terra, da Lua e do Sol, ajustada para passar nos horários da missão.',
        ],
        formulas: [
          { card: true, tex: tex`v_{\text{circ}} = \sqrt{\frac{\mu_\oplus}{r}} = ${n(v)}\ \mathrm{km/s}`, note: 'Velocidade de uma órbita circular a 185 km de altitude.' },
          { tex: tex`T = 2\pi\sqrt{\frac{r^3}{\mu_\oplus}} = ${n(periodMin(MU_EARTH, rPark))}\ \text{min}` },
        ],
      };
    }

    case 'tli': {
      const dv = infoNumber(mission, 'tliDeltaVKms');
      const rPark = R_EARTH + 185;
      const vc = circular(MU_EARTH, rPark);
      const vEsc = Math.sqrt((2 * MU_EARTH) / rPark);
      const arrival = tOf(mission, 'loi') ?? tOf(mission, 'pericynthion')!;
      const freeReturn = id === 'apollo8' || id === 'apollo10' || id === 'apollo11' || id === 'apollo13';
      return {
        title,
        summary:
          `Em ${when}, o terceiro estágio religa por ~6 minutos e acelera a nave em ${kms2(dv)}, de ${kms2(vc)} para ${kms2(vc + dv)}: ` +
          `pouco abaixo dos ${kms2(vEsc)} de escape. A nave sobe numa elipse enorme, que chega à distância da Lua ` +
          `${formatSpan((arrival - event.t) * DAY_S)} depois, quando a Lua está lá.`,
        details: [
          'Subindo, a nave perde velocidade para a gravidade da Terra: chega à região da Lua a menos de 1 km/s. A Lua, que anda a ~1 km/s na sua órbita, "alcança" a nave pela frente.',
          freeReturn
            ? 'A rota é de retorno livre: se o motor falhasse na Lua, a gravidade dela curvaria a nave de volta para a Terra, num oito. Foi o que salvou a Apollo 13.'
            : 'A partir da Apollo 12, a rota saía do retorno livre depois de uma correção no caminho, para alcançar pousos fora do equador lunar com menos combustível.',
          'Logo depois, o módulo de comando se separava, virava e puxava o módulo lunar do estágio S-IVB.',
        ],
        formulas: [
          { card: true, tex: tex`\Delta v_{\text{TLI}} = ${n(dv)}\ \mathrm{km/s}` },
          {
            tex: tex`v = ${n(vc + dv, 4)} < v_{\text{esc}} = \sqrt{\frac{2\mu_\oplus}{r}} = ${n(vEsc, 4)}\ \mathrm{km/s}`,
            note: 'Abaixo do escape: a nave fica numa elipse presa à Terra, com apogeu além da Lua.',
          },
        ],
      };
    }

    case 'loi': {
      const dv = infoNumber(mission, 'loiDeltaVKms');
      const rp = R_MOON + 111;
      const ra = R_MOON + 312;
      const arriving = relative(mission, 'moon', event.t - 1e-4).speed;
      const inclination = infoNumber(mission, 'lunarOrbitInclinationDeg');
      return {
        title,
        summary:
          `Em ${when}, atrás da Lua e sem contato com a Terra, o motor do módulo de serviço freia ${ms(dv * 1000)}. A nave, que passava ` +
          `a ${kms(arriving)} a ~111 km da superfície, fica presa numa órbita de 111 × 312 km, com uma volta a cada ` +
          `${num(periodMin(MU_MOON, (rp + ra) / 2))} minutos. Duas voltas depois, outra queima a deixa quase circular.` +
          (id === 'apollo8' ? ' Borman, Lovell e Anders são os primeiros humanos a ver a face oculta da Lua.' : ''),
        details: [
          'A queima é feita atrás da Lua, onde a nave passa mais rápido: frear no ponto mais baixo dá mais efeito por quilo de combustível. Se falhasse, a rota de retorno livre traria a nave de volta.',
          `A órbita é retrógrada (a nave anda de leste para oeste) e inclinada ${num(inclination)}° em relação ao equador lunar, no plano que passa pelo local de pouso.`,
          ...(id === 'apollo8'
            ? ['Na véspera de Natal, depois de dez voltas em 20 horas, a tripulação leu os primeiros versos do Gênesis numa transmissão vista por centenas de milhões de pessoas.']
            : []),
        ],
        formulas: [
          { card: true, tex: tex`\Delta v_{\text{LOI}} = ${n(dv * 1000)}\ \mathrm{m/s}` },
          {
            tex: tex`v_{\text{per}} = \sqrt{\mu_{\text{Lua}}\left(\frac{2}{r_p} - \frac{1}{a}\right)} = ${n(Math.sqrt(MU_MOON * (2 / rp - 2 / (rp + ra))))}\ \mathrm{km/s}`,
            note: 'Velocidade no periselênio da órbita de 111 × 312 km.',
          },
          { tex: tex`T = 2\pi\sqrt{\frac{a^3}{\mu_{\text{Lua}}}} = ${n(periodMin(MU_MOON, (rp + ra) / 2))}\ \text{min}` },
        ],
      };
    }

    case 'release': {
      const doi = lmDoiMs(mission);
      const lowAlt = id === 'apollo10' ? 15.6 : 15;
      return {
        title,
        summary:
          `Em ${when}, o ${lm} se separa do ${csm}. ${crew[1]} fica sozinho no módulo de comando, em órbita, enquanto ${crew[0]} e ` +
          `${crew[2]} descem. Meia volta antes do ponto mais baixo, o ${lm} freia ${ms(doi)} e passa a cair numa elipse que chega a ` +
          `${num(lowAlt)} km da superfície.`,
        details: [
          'É a DOI (inserção na órbita de descida): uma transferência de Hohmann ao contrário. Do ponto mais alto, a meia volta de distância, o periselênio desce de ~111 km para ~15 km.',
          id === 'apollo11'
            ? 'Collins passou cerca de 48 minutos de cada volta atrás da Lua, sem rádio: "o homem mais solitário" da história, segundo a imprensa.'
            : `Nas Apollo 14 a 17, a descida até ~15 km era feita ainda com os módulos acoplados, para poupar o combustível do ${lm}.`,
        ],
        formulas: [
          {
            card: true,
            tex: tex`\Delta v_{\text{DOI}} = v_{\text{circ}} - \sqrt{\mu_{\text{Lua}}\left(\frac{2}{r} - \frac{1}{a}\right)} \approx ${n(doi)}\ \mathrm{m/s}`,
            note: 'a: semieixo da elipse de descida, entre a órbita do CSM e os 15 km.',
          },
        ],
      };
    }

    case 'landing': {
      const range = lmInfo(mission, 'descentRangeKm');
      const pdi = tOf(mission, 'pdi')!;
      const span = (event.t - pdi) * DAY_S;
      const vPdi = Math.sqrt(MU_MOON * (2 / (R_MOON + 15) - 2 / (R_MOON + 15 + R_MOON + 111)));
      const decel = (vPdi * 1000) / span;
      return {
        title,
        summary:
          `Em ${when}, depois de ${formatSpan(span)} de descida motorizada a partir de 15 km de altitude, o ${lm} pousa ` +
          `${title.replace(/^O \S+ pousa /, '')}. O motor cancelou ~${kms(vPdi)} de velocidade horizontal ao longo de ~${km(range)}.`,
        details: [
          ...(LANDING_NOTES[id] ? [LANDING_NOTES[id]!] : []),
          'Na Lua não há ar para frear nem paraquedas: todo o pouso é feito com o motor, que aponta para a frente e vai sendo inclinado até ficar na vertical, nos últimos metros.',
          'O local na reconstrução gira com a Lua (uma volta a cada 27,3 dias, a mesma face sempre virada para a Terra).',
        ],
        formulas: [
          { card: true, tex: tex`a \approx \frac{\Delta v}{\Delta t} = \frac{${n(vPdi * 1000)}\ \mathrm{m/s}}{${texDuration(span)}} = ${n(decel)}\ \mathrm{m/s^2}` },
          { tex: tex`g_{\text{Lua}} = \frac{\mu_{\text{Lua}}}{R^2} = ${n((MU_MOON / (R_MOON * R_MOON)) * 1000)}\ \mathrm{m/s^2} \approx \frac{g_\oplus}{6}` },
        ],
      };
    }

    case 'liftoff': {
      const landing = tOf(mission, 'landing')!;
      const stay = (event.t - landing) * DAY_S;
      const rIns = R_MOON + 17;
      const vOrbit = circular(MU_MOON, rIns);
      return {
        title,
        summary:
          `Em ${when}, depois de ${formatSpan(stay)} na superfície, o estágio de subida do ${lm} decola usando o de descida como ` +
          `plataforma. Em ~7 minutos está numa órbita de 17 × 83 km, a ~${kms(vOrbit)}: na Lua, chegar à órbita custa 1/5 do que custa na Terra.`,
        details: [
          'O motor de subida não tinha redundância nem acelerador: ligava uma vez e ia até o fim. Era um dos componentes mais testados do programa.',
          `A decolagem foi marcada para quando o ${csm} passava pelo lugar certo, ~3 minutos à frente, para o encontro seguir a geometria planejada.`,
        ],
        formulas: [
          { card: true, tex: tex`v_{\text{órbita}} = \sqrt{\frac{\mu_{\text{Lua}}}{r}} = ${n(vOrbit)}\ \mathrm{km/s} \quad (\text{Terra: } ${n(circular(MU_EARTH, R_EARTH + 185))}\ \mathrm{km/s})` },
          { tex: tex`t_{\text{superfície}} = ${texDuration(stay)}` },
        ],
      };
    }

    case 'docking': {
      const tpi = lmInfo(mission, 'tpiDeltaVMs');
      const tpf = lmInfo(mission, 'tpfDeltaVMs');
      const start = tOf(mission, 'liftoff') ?? tOf(mission, 'undock')!;
      return {
        title,
        summary:
          `Em ${when}, ${formatSpan((event.t - start) * DAY_S)} depois de ${id === 'apollo10' ? 'deixar o ' + csm : 'decolar'}, o ${lm} ` +
          `reencontra o ${csm} e os dois acoplam. Na transferência final, o ${lm} acelera ${ms(tpi)} (TPI) num arco de 130° e freia ` +
          `${ms(tpf)} na chegada (TPF), segundo a reconstrução.`,
        details: [
          'O encontro em órbita é contraintuitivo: para alcançar uma nave à frente na mesma órbita, é preciso frear e cair para uma órbita mais baixa, que é mais curta. O módulo lunar sobe mais baixo que o CSM e o alcança por baixo.',
          `A tripulação passa para o ${csm} com as amostras, e o estágio de subida é descartado.`,
        ],
        formulas: [
          { card: true, tex: tex`\Delta v_{\text{TPI}} = ${n(tpi)}\ \mathrm{m/s}, \quad \Delta v_{\text{TPF}} = ${n(tpf)}\ \mathrm{m/s}` },
          { tex: tex`T_{\text{baixa}} < T_{\text{alta}}: \quad T = 2\pi\sqrt{\frac{a^3}{\mu}}` },
        ],
      };
    }

    case 'tei': {
      const dv = infoNumber(mission, 'teiDeltaVKms');
      const entry = tOf(mission, 'entry')!;
      return {
        title,
        summary:
          `Em ${when}, de novo atrás da Lua, o motor do módulo de serviço acelera a nave em ${kms(dv)} e a tira da órbita lunar. ` +
          `A queda até a Terra leva ${formatSpan((entry - event.t) * DAY_S)}.`,
        details: [
          'A TEI (injeção transterrestre) é a queima mais crítica: sem ela não há volta, e o motor do módulo de serviço não tinha reserva. Por isso era simples, com válvulas duplicadas e combustíveis que inflamam no contato.',
          'Saindo da Lua, a nave perde velocidade em relação a ela, mas ganha velocidade caindo para a Terra: chega à atmosfera a ~11 km/s.',
        ],
        formulas: [
          { card: true, tex: tex`\Delta v_{\text{TEI}} = ${n(dv * 1000)}\ \mathrm{m/s}` },
          { tex: tex`v_{\text{esc,Lua}} = \sqrt{\frac{2\mu_{\text{Lua}}}{r}} = ${n(Math.sqrt((2 * MU_MOON) / (R_MOON + 111)))}\ \mathrm{km/s}`, note: 'Escape da Lua a 111 km de altitude.' },
        ],
      };
    }

    case 'entry': {
      const v = infoNumber(mission, 'entrySpeedKms');
      const rEi = R_EARTH + 121.9;
      const energy = (v * v * 1e6) / 2 / 1e6;
      return {
        title,
        summary:
          `Em ${when}, o módulo de comando, já separado do de serviço, toca o topo da atmosfera a ${kms(v)} (~${num(Math.round(v * 3600))} km/h), ` +
          'num ângulo de −6,5°. O escudo de calor chega a ~2 700 °C e a desaceleração, a ~6 g.',
        details: [
          'O corredor de entrada é estreito: mais raso que ~−5°, a cápsula ricocheteia na atmosfera; mais íngreme que ~−7,5°, freia forte demais. A cápsula voava inclinada, usando a sustentação para controlar a descida.',
          'Por alguns minutos o plasma em volta da cápsula bloqueia o rádio.',
        ],
        formulas: [
          { card: true, tex: tex`v \approx \sqrt{v_\infty^2 + \frac{2\mu_\oplus}{r}} = ${n(v)}\ \mathrm{km/s}, \quad v_{\text{esc}} = ${n(Math.sqrt((2 * MU_EARTH) / rEi))}\ \mathrm{km/s}` },
          { tex: tex`\frac{E_c}{m} = \frac{v^2}{2} = ${n(energy)}\ \mathrm{MJ/kg}`, note: 'Energia que o escudo de calor e o ar dissipam, por quilo de cápsula.' },
        ],
      };
    }

    case 'splashdown': {
      const launch = mission.launchT;
      return {
        title,
        summary:
          `Em ${when}, depois de ${formatSpan((event.t - launch) * DAY_S)} de missão, o módulo de comando ${csm === mission.name ? '' : csm + ' '}` +
          `desce de paraquedas no Oceano Pacífico. A tripulação é recolhida pelo porta-aviões ${RECOVERY[id]}.`,
        details: [
          'Três paraquedas principais, de 26 m, abriam a ~3 km de altitude e baixavam a cápsula a ~35 km/h.',
          ...(id === 'apollo11' || id === 'apollo12' || id === 'apollo14'
            ? ['Por medo de micróbios lunares, os astronautas passavam 21 dias em quarentena (até a Apollo 14).']
            : []),
        ],
        formulas: [{ card: true, tex: tex`t_{\text{missão}} = ${texDuration((event.t - launch) * DAY_S)}` }],
      };
    }
  }
  return explainApolloMilestone(event, mission);
}

/** Δv da DOI do módulo lunar (m/s), pela reconstrução do LM. */
function lmDoiMs(mission: ProbeMission): number {
  return lmInfo(mission, 'doiDeltaVKms') * 1000;
}

/** Números da reconstrução do módulo lunar (a companheira da missão). */
function lmInfo(mission: ProbeMission, key: string): number {
  const value = mission.companions[0]?.info?.[key];
  return typeof value === 'number' ? value : NaN;
}

function explainApolloMilestone(event: MissionEvent, mission: ProbeMission): ApolloExplanation {
  const id = mission.id as ApolloId;
  const crew = CREWS[id];
  const when = formatDateTime(event.t);
  const title = event.title;
  const fromEarth = relative(mission, 'earth', event.t);
  const lightS = fromEarth.distance / 299_792.458;
  const light: Formula = {
    tex: tex`t_{\text{luz}} = \frac{${n(fromEarth.distance)}\ \mathrm{km}}{299\,792\ \mathrm{km/s}} = ${n(lightS)}\ \mathrm{s}`,
    note: 'Atraso do rádio entre a nave e a Terra.',
  };
  switch (event.id) {
    case 'apollo8-earthrise':
      return {
        title,
        summary:
          `Em ${when}, na quarta volta, a Terra surge no horizonte lunar e Bill Anders tira a foto "Nascer da Terra": um planeta azul ` +
          `e frágil sobre a superfície cinza, a ${km(fromEarth.distance)} de distância.`,
        details: [
          'Da órbita lunar, a Terra não nasce nem se põe para quem está no solo: ela fica quase parada no céu. O "nascer" só existe para quem orbita a Lua.',
          'A foto virou um símbolo do movimento ambientalista e foi lançada no ano em que começou o Dia da Terra.',
        ],
        formulas: [light, { card: true, tex: tex`\theta_\oplus = \frac{2R_\oplus}{d} = ${n(((2 * R_EARTH) / fromEarth.distance) * (180 / Math.PI))}^\circ`, note: 'Diâmetro aparente da Terra vista da Lua (~4 Luas cheias).' }],
      };
    case 'apollo10-low-pass': {
      const low = relative(mission, 'moon', event.t, event.craft).distance - R_MOON;
      return {
        title,
        summary:
          `Em ${when}, Stafford e Cernan passam a ${km(low)} da superfície no Snoopy, sobre o futuro local de pouso da Apollo 11: o ensaio ` +
          'de tudo menos o pouso.',
        details: [
          'O Snoopy não poderia pousar nem que quisesse: o estágio de subida levava menos combustível que o necessário para voltar de lá.',
          'Depois de duas passagens baixas, o estágio de descida foi largado e o de subida voltou ao Charlie Brown, num encontro igual ao que a Apollo 11 faria.',
        ],
        formulas: [{ card: true, tex: tex`h_{\min} = ${n(low)}\ \mathrm{km}` }],
      };
    }
    case 'apollo11-first-step':
      return {
        title,
        summary:
          `Em ${when}, Neil Armstrong desce a escada do Eagle e pisa no Mar da Tranquilidade: "É um pequeno passo para um homem, um ` +
          'salto gigantesco para a humanidade." Buzz Aldrin o segue 19 minutos depois.',
        details: [
          'A caminhada durou ~2 h 31 min: coletaram 21,5 kg de amostras, instalaram um sismômetro e um refletor laser, usado até hoje para medir a distância da Lua com precisão de milímetros.',
          `As imagens chegavam à Terra com ${num(lightS)} s de atraso e foram vistas por cerca de 600 milhões de pessoas.`,
        ],
        formulas: [light],
      };
    case 'apollo13-explosion':
      return {
        title,
        summary:
          `Em ${when}, a ${km(fromEarth.distance)} da Terra, um tanque de oxigênio do módulo de serviço explode. A nave perde a maior ` +
          `parte do oxigênio e da energia: "Houston, tivemos um problema." ${crew[0]}, ${crew[1]} e ${crew[2]} passam para o módulo lunar Aquarius, usado como bote salva-vidas.`,
        details: [
          'Um fio com o isolamento danificado num teste de solo, anos antes, fez faísca dentro do tanque quando um ventilador foi ligado.',
          'Longe demais para voltar direto, a nave seguiu para a Lua e usou a gravidade dela para retornar: o retorno livre.',
        ],
        formulas: [light],
      };
    case 'apollo13-pericynthion': {
      const alt = infoNumber(mission, 'pericynthionAltKm');
      return {
        title,
        summary:
          `Em ${when}, a Apollo 13 passa a ${km(alt)} da face oculta da Lua. Sem a queima de entrada em órbita, a gravidade lunar ` +
          'curva a trajetória e a manda de volta para a Terra, num oito.',
        details: [
          'Horas antes, o motor de descida do módulo lunar recolocou a nave na rota de retorno livre, que ela tinha deixado depois da injeção translunar para visar Fra Mauro.',
        ],
        formulas: [{ card: true, tex: tex`r_p = R_{\text{Lua}} + ${n(alt)}\ \mathrm{km} = ${n(R_MOON + alt)}\ \mathrm{km}` }],
      };
    }
    case 'apollo13-record':
      return {
        title,
        summary:
          `Em ${when}, logo depois de passar atrás da Lua, a tripulação da Apollo 13 fica a ${km(fromEarth.distance - R_EARTH)} da ` +
          'superfície da Terra: a maior distância que seres humanos já alcançaram.',
        details: ['A Lua estava perto do apogeu e a nave passou do lado oposto ao da Terra, a mais ~250 km da superfície lunar.'],
        formulas: [light, { card: true, tex: tex`d = ${n(fromEarth.distance)}\ \mathrm{km}\ (\text{do centro da Terra})` }],
      };
    case 'apollo13-pc2': {
      const dv = infoNumber(mission, 'pc2DeltaVKms');
      return {
        title,
        summary:
          `Em ${when}, duas horas depois do periselênio, o motor de descida do Aquarius acelera a nave em ${ms(dv * 1000)}: a volta ` +
          'fica cerca de 10 horas mais curta, e a amerissagem passa para o Pacífico, onde estavam os navios de resgate.',
        details: [
          'Com pouca energia, a tripulação desligou quase tudo; o frio dentro da nave chegou perto de 3 °C. O CO₂ subiu até a improvisação de filtros com fita adesiva, papelão e sacos plásticos.',
        ],
        formulas: [{ card: true, tex: tex`\Delta v_{\text{PC+2}} = ${n(dv * 1000)}\ \mathrm{m/s}` }],
      };
    }
    case 'apollo17-last-step':
      return {
        title,
        summary:
          `Em ${when}, Eugene Cernan sobe a escada do Challenger depois da terceira caminhada: até hoje, o último ser humano a ` +
          'pisar na Lua. "Partimos como viemos e, se Deus quiser, voltaremos, com paz e esperança para toda a humanidade."',
        details: ['Nos três dias em Taurus–Littrow, Cernan e Schmitt percorreram ~36 km com o jipe e trouxeram 110 kg de amostras.'],
        formulas: [light],
      };
  }
  const state = probeState(mission.trajectory, event.t);
  const speed = state ? speedKms(sub(state.velocity, bodyState('earth', event.t)!.velocity)) : NaN;
  return { title, summary: `${when}: ${title}.`, details: [], formulas: [{ tex: tex`v = ${n(speed)}\ \mathrm{km/s}` }, light] };
}

/** Gravidade na superfície da Lua em g (≈ 1/6). */
export const LUNAR_GRAVITY_G = ((MU_MOON / (R_MOON * R_MOON)) * 1000) / G0;
