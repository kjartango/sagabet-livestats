#!/usr/bin/env node
// Submits the Firefox build to AMO's signing API and drops the signed .xpi
// into dist/, ready to attach to a GitHub release.
//
//   npm run sign
//
// Credentials come from the environment, never from this repo:
//   AMO_JWT_ISSUER  ("JWT issuer" from the AMO API key page)
//   AMO_JWT_SECRET  ("JWT secret" from the same page)
//
// Generate them at https://addons.mozilla.org/developers/addon/api/key/
// A .env file in the project root is read if present; it is gitignored.
import { execFileSync } from 'node:child_process';
import { readFile, readdir, rename, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'dist/firefox-mv2');
const ARTIFACTS = path.join(root, 'dist/web-ext-artifacts');
const FINAL = path.join(root, 'dist/sagabet-livestats-firefox-mv2.xpi');

// A .env is convenient and easy to leak; it is in .gitignore for a reason.
try {
  const env = await readFile(path.join(root, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env, use the real environment */ }

const issuer = process.env.AMO_JWT_ISSUER;
const secret = process.env.AMO_JWT_SECRET;
if (!issuer || !secret) {
  console.error(`Missing AMO credentials.

Create them at https://addons.mozilla.org/developers/addon/api/key/ then either
export them:

  export AMO_JWT_ISSUER='user:12345678:123'
  export AMO_JWT_SECRET='...'

or put them in a .env file in the project root (already gitignored):

  AMO_JWT_ISSUER=user:12345678:123
  AMO_JWT_SECRET=...

The secret is shown once and cannot be retrieved again. Treat it like a password:
anyone holding it can publish add-ons as you.`);
  process.exit(1);
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'src/manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) {
  console.error(`Version mismatch: package.json is ${pkg.version}, src/manifest.json is ${manifest.version}.`);
  process.exit(1);
}

console.log(`Signing v${pkg.version} as an unlisted (self-distributed) add-on…`);
await rm(ARTIFACTS, { recursive: true, force: true });
await mkdir(ARTIFACTS, { recursive: true });

try {
  execFileSync('npx', [
    '--no-install', 'web-ext', 'sign',
    '--source-dir', SOURCE,
    '--artifacts-dir', ARTIFACTS,
    '--channel', 'unlisted',
    '--api-key', issuer,
    '--api-secret', secret,
  ], { cwd: root, stdio: 'inherit' });
} catch {
  // web-ext prints the reason; adding our own stack on top only buries it.
  console.error('\nSigning failed. If AMO rejected the upload, run `npm run lint` for the reasons.');
  process.exit(1);
}

// web-ext names the file after the add-on id; updates.json links by a fixed
// name, so normalise it.
const produced = (await readdir(ARTIFACTS)).filter((f) => f.endsWith('.xpi'));
if (!produced.length) {
  console.error('Signing reported success but produced no .xpi.');
  process.exit(1);
}
await rename(path.join(ARTIFACTS, produced[0]), FINAL);
console.log(`\nSigned: ${path.relative(root, FINAL)}`);
console.log('Next: npm run release');
