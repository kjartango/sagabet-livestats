// API-Football connector (bring-your-own-key).
//
// Unlike the other two this is a documented, licensed API — which is the point
// of offering it. The user supplies their own key in the options, so the terms
// of use sit with them and nothing secret ever enters this repo or the build.
//
// A browser extension cannot hide a key: everything ships to the user as
// readable files. BYOK is the only honest arrangement here.
//
//   /fixtures?live=all            every match in play
//   /fixtures/statistics?fixture= team totals
//   /fixtures/players?fixture=    per-player statistics
import { stat, toNumber } from './stat-keys.js';

export const id = 'api-football';
export const label = 'API-Football';
export const needsKey = true;

const HOSTS = {
  'api-sports': {
    base: 'https://v3.football.api-sports.io',
    headers: (key) => ({ 'x-apisports-key': key }),
  },
  rapidapi: {
    base: 'https://api-football-v1.p.rapidapi.com/v3',
    headers: (key) => ({ 'x-rapidapi-key': key, 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' }),
  },
};

export class ProviderError extends Error {
  constructor(message, { status = 0, quota = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.quota = quota;
  }
}

/** Usable only once the user has pasted a key. */
export function isConfigured(cfg) {
  return !!(cfg && cfg.apiKey);
}

async function get(path, params, cfg) {
  if (!isConfigured(cfg)) {
    throw new ProviderError('No API-Football key set — add one in the extension options.');
  }
  const host = HOSTS[cfg.apiHost] || HOSTS['api-sports'];
  const url = new URL(host.base + path);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);

  let res;
  try {
    res = await fetch(url, { headers: host.headers(cfg.apiKey) });
  } catch (e) {
    throw new ProviderError(`API-Football unreachable: ${e.message}`);
  }
  if (res.status === 429) throw new ProviderError('API-Football daily quota exhausted (HTTP 429).', { status: 429, quota: true });
  if (res.status === 401 || res.status === 403) throw new ProviderError(`API-Football rejected the key (HTTP ${res.status}).`, { status: res.status });
  if (!res.ok) throw new ProviderError(`API-Football returned HTTP ${res.status}`, { status: res.status });

  const body = await res.json();
  // Plan and parameter problems arrive inside a 200 response.
  const errors = body?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length) {
    const msg = Object.values(errors).join('; ');
    throw new ProviderError(msg, { status: 200, quota: /limit|plan|subscription/i.test(msg) });
  }
  return body;
}

// ---------------------------------------------------------------- fixtures --

function normalizeFixture(f) {
  return {
    provider: id,
    id: f.fixture?.id,
    status: f.fixture?.status?.long || f.fixture?.status?.short || '',
    statusType: ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'].includes(f.fixture?.status?.short) ? 'inprogress' : 'other',
    elapsed: f.fixture?.status?.elapsed ?? null,
    extra: f.fixture?.status?.extra ?? null,
    league: { id: f.league?.id, name: f.league?.name || '', country: f.league?.country || '' },
    home: { id: f.teams?.home?.id, name: f.teams?.home?.name || '' },
    away: { id: f.teams?.away?.id, name: f.teams?.away?.name || '' },
    goals: { home: f.goals?.home ?? 0, away: f.goals?.away ?? 0 },
    hasPlayerStats: true,
  };
}

export async function fetchLiveFixtures(cfg) {
  const body = await get('/fixtures', { live: 'all' }, cfg);
  return (body?.response || []).map(normalizeFixture);
}

// -------------------------------------------------------------- team stats --

const TEAM_MAP = {
  'total shots': 'shotsTotal',
  'shots on goal': 'shotsOn',
  'shots off goal': 'shotsOff',
  'blocked shots': 'shotsBlocked',
  'shots insidebox': 'shotsInBox',
  'shots outsidebox': 'shotsOutBox',
  'corner kicks': 'corners',
  'ball possession': 'possession',
  'total passes': 'passes',
  offsides: 'offsides',
  fouls: 'fouls',
  'yellow cards': 'yellow',
  'red cards': 'red',
  'goalkeeper saves': 'saves',
  expected_goals: 'xg',
};

function normalizeTeamStats(response) {
  const out = {};
  const sides = ['home', 'away'];
  const raw = { home: {}, away: {} };
  response.forEach((entry, i) => {
    const side = sides[i];
    if (!side) return;
    for (const s of entry.statistics || []) {
      const key = TEAM_MAP[String(s.type || '').trim().toLowerCase()];
      if (key) raw[side][key] = s.value;
    }
  });
  for (const key of new Set([...Object.keys(raw.home), ...Object.keys(raw.away)])) {
    out[key] = stat(key, raw.home[key], raw.away[key]);
  }
  return out;
}

// ------------------------------------------------------------ player stats --

function normalizePlayer(entry) {
  const s = entry.statistics?.[0] || {};
  const stats = {};
  const put = (k, v) => { const n = toNumber(v); if (n != null) stats[k] = n; };

  put('shots', s.shots?.total);
  put('shotsOn', s.shots?.on);
  put('goals', s.goals?.total);
  put('assists', s.goals?.assists);
  put('saves', s.goals?.saves);
  put('fouls', s.fouls?.committed);
  put('fouled', s.fouls?.drawn);
  put('tackles', s.tackles?.total);
  put('interceptions', s.tackles?.interceptions);
  put('keyPasses', s.passes?.key);
  put('offsides', s.offsides);
  put('minutes', s.games?.minutes);
  put('rating', s.games?.rating);
  if (stats.shots != null && stats.shotsOn != null) stats.shotsOff = stats.shots - stats.shotsOn;

  const yellow = toNumber(s.cards?.yellow) || 0;
  const red = toNumber(s.cards?.red) || 0;

  return {
    id: entry.player?.id,
    name: entry.player?.name || '',
    shirt: s.games?.number ?? null,
    position: s.games?.position || '',
    substitute: s.games?.substitute ?? false,
    played: (toNumber(s.games?.minutes) ?? 0) > 0,
    stats,
    cards: red ? 'red' : (yellow ? 'yellow' : null),
    _cardCounts: { yellow, red },
  };
}

export async function fetchFixtureDetail(fixtureId, { includePlayers = true } = {}, cfg) {
  const [statsBody, playersBody] = await Promise.all([
    get('/fixtures/statistics', { fixture: fixtureId }, cfg).catch(() => null),
    includePlayers ? get('/fixtures/players', { fixture: fixtureId }, cfg).catch(() => null) : Promise.resolve(null),
  ]);

  const team = normalizeTeamStats(statsBody?.response || []);

  let players = null;
  const cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } };
  const sides = ['home', 'away'];
  if (playersBody?.response?.length) {
    players = { confirmed: true, home: [], away: [] };
    playersBody.response.forEach((entry, i) => {
      const side = sides[i];
      if (!side) return;
      for (const p of entry.players || []) {
        const np = normalizePlayer(p);
        cards[side].yellow += np._cardCounts.yellow;
        cards[side].red += np._cardCounts.red;
        delete np._cardCounts;
        players[side].push(np);
      }
    });
  }

  if (!team.yellow) team.yellow = stat('yellow', cards.home.yellow, cards.away.yellow);
  if (cards.home.red || cards.away.red) team.red = stat('red', cards.home.red, cards.away.red);

  return { team, players, cards };
}
