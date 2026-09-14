#!/usr/bin/env node
// Builds per-browser packages from src/ into dist/<target>/.
// No bundler: the extension ships plain ES modules.
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build as esbuild } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Self-distributed Firefox builds need somewhere to look for updates. AMO
// handles updates for listed add-ons, so a listed submission must NOT carry
// this key — see RELEASING.md.
const UPDATE_URL = 'https://raw.githubusercontent.com/kjartango/sagabet-livestats/main/updates.json';

// Firefox requires every new extension to declare what user data it collects.
// This one collects none: settings stay in local storage and nothing about the
// user is transmitted anywhere. "none" cannot be combined with other values.
//
// The key is only understood from Firefox 140 (Android 142), which is why
// strict_min_version sits there rather than lower — older builds would receive
// an extension whose data declaration they cannot read.
const DATA_COLLECTION = { required: ['none'] };
const SRC = path.join(root, 'src');
const DIST = path.join(root, 'dist');

const targets = {
  chrome: (m) => m,

  firefox: (m) => ({
    ...m,
    // Firefox MV3 uses an event page rather than a service worker.
    background: { scripts: [m.background.service_worker], type: 'module' },
    browser_specific_settings: {
      gecko: {
        id: 'sagabet-livestats@kjartan',
        strict_min_version: '140.0',
        update_url: UPDATE_URL,
        data_collection_permissions: DATA_COLLECTION,
      },
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
    options_ui: m.options_ui,
    browser_action: m.action,
    icons: m.icons,
    browser_specific_settings: {
      gecko: {
        id: 'sagabet-livestats@kjartan',
        strict_min_version: '140.0',
        update_url: UPDATE_URL,
        data_collection_permissions: DATA_COLLECTION,
      },
    },
  }),

  // Safari reads a standard MV3 manifest; xcrun wraps it into an app.
  safari: (m) => m,
};

/**
 * Bundle the content script into one classic file.
 *
 * Content scripts cannot be declared as modules, so the alternative is a
 * dynamic `import(runtime.getURL(...))` — which Mozilla's validator flags as a
 * rejection risk. Bundling removes it, and lets the manifest drop
 * web_accessible_resources entirely.
 *
 * Deliberately NOT minified: the shipped file stays readable, so a reviewer (or
 * anyone curious) can compare it against the source in this repo.
 */
async function bundleContentScript(outDir) {
  await esbuild({
    entryPoints: [path.join(SRC, 'content/content.js')],
    outfile: path.join(outDir, 'content/content.bundle.js'),
    bundle: true,
    format: 'iife',
    target: ['chrome111', 'firefox115', 'safari16'],
    minify: false,
    legalComments: 'inline',
    banner: { js: '// Bundled from src/content/ by scripts/build.mjs — not minified.\n// Source: https://github.com/kjartango/sagabet-livestats' },
  });

  // The module sources are inputs to the bundle, not shipped files.
  for (const f of ['content.js', 'extract.js', 'render.js', 'loader.js']) {
    await rm(path.join(outDir, 'content', f), { force: true });
  }
}

async function build(name) {
  const out = path.join(DIST, name);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(SRC, out, { recursive: true });

  await bundleContentScript(out);

  const base = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
  const manifest = targets[name](structuredClone(base));
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Chrome is installed by unzipping and pointing "Load unpacked" at the folder.
  if (name === 'chrome') {
    const zip = path.join(DIST, 'sagabet-livestats-chrome.zip');
    const staged = path.join(DIST, 'sagabet-livestats-chrome');
    await rm(zip, { force: true });
    await rm(staged, { recursive: true, force: true });
    try {
      // Unzipping should yield one clearly-named folder, since Chrome loads the
      // extension from wherever the user leaves it.
      await cp(out, staged, { recursive: true });
      execFileSync('zip', ['-qr', zip, 'sagabet-livestats-chrome'], { cwd: DIST });
      await rm(staged, { recursive: true, force: true });
      console.log(`built dist/${name}  ->  ${path.relative(root, zip)}`);
      return;
    } catch {
      console.log(`built dist/${name}  (zip unavailable)`);
      return;
    }
  }

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
