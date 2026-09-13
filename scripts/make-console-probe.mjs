// Builds a paste-into-DevTools probe from the real adapter source, so what runs
// in the console is exactly what the extension runs.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/content/extract.js', 'utf8').replace(/^export /gm, '');

const probe = `(() => {
${src}
const bets = extractBets();
console.table(bets.map((b) => ({
  home: b.home, away: b.away, league: b.league,
  live: b.live, sport: b.sportId, matchId: b.matchId,
  market: b.market, pick: b.pick,
})));
console.log('selections parsed:', bets.length, '| live football:', bets.filter((b) => b.live && isFootball(b)).length);
return bets.length;
})()`;

writeFileSync('scripts/console-probe.js', probe);
console.log(`wrote scripts/console-probe.js (${probe.length} bytes)`);
