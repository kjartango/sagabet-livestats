// Smoke test for the fuzzy team matcher — run: node scripts/test-matcher.mjs
import { matchFixture, teamSimilarity } from '../src/background/matcher.js';

const fixtures = [
  { id: 1, home: { name: 'Manchester United' }, away: { name: 'Chelsea' } },
  { id: 2, home: { name: 'Bayern München' }, away: { name: 'Borussia Dortmund' } },
  { id: 3, home: { name: 'Paris Saint Germain' }, away: { name: 'Olympique Marseille' } },
  { id: 4, home: { name: 'Tottenham' }, away: { name: 'Wolves' } },
];

const cases = [
  [{ home: 'Man Utd', away: 'Chelsea FC' }, 1],
  [{ home: 'Chelsea', away: 'Manchester Utd' }, 1],
  [{ home: 'Bayern Munich', away: 'Dortmund' }, 2],
  [{ home: 'PSG', away: 'Marseille' }, 3],
  [{ home: 'Spurs', away: 'Wolverhampton Wanderers' }, 4],
  [{ home: 'Real Madrid', away: 'Barcelona' }, null],
];

let failed = 0;
for (const [bet, expected] of cases) {
  const m = matchFixture(bet, fixtures);
  const got = m ? m.fixture.id : null;
  const ok = got === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${bet.home} v ${bet.away} -> ${got}${ok ? '' : ` (expected ${expected})`}${m ? ` @${m.score.toFixed(2)}` : ''}`);
}
console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
