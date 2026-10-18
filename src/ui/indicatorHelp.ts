/**
 * O que cada indicador do cockpit mostra: o texto da janela flutuante aberta
 * pelo ⚠ de cada visor (passando o mouse ou tocando).
 */
export interface IndicatorHelp {
  readonly title: string;
  readonly text: string;
}

export type IndicatorId =
  | 'velocity'
  | 'acceleration'
  | 'lorentz'
  | 'shipClock'
  | 'earthClock'
  | 'distance'
  | 'contracted'
  | 'timeline'
  | 'timeScale'
  | 'gammaDial'
  | 'engine'
  | 'crew'
  | 'route';

export const INDICATOR_HELP: Readonly<Record<IndicatorId, IndicatorHelp>> = {
  velocity: {
    title: 'Velocidade',
    text:
      'Quanto a nave anda em relação à Terra e ao Sol: em porcentagem da velocidade da luz e em km/s ' +
      '(c = 299 792 km/s). Perto de c, a linha de baixo mostra quanto falta para c (c − v): a nave chega cada vez ' +
      'mais perto, mas nunca alcança a luz.',
  },
  acceleration: {
    title: 'Aceleração própria α',
    text:
      'O que um acelerômetro a bordo mede: o "peso" que a tripulação sente, em g (1 g = 9,81 m/s², a gravidade ' +
      'da Terra). Fica constante durante a queima, mas a velocidade vista da Terra sobe cada vez menos perto de c. ' +
      'Com o motor desligado, é zero e a nave segue por inércia.',
  },
  lorentz: {
    title: 'Fator de Lorentz γ',
    text:
      'γ = 1/√(1 − v²/c²) diz quanto o tempo a bordo anda mais devagar e quanto as distâncias encolhem para a ' +
      'nave. Vale 1 parado, 2 a 87 % de c e cresce sem limite perto de c. η é a rapidez (γ = cosh η), que sobe em ' +
      'linha reta com o tempo de bordo quando a aceleração é constante.',
  },
  shipClock: {
    title: 'Relógio da nave τ',
    text:
      'Tempo próprio: o que marca um relógio a bordo, a idade que a tripulação ganha na viagem. Anda mais devagar ' +
      'que o da Terra: cada segundo a bordo vale γ segundos na Terra.',
  },
  earthClock: {
    title: 'Relógio do planeta de partida t',
    text:
      'O tempo que passa no planeta de partida (a Terra, ou Erid na viagem de Rocky) e no alvo, que está no mesmo ' +
      'referencial, desde a partida. Na chegada, é quanto esperou quem ficou: muito mais que o relógio da nave nas ' +
      'viagens rápidas.',
  },
  distance: {
    title: 'Distância até o alvo',
    text:
      'Quanto falta até o alvo, medido no referencial da Terra e do alvo, em repouso. É a distância dos mapas: ' +
      '4,25 anos-luz até Proxima.',
  },
  contracted: {
    title: 'Distância contraída',
    text:
      'A mesma distância medida pela nave, encolhida pelo fator γ (contração de Lorentz). Por isso a tripulação ' +
      'chega antes do que a luz levaria pelo relógio da Terra: para ela, o caminho é mais curto.',
  },
  timeline: {
    title: 'Linha do tempo τ',
    text:
      'A viagem inteira em tempo de bordo. Arraste para ir a qualquer instante: o estado da nave é calculado ' +
      'exatamente para o ponto escolhido, sem precisar voar até lá.',
  },
  timeScale: {
    title: 'Tempo de bordo por segundo',
    text:
      'Quanto tempo de bordo passa a cada segundo real. 1 s/s é tempo real. ▶ acelera a simulação (até 25 anos ' +
      'por segundo), ◀ desacelera e ⟲ escolhe o ritmo que faz a viagem caber em uns 10 minutos.',
  },
  gammaDial: {
    title: 'Mostrador de γ',
    text:
      'O fator de Lorentz γ num ponteiro em escala logarítmica: cada marca vale 1 000 vezes a anterior (1, 10³, ' +
      '10⁶, 10⁹, 10¹²). A faixa âmbar é onde a radiação cósmica de fundo, desviada pelo Doppler, vira luz visível ' +
      'à frente da nave.',
  },
  engine: {
    title: 'Motor',
    text:
      'Empuxo: o motor acelera ou freia a nave. Flip: a nave gira para frear. Inércia: o motor está desligado e a ' +
      'nave segue em velocidade constante. Toque no botão para desligar o motor (a aceleração cai aos poucos até ' +
      'zero): a nave segue por inércia e o piloto automático religa o motor no ponto certo para frear e parar no ' +
      'alvo. Tocar de novo na inércia religa antes: a nave acelera mais e chega mais cedo. Descanso: com piloto ' +
      'humano, o motor desliga entre as queimas para a tripulação se recuperar e religa sozinho.',
  },
  crew: {
    title: 'Tripulação',
    text:
      'Quanto o corpo do piloto já gastou da tolerância à aceleração (100 % é o limite: desmaio e lesões). Sob ' +
      'peso acima de 1,2 g a carga sobe, mais depressa quanto maior a aceleração; sem peso, na inércia, ela cai. ' +
      'Quando o empuxo contínuo passaria do limite, o plano alterna queimas que param em 90 % (a marca na barra) ' +
      'com descansos por inércia de 3 ou 5 vezes a queima (escolha no planejamento): sem peso, o corpo se recupera ' +
      'mais devagar do que se desgasta. As durações são uma estimativa: não há medidas de recuperação depois de ' +
      'horas ou dias perto do limite.',
  },
  route: {
    title: 'Rota',
    text:
      'O caminho da estrela de partida (o Sol, ou 40 Eridani A) ao alvo em escala logarítmica até a metade, espelhada até o alvo: o começo e o fim da ' +
      'viagem, perto das estrelas, aparecem tão detalhados quanto o meio. O triângulo âmbar é a nave.',
  },
};
