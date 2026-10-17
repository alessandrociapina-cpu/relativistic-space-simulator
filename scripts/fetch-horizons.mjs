#!/usr/bin/env node
/**
 * Baixa do JPL Horizons as efemérides do simulador de sondas e grava
 * src/probes/data/*.json (CLAUDE.md §11). O app publicado não acessa o JPL.
 *
 * - Sondas: trajetória heliocêntrica (centro do Sol, eclíptica J2000, UA e
 *   UA/dia, dias desde J2000 TDB) e janelas centradas nos corpos visitados:
 *   partida da Terra, sobrevoos, órbitas em torno de planetas e do cometa
 *   67P. Na janela, a sonda é desenhada como corpo(t) + trajetória relativa,
 *   então o encontro passa no lugar exato mesmo que o corpo tenha erro.
 * - Cada tabela é baixada numa grade fina e enxugada: uma amostra só fica se
 *   a interpolação sem ela errar mais que a tolerância (150 km no espaço
 *   interplanetário, 15 km nos sobrevoos, 50 km nas órbitas em torno dos
 *   planetas, 5 km em torno de Vesta e Ceres, 0,5 km em torno do cometa). A
 *   interpolação é a do app (src/probes/ephemeris.ts): entre duas amostras,
 *   a órbita de Kepler em torno do corpo central propagada a partir da
 *   primeira, mais uma correção cúbica que leva à segunda. Só sobram amostras
 *   onde há manobras, sobrevoos e perturbações.
 * - Luas: série de Fourier ajustada aos vetores do Horizons de 1968 a 2036
 *   (frequências achadas uma a uma no espectro do resíduo, amplitudes por
 *   mínimos quadrados), até o erro máximo ficar abaixo de 100 km.
 * - Corpos pequenos (cometa, asteroides, Arrokoth): tabelas heliocêntricas
 *   nos anos das missões.
 *
 * Uso: NODE_USE_ENV_PROXY=1 node scripts/fetch-horizons.mjs [alvos...]
 *   alvos: as sondas (voyager1, pioneer10, cassini, huygens...), planets,
 *   moons, small-bodies e fixtures. Sem alvos, baixa tudo. As respostas do
 *   Horizons ficam em node_modules/.cache/horizons (apague para rebaixar).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'probes', 'data');
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'horizons');
const J2000_JD = 2451545.0;
const AU_KM = 149_597_870.7;
const DAY_S = 86_400;
/** km³/s² → UA³/dia². */
const MU_AU = (gm) => (gm * DAY_S * DAY_S) / AU_KM ** 3;

/**
 * GM dos corpos centrais (km³/s²), o mesmo do app (planets.ts e bodies.ts).
 * Corpos pequenos demais para curvar a trajetória ficam com 0 (reta).
 */
const GM = {
  sun: 1.32712440018e11,
  mercury: 22_031.9,
  venus: 324_858.6,
  earth: 398_600.4,
  mars: 42_828.4,
  jupiter: 126_686_534,
  saturn: 37_931_187,
  uranus: 5_793_939,
  neptune: 6_836_529,
  pluto: 869.6,
  io: 5959.9,
  europa: 3202.7,
  ganymede: 9887.8,
  titan: 8978.1,
  enceladus: 7.21,
  triton: 1427.6,
  moon: 4902.8,
  comet67p: 6.66e-7,
  vesta: 17.288,
  ceres: 62.6284,
  arrokoth: 0,
  steins: 0,
  lutetia: 0,
  gaspra: 0,
  ida: 0,
};
/** Tolerâncias da dizimação (km): `asteroid` nas órbitas baixas da Dawn em torno de Vesta e Ceres. */
const TOL_KM = { helio: 150, flyby: 15, orbit: 50, asteroid: 5, comet: 0.5 };
/** O Horizons devolve no máximo ~90 000 linhas por pedido. */
const MAX_ROWS = 80_000;

/** Centros do Horizons dos corpos que as sondas visitam (corpo, não baricentro). */
const CENTERS = {
  sun: '500@10',
  mercury: '500@199',
  venus: '500@299',
  earth: '500@399',
  mars: '500@499',
  jupiter: '500@599',
  saturn: '500@699',
  uranus: '500@799',
  neptune: '500@899',
  pluto: '500@999',
  io: '500@501',
  europa: '500@502',
  ganymede: '500@503',
  enceladus: '500@602',
  titan: '500@606',
  triton: '500@801',
  comet67p: '@1000012',
  vesta: '@2000004',
  ceres: '@2000001',
  arrokoth: '@2486958',
  steins: '@2002867',
};
/**
 * Asteroides integrados não servem de centro no Horizons: a trajetória
 * relativa sai da diferença entre as heliocêntricas da sonda e do asteroide.
 */
const SUBTRACT = { gaspra: '951;', ida: '243;', lutetia: '21;' };
const RADIUS_KM = { jupiter: 71_492, saturn: 60_268 };

