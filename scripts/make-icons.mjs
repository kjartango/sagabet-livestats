#!/usr/bin/env node
// Rasterises src/icons/icon.svg into the sizes the manifests reference.
// Needs rsvg-convert (librsvg).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src/icons/icon.svg');
const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  const out = path.join(root, `src/icons/icon${size}.png`);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out, src]);
  console.log(`icon${size}.png`);
}
