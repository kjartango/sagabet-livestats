// Exercises both connectors against captured API responses, with no network.
// Node's fetch is TLS-fingerprinted and refused by these hosts, so live calls
// only work from a real browser — which is where the extension runs anyway.
//   node scripts/test-normalize.mjs
import { readFileSync } from 'node:fs';
import { PLAYER_STATS } from '../src/background/stat-keys.js';

const fixture = (n) => JSON.parse(readFileSync(`samples/api/${n}.json`, 'utf8'));

const ROUTES = [
  [/sofascore.*\/events\/live/, 'sofascore-live'],
  [/sofascore.*\/statistics$/, 'sofascore-statistics'],
  [/sofascore.*\/lineups$/, 'sofascore-lineups'],
  [/sofascore.*\/incidents$/, 'sofascore-incidents'],
  [/fotmob.*\/matches\?/, 'fotmob-matches'],
  [/fotmob.*\/matchDetails\?/, 'fotmob-details'],
  [/api-(sports|football).*\/fixtures\?live/, 'api-football-live'],
  [/api-(sports|football).*\/fixtures\/statistics/, 'api-football-statistics'],
  [/api-(sports|football).*\/fixtures\/players/, 'api-football-players'],
];

// API-Football is the only connector that takes configuration.
const CFG = { apiKey: 'test-key-not-a-real-one', apiHost: 'api-sports' };

globalThis.fetch = async (url) => {
  const hit = ROUTES.find(([re]) => re.test(String(url)));
  if (!hit) return { ok: false, status: 404, json: async () => null };
  return { ok: true, status: 200, json: async () => fixture(hit[1]) };
};

let failures = 0;
function check(label, condition, detail = '') {
  const ok = !!condition;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ` — ${detail}` : ''}`);
}

for (const name of ['sofascore', 'fotmob', 'api-football']) {
  const provider = await import(`../src/background/${name}.js`);
  console.log(`\n=== ${provider.label} ===`);

  const fixtures = await provider.fetchLiveFixtures(CFG);
  check(`live fixtures parsed (${fixtures.length})`, fixtures.length > 0);
  check('teams named', fixtures.every((f) => f.home.name && f.away.name));
  check('ids present', fixtures.every((f) => f.id != null));

  const f = fixtures[0];
  console.log(`     e.g. ${f.home.name} ${f.goals.home}-${f.goals.away} ${f.away.name}`
    + `  [${f.elapsed ?? '?'}${f.extra ? `+${f.extra}` : ''}']  ${f.league.name}`);

  const detail = await provider.fetchFixtureDetail(f.id, { includePlayers: true }, CFG);
  const team = detail.team;
  check(`team stats parsed (${Object.keys(team).length})`, Object.keys(team).length > 5);
  check('shotsTotal present', team.shotsTotal && team.shotsTotal.home != null,
    JSON.stringify(team.shotsTotal));
  check('shotsOn present', !!team.shotsOn);
  check('corners present', !!team.corners);
  check('fouls present', !!team.fouls);
  check('cards present', !!team.yellow);
  for (const k of ['shotsTotal', 'shotsOn', 'corners', 'fouls', 'yellow']) {
    if (team[k]) console.log(`     ${team[k].label.padEnd(12)} ${String(team[k].home).padStart(4)} / ${team[k].away}`);
  }

  check('players parsed', !!detail.players && detail.players.home.length > 0);
  if (detail.players) {
    const all = [...detail.players.home, ...detail.players.away];
    const withShots = all.filter((p) => p.stats.shots > 0);
    check(`per-player shots present (${withShots.length} players)`, withShots.length > 0);
    const cols = PLAYER_STATS.filter((c) => all.some((p) => p.stats[c.key] != null));
    check(`per-player stat coverage (${cols.length} of ${PLAYER_STATS.length} keys)`, cols.length >= 5);
    console.log(`     keys: ${cols.map((c) => c.key).join(', ')}`);
    for (const p of withShots.sort((a, b) => b.stats.shots - a.stats.shots).slice(0, 3)) {
      console.log(`     ${p.name.padEnd(22)} shots=${p.stats.shots} on=${p.stats.shotsOn ?? '–'}`
        + ` fouls=${p.stats.fouls ?? '–'} card=${p.cards ?? '–'}`);
    }
  }
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
