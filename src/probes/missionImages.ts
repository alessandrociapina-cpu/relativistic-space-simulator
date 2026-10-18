/**
 * As imagens mais marcantes de cada missão, abertas direto do Wikimedia Commons
 * (nada é empacotado no app: só os nomes dos arquivos e as legendas).
 *
 * `Special:FilePath` devolve a miniatura na largura pedida (ou o original, se
 * ele for menor), então basta o nome do arquivo. O crédito e a licença vêm da
 * página do arquivo no Commons, que a galeria também abre.
 */
import type { ProbeId } from './missions';
import { isoToDays } from './time';

export type ImageLicense = 'pd' | 'cc-by-sa-igo' | 'commons';

export interface MissionImage {
  /** Nome do arquivo no Commons, com `_` no lugar dos espaços. */
  readonly file: string;
  readonly title: string;
  /** Data da foto ("20/07/1969", "dez/1973"); ausente nas fotos de museu. */
  readonly date?: string;
  readonly caption: string;
  readonly credit: string;
  readonly license: ImageLicense;
}

export const LICENSE_LABEL: Readonly<Record<ImageLicense, string>> = {
  pd: 'domínio público',
  'cc-by-sa-igo': 'CC BY-SA 3.0 IGO',
  commons: 'licença na página do arquivo',
};

const COMMONS = 'https://commons.wikimedia.org/wiki/';

/** A imagem na largura pedida, em pixels (o original, se for menor). */
export const commonsImageUrl = (file: string, width: number) =>
  `${COMMONS}Special:FilePath/${encodeURIComponent(file)}?width=${width}`;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * A data da foto em dias desde J2000 (o meio do mês, do ano ou do intervalo, quando só eles são dados);
 * null nas fotos sem data.
 */
export function imageDays(date: string | undefined): number | null {
  if (!date) return null;
  const full = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (full) return isoToDays(`${full[3]}-${full[2]}-${full[1]}`);
  const month = /^([a-z]{3})\/(\d{4})$/.exec(date);
  if (month && MONTHS.includes(month[1]!)) {
    return isoToDays(`${month[2]}-${String(MONTHS.indexOf(month[1]!) + 1).padStart(2, '0')}-15`);
  }
  const years = /^(\d{4})(?:–(\d{4}))?$/.exec(date);
  if (years) {
    const from = isoToDays(`${years[1]}-07-01`);
    return years[2] ? (from + isoToDays(`${years[2]}-07-01`)) / 2 : from;
  }
  return null;
}

/** A foto da missão mais próxima de um instante (dias desde J2000): a galeria abre nela a partir de um evento. */
export function imageIndexNear(missionId: ProbeId, t: number): number {
  let best = 0;
  let bestGap = Infinity;
  MISSION_IMAGES[missionId].forEach((image, i) => {
    const days = imageDays(image.date);
    if (days === null) return;
    const gap = Math.abs(days - t);
    if (gap < bestGap) [best, bestGap] = [i, gap];
  });
  return best;
}

/** A página do arquivo no Commons: autor, licença e o original em resolução máxima. */
export const commonsPageUrl = (file: string) => `${COMMONS}File:${encodeURIComponent(file)}`;

const NASA = 'NASA/JPL';

