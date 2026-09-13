#!/usr/bin/env node
// Builds per-browser packages from src/ into dist/<target>/.
// No bundler: the extension ships plain ES modules.
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src');
const DIST = path.join(root, 'dist');

const targets = {
  chrome: (m) => m,

  firefox: (m) => ({
    ...m,
    // Firefox MV3 uses an event page rather than a service worker.
    background: { scripts: [m.background.service_worker], type: 'module' },
    browser_specific_settings: {
      gecko: { id: 'sagabet-livestats@kjartan', strict_min_version: '128.0' },
    },
  }),

  // Firefox MV2. Worth keeping alongside the MV3 build because MV2 grants host
  // permissions at install time, where MV3 on Firefox makes them opt-in and the
  // extension silently fetches nothing until the user grants them by hand.
  'firefox-mv2': (m) => ({
    manifest_version: 2,
    name: m.name,
    version: m.version,
    description: m.description,
    // MV2 folds host permissions into the one list, granted on install.
    permissions: [...m.permissions, ...m.host_permissions],
    background: { page: 'background/background.html', persistent: false },
    content_scripts: m.content_scripts,
    // MV2 takes a flat list rather than match-scoped objects.
    web_accessible_resources: m.web_accessible_resources[0].resources,
    options_ui: m.options_ui,
    browser_action: m.action,
    icons: m.icons,
    browser_specific_settings: {
      gecko: { id: 'sagabet-livestats@kjartan', strict_min_version: '115.0' },
    },
  }),

  // Safari reads a standard MV3 manifest; xcrun wraps it into an app.
  safari: (m) => m,
};

async function build(name) {
  const out = path.join(DIST, name);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(SRC, out, { recursive: true });

  const base = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
  const manifest = targets[name](structuredClone(base));
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Firefox-family browsers install from a zipped .xpi, so emit one too.
  if (name.startsWith('firefox')) {
    const xpi = path.join(DIST, `sagabet-livestats-${name}.xpi`);
    await rm(xpi, { force: true });
    try {
      execFileSync('zip', ['-qr', '-FS', xpi, '.'], { cwd: out });
      console.log(`built dist/${name}  ->  ${path.relative(root, xpi)}`);
      return;
    } catch {
      console.log(`built dist/${name}  (zip unavailable, no .xpi emitted)`);
      return;
    }
  }
  console.log(`built dist/${name}`);
}

const wanted = process.argv.slice(2).filter((a) => a in targets);
for (const name of (wanted.length ? wanted : Object.keys(targets))) await build(name);