/**
 * Encontro com `closest`: data aproximada da maior aproximação; a grade cobre
 * ±`outer` dias a cada 2 h e ±`inner` dias a cada minuto em torno do mínimo
 * achado na grade grossa. Com `from`/`to`: grade única (`step`), usada nas
 * partidas e nas órbitas. `ramp` = [entrada, saída] em dias da mistura com a
 * trajetória heliocêntrica (padrão: 25% da janela de cada lado); `departure`
 * começa colada na Terra; `until: 'surface'` corta a sonda ao tocar o planeta;
 * `kind: 'orbit'` marca uma estadia em órbita com saída (Dawn em Vesta).
 * Os sobrevoos de luas ficam dentro da janela do planeta e vêm depois dela na
 * lista: no app, cada janela se mistura sobre a anterior.
 */
const giant = (body, closest) => ({ body, closest, outer: 60, inner: 2 });
const rocky = (body, closest) => ({ body, closest, outer: 5, inner: 1 });
const small = (body, closest) => ({ body, closest, outer: 2, inner: 0.25 });
const moon = (body, closest) => ({ body, closest, outer: 1, inner: 0.1 });
const departure = (from, to) => ({ body: 'earth', from, to, step: '10 m', departure: true });

const MISSIONS = {
  voyager1: {
    name: 'Voyager 1',
    command: '-31',
    helio: [
      ['1977-09-05 14:00', '1981-01-01', '1 d'],
      ['1981-01-01', '2036-01-01', '5 d'],
    ],
    encounters: [
      departure('1977-09-05 14:00', '1977-09-25'),
      giant('jupiter', '1979-03-05'),
      giant('saturn', '1980-11-12'),
      moon('titan', '1980-11-12'),
    ],
  },
  voyager2: {
    name: 'Voyager 2',
    command: '-32',
    helio: [
      ['1977-08-20 15:40', '1990-01-01', '1 d'],
      ['1990-01-01', '2036-01-01', '5 d'],
    ],
    encounters: [
      departure('1977-08-20 15:40', '1977-09-10'),
      giant('jupiter', '1979-07-09'),
      giant('saturn', '1981-08-26'),
      giant('uranus', '1986-01-24'),
      giant('neptune', '1989-08-25'),
      moon('triton', '1989-08-25'),
    ],
  },
  pioneer10: {
    name: 'Pioneer 10',
    command: '-23',
    helio: [
      ['1972-03-03 02:05', '1975-01-01', '1 d'],
      ['1975-01-01', '2036-01-01', '5 d'],
    ],
    encounters: [departure('1972-03-03 02:05', '1972-03-18'), giant('jupiter', '1973-12-04')],
  },
  pioneer11: {
    name: 'Pioneer 11',
    command: '-24',
    helio: [
      ['1973-04-06 02:26', '1980-01-01', '1 d'],
      ['1980-01-01', '2036-01-01', '5 d'],
    ],
    encounters: [departure('1973-04-06 02:26', '1973-04-21'), giant('jupiter', '1974-12-03'), giant('saturn', '1979-09-01')],
  },
  galileo: {
    name: 'Galileo',
    command: '-77',
    helio: [['1989-10-19 01:30', '1995-11-01', '1 d']],
    encounters: [
      departure('1989-10-19 01:30', '1989-11-03'),
      rocky('venus', '1990-02-10'),
      rocky('earth', '1990-12-08'),
      small('gaspra', '1991-10-29'),
      rocky('earth', '1992-12-08'),
      small('ida', '1993-08-28'),
      { body: 'jupiter', from: '1995-10-08', to: '2003-09-30', step: '10 m', ramp: [15, 0], until: 'surface' },
      moon('io', '1995-12-07'),
      moon('ganymede', '1996-06-27'),
      moon('europa', '1997-12-16'),
    ],
  },
  'galileo-probe': {
    name: 'Sonda atmosférica da Galileo',
    command: '-344',
    helio: [['1995-07-13 05:32', '1995-10-25', '1 d']],
    encounters: [{ body: 'jupiter', from: '1995-10-08', to: '1995-12-07 22:07', step: '2 m', ramp: [15, 0] }],
  },
  cassini: {
    name: 'Cassini',
    command: '-82',
    helio: [['1997-10-15 09:28', '2004-05-20', '1 d']],
    encounters: [
      departure('1997-10-15 09:28', '1997-10-30'),
      rocky('venus', '1998-04-26'),
      rocky('venus', '1999-06-24'),
      rocky('earth', '1999-08-18'),
      giant('jupiter', '2000-12-30'),
      { body: 'saturn', from: '2004-05-01', to: '2017-09-15 11:58', step: '10 m', ramp: [15, 0], until: 'surface' },
      moon('titan', '2004-10-26'),
      moon('enceladus', '2015-10-28'),
    ],
  },
  huygens: {
    name: 'Huygens',
    command: '-150',
    helio: [],
    encounters: [{ body: 'titan', from: '2004-12-25 02:02', to: '2005-01-14 12:06', step: '2 m', ramp: [0, 0] }],
  },
  newhorizons: {
    name: 'New Horizons',
    command: '-98',
    helio: [
      ['2006-01-19 19:52', '2008-01-01', '1 d'],
      ['2008-01-01', '2036-01-01', '5 d'],
    ],
    encounters: [
      departure('2006-01-19 19:52', '2006-02-03'),
      giant('jupiter', '2007-02-28'),
      { body: 'pluto', closest: '2015-07-14', outer: 10, inner: 1 },
      small('arrokoth', '2019-01-01'),
    ],
  },
  juno: {
    name: 'Juno',
    command: '-61',
    helio: [['2011-08-05 17:20', '2016-05-21', '1 d']],
    encounters: [
      departure('2011-08-05 17:20', '2011-08-20'),
      rocky('earth', '2013-10-09'),
      { body: 'jupiter', from: '2016-05-06', to: '2028-09-02 01:30', step: '10 m', ramp: [15, 0] },
      moon('ganymede', '2021-06-07'),
      moon('europa', '2022-09-29'),
      moon('io', '2023-12-30'),
      moon('io', '2024-02-03'),
    ],
  },
  parker: {
    name: 'Parker Solar Probe',
    command: '-96',
    helio: [['2018-08-12 08:17', '2030-01-01', '1 h']],
    encounters: [
      departure('2018-08-12 08:17', '2018-08-27'),
      ...['2018-10-03', '2019-12-26', '2020-07-11', '2021-02-20', '2021-10-16', '2023-08-21', '2024-11-06'].map((d) => rocky('venus', d)),
    ],
  },
  dawn: {
    name: 'Dawn',
    command: '-203',
    // Fora das janelas de Vesta e Ceres; o motor iônico empurra quase o tempo todo.
    helio: [
      ['2007-09-27 12:45', '2011-05-25', '1 d'],
      ['2012-09-08', '2015-01-20', '1 d'],
    ],
    encounters: [
      departure('2007-09-27 12:45', '2007-10-12'),
      rocky('mars', '2009-02-18'),
      { body: 'vesta', from: '2011-05-03', to: '2012-09-25', step: '10 m', ramp: [15, 15], tol: 'asteroid', kind: 'orbit' },
      // Fim da missão: a hidrazina acabou em 31/10/2018; a nave segue em órbita de Ceres.
      { body: 'ceres', from: '2015-01-01', to: '2018-11-01', step: '10 m', ramp: [15, 0], tol: 'asteroid' },
    ],
  },
  rosetta: {
    name: 'Rosetta',
    command: '-226',
    helio: [['2004-03-02 09:28', '2014-03-20', '1 d']],
    encounters: [
      departure('2004-03-02 09:28', '2004-03-17'),
      rocky('earth', '2005-03-04'),
      rocky('mars', '2007-02-25'),
      rocky('earth', '2007-11-13'),
      small('steins', '2008-09-05'),
      rocky('earth', '2009-11-13'),
      small('lutetia', '2010-07-10'),
      // Pouso final no cometa: 30/09/2016 10:39:28 UTC (notas do Horizons para -226).
      { body: 'comet67p', from: '2014-03-04', to: '2016-09-30 10:40', step: '10 m', ramp: [15, 0], tol: 'comet' },
    ],
  },
};

