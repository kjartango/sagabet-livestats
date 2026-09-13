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

const { renderStats, setExpanded } = await import('../src/content/render.js');
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
