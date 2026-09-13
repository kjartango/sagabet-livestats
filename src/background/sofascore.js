// SofaScore connector.
//
// These are the JSON endpoints SofaScore's own web app calls. No key, no
// account, no quota — but undocumented, so every field is treated as optional
// and a shape change degrades rather than breaks.
//
//   /sport/football/events/live   every match in play (one call covers all bets)
//   /event/{id}/statistics        team totals
//   /event/{id}/lineups           per-player statistics
//   /event/{id}/incidents         cards, with the player who got them
import { stat, toNumber } from './stat-keys.js';

export const id = 'sofascore';
export const needsKey = false;

/** Keyless: always usable. */
export function isConfigured() {
  return true;
}

export const label = 'SofaScore';

const BASE = 'https://api.sofascore.com/api/v1';

export class ProviderError extends Error {
  constructor(message, { status = 0 } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

async function get(path) {
  let res;
  try {
    res = await fetch(BASE + path, { headers: { Accept: 'application/json' }, credentials: 'omit' });
  } catch (e) {
    throw new ProviderError(`SofaScore unreachable: ${e.message}`);
  }
  if (res.status === 403 || res.status === 429) {
    throw new ProviderError('SofaScore is rate-limiting this browser — try a longer refresh interval.', { status: res.status });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ProviderError(`SofaScore returned HTTP ${res.status}`, { status: res.status });
  return res.json();
}

// ---------------------------------------------------------------- fixtures --

/** Minute of play, derived from the period clock the feed exposes. */
function clock(event) {
  const t = event.time || {};
  if (event.status?.type !== 'inprogress') return {};
  if (t.initial == null || !t.currentPeriodStartTimestamp) return {};

  const secs = t.initial + (Date.now() / 1000 - t.currentPeriodStartTimestamp);
  if (t.max != null && secs > t.max) {
    // Past the period's regulation end the remainder is stoppage time.
    return { elapsed: Math.floor(t.max / 60), extra: Math.floor((secs - t.max) / 60) + 1 };
  }
  return { elapsed: Math.max(1, Math.floor(secs / 60) + 1), extra: null };
}

function normalizeEvent(e) {
  const { elapsed = null, extra = null } = clock(e);
  return {
    provider: id,
    id: e.id,
    status: e.status?.description || '',
    statusType: e.status?.type || '',
    elapsed,
    extra,
    league: {
      id: e.tournament?.uniqueTournament?.id ?? e.tournament?.id,
      name: e.tournament?.name || '',
      country: e.tournament?.category?.country?.name || e.tournament?.category?.name || '',
    },
    home: { id: e.homeTeam?.id, name: e.homeTeam?.name || '' },
    away: { id: e.awayTeam?.id, name: e.awayTeam?.name || '' },
    goals: { home: e.homeScore?.current ?? 0, away: e.awayScore?.current ?? 0 },
    hasPlayerStats: !!e.hasEventPlayerStatistics,
  };
}

/** Every match currently in play. One request, covers every bet. */
export async function fetchLiveFixtures() {
  const body = await get('/sport/football/events/live');
  return (body?.events || []).map(normalizeEvent);
}

// -------------------------------------------------------------- team stats --

const TEAM_MAP = {
  totalShotsOnGoal: 'shotsTotal',
  shotsOnGoal: 'shotsOn',
  shotsOffGoal: 'shotsOff',
  blockedScoringAttempt: 'shotsBlocked',
  totalShotsInsideBox: 'shotsInBox',
  totalShotsOutsideBox: 'shotsOutBox',
  hitWoodwork: 'woodwork',
  expectedGoals: 'xg',
  bigChanceCreated: 'bigChances',
  cornerKicks: 'corners',
  ballPossession: 'possession',
  passes: 'passes',
  touchesInOppBox: 'touchesInBox',
  offsides: 'offsides',
  fouls: 'fouls',
  yellowCards: 'yellow',
  redCards: 'red',
  totalTackle: 'tackles',
  interceptionWon: 'interceptions',
  totalClearance: 'clearances',
  goalkeeperSaves: 'saves',
  duelWonPercent: 'duelsWon',
};

function normalizeTeamStats(body) {
  const out = {};
  const all = (body?.statistics || []).find((p) => p.period === 'ALL') || body?.statistics?.[0];
  for (const group of all?.groups || []) {
    for (const item of group.statisticsItems || []) {
      const key = TEAM_MAP[item.key];
      if (!key || out[key]) continue;
      out[key] = stat(key, item.homeValue ?? item.home, item.awayValue ?? item.away, {
        homeText: item.home ?? null,
        awayText: item.away ?? null,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------ player stats --

const PLAYER_MAP = {
  totalShots: 'shots',
  onTargetScoringAttempt: 'shotsOn',
  shotOffTarget: 'shotsOff',
  blockedScoringAttempt: 'shotsBlocked',
  goals: 'goals',
  goalAssist: 'assists',
  expectedGoals: 'xg',
  fouls: 'fouls',
  wasFouled: 'fouled',
  totalTackle: 'tackles',
  interceptionWon: 'interceptions',
  totalOffside: 'offsides',
  saves: 'saves',
  keyPass: 'keyPasses',
  touches: 'touches',
  minutesPlayed: 'minutes',
  rating: 'rating',
};

// Counting stats both feeds omit when zero. For a player who has taken the
// pitch an absent count means none, not unknown, and a table of "–" where "0"
// belongs is actively misleading.
const COUNT_KEYS = [
  'shots', 'shotsOn', 'shotsOff', 'shotsBlocked', 'goals', 'assists',
  'fouls', 'fouled', 'tackles', 'interceptions', 'offsides', 'saves', 'keyPasses',
];

function fillZeroes(stats) {
  for (const k of COUNT_KEYS) if (stats[k] == null) stats[k] = 0;
  return stats;
}

function normalizePlayer(entry) {
  const raw = entry.statistics || {};
  const stats = {};
  for (const [from, to] of Object.entries(PLAYER_MAP)) {
    const v = toNumber(raw[from]);
    if (v != null) stats[to] = v;
  }
  const played = (toNumber(raw.minutesPlayed) ?? 0) > 0;
  return {
    id: entry.player?.id,
    name: entry.player?.shortName || entry.player?.name || '',
    shirt: entry.shirtNumber ?? null,
    position: entry.position || '',
    substitute: !!entry.substitute,
    played,
    stats: played ? fillZeroes(stats) : stats,
    cards: null,
  };
}

/** Cards live in the incident feed, not the statistics one. */
function applyIncidents(body, players) {
  const cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } };
  if (!body?.incidents) return cards;

  const byId = new Map();
  for (const side of ['home', 'away']) {
    for (const p of players?.[side] || []) if (p.id) byId.set(p.id, p);
  }

  for (const inc of body.incidents) {
    if (inc.incidentType !== 'card') continue;
    const side = inc.isHome ? 'home' : 'away';
    const isRed = /red/i.test(inc.incidentClass || '');
    cards[side][isRed ? 'red' : 'yellow'] += 1;
    const p = byId.get(inc.player?.id);
    if (p) p.cards = isRed ? 'red' : (p.cards ? 'red' : 'yellow');
  }
  return cards;
}

/**
 * Everything about one live match. Three requests in parallel; any of them may
 * legitimately 404 (lineups unpublished, no incidents yet).
 */
export async function fetchFixtureDetail(fixtureId, { includePlayers = true } = {}) {
  const [statsBody, lineupBody, incidentBody] = await Promise.all([
    get(`/event/${fixtureId}/statistics`).catch(() => null),
    includePlayers ? get(`/event/${fixtureId}/lineups`).catch(() => null) : Promise.resolve(null),
    get(`/event/${fixtureId}/incidents`).catch(() => null),
  ]);

  const team = normalizeTeamStats(statsBody);
  const players = lineupBody ? {
    confirmed: !!lineupBody.confirmed,
    home: (lineupBody.home?.players || []).map(normalizePlayer),
    away: (lineupBody.away?.players || []).map(normalizePlayer),
  } : null;
  const cards = applyIncidents(incidentBody, players);

  // The statistics feed omits cards until one is shown; the incident feed is
  // authoritative, so fold its count in regardless.
  if (!team.yellow || cards.home.yellow || cards.away.yellow) {
    team.yellow = stat('yellow', cards.home.yellow, cards.away.yellow);
  }
  if (cards.home.red || cards.away.red) {
    team.red = stat('red', cards.home.red, cards.away.red);
  }

  return { team, players, cards };
}