/** Luas: centro no planeta (corpo), ajustadas de 1968 a 2036 (a Apollo 8 é de dezembro de 1968). */
const MOONS = {
  moon: { command: '301', parent: 'earth', step: '12 h' },
  io: { command: '501', parent: 'jupiter', step: '6 h' },
  europa: { command: '502', parent: 'jupiter', step: '6 h' },
  ganymede: { command: '503', parent: 'jupiter', step: '12 h' },
  callisto: { command: '504', parent: 'jupiter', step: '12 h' },
  enceladus: { command: '602', parent: 'saturn', step: '6 h' },
  titan: { command: '606', parent: 'saturn', step: '12 h' },
  triton: { command: '801', parent: 'neptune', step: '12 h' },
  charon: { command: '901', parent: 'pluto', step: '12 h' },
};
const MOON_SPAN = ['1968-01-01', '2036-01-01'];
const MOON_TOL_KM = 100;
const MOON_MAX_TERMS = 60;

/**
 * Corpos pequenos: trechos [comando, início, fim, passo]. O cometa e o
 * Arrokoth usam, nos anos dos encontros, as mesmas soluções das janelas
 * relativas (missão Rosetta e New Horizons), para o encontro casar.
 */
const SMALL_BODIES = {
  comet67p: [
    ['DES=67P; CAP; NOFRAG;', '2004-03-01', '2014-03-04', '1 d'],
    ['1000012', '2014-03-04', '2016-10-05', '1 d'],
  ],
  arrokoth: [
    ['2486958', '2006-01-01', '2034-01-01', '10 d'],
    ['DES=2486958;', '2034-01-01', '2036-01-01', '10 d'],
  ],
  steins: [['2002867', '2004-03-01', '2016-10-01', '2 d']],
  lutetia: [['21;', '2004-03-01', '2016-10-01', '2 d']],
  gaspra: [['951;', '1989-10-01', '2003-10-01', '2 d']],
  ida: [['243;', '1989-10-01', '2003-10-01', '2 d']],
  vesta: [['2000004', '2007-09-01', '2019-01-01', '2 d']],
  ceres: [['2000001', '2007-09-01', '2019-01-01', '2 d']],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STEP_MIN = { m: 1, h: 60, d: 1440 };
const stepMinutes = (step) => {
  const [n, unit] = step.split(' ');
  return Number(n) * STEP_MIN[unit];
};
const toIso = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const parseIso = (iso) => Date.parse(`${iso.length === 10 ? `${iso} 00:00` : iso}Z`.replace(' ', 'T'));
const jdToIso = (days) => toIso((days + J2000_JD - 2440587.5) * 86_400_000);

/** Vetores de um pedido (t em dias desde J2000 TDB; posição e velocidade em UA e UA/dia, ou km e km/s). */
async function request(command, center, start, stop, step, units = 'AU-D') {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${center}'`,
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
    VEC_TABLE: "'2'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    VEC_CORR: "'NONE'",
    OUT_UNITS: `'${units}'`,
    CSV_FORMAT: "'YES'",
  });
  const cacheFile = join(CACHE_DIR, `${createHash('sha256').update(params.toString()).digest('hex').slice(0, 24)}.json`);
  let rows = await readFile(cacheFile, 'utf8').then(JSON.parse, () => null);
  for (let attempt = 0; !rows; attempt++) {
    let body;
    try {
      const res = await fetch(`${API}?${params}`);
      if (res.status === 503 && attempt < 5) throw new Error('503');
      body = await res.json();
    } catch (err) {
      if (attempt >= 5) throw err;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (body.error) throw new Error(`${command} @ ${center} ${start}…${stop}: ${body.error}`);
    const text = body.result;
    const soe = text.indexOf('$$SOE');
    const eoe = text.indexOf('$$EOE');
    if (soe < 0 || eoe < 0) throw new Error(`Sem dados: ${command} @ ${center} ${start}…${stop}\n${text.slice(0, 800)}`);
    rows = [];
    for (const line of text.slice(soe + 5, eoe).trim().split('\n')) {
      const f = line.split(',').map((s) => s.trim());
      rows.push([Number(f[0]) - J2000_JD, ...f.slice(2, 8).map(Number)]);
    }
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile, JSON.stringify(rows));
    await sleep(250);
  }
  return rows;
}

