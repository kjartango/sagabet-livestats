// Runs the DOM adapter against a saved copy of the real bets view.
//   node scripts/test-extract.mjs [samples/open_bets.html]
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { extractBets, isFootball } from '../src/content/extract.js';

const file = process.argv[2] || 'samples/fixtures/bets.html';
const html = readFileSync(file, 'utf8')
  // The saved page inlines megabytes of base64 SVG; parsing is 5x faster without it.
  .replace(/<svg[\s\S]*?<\/svg>/g, '<svg></svg>');

const { document } = parseHTML(html);
globalThis.document = document;

const bets = extractBets();
console.log(`${bets.length} selection(s) found in ${file}\n`);
for (const b of bets) {
  const flags = [
    b.live ? 'LIVE' : '',
    isFootball(b) ? '' : `sport=${b.sportId}`,
    b.matchId ? `match=${b.matchId}` : '',
  ].filter(Boolean).join(' ');
  console.log(`  ${b.home}  vs  ${b.away}`);
  console.log(`    league=${b.league || '–'}  pick=${b.pick}  market=${b.market}`);
  console.log(`    key=${b.key}  anchor=<${b.anchor.tagName.toLowerCase()}>  ${flags}`);
}

// Expectations for the committed fixture. Running against a real saved page
// just prints, since its contents aren't known ahead of time.
if (file.endsWith('fixtures/bets.html')) {
  const by = (name) => bets.find((b) => b.home === name);
  const checks = [
    ['parses every real fixture, and only those', bets.length === 4],
    ['live match flagged live', by('Northport')?.live === true],
    ['finished match not flagged live', by('Harbour Rovers')?.live === false],
    ['unstarted match not flagged live', by('Ashford Town')?.live === false],
    ['outright rejected (market contains " - ")', !bets.some((b) => b.away === 'Westvale' && b.market.includes('H2H'))],
    ['american football excluded by sport id', !isFootball(by('BAY Otters'))],
    ['league read off the meta line', by('Northport')?.league === 'Example League'],
    ['anchor is the wrapper, not the selection', by('Northport')?.anchor.className === '_1axdwyn0'],
  ];
  let failed = 0;
  console.log();
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
  console.log(failed ? `\n${failed} failing` : '\nall passing');
  process.exit(failed ? 1 : 0);
}
