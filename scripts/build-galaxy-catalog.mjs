#!/usr/bin/env node
/**
 * Baixa o OpenNGC (Mattia Verga, CC BY-SA 4.0: os objetos do NGC e do IC, com as Nuvens de Magalhães no
 * adendo) e grava as galáxias com magnitude B ≤ 12,5 de distância conhecida em src/sky/data/galaxies.json,
 * num vetor plano:
 *
 *   [ascensão reta (°), declinação (°), distância (Mpc), magnitude V, diâmetro maior D25 (′), temperatura de cor (K), ...]
 *
 * A distância vem, nesta ordem:
 * - do Volume Local: as galáxias brilhantes a menos de ~10 Mpc, com distâncias da literatura (Cefeidas,
 *   ponta do ramo das gigantes vermelhas, maser de M106), porque ali a velocidade não mede distância;
 * - do Aglomerado de Virgem: a menos de 10° de M87 e com velocidade de −500 a 3 000 km/s, os 16,5 Mpc do
 *   aglomerado (a profundidade dele, ~2 Mpc, fica de fora);
 * - da lei de Hubble, v/H₀ com H₀ = 70 km/s/Mpc, a partir de 1 000 km/s (abaixo, a velocidade própria pesa
 *   demais e a galáxia fica de fora).
 *
 * Uso: npm run build:galaxies (atrás do proxy do ambiente cloud, com NODE_USE_ENV_PROXY=1).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files';
const FILES = ['NGC.csv', 'addendum.csv'];
const CACHE = join(ROOT, 'node_modules/.cache/openngc');
const OUTPUT = join(ROOT, 'src/sky/data/galaxies.json');
const MAG_LIMIT_B = 12.5;
const H0 = 70;
const VIRGO = { ra: 187.7059, dec: 12.3911, radiusDeg: 10, distanceMpc: 16.5, minVelocity: -500, maxVelocity: 3000 };
const HUBBLE_MIN_VELOCITY = 1000;

/** Volume Local: distâncias (Mpc) da literatura, pelo nome do OpenNGC. */
const LOCAL_VOLUME_MPC = {
  'ESO056-115': 0.05, // Grande Nuvem de Magalhães
  NGC0292: 0.062, // Pequena Nuvem de Magalhães
  NGC0224: 0.78, // Andrômeda, M31
  NGC0221: 0.78, // M32
  NGC0205: 0.82, // M110
  NGC0185: 0.62,
  NGC0147: 0.71,
  NGC0598: 0.85, // Triângulo, M33
  NGC6822: 0.5, // Galáxia de Barnard
  IC1613: 0.73,
  IC0010: 0.74,
  PGC000143: 0.93, // WLM
  'ESO356-004': 0.14, // Anã de Fornax
  'ESO351-030': 0.086, // Anã do Escultor
  UGC05470: 0.25, // Leão I
  PGC088608: 0.086, // Anã do Sextante
  NGC3109: 1.3,
  PGC029653: 1.4, // Sextans A
  UGC05373: 1.4, // Sextans B
  NGC0055: 2.1,
  NGC0300: 2.0,
  NGC0253: 3.5,
  NGC0247: 3.6,
  NGC7793: 3.9,
  NGC3031: 3.6, // M81
  NGC3034: 3.5, // M82
  NGC3077: 3.8,
  NGC2403: 3.2,
  NGC2976: 3.6,
  IC2574: 4.0,
  NGC4236: 4.4,
  IC0342: 3.3,
  NGC5128: 3.8, // Centaurus A
  NGC5236: 4.9, // M83
  NGC4945: 3.7,
  NGC5102: 3.4,
  NGC5253: 3.6,
  NGC1313: 4.3,
  NGC4736: 4.7, // M94
  NGC4826: 4.4, // M64
  NGC4449: 4.2,
  NGC4214: 2.9,
  NGC4395: 4.6,
  NGC4244: 4.4,
  NGC4258: 7.6, // M106 (maser)
  NGC5055: 9.0, // M63
  NGC4631: 7.4,
  NGC5457: 6.9, // M101
  NGC5194: 8.6, // M51
  NGC5195: 8.6,
  NGC6946: 7.7,
};

