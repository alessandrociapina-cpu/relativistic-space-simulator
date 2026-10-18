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
      file: 'Venera-4_model_in_museum.JPG',
      title: 'A nave (modelo da Venera 4)',
      caption:
        'Modelo da estação Venera 4 no Museu Memorial da Cosmonáutica, em Moscou. A Venera 7 herdou a mesma arquitetura: ' +
        'o módulo de voo, com painéis solares e antena, e a cápsula esférica, que se soltava antes de entrar na atmosfera.',
      credit: 'Foto de museu (Moscou)',
      license: 'commons',
    },
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
    {
      file: '1972_CPA_4166.jpg',
      title: 'Selo soviético',
      date: '15/09/1972',
      caption:
        'Selo dos Correios da URSS em homenagem à Venera 7, que em 15/12/1970 fez o primeiro pouso suave em outro planeta ' +
        'e a primeira transmissão do seu solo.',
      credit: 'Correios da URSS',
      license: 'pd',
    },
  ],
  pioneer10: [
    {
      file: 'Pioneer_10_on_its_kickmotor.jpg',
      title: 'Pronta no Cabo Kennedy',
      date: '26/02/1972',
      caption:
        'Recém-entregue pela TRW à NASA, dias antes do lançamento. A sonda gira para se estabilizar, e a energia vem de quatro ' +
        'geradores nucleares (RTG): em Júpiter, a luz do Sol é 27 vezes mais fraca que na Terra.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'Launch_of_Pioneer_10-2.jpg',
      title: 'O lançamento',
      date: '02/03/1972',
      caption:
        'Um Atlas-Centaur com um terceiro estágio lança a Pioneer 10 do Cabo Kennedy. Mais rápida que qualquer nave até então, ' +
        'ela cruzou a órbita da Lua 11 horas depois.',
      credit: 'NASA Ames',
      license: 'pd',
    },
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
      title: 'A Pioneer 10 em Júpiter (arte)',
      date: '1973',
      caption:
        'Pintura de Rick Guidice para a NASA Ames: a primeira nave a atravessar o cinturão de asteroides e a passar por Júpiter, ' +
        'em 04/12/1973, a cerca de 130 000 km das nuvens.',
      credit: 'NASA Ames/Rick Guidice',
      license: 'pd',
    },
    {
      file: 'Pioneer_10_Jupiter_1974_GPN-2000-001698.jpg',
      title: 'A Grande Mancha Vermelha',
      date: 'dez/1973',
      caption:
        'A 2,7 milhões de km, na aproximação: a Grande Mancha Vermelha, onde caberiam várias Terras, e as faixas de nuvens. ' +
        'Na época das Pioneer, a mancha se destacava mais que na passagem das Voyagers.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'Pioneer10_color_A5.png',
      title: 'Júpiter de perto',
      date: 'dez/1973',
      caption:
        'Em 03/12/1973, a 726 000 km, na véspera da maior aproximação. O fotopolarímetro varria uma linha a cada giro da sonda e ' +
        'só tinha filtros vermelho e azul: as cores são uma composição.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'Ganymede_as_seen_by_Pioneer_10_(ARC-1973-AC73-9279).jpg',
      title: 'Ganimedes',
      date: 'dez/1973',
      caption:
        'A maior lua do Sistema Solar, maior que Mercúrio, na imagem mais próxima da Pioneer 10: só manchas claras e escuras, ' +
        'que lembraram Marte aos cientistas. Os detalhes da superfície vieram com as Voyagers.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'Composite_Pioneer_10_imagery_Excitement_rose_as_the_PICS_displayed_images_of_Jupiter_of_ever-increasing_size_as_Pioneer_10_plunged_at_high_speed_toward_its_closest_approach_to_the_planet_(ARC-1973-AC73-9341).jpg',
      title: 'Nascer do Sol em Júpiter',
      date: 'dez/1973',
      caption:
        'Depois da maior aproximação, a sonda saiu de trás do planeta e viu Júpiter em crescente, um ângulo impossível da Terra. ' +
        'As imagens, montadas linha a linha enquanto a sonda passava em alta velocidade, saíram muito distorcidas.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'Pioneer_Jupiter_1975_Issue-10c.jpg',
      title: 'Selo da missão',
      date: '28/02/1975',
      caption: 'Selo de 10 centavos dos Correios dos EUA em homenagem à Pioneer 10, lançado numa cerimônia no Centro Ames da NASA.',
      credit: 'Correios dos EUA (USPS)',
      license: 'pd',
    },
  ],
  pioneer11: [
    {
      file: 'CAPE_KENNEDY,_Fla_(KSC-73P-0116).jpg',
      title: 'À espera da coifa',
      date: '16/03/1973',
      caption:
        'A Pioneer G aguarda a coifa protetora no Cabo Kennedy; no espaço, virou Pioneer 11. Gêmea da Pioneer 10, ' +
        'levava a mesma placa e os mesmos instrumentos.',
      credit: 'NASA/KSC',
      license: 'pd',
    },
    {
      file: 'Atlas-Centaur_launching_Pioneer_11.jpg',
      title: 'O lançamento',
      date: '05/04/1973',
      caption:
        'O Atlas-Centaur parte à noite do Complexo 36 do Cabo Kennedy, 13 meses depois da Pioneer 10. ' +
        'Só depois do sucesso da gêmea em Júpiter a NASA decidiu mandar a Pioneer 11 também a Saturno.',
      credit: 'NASA/KSC',
      license: 'pd',
    },
    {
      file: 'Pioneer_f18.gif',
      title: 'A Grande Mancha Vermelha',
      date: 'dez/1974',
      caption:
        'A melhor imagem da Grande Mancha Vermelha pela Pioneer 11. A sonda passou a 43 000 km das nuvens, três vezes mais perto ' +
        'que a Pioneer 10, e depressa, para ficar pouco tempo nos cinturões de radiação.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'The_planet_Jupiter_as_seen_from_above_its_north_pole_by_Pioneer_11.jpg',
      title: 'O polo norte de Júpiter',
      date: 'dez/1974',
      caption:
        'A primeira vista das regiões polares de Júpiter, que da Terra só se veem de lado: a rota da Pioneer 11 subia sobre o polo. ' +
        'Perto dele, as faixas de nuvens se desfazem em manchas. O polo fica perto da linha entre o dia e a noite, no alto.',
      credit: 'NASA Ames',
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
      file: 'Pntitan.jpg',
      title: 'Titã',
      date: '02/09/1979',
      caption:
        'Já de saída, a Pioneer 11 passou a 360 000 km de Titã e montou esta imagem com cinco fotos: um disco envolto em névoa, ' +
        'sem nenhum detalhe da superfície.',
      credit: 'NASA Ames',
      license: 'pd',
    },
  ],
  mariner10: [
    {
      file: 'Mariner_10_prepared_for_encapsulation.jpg',
      title: 'Pronta para a coifa',
      date: '21/09/1973',
      caption:
        'Técnicos preparam a Mariner 10 para ser encapsulada no Centro Espacial Kennedy. Ela seria a primeira sonda a visitar ' +
        'dois planetas e a primeira a usar a gravidade de um (Vênus) para chegar a outro (Mercúrio).',
      credit: 'NASA/KSC',
      license: 'pd',
    },
    {
      file: 'Atlas-Centaur_launch_with_Mariner_10.jpg',
      title: 'O lançamento',
      date: '03/11/1973',
      caption: 'O Atlas-Centaur parte do Cabo Canaveral com a Mariner 10, pouco depois da meia-noite, rumo a Vênus e Mercúrio.',
      credit: 'NASA/MSFC',
      license: 'pd',
    },
    {
      file: 'Earth_&_Moon_by_Mariner_10.jpg',
      title: 'A Terra e a Lua',
      date: '03/11/1973',
      caption:
        'Menos de 12 horas depois do lançamento, as duas câmeras foram ligadas e fizeram centenas de fotos da Terra e da Lua, ' +
        'para testar e calibrar o sistema antes de Vênus.',
      credit: 'NASA/JPL/Northwestern University',
      license: 'pd',
    },
    {
      file: 'Mariner_10’s_First_Close-Up_Photo_of_Venus_(amf-a14eb6ab-9451-457b-9952-3e1d7e0fd6a2).jpg',
      title: 'Vênus no ultravioleta',
      date: '05/02/1974',
      caption:
        'A primeira foto de perto, com filtro ultravioleta e cores realçadas. As faixas em «Y» das nuvens revelaram a ' +
        'super-rotação: a atmosfera dá a volta no planeta em cerca de 4 dias, enquanto o solo leva 243.',
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
    {
      file: 'Mercury_(outbound_view).jpg',
      title: 'Mercúrio de saída',
      date: 'mar/1974',
      caption:
        'Depois de passar pelo lado noturno no primeiro sobrevoo (29/03/1974), a sonda fotografou o outro hemisfério, ' +
        'mais iluminado, com o norte no alto: crateras sobre crateras, como nas terras altas da Lua.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'PIA02439_Caloris_Basin.jpg',
      title: 'A bacia Caloris',
      date: '1974',
      caption:
        'Uma das maiores bacias de impacto do Sistema Solar, com mais de 1 300 km, parecida com o Mare Imbrium da Lua. ' +
        'O nome (calor, em latim) vem de ela ficar de frente para o Sol no periélio; a Mariner 10 só viu metade dela.',
      credit: 'NASA/JPL/Northwestern University',
      license: 'pd',
    },
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
      file: 'Degas_merc_mar10_big.gif',
      title: 'A cratera Degas',
      date: '1974–1975',
      caption:
        'Uma cratera de 45 km com raios brilhantes de material ejetado, sinal de um impacto recente. ' +
        'Mosaico de imagens do primeiro e do terceiro sobrevoos, com o norte no alto.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  viking1: [
    {
      file: 'Viking_I_Spacecraft_in_Cleanroom_-_GPN-2000-001630.jpg',
      title: 'O módulo de pouso em montagem',
      date: 'mai/1974',
      caption:
        'Na Martin Marietta, perto de Denver: câmeras estéreo, estação meteorológica, laboratório automático de análise ' +
        'e o experimento de biologia que procuraria vida em Marte.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Titan_3E-Centaur_launches_with_Viking_1.jpg',
      title: 'O lançamento',
      date: '20/08/1975',
      caption:
        'Um Titan IIIE-Centaur parte do Complexo 41 do Cabo Canaveral com as 4 toneladas do orbitador e do módulo de pouso, ' +
        'para uma viagem de 11 meses até Marte.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Half-Mars_hangs_in_space_685,000_kilometers_(425,000_miles)_above_Viking_1_as_the_spacecraft_approaches_the_planet_(101-ksc-76p-300).jpg',
      title: 'Chegando a Marte',
      date: '16/06/1976',
      caption:
        'A 685 000 km, três dias antes de entrar em órbita (19/06/1976), uma das câmeras do orbitador vê meio Marte, ' +
        'com filtro violeta. O pouso esperou um mês, até o orbitador achar um local seguro.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'First_Mars_Surface_Photo_(9467449402).jpg',
      title: 'A primeira foto do solo de Marte',
      date: '20/07/1976',
      caption:
        'Minutos depois do pouso em Chryse Planitia: pedras, poeira e, no canto direito, o pé nº 2 do módulo. ' +
        'A imagem chegou linha por linha, da esquerda para a direita.',
      credit: NASA,
      license: 'commons',
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
    {
      file: 'MarsViking1Lander-BigJoeRock-19780211.jpg',
      title: 'A pedra Big Joe',
      date: '11/02/1978',
      caption:
        'No sol 556 do módulo: à esquerda do centro, a pedra que os cientistas apelidaram de «Big Joe», com cerca de 2 m, ' +
        'coberta em parte por solo vermelho.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Phobos-viking1.jpg',
      title: 'Fobos',
      date: '19/10/1978',
      caption:
        'Montagem de três imagens tiradas a pouco mais de 600 km da lua maior de Marte, de uns 27 km. ' +
        'No alto, à esquerda, quase toda na sombra, a cratera Stickney, com cerca de 10 km.',
      credit: 'NASA/NSSDC',
      license: 'pd',
    },
    {
      file: 'Mars_Valles_Marineris.jpeg',
      title: 'O Valles Marineris',
      date: '22/02/1980',
      caption:
        'Mosaico de 102 imagens do orbitador, como se Marte fosse visto de 2 500 km de altura. No centro, o Valles Marineris, ' +
        'com mais de 3 000 km de comprimento e até 8 km de profundidade.',
      credit: 'NASA/USGS',
      license: 'pd',
    },
  ],
  viking2: [
    {
      file: 'KSC-75p-110_(101-KSC-75P-110).jpg',
      title: 'O módulo de pouso',
      date: '06/02/1975',
      caption:
        'Técnicos inspecionam o módulo de pouso da Viking 2 no Centro Espacial Kennedy. Antes do lançamento, ' +
        'os módulos foram esterilizados por calor, para não levar micróbios da Terra a Marte.',
      credit: 'NASA/KSC',
      license: 'pd',
    },
    {
      file: 'Titan_IIIE_Centaur_with_Viking_2_on_Launch_Complex_41.jpg',
      title: 'Na plataforma',
      date: '05/09/1975',
      caption: 'O Titan IIIE-Centaur com a Viking 2 no Complexo 41 do Cabo Canaveral, quatro dias antes do lançamento de 09/09/1975.',
      credit: 'NASA/KSC',
      license: 'pd',
    },
    {
      file: 'Mars_Viking_22a002.png',
      title: 'O primeiro panorama',
      date: '03/09/1976',
      caption:
        'A segunda imagem depois do pouso em Utopia Planitia, uma varredura de 330° em volta do módulo: ' +
        'pedras espalhadas até o horizonte, mais numerosas que no local da Viking 1.',
      credit: 'NASA/JPL; Roel van der Hoorn',
      license: 'pd',
    },
    {
      file: 'First_Color_Image_of_the_Viking_Lander_2_Site.jpg',
      title: 'Utopia Planitia',
      date: 'set/1976',
      caption: 'A primeira foto colorida do local de pouso da Viking 2: uma planície coberta de pedras porosas, a cerca de 6 500 km da Viking 1.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'PIA00145.jpg',
      title: 'A trincheira Bonneville',
      date: '25/09/1976',
      caption:
        'O braço coletor cava uma área de 20 × 23 cm entre pedras para buscar solo para a análise molecular. ' +
        'Uma câmera acompanhou de perto a operação, que exigia precisão.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Viking_2_Image_of_Mars_Utopian_Plain_-_GPN-2000-000426.jpg',
      title: 'Pedras até o horizonte',
      date: '23/11/1976',
      caption:
        'Pedras avermelhadas até o horizonte, a uns 3 km, e poeira fina assentada sobre o módulo. Os cientistas ' +
        'consideraram estas as cores verdadeiras: o céu cor de salmão vem da poeira suspensa no ar.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Deimos_viking2.jpg',
      title: 'Deimos',
      date: '20/10/1977',
      caption:
        'A menor lua de Marte, a 500 km do orbitador da Viking 2. De longe a superfície parece lisa: a poeira e os ' +
        'fragmentos (regolito) enterraram parte das crateras, que aparecem nas vistas mais próximas.',
      credit: 'NASA/NSSDC',
      license: 'pd',
    },
    {
      file: 'PIA00576_Martian_Sunrise_at_Utopia_Planitia.jpg',
      title: 'Nascer do Sol em Marte',
      date: '14/06/1978',
      caption: 'O Sol aparece no horizonte de Utopia Planitia no 631º sol (dia marciano) da Viking 2.',
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
      file: 'The_Sounds_of_Earth_Record_Cover_-_GPN-2000-001978.jpg',
      title: 'A capa do Disco de Ouro',
      date: '1977',
      caption:
        'A capa de alumínio banhado a ouro protege o disco dos micrometeoritos e ensina a tocá-lo: a agulha, a rotação, ' +
        'o tempo medido pela transição do hidrogênio e a posição do Sol em relação a 14 pulsares, como na placa da Pioneer. ' +
        'O desenho está dos dois lados da capa, porque o de fora vai sendo apagado.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Voyager_2_Launch_-_GPN-2003-000002.jpg',
      title: 'Lançamento',
      date: '20/08/1977',
      caption:
        'A Voyager 2 parte num Titan IIIE-Centaur, 16 dias antes da Voyager 1. O plano original só previa Júpiter e Saturno; ' +
        'um alinhamento raro dos planetas permitiu estender a viagem a Urano e Netuno.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Jupiter_from_Voyager_2.jpg',
      title: 'Júpiter',
      date: '30/06/1979',
      caption:
        'Mosaico de 3 × 3 imagens a 8,7 milhões de km, nove dias antes da maior aproximação, montado por Björn Jónsson. ' +
        'Tão perto, a câmera só usava os filtros laranja e violeta: o verde foi calculado a partir deles.',
      credit: 'NASA/JPL/Björn Jónsson',
      license: 'pd',
    },
    {
      file: 'Crescent_Europa_-_GPN-2000-000469.jpg',
      title: 'Europa',
      date: 'jul/1979',
      caption:
        'Gelo claro riscado por linhas escuras de mais de 1 000 km de comprimento e 2 a 3 km de largura, ' +
        'provavelmente fraturas da crosta. Elas fizeram suspeitar de um oceano debaixo do gelo.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Saturn_(planet)_large.jpg',
      title: 'Saturno e três luas',
      date: '04/08/1981',
      caption:
        'Em cor real, a 21 milhões de km, na aproximação: Tétis, Dione e Reia à esquerda e a sombra de Tétis ' +
        'no hemisfério sul do planeta.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Saturn_rings_voyager2_false_color.jpg',
      title: 'As cores dos anéis',
      date: '17/08/1981',
      caption:
        'Cores realçadas com imagens no ultravioleta, no claro e no laranja: as diferenças sutis vêm da composição ' +
        'das partículas de cada anel. A 8,9 milhões de km, nove dias antes da maior aproximação.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Uranus2.jpg',
      title: 'Urano',
      date: 'jan/1986',
      caption: 'A única visita a Urano até hoje: em luz visível, quase sem detalhes. O planeta gira deitado, com o eixo inclinado 98°.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: "Voyager_2's_best_image_of_Miranda.jpg",
      title: 'Miranda',
      date: '24/01/1986',
      caption:
        'A lua de Urano com a geologia mais estranha: penhascos, sulcos e regiões de aspecto completamente diferente, ' +
        'como peças coladas. Mosaico montado por Ted Stryk; nos 17 minutos entre a primeira e a última imagem, Miranda girou visivelmente.',
      credit: 'NASA/JPL/Ted Stryk',
      license: 'pd',
    },
    {
      file: 'Neptune_Full.jpg',
      title: 'Netuno',
      date: '20/08/1989',
      caption:
        'A única visita a Netuno: a Grande Mancha Escura, do tamanho da Terra, e nuvens claras de metano. ' +
        'Os ventos passam de 2 000 km/h, os mais rápidos do Sistema Solar.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: "Neptune's_Great_Dark_Spot.jpg",
      title: 'A Grande Mancha Escura',
      date: '23/08/1989',
      caption:
        'A última vista de frente da tempestade, 45 horas antes da passagem, a 2,8 milhões de km: cirros brancos sobre a borda ' +
        'e um giro em espiral no sentido anti-horário. Quando o Hubble olhou de novo, em 1994, ela tinha sumido.',
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
      date: '28/08/1989',
      caption: 'Três dias depois da passagem, os crescentes de Netuno e Tritão. A sonda segue para o sul, para fora do Sistema Solar.',
      credit: NASA,
      license: 'pd',
    },
  ],
  voyager1: [
    {
      file: 'The_Sounds_of_Earth_-_GPN-2000-001976.jpg',
      title: 'O Disco de Ouro',
      date: '1977',
      caption:
        'Disco de cobre banhado a ouro, de 30 cm, igual nas duas Voyagers: saudações em dezenas de línguas, músicas de várias ' +
        'culturas e épocas, sons da Terra e imagens codificadas no sinal. A seleção foi feita por uma comissão presidida por Carl Sagan.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Voyager_1_Launch.jpg',
      title: 'Lançamento',
      date: '05/09/1977',
      caption:
        'A Voyager 1 parte do Cabo Canaveral num Titan IIIE-Centaur, 16 dias depois da Voyager 2. ' +
        'Numa rota mais rápida, chegou antes a Júpiter e a Saturno: daí o número 1.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'First_Picture_of_the_Earth_and_Moon_in_a_Single_Frame_-_GPN-2002-000202.jpg',
      title: 'Terra e Lua no mesmo quadro',
      date: '18/09/1977',
      caption:
        'A primeira foto da Terra e da Lua juntas, tirada por uma nave a 11,66 milhões de km, 13 dias depois do lançamento. ' +
        'A Lua, muito mais escura que a Terra, foi clareada três vezes no processamento para aparecer.',
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
    {
      file: 'Jupiter_System_Montage_-_GPN-2000-000451.jpg',
      title: 'Júpiter e as luas galileanas',
      date: 'mar/1979',
      caption:
        'Colagem de fotos do início de março de 1979, fora de escala mas nas posições relativas: Io (em cima, à esquerda), ' +
        'Europa (no centro), Ganimedes e Calisto (embaixo, à direita). As descobertas da Voyager 1 mudaram o plano da Voyager 2.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'PIA00024_Saturn_With_Tethys_and_Dione.jpg',
      title: 'Saturno, Tétis e Dione',
      date: '03/11/1980',
      caption:
        'A 13 milhões de km: as sombras dos anéis e de Tétis nas nuvens, e a borda do planeta vista através da divisão de Cassini, ' +
        'o vão de 3 500 km entre os anéis A e B.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Titan_Haze.jpg',
      title: 'A névoa de Titã',
      date: '12/11/1980',
      caption:
        'A 22 000 km, as camadas de névoa sobre a borda de Titã, em cores falsas, com divisões a 200, 375 e 500 km de altitude. ' +
        'A passagem rente a Titã desviou a Voyager 1 para fora do plano dos planetas: depois de Saturno, nenhum outro encontro.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: "Saturn's_ring_system_-_Voyager_1.jpg",
      title: 'Os anéis',
      date: '12/11/1980',
      caption:
        'Oito horas depois da maior aproximação, a 720 000 km: de cima para baixo, o anel F, o anel A, a divisão de Cassini, ' +
        'o anel B e o anel C, com centenas de aneizinhos claros e escuros, como os sulcos de um disco.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Crescent_Saturn_as_seen_from_Voyager_1.jpg',
      title: 'Saturno crescente',
      date: '16/11/1980',
      caption:
        'Quatro dias depois da passagem, a 5,3 milhões de km, olhando para trás, na direção do Sol: a sombra do planeta ' +
        'sobre os anéis e o disco visto através deles. Uma vista impossível da Terra.',
      credit: NASA,
      license: 'pd',
    },
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
  ],
  venera13: [
    {
      file: 'Moscow._VDNKh._Pavillion_32_Cosmos._Venera_9_Lander_P5293259_2645.jpg',
      title: 'O módulo de pouso (modelo)',
      caption:
        'Modelo do módulo da Venera 9 (1975) no pavilhão Cosmos, em Moscou. A Venera 13 usou o mesmo projeto, aperfeiçoado: ' +
        'uma esfera reforçada, o disco de frenagem no alto e o anel de pouso embaixo.',
      credit: 'Foto de museu (VDNKh, Moscou)',
      license: 'commons',
    },
    {
      file: 'Surface_of_Venus_taken_by_Venera_13_(panoramic).jpg',
      title: 'A superfície de Vênus',
      date: '01/03/1982',
      caption:
        'As duas câmeras, em lados opostos, mostram rochas em placas e solo escuro, a 457 °C e 89 atm. ' +
        'A Venera 13 resistiu 127 minutos; o plano era 32.',
      credit: 'Programa espacial soviético',
      license: 'pd',
    },
    {
      file: 'USSR_Venera_13_1982_-_Venus_ground_recolorized.jpg',
      title: 'Em cor',
      date: '01/03/1982',
      caption:
        'A mesma paisagem com as cores reconstituídas: a luz que atravessa as nuvens de Vênus é alaranjada. ' +
        'Embaixo, a borda dentada do módulo de pouso.',
      credit: 'Programa espacial soviético; cores reprocessadas',
      license: 'pd',
    },
    {
      file: 'Surfaces_of_Venus,_Venere_13_and_Venera14.jpg',
      title: 'Venera 13 e Venera 14',
      date: 'mar/1982',
      caption:
        'Os panoramas das duas gêmeas com a perspectiva das câmeras corrigida, preparados para a NASA por Stephen Paul Meszaros. ' +
        'A Venera 14 pousou quatro dias depois da 13, em 05/03/1982.',
      credit: 'Lunar and Planetary Institute/Stephen Paul Meszaros',
      license: 'commons',
    },
    {
      file: '1982_CPA_5278.jpg',
      title: 'Selo soviético',
      date: '1982',
      caption: 'Selo dos Correios da URSS de 1982 em homenagem ao voo das estações automáticas Venera 13 e Venera 14.',
      credit: 'Correios da URSS',
      license: 'pd',
    },
  ],
  magellan: [
    {
      file: 'STS-30_deployment_of_inertial_upper_stage_(IUS)_with_Magellan_spacecraft_(S30-71-052).jpg',
      title: 'Saindo do Atlantis',
      date: 'mai/1989',
      caption:
        'No primeiro dia da missão STS-30, a Magellan, presa ao estágio IUS, se afasta do ônibus espacial Atlantis rumo a Vênus. ' +
        'Foto da tripulação pela janela de ré; foi a primeira sonda planetária lançada por um ônibus espacial.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'PIA00086_Mosaic_of_Large_Impact_Craters.jpg',
      title: 'A «fazenda de crateras»',
      date: 'set/1990',
      caption:
        'Três grandes crateras de impacto, Danilova, Aglaonice e Saskja, em planícies fraturadas de Lavinia, num mosaico das ' +
        'primeiras órbitas de mapeamento (15 a 19/09/1990). No radar, o terreno áspero aparece claro e o liso, escuro.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Fotla_Corona_PIA00202.jpg',
      title: 'Uma corona',
      date: 'jan/1991',
      caption:
        'Fotla Corona, uma estrutura circular de cerca de 200 km. As coronas, típicas de Vênus, se formam quando material quente ' +
        'sobe do manto, estufa a crosta e depois cede; logo ao norte há um domo «panqueca» de 35 km.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'PIA00084_Eistla_region_pancake_volcanoes.jpg',
      title: 'Domos «panqueca»',
      date: '1991',
      caption:
        'Domos vulcânicos de 65 km de diâmetro e topo plano com menos de 1 km de altura, na região de Eistla: ' +
        'lava muito viscosa que se espalhou devagar. As rachaduras e os poços vêm do resfriamento e da retirada da lava.',
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
      file: 'Cylindrical_Map_of_Venus.jpg',
      title: 'O mapa de Vênus',
      date: '1990–1994',
      caption:
        'Todas as imagens de radar da Magellan num mapa cilíndrico. Em quatro anos em órbita, a sonda mapeou 98% da superfície ' +
        'e mediu também o relevo e a gravidade do planeta.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Sapas_Mons.jpg',
      title: 'Sapas Mons',
      date: '1990–1994',
      caption:
        'Vulcão de 400 km de diâmetro e 1,5 km de altura em Atla Regio, em cores falsas, com derrames de lava sobrepostos. ' +
        'Como no Havaí, muitas erupções saíram dos flancos, não do cume.',
      credit: NASA,
      license: 'pd',
    },
  ],
  galileo: [
    {
      file: 'Galileo_Jupiter_Atmospheric_Probe_in_a_spacecraft_processing_room_(AC84-0228-3).jpg',
      title: 'A sonda atmosférica',
      date: '05/04/1984',
      caption:
        'O módulo de descida e o escudo térmico da sonda que a Galileo levou até Júpiter. Em 07/12/1995 ela entrou na atmosfera ' +
        'a cerca de 47 km/s, abriu o paraquedas e transmitiu por 58 minutos antes de sucumbir ao calor e à pressão.',
      credit: 'NASA Ames',
      license: 'pd',
    },
    {
      file: 'Galileo_spacecraft_&_inertial_upper_stage_deployment_on_STS-34_(S34-72-070).jpg',
      title: 'Saindo do Atlantis',
      date: '18/10/1989',
      caption:
        'A Galileo, presa ao estágio IUS, se afasta do ônibus espacial Atlantis menos de seis horas depois de chegar à órbita ' +
        '(missão STS-34). Foto da tripulação com uma Hasselblad de 70 mm.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'PIA00072_Venus_Cloud_Patterns_-_colorized_and_filtered.jpg',
      title: 'Vênus',
      date: '14/02/1990',
      caption:
        'Dias depois do sobrevoo de 10/02/1990, o primeiro dos três estilingues gravitacionais (Vênus, Terra e Terra) a caminho ' +
        'de Júpiter. No filtro violeta, em azul artificial e realçadas, as nuvens de ácido sulfúrico mostram convecção perto do equador.',
      credit: 'NASA/JPL-Caltech',
      license: 'pd',
    },
    {
      file: 'Galileo_Gaspra_Mosaic.jpg',
      title: 'Gaspra',
      date: '29/10/1991',
      caption:
        'A primeira foto de perto de um asteroide: Gaspra, de 19 × 12 × 11 km, a 5 300 km, dez minutos antes da maior aproximação. ' +
        'A superfície é coberta de pequenas crateras.',
      credit: NASA,
      license: 'pd',
    },
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
      file: 'SL9ImpactGalileo.jpg',
      title: 'Um cometa cai em Júpiter',
      date: '22/07/1994',
      caption:
        'Ainda a caminho, a 238 milhões de km, a Galileo viu diretamente os choques dos fragmentos do cometa ' +
        'Shoemaker-Levy 9, no lado do planeta que a Terra não via. Aqui, o clarão de um dos últimos fragmentos.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'Ganymede_g1_true-edit1.jpg',
      title: 'Ganimedes',
      date: 'jun/1996',
      caption:
        'Em cor natural, no primeiro encontro: regiões escuras e antigas, cheias de crateras, e faixas claras mais jovens, deformadas. ' +
        'É a maior lua do Sistema Solar, maior que Mercúrio, e a Galileo descobriu que ela tem campo magnético próprio.',
      credit: NASA,
      license: 'pd',
    },
    {
      file: 'PIA19048_realistic_color_Europa_mosaic_edited.jpg',
      title: 'Europa',
      date: '1995–1998',
      caption: 'Gelo cortado por fissuras avermelhadas, sobre um oceano de água salgada: um dos lugares mais promissores para procurar vida.',
      credit: 'NASA/JPL-Caltech/SETI Institute',
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
      file: 'Callisto.jpg',
      title: 'Calisto',
      date: 'mai/2001',
      caption:
        'A única imagem global em cor de Calisto feita pela Galileo: uma das superfícies mais crivadas de crateras do ' +
        'Sistema Solar, com cicatrizes claras de gelo sobre um terreno escuro e erodido.',
      credit: 'NASA/JPL/DLR',
      license: 'pd',
    },
  ],
  cassini: [
    {
      file: 'Cassini-Huygens_launch.jpg',
      title: 'O lançamento',
      date: '15/10/1997',
      caption:
        'Um Titan IVB/Centaur parte de Cabo Canaveral com a Cassini e a sonda Huygens presa a ela. ' +
        'A viagem até Saturno levou quase sete anos, com estilingues gravitacionais em Vênus (duas vezes), na Terra e em Júpiter.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Huygens_fish-eye_view_of_Titan.jpg',
      title: 'Titã a 5 km de altura',
      date: '14/01/2005',
      caption:
        'Projeção «olho de peixe» montada com as imagens da câmera de descida da Huygens a cerca de 5 km do solo: ' +
        'terrenos claros cortados por canais de drenagem e, em volta, a planície escura onde a sonda pousou.',
      credit: 'ESA/NASA/JPL/Universidade do Arizona',
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
    {
      file: 'Hyperion_true.jpg',
      title: 'Hipérion',
      date: '26/09/2005',
      caption:
        'Uma lua irregular, com cerca de 360 km no eixo maior e aspecto de esponja: é tão porosa que os impactos afundam o ' +
        'terreno em vez de espalhar material. Gira de modo caótico, sem eixo fixo. Cores aproximadamente reais.',
      credit: 'NASA/JPL/SSI/Gordan Ugarkovic',
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
      file: 'Iapetus_as_seen_by_the_Cassini_probe_-_20071008.jpg',
      title: 'Jápeto',
      date: 'set/2007',
      caption:
        'O hemisfério claro de Jápeto (1 468 km), em cores falsas, no sobrevoo de setembro de 2007. A lua tem duas faces: ' +
        'a que vai na frente da órbita é escura como carvão e a de trás é clara como neve. À direita, a transição entre as duas.',
      credit: 'NASA/JPL/Space Science Institute',
      license: 'pd',
    },
    {
      file: 'Saturn_during_Equinox.jpg',
      title: 'Saturno no equinócio',
      date: '2008–2009',
      caption: 'Mosaico perto do equinócio de agosto de 2009, quando o Sol ilumina os anéis exatamente de lado.',
      credit: 'NASA/JPL/Space Science Institute',
      license: 'pd',
    },
    {
      file: 'Mimas_Cassini.jpg',
      title: 'Mimas',
      date: '13/02/2010',
      caption:
        'No sobrevoo mais próximo, a cratera Herschel, de 130 km, domina a lua de cerca de 400 km, que lembra a Estrela da ' +
        'Morte de Guerra nas Estrelas. O impacto que a abriu quase despedaçou Mimas.',
      credit: 'NASA/JPL-Caltech/Space Science Institute',
      license: 'pd',
    },
    {
      file: 'Titan_and_rings_PIA14909.jpg',
      title: 'Titã diante de Saturno',
      date: '21/05/2011',
      caption:
        'A maior lua de Saturno, com 5 150 km, passa na frente do planeta e dos anéis, em cor natural, a 2,3 milhões de km. ' +
        'A atmosfera densa esconde a superfície numa névoa alaranjada; no alto, a capa polar norte aparece como uma camada destacada.',
      credit: 'NASA/JPL-Caltech/Space Science Institute',
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
      file: 'Top_view_of_the_rings_of_Saturn_by_Cassini_-_October_10,_2013.jpg',
      title: 'O hexágono visto do alto',
      date: '10/10/2013',
      caption:
        'Mosaico de 36 imagens em cor natural, bem acima do plano dos anéis. No polo norte, o hexágono: uma corrente de jato ' +
        'de seis lados, mais larga que duas Terras, em volta de um furacão polar.',
      credit: 'NASA/JPL-Caltech/SSI/Cornell',
      license: 'pd',
    },
    {
      file: 'PIA17218_–_A_Farewell_to_Saturn.jpg',
      title: 'Adeus a Saturno',
      date: '13/09/2017',
      caption:
        'O último mosaico completo de Saturno e dos anéis, pela câmera grande-angular, dois dias antes do fim. Em 15/09/2017, ' +
        'quase sem combustível, a Cassini mergulhou na atmosfera do planeta (o Grand Finale), para não contaminar Encélado e Titã.',
      credit: 'NASA/JPL-Caltech/Space Science Institute',
      license: 'pd',
    },
  ],
  rosetta: [
    {
      file: 'Rosetta_and_Philae_at_comet_(11206755953).jpg',
      title: 'A Rosetta e o Philae',
      caption:
        'Ilustração da ESA: o orbitador solta o módulo de pouso Philae sobre o cometa 67P (fora de escala). ' +
        'Com os painéis solares abertos, a Rosetta tinha 32 m de ponta a ponta.',
      credit: 'ESA/C. Carreau/ATG medialab',
      license: 'cc-by-sa-igo',
    },
    {
      file: 'Rosetta’s_self-portrait_at_Mars_(12743274474).jpg',
      title: 'Autorretrato em Marte',
      date: '25/02/2007',
      caption:
        'A câmera CIVA do Philae, ainda preso à nave, fotografou um dos painéis solares de 14 m sobre Marte, 4 minutos antes ' +
        'da passagem a 250 km da superfície. Foi um dos quatro estilingues gravitacionais da viagem (os outros três, na Terra). Cores acrescentadas.',
      credit: 'ESA',
      license: 'commons',
    },
    {
      file: 'Asteroid_Steins_a_diamond_in_space_pillars.jpg',
      title: 'O asteroide Šteins',
      date: '05/09/2008',
      caption:
        'A 800 km, a câmera OSIRIS vê um asteroide de cerca de 5 km em forma de diamante. No alto, uma cratera de 1,5 km, ' +
        'de um impacto que por pouco não o despedaçou.',
      credit: 'ESA/Rosetta/MPS for OSIRIS Team',
      license: 'cc-by-sa-igo',
    },
    {
      file: 'Crescent_Earth_from_Rosetta.jpg',
      title: 'A Terra crescente',
      date: 'nov/2009',
      caption:
        'A Terra num crescente fino, na chegada para o terceiro e último sobrevoo, em 13/11/2009. ' +
        'O empurrão da gravidade da Terra pôs a Rosetta no caminho do cometa.',
      credit: 'ESA/Rosetta/MPS for OSIRIS Team',
      license: 'cc-by-sa-igo',
    },
    {
      file: 'Rosetta_triumphs_at_asteroid_Lutetia.jpg',
      title: 'O asteroide Lutécia',
      date: '10/07/2010',
      caption:
        'Um mundo de cerca de 100 km coberto de crateras, visto na maior aproximação, a cerca de 3 200 km. ' +
        'Deve ser um sobrevivente primitivo da formação do Sistema Solar.',
      credit: 'ESA/Rosetta/MPS for OSIRIS Team',
      license: 'commons',
    },
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
    {
      file: 'OSIRIS_spots_Philae_drifting_across_the_comet_-_Flickr_-_europeanspaceagency.jpg',
      title: 'O pouso do Philae',
      date: '12/11/2014',
      caption:
        'Em 30 minutos de imagens da câmera OSIRIS, o Philae desce, toca o cometa e quica de volta: os arpões não dispararam. ' +
        'Depois de mais um salto, parou cerca de duas horas após o primeiro toque, numa fenda à sombra.',
      credit: 'ESA/Rosetta/MPS for OSIRIS Team',
      license: 'commons',
    },
    {
      file: 'Year_at_a_comet,_July_2015_ESA15549513.jpeg',
      title: 'Os jatos do cometa',
      date: '08/07/2015',
      caption:
        'A 152 km do núcleo, semanas antes do periélio de 13/08/2015: jatos de gás e poeira saem do lobo menor e enchem ' +
        'o campo de visão. O calor do Sol sublima o gelo debaixo da crosta escura.',
      credit: 'ESA/Rosetta/NAVCAM',
      license: 'cc-by-sa-igo',
    },
    {
      file: 'Philae_found_(36151637845).jpg',
      title: 'O Philae encontrado',
      date: '02/09/2016',
      caption:
        'Quase dois anos depois do pouso, a OSIRIS achou o Philae a 2,7 km, encaixado de lado numa fenda: o corpo de 1 m e ' +
        'duas das três pernas. Quatro semanas depois, a Rosetta desceu de propósito sobre o cometa e encerrou a missão.',
      credit: 'ESA/Rosetta/MPS for OSIRIS Team',
      license: 'commons',
    },
  ],
  newhorizons: [
    {
      file: 'Atlas_V_551_launches_with_New_Horizons.jpg',
      title: 'O lançamento',
      date: '19/01/2006',
      caption:
        'Um Atlas V parte de Cabo Canaveral com a New Horizons, a nave mais rápida já lançada da Terra: ' +
        'cruzou a órbita da Lua em menos de 9 horas e passou por Júpiter 13 meses depois.',
      credit: 'NASA/Ken Thornsley',
      license: 'pd',
    },
    {
      file: 'Jupiter&Io.jpg',
      title: 'Júpiter e Io',
      date: '2007',
      caption:
        'Montagem do sobrevoo de Júpiter, o estilingue que encurtou a viagem a Plutão em três anos: o planeta no infravermelho ' +
        '(azul nas nuvens altas) e Io em cor quase real, com a pluma azulada do vulcão Tvashtar e a lava incandescente embaixo dela.',
      credit: 'NASA/JHUAPL/SwRI/GSFC',
      license: 'pd',
    },
    {
      file: 'Pluto_in_True_Color_-_High-Res.jpg',
      title: 'Plutão',
      date: '14/07/2015',
      caption:
        'Em cor real: o «coração» (Tombaugh Regio), cuja metade esquerda é a planície de gelo de nitrogênio Sputnik Planitia, ' +
        'montanhas de gelo de água e manchas avermelhadas de tolinas.',
      credit: 'NASA/JHUAPL/SwRI',
      license: 'pd',
    },
    {
      file: 'Pluto-01_Stern_03_Pluto_Color_TXT.jpg',
      title: 'Plutão em cores realçadas',
      date: '14/07/2015',
      caption:
        'Cores exageradas (azul, vermelho e infravermelho) separam terrenos de composições diferentes: o «coração» claro ' +
        'de gelo de nitrogênio e as regiões avermelhadas de tolinas, com detalhes de até 1,3 km.',
      credit: 'NASA/JHUAPL/SwRI',
      license: 'pd',
    },
    {
      file: 'NH-Pluto-NorgayMontes-Released20150904.jpg',
      title: 'Montanhas de gelo',
      date: '14/07/2015',
      caption:
        'O primeiro close-up de Plutão, 1 h 30 min antes da maior aproximação: as Norgay Montes, de até 3,4 km de altura, ' +
        'de gelo de água (o de nitrogênio seria mole demais para sustentá-las). Sem crateras à vista: um terreno jovem.',
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
      file: 'MVIC_sunset_scan_of_Pluto.jpg',
      title: 'Pôr do sol em Plutão',
      date: '14/07/2015',
      caption:
        'Quinze minutos depois da maior aproximação, olhando para o Sol, a 18 000 km: montanhas de até 3,5 km, a planície ' +
        'gelada de Sputnik à direita e mais de uma dúzia de camadas de névoa na atmosfera tênue.',
      credit: 'NASA/JHUAPL/SwRI',
      license: 'pd',
    },
    {
      file: 'Blue_hazes_over_backlit_Pluto.jpg',
      title: 'O céu azul de Plutão',
      date: '14/07/2015',
      caption:
        'Contra a luz, a névoa da atmosfera aparece azul, em cores próximas das que o olho veria. São partículas minúsculas ' +
        'de tolinas, formadas pela luz do Sol a partir de nitrogênio e metano, como na névoa de Titã.',
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
      file: 'Dawn_solar_panel.jpg',
      title: 'A nave na sala limpa',
      date: '21/05/2007',
      caption:
        'Os painéis solares abertos por inteiro num teste antes do lançamento. Com quase 20 m de ponta a ponta, alimentavam ' +
        'os motores iônicos, que empurraram a Dawn devagar, mas por anos, até Vesta e Ceres.',
      credit: 'NASA/George Shelton',
      license: 'pd',
    },
    {
      file: 'Delta_II_Dawn_liftoff_2.jpg',
      title: 'O lançamento',
      date: '27/09/2007',
      caption:
        'Um Delta II acende o motor principal e nove propulsores de combustível sólido em Cabo Canaveral. ' +
        'A Dawn seria a primeira nave a orbitar dois corpos além da Terra e da Lua: Vesta e Ceres, no cinturão de asteroides.',
      credit: 'NASA/Sandra Joseph, Rafael Hernandez',
      license: 'pd',
    },
    {
      file: 'PIA15667_Vesta_south_pole_oblique.jpg',
      title: 'A bacia Rheasilvia',
      date: '2011',
      caption:
        'A bacia de impacto do polo sul de Vesta, com cerca de 500 km, em perspectiva: as imagens sobre o relevo e a altitude em ' +
        'cores (vermelho no alto, azul embaixo). A montanha central tem 180 km de largura e 20 a 25 km de altura.',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA/PSI',
      license: 'pd',
    },
    {
      file: 'Vesta_Snowman_craters.jpg',
      title: 'O «boneco de neve»',
      date: '24/07/2011',
      caption:
        'Três crateras em fila no hemisfério norte de Vesta, apelidadas pela equipe da câmera, vistas a 5 200 km ' +
        'uma semana depois da entrada em órbita (16/07/2011).',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA',
      license: 'pd',
    },
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
    {
      file: 'The_bright_spots_on_Ceres_imaged_by_the_dawn_spacecraft_(eso1609b).jpg',
      title: 'As manchas de Occator',
      date: '2015',
      caption:
        'De uma órbita mais baixa, as manchas da cratera Occator, de 92 km, se revelam um grupo de depósitos claros de sal. ' +
        'Telescópios na Terra viram que o brilho delas muda ao longo do dia de Ceres, sob a luz do Sol.',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA',
      license: 'pd',
    },
    {
      file: "PIA20349_crop_-_Ceres'_Ahuna_Mons_side_view.jpg",
      title: 'Ahuna Mons',
      date: 'dez/2015',
      caption:
        'Uma montanha solitária de 4 km de altura média (5 km no lado mais íngreme) e 20 km de diâmetro, em perspectiva com ' +
        'imagens da órbita a 385 km. Deve ser um criovulcão: lama salgada e gelo que subiram do interior.',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA/PSI',
      license: 'pd',
    },
    {
      file: 'PIA21924_-_Mosaic_of_Cerealia_Facula_in_Occator.jpg',
      title: 'Cerealia Facula de perto',
      date: '2018',
      caption:
        'No fim da missão, a Dawn desceu a 34 km da superfície e fotografou em detalhe a mancha central de Occator, aqui ' +
        'sobre uma imagem de 385 km. Ainda em 2018 ela ficou sem combustível; segue em órbita de Ceres, desligada.',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA/PSI',
      license: 'pd',
    },
  ],
  juno: [
    {
      file: 'Atlas_V_Rocket_Launches_with_Juno_Spacecraft.jpg',
      title: 'O lançamento',
      date: '05/08/2011',
      caption:
        'Um Atlas V parte de Cabo Canaveral com a Juno, a primeira nave movida a energia solar a trabalhar tão longe do Sol. ' +
        'A viagem até Júpiter levou cinco anos, com uma volta pela Terra para ganhar velocidade.',
      credit: 'NASA/Bill Ingalls',
      license: 'pd',
    },
    {
      file: 'Southern_Atlantic_and_Antarctica_from_Juno_flyby_-_October_9,_2013.jpg',
      title: 'A Terra no sobrevoo',
      date: '09/10/2013',
      caption:
        'A JunoCam a 3 197 km de altitude, 10 minutos antes da maior aproximação: o Atlântico Sul, nuvens e a Antártida. ' +
        'O estilingue da Terra deu à Juno cerca de 7,3 km/s a mais.',
      credit: 'NASA/JPL-Caltech/MSSS',
      license: 'pd',
    },
    {
      file: 'PIA21641-Jupiter-SouthernStorms-JunoCam-cropped.jpg',
      title: 'O polo sul de Júpiter',
      date: '2016–2017',
      caption:
        'Visto de 52 000 km, com imagens de três órbitas e cores realçadas: um campo de ciclones de até 1 000 km. ' +
        'Nenhuma nave tinha visto os polos assim de cima: a Juno foi a primeira em órbita polar em torno de Júpiter.',
      credit: 'NASA/JPL-Caltech/SwRI/MSSS/Betsy Asher Hall/Gervasio Robles',
      license: 'pd',
    },
    {
      file: 'North_Polar_Cyclones_-_Juno_(30232656568).png',
      title: 'O polo norte no infravermelho',
      date: '27/03/2017',
      caption:
        'Mosaico do espectrômetro infravermelho JIRAM: o calor que escapa do interior, mais claro onde as nuvens são mais finas. ' +
        'Os redemoinhos são ciclones agrupados em volta do polo (no norte, um central cercado por oito), um arranjo que surpreendeu os cientistas.',
      credit: 'NASA/JPL-Caltech/SwRI/ASI/INAF/JIRAM/Justin Cowart',
      license: 'pd',
    },
    {
      file: 'PIA21972_Jupiter_Blues.jpg',
      title: 'Júpiter em azul',
      date: '24/10/2017',
      caption:
        'Nuvens do hemisfério norte em cores realçadas, a 18 906 km do topo das nuvens, na 9ª passagem rente; as mais altas ' +
        'projetam sombras. Processada pelos cientistas cidadãos Gerald Eichstädt e Seán Doran com as imagens públicas da JunoCam.',
      credit: 'NASA/JPL-Caltech/SwRI/MSSS/Gerald Eichstädt/Seán Doran',
      license: 'pd',
    },
    {
      file: 'PIA22946-Jupiter-RedSpot-JunoSpacecraft-20190212.jpg',
      title: 'A Grande Mancha Vermelha',
      date: '12/02/2019',
      caption:
        'Imagens da JunoCam tiradas rente às nuvens na 17ª passagem e projetadas numa esfera, processadas pelo cientista cidadão Kevin M. Gill.',
      credit: 'NASA/JPL-Caltech/SwRI/MSSS/Kevin M. Gill',
      license: 'commons',
    },
    {
      file: 'PIA24681-1041-Ganymede-JupiterMoon-Juno-20210607.jpg',
      title: 'Ganimedes',
      date: '07/06/2021',
      caption: 'A 1 038 km da maior lua do Sistema Solar, a passagem mais próxima em mais de 20 anos. Filtro verde da JunoCam.',
      credit: 'NASA/JPL-Caltech/SwRI/MSSS',
      license: 'commons',
    },
    {
      file: 'Europa_in_natural_color.png',
      title: 'Europa',
      date: '29/09/2022',
      caption:
        'No sobrevoo mais próximo de Europa desde a Galileo, em 2000 (352 km na maior aproximação): a face sempre voltada ' +
        'para Júpiter, em cor natural, gelo branco riscado de fissuras avermelhadas.',
      credit: 'NASA/JPL-Caltech/SwRI/MSSS/Kevin M. Gill',
      license: 'commons',
    },
    {
      file: 'Image_of_Io_from_Juno_JunoCam_from_December_2023.png',
      title: 'Io de perto',
      date: '30/12/2023',
      caption:
        'Na passagem mais próxima de Io em mais de 20 anos, a cerca de 1 500 km, a JunoCam fotografou a região polar norte ' +
        'e o hemisfério que vai atrás na órbita. Io tem mais de 400 vulcões ativos, aquecidos pelas marés de Júpiter.',
      credit: 'NASA/SwRI/MSSS/Jason Perry',
      license: 'commons',
    },
  ],
  parker: [
    {
      file: 'Parker_Solar_Probe_Gets_Its_Revolutionary_Heat_Shield.jpg',
      title: 'O escudo térmico',
      date: '25/09/2017',
      caption:
        'A sonda na sala limpa da Johns Hopkins, com o escudo térmico no topo, instalado pela primeira vez dias antes. ' +
        'Com 11,4 cm de espuma de carbono, ele chega a cerca de 1 370 °C de frente para o Sol, e os instrumentos à sombra ficam perto de 30 °C.',
      credit: 'NASA Goddard',
      license: 'commons',
    },
    {
      file: 'Parker_visits_PSP_01.jpg',
      title: 'Eugene Parker e a sua sonda',
      date: '03/10/2017',
      caption:
        'O físico Eugene Parker, que previu o vento solar em 1958, visita a sonda que leva o seu nome, a primeira da NASA ' +
        'batizada em homenagem a uma pessoa viva. Ele assistiu ao lançamento, aos 91 anos.',
      credit: 'NASA/JHUAPL',
      license: 'pd',
    },
    {
      file: 'Parker_Solar_Probe_Launch_(NHQ201808120013).jpg',
      title: 'O lançamento no Delta IV Heavy',
      date: '12/08/2018',
      caption:
        'Um dos foguetes mais potentes da época, com um terceiro estágio extra, para uma nave de cerca de 685 kg: para cair ' +
        'até perto do Sol é preciso anular quase toda a velocidade da Terra em volta dele, de 30 km/s.',
      credit: 'NASA/Bill Ingalls',
      license: 'pd',
    },
    {
      file: 'WISPR_first_light_image.png',
      title: 'Primeira luz da WISPR',
      date: 'set/2018',
      caption:
        'A câmera WISPR fica à sombra do escudo térmico e olha para o lado do Sol: vê a coroa e o vento solar saindo dela. A primeira imagem, de setembro de 2018.',
      credit: 'NASA/Naval Research Laboratory/Parker Solar Probe',
      license: 'pd',
    },
    {
      file: 'Parker_Solar_Probe_coronal_stream_wispr-big_1-st_flyby.jpg',
      title: 'Uma serpentina da coroa',
      date: '08/11/2018',
      caption:
        'Na primeira passagem pelo periélio, a 27 milhões de km da superfície do Sol, a WISPR vê uma serpentina coronal ' +
        '(streamer), estrutura de matéria solar sobre regiões ativas. O ponto brilhante perto do centro é Mercúrio.',
      credit: 'NASA/NRL/Parker Solar Probe',
      license: 'pd',
    },
    {
      file: 'Venus_dust_ring.png',
      title: 'O anel de poeira de Vênus',
      date: '25/08/2019',
      caption:
        'A primeira vista completa do anel de poeira ao longo da órbita de Vênus, a faixa diagonal (marcada na versão anotada, ' +
        'à direita). Os pontos brilhantes são, da esquerda para a direita, a Terra, Vênus e Mercúrio; à esquerda, um trecho da Via Láctea.',
      credit: 'NASA/JHUAPL/NRL/Guillermo Stenborg e Brendan Gallagher',
      license: 'pd',
    },
    {
      file: 'Wispr_merged_six_planets.jpg',
      title: 'Seis planetas',
      date: '07/06/2020',
      caption:
        'Na maior aproximação do Sol daquela órbita, a WISPR pegou no mesmo campo de visão Mercúrio, Vênus, a Terra, Marte, ' +
        'Júpiter e Saturno.',
      credit: 'NASA/JHUAPL/NRL/Guillermo Stenborg e Brendan Gallagher',
      license: 'pd',
    },
    {
      file: 'Wispr_venus_image.png',
      title: 'Vênus pela WISPR',
      date: '11/07/2020',
      caption:
        'No terceiro sobrevoo de Vênus, o lado noturno: a mancha escura no centro é Aphrodite Terra, o maior planalto do ' +
        'planeta, vista através das nuvens; a borda brilhante pode ser a luminescência do oxigênio na alta atmosfera.',
      credit: 'NASA/JHUAPL/NRL/Guillermo Stenborg e Brendan Gallagher',
      license: 'pd',
    },
  ],
  apollo8: [
    {
      file: 'Apollo_8_Crewmembers_-_GPN-2000-001125.jpg',
      title: 'A tripulação',
      date: '22/11/1968',
      caption:
        'Jim Lovell, Bill Anders e Frank Borman (da esquerda para a direita) num simulador do Centro Espacial Kennedy, um mês antes do voo. ' +
        'Seriam os primeiros seres humanos a sair da órbita da Terra e a ver o lado oculto da Lua.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_8_Liftoff_View_(24246227076).jpg',
      title: 'O lançamento',
      date: '21/12/1968',
      caption:
        'O Saturno V decola do complexo 39A às 7h51 (hora da Flórida). Era só o terceiro voo do foguete e o primeiro com tripulação: ' +
        'a missão foi antecipada para ir à Lua antes de um módulo lunar estar pronto.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'AS08-16-2582_-_Apollo_8_-_Apollo_8_Mission_image,_Saturn_4B_dropping_away_from_the_Apollo_spacecraft_-_NARA_-_16670998.jpg',
      title: 'O terceiro estágio fica para trás',
      date: '21/12/1968',
      caption:
        'O S-IVB, terceiro estágio do Saturno V, se afasta depois de pôr a nave a caminho da Lua. ' +
        'Sem módulo lunar pronto, ele levava um simulador de massa; o estágio acabou numa órbita em torno do Sol.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'AS08-16-2593_remastered.jpg',
      title: 'A Terra inteira',
      date: 'dez/1968',
      caption:
        'Uma das primeiras fotos da Terra inteira tiradas por pessoas, a cerca de 30 000 km, provavelmente por Bill Anders: ' +
        'a América do Sul no centro e a África entrando na noite.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_8_Mission_image,_Moon,_fairside_(as08-14-2453).jpg',
      title: 'O lado oculto',
      date: 'dez/1968',
      caption:
        'Terreno do lado oculto da Lua, nunca antes visto por olhos humanos, com o Sol quase a pino: crateras sobre crateras mais antigas. ' +
        'Atrás da Lua, a nave ficava sem rádio com a Terra.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'NASA-Apollo8-Dec24-Earthrise.jpg',
      title: 'Nascer da Terra',
      date: '24/12/1968',
      caption:
        'William Anders fotografa a Terra surgindo no horizonte da Lua. «Saímos para explorar a Lua e, em vez disso, descobrimos a Terra.»',
      credit: 'NASA/Bill Anders',
      license: 'pd',
    },
    {
      file: 'Apollo_8_Image_of_the_Moon_(AS08-14-2506).jpg',
      title: 'A Lua quase cheia',
      date: 'dez/1968',
      caption:
        'Vista de cima da longitude 70° leste, na volta para a Terra. ' +
        'O Mar das Crises, a mancha escura e redonda perto do centro, fica na borda leste do disco visto da Terra.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_8_Recovery_-_GPN-2000-001505.jpg',
      title: 'O resgate',
      date: '27/12/1968',
      caption:
        'Mergulhadores da Marinha preparam o módulo de comando para ser içado ao porta-aviões USS Yorktown, no Pacífico. ' +
        'A amerissagem foi antes do amanhecer, e o resgate esperou a luz do dia.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo10: [
    {
      file: 'The_Apollo_10_Prime_Crew_-_GPN-2000-001163.jpg',
      title: 'A tripulação',
      date: '03/04/1969',
      caption:
        'Eugene Cernan, Thomas Stafford e John Young (da esquerda para a direita) no Centro Espacial Kennedy. ' +
        'Seria o ensaio geral do pouso: tudo menos a descida final.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_10_is_launched_from_Pad_B.jpg',
      title: 'O lançamento',
      date: '18/05/1969',
      caption:
        'O Saturno V decola às 12h49 (hora da Flórida) da plataforma 39B, a única vez que um Saturno V partiu dela. ' +
        'Todas as outras missões lunares saíram da 39A.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: "S-IVB_and_LM'Snoopy'_following_the_pitch_around_by_the_CSM_'Charlie_Brown'.jpg",
      title: 'Snoopy no terceiro estágio',
      date: '18/05/1969',
      caption:
        'Depois de se soltar do terceiro estágio e girar 180°, o módulo de comando Charlie Brown volta para acoplar ' +
        'no módulo lunar Snoopy, ainda preso ao S-IVB, e retirá-lo.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Earth_from_Apollo_10.jpg',
      title: 'A Terra a caminho da Lua',
      date: '18/05/1969',
      caption:
        'A cerca de 67 000 km (36 000 milhas náuticas): o México ao norte do istmo de Tehuantepec aparece com nitidez, ' +
        'e a península de Iucatã está coberta de nuvens.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'AS10-34-5087_(21931420601).jpg',
      title: 'Snoopy solto',
      date: '22/05/1969',
      caption:
        'Logo depois da separação, John Young fotografa do Charlie Brown o módulo lunar com Stafford e Cernan, ' +
        'na inspeção antes da descida até 15 km da superfície.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'AS10-27-3881.jpg',
      title: 'Charlie Brown visto do Snoopy',
      date: '23/05/1969',
      caption:
        'O módulo de comando e serviço, com Young a bordo, fotografado do módulo lunar no encontro em órbita, ' +
        'sobre a região da cratera Jenkins. O encontro repetia o que o Eagle faria na volta da superfície.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_10_Lunar_Module_Rendezvous.jpg',
      title: 'Snoopy volta a Charlie Brown',
      date: 'mai/1969',
      caption:
        'O estágio de subida do módulo lunar «Snoopy» se aproxima do módulo de comando «Charlie Brown», depois de descer a 15 km da superfície no ensaio geral do pouso.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_10_Helicopter_Recovery_-_GPN-2000-001143.jpg',
      title: 'O resgate',
      date: '26/05/1969',
      caption:
        'Um helicóptero Sea King da Marinha chega para recolher os astronautas, que entram no bote, ' +
        'enquanto o módulo Charlie Brown boia no Pacífico Sul.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo11: [
    {
      file: 'Apollo_11_Crew.jpg',
      title: 'A tripulação',
      date: '1969',
      caption:
        'Neil Armstrong, Michael Collins e Buzz Aldrin (da esquerda para a direita), no retrato oficial. ' +
        'Armstrong e Aldrin desceriam no Eagle; Collins ficaria sozinho em órbita no Columbia.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_11_Launch_-_GPN-2000-000630.jpg',
      title: 'O lançamento',
      date: '16/07/1969',
      caption:
        'O Saturno V decola do complexo 39A às 9h32 (hora da Flórida), diante de multidões nas praias e estradas em volta. ' +
        'Quatro dias depois, o Eagle pousaria no Mar da Tranquilidade.',
      credit: 'NASA',
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
    {
      file: 'Apollo_11_bootprint.jpg',
      title: 'Pegada',
      date: '20/07/1969',
      caption: 'Uma pegada de Aldrin, fotografada para estudar como o solo lunar se compacta. Sem vento nem chuva, pode durar milhões de anos.',
      credit: 'NASA/Buzz Aldrin',
      license: 'pd',
    },
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
      file: 'Astronaut_Edwin_Aldrin_deploys_the_PSEP,_AS11-40-5948.jpg',
      title: 'O sismômetro',
      date: '20/07/1969',
      caption:
        'Aldrin instala o sismômetro passivo, com o Eagle ao fundo. Atrás dele, à esquerda, o retrorrefletor de laser, ' +
        'que ainda hoje devolve pulsos disparados da Terra para medir a distância até a Lua.',
      credit: 'NASA/Neil Armstrong',
      license: 'pd',
    },
    {
      file: 'AS11-44-6642_(21689650582).jpg',
      title: 'O Eagle volta, com a Terra ao fundo',
      date: '21/07/1969',
      caption:
        'Do Columbia, Michael Collins fotografa o estágio de subida do Eagle, com Armstrong e Aldrin, sobre o Mar de Smythii, ' +
        'com a Terra acima do horizonte. Costuma-se dizer que só Collins, atrás da câmera, ficou fora do retrato de toda a humanidade.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_11_Crew_in_Raft_before_Recovery_-_GPN-2000-001212.jpg',
      title: 'À espera do resgate',
      date: '24/07/1969',
      caption:
        'No bote, à espera do helicóptero do porta-aviões USS Hornet, os três astronautas e um mergulhador da Marinha vestem roupas ' +
        'de isolamento biológico, por medo de trazer micróbios da Lua. Depois, 21 dias de quarentena.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo12: [
    {
      file: 'The_Apollo_12_Prime_Crew_-_GPN-2000-001165.jpg',
      title: 'A tripulação',
      date: '22/09/1969',
      caption:
        'Pete Conrad, Richard Gordon e Alan Bean (da esquerda para a direita). Os três eram da Marinha dos EUA e batizaram ' +
        'o módulo de comando de Yankee Clipper e o lunar de Intrepid.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_12_launches_from_Kennedy_Space_Center.jpg',
      title: 'O lançamento sob raios',
      date: '14/11/1969',
      caption:
        'Sob chuva, às 11h22 (hora da Flórida). Aos 36,5 s e aos 52 s de voo, o foguete foi atingido por raios, que desligaram ' +
        'parte dos sistemas da nave; o controlador John Aaron salvou a missão com o comando «SCE para AUX».',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Lunar_module_AS12-51-7507.jpg',
      title: 'O Intrepid antes da descida',
      date: '19/11/1969',
      caption:
        'O módulo lunar, com Conrad e Bean, visto do Yankee Clipper sobre o fundo da cratera gigante Ptolomeu, olhando para o oeste. ' +
        'Parece rente ao solo, mas ainda estava em órbita, bem alto.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Alan_Bean_with_ALSEP.jpg',
      title: 'Bean carrega o ALSEP',
      date: '19/11/1969',
      caption:
        'Na primeira caminhada, Alan Bean leva os dois pacotes do ALSEP, a estação científica que ficou na Lua, presos numa barra ' +
        'como um haltere. Ele os montou a cerca de 90 m do módulo lunar.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo12Visor.jpg',
      title: 'Conrad na viseira de Bean',
      date: '20/11/1969',
      caption:
        'Perto da cratera Sharp, na segunda caminhada, Bean segura um recipiente especial com solo que Conrad acabara de recolher. ' +
        'Pete Conrad, que tirou a foto, aparece refletido na viseira.',
      credit: 'NASA/Charles Conrad',
      license: 'pd',
    },
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
    {
      file: 'Earth_Eclipses_Sun-ap12-s80-37406.jpg',
      title: 'A Terra eclipsa o Sol',
      date: 'nov/1969',
      caption:
        'Na volta para casa, a Terra passou entre o Sol e a nave: o planeta escuro, contornado pela luz que atravessa a atmosfera. ' +
        'Quadro de uma câmera de cinema de 16 mm.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_12_crew_in_Mobile_Quarantine_Facility.jpg',
      title: 'Na quarentena',
      date: '24/11/1969',
      caption:
        'Conrad, Gordon e Bean (da esquerda para a direita) espiam pela janela da instalação móvel de quarentena, ' +
        'a bordo do porta-aviões USS Hornet, depois da amerissagem no Pacífico.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo13: [
    {
      file: 'Fred_Haise_(left),_Jack_Swigert,_and_Jim_Lovell_pose_on_the_day_before_launch.jpg',
      title: 'A tripulação, na véspera',
      date: '10/04/1970',
      caption:
        'Fred Haise, Jack Swigert e Jim Lovell (da esquerda para a direita) na véspera do lançamento. Swigert, da reserva, ' +
        'substituíra Ken Mattingly poucos dias antes, porque Mattingly tinha sido exposto à rubéola.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_13_launch_(S70-34852).jpg',
      title: 'O lançamento',
      date: '11/04/1970',
      caption:
        'O Saturno V decola às 14h13 (hora da Flórida). Na subida, o motor central do segundo estágio desligou cedo demais, ' +
        'e os outros quatro queimaram por mais tempo para compensar.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Astronaut_John_Swigert_with_Mailbox_-_GPN-2002-000055.jpg',
      title: 'A «caixa de correio»',
      date: '15/04/1970',
      caption:
        'Swigert segura o adaptador improvisado com sacos plásticos, papelão e fita adesiva para os filtros quadrados de hidróxido de lítio ' +
        'do módulo de comando servirem no módulo lunar, onde o gás carbônico subia. A receita foi criada em Houston e ditada por rádio.',
      credit: 'NASA/Fred Haise',
      license: 'pd',
    },
    {
      file: 'AS13-61-8783_-_Apollo_13_-_NARA_-_16695929.jpg',
      title: 'A Lua do retorno livre',
      date: '15/04/1970',
      caption:
        'Sem poder pousar, a nave contornou a Lua para voltar à Terra e bateu o então recorde de distância alcançado por pessoas. ' +
        'Aparecem partes dos dois lados, com a cratera Tsiolkovsky, do lado oculto, embaixo à esquerda.',
      credit: 'NASA',
      license: 'pd',
    },
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
    {
      file: 'Apollo_13_Lunar_Module_after_separation_from_CSM_(AS13-59-8562).jpg',
      title: 'Adeus ao Aquarius',
      date: '17/04/1970',
      caption:
        'O módulo lunar, bote salva-vidas da tripulação por mais de três dias, fotografado do módulo de comando logo depois de solto, ' +
        'pouco mais de uma hora antes da amerissagem. Ele se desfez na atmosfera sobre o Pacífico.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_13_splashdown_(S70-35638).jpg',
      title: 'A amerissagem',
      date: '17/04/1970',
      caption:
        'O módulo de comando Odyssey chega ao Pacífico Sul a poucos quilômetros do navio de resgate USS Iwo Jima: ' +
        'o fim feliz de um voo que quase terminou em tragédia.',
      credit: 'NASA/U.S. Navy',
      license: 'pd',
    },
    {
      file: 'Apollo_13_Crew_on_Deck_-_GPN-2000-001318.jpg',
      title: 'No convés do Iwo Jima',
      date: '17/04/1970',
      caption:
        'O capelão do navio (ao microfone) faz uma oração de agradecimento pela volta da tripulação, logo depois da chegada a bordo; ' +
        'no centro, os três astronautas.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo14: [
    {
      file: 'Crescent_Earth_and_Venus_over_the_Apollo_14_LM.jpg',
      title: 'A Terra e Vênus sobre o Antares',
      caption: 'A Terra crescente e Vênus no céu negro, sobre o módulo lunar Antares.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'The_Apollo_14_Prime_Crew_-_GPN-2000-001168.jpg',
      title: 'A tripulação',
      date: '03/12/1970',
      caption:
        'Stuart Roosa, Alan Shepard e Edgar Mitchell (da esquerda para a direita). Shepard, o primeiro americano no espaço, ' +
        'voltou a voar depois de anos afastado por um problema no ouvido interno.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_14_Launch_-_GPN-2000-000633.jpg',
      title: 'O lançamento',
      date: '31/01/1971',
      caption:
        'O Saturno V decola às 16h03 (hora da Flórida), depois de 40 minutos de espera por causa do tempo. ' +
        'Destino: Fra Mauro, o alvo que a Apollo 13 não alcançou.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'AS14-66-9216_-_Apollo_14_-_Apollo_14_Mission_image_-_View_from_the_Lunar_Module_window_of_the_Command_and_Service_Module_during_lunar_orbit._-_NARA_-_16697387.jpg',
      title: 'O Kitty Hawk visto do Antares',
      date: '05/02/1971',
      caption:
        'O módulo de comando e serviço Kitty Hawk, pela janela do módulo lunar, na órbita em que os dois se separaram. ' +
        'Stuart Roosa ficou nele, sozinho, enquanto Shepard e Mitchell desciam.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Shepard_Plants_Flag_-_GPN-2000-001120.jpg',
      title: 'Shepard em Fra Mauro',
      date: '05/02/1971',
      caption: 'Alan Shepard, o primeiro americano no espaço (1961), ao lado da bandeira nas terras altas de Fra Mauro, o destino que a Apollo 13 não alcançou.',
      credit: 'NASA/Edgar Mitchell',
      license: 'pd',
    },
    {
      file: 'Shepard_Next_to_Modular_Equipment_Transporter_-_GPN-2000-001147.jpg',
      title: 'Shepard e o «riquixá»',
      date: '05/02/1971',
      caption:
        'O carrinho de mão MET levava ferramentas, câmeras e caixas de amostras; os astronautas o apelidaram de riquixá. ' +
        'Shepard é reconhecido pela faixa vertical no capacete.',
      credit: 'NASA/Edgar Mitchell',
      license: 'pd',
    },
    {
      file: 'Mitchell_Studies_Map_-_GPN-2000-001146.jpg',
      title: 'Mitchell consulta o mapa',
      date: '06/02/1971',
      caption:
        'Na segunda caminhada, Mitchell confere o mapa do percurso, com poeira grudada nas botas e nas pernas do traje. ' +
        'A dupla subia rumo à borda da cratera Cone, que não chegou a achar: estava a poucas dezenas de metros.',
      credit: 'NASA/Alan Shepard',
      license: 'pd',
    },
    {
      file: 'Apollo_14_recovery.jpg',
      title: 'O resgate',
      date: '09/02/1971',
      caption:
        'Vista do helicóptero de resgate: o módulo de comando Kitty Hawk no Pacífico Sul e os três astronautas no bote. ' +
        'Foi a última tripulação a cumprir quarentena na volta da Lua.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo15: [
    {
      file: 'Apollo_15_Hadley_Rille.jpg',
      title: 'O vale de Hadley',
      caption: 'O vale sinuoso de Hadley (Rima Hadley), um antigo canal de lava, ao lado do local de pouso.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'The_Apollo_15_Prime_Crew_-_GPN-2000-001169.jpg',
      title: 'A tripulação',
      date: '28/06/1971',
      caption:
        'David Scott, Alfred Worden e James Irwin (da esquerda para a direita). A primeira das missões longas, ' +
        'com três dias na Lua e o primeiro jipe lunar.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_15_Saturn_V_Launch_-_GPN-2000-001115.jpg',
      title: 'O lançamento',
      date: '26/07/1971',
      caption: 'O Saturno V decola às 9h34 (hora da Flórida), refletido na água em frente ao complexo de lançamento.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Scott_on_the_Rover_-_GPN-2000-001306.jpg',
      title: 'Scott no jipe lunar',
      date: '01/08/1971',
      caption:
        'David Scott no jipe lunar, na segunda caminhada. Elétrico, com um motor em cada roda, ' +
        'ele levou a dupla a quilômetros do módulo lunar.',
      credit: 'NASA/James Irwin',
      license: 'pd',
    },
    {
      file: 'Apollo_15_flag,_rover,_LM,_Irwin.jpg',
      title: 'Irwin, o jipe e o Falcon',
      date: '01/08/1971',
      caption: 'James Irwin saúda a bandeira; ao centro, o módulo lunar Falcon, à direita o primeiro jipe lunar e, ao fundo, o monte Hadley Delta.',
      credit: 'NASA/David Scott',
      license: 'pd',
    },
    {
      file: 'Apollo_15_CSM_Endeavour_during_rendezvous.jpg',
      title: 'O Endeavour em órbita',
      date: '02/08/1971',
      caption:
        'O módulo de comando e serviço Endeavour, onde Alfred Worden esperava, visto do Falcon no encontro depois da decolagem da Lua. ' +
        'No módulo de serviço, um compartimento com câmeras e sensores (SIM), estreado nesta missão.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Worden_podczas_EVA_S71-43202.jpg',
      title: 'Caminhada no espaço profundo',
      date: '05/08/1971',
      caption:
        'Na volta, Alfred Worden sai da nave para recolher os filmes das câmeras do módulo de serviço: ' +
        'a primeira caminhada no espaço longe da Terra. Quadro de um filme de 16 mm.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Endeavour_nears_splashdown_-_GPN-2000-001121.jpg',
      title: 'Um paraquedas a menos',
      date: '07/08/1971',
      caption:
        'O Endeavour desce no Pacífico com um dos três paraquedas principais falhando. A tripulação não se feriu, ' +
        'mas o toque na água foi mais forte.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo16: [
    {
      file: 'The_Apollo_16_Prime_Crew_-_GPN-2000-001134.jpg',
      title: 'A tripulação',
      date: '12/01/1972',
      caption:
        'Ken Mattingly, John Young e Charles Duke (da esquerda para a direita). Mattingly tinha ficado fora da Apollo 13 ' +
        'dias antes do lançamento, por ter sido exposto à rubéola, e nunca pegou a doença.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_16_Launch_-_GPN-2000-000638.jpg',
      title: 'O lançamento',
      date: '16/04/1972',
      caption: 'O Saturno V decola às 12h54 (hora da Flórida) rumo às terras altas de Descartes, no centro do lado visível da Lua.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Duke_on_the_Craters_Edge_-_GPN-2000-001132.jpg',
      title: 'Duke na borda da cratera',
      date: '21/04/1972',
      caption:
        'Charles Duke recolhe amostras na estação 1 da primeira caminhada, numa foto de John Young. Os geólogos esperavam ' +
        'rochas vulcânicas em Descartes, mas as amostras eram brechas formadas por impactos.',
      credit: 'NASA/John Young',
      license: 'pd',
    },
    {
      file: 'John_W._Young_on_the_Moon.jpg',
      title: 'O salto de John Young',
      date: '21/04/1972',
      caption: 'John Young salta cerca de 42 cm na gravidade lunar enquanto saúda a bandeira, com o módulo Orion à esquerda. Foto de Charles Duke.',
      credit: 'NASA/Charles Duke',
      license: 'pd',
    },
    {
      file: 'AS16-117-18852_(21491064188).jpg',
      title: 'Young e o jipe lunar',
      date: '23/04/1972',
      caption:
        'John Young no jipe lunar perto do fim da terceira caminhada. Com ele, a dupla percorreu cerca de 27 km ' +
        'nos três dias em Descartes.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_16_Command_and_Service_Module_Over_the_Moon_-_GPN-2002-000069.jpg',
      title: 'O Casper sobre a Lua',
      date: '23/04/1972',
      caption:
        'O módulo de comando e serviço Casper, com Ken Mattingly, visto do Orion, que voltava da superfície com Young e Duke, ' +
        'pouco antes do último encontro da missão.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'AS16-122-19563_-_Apollo_16_-_Apollo_16_Mission_Image_-_Crescent_Earth_rises_as_the_Apollo_16_crew_heads_home._-_DPLA_-_0fc9ec5131647ecc4f2591077c79edc1.jpg',
      title: 'A Terra crescente na volta',
      date: '25/04/1972',
      caption:
        'A primeira sequência de nascer da Terra fotografada por uma tripulação Apollo depois da manobra de volta para casa. ' +
        'A cratera grande no canto inferior esquerdo é Chang Heng, de 35 km.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_16_Recovery_-_GPN-2000-001503.jpg',
      title: 'A amerissagem',
      date: '27/04/1972',
      caption:
        'O módulo de comando visto de cima, por um avião de resgate, segundos antes de tocar o Pacífico central. ' +
        'O porta-aviões USS Ticonderoga recolheu a tripulação.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
  apollo17: [
    {
      file: 'Apollo_17_Prime_Crew_-_GPN-2000-001151.jpg',
      title: 'A tripulação',
      date: '10/10/1972',
      caption:
        'Eugene Cernan (sentado), Ronald Evans (em pé, à direita) e Harrison Schmitt, com um jipe lunar de treinamento. ' +
        'Foi a última viagem tripulada à Lua do programa Apollo.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_17_Night_Launch_-_GPN-2000-001150.jpg',
      title: 'O lançamento noturno',
      date: '07/12/1972',
      caption:
        'Às 0h33 (hora da Flórida), depois de quase três horas de atraso, o primeiro lançamento noturno de um Saturno V. ' +
        'O clarão foi visto a centenas de quilômetros.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'The_Blue_Marble,_AS17-148-22727.jpg',
      title: 'A Bolinha Azul (Blue Marble)',
      date: '07/12/1972',
      caption: 'A cerca de 29 000 km, com o Sol atrás da nave: a Terra inteira iluminada, da África à Antártida. Uma das fotos mais reproduzidas da história.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo_17_Eugene_A._Cernan_and_the_Lunar_Roving_Vehicle,_AS17-134-20476.jpg',
      title: 'Cernan e o jipe lunar',
      date: '12/12/1972',
      caption:
        'Eugene Cernan com o jipe no vale Taurus-Littrow, na primeira caminhada. Um para-lama quebrado sem querer ' +
        'foi consertado com mapas e fita adesiva, para o jipe não cobrir os dois de poeira.',
      credit: 'NASA/Harrison Schmitt',
      license: 'pd',
    },
    {
      file: 'Apollo_17_orange_soil_at_Shorty_Crater_AS17-137-20990HR.jpg',
      title: 'O solo laranja',
      date: '13/12/1972',
      caption:
        'Na cratera Shorty, Schmitt achou solo alaranjado: contas de vidro vulcânico lançadas por fontes de lava há ' +
        'cerca de 3,6 bilhões de anos. Uma das descobertas mais surpreendentes da Apollo.',
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
    {
      file: 'Apollo_17_Command-Service_modules_photographed_from_lunar_module_in_orbit_(as17-145-22254).jpg',
      title: 'O America em órbita',
      date: '14/12/1972',
      caption:
        'O módulo de comando e serviço America, onde Ronald Evans esperava, visto do estágio de subida do Challenger, ' +
        'com Cernan e Schmitt a bordo, no encontro em órbita depois da decolagem da Lua.',
      credit: 'NASA',
      license: 'pd',
    },
    {
      file: 'Apollo-17-with-USS-Ticonderoga.jpg',
      title: 'O fim da última Apollo',
      date: '19/12/1972',
      caption:
        'O módulo de comando America boia no Pacífico Sul depois da amerissagem, a cerca de 650 km de Samoa Americana, ' +
        'com o porta-aviões USS Ticonderoga ao fundo.',
      credit: 'NASA',
      license: 'pd',
    },
  ],
};