/** Vetores num intervalo longo, em pedidos de até MAX_ROWS linhas. */
async function vectors(command, center, start, stop, step, units) {
  const chunkMs = MAX_ROWS * stepMinutes(step) * 60_000;
  const end = parseIso(stop);
  const rows = [];
  for (let a = parseIso(start); a < end; a += chunkMs) {
    rows.push(...(await request(command, center, toIso(a), toIso(Math.min(a + chunkMs, end)), step, units)));
  }
  return uniqueSorted(rows);
}

/** Vetores relativos a um corpo: centro do Horizons ou diferença das heliocêntricas. */
async function relativeVectors(command, body, start, stop, step) {
  if (CENTERS[body]) return vectors(command, CENTERS[body], start, stop, step);
  const target = SUBTRACT[body];
  if (!target) throw new Error(`Corpo sem centro: ${body}`);
  const probe = await vectors(command, CENTERS.sun, start, stop, step);
  const other = await vectors(target, CENTERS.sun, start, stop, step);
  if (probe.length !== other.length) throw new Error(`Grades diferentes para ${command} e ${target}`);
  return probe.map((r, i) => [r[0], ...r.slice(1).map((v, k) => v - other[i][k + 1])]);
}

/** Hermite cúbico entre duas amostras [t, x, y, z, vx, vy, vz]. */
function hermite(a, b, t) {
  const h = b[0] - a[0];
  const s = (t - a[0]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return [1, 2, 3].map((k) => h00 * a[k] + h10 * h * a[k + 3] + h01 * b[k] + h11 * h * b[k + 3]);
}

/** Funções de Stumpff [C(z), S(z)], com série perto de z = 0. */
function stumpff(z) {
  if (Math.abs(z) < 1e-3) return [1 / 2 - z / 24 + (z * z) / 720, 1 / 6 - z / 120 + (z * z) / 5040];
  if (z > 0) {
    const s = Math.sqrt(z);
    return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * s * s)];
  }
  const s = Math.sqrt(-z);
  return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * s * s)];
}

/**
 * Posição depois de `dt` na cônica em torno de μ, a partir da amostra
 * [t, x, y, z, vx, vy, vz] (variáveis universais, Newton com bisseção de
 * segurança). Sem gravidade apreciável, segue em linha reta. É a mesma conta
 * de `propagate` em src/probes/kepler.ts.
 */
