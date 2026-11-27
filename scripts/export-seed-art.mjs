/**
 * Writes the demo catalogue artwork to disk so a deployment keeps its images
 * without an object store.
 *
 * Every demo product picture is generated from its kind and palette
 * (see src/seed/art.js), so the same files can be produced ahead of time,
 * committed, and served by the `local` storage driver. Set STORAGE_DIR to the
 * folder written here (default `assets`) and the API serves /media/<key> from
 * it. Files uploaded by shop owners at runtime still land on the instance disk.
 *
 *   node scripts/export-seed-art.mjs [outDir]
 *
 * The default output is server/storage/media, which is where the `local`
 * storage driver looks. That folder is gitignored except for media/seed, so the
 * generated pictures travel with the repository and survive a redeploy.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOPS } from '../server/src/seed/content.js';
import { productArt } from '../server/src/seed/art.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.argv[2] || path.join('server', 'storage', 'media'));
const seedDir = path.join(outDir, 'seed');

const wanted = new Map();
for (const shop of SHOPS) {
  for (const row of shop.products) {
    const [, , , , , kind, palette] = row;
    for (const [suffix, closeUp] of [['a', false], ['b', true]]) {
      const key = `${kind}-${palette}-${suffix}.svg`;
      if (!wanted.has(key)) wanted.set(key, { kind, palette, closeUp });
    }
  }
}

await fs.mkdir(seedDir, { recursive: true });
let written = 0;
for (const [file, { kind, palette, closeUp }] of wanted) {
  await fs.writeFile(path.join(seedDir, file), productArt(kind, palette, { closeUp }));
  written += 1;
}

console.log(`wrote ${written} files (${wanted.size} unique pictures) to ${path.relative(root, seedDir)}`);
