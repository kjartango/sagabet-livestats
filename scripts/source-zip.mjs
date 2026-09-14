#!/usr/bin/env node
// Builds the source archive for AMO's "source code" upload.
//
//   npm run source-zip
//
// Reviewers must be able to reproduce content/content.bundle.js offline, so
// this ships the real sources plus exact build instructions. Uses git archive,
// which means it contains precisely what is committed — never .env, dist/, or
// node_modules.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const out = path.join(root, `dist/sagabet-livestats-${pkg.version}-source.zip`);
const staging = path.join(root, 'dist/source-staging');

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

// git archive exports the committed tree only.
execFileSync('git', ['archive', '--format=tar', 'HEAD', '-o', path.join(staging, 'src.tar')], { cwd: root });
execFileSync('tar', ['xf', 'src.tar'], { cwd: staging });
await rm(path.join(staging, 'src.tar'));

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

await writeFile(path.join(staging, 'README-FOR-REVIEWERS.txt'), `SagaBet Live Stats — source for review
=====================================

Version:    ${pkg.version}
Repository: https://github.com/kjartango/sagabet-livestats
Commit:     ${commit}

This archive is the complete, unmodified source, exported with \`git archive\` from
the commit above. It is public: the same tree can be verified at
https://github.com/kjartango/sagabet-livestats/tree/${commit}


WHY THERE IS A BUILD STEP
-------------------------

One file in the submitted add-on is generated: content/content.bundle.js.

Content scripts cannot be declared as ES modules in a manifest, and the
alternative — import(runtime.getURL(...)) — is flagged by addons-linter as a
rejection risk. So the four ES modules under src/content/ are bundled into one
classic script with esbuild.

It is deliberately NOT minified. The output is readable and can be compared
directly against src/content/. No other file is transformed: the background
connectors and the options page ship exactly as they appear in src/.


HOW TO REPRODUCE THE SUBMITTED PACKAGE
--------------------------------------

Requires Node.js 18 or newer.

    npm install
    npm run build

This produces dist/firefox-listed/, which is the submitted add-on. Package it
with:

    cd dist/firefox-listed && zip -qr ../sagabet-livestats-firefox-listed.xpi .

The only build dependencies are esbuild (bundling) and, for tests only,
linkedom and web-ext. Nothing is fetched at build time beyond npm packages.


VERIFYING THE BUNDLE
--------------------

    npm test

test-bundle.mjs asserts, against the built artifacts, that the bundle parses,
contains no dynamic import() and no innerHTML, is not minified, and that the
manifests reference it correctly.

    npm run lint:listed

Runs addons-linter against the listed build. Expect 0 errors, 0 warnings.


WHAT THE EXTENSION DOES
-----------------------

src/content/extract.js   reads team names from the bet slip on epicbet
src/background/*.js      looks those matches up against a public football
                         statistics API (SofaScore by default, FotMob or
                         API-Football selectable)
src/content/render.js    draws the returned numbers into a shadow root under
                         each bet, building every node with createElement and
                         textContent

There is no remote code execution, no analytics, no telemetry, and no server
operated by this project. Settings are stored with browser.storage.local and
nothing about the user is transmitted anywhere.
`);

// git archive cannot include an ignored file, but this archive is uploaded to
// a third party — verify rather than assume.
const listing = execFileSync('find', ['.', '-type', 'f'], { cwd: staging, encoding: 'utf8' })
  .split('\n').map((f) => f.replace(/^\.\//, '')).filter(Boolean);
const leaked = listing.filter((f) => /(^|\/)\.env$/.test(f) || f.startsWith('node_modules/'));
if (leaked.length) {
  console.error(`Refusing to build: archive would contain ${leaked.join(', ')}`);
  process.exit(1);
}

await rm(out, { force: true });
execFileSync('zip', ['-qr', out, '.'], { cwd: staging });
await rm(staging, { recursive: true, force: true });

const { size } = await import('node:fs').then((fs) => fs.promises.stat(out));
console.log(`${path.relative(root, out)}  (${(size / 1024).toFixed(0)} KB)`);
