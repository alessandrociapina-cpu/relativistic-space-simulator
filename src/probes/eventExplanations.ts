/**
 * Explicações dos eventos das missões, no formato do modo Explicar: resumo,
 * detalhes e fórmulas em TeX com os números calculados dos dados do JPL.
 */
import type { Formula } from '../ui/explanations';
import { formatProse as num, formatSpan } from '../ui/format';
import { texDuration, texNumber as n, texText } from '../ui/tex';
import { LIGHT_DAY_AU, MISSIONS, type MissionEvent } from './missions';
import { PLANETS, planetPosition } from './planets';
import { AU_KM, lightTimeS, probePosition, probeVelocity, solarEscapeKms, speedKms } from './probes';
import { interpolateState } from './ephemeris';
import { formatDate } from './time';
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
const ARCSEC = 180 / Math.PI * 3600;
const kms = (x: number) => `${num(x)} km/s`;
const km = (x: number) => `${num(Math.round(x))} km`;

/** Fatos de cada sobrevoo que não saem da trajetória. */
const FLYBY_NOTES: Record<string, string> = {
  'voyager1-jupiter':
    'A Voyager 1 descobriu vulcões ativos em Io, o primeiro vulcanismo visto fora da Terra, e um anel fino em torno de Júpiter.',
  'voyager1-saturn':
    'A rota foi escolhida para passar a cerca de 6 500 km de Titã e estudar sua atmosfera. O desvio tirou a sonda do plano dos planetas, rumo ao norte: a Voyager 1 não visitaria mais nenhum.',
  'voyager2-jupiter': 'A Voyager 2 fotografou Europa de perto e acompanhou a Grande Mancha Vermelha.',
  'voyager2-saturn': 'Com o desvio em Saturno, a Voyager 2 seguiu para Urano, abrindo a segunda metade do Grand Tour.',
  'voyager2-uranus':
    'Até hoje é a única visita a Urano: a Voyager 2 descobriu 10 luas novas e um campo magnético muito inclinado em relação ao eixo de rotação.',
  'voyager2-neptune':
    'Também a única visita a Netuno: a Voyager 2 viu a Grande Mancha Escura e gêiseres em Tritão. A passagem perto do polo norte a desviou para o sul do plano dos planetas.',
};

function sunAndEarth(event: MissionEvent) {
  const trajectory = MISSIONS[event.probeId].trajectory;
  const p = probePosition(trajectory, event.t)!;
  const toEarth = norm(sub(p, planetPosition('earth', event.t)));
  const speed = speedKms(probeVelocity(trajectory, event.t));
  return { trajectory, r: norm(p), toEarth, speed, escape: solarEscapeKms(norm(p)) };
}

const lightFormula = (toEarthAu: number): Formula => ({
  tex: tex`t_{\text{luz}} = \frac{d_\oplus}{c} = \frac{${n(toEarthAu * AU_KM)}\ \mathrm{km}}{299\,792\ \mathrm{km/s}} = ${texDuration(lightTimeS(toEarthAu))}`,
  note: 'Tempo para um sinal de rádio ir da Terra à sonda.',
});

const escapeFormula = (r: number, speed: number, escape: number): Formula => ({
  tex: tex`v_{\text{esc}} = \sqrt{\frac{2\mu_\odot}{r}} = ${n(escape)}\ \mathrm{km/s} \quad ${speed > escape ? '<' : '>'} \quad v = ${n(speed)}\ \mathrm{km/s}`,
  note: `A ${num(r)} UA do Sol. Acima da velocidade de escape, a sonda nunca volta.`,
});