function propagate(row, dt, mu) {
  const [, x, y, z, vx, vy, vz] = row;
  const r0 = Math.hypot(x, y, z);
  const v2 = vx * vx + vy * vy + vz * vz;
  if (dt === 0) return [x, y, z, vx, vy, vz];
  if (mu === 0 || v2 * r0 > 1e10 * mu) return [x + vx * dt, y + vy * dt, z + vz * dt, vx, vy, vz];
  const sqrtMu = Math.sqrt(mu);
  const rv = x * vx + y * vy + z * vz;
  const alpha = 2 / r0 - v2 / mu;
  // χ tem o sinal de dt; F(χ) cresce com χ, então a bisseção sempre tem um lado finito.
  // Na hipérbole, o intervalo vai até H = |χ|√(−α) = 700 (cosh e sinh estouram perto de 710).
  let lo = dt > 0 ? 0 : -Infinity;
  let hi = dt > 0 ? Infinity : 0;
  let chi = alpha > 1e-12 ? sqrtMu * dt * alpha : (sqrtMu * dt) / r0;
  if (alpha < -1e-12) {
    const maxChi = 700 / Math.sqrt(-alpha);
    lo = Math.max(lo, -maxChi);
    hi = Math.min(hi, maxChi);
    const a = 1 / alpha;
    const sign = Math.sign(dt);
    const guess = sign * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (rv + sign * Math.sqrt(-mu * a) * (1 - r0 * alpha)));
    chi = guess > lo && guess < hi ? guess : Math.min(Math.max(chi, lo / 2), hi / 2);
  }
  // Bisseção também quando o Newton não encolhe o passo à metade a cada dois (rtsafe).
  let step = Infinity;
  let stepBefore = Infinity;
  for (let k = 0; k < 200; k++) {
    const zz = alpha * chi * chi;
    const [C, S] = stumpff(zz);
    const F = (rv / sqrtMu) * chi * chi * C + (1 - alpha * r0) * chi * chi * chi * S + r0 * chi - sqrtMu * dt;
    const dF = (rv / sqrtMu) * chi * (1 - zz * S) + (1 - alpha * r0) * chi * chi * C + r0;
    // Raiz exata: o passo de Newton seria nulo, na borda do intervalo, e cairia na bisseção.
    if (F === 0) break;
    // Estouro numérico (cosh enorme) só acontece com |χ| grande demais.
    if (Number.isNaN(F) ? chi > 0 : F > 0) hi = chi;
    else lo = chi;
    let next = chi - F / dF;
    if (!(next > lo && next < hi) || Math.abs(2 * F) > Math.abs(stepBefore * dF)) {
      next = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : 2 * chi;
    }
    stepBefore = step;
    step = next - chi;
    const done = Math.abs(step) <= 1e-13 * Math.max(1, Math.abs(chi));
    chi = next;
    if (done) break;
  }
  const zz = alpha * chi * chi;
  const [C, S] = stumpff(zz);
  const f = 1 - ((chi * chi) / r0) * C;
  const g = dt - ((chi * chi * chi) / sqrtMu) * S;
  const px = f * x + g * vx;
  const py = f * y + g * vy;
  const pz = f * z + g * vz;
  const r = Math.hypot(px, py, pz);
  const fDot = (sqrtMu / (r * r0)) * (zz * chi * S - chi);
  const gDot = 1 - ((chi * chi) / r) * C;
  return [px, py, pz, fDot * x + gDot * vx, fDot * y + gDot * vy, fDot * z + gDot * vz];
}

/**
 * Interpolação do app entre duas amostras a e b: a órbita de Kepler
 * propagada a partir de a, mais uma correção cúbica de Hermite que leva ao
 * estado de b. A cônica dá conta da curvatura em torno do corpo central e a
 * correção, das perturbações suaves (outros planetas, maré do Sol).
 */
function keplerBlend(a, b, t, mu, end = propagate(a, b[0] - a[0], mu)) {
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const h01 = u * u * (3 - 2 * u);
  const h11 = u * u * (u - 1) * h;
  const p = propagate(a, t - a[0], mu);
  return [0, 1, 2].map((k) => p[k] + h01 * (b[k + 1] - end[k]) + h11 * (b[k + 4] - end[k + 3]));
}

/**
 * Mantém só as amostras de que a interpolação precisa para errar menos que
 * `tol` (UA) em torno de um corpo de parâmetro gravitacional `mu` (UA³/dia²).
 * Cada trecho cresce em passos dobrados e depois por bisseção até a maior
 * extensão que ainda reproduz todos os pontos intermediários.
 */
function decimate(rows, tol, mu) {
  const fits = (i, j) => {
    const end = propagate(rows[i], rows[j][0] - rows[i][0], mu);
    for (let k = i + 1; k < j; k++) {
      const p = keplerBlend(rows[i], rows[j], rows[k][0], mu, end);
      if (Math.hypot(p[0] - rows[k][1], p[1] - rows[k][2], p[2] - rows[k][3]) > tol) return false;
    }
    return true;
  };
  const last = rows.length - 1;
  const kept = [rows[0]];
  let i = 0;
  while (i < last) {
    let good = i + 1;
    let bad = -1;
    for (let span = 2; ; span *= 2) {
      const j = Math.min(i + span, last);
      if (!fits(i, j)) {
        bad = j;
        break;
      }
      good = j;
      if (j === last) break;
    }
    while (bad > 0 && bad - good > 1) {
      const mid = (good + bad) >> 1;
      if (fits(i, mid)) good = mid;
      else bad = mid;
    }
    kept.push(rows[good]);
    i = good;
  }
  return kept;
}

function uniqueSorted(rows) {
  return rows.sort((a, b) => a[0] - b[0]).filter((r, i, all) => i === 0 || r[0] - all[i - 1][0] > 1e-9);
}

const shiftDays = (iso, d) => toIso(parseIso(iso) + d * 86_400_000);
const distance = (r) => Math.hypot(r[1], r[2], r[3]);

/** Tabela compacta: tempos e estados planos, arredondados a ~10 algarismos. */
function pack(rows) {
  return {
    t: rows.map((r) => Number(r[0].toFixed(7))),
    s: rows.flatMap((r) => r.slice(1).map((v) => Number(v.toPrecision(10)))),
  };
}

/**
 * Janelas relativas em km e km/s (`units: 'km'`), mais curtas no JSON: casas
 * decimais conforme a tolerância (posição ao km e velocidade a 1 cm/s nos
 * sobrevoos; 10 m e 1 mm/s nas órbitas baixas de Vesta e Ceres; metros e
 * 0,01 mm/s em torno do cometa).
 */
