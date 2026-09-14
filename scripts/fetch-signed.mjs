#!/usr/bin/env node
// Downloads an already-signed .xpi from AMO.
//
//   npm run fetch-signed [version]
//
// `npm run sign` uploads and then waits for signing to finish. If that wait is
// interrupted, the upload has still happened and the version number is spent —
// re-running sign fails with "Version already exists". This fetches the signed
// file for a version that is already on AMO, so an interrupted run can be
// resumed instead of burning another version number.
import { createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const env = await readFile(path.join(root, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* use the real environment */ }

const issuer = process.env.AMO_JWT_ISSUER;
const secret = process.env.AMO_JWT_SECRET;
if (!issuer || !secret) {
  console.error('Missing AMO_JWT_ISSUER / AMO_JWT_SECRET — see scripts/sign.mjs.');
  process.exit(1);
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o))
  .toString('base64url');

/** AMO wants a short-lived HS256 token per request. */
function token() {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: issuer, jti: randomUUID(), iat, exp: iat + 60 });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const api = (p) => fetch(`https://addons.mozilla.org/api/v5${p}`, {
  headers: { Authorization: `JWT ${token()}` },
});

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;
const GUID = 'sagabet-livestats@kjartan';

console.log(`Looking up ${GUID} v${version}…`);

// The versions list is the endpoint that covers unlisted channels; the
// per-version signing endpoint web-ext polls is not reachable afterwards.
const res = await api(`/addons/addon/${encodeURIComponent(GUID)}/versions/?filter=all_with_unlisted`);
if (!res.ok) {
  console.error(`AMO returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const { results = [] } = await res.json();
const found = results.find((v) => v.version === version);
if (!found) {
  console.error(`AMO has no version ${version}. It knows about: ${results.map((v) => v.version).join(', ') || '(none)'}`);
  process.exit(1);
}

const file = found.file;
console.log(`  version id ${found.id}  channel ${found.channel}  status ${file?.status}`);
if (!file?.url) {
  console.error('That version has no downloadable file yet — signing may still be running.');
  process.exit(1);
}
if (file.status !== 'public') {
  console.error(`File status is "${file.status}", not "public" — not signed yet. Try again shortly.`);
  process.exit(1);
}

const dl = await fetch(file.url, { headers: { Authorization: `JWT ${token()}` } });
if (!dl.ok) {
  console.error(`Download failed: HTTP ${dl.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await dl.arrayBuffer());

// Guard against silently shipping something unsigned: an unsigned .xpi on the
// release installs for nobody and breaks auto-updates with no visible error.
if (!bytes.includes('META-INF/mozilla.rsa')) {
  console.error('Downloaded file carries no Mozilla signature — refusing to use it.');
  process.exit(1);
}

await mkdir(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/sagabet-livestats-firefox-mv2.xpi');
await writeFile(out, bytes);
console.log(`\nSigned: ${path.relative(root, out)} (${bytes.length} bytes)`);
console.log('Next: npm run release');
