// Full pipeline on real data: scrape the saved epicbet page for the anchor, and
// render captured live-provider output into it.
//   node scripts/test-render.mjs
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { extractBets } from '../src/content/extract.js';
import { DEFAULTS } from '../src/common/settings.js';

const fixture = (n) => JSON.parse(readFileSync(`samples/api/${n}.json`, 'utf8'));
const ROUTES = [
  [/\/events\/live/, 'sofascore-live'],
  [/\/statistics$/, 'sofascore-statistics'],
  [/\/lineups$/, 'sofascore-lineups'],
  [/\/incidents$/, 'sofascore-incidents'],
];
globalThis.fetch = async (url) => {
  const hit = ROUTES.find(([re]) => re.test(String(url)));
  if (!hit) return { ok: false, status: 404, json: async () => null };
  return { ok: true, status: 200, json: async () => fixture(hit[1]) };
};

const html = readFileSync('samples/fixtures/bets.html', 'utf8');
const { document } = parseHTML(html);
globalThis.document = document;

const { renderStats, setExpanded, markBadge, MARKER_CLASS } = await import('../src/content/render.js');
const provider = await import('../src/background/sofascore.js');

const bet = extractBets().find((b) => b.live);
console.log(`anchor from the page fixture: <div class="${bet.anchor.className}">  (${bet.home} - ${bet.away}, ${bet.market})\n`);

// Render real provider output into that anchor.
const fixtures = await provider.fetchLiveFixtures();
const fx = fixtures[0];
const detail = await provider.fetchFixtureDetail(fx.id);

const data = {
  state: 'live', provider: provider.id, providerLabel: provider.label, confidence: 0.96,
  fixtureId: fx.id, league: fx.league, status: fx.status, elapsed: 73, extra: null,
  home: fx.home, away: fx.away, goals: fx.goals,
};
const settings = { ...DEFAULTS, teamStats: [...DEFAULTS.teamStats, 'xg'] };

// Collapsed, then expanded, exactly as clicking the toggle does.
for (const open of [false, true]) {
  setExpanded(bet.key, open);
  renderStats(bet.anchor, data, detail, settings, bet);

  const shadow = [...bet.anchor.children].find((c) => c.className === 'sagabet-livestats-host').shadowRoot;
  console.log(open ? '--- expanded ---' : '--- collapsed ---');
  console.log('chips: ' + [...shadow.querySelectorAll('.chips .chip')]
    .map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join('  |  '));

  const table = shadow.querySelector('.players');
  if (!table) { console.log(); continue; }
  for (const side of shadow.querySelectorAll('.side')) {
    console.log('\n  ' + side.querySelector('h4').textContent);
    const head = [...side.querySelectorAll('th')].map((t) => t.textContent.trim());
    console.log('    ' + head[0].padEnd(22) + head.slice(1).map((h) => h.padStart(6)).join(''));
    for (const tr of [...side.querySelectorAll('tbody tr')].slice(0, 4)) {
      const td = [...tr.querySelectorAll('td')].map((t) => t.textContent.replace(/\s+/g, ' ').trim());
      console.log('    ' + td[0].padEnd(22) + td.slice(1).map((v) => v.padStart(6)).join(''));
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// A lookup that finds nothing must say so, and mark epicbet's own live badge.
console.log('--- no match found ---');
renderStats(bet.anchor, {
  state: 'no-live-match',
  provider: 'sofascore',
  providerLabel: 'SofaScore',
  searched: 137,
  closest: { home: 'Vancouver Whitecaps', away: 'Austin FC', league: 'MLS', score: 0.41 },
}, null, settings, bet);
markBadge(bet.badge, 'unavailable');

const shadow = [...bet.anchor.children].find((c) => c.className === 'sagabet-livestats-host').shadowRoot;
const chips = [...shadow.querySelectorAll('.chips .chip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
console.log('chips: ' + chips.join('  |  '));
const mark = [...bet.badge.children].find((c) => c.className === MARKER_CLASS);
console.log(`badge: "${bet.badge.textContent.trim()}"  (marker ${JSON.stringify(mark?.textContent)}, title: ${JSON.stringify(mark?.title)})`);

let failed = 0;
const check = (label, ok) => { if (!ok) failed += 1; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); };
console.log();
check('a failed lookup renders a strip instead of vanishing', chips.length > 0);
check('it says stats are unavailable', chips.some((c) => /No live stats/i.test(c)));
check('it names the closest fixture', chips.some((c) => /Vancouver Whitecaps/.test(c)));
check('it reports how many were searched', chips.some((c) => /137/.test(c)));
check('epicbet\'s live badge is marked', mark?.textContent === '✕');

markBadge(bet.badge, 'available');
check('the marker flips to available without duplicating', 
  bet.badge.querySelectorAll(`.${MARKER_CLASS}`).length === 1
  && [...bet.badge.children].find((c) => c.className === MARKER_CLASS).textContent === '✓');

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