const kmDecimals = (tolKm) => (tolKm < 1 ? [3, 8] : tolKm < 10 ? [2, 6] : [0, 5]);

/** A amostra (UA, UA/dia) como ela fica no JSON em km e km/s. */
function roundedKm(r, tolKm) {
  const [posDecimals, velDecimals] = kmDecimals(tolKm);
  const kms = AU_KM / DAY_S;
  return [
    Number(r[0].toFixed(7)),
    ...r.slice(1, 4).map((v) => Number((v * AU_KM).toFixed(posDecimals)) / AU_KM),
    ...r.slice(4, 7).map((v) => Number((v * kms).toFixed(velDecimals)) / kms),
  ];
}

function packKm(rows, tolKm) {
  const [posDecimals, velDecimals] = kmDecimals(tolKm);
  const kms = AU_KM / DAY_S;
  return {
    units: 'km',
    t: rows.map((r) => Number(r[0].toFixed(7))),
    s: rows.flatMap((r) => [
      ...r.slice(1, 4).map((v) => Number((v * AU_KM).toFixed(posDecimals))),
      ...r.slice(4, 7).map((v) => Number((v * kms).toFixed(velDecimals))),
    ]),
  };
}

/** Corta a tabela no instante em que a distância ao centro fica abaixo de `radiusAu` (bisseção no Hermite). */
function cutAtSurface(rows, radiusAu) {
  const k = rows.findIndex((r) => distance(r) < radiusAu);
  if (k <= 0) return rows;
  let lo = rows[k - 1][0];
  let hi = rows[k][0];
  for (let n = 0; n < 60; n++) {
    const mid = (lo + hi) / 2;
    if (Math.hypot(...hermite(rows[k - 1], rows[k], mid)) < radiusAu) hi = mid;
    else lo = mid;
  }
  const a = rows[k - 1];
  const b = rows[k];
  const h = b[0] - a[0];
  const s = (lo - a[0]) / h;
  // Velocidade pela derivada do Hermite no ponto de corte.
  const d00 = (6 * s * s - 6 * s) / h;
  const d10 = 3 * s * s - 4 * s + 1;
  const d01 = (-6 * s * s + 6 * s) / h;
  const d11 = 3 * s * s - 2 * s;
  const pos = hermite(a, b, lo);
  const vel = [1, 2, 3].map((c) => d00 * a[c] + d10 * a[c + 3] + d01 * b[c] + d11 * b[c + 3]);
  return [...rows.slice(0, k), [lo, ...pos, ...vel]];
}

async function fetchEncounter(command, e) {
  let rows;
  if (e.closest) {
    const coarse = await relativeVectors(command, e.body, shiftDays(e.closest, -e.outer), shiftDays(e.closest, e.outer), '2 h');
    const nearest = coarse.reduce((best, r) => (distance(r) < distance(best) ? r : best));
    const center = jdToIso(nearest[0]);
    const fine = await relativeVectors(command, e.body, shiftDays(center, -e.inner), shiftDays(center, e.inner), '1 m');
    rows = uniqueSorted([...coarse, ...fine]);
  } else {
    rows = await relativeVectors(command, e.body, e.from, e.to, e.step);
  }
  if (e.until === 'surface') rows = cutAtSurface(rows, RADIUS_KM[e.body] / AU_KM);
  const tolKm = TOL_KM[e.tol ?? (e.closest || e.departure ? 'flyby' : 'orbit')];
  // Enxuga com os números já arredondados como no JSON: numa órbita baixa, o arredondamento também erra.
  const kept = decimate(rows.map((r) => roundedKm(r, tolKm)), tolKm / AU_KM, MU_AU(GM[e.body]));
  console.log(`   ${e.body}: ${rows.length} → ${kept.length} amostras`);
  return {
    body: e.body,
    ...(e.departure ? { departure: true } : {}),
    ...(e.kind ? { kind: e.kind } : {}),
    ...(e.ramp ? { ramp: e.ramp } : {}),
    ...packKm(kept, tolKm),
  };
}

async function fetchMission(id) {
  const m = MISSIONS[id];
  console.log(`== ${m.name}`);
  const encounters = [];
  for (const e of m.encounters) encounters.push(await fetchEncounter(m.command, e));

  let helio = [];
  for (const [start, stop, step] of m.helio) helio.push(...(await vectors(m.command, CENTERS.sun, start, stop, step)));
  // Uma janela que termina na superfície também encerra a tabela heliocêntrica.
  const surface = m.encounters.findIndex((e) => e.until === 'surface');
  const end = surface < 0 ? Infinity : encounters[surface].t.at(-1);
  helio = uniqueSorted(helio).filter((r) => r[0] <= end);
  const helioKept = helio.length ? decimate(helio, TOL_KM.helio / AU_KM, MU_AU(GM.sun)) : [];
  console.log(`   heliocêntrica: ${helio.length} → ${helioKept.length} amostras`);

  return {
    id,
    name: m.name,
    source: `JPL Horizons (${m.command})`,
    frame: 'eclíptica J2000 (ICRF); dias desde J2000 TDB; UA e UA/dia',
    fetched: new Date().toISOString().slice(0, 10),
    helio: pack(helioKept),
    encounters,
  };
}

