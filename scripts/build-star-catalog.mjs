#!/usr/bin/env node
/**
 * Baixa o catálogo HYG v4.1 (astronexus, CC BY-SA 4.0: Hipparcos, Yale Bright
 * Star e Gliese) e grava as estrelas visíveis a olho nu (V ≤ 6,5) em
 * src/sky/data/bright-stars.json, num vetor plano:
 *
 *   [ascensão reta (°), declinação (°), magnitude V, índice B−V, distância (pc; 0 = desconhecida), ...]
 *
 * As que têm nome próprio (os nomes da IAU no HYG, alguns na forma usada no Brasil) vão também, no mesmo
 * formato e com os nomes, para src/sky/data/named-stars.json: os rótulos do telescópio, sem carregar o
 * catálogo inteiro na thread principal.
 *
 * Uso: npm run build:stars (atrás do proxy do ambiente cloud, com NODE_USE_ENV_PROXY=1).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';
const CACHE = join(ROOT, 'node_modules/.cache/hyg/hygdata_v41.csv');
const OUTPUT = join(ROOT, 'src/sky/data/bright-stars.json');
const NAMED_OUTPUT = join(ROOT, 'src/sky/data/named-stars.json');
/** Nomes na forma usada no Brasil; os demais ficam como na lista da IAU. */
const PT_BR_NAMES = {
  Sirius: 'Sírius',
  Arcturus: 'Arcturo',
  'Rigil Kentaurus': 'Alfa Centauri A',
  Toliman: 'Alfa Centauri B',
  Capella: 'Capela',
  Procyon: 'Prócion',
  Aldebaran: 'Aldebarã',
  Spica: 'Espiga',
  Pollux: 'Pólux',
  Regulus: 'Régulo',
  Polaris: 'Estrela Polar',
};
const MAG_LIMIT = 6.5;
/** O HYG marca paralaxe desconhecida com 100 000 pc. */
const UNKNOWN_DIST_PC = 99_999;

async function loadCsv() {
  try {
    return await readFile(CACHE, 'utf8');
  } catch {
    console.log(`Baixando ${SOURCE_URL}…`);
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar o HYG`);
    const text = await response.text();
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, text);
    return text;
  }
}

/** Divide uma linha CSV com campos entre aspas. */
function splitCsv(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

const round = (x, digits) => Number(x.toFixed(digits));
const significant = (x, digits) => Number(x.toPrecision(digits));

const csv = await loadCsv();
const [header, ...lines] = csv.trim().split('\n');
const col = Object.fromEntries(splitCsv(header).map((name, i) => [name, i]));
const stars = [];
for (const line of lines) {
  const f = splitCsv(line);
  const mag = Number(f[col.mag]);
  if (!(mag <= MAG_LIMIT) || f[col.proper] === 'Sol') continue;
  const dist = Number(f[col.dist]);
  const ci = f[col.ci] === '' ? 0.6 : Number(f[col.ci]);
  const row = [
    round(Number(f[col.ra]) * 15, 3),
    round(Number(f[col.dec]), 3),
    round(mag, 2),
    round(ci, 2),
    dist > 0 && dist < UNKNOWN_DIST_PC ? significant(dist, 4) : 0,
  ];
  const proper = f[col.proper];
  stars.push(proper ? Object.assign(row, { name: PT_BR_NAMES[proper] ?? proper }) : row);
}
// Das mais brilhantes para as mais fracas: quem vem antes ganha a célula em caso de empate.
stars.sort((a, b) => a[2] - b[2]);
const named = stars.filter((s) => s.name);

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(
  OUTPUT,
  `${JSON.stringify({
    source: 'HYG v4.1 (astronexus/HYG-Database, CC BY-SA 4.0)',
    fields: ['raDeg', 'decDeg', 'magV', 'bv', 'distPc'],
    magLimit: MAG_LIMIT,
    count: stars.length,
    stars: stars.flat(),
  })}\n`,
);
await writeFile(
  NAMED_OUTPUT,
  `${JSON.stringify({
    source: 'HYG v4.1 (astronexus/HYG-Database, CC BY-SA 4.0): as estrelas com nome próprio',
    fields: ['raDeg', 'decDeg', 'magV', 'bv', 'distPc'],
    names: named.map((s) => s.name),
    stars: named.flatMap((s) => [...s]),
  })}\n`,
);
console.log(`${stars.length} estrelas com V ≤ ${MAG_LIMIT} em ${OUTPUT}, ${named.length} com nome em ${NAMED_OUTPUT}`);
