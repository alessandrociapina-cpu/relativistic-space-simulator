/**
 * Explicações dos efeitos relativísticos: o cartão do modo Explicar (um por
 * efeito, quando ele começa) e o painel de efeitos ativos (aberto ao pausar).
 *
 * Cada efeito tem um critério físico de atividade (γ, D, T da CMB, lux, UA),
 * válido para qualquer destino e aceleração, e um texto com as fórmulas e os
 * valores do instante, em TeX para o KaTeX.
 */
import {
  C,
  G0,
  T_CMB_0,
  computeFlightState,
  computeMissionProfile,
  computeNoBrakeProperTime,
  computeShaderKinematics,
  flipTauOf,
  rocketMassRatio,
  type FlightState,
  type MissionProfile,
} from '../physics/RelativityEngine';
import type { CrewKind } from '../physics/accelerationPresets';
import { brakingDistance as restBrakingDistance, nextBurnAt } from '../physics/crewRest';
import type { Destination } from '../physics/destinations';
import { CMB_VISIBLE_GAMMA, preFlipWindowS } from '../physics/criticalEvents';
import { WIEN_NM_K, peakCmbLux, peakCmbLuxRapidity, type PhotometryAndEyeState } from '../physics/EyeAndPhotometry';
import { AU_M } from '../physics/sky';
import {
  formatAngle,
  formatDistance,
  formatEnergyEv,
  formatFixed,
  formatProse as num,
  formatScientific,
  formatSpan,
  formatVelocity,
  formatWavelengthNm,
} from './format';
import { BLUESHIFT_HOLOGRAM_GAMMA } from './hologramMode';
import {
  texAngle,
  texDistance,
  texDuration,
  texEnergyEv,
  texNumber as n,
  texSpeed,
  texWavelengthNm,
} from './tex';

/** O que as explicações leem do estado do voo (o store satisfaz esta forma). */
export interface ExplainContext {
  readonly crew: CrewKind;
  readonly destination: Destination;
  readonly accelG: number;
  readonly profile: MissionProfile;
  readonly flight: FlightState;
  readonly photometry: PhotometryAndEyeState;
}

export type EffectId =
  | 'arrival'
  | 'flip'
  | 'braking'
  | 'crew-rest'
  | 'coasting'
  | 'target-blueshift'
  | 'solar-system'
  | 'cmb-xray'
  | 'hot-cone'
  | 'illuminance'
  | 'cmb-visible'
  | 'doppler'
  | 'aberration'
  | 'length-contraction'
  | 'time-dilation'
  | 'kinematics'
  | 'mission'
  | 'rocket';

/**
 * Ordem do painel e prioridade do cartão: primeiro o que é próprio do
 * instante (marcos), depois a óptica e por fim a cinemática de base.
 */
export const EFFECT_ORDER: readonly EffectId[] = [
  'arrival',
  'flip',
  'braking',
  'crew-rest',
  'coasting',
  'target-blueshift',
  'solar-system',
  'cmb-xray',
  'hot-cone',
  'illuminance',
  'cmb-visible',
  'doppler',
  'aberration',
  'length-contraction',
  'time-dilation',
  'kinematics',
  'mission',
  'rocket',
];

export interface Formula {
  /** TeX com os valores do instante. */
  readonly tex: string;
  readonly note?: string;
  /** A fórmula do cartão (sem marca, vale a primeira). */
  readonly card?: boolean;
}

export interface Explanation {
  readonly id: EffectId;
  readonly title: string;
  /** Uma a três frases: o cartão e o topo de cada efeito no painel. */
  readonly summary: string;
  /** Parágrafos do "Saiba mais". */
  readonly details: readonly string[];
  readonly formulas: readonly Formula[];
}

/**
 * Limiares de "o efeito começou". Escolhidos para serem visíveis, para que a
 * viagem a 1 g até as estrelas próximas (γ_max ≈ 3) também os atravesse e para
 * que, a 1x na demonstração, os cartões cheguem com ≥ 6 s de intervalo (o
 * tempo mínimo de cada um na tela).
 */
export const EFFECT_THRESHOLDS = {
  /** Aberração: estrelas a 90° aparecem a 60°. */
  aberrationBeta: 0.5,
  /** Doppler à frente D = e^η: o Sol, atrás, já parece uma anã vermelha. */
  dopplerAhead: 2.5,
  timeDilationGamma: 2,
  contractionGamma: 3,
  /** Da órbita de Júpiter à heliopausa. */
  solarSystemAu: { min: 5.2, max: 120 },
  /** Mesmo limiar de luz do aviso de ofuscamento. */
  illuminanceLux: 1500,
  /** Pico de Wien da CMB à frente na faixa dos raios X. */
  xRayPeakNm: 10,
} as const;

const T_SUN_K = 5778;
/** Abaixo disso um corpo negro some no visível (o shader corta em 250 K). */
const SUN_VISIBLE_K = 1000;
const SUN_CORE_K = 1.57e7;
/** Exaustão de um foguete de fusão ideal (fração de c). */
const FUSION_EXHAUST_BETA = 0.1;
/** Constante de Boltzmann (eV/K) e energia de repouso do próton (eV). */
const K_B_EV = 8.617333262e-5;
const PROTON_REST_EV = 938.27208816e6;
const C2 = C * C;

const tex = String.raw;

/** Grandezas derivadas usadas por vários efeitos. */
interface Scene extends ExplainContext {
  readonly crewed: boolean;
  readonly alpha: number;
  readonly sunDistanceAu: number;
  readonly dFront: number;
  readonly dBack: number;
}

function scene(ctx: ExplainContext): Scene {
  return {
    ...ctx,
    crewed: ctx.crew === 'crewed',
    alpha: ctx.profile.properAccel,
    sunDistanceAu: (AU_M + ctx.flight.positionM) / AU_M,
    dFront: Math.exp(ctx.flight.eta),
    dBack: Math.exp(-ctx.flight.eta),
  };
}

type Body = Omit<Explanation, 'id' | 'title'>;

interface EffectDefinition {
  readonly title: string;
  /** Anunciado no cartão do modo Explicar quando começa. */
  readonly announce: boolean;
  isActive(s: Scene): boolean;
  explain(s: Scene): Body;
}

const inRange = (x: number, { min, max }: { readonly min: number; readonly max: number }) => x >= min && x <= max;

const ORBITS = [
  { au: 50, label: 'do Cinturão de Kuiper' },
  { au: 30.1, label: 'da órbita de Netuno' },
  { au: 19.2, label: 'da órbita de Urano' },
  { au: 9.5, label: 'da órbita de Saturno' },
  { au: 5.2, label: 'da órbita de Júpiter' },
] as const;

