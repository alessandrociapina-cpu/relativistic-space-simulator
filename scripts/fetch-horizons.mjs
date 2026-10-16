#!/usr/bin/env node
/**
 * Baixa do JPL Horizons as efemérides das sondas e grava src/probes/data/<id>.json.
 *
 * - Trajetória heliocêntrica (centro do Sol, eclíptica J2000, UA e UA/dia, TDB).
 * - Nos encontros (partida da Terra e sobrevoos), a trajetória centrada no
 *   planeta, para o sobrevoo passar no lugar exato mesmo com os planetas
 *   calculados pelos elementos aproximados de Kepler.
 * - Cada tabela é baixada numa grade fina e depois enxugada: um ponto só fica
 *   se a interpolação de Hermite (posição + velocidade) sem ele errar mais que
 *   a tolerância (150 km no espaço interplanetário, 15 km perto dos planetas).
 *
 * Uso: NODE_USE_ENV_PROXY=1 node scripts/fetch-horizons.mjs [voyager1 voyager2 planets fixtures]
 * Requer acesso a ssd.jpl.nasa.gov. O app publicado não acessa o JPL.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'probes', 'data');
const J2000_JD = 2451545.0;
const AU_KM = 149_597_870.7;
const HELIO_TOL_AU = 150 / AU_KM;
const ENCOUNTER_TOL_AU = 15 / AU_KM;

/** Centros do Horizons: Sol e planetas (corpo, não baricentro). */
const CENTERS = {
  sun: '500@10',
  earth: '500@399',
  venus: '500@299',
  mars: '500@499',
  jupiter: '500@599',
  saturn: '500@699',
  uranus: '500@799',
  neptune: '500@899',
  pluto: '500@999',
};

/**
 * Encontro: `closest` é a data aproximada da maior aproximação; a grade fina
 * cobre ±`inner` dias a cada `innerStep` e ±`outer` dias a cada `outerStep`.
 * Partidas usam `from`/`to` explícitos.
 */
