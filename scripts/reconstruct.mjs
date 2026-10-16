#!/usr/bin/env node
/**
 * Reconstrói pela mecânica orbital as missões que o JPL Horizons não tem
 * (CLAUDE.md §11) e grava src/probes/data/*.json no formato das tabelas do
 * Horizons. As contas ficam em src/probes/reconstruct/ (TypeScript, com o
 * mesmo modelo de planetas, luas e rotação do app), carregadas pelo Vite.
 *
 * Uso: node scripts/reconstruct.mjs [alvos...]   (sem alvos: todas)
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'probes', 'data');

const { module } = await runnerImport(join(ROOT, 'src', 'probes', 'reconstruct', 'index.ts'), { configFile: false, root: ROOT, logLevel: 'error' });
const targets = process.argv.slice(2);
for (const target of targets.length ? targets : module.TARGETS) {
  const started = Date.now();
  const outputs = module.build(target);
  for (const [file, data] of Object.entries(outputs)) {
    const path = join(OUT_DIR, `${file}.json`);
    await writeFile(path, `${JSON.stringify(data)}\n`);
    const samples = data.encounters.reduce((n, e) => n + e.t.length, data.helio.t.length);
    console.log(`== ${data.name}: ${samples} amostras, ${Date.now() - started} ms → ${path}`);
    console.log(`   ${JSON.stringify(data.reconstruction)}`);
  }
}