export const MISSION_IMAGES: Readonly<Record<ProbeId, readonly MissionImage[]>> = {
  venera7: [
    {
      file: 'Venera-7.jpg',
      title: 'A cápsula de pouso',
      caption:
        'Réplica em tamanho real no pavilhão Cosmos, em Moscou. A Venera 7 não tinha câmera: em 15/12/1970 ela pousou e mandou ' +
        '23 minutos de sinal fraco do solo de Vênus (≈ 475 °C e 90 atm), a primeira transmissão da superfície de outro planeta.',
      credit: 'Foto de museu (VDNKh, Moscou)',
      license: 'commons',
    },
    {
      file: 'Venera-7_spuskaemiy_apparat.jpg',
      title: 'Cápsula de descida',
      caption: 'Outro modelo da cápsula de descida: uma esfera reforçada, projetada para aguentar até 180 atm.',
      credit: 'Foto de museu',
      license: 'commons',
    },
  ],
  pioneer10: [
    {
      file: 'Pioneer10-plaque.jpg',
      title: 'A placa da Pioneer',
      date: '1972',
      caption:
        'Placa de alumínio anodizado com ouro, levada pelas Pioneer 10 e 11. Desenho de Carl Sagan e Frank Drake, arte de ' +
        'Linda Salzman Sagan: um homem e uma mulher, o hidrogênio como régua e a posição do Sol em relação a 14 pulsares.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'Pioneer_10_at_Jupiter.jpg',
      title: 'Júpiter pela Pioneer 10',
      date: 'dez/1973',
      caption:
        'A primeira nave a atravessar o cinturão de asteroides e a passar por Júpiter. A câmera tinha só dois filtros de cor: ' +
        'as cores são uma composição.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  pioneer11: [
    {
      file: 'Pioneer_11_Saturn.jpg',
      title: 'Saturno pela Pioneer 11',
      date: '31/08/1979',
      caption:
        'A primeira visita a Saturno, um ano antes das Voyagers, a 1,58 milhão de km. No dia seguinte a sonda passou a 21 000 km das nuvens.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Pioneer_11_Image_of_Saturn_and_Its_Moon_Titan.jpg',
      title: 'Saturno e Titã',
      date: '26/08/1979',
      caption: 'Saturno, os anéis e a maior lua, Titã, na aproximação.',
      credit: 'NASA Ames',
      license: 'pd',
    },
  ],
  mariner10: [
    {
      file: 'Reprocessed_Mariner_10_image_of_Mercury.jpg',
      title: 'Mercúrio',
      date: '1974',
      caption:
        'Mosaico reprocessado: a primeira vez que alguém viu a superfície de Mercúrio, crivada de crateras como a Lua. ' +
        'Nos três sobrevoos, a Mariner 10 fotografou menos da metade do planeta.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Venus_from_Mariner_10.jpg',
      title: 'Vênus',
      date: 'fev/1974',
      caption:
        'Vênus dias depois do sobrevoo de 05/02/1974, o primeiro estilingue gravitacional da história, que desviou a sonda ' +
        'para Mercúrio. As nuvens só mostram detalhes no ultravioleta.',
      credit: 'NASA/JPL-Caltech',
      license: 'pd',
    },
  ],
  viking1: [
    {
      file: 'First_Mars_Surface_Photo_(9467449402).jpg',
      title: 'A primeira foto do solo de Marte',
      date: '20/07/1976',
      caption:
        'Minutos depois do pouso em Chryse Planitia: pedras, poeira e, no canto direito, o pé nº 2 do módulo. ' +
        'A imagem chegou linha por linha, da esquerda para a direita.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'PIA00563-Viking1-FirstColorImage-19760721.jpg',
      title: 'A primeira foto colorida',
      date: '21/07/1976',
      caption: 'No dia seguinte ao pouso: o solo avermelhado de Marte, rico em óxido de ferro, até o horizonte.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Martian_face_viking.jpg',
      title: 'O «rosto» de Cydonia',
      date: '25/07/1976',
      caption:
        'Foto do orbitador da Viking 1: com luz rasante e pouca resolução, um morro parece um rosto. ' +
        'Sondas posteriores mostraram uma colina comum, um exemplo clássico de pareidolia.',
      credit: NASA,
      license: 'pd',
    },
  ],
  viking2: [
    {
      file: 'First_Color_Image_of_the_Viking_Lander_2_Site.jpg',
      title: 'Utopia Planitia',
      date: 'set/1976',
      caption: 'A primeira foto colorida do local de pouso da Viking 2: uma planície coberta de pedras porosas, a cerca de 6 500 km da Viking 1.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Ice_on_Mars_Utopia_Planitia_(PIA00571).jpg',
      title: 'Geada em Marte',
      date: '18/05/1979',
      caption:
        'Uma camada finíssima de gelo de água sobre as pedras, no inverno marciano. A mesma geada tinha aparecido ' +
        'um ano marciano antes (23 meses terrestres).',
      credit: NASA,
      license: 'pd',
    },
  ],
  voyager2: [
    {
      file: 'Uranus2.jpg',
      title: 'Urano',
      date: 'jan/1986',
      caption: 'A única visita a Urano até hoje: em luz visível, quase sem detalhes. O planeta gira deitado, com o eixo inclinado 98°.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Neptune_Full.jpg',
      title: 'Netuno',
      date: 'ago/1989',
      caption:
        'A única visita a Netuno: a Grande Mancha Escura, do tamanho da Terra, e nuvens claras de metano. ' +
        'Os ventos passam de 2 000 km/h, os mais rápidos do Sistema Solar.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Triton_moon_mosaic_Voyager_2_(large).jpg',
      title: 'Tritão',
      date: '25/08/1989',
      caption:
        'A maior lua de Netuno, com gêiseres de nitrogênio no polo sul e o terreno de «casca de melão». ' +
        'Gira ao contrário: deve ser um objeto do Cinturão de Kuiper capturado.',
      credit: 'NASA/JPL/USGS',
      license: 'pd',
    },
    {
      file: 'Voyager_2_Neptune_and_Triton.jpg',
      title: 'Despedida',
      date: 'ago/1989',
      caption: 'Três dias depois da passagem, os crescentes de Netuno e Tritão. A sonda segue para o sul, para fora do Sistema Solar.',
      credit: NASA,
      license: 'pd',
    },
  ],
  voyager1: [
    {
      file: 'Pale_Blue_Dot.png',
      title: 'O Pálido Ponto Azul',
      date: '14/02/1990',
      caption:
        'A 6 bilhões de km, a Terra é um ponto de 0,12 pixel num raio de luz do Sol espalhada na câmera. ' +
        'A ideia foi de Carl Sagan: «Olhe de novo para esse ponto. É aqui. É a nossa casa. Somos nós.»',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Family_portrait_(Voyager_1).png',
      title: 'Retrato de família',
      date: '14/02/1990',
      caption:
        'As 60 imagens do mesmo dia, de 32° acima do plano dos planetas: Vênus, Terra, Júpiter, Saturno, Urano e Netuno ' +
        '(Mercúrio e Marte se perderam na luz do Sol). Logo depois, as câmeras foram desligadas para sempre.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Great_Red_Spot_From_Voyager_1.jpg',
      title: 'A Grande Mancha Vermelha',
      date: '25/02/1979',
      caption: 'A 9,2 milhões de km, com detalhes de 160 km: uma tempestade maior que a Terra, observada desde o século XIX.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Io_with_Loki_Plume_on_Bright_Limb_(cropped).jpg',
      title: 'Vulcões em Io',
      date: '05/03/1979',
      caption:
        'A pluma do vulcão Loki, na borda, e o depósito em forma de coração do vulcão Pelé. Dias depois, Linda Morabito ' +
        'achou uma pluma numa imagem de navegação: o primeiro vulcanismo ativo visto fora da Terra.',
      credit: 'NASA/JPL/USGS',
      license: 'pd',
    },
  ],
  venera13: [
    {
      file: 'Surface_of_Venus_taken_by_Venera_13_(panoramic).jpg',
      title: 'A superfície de Vênus',
      date: '01/03/1982',
      caption:
        'As duas câmeras, em lados opostos, mostram rochas em placas e solo escuro, a 457 °C e 89 atm. ' +
        'A Venera 13 resistiu 127 minutos; o plano era 32.',
      credit: 'Programa espacial soviético',
      license: 'commons',
    },
    {
      file: 'USSR_Venera_13_1982_-_Venus_ground_recolorized.jpg',
      title: 'Em cor',
      date: '01/03/1982',
      caption:
        'A mesma paisagem com as cores reconstituídas: a luz que atravessa as nuvens de Vênus é alaranjada. ' +
        'Embaixo, a borda dentada do módulo de pouso.',
      credit: 'Programa espacial soviético; cores reprocessadas',
      license: 'commons',
    },
  ],
  magellan: [
    {
      file: 'Venus_globe.jpg',
      title: 'Vênus sem nuvens',
      date: '1990–1994',
      caption:
        'Mosaico do radar sobre um globo calculado: 98% da superfície, que nenhuma câmera vê através das nuvens. ' +
        'As cores imitam as das fotos das Veneras.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Maat_Mons_on_Venus.jpg',
      title: 'Maat Mons em 3D',
      date: '1991',
      caption:
        'Um vulcão de 8 km de altura, visto em perspectiva a 560 km, com o relevo exagerado 22,5 vezes: o radar e o altímetro da Magellan combinados.',
      credit: NASA,
      license: 'pd',
    },
  ],
  galileo: [
    {
      file: 'Earth-Moon_System.jpg',
      title: 'A Terra e a Lua',
      date: '16/12/1992',
      caption: 'A cerca de 6 milhões de km, depois do segundo sobrevoo da Terra, a caminho de Júpiter: a Lua em primeiro plano.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Galileo_Ida_n_Dactyl.jpg',
      title: 'Ida e Dáctilo',
      date: '28/08/1993',
      caption: 'O asteroide Ida, de 60 km, e à direita Dáctilo, de 1,4 km: a primeira lua de asteroide confirmada.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Io_highest_resolution_true_color.jpg',
      title: 'Io',
      date: '03/07/1999',
      caption: 'O corpo com mais vulcões ativos do Sistema Solar, em cor aproximada: enxofre e lava. O calor vem das marés de Júpiter.',
      credit: 'NASA/JPL/Universidade do Arizona',
      license: 'pd',
    },
    {
      file: 'PIA19048_realistic_color_Europa_mosaic.jpg',
      title: 'Europa',
      date: '1995–1998',
      caption: 'Gelo cortado por fissuras avermelhadas, sobre um oceano de água salgada: um dos lugares mais promissores para procurar vida.',
      credit: 'NASA/JPL-Caltech/SETI Institute',
      license: 'pd',
    },
  ],
  cassini: [
    {
      file: 'Saturn_during_Equinox.jpg',
      title: 'Saturno no equinócio',
      date: '2008–2009',
      caption: 'Mosaico perto do equinócio de agosto de 2009, quando o Sol ilumina os anéis exatamente de lado.',
      credit: 'NASA/JPL/Space Science Institute',
      license: 'pd',
    },
    {
      file: 'The_Day_the_Earth_Smiled_-_PIA17172.jpg',
      title: 'O dia em que a Terra sorriu',
      date: '19/07/2013',
      caption:
        'Saturno eclipsa o Sol e a Cassini fotografa os anéis contra a luz, em 141 imagens. A Terra é o ponto azul entre ' +
        'os anéis E e G, a 1,4 bilhão de km; quem estava aqui foi avisado para acenar.',
      credit: 'NASA/JPL-Caltech/Space Science Institute',
      license: 'pd',
    },
    {
      file: 'Fountains_of_Enceladus_PIA07758.jpg',
      title: 'Os gêiseres de Encélado',
      date: 'nov/2005',
      caption: 'Jatos de vapor e gelo no polo sul de Encélado, que alimentam o anel E. Debaixo da crosta há um oceano de água líquida.',
      credit: 'NASA/JPL/Space Science Institute',
      license: 'pd',
    },
    {
      file: 'Huygens_surface_color.jpg',
      title: 'O solo de Titã',
      date: '14/01/2005',
      caption:
        'A Huygens pousou em Titã, o pouso mais distante já feito, e fotografou seixos de gelo de água e hidrocarbonetos. ' +
        'As cores são reconstituídas pelo espectro medido.',
      credit: 'ESA/NASA/JPL/Universidade do Arizona',
      license: 'pd',
    },
  ],
  rosetta: [
    {
      file: 'Comet_67P_on_19_September_2014_NavCam_mosaic.jpg',
      title: 'Cometa 67P',
      date: '19/09/2014',
      caption: 'O núcleo de 4 km em forma de «patinho de borracha»: dois lobos unidos por um pescoço. Mosaico da câmera de navegação.',
      credit: 'ESA/Rosetta/NAVCAM',
      license: 'cc-by-sa-igo',
    },
    {
      file: 'Comet_67P_on_30_October_2014_NavCam_D.jpg',
      title: 'Penhascos do cometa',
      date: '30/10/2014',
      caption: 'A 26,8 km do centro do núcleo, duas semanas antes do pouso da Philae (12/11/2014): penhascos, rochas e poeira escura como carvão.',
      credit: 'ESA/Rosetta/NAVCAM',
      license: 'cc-by-sa-igo',
    },
  ],
  newhorizons: [
    {
      file: 'Pluto_in_True_Color_-_High-Res.jpg',
      title: 'Plutão',
      date: '14/07/2015',
      caption: 'Em cor real: a planície de gelo de nitrogênio Sputnik Planitia (o «coração»), montanhas de gelo de água e manchas avermelhadas de tolinas.',
      credit: 'NASA/JHUAPL/SwRI',
      license: 'pd',
    },
    {
      file: 'Charon_in_True_Color_-_High-Res.jpg',
      title: 'Caronte',
      date: '14/07/2015',
      caption:
        'A maior lua de Plutão, com a mancha avermelhada Mordor Macula no polo norte: metano que escapa de Plutão, alterado pela luz ultravioleta.',
      credit: 'NASA/JHUAPL/SwRI',
      license: 'pd',
    },
    {
      file: 'UltimaThule_CA06_color_20190516.png',
      title: 'Arrokoth',
      date: '01/01/2019',
      caption: 'A 6,6 bilhões de km, o objeto mais distante já visitado: dois lobos que se juntaram devagar quando o Sistema Solar se formava.',
      credit: 'NASA/JHUAPL/SwRI',
      license: 'pd',
    },
  ],
  dawn: [
    {
      file: 'Vesta_full_mosaic.jpg',
      title: 'Vesta',
      date: '2011–2012',
      caption: 'Mosaico das melhores vistas: a montanha do polo sul (embaixo), com 22 km de altura, e as crateras «boneco de neve» (em cima, à esquerda).',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA',
      license: 'pd',
    },
    {
      file: 'Ceres_RC3_with_bright_spots.jpg',
      title: 'Ceres',
      date: 'mai/2015',
      caption: 'A cratera Occator, no centro, e suas manchas brilhantes: carbonato de sódio deixado por salmoura que subiu do interior.',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA',
      license: 'pd',
    },
  ],
  juno: [
    {
      file: 'PIA22946-Jupiter-RedSpot-JunoSpacecraft-20190212.jpg',
      title: 'A Grande Mancha Vermelha',
      date: '12/02/2019',
      caption:
        'Imagens da JunoCam tiradas rente às nuvens na 17ª passagem e projetadas numa esfera, processadas pelo cientista cidadão Kevin M. Gill.',
      credit: 'NASA/JPL-Caltech/SwRI/MSSS/Kevin M. Gill',
      license: 'pd',
    },
    {
      file: 'PIA24681-1041-Ganymede-JupiterMoon-Juno-20210607.jpg',
      title: 'Ganimedes',
      date: '07/06/2021',
      caption: 'A 1 038 km da maior lua do Sistema Solar, a passagem mais próxima em mais de 20 anos. Filtro verde da JunoCam.',
      credit: 'NASA/JPL-Caltech/SwRI/MSSS',
      license: 'pd',
    },
  ],
  parker: [
    {
      file: 'WISPR_first_light_image.png',
      title: 'Primeira luz da WISPR',
      date: 'set/2018',
      caption:
        'A câmera WISPR fica à sombra do escudo térmico e olha para o lado do Sol: vê a coroa e o vento solar saindo dela. A primeira imagem, de setembro de 2018.',
      credit: 'NASA/Naval Research Laboratory/Parker Solar Probe',
      license: 'pd',
    },
  ],
  apollo8: [
    {
      file: 'NASA-Apollo8-Dec24-Earthrise.jpg',
      title: 'Nascer da Terra',
      date: '24/12/1968',
      caption:
        'William Anders fotografa a Terra surgindo no horizonte da Lua. «Saímos para explorar a Lua e, em vez disso, descobrimos a Terra.»',
      credit: 'NASA/Bill Anders',
      license: 'pd',
    },
  ],
  apollo10: [
    {
      file: 'Apollo_10_Lunar_Module_Rendezvous.jpg',
      title: 'Snoopy volta a Charlie Brown',
      date: 'mai/1969',
      caption:
        'O estágio de subida do módulo lunar «Snoopy» se aproxima do módulo de comando «Charlie Brown», depois de descer a 15 km da superfície no ensaio geral do pouso.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo11: [
    {
      file: 'Aldrin_Apollo_11_original.jpg',
      title: 'Buzz Aldrin na Lua',
      date: '20/07/1969',
      caption:
        'Foto de Neil Armstrong, que aparece refletido na viseira com o módulo Eagle. É a imagem como foi exposta; ' +
        'a versão divulgada foi girada e ganhou um céu negro em cima.',
      credit: 'NASA/Neil Armstrong',
      license: 'pd',
    },
    {
      file: 'Apollo_11_bootprint.jpg',
      title: 'Pegada',
      date: '20/07/1969',
      caption: 'Uma pegada de Aldrin, fotografada para estudar como o solo lunar se compacta. Sem vento nem chuva, pode durar milhões de anos.',
      credit: 'NASA/Buzz Aldrin',
      license: 'pd',
    },
    {
      file: 'Buzz_salutes_the_U.S._Flag.jpg',
      title: 'A bandeira',
      date: '20/07/1969',
      caption: 'Aldrin ao lado da bandeira, com o Eagle ao fundo. Uma haste horizontal mantém a bandeira aberta, já que não há ar.',
      credit: 'NASA/Neil Armstrong',
      license: 'pd',
    },
  ],
  apollo12: [
    {
      file: 'Apollo12ConradSurveyor.jpg',
      title: 'Conrad e a Surveyor 3',
      date: '20/11/1969',
      caption:
        'Pete Conrad examina a sonda Surveyor 3, que pousara ali em abril de 1967: o pouso de precisão foi a ~180 m dela. ' +
        'Ao fundo, o módulo Intrepid. Peças da Surveyor voltaram para a Terra.',
      credit: 'NASA/Alan Bean',
      license: 'pd',
    },
  ],
  apollo13: [
    {
      file: 'Apollo_13_Service_Module_-_AS13-59-8500.jpg',
      title: 'O módulo de serviço avariado',
      date: '17/04/1970',
      caption:
        'Fotografado depois da separação, pouco antes da reentrada: um painel inteiro arrancado pela explosão do tanque de oxigênio nº 2. ' +
        'Só então a tripulação viu o estrago.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo14: [
    {
      file: 'Shepard_Plants_Flag_-_GPN-2000-001120.jpg',
      title: 'Shepard em Fra Mauro',
      date: '05/02/1971',
      caption: 'Alan Shepard, o primeiro americano no espaço (1961), ao lado da bandeira nas terras altas de Fra Mauro, o destino que a Apollo 13 não alcançou.',
      credit: 'NASA/Edgar Mitchell',
      license: 'pd',
    },
    {
      file: 'Crescent_Earth_and_Venus_over_the_Apollo_14_LM.jpg',
      title: 'A Terra e Vênus sobre o Antares',
      caption: 'A Terra crescente e Vênus no céu negro, sobre o módulo lunar Antares.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo15: [
    {
      file: 'Apollo_15_flag,_rover,_LM,_Irwin.jpg',
      title: 'Irwin, o jipe e o Falcon',
      date: '01/08/1971',
      caption: 'James Irwin saúda a bandeira; ao centro, o módulo lunar Falcon, à direita o primeiro jipe lunar e, ao fundo, o monte Hadley Delta.',
      credit: 'NASA/David Scott',
      license: 'pd',
    },
    {
      file: 'Apollo_15_Hadley_Rille.jpg',
      title: 'O vale de Hadley',
      caption: 'O vale sinuoso de Hadley (Rima Hadley), um antigo canal de lava, ao lado do local de pouso.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo16: [
    {
      file: 'John_W._Young_on_the_Moon.jpg',
      title: 'O salto de John Young',
      date: '21/04/1972',
      caption: 'John Young salta cerca de 42 cm na gravidade lunar enquanto saúda a bandeira, com o módulo Orion à esquerda. Foto de Charles Duke.',
      credit: 'NASA/Charles Duke',
      license: 'pd',
    },
  ],
  apollo17: [
    {
      file: 'The_Blue_Marble,_AS17-148-22727.jpg',
      title: 'A Bolinha Azul (Blue Marble)',
      date: '07/12/1972',
      caption: 'A cerca de 29 000 km, com o Sol atrás da nave: a Terra inteira iluminada, da África à Antártida. Uma das fotos mais reproduzidas da história.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Moon-apollo17-schmitt_boulder.jpg',
      title: 'Schmitt e a rocha partida',
      date: '13/12/1972',
      caption:
        'O geólogo Harrison Schmitt, o único cientista a pisar na Lua, ao lado de uma rocha partida na estação 6, ao pé do maciço Norte do vale Taurus-Littrow.',
      credit: 'NASA/Eugene Cernan',
      license: 'pd',
    },
  ],
};
