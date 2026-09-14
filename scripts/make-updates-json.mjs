#!/usr/bin/env node
// Regenerates updates.json, the manifest Firefox polls for self-distributed
// updates. Run after publishing a signed .xpi to a GitHub release.
//
//   node scripts/make-updates-json.mjs
//
// The linked file must be the SIGNED .xpi downloaded from AMO's Developer Hub.
// Firefox refuses to install an unsigned one, so pointing this at a locally
// built artifact silently breaks updates for everyone.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'kjartango/sagabet-livestats';
const ADDON_ID = 'sagabet-livestats@kjartan';

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const file = path.join(root, 'updates.json');

// Keep the history: Firefox picks the newest entry a given client can install.
let existing = { addons: { [ADDON_ID]: { updates: [] } } };
try {
  existing = JSON.parse(await readFile(file, 'utf8'));
} catch { /* first run */ }

const updates = existing.addons?.[ADDON_ID]?.updates ?? [];
const entry = {
  version: pkg.version,
  update_link: `https://github.com/${REPO}/releases/download/v${pkg.version}/sagabet-livestats-firefox-mv2.xpi`,
};

const at = updates.findIndex((u) => u.version === pkg.version);
if (at >= 0) updates[at] = entry;
else updates.push(entry);
updates.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));

await writeFile(file, JSON.stringify({ addons: { [ADDON_ID]: { updates } } }, null, 2) + '\n');
console.log(`updates.json -> ${pkg.version}\n  ${entry.update_link}`);
