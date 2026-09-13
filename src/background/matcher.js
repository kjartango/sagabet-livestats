// Fuzzy-matches the team names scraped off epicbet to an API-Football fixture.
// Bookmakers and stats providers rarely spell clubs the same way
// ("Man Utd" vs "Manchester United", "Bayern" vs "FC Bayern München").

const NOISE = new Set([
  'fc', 'cf', 'afc', 'sc', 'ac', 'as', 'sv', 'bk', 'if', 'ik', 'fk', 'sk', 'ss', 'us',
  'club', 'de', 'futbol', 'football', 'calcio', 'cd', 'ud', 'rc', 'cs', 'sd', 'ca',
  'the', 'team', 'city', 'united', 'fsv', 'vfl', 'vfb', 'tsg', 'bsc', 'sport', 'sports',
]);

// Common bookmaker shorthands.
const ALIASES = new Map(Object.entries({
  'man utd': 'manchester united',
  'man united': 'manchester united',
  'man city': 'manchester city',
  'spurs': 'tottenham hotspur',
  'wolves': 'wolverhampton wanderers',
  'inter': 'inter milan',
  'psg': 'paris saint germain',
  'atleti': 'atletico madrid',
  'atl madrid': 'atletico madrid',
  'real': 'real madrid',
  'barca': 'barcelona',
  'bayern': 'bayern munich',
  'dortmund': 'borussia dortmund',
  'gladbach': 'borussia monchengladbach',
  'leverkusen': 'bayer leverkusen',
  'juve': 'juventus',
  'brighton': 'brighton hove albion',
  'west ham': 'west ham united',
  'newcastle': 'newcastle united',
  'leeds': 'leeds united',
  'sheff utd': 'sheffield united',
  'nottm forest': 'nottingham forest',
  "nott'm forest": 'nottingham forest',
}));

export function normalizeName(raw) {
  let s = String(raw || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip diacritics
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')                 // founding years: 1899, 1904
    .replace(/\s+/g, ' ')
    .trim();
  if (ALIASES.has(s)) s = ALIASES.get(s);
  return s;
}

function tokens(raw) {
  const t = normalizeName(raw).split(' ').filter(Boolean);
  const meaningful = t.filter((w) => !NOISE.has(w) && w.length > 1);
  return meaningful.length ? meaningful : t;
}

/** Sorensen-Dice coefficient over character bigrams. */
function dice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a), gb = grams(b);
  let shared = 0;
  for (const [g, n] of ga) shared += Math.min(n, gb.get(g) || 0);
  return (2 * shared) / ((a.length - 1) + (b.length - 1));
}

/** 0..1 similarity between two team names. */
export function teamSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  const setB = new Set(tb);
  let hits = 0;
  for (const w of ta) {
    if (setB.has(w)) { hits += 1; continue; }
    // Prefix match catches truncations: "monchengladbach" vs "monchen".
    if (tb.some((x) => x.length >= 4 && (x.startsWith(w) || w.startsWith(x)))) { hits += 0.8; continue; }
    // Character-level fallback for transliterations: "munchen" vs "munich".
    const best = Math.max(0, ...tb.map((x) => dice(w, x)));
    if (best >= 0.5) hits += best;
  }
  const overlap = hits / Math.max(ta.length, tb.length);

  // Containment: "arsenal" inside "arsenal fc".
  const contained = na.includes(nb) || nb.includes(na) ? 0.85 : 0;
  return Math.max(overlap, contained);
}

const THRESHOLD = 0.62;

/**
 * Find the fixture for a scraped bet.
 * @param {{home:string, away:string}} bet
 * @param {Array} fixtures normalized fixtures from api-football.js
 * @returns {{fixture:Object, swapped:boolean, score:number}|null}
 */
export function matchFixture(bet, fixtures) {
  let best = null;
  for (const fx of fixtures) {
    const direct = (teamSimilarity(bet.home, fx.home.name) + teamSimilarity(bet.away, fx.away.name)) / 2;
    const swapped = (teamSimilarity(bet.home, fx.away.name) + teamSimilarity(bet.away, fx.home.name)) / 2;
    let score = Math.max(direct, swapped);

    // epicbet localises competition names ("Enska Úrvalsdeildin" for the
    // Premier League), so the league can only break ties between two fixtures
    // that already match on team names — never gate a match.
    if (bet.league && score > 0) {
      const l = Math.max(
        teamSimilarity(bet.league, fx.league?.name || ''),
        teamSimilarity(bet.league, fx.league?.country || ''),
      );
      if (l > 0.5) score += 0.03;
    }

    if (!best || score > best.score) {
      best = { fixture: fx, swapped: swapped > direct, score: Math.min(score, 1) };
    }
  }
  if (!best || best.score < THRESHOLD) return null;
  return best;
}