async function loadCsv(name) {
  const cached = join(CACHE, name);
  try {
    return await readFile(cached, 'utf8');
  } catch {
    const url = `${BASE_URL}/${name}`;
    console.log(`Baixando ${url}…`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar ${name}`);
    const text = await response.text();
    await mkdir(CACHE, { recursive: true });
    await writeFile(cached, text);
    return text;
  }
}

const toDeg = (text, hours) => {
  const sign = text.trim().startsWith('-') ? -1 : 1;
  const [a, b, c] = text.replace(/^[+-]/, '').split(':').map(Number);
  return sign * (a + b / 60 + c / 3600) * (hours ? 15 : 1);
};

function separationDeg(ra1, dec1, ra2, dec2) {
  const r = Math.PI / 180;
  const cos = Math.sin(dec1 * r) * Math.sin(dec2 * r) + Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, cos)) / r;
}

/** Temperatura de cor pelo índice B−V (Ballesteros, 2012); sem cor medida, pelo tipo de Hubble. */
function colorTemperature(b, v, hubble) {
  const bv = b - v;
  if (Number.isFinite(bv) && bv > 0 && bv < 1.5) return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  if (/^(E|S0)/.test(hubble)) return 4800;
  if (/^I|m$/.test(hubble)) return 7000;
  return 5800;
}

const num = (s) => (s === undefined || s.trim() === '' ? NaN : Number(s));
const round = (x, digits) => Number(x.toFixed(digits));
const significant = (x, digits) => Number(x.toPrecision(digits));

const galaxies = [];
for (const file of FILES) {
  const [header, ...lines] = (await loadCsv(file)).trim().split('\n');
  const col = Object.fromEntries(header.split(';').map((name, i) => [name, i]));
  for (const line of lines) {
    const f = line.split(';');
    if (f[col.Type] !== 'G') continue;
    const name = f[col.Name];
    const b = num(f[col['B-Mag']]);
    const vMag = num(f[col['V-Mag']]);
    const blue = Number.isFinite(b) ? b : vMag + 0.8;
    if (!(blue <= MAG_LIMIT_B)) continue;
    const major = num(f[col.MajAx]);
    if (!(major > 0)) continue;
    const ra = toDeg(f[col.RA], true);
    const dec = toDeg(f[col.Dec], false);
    const velocity = num(f[col.RadVel]);
    let distanceMpc = LOCAL_VOLUME_MPC[name];
    if (distanceMpc === undefined) {
      if (!Number.isFinite(velocity)) continue;
      const inVirgo =
        separationDeg(ra, dec, VIRGO.ra, VIRGO.dec) < VIRGO.radiusDeg && velocity > VIRGO.minVelocity && velocity < VIRGO.maxVelocity;
      if (inVirgo) distanceMpc = VIRGO.distanceMpc;
      else if (velocity >= HUBBLE_MIN_VELOCITY) distanceMpc = velocity / H0;
      else continue;
    }
    // Sem V medida, a cor típica de uma galáxia (B − V ≈ 0,8).
    const v = Number.isFinite(vMag) ? vMag : blue - 0.8;
    galaxies.push({
      name,
      row: [
        round(ra, 4),
        round(dec, 4),
        significant(distanceMpc, 3),
        round(v, 2),
        significant(major, 3),
        Math.round(colorTemperature(b, vMag, f[col.Hubble] ?? '') / 10) * 10,
      ],
    });
  }
}
// Das mais brilhantes para as mais fracas.
galaxies.sort((a, b) => a.row[3] - b.row[3]);

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(
  OUTPUT,
  `${JSON.stringify({
    source: 'OpenNGC (Mattia Verga, CC BY-SA 4.0), https://github.com/mattiaverga/OpenNGC',
    fields: ['raDeg', 'decDeg', 'distanceMpc', 'vMag', 'majorAxisArcmin', 'colorTempK'],
    names: galaxies.map((g) => g.name),
    galaxies: galaxies.flatMap((g) => g.row),
  })}\n`,
);
console.log(`${galaxies.length} galáxias gravadas em ${OUTPUT}`);