const missionTotalsFormulas = (p: MissionProfile): Formula[] =>
  p.crewRest
    ? [
        { tex: tex`\gamma_{\max} = \cosh\eta_{\max} = ${n(p.gammaMax, 4)}` },
        {
          tex: tex`\tau_{\text{total}} = \frac{2c}{\alpha}\,\eta_{\max} + \tau_{\text{inércia}} = ${texDuration((2 * C * p.etaMax) / p.properAccel)} + ${texDuration(p.tauTotal - (2 * C * p.etaMax) / p.properAccel)} = ${texDuration(p.tauTotal)}`,
        },
        { tex: tex`t_{\text{total}} = ${texDuration(p.tTotal)}` },
      ]
    : p.coastEta === null
    ? [
        { tex: tex`\gamma_{\max} = 1 + \frac{\alpha\,d_{1/2}}{c^2} = ${n(p.gammaMax, 4)}` },
        { tex: tex`\tau_{\text{total}} = \frac{2c}{\alpha}\operatorname{arccosh}\gamma_{\max} = ${texDuration(p.tauTotal)}` },
        { tex: tex`t_{\text{total}} = \frac{2c}{\alpha}\sinh\eta_{\max} = ${texDuration(p.tTotal)}` },
      ]
    : [
        { tex: tex`\gamma_{c} = \cosh\eta_c = ${n(p.gammaMax, 4)}` },
        {
          tex: tex`\tau_{\text{total}} = \frac{2c}{\alpha}\,\eta_c + \frac{L_{\text{cruzeiro}}}{c\,\sinh\eta_c} = ${texDuration(p.tauTotal)}`,
        },
        {
          tex: tex`t_{\text{total}} = \frac{2c}{\alpha}\sinh\eta_c + \frac{L_{\text{cruzeiro}}}{c\,\tanh\eta_c} = ${texDuration(p.tTotal)}`,
        },
      ];

/** Distância percorrida por inércia no cruzeiro do plano (com descansos, a subida também os inclui). */
const coastDistanceM = (p: MissionProfile) =>
  computeFlightState(p, p.burnEndTau).restDistanceRemainingM - computeFlightState(p, p.brakeStartTau).restDistanceRemainingM;

/** Distância para frear de η até parar com a aceleração do plano: com descansos, mais a percorrida neles. */
const brakingDistanceOf = (p: MissionProfile, eta: number) =>
  p.crewRest ? restBrakingDistance(eta, p.properAccel, p.crewRest) : (C2 * 2 * Math.sinh(eta / 2) ** 2) / p.properAccel;

/** L_frenagem em TeX, com a soma dos descansos quando há. */
const brakingTex = (p: MissionProfile, gammaSymbol: string, distanceM: number) =>
  p.crewRest
    ? tex`L_{\text{frenagem}} = \frac{c^2}{\alpha}\,(${gammaSymbol} - 1) + c\,\Delta\tau_{\text{descanso}} \sum_j \sinh(j\,\Delta\eta) = ${texDistance(distanceM)}`
    : tex`L_{\text{frenagem}} = \frac{c^2}{\alpha}\,(${gammaSymbol} - 1) = ${texDistance(distanceM)}`;

const velocityOf = (f: FlightState) => formatVelocity(f.beta, f.oneMinusBeta);
/** γ no texto: "1,67", "1 348", "3,53 × 10⁶". */
const gammaText = (gamma: number) => (gamma < 100 ? formatFixed(gamma, 2) : num(gamma));

