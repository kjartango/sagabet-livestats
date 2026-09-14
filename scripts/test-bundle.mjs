// Checks the shipped artifacts, not the sources — the bundle is what reviewers
// read and what runs in the browser.
//   node scripts/test-bundle.mjs
import { readFile, access } from 'node:fs/promises';
import { Script } from 'node:vm';

const TARGETS = ['chrome', 'firefox', 'firefox-mv2', 'safari'];
let failed = 0;

function check(label, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ` — ${detail}` : ''}`);
}

for (const target of TARGETS) {
  console.log(`\n=== dist/${target} ===`);
  const dir = `dist/${target}`;
  const bundlePath = `${dir}/content/content.bundle.js`;

  let code = '';
  try {
    code = await readFile(bundlePath, 'utf8');
  } catch {
    check('content bundle exists', false, bundlePath);
    continue;
  }
  check('content bundle exists', true);

  // Valid syntax without executing it — it expects a browser at runtime.
  let parses = true;
  try { new Script(code); } catch (e) { parses = false; check('bundle parses', false, e.message); }
  if (parses) check('bundle parses', true);

  // Mozilla flags dynamic import in content scripts as a rejection risk.
  check('no dynamic import()', !/\bimport\s*\(/.test(code));
  // Every node is built with createElement/textContent.
  check('no innerHTML', !/\.innerHTML\b/.test(code));
  // Readable for review rather than minified.
  check('not minified', code.split('\n').length > 100);

  const manifest = JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8'));
  check('manifest points at the bundle',
    manifest.content_scripts?.[0]?.js?.[0] === 'content/content.bundle.js',
    JSON.stringify(manifest.content_scripts?.[0]?.js));
  check('no web_accessible_resources needed', !manifest.web_accessible_resources);

  // The module sources are build inputs, not shipped files.
  for (const stale of ['loader.js', 'content.js', 'render.js', 'extract.js']) {
    let present = true;
    try { await access(`${dir}/content/${stale}`); } catch { present = false; }
    check(`content/${stale} not shipped`, !present);
  }

  if (target.startsWith('firefox')) {
    const gecko = manifest.browser_specific_settings?.gecko;
    check('declares data collection', gecko?.data_collection_permissions?.required?.[0] === 'none');
    check('declares update_url for self-distribution', !!gecko?.update_url);
  }
}

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
