#!/usr/bin/env node
// Applies listing.json to the add-on's public AMO listing, and uploads the
// screenshot.
//
//   npm run update-listing
//
// Keeping the copy in listing.json rather than only in the Developer Hub means
// it is reviewable, diffable, and can be re-applied if a field is lost.
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUID = 'sagabet-livestats@kjartan';
const LOCALE = 'en-US';

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

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token() {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: issuer, jti: randomUUID(), iat, exp: iat + 60 });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const base = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(GUID)}`;
const listing = JSON.parse(await readFile(path.join(root, 'listing.json'), 'utf8'));
const screenshotOnly = process.argv.includes('--screenshot-only');

// ---- the text fields -------------------------------------------------------
// privacy_policy is deliberately absent: AMO's v5 API does not expose it as a
// writable field (only the read-only has_privacy_policy flag), so sending it
// is accepted and silently discarded. It must be pasted into the Developer Hub
// by hand — see the reminder printed at the end of this script.
const payload = {
  homepage: { [LOCALE]: listing.homepage },
  support_url: { [LOCALE]: listing.support_url },
  description: { [LOCALE]: listing.description },
  tags: listing.tags,
};

async function currentListing() {
  const r = await fetch(`${base}/`, { headers: { Authorization: `JWT ${token()}` } });
  if (!r.ok) { console.error(`GET failed: HTTP ${r.status}`); process.exit(1); }
  return r.json();
}

if (screenshotOnly) {
  const current = await currentListing();
  await uploadScreenshot(current);
  process.exit(0);
}

console.log('Updating listing fields…');
const res = await fetch(`${base}/`, {
  method: 'PATCH',
  headers: { Authorization: `JWT ${token()}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`PATCH failed: HTTP ${res.status}\n${body.slice(0, 900)}`);
  process.exit(1);
}
const updated = await res.json();
const t = (v) => (v && typeof v === 'object' ? (v[LOCALE] ?? Object.values(v)[0]) : v);
console.log(`  description    ${String(t(updated.description) || '').length} chars`);
console.log(`  privacy policy ${updated.has_privacy_policy ? 'set' : 'NOT SET — must be pasted in the Developer Hub'}`);
console.log(`  homepage       ${t(updated.homepage?.url) || 'MISSING'}`);
console.log(`  support_url    ${t(updated.support_url?.url) || 'MISSING'}`);
console.log(`  tags           ${JSON.stringify(updated.tags)}`);

// ---- the screenshot --------------------------------------------------------
await uploadScreenshot(updated);

if (!updated.has_privacy_policy) {
  console.log('\nSTILL TO DO BY HAND: the privacy policy.');
  console.log('AMO does not expose it to the API. Paste the text from LISTING.md into');
  console.log('Developer Hub -> Edit Product Page -> Privacy Policy.');
}

async function uploadScreenshot(addon) {
  if (!listing.screenshot) return;

  const existing = addon.previews || [];
  if (existing.length) {
    console.log(`\n${existing.length} screenshot(s) already attached — skipping upload.`);
    return;
  }

  const file = path.join(root, listing.screenshot.file);
  const bytes = await readFile(file);
  console.log(`\nUploading ${listing.screenshot.file} (${bytes.length} bytes)…`);

  const form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/png' }), path.basename(file));
  // Multipart can't carry a nested object as JSON here — AMO wants the
  // localised field expressed as caption[<lang>], Django-style.
  form.append(`caption[${LOCALE}]`, listing.screenshot.caption);
  form.append('position', '0');

  const up = await fetch(`${base}/previews/`, {
    method: 'POST',
    headers: { Authorization: `JWT ${token()}` },
    body: form,
  });
  if (!up.ok) {
    console.error(`Screenshot upload failed: HTTP ${up.status}\n${(await up.text()).slice(0, 400)}`);
    console.error('Retry just this step with: npm run update-listing -- --screenshot-only');
    return;
  }
  const preview = await up.json();
  console.log(`  uploaded, preview id ${preview.id}`);
}