export function explainEvent(event: MissionEvent): EventExplanation {
  const mission = MISSIONS[event.probeId];
  const name = mission.name;
  const { trajectory, r, toEarth, speed, escape } = sunAndEarth(event);
  const date = formatDate(event.t);

  switch (event.kind) {
    case 'launch': {
      const departure = trajectory.encounters.find((e) => e.departure)!;
      const state = interpolateState(departure.table, departure.end);
      const v = speedKms(state.velocity);
      const rKm = norm(state.position) * AU_KM;
      const vInf = Math.sqrt(v * v - (2 * PLANETS.earth.gm) / rKm);
      const helio = speedKms(probeVelocity(trajectory, departure.end));
      return {
        title: event.title,
        summary:
          (event.probeId === 'voyager2'
            ? `A Voyager 2 partiu da Flórida em ${date}, num foguete Titan IIIE–Centaur, para aproveitar um alinhamento de Júpiter, Saturno, Urano e Netuno que se repete a cada ~175 anos: o Grand Tour.`
            : `A Voyager 1 partiu em ${date}, 16 dias depois da irmã, numa trajetória mais rápida: chegou a Júpiter quatro meses antes, e por isso ficou com o número 1.`) +
          ` Longe da Terra, sobram ${kms(vInf)} além do necessário para escapar dela.`,
        details: [
          'A velocidade que resta depois de vencer a gravidade da Terra é o excesso hiperbólico v∞. Somado aos ' +
            `${num(EARTH_ORBIT_KMS)} km/s da órbita da Terra, ele dá a velocidade em torno do Sol: ${kms(helio)}.`,
          `Mesmo assim, a sonda não escaparia do Sol: a 1 UA a velocidade de escape solar é ${kms(solarEscapeKms(1))}. ` +
            'Só os sobrevoos dos planetas gigantes a levariam para fora do Sistema Solar.',
        ],
        formulas: [
          { card: true, tex: tex`v_\infty = \sqrt{v^2 - \frac{2\mu_\oplus}{r}} = ${n(vInf)}\ \mathrm{km/s}` },
          { tex: tex`C_3 = v_\infty^2 = ${n(vInf * vInf)}\ \mathrm{km^2/s^2}`, note: 'A energia de lançamento usada no projeto de missões.' },
          { tex: tex`v_\odot = ${n(helio)}\ \mathrm{km/s} \quad (\text{Terra: } ${n(EARTH_ORBIT_KMS)}\ \mathrm{km/s})` },
        ],
      };
    }

    case 'flyby': {
      const f = event.flyby!;
      const planet = PLANETS[f.body];
      const gain = f.helioSpeedAfterKms - f.helioSpeedBeforeKms;
      return {
        title: event.title,
        summary:
          `Em ${date}, a ${name} passa a ${km(f.closestKm)} do centro de ${planet.name} ` +
          `(${km(f.altitudeKm)} acima das nuvens). A gravidade do planeta desvia a trajetória em ` +
          `${num(f.deflectionDeg)}° e ${gain >= 0 ? 'acelera' : 'freia'} a sonda de ${kms(f.helioSpeedBeforeKms)} ` +
          `para ${kms(f.helioSpeedAfterKms)} em relação ao Sol.`,
        details: [
          'No referencial do planeta, a sonda entra e sai com a mesma velocidade v∞: o sobrevoo só muda a direção. ' +
            `Mas ${planet.name} anda a ${kms(f.planetSpeedKms)} em torno do Sol, e somar essa velocidade à direção ` +
            'nova muda a velocidade em relação ao Sol. É o estilingue gravitacional.',
          'A energia vem do próprio planeta, que perde uma fração desprezível da sua velocidade orbital.',
          `A fórmula da hipérbole prevê a deflexão a partir de r_p, v∞ e da massa do planeta: ${num(f.predictedDeflectionDeg)}°, ` +
            `contra ${num(f.deflectionDeg)}° medidos na trajetória do JPL.`,
          ...(FLYBY_NOTES[event.id] ? [FLYBY_NOTES[event.id]!] : []),
        ],
        formulas: [
          {
            tex: tex`\sin\frac{\delta}{2} = \frac{1}{1 + r_p v_\infty^2/\mu} \;\Rightarrow\; \delta = ${n(f.predictedDeflectionDeg)}^\circ`,
            note: `Nos dados do JPL: δ = ${num(f.deflectionDeg)}°.`,
          },
          {
            tex: tex`r_p = ${n(f.closestKm)}\ \mathrm{km}, \quad v_\infty = ${n(f.vInfKms)}\ \mathrm{km/s}, \quad \mu = ${n(planet.gm)}\ \mathrm{km^3/s^2}`,
          },
          {
            card: true,
            tex: tex`|\vec V_{\text{planeta}} + \vec v_\infty|\colon\ ${n(f.helioSpeedBeforeKms)} \to ${n(f.helioSpeedAfterKms)}\ \mathrm{km/s}\ \ (${gain >= 0 ? '+' : ''}${n(gain)})`,
          },
        ],
      };
    }

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

    case 'farthest':
      return {
        title: event.title,
        summary:
          `Em ${date}, a ${num(r)} UA do Sol, a Voyager 1 alcança a Pioneer 10 e passa a ser o objeto feito pelo homem ` +
          'mais distante. Lançada cinco anos depois, ela é mais rápida graças aos estilingues de Júpiter e Saturno.',
        details: [
          `A Voyager 1 se afasta do Sol a ${kms(speed)}, contra ~12 km/s da Pioneer 10. As duas já estão acima da ` +
            `velocidade de escape do Sol nessa distância (${kms(escape)}).`,
        ],
        formulas: [escapeFormula(r, speed, escape), lightFormula(toEarth)],
      };

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
        formulas: [
          { card: true, tex: tex`p_{\text{vento}} = \rho\,v^2 \propto \frac{1}{r^2}` },
          lightFormula(toEarth),
        ],
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
}

