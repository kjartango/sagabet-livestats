#!/usr/bin/env node
// Publishes an already-signed build: GitHub release, update manifest, push.
//
//   npm run release
//
// Expects dist/sagabet-livestats-firefox-mv2.xpi to be the SIGNED file (run
// `npm run sign` first) and the working tree to be clean.
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts }).trim();

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const tag = `v${pkg.version}`;
const xpi = path.join(root, 'dist/sagabet-livestats-firefox-mv2.xpi');
const zip = path.join(root, 'dist/sagabet-livestats-chrome.zip');

for (const f of [xpi, zip]) {
  try {
    await access(f);
  } catch {
    console.error(`Missing ${path.relative(root, f)} — run npm run build (and npm run sign).`);
    process.exit(1);
  }
}

// An unsigned .xpi here would install for nobody and break auto-updates
// silently, so refuse rather than publish one.
const signed = (await readFile(xpi)).includes('META-INF/mozilla.rsa');
if (!signed) {
  console.error(`${path.relative(root, xpi)} is not signed — run npm run sign first.`);
  process.exit(1);
}

if (run('git', ['status', '--porcelain'])) {
  console.error('Working tree is dirty. Commit before releasing.');
  process.exit(1);
}

let exists = true;
try { run('gh', ['release', 'view', tag]); } catch { exists = false; }

if (exists) {
  console.log(`Updating assets on ${tag}…`);
  run('gh', ['release', 'upload', tag, xpi, zip, '--clobber'], { stdio: 'inherit' });
} else {
  console.log(`Creating ${tag}…`);
  run('gh', ['release', 'create', tag, xpi, zip, '--title', tag, '--generate-notes'], { stdio: 'inherit' });
}

run('node', ['scripts/make-updates-json.mjs'], { stdio: 'inherit' });
if (run('git', ['status', '--porcelain'])) {
  run('git', ['add', 'updates.json']);
  run('git', ['commit', '-m', `Release ${tag}`]);
  run('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
}
console.log(`\nReleased ${tag}. Installed copies update within a day, or immediately via about:addons → Check for Updates.`);