const MISSIONS = {
  voyager1: {
    name: 'Voyager 1',
    command: '-31',
    helio: [
      ['1977-09-05 14:00', '1981-01-01', '1 d'],
      ['1981-01-01', '2036-01-01', '5 d'],
    ],
    encounters: [
      { body: 'earth', from: '1977-09-05 14:00', to: '1977-09-25', step: '10 m' },
      { body: 'jupiter', closest: '1979-03-05', outer: 60, inner: 2 },
      { body: 'saturn', closest: '1980-11-12', outer: 60, inner: 2 },
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
      { body: 'earth', from: '1977-08-20 15:40', to: '1977-09-10', step: '10 m' },
      { body: 'jupiter', closest: '1979-07-09', outer: 60, inner: 2 },
      { body: 'saturn', closest: '1981-08-26', outer: 60, inner: 2 },
      { body: 'uranus', closest: '1986-01-24', outer: 60, inner: 2 },
      { body: 'neptune', closest: '1989-08-25', outer: 60, inner: 2 },
    ],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Vetores (t em dias desde J2000 TDB; x, y, z em UA; vx, vy, vz em UA/dia). */
async function vectors(command, center, start, stop, step) {
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
    OUT_UNITS: "'AU-D'",
    CSV_FORMAT: "'YES'",
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}?${params}`);
    if (res.status === 503 && attempt < 4) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    const body = await res.json();
    if (body.error) throw new Error(`${command} @ ${center} ${start}…${stop}: ${body.error}`);
    const text = body.result;
    const soe = text.indexOf('$$SOE');
    const eoe = text.indexOf('$$EOE');
    if (soe < 0 || eoe < 0) throw new Error(`Sem dados: ${command} ${start}…${stop}\n${text.slice(0, 800)}`);
    const rows = [];
    for (const line of text.slice(soe + 5, eoe).trim().split('\n')) {
      const f = line.split(',').map((s) => s.trim());
      rows.push([Number(f[0]) - J2000_JD, ...f.slice(2, 8).map(Number)]);
    }
    await sleep(300);
    return rows;
  }
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

/** Mantém só as amostras de que a interpolação precisa para errar menos que `tol`. */
function decimate(rows, tol) {
  const kept = [rows[0]];
  let i = 0;
  while (i < rows.length - 1) {
    let j = i + 1;
    // Avança enquanto o trecho i→j+1 reproduz todos os pontos intermediários.
    while (j + 1 < rows.length) {
      const next = j + 1;
      let ok = true;
      for (let k = i + 1; k < next && ok; k++) {
        const p = hermite(rows[i], rows[next], rows[k][0]);
        ok = Math.hypot(p[0] - rows[k][1], p[1] - rows[k][2], p[2] - rows[k][3]) <= tol;
      }
      if (!ok) break;
      j = next;
    }
    kept.push(rows[j]);
    i = j;
  }
  return kept;
}

const uniqueSorted = (rows) =>
  rows.sort((a, b) => a[0] - b[0]).filter((r, i, all) => i === 0 || r[0] - all[i - 1][0] > 1e-9);

const days = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 16).replace('T', ' ');

/** Tabela compacta: tempos e estados planos, arredondados a ~10 algarismos. */
function pack(rows) {
  return {
    t: rows.map((r) => Number(r[0].toFixed(7))),
    s: rows.flatMap((r) => r.slice(1).map((v) => Number(v.toPrecision(10)))),
  };
}

async function fetchMission(id) {
  const m = MISSIONS[id];
  console.log(`== ${m.name}`);
  let helio = [];
  for (const [start, stop, step] of m.helio) helio.push(...(await vectors(m.command, CENTERS.sun, start, stop, step)));
  helio = uniqueSorted(helio);
  const helioKept = decimate(helio, HELIO_TOL_AU);
  console.log(`   heliocêntrica: ${helio.length} → ${helioKept.length} amostras`);

  const encounters = [];
  for (const e of m.encounters) {
    const grids = e.closest
      ? [
          [days(e.closest, -e.outer), days(e.closest, e.outer), '2 h'],
          [days(e.closest, -e.inner), days(e.closest, e.inner), '1 m'],
        ]
      : [[e.from, e.to, e.step]];
    let rows = [];
    for (const [start, stop, step] of grids) rows.push(...(await vectors(m.command, CENTERS[e.body], start, stop, step)));
    rows = uniqueSorted(rows);
    const kept = decimate(rows, ENCOUNTER_TOL_AU);
    console.log(`   ${e.body}: ${rows.length} → ${kept.length} amostras`);
    encounters.push({ body: e.body, ...pack(kept) });
  }

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
    const rows = uniqueSorted(await vectors(command, CENTERS.sun, '1969-01-01', '2037-01-01', '10 d'));
    const kept = decimate(rows, HELIO_TOL_AU);
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
      const [row] = await vectors(command, CENTERS.sun, date, days(date, 1), '1 d');
      out[name].push(row.slice(0, 4).map((v) => Number(v.toPrecision(10))));
    }
  }
  return { source: 'JPL Horizons, centro do Sol, eclíptica J2000; [dias desde J2000, x, y, z] em UA', bodies: out };
}

const targets = process.argv.slice(2);
const all = targets.length ? targets : [...Object.keys(MISSIONS), 'planets', 'fixtures'];
await mkdir(OUT_DIR, { recursive: true });
for (const id of all) {
  const data = id === 'planets' ? await fetchPlanets() : id === 'fixtures' ? await fetchFixtures() : await fetchMission(id);
  const file = join(OUT_DIR, `${id === 'fixtures' ? 'planet-fixtures' : id}.json`);
  await writeFile(file, `${JSON.stringify(data)}\n`);
  console.log(`   → ${file}`);
}