// ── Luas: série de Fourier ───────────────────────────────────────────────────

/** FFT complexa in-place (raiz 2). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Resolve G·x = b (G simétrica positiva) por Cholesky. */
function choleskySolve(G, b) {
  const m = b.length;
  const L = G.map((row) => row.slice());
  for (let j = 0; j < m; j++) {
    let d = L[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < m; i++) {
      let s = L[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  const y = new Array(m);
  for (let i = 0; i < m; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < m; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

/**
 * Ajusta x, y, z(t) = c + Σ aₖ cos(fₖ τ) + bₖ sin(fₖ τ), τ = t − t₀, com as
 * frequências achadas uma a uma no pico do espectro do resíduo (janela de
 * Hann, refinado por seção áurea) e as amplitudes por mínimos quadrados.
 */
function fitSeries(rows, tolKm, maxTerms) {
  const n = rows.length;
  const t0 = Number(((rows[0][0] + rows[n - 1][0]) / 2).toFixed(1));
  const tau = Float64Array.from(rows, (r) => r[0] - t0);
  const dt = tau[1] - tau[0];
  const X = [0, 1, 2].map((c) => Float64Array.from(rows, (r) => r[c + 1]));
  const hann = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  let size = 1;
  while (size < 2 * n) size <<= 1;

  const columns = [new Float64Array(n).fill(1)];
  const freqs = [];
  const G = [[n]];
  const b = X.map((x) => [x.reduce((s, v) => s + v, 0)]);
  let coef = b.map((bc) => [bc[0] / n]);
  const fit = X.map((_, c) => new Float64Array(n).fill(coef[c][0]));
  let maxErr = Infinity;

  for (let term = 0; term < maxTerms; term++) {
    const resid = X.map((x, c) => Float64Array.from(x, (v, i) => (v - fit[c][i]) * hann[i]));
    const power = new Float64Array(size / 2);
    for (const r of resid) {
      const re = new Float64Array(size);
      const im = new Float64Array(size);
      re.set(r);
      fft(re, im);
      for (let k = 1; k < size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    }
    let peak = 1;
    for (let k = 2; k < size / 2; k++) if (power[k] > power[peak]) peak = k;
    const df = (2 * Math.PI) / (size * dt);
    /** |Σ r(τ) e^{−i f τ}|² somado nas três coordenadas; a grade é uniforme, então e^{−i f τ} anda por rotação. */
    const projection = (f) => {
      const cr = Math.cos(f * dt);
      const ci = -Math.sin(f * dt);
      let total = 0;
      for (const r of resid) {
        let er = Math.cos(f * tau[0]);
        let ei = -Math.sin(f * tau[0]);
        let sr = 0;
        let si = 0;
        for (let i = 0; i < n; i++) {
          sr += r[i] * er;
          si += r[i] * ei;
          const nr = er * cr - ei * ci;
          ei = er * ci + ei * cr;
          er = nr;
        }
        total += sr * sr + si * si;
      }
      return total;
    };
    let lo = (peak - 1) * df;
    let hi = (peak + 1) * df;
    const g = (Math.sqrt(5) - 1) / 2;
    let a = hi - g * (hi - lo);
    let c = lo + g * (hi - lo);
    let pa = projection(a);
    let pc = projection(c);
    for (let k = 0; k < 40; k++) {
      if (pa > pc) {
        hi = c;
        c = a;
        pc = pa;
        a = hi - g * (hi - lo);
        pa = projection(a);
      } else {
        lo = a;
        a = c;
        pa = pc;
        c = lo + g * (hi - lo);
        pc = projection(c);
      }
    }
    const f = (lo + hi) / 2;
    freqs.push(f);

    // Duas colunas novas: cos e sin; atualiza a matriz normal e os segundos membros.
    for (const fn of [Math.cos, Math.sin]) {
      const col = Float64Array.from(tau, (x) => fn(f * x));
      const row = columns.map((other) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += other[i] * col[i];
        return s;
      });
      let self = 0;
      for (let i = 0; i < n; i++) self += col[i] * col[i];
      G.forEach((r, i) => r.push(row[i]));
      G.push([...row, self]);
      X.forEach((x, c) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += x[i] * col[i];
        b[c].push(s);
      });
      columns.push(col);
    }
    coef = b.map((bc) => choleskySolve(G, bc));
    maxErr = 0;
    for (let c = 0; c < 3; c++) fit[c].fill(0);
    for (let j = 0; j < columns.length; j++) {
      const col = columns[j];
      for (let c = 0; c < 3; c++) {
        const k = coef[c][j];
        const out = fit[c];
        for (let i = 0; i < n; i++) out[i] += k * col[i];
      }
    }
    for (let i = 0; i < n; i++) {
      maxErr = Math.max(maxErr, Math.hypot(X[0][i] - fit[0][i], X[1][i] - fit[1][i], X[2][i] - fit[2][i]));
    }
    if (maxErr <= tolKm) break;
  }
  const round = (v) => Number(v.toFixed(2));
  return {
    t0,
    maxErrorKm: Number(maxErr.toFixed(1)),
    c: coef.map((cc) => round(cc[0])),
    terms: freqs.map((f, k) => [
      Number(f.toPrecision(15)),
      ...[0, 1, 2].flatMap((c) => [round(coef[c][1 + 2 * k]), round(coef[c][2 + 2 * k])]),
    ]),
  };
}

async function fetchMoons() {
  const out = {
    source: 'JPL Horizons, centro no planeta (corpo), eclíptica J2000 (ICRF), em km',
    model: 'x, y, z = c + Σ [a cos(f τ) + b sin(f τ)], τ = dias desde J2000 − t0; termos: [f (rad/dia), ax, bx, ay, by, az, bz]',
    span: MOON_SPAN,
    fetched: new Date().toISOString().slice(0, 10),
    moons: {},
  };
  for (const [id, m] of Object.entries(MOONS)) {
    const rows = await vectors(m.command, CENTERS[m.parent], ...MOON_SPAN, m.step, 'KM-S');
    const series = fitSeries(rows, MOON_TOL_KM, MOON_MAX_TERMS);
    console.log(`== ${id}: ${rows.length} amostras → ${series.terms.length} termos, erro máximo ${series.maxErrorKm} km`);
    out.moons[id] = { parent: m.parent, ...series };
  }
  return out;
}

async function fetchSmallBodies() {
  const out = {
    source: 'JPL Horizons, centro do Sol',
    frame: 'eclíptica J2000 (ICRF); dias desde J2000 TDB; UA e UA/dia',
    fetched: new Date().toISOString().slice(0, 10),
    bodies: {},
  };
  for (const [id, segments] of Object.entries(SMALL_BODIES)) {
    let rows = [];
    for (const [command, start, stop, step] of segments) rows.push(...(await vectors(command, CENTERS.sun, start, stop, step)));
    rows = uniqueSorted(rows);
    const kept = decimate(rows, TOL_KM.helio / AU_KM, MU_AU(GM.sun));
    console.log(`== ${id}: ${rows.length} → ${kept.length} amostras`);
    out.bodies[id] = pack(kept);
  }
  return out;
}

/**
 * Planetas externos e Plutão: baricentros dos sistemas (planeta + luas). O
 * centro de cada planeta gira em torno do baricentro com as luas (até ~2 100 km
 * em Plutão, a cada 6,4 dias), o que não cabe numa grade de 10 dias.
 */
const BARYCENTERS = { jupiter: '5', saturn: '6', uranus: '7', neptune: '8', pluto: '9' };

async function fetchPlanets() {
  const out = {
    source: 'JPL Horizons, baricentros dos sistemas planetários',
    frame: 'eclíptica J2000 (ICRF); dias desde J2000 TDB; UA e UA/dia',
    fetched: new Date().toISOString().slice(0, 10),
  };
  for (const [name, command] of Object.entries(BARYCENTERS)) {
    const rows = await vectors(command, CENTERS.sun, '1968-01-01', '2037-01-01', '10 d');
    // Problema de dois corpos: o planeta orbita com μ = GM☉ + GM do planeta.
    const kept = decimate(rows, TOL_KM.helio / AU_KM, MU_AU(GM.sun + GM[name]));
    console.log(`== ${name}: ${rows.length} → ${kept.length} amostras`);
    out[name] = pack(kept);
  }
  return out;
}

/** Posições heliocêntricas de referência dos planetas, para testar os elementos aproximados. */
async function fetchFixtures() {
  console.log('== referências dos planetas');
  const bodies = { mercury: '199', venus: '299', earth: '3', mars: '499', jupiter: '599', saturn: '699', uranus: '799', neptune: '899' };
  const dates = ['1977-09-05', '1979-03-05', '1986-01-24', '1989-08-25', '2000-01-01', '2026-10-15'];
  const out = {};
  for (const [name, command] of Object.entries(bodies)) {
    out[name] = [];
    for (const date of dates) {
      const [row] = await request(command, CENTERS.sun, date, shiftDays(date, 1), '1 d');
      out[name].push(row.slice(0, 4).map((v) => Number(v.toPrecision(10))));
    }
  }
  return { source: 'JPL Horizons, centro do Sol, eclíptica J2000; [dias desde J2000, x, y, z] em UA', bodies: out };
}

const SPECIAL = {
  planets: ['planets', fetchPlanets],
  moons: ['moons', fetchMoons],
  'small-bodies': ['small-bodies', fetchSmallBodies],
  fixtures: ['planet-fixtures', fetchFixtures],
};
export { decimate, keplerBlend, pack, packKm, propagate, relativeVectors, uniqueSorted, MU_AU, GM, CENTERS, TOL_KM, AU_KM, DAY_S };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const targets = process.argv.slice(2);
  const all = targets.length ? targets : [...Object.keys(MISSIONS), ...Object.keys(SPECIAL)];
  await mkdir(OUT_DIR, { recursive: true });
  for (const id of all) {
    const [file, fetcher] = SPECIAL[id] ?? [id, () => fetchMission(id)];
    if (!SPECIAL[id] && !MISSIONS[id]) throw new Error(`Alvo desconhecido: ${id}`);
    const data = await fetcher();
    const path = join(OUT_DIR, `${file}.json`);
    await writeFile(path, `${JSON.stringify(data)}\n`);
    console.log(`   → ${path}`);
  }
}