const EFFECTS: Readonly<Record<EffectId, EffectDefinition>> = {
  mission: {
    title: 'A missão',
    announce: false,
    isActive: () => true,
    explain: ({ destination, accelG, alpha, profile, crewed }) => ({
      summary:
        (profile.crewRest
          ? `Acelerar com α constante em queimas de até ${formatSpan(profile.crewRest.burnTau)}, separadas por ` +
            `descansos de ${formatSpan(profile.crewRest.restTau)} sem peso, ` +
            (profile.coastEta === null
              ? 'girar a nave no meio do caminho'
              : `seguir por inércia a v = ${formatVelocity(Math.tanh(profile.etaMax), Math.exp(-profile.etaMax) / profile.gammaMax)}, girar a nave`) +
            ' e frear do mesmo jeito até parar em '
          : profile.coastEta === null
          ? 'Acelerar com α constante até o meio do caminho, girar a nave e frear com a mesma α até parar em '
          : `Acelerar com α constante até v = ${formatVelocity(Math.tanh(profile.etaMax), Math.exp(-profile.etaMax) / profile.gammaMax)}, ` +
            'desligar o motor e seguir por inércia, depois girar a nave e frear com a mesma α até parar em ') +
        `${destination.name}: ${formatSpan(profile.tauTotal)} de bordo e ${formatSpan(profile.tTotal)} na Terra.`,
      details: [
        'A aceleração própria α é a que um acelerômetro a bordo mede, e ela é constante. A aceleração medida da ' +
          'Terra não é: cai como α/γ³ à medida que a nave se aproxima de c.',
        !crewed
          ? accelG > 60_000
            ? `A bordo vai uma sonda robótica, mas nem ela aguentaria ${num(accelG)} g: o limite conhecido, de ` +
              'nanossondas de silício, fica em dezenas de milhares de g. O valor alto encurta a viagem para minutos e ' +
              'deixa cada efeito óptico visível em tempo real.'
            : `A bordo vai uma sonda robótica. Máquinas não desmaiam: a ${num(accelG)} g, o limite é a resistência ` +
              'dos materiais, que quase não depende do tempo de exposição.'
          : accelG > 50
            ? `Nenhum corpo humano resistiria a ${num(accelG)} g: o limite fica em algumas dezenas de g, ` +
              'por segundos. O valor alto encurta a viagem para minutos e deixa cada efeito óptico visível em tempo real.'
            : accelG <= 1.5
              ? `A ${formatFixed(accelG, accelG < 1 ? 2 : 1)} g, a tripulação sente um peso parecido com o da Terra ` +
                'durante todo o empuxo: é o perfil clássico de uma viagem tripulada.'
              : `A ${num(accelG)} g, a tripulação pesa ${num(accelG)} vezes mais que na Terra durante o empuxo, e o ` +
                'corpo só aguenta isso por tempo limitado' +
                (profile.crewRest
                  ? `: por isso o plano divide o empuxo em ${num(profile.crewRest.burns)} queimas, com descansos entre elas.`
                  : '.'),
      ],
      formulas: [
        { tex: tex`\alpha = N_G\,g_0 = ${n(accelG)} \times ${n(G0, 6)}\ \mathrm{m/s^2} = ${n(alpha)}\ \mathrm{m/s^2}` },
        ...missionTotalsFormulas(profile),
      ],
    }),
  },

  kinematics: {
    title: 'Rapidez η: o movimento hiperbólico',
    announce: true,
    isActive: (s) => s.flight.eta > 0,
    explain: ({ flight, alpha, profile }) => {
      const { eta, beta, gamma, oneMinusBeta, tau, phase } = flight;
      const etaText = formatFixed(eta, 3);
      // Com descansos, η só muda nas queimas: conta o tempo de empuxo, não o de bordo.
      const thrustTau = (C * eta) / alpha;
      const summary = profile.crewRest
        ? phase === 'coasting'
          ? `No descanso a rapidez fica constante, η = ${etaText}, e a nave segue a v = ${velocityOf(flight)}.`
          : `Cada segundo de empuxo soma (ou, na frenagem, tira) a mesma rapidez; nos descansos ela fica constante. ` +
            `Agora η = ${etaText} e v = ${velocityOf(flight)}.`
        : phase === 'coasting'
          ? `Com o motor desligado a rapidez fica constante, η = ${etaText}, e a nave segue a v = ${velocityOf(flight)}.`
          : phase === 'decelerating'
            ? `Na frenagem a rapidez cai no mesmo ritmo em que subiu: η = α(τ_total − τ)/c = ${etaText}. Agora v = ${velocityOf(flight)}.`
            : `Com aceleração própria constante, cada segundo de bordo soma a mesma rapidez: η = ατ/c = ${etaText}. ` +
              `A velocidade β = tanh η se aproxima de c sem nunca chegar a ela; agora v = ${velocityOf(flight)}.`;
      const etaTex = profile.crewRest
        ? tex`\eta = \frac{\alpha\,\tau_{\text{empuxo}}}{c} = \frac{${n(alpha)}\ \mathrm{m/s^2} \times ${n(thrustTau, 4)}\ \mathrm{s}}{${n(C, 4)}\ \mathrm{m/s}} = ${n(eta, 4)}`
        : phase === 'coasting'
          ? tex`\eta = \eta_c = \frac{\alpha\,\tau_1}{c} = ${n(eta, 4)}`
          : phase === 'decelerating'
          ? tex`\eta = \frac{\alpha\,(\tau_{\text{total}} - \tau)}{c} = ${n(eta, 4)}`
          : tex`\eta = \frac{\alpha\,\tau}{c} = \frac{${n(alpha)}\ \mathrm{m/s^2} \times ${n(tau, 4)}\ \mathrm{s}}{${n(C, 4)}\ \mathrm{m/s}} = ${n(eta, 4)}`;
      return {
        summary,
        details: [
          'Em relatividade as velocidades não se somam, mas a rapidez η sim: com aceleração própria constante, ela ' +
            'cresce em linha reta com o tempo de bordo. Dela saem β = tanh η e γ = cosh η.',
          'O simulador guarda η em 64 bits e nunca calcula 1 − β por subtração, que perto de c perderia todos os ' +
            'dígitos: usa a identidade exata 1 − β = e^(−η)/cosh η.',
        ],
        formulas: [
          { tex: etaTex },
          { tex: tex`\beta = \tanh\eta = ${beta > 0.999 ? `1 - ${n(oneMinusBeta)}` : n(beta, 4)}` },
          { tex: tex`\gamma = \cosh\eta = ${n(gamma, 4)}` },
          { card: true, tex: tex`c - v = c\,(1 - \beta) = c\,\frac{e^{-\eta}}{\cosh\eta} = ${texSpeed(C * oneMinusBeta)}` },
        ],
      };
    },
  },

  aberration: {
    title: 'Aberração da luz',
    announce: true,
    isActive: (s) => s.flight.beta >= EFFECT_THRESHOLDS.aberrationBeta,
    explain: ({ flight }) => {
      // Estrela a 90° no referencial da Terra: cos θ′ = β, tan θ′ = 1/sinh η (estável perto de c).
      const theta90 = Math.atan(1 / Math.sinh(flight.eta));
      return {
        summary:
          'A luz das estrelas chega inclinada para a frente, como a chuva no para-brisa de um carro em movimento. ' +
          `Toda a metade do céu que fica à frente da nave, no referencial da Terra, agora cabe num cone de ` +
          `${formatAngle(theta90)} em torno do alvo.`,
        details: [
          'Para quem se move, a direção de onde a luz parece vir muda: as estrelas se aglomeram na direção do ' +
            'movimento e se afastam da traseira. Uma estrela a 90° da rota, no referencial da Terra, aparece a ' +
            'θ′ = arccos β da proa.',
          'Na ignição o campo estelar inteiro escorrega para a frente, e a impressão é de que a nave anda para trás: ' +
            'é a ilusão óptica de recuo.',
          'O shader faz essa conta para cada pixel: a partir da direção observada, calcula de onde a luz partiu no ' +
            'referencial da Terra. Para não perder precisão em 32 bits perto de c, usa 1 − β·cos θ = δ + β·(1 − cos θ), ' +
            'uma soma de termos positivos.',
        ],
        formulas: [
          {
            tex: tex`\cos\theta' = \frac{\cos\theta + \beta}{1 + \beta\cos\theta}`,
            note: 'θ: direção no referencial da Terra; θ′: direção vista da nave.',
          },
          { card: true, tex: tex`\theta'_{90^\circ} = \arccos\beta = \arctan\frac{1}{\sinh\eta} = ${texAngle(theta90)}` },
        ],
      };
    },
  },

  doppler: {
    title: 'Efeito Doppler e beaming',
    announce: true,
    isActive: (s) => s.dFront >= EFFECT_THRESHOLDS.dopplerAhead,
    explain: ({ dFront, dBack }) => {
      const sunK = T_SUN_K * dBack;
      return {
        summary:
          `À frente, a luz chega com a frequência multiplicada por D = e^η = ${num(dFront)}: as estrelas ` +
          'ficam mais azuis e mais brilhantes. Atrás, ela é dividida pelo mesmo fator, e o Sol, no telescópio traseiro, ' +
          (sunK >= SUN_VISIBLE_K
            ? `parece uma estrela de ${num(sunK)} K.`
            : `parece um corpo negro de ${num(sunK)} K, frio demais para ser visto.`),
        details: [
          'Uma estrela de temperatura T, vista na direção θ′, aparece como um corpo negro de temperatura D·T: o ' +
            'espectro inteiro se desloca. As estrelas à frente ficam azuladas; as de trás, avermelhadas, até sumirem ' +
            'no infravermelho.',
          'O brilho também muda. A intensidade (brilho por ângulo sólido) cresce com D⁴ e o fluxo de cada estrela ' +
            'pontual com D², porque as estrelas também se aglomeram à frente. É o beaming relativístico.',
        ],
        formulas: [
          { tex: tex`D = \frac{1}{\gamma\,(1 - \beta\cos\theta')}` },
          { card: true, tex: tex`D_{\text{frente}} = e^{\eta} = ${n(dFront)}, \qquad D_{\text{trás}} = e^{-\eta} = ${n(dBack)}` },
          { tex: tex`T_{\odot,\,\text{trás}} = ${n(T_SUN_K, 4)}\ \mathrm{K} \times e^{-\eta} = ${n(sunK)}\ \mathrm{K}` },
          { tex: tex`I' = D^4\,I, \qquad F'_{\text{estrela}} = D^2\,F` },
        ],
      };
    },
  },

  'time-dilation': {
    title: 'Dilatação do tempo',
    announce: true,
    isActive: (s) => s.flight.gamma >= EFFECT_THRESHOLDS.timeDilationGamma,
    explain: ({ flight, profile }) => {
      const { gamma, tau, earthTimeS, phase } = flight;
      const formulas: Formula[] = [
        { tex: tex`\frac{dt}{d\tau} = \gamma = ${n(gamma, 4)}` },
        {
          tex:
            phase === 'decelerating'
              ? tex`t = t_{\text{total}} - \frac{c}{\alpha}\sinh\eta = ${texDuration(earthTimeS)}`
              : phase === 'coasting'
                ? tex`t = \frac{c}{\alpha}\sinh\eta_c + \gamma_c\,(\tau - \tau_1) = ${texDuration(earthTimeS)}`
                : tex`t = \frac{c}{\alpha}\sinh\eta = ${texDuration(earthTimeS)}`,
        },
      ];
      if (tau > 0) {
        formulas.push({ tex: tex`\frac{t}{\tau} = \frac{${texDuration(earthTimeS)}}{${texDuration(tau)}} = ${n(earthTimeS / tau)}` });
      }
      return {
        summary:
          `Cada segundo a bordo corresponde agora a ${formatSpan(gamma)} na Terra.` +
          ` Desde a partida, passaram ${formatSpan(tau)} na nave e ${formatSpan(earthTimeS)} na Terra.`,
        details: [
          'Medido da Terra, um relógio em movimento anda mais devagar: dt = γ·dτ. Não é defeito dos relógios: tudo ' +
            'a bordo, de corações a átomos, segue o tempo próprio τ.',
          'Com aceleração constante, o tempo da Terra cresce como t = (c/α)·sinh η, exponencialmente com o tempo ' +
            `de bordo. Por isso a viagem leva ${formatSpan(profile.tTotal)} na Terra e só ` +
            `${formatSpan(profile.tauTotal)} a bordo.`,
          'Para a nave, é a Terra que se move. A assimetria vem de quem acelera: só a nave sente o empuxo, e é ela ' +
            'que envelhece menos (o paradoxo dos gêmeos).',
        ],
        formulas,
      };
    },
  },

  'length-contraction': {
    title: 'Contração de Lorentz',
    announce: true,
    isActive: (s) => s.flight.gamma >= EFFECT_THRESHOLDS.contractionGamma,
    explain: ({ flight, destination }) => {
      const { restDistanceRemainingM: rest, contractedDistanceRemainingM: contracted, gamma } = flight;
      return {
        summary:
          `Medida pela nave, a distância que falta encolhe por um fator γ: dos ${formatDistance(rest)} no ` +
          `referencial da Terra, restam ${formatDistance(contracted)}.`,
        details: [
          'Comprimentos na direção do movimento se contraem por 1/γ. Para a tripulação, é o espaço até ' +
            `${destination.name} que encolhe, e por isso a nave chega em minutos sem nunca passar da velocidade da luz.`,
          'O HUD mostra as duas medidas: "Dist. repouso", no referencial da Terra, e "Dist. contraída", no da nave.',
        ],
        formulas: [
          { tex: tex`L = \frac{L_0}{\gamma} = \frac{${texDistance(rest)}}{${n(gamma, 4)}} = ${texDistance(contracted)}` },
        ],
      };
    },
  },

  'solar-system': {
    title: 'Atravessando o Sistema Solar',
    announce: true,
    isActive: (s) =>
      s.flight.phase === 'accelerating' && inRange(s.sunDistanceAu, EFFECT_THRESHOLDS.solarSystemAu),
    explain: ({ flight, sunDistanceAu, alpha }) => {
      const horizon = C2 / alpha;
      // Distância da frente de luz emitida na ignição: ct − x = (c²/α)(1 − e^(−η)).
      const lead = -horizon * Math.expm1(-flight.eta);
      const crossed = ORBITS.find((o) => sunDistanceAu >= o.au)?.label ?? 'da órbita de Marte';
      return {
        summary:
          `A nave já passou ${crossed} e está a ${num(sunDistanceAu)} UA do Sol, ` +
          `${formatSpan(flight.tau)} após a ignição. A luz que saiu da Terra junto com ela está só ` +
          `${formatDistance(lead)} à frente.`,
        details: [
          `Distâncias que sondas levam anos para percorrer passam em segundos: a γ = ${gammaText(flight.gamma)}, ` +
            `a nave anda a ${velocityOf(flight)}.`,
          'Mesmo assim, ela nunca alcança a luz da partida. A frente de luz emitida na ignição se afasta cada vez ' +
            `mais devagar, e a distância até ela tende a c²/α = ${formatDistance(horizon)}, sem nunca passar disso.`,
          'O mapa da rota usa escala logarítmica a partir do Sol, para que as órbitas dos planetas, a ' +
            'poucas UA, e o alvo, a anos-luz, caibam na mesma linha.',
        ],
        formulas: [
          { tex: tex`r_\odot = 1\ \mathrm{UA} + \frac{c^2}{\alpha}\,(\gamma - 1) = ${n(sunDistanceAu)}\ \mathrm{UA}` },
          { card: true, tex: tex`c\,t - x = \frac{c^2}{\alpha}\left(1 - e^{-\eta}\right) = ${texDistance(lead)}` },
        ],
      };
    },
  },

  'cmb-visible': {
    title: 'A radiação cósmica de fundo fica visível',
    announce: true,
    isActive: (s) => inRange(s.flight.gamma, CMB_VISIBLE_GAMMA),
    explain: ({ photometry, dFront }) => {
      const { cmbTempAheadK: temp, cmbWienPeakNm: peak } = photometry;
      return {
        summary:
          'O brilho que sobrou do Big Bang, a 2,725 K e invisível em micro-ondas, chega à frente da nave ' +
          `multiplicado por D = ${num(dFront)}: ${num(temp)} K, com pico em ` +
          `${formatWavelengthNm(peak)}. O céu à frente passa a brilhar.`,
        details: [
          'A radiação cósmica de fundo (CMB) preenche o universo inteiro como um corpo negro de 2,72548 K, com pico ' +
            'em 1,06 mm. O Doppler desloca o espectro inteiro: à frente, a temperatura aparente é T₀·e^η.',
          `Entre γ ≈ ${num(CMB_VISIBLE_GAMMA.min)} e γ ≈ ${num(CMB_VISIBLE_GAMMA.max)} ` +
            'o pico atravessa o visível: primeiro um brilho vermelho-escuro à frente, depois branco e azulado. É uma ' +
            'janela crítica, e o Auto-Step Down desacelera o tempo ao entrar nela.',
          'O holograma "CMB À FRENTE" mostra o espectro de Planck e onde fica a faixa visível.',
        ],
        formulas: [
          { tex: tex`T_{\text{frente}} = T_0\,e^{\eta} = ${n(T_CMB_0, 4)}\ \mathrm{K} \times ${n(dFront)} = ${n(temp)}\ \mathrm{K}` },
          {
            tex: tex`\lambda_{\text{pico}} = \frac{b}{T} = \frac{${n(WIEN_NM_K * 1e-6, 4)}\ \mathrm{mm\,K}}{${n(temp)}\ \mathrm{K}} = ${texWavelengthNm(peak)}`,
          },
          {
            tex: tex`B_\lambda(T) = \frac{2hc^2}{\lambda^5}\,\frac{1}{e^{hc/(\lambda k_B T)} - 1}`,
            note: 'Lei de Planck: o espectro de um corpo negro à temperatura T.',
          },
        ],
      };
    },
  },

  illuminance: {
    title: 'Ofuscamento: a luz à frente',
    announce: true,
    isActive: (s) => s.photometry.visibleLuxAhead >= EFFECT_THRESHOLDS.illuminanceLux,
    explain: ({ photometry, crewed }) => {
      const lux = photometry.visibleLuxAhead;
      const physics =
        'A iluminância sai da física: a luminância de Planck da CMB, já com o Doppler, integrada sobre o hemisfério ' +
        'à frente e pesada pela sensibilidade do olho V(λ). O máximo possível é ' +
        `${num(peakCmbLux())} lux, em γ ≈ ${num(Math.cosh(peakCmbLuxRapidity()))}.`;
      if (!crewed) {
        return {
          summary:
            `A CMB concentrada à frente chega com ${num(lux)} lux, a luz de um dia nublado, toda vinda de um cone ` +
            'minúsculo em torno do alvo. Para a câmera da sonda, é um ponto de luz ofuscante.',
          details: [
            physics,
            'Um olho humano espalharia essa luz por toda a visão (o véu do white-out). A câmera não: o cone quente é ' +
              'menor que um pixel e aparece como um ponto, diluído pela resposta óptica (PSF).',
          ],
          formulas: [
            {
              tex: tex`E = 2\pi\int_0^1 L_v\big(T_0\,D(u)\big)\,(1 - u)\,du = ${n(lux)}\ \mathrm{lx}`,
              note: 'u = 1 − cos θ′: a integral percorre o hemisfério à frente.',
            },
            { tex: tex`L_v = 683\ \tfrac{\mathrm{lm}}{\mathrm{W}} \int B_\lambda(T)\,\bar y(\lambda)\,d\lambda` },
          ],
        };
      }
      return {
        summary:
          `A CMB concentrada à frente ilumina a cabine com ${num(lux)} lux. Um escritório tem cerca de ` +
          '500 lux e um dia nublado, 10 000. Daí o aviso de ofuscamento.',
        details: [physics, 'No para-brisa, o véu claro simula a luz espalhada dentro do próprio olho.'],
        formulas: [
          {
            tex: tex`E = 2\pi\int_0^1 L_v\big(T_0\,D(u)\big)\,(1 - u)\,du = ${n(lux)}\ \mathrm{lx}`,
            note: 'u = 1 − cos θ′: a integral percorre o hemisfério à frente.',
          },
          { tex: tex`L_v = 683\ \tfrac{\mathrm{lm}}{\mathrm{W}} \int B_\lambda(T)\,\bar y(\lambda)\,d\lambda` },
        ],
      };
    },
  },

  'hot-cone': {
    title: 'Mais quente, porém menor',
    announce: true,
    isActive: (s) => s.flight.eta > peakCmbLuxRapidity(),
    explain: ({ flight, photometry }) => {
      const { gamma } = flight;
      return {
        summary:
          `A CMB à frente está a ${num(photometry.cmbTempAheadK)} K, mas só num cone de ` +
          `${formatAngle(1 / gamma)} (≈ 1/γ) em torno do alvo. Acima de γ ≈ ` +
          `${num(Math.cosh(peakCmbLuxRapidity()))} o cone encolhe mais rápido do que esquenta, e a ` +
          `iluminância cai: ${num(photometry.visibleLuxAhead)} lux, contra o pico de ` +
          `${num(peakCmbLux())}.`,
        details: [
          'O Doppler cai à metade do máximo a um ângulo θ ≈ 1/γ da proa. A área desse cone encolhe como 1/γ², ' +
            'enquanto o brilho visível de um corpo negro muito quente cresce só na proporção da temperatura ' +
            '(∝ e^η ≈ 2γ, regime de Rayleigh-Jeans). O resultado é E ∝ 1/γ.',
          'No para-brisa o cone logo fica menor que um pixel, e sua luz se dilui na resposta óptica (PSF). O ' +
            'telescópio acompanha o encolhimento com zoom ≈ 0,253·γ: agora ' +
            `x ${num(photometry.recommendedTelescopeZoom)}.`,
        ],
        formulas: [
          { tex: tex`\theta_{1/2} \approx \frac{1}{\gamma} = ${texAngle(1 / gamma)}` },
          { tex: tex`\Omega_{\text{cone}} \approx \frac{\pi}{\gamma^2} = ${n(Math.PI / (gamma * gamma))}\ \mathrm{sr}` },
          { tex: tex`E \propto \frac{T_{\text{frente}}}{\gamma^2} \propto \frac{1}{\gamma}` },
        ],
      };
    },
  },

  'cmb-xray': {
    title: 'A CMB em raios X',
    announce: true,
    isActive: (s) => s.photometry.cmbWienPeakNm <= EFFECT_THRESHOLDS.xRayPeakNm,
    explain: ({ flight, photometry, profile }) => {
      const temp = photometry.cmbTempAheadK;
      const photonEv = 2.821 * K_B_EV * temp;
      // (γ − 1)·m_p c² sem cancelamento: γ − 1 = 2 sinh²(η/2).
      const protonEv = 2 * Math.sinh(flight.eta / 2) ** 2 * PROTON_REST_EV;
      const midpointK = T_CMB_0 * Math.exp(profile.etaMax);
      return {
        summary:
          `À frente, a CMB já é um corpo negro de ${formatScientific(temp)} K. O pico está em ` +
          `${formatWavelengthNm(photometry.cmbWienPeakNm)}, na faixa dos raios X, e o fóton típico tem ` +
          `${formatEnergyEv(photonEv)}. O sensor RX do telescópio mostra o cone nessa faixa.`,
        details: [
          'A temperatura aparente cresce com e^η, sem limite.' +
            ` No ponto médio desta missão ela chega a ${formatScientific(midpointK)} K` +
            (midpointK > SUN_CORE_K ? ', mais que o núcleo do Sol (cerca de 15 milhões de K).' : '.'),
          'Numa nave real, esse feixe de raios X e o próprio gás interestelar seriam letais: cada próton atingido a ' +
            `γ = ${gammaText(flight.gamma)} chega com ${formatEnergyEv(protonEv)} de energia cinética. O ` +
            'simulador mostra só a óptica.',
        ],
        formulas: [
          { tex: tex`T_{\text{frente}} = T_0\,e^{\eta} = ${n(temp)}\ \mathrm{K}` },
          { tex: tex`\lambda_{\text{pico}} = \frac{b}{T} = ${texWavelengthNm(photometry.cmbWienPeakNm)}` },
          { card: true, tex: tex`h\nu_{\text{pico}} = 2{,}821\,k_B T = ${texEnergyEv(photonEv)}` },
          { tex: tex`E_{k,\,p} = (\gamma - 1)\,m_p c^2 = ${texEnergyEv(protonEv)}` },
        ],
      };
    },
  },

  flip: {
    title: 'Flip-and-burn: o ponto médio',
    announce: true,
    isActive: (s) => {
      const flip = flipTauOf(s.profile);
      return (
        flip !== null &&
        (s.flight.phase === 'accelerating' || s.flight.phase === 'coasting') &&
        s.flight.tau >= flip - preFlipWindowS(s.profile)
      );
    },
    explain: ({ flight, profile }) => {
      // O estado no flip (o do plano ou o do piloto automático, depois de religar o motor).
      const flip = flipTauOf(profile) ?? profile.brakeStartTau;
      const atFlip = computeFlightState(profile, flip);
      const peak = computeShaderKinematics(atFlip.eta);
      const remaining = atFlip.restDistanceRemainingM;
      const contracted = atFlip.contractedDistanceRemainingM;
      const toFlip = flip - flight.tau;
      const flipAndBurn = profile.coastEta === null && !profile.maneuvers && !profile.crewRest;
      const noBrake = computeNoBrakeProperTime(profile);
      return {
        summary:
          (toFlip > 0
            ? `Em ${formatSpan(toFlip)} a nave gira 180° e liga o motor para frear com a mesma aceleração. `
            : 'A nave girou 180° e passou a frear com a mesma aceleração. ') +
          `É o ponto de velocidade máxima: v = ${formatVelocity(peak.uBeta, peak.uOneMinusBeta)}, ` +
          `γ = ${gammaText(peak.uGamma)}.`,
        details: [
          `Ao começar a frenagem, a distância que falta, medida pela nave, é de só ${formatDistance(contracted)}: ` +
            `são ${formatDistance(remaining)} contraídos por γ.`,
          flipAndBurn
            ? `Se não freasse, a nave cruzaria esse trecho em cerca de ${formatSpan(noBrake)} de bordo ` +
              '(≈ (c/α)·ln 2) e passaria pelo alvo a quase c.'
            : profile.crewRest
              ? 'A frenagem repete a subida ao contrário, com as mesmas queimas e descansos, e começa a L_frenagem do ' +
                'alvo: a distância das queimas, (c²/α)(γ − 1), mais a percorrida nos descansos.'
              : 'A frenagem leva o mesmo tempo de bordo que a aceleração, e começa a (c²/α)(γ_c − 1) do alvo para parar ' +
                'exatamente nele.',
          'É um marco crítico: o Auto-Step Down desacelera o tempo na reta final antes do flip, e o holograma ' +
            '"FRENAGEM EM" faz a contagem.',
        ],
        formulas: flipAndBurn
          ? [
              { tex: tex`\gamma_{\max} = 1 + \frac{\alpha\,d_{1/2}}{c^2} = ${n(profile.gammaMax, 4)}` },
              { card: true, tex: tex`L_{\text{contraída}} = \frac{d_{1/2}}{\gamma_{\max}} = ${texDistance(contracted)}` },
              {
                tex: tex`\Delta\tau_{\text{sem frenagem}} = \frac{c}{\alpha}\left[\operatorname{arccosh}\!\left(1 + \frac{\alpha D}{c^2}\right) - \eta_{\max}\right] = ${n(noBrake)}\ \mathrm{s}`,
              },
            ]
          : [
              { tex: brakingTex(profile, '\gamma_c', remaining) },
              { card: true, tex: tex`L_{\text{contraída}} = \frac{L_{\text{frenagem}}}{\gamma_c} = ${texDistance(contracted)}` },
            ],
      };
    },
  },

  braking: {
    title: 'Frenagem',
    announce: true,
    isActive: (s) => s.flight.phase === 'decelerating',
    explain: ({ flight, profile }) => {
      const mirror = profile.tauTotal - flight.tau;
      return {
        summary:
          'O motor agora empurra contra o movimento, e a rapidez cai no mesmo ritmo em que subiu. Por isso o céu ' +
          `repete, de trás para a frente, o que se viu na ida. Faltam ${formatSpan(mirror)} de bordo.`,
        details: [
          'Aberração, Doppler e a cor da CMB dependem só da velocidade, não da aceleração. O instante τ da frenagem ' +
            `mostra o mesmo céu do instante espelho τ_total − τ da ida: agora, τ = ${formatSpan(mirror)}.`,
        ],
        formulas: profile.crewRest
          ? [
              { tex: tex`\eta(\tau) = \eta(\tau_{\text{total}} - \tau) = ${n(flight.eta, 4)}` },
              { tex: tex`L_0 = D - x = ${texDistance(flight.restDistanceRemainingM)}` },
              { card: true, tex: tex`\tau_{\text{espelho}} = \tau_{\text{total}} - \tau = ${texDuration(mirror)}` },
            ]
          : [
              { tex: tex`\eta = \frac{\alpha\,(\tau_{\text{total}} - \tau)}{c} = ${n(flight.eta, 4)}` },
              { tex: tex`L_0 = D - x = \frac{c^2}{\alpha}\,(\gamma - 1) = ${texDistance(flight.restDistanceRemainingM)}` },
              { card: true, tex: tex`\tau_{\text{espelho}} = \tau_{\text{total}} - \tau = ${texDuration(mirror)}` },
            ],
      };
    },
  },

  'target-blueshift': {
    title: 'O alvo à frente, azulado',
    announce: true,
    isActive: (s) =>
      s.flight.phase === 'decelerating' && inRange(s.flight.gamma, BLUESHIFT_HOLOGRAM_GAMMA),
    explain: ({ destination, flight, dFront }) => {
      const seenK = destination.temperatureK * dFront;
      return {
        summary:
          `${destination.name} tem ${num(destination.temperatureK)} K, mas a nave ainda se aproxima a ` +
          `γ = ${gammaText(flight.gamma)}. A luz chega com D = e^η = ${num(dFront)}, e o alvo aparece ` +
          `como um corpo negro de ${num(seenK)} K.`,
        details: [
          'Exatamente à frente o Doppler é máximo, D = γ·(1 + β) = e^η. À medida que a nave freia, D cai e a cor do ' +
            'alvo volta à verdadeira, que aparece na chegada.',
          'O holograma compara a cor verdadeira com a cor vista agora, as duas calculadas pela curva de Planck.',
        ],
        formulas: [
          { tex: tex`D_{\text{frente}} = \gamma\,(1 + \beta) = e^{\eta} = ${n(dFront)}` },
          {
            card: true,
            tex: tex`T_{\text{vista}} = D\,T_\ast = ${n(dFront)} \times ${n(destination.temperatureK, 4)}\ \mathrm{K} = ${n(seenK)}\ \mathrm{K}`,
          },
        ],
      };
    },
  },

  'crew-rest': {
    title: 'Descanso da tripulação',
    announce: true,
    isActive: (s) => s.flight.crewRest,
    explain: ({ flight, profile, accelG }) => {
      const rest = profile.crewRest;
      if (!rest) {
        return {
          summary:
            'Quando o empuxo contínuo passaria do que o corpo do piloto aguenta, o plano alterna queimas e descansos ' +
            'por inércia, sem peso, para a tripulação se recuperar. Esta viagem não precisa deles.',
          details: [],
          formulas: [],
        };
      }
      const toBurn = Math.max(0, nextBurnAt(profile, flight.tau) - flight.tau);
      const dEta = (profile.properAccel * rest.burnTau) / C;
      const continuous = computeMissionProfile(profile.distanceM, profile.properAccel, profile.coastEta);
      return {
        summary:
          `O motor desligou para a tripulação se recuperar: a nave segue por inércia, sem peso a bordo, e a próxima ` +
          `queima a ${num(accelG)} g começa em ${formatSpan(toBurn)}. As queimas duram até ${formatSpan(rest.burnTau)}, ` +
          `90 % do que o corpo aguenta seguido.`,
        details: [
          'A tolerância humana a uma aceleração contínua cai com o tempo de exposição: as curvas da NASA para a ' +
            'aceleração peito–costas (+Gx) vão de dezenas de g por segundos a poucos g por horas, e voluntários ' +
            `imersos em água chegaram a ~31 g por segundos (Johnsville, 1958). A ${num(accelG)} g, o simulador adota ` +
            `${formatSpan(rest.enduranceS)} de limite contínuo.`,
          'Não há medidas de recuperação depois de horas ou dias perto do limite. A estimativa: cada queima usa 90 % ' +
            'da tolerância, e sem peso o corpo se recupera mais devagar do que se desgasta, então cada descanso dura ' +
            `${num(rest.restTau / rest.burnTau)} vezes a queima (no mínimo 1 h): ${formatSpan(rest.restTau)}. Assim a ` +
            'carga volta a zero antes da próxima queima.',
          `Os descansos custam tempo: com ${num(rest.burns)} queimas, a viagem leva ${formatSpan(profile.tauTotal)} de ` +
            `bordo, contra ${formatSpan(continuous.tauTotal)} com empuxo contínuo, que a tripulação não aguentaria. A ` +
            'velocidade de pico também é menor, porque boa parte do tempo passa sem empuxo.',
        ],
        formulas: [
          {
            card: true,
            tex: tex`\Delta\tau_{\text{queima}} \le 0{,}9\,T_{\text{lim}} = ${texDuration(rest.burnTau)}`,
          },
          {
            tex: tex`\Delta\tau_{\text{descanso}} = \max\!\left(k\,\Delta\tau_{\text{queima}},\ 1\ \mathrm{h}\right) = ${texDuration(rest.restTau)}`,
          },
          { tex: tex`\Delta\eta_{\text{queima}} = \frac{\alpha\,\Delta\tau_{\text{queima}}}{c} = ${n(dEta, 4)}` },
          { tex: tex`\eta = ${n(flight.eta, 4)}, \qquad \frac{dx}{d\tau} = c\,\sinh\eta = ${texSpeed(C * Math.sinh(flight.eta))}` },
        ],
      };
    },
  },

  coasting: {
    title: 'Motor desligado: inércia',
    announce: true,
    isActive: (s) => s.flight.phase === 'coasting' && !s.flight.crewRest,
    explain: ({ flight, profile }) => {
      const m = profile.maneuvers;
      if (m && flight.tau >= m.firstTau) {
        // Inércia depois de o piloto desligar o motor, até a frenagem automática.
        const speed = C * Math.sinh(flight.eta);
        const flip = flipTauOf(profile);
        const brakes = m.end === 'arrival' && flip !== null && flip > flight.tau;
        const brakingDistance = brakingDistanceOf(profile, flight.eta);
        return {
          summary:
            `O motor foi desligado e a nave segue por inércia a v = ${velocityOf(flight)}: ninguém sente peso a bordo ` +
            'e o céu congela, porque aberração, Doppler e a cor da CMB só mudam com a velocidade. ' +
            (brakes
              ? `Em ${formatSpan(flip - flight.tau)} de bordo, o piloto automático gira a nave e religa o motor para ` +
                'frear com a aceleração planejada e parar no alvo. Religar antes acelera de novo e chega mais cedo.'
              : 'A nave está quase parada e não chega ao alvo. Religue o motor para o piloto automático refazer a rota.'),
          details: [
            'Sem empuxo, a rapidez η fica constante: dx/dτ = c·sinh η e dt/dτ = cosh η. O relógio da Terra continua ' +
              'correndo γ vezes mais depressa que o de bordo.',
            profile.crewRest
              ? 'A frenagem começa quando a distância que falta é a que a aceleração planejada leva para parar a nave, ' +
                'com as queimas e os descansos da tripulação: (c²/α)(γ − 1) mais a distância percorrida nos descansos.'
              : 'A frenagem começa quando a distância que falta é a que a aceleração planejada leva para parar a nave, ' +
                'L = (c²/α)(γ − 1): por isso a frenagem dura o mesmo tempo de bordo que a subida até essa velocidade.',
            'Ao religar antes, o piloto automático acelera mais e faz o flip no ponto certo para parar no alvo.',
          ],
          formulas: [
            { card: true, tex: tex`\eta = ${n(flight.eta, 4)}, \qquad \frac{dx}{d\tau} = c\,\sinh\eta = ${texSpeed(speed)}` },
            { tex: tex`\frac{dt}{d\tau} = \cosh\eta = \gamma = ${n(flight.gamma, 4)}` },
            ...(brakes ? [{ tex: brakingTex(profile, '\gamma', brakingDistance) }] : []),
          ],
        };
      }
      const coastTau = profile.brakeStartTau - profile.burnEndTau;
      const toBrake = profile.brakeStartTau - flight.tau;
      const flipAndBurnRatio = rocketMassRatio(computeMissionProfile(profile.distanceM, profile.properAccel));
      return {
        summary:
          `O motor desligou a v = ${velocityOf(flight)} e a nave segue por inércia: ninguém sente peso a bordo, e o ` +
          'céu congela, porque aberração, Doppler e a cor da CMB só mudam com a velocidade. A frenagem começa em ' +
          `${formatSpan(toBrake)}.`,
        details: [
          'Sem empuxo não há gravidade artificial: a tripulação flutua durante os ' +
            `${formatSpan(coastTau)} de bordo da travessia de ${formatDistance(coastDistanceM(profile))}.`,
          'Cruzar sai mais barato: com o foguete de fótons ideal, a razão de massa cai para e^(2η_c) = ' +
            `${num(rocketMassRatio(profile))}, contra ${num(flipAndBurnRatio)} acelerando até o meio do caminho.`,
          'Medida pela nave, a travessia encolhe por γ_c, como qualquer distância na direção do movimento.',
        ],
        formulas: [
          {
            tex: tex`\eta = \eta_c = ${n(flight.eta, 4)}, \qquad \beta_c = \tanh\eta_c = ${flight.beta > 0.999 ? `1 - ${n(flight.oneMinusBeta)}` : n(flight.beta, 4)}`,
          },
          {
            card: true,
            tex: tex`\Delta\tau_{\text{cruzeiro}} = \frac{L_{\text{cruzeiro}}}{c\,\sinh\eta_c} = ${texDuration(coastTau)}`,
          },
          {
            tex: tex`\Delta t_{\text{cruzeiro}} = \gamma_c\,\Delta\tau_{\text{cruzeiro}} = ${texDuration(coastTau * profile.gammaMax)}`,
          },
        ],
      };
    },
  },

  rocket: {
    title: 'Combustível: a equação do foguete',
    announce: false,
    isActive: () => true,
    explain: ({ profile }) => {
      const photon = rocketMassRatio(profile);
      const fusion = rocketMassRatio(profile, FUSION_EXHAUST_BETA);
      return {
        summary:
          `Para ganhar e depois perder a rapidez η = ${formatFixed(profile.etaMax, 2)}, mesmo o foguete mais ` +
          `eficiente possível, que expele fótons, precisa partir com ${num(photon)} vezes a massa que chega.`,
        details: [
          'A rapidez que um foguete ganha é proporcional ao logaritmo da razão de massa: Δη = (v_e/c)·ln(m₀/m₁). ' +
            'Como a viagem acelera e depois freia, Δη = 2·η_max, e a massa necessária cresce exponencialmente com a ' +
            'rapidez de pico.',
          `Um foguete de fusão ideal, com exaustão a 0,1c, precisaria de ${num(fusion)} vezes a massa final: a razão ` +
            'do foguete de fótons elevada à 10ª potência.',
          profile.coastEta === null
            ? 'Cruzar a uma velocidade menor, com o perfil acelerar, cruzar e frear, reduz essa conta drasticamente.'
            : 'O cruzeiro limita a rapidez de pico e, com ela, o combustível.',
        ],
        formulas: [
          { tex: tex`\frac{m_0}{m_1} = e^{\,2\eta_{\max}\,c/v_e}` },
          { card: true, tex: tex`v_e = c\colon\quad \frac{m_0}{m_1} = e^{2 \times ${n(profile.etaMax, 4)}} = ${n(photon)}` },
          { tex: tex`v_e = 0{,}1\,c\colon\quad \frac{m_0}{m_1} = e^{20 \times ${n(profile.etaMax, 4)}} = ${n(fusion)}` },
        ],
      };
    },
  },

  arrival: {
    title: 'Chegada: o paradoxo dos gêmeos',
    announce: true,
    isActive: (s) => s.flight.phase === 'arrived',
    explain: ({ profile }) => {
      const ratio = profile.tTotal / profile.tauTotal;
      const lightTimeS = profile.distanceM / C;
      return {
        summary:
          `A bordo passaram ${formatSpan(profile.tauTotal)}; na Terra, ${formatSpan(profile.tTotal)}. Quem ` +
          'acelerou foi a nave, e por isso foi ela que envelheceu menos.',
        details: [
          `Em média, cada segundo a bordo valeu ${formatSpan(ratio)} na Terra.`,
          `Uma mensagem enviada agora leva ${formatSpan(lightTimeS)} para chegar à Terra: lá, a notícia da ` +
            `chegada só será recebida ${formatSpan(profile.tTotal + lightTimeS)} depois da partida.`,
          'Para voltar, seria preciso outra viagem igual. No reencontro teriam passado ' +
            `${formatSpan(2 * profile.tTotal)} na Terra e só ${formatSpan(2 * profile.tauTotal)} a bordo.`,
        ],
        formulas: [...missionTotalsFormulas(profile).slice(1), { card: true, tex: tex`\frac{t_{\text{total}}}{\tau_{\text{total}}} = ${n(ratio)}` }],
      };
    },
  },
};

/** Efeitos ativos no instante, na ordem do painel. */
export function activeEffects(ctx: ExplainContext): EffectId[] {
  const s = scene(ctx);
  return EFFECT_ORDER.filter((id) => EFFECTS[id].isActive(s));
}

export function explainEffect(id: EffectId, ctx: ExplainContext): Explanation {
  const effect = EFFECTS[id];
  return { id, title: effect.title, ...effect.explain(scene(ctx)) };
}

export const isAnnounced = (id: EffectId) => EFFECTS[id].announce;

/** A fórmula que resume o efeito no cartão. */
export const cardFormula = ({ formulas }: Explanation): Formula | undefined => formulas.find((f) => f.card) ?? formulas[0];

/**
 * Efeitos que começaram entre dois instantes do voo e ainda não foram
 * anunciados nesta missão, na ordem de prioridade do cartão.
 */
export function newAnnouncements(
  before: readonly EffectId[],
  after: readonly EffectId[],
  announced: readonly EffectId[],
): EffectId[] {
  return after.filter((id) => isAnnounced(id) && !before.includes(id) && !announced.includes(id));
}

/** O efeito mais próprio do instante, para quando o modo Explicar é ligado no meio do voo. */
export function headlineEffect(active: readonly EffectId[]): EffectId | null {
  return active.find(isAnnounced) ?? null;
}
