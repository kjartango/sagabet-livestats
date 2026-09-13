// FotMob connector.
//
// Same character as the SofaScore one: FotMob's own web app endpoints, no key,
// no account. Two calls matter:
//
//   /api/data/matches?date=YYYYMMDD      the day's matches, with live status
//   /api/data/matchDetails?matchId=ID    team stats, player stats, shotmap
//
// FotMob's edge is `shotmap`: every individual shot with the player who took
// it, the minute, xG, and whether it was on target. Per-player shot counts are
// derived from that rather than from the localised player-stat titles, so they
// stay correct whatever language the API answers in.
import { stat, toNumber } from './stat-keys.js';

export const id = 'fotmob';
export const needsKey = false;

/** Keyless: always usable. */
export function isConfigured() {
  return true;
}

export const label = 'FotMob';

const BASE = 'https://www.fotmob.com/api';

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
    throw new ProviderError(`FotMob unreachable: ${e.message}`);
  }
  if (res.status === 403 || res.status === 429) {
    throw new ProviderError('FotMob is rate-limiting this browser — try a longer refresh interval.', { status: res.status });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ProviderError(`FotMob returned HTTP ${res.status}`, { status: res.status });
  return res.json();
}

// ---------------------------------------------------------------- fixtures --

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** "61’" / "90+3’" -> {elapsed, extra} */
function parseClock(short) {
  const m = String(short || '').match(/(\d{1,3})(?:\+(\d{1,2}))?/);
  if (!m) return {};
  return { elapsed: Number(m[1]), extra: m[2] ? Number(m[2]) : null };
}

function normalizeMatch(m, league) {
  const st = m.status || {};
  const { elapsed = null, extra = null } = parseClock(st.liveTime?.short);
  const score = String(st.scoreStr || '').split('-').map((s) => toNumber(s));
  return {
    provider: id,
    id: m.id,
    status: st.liveTime?.short || st.reason?.short || '',
    statusType: st.finished ? 'finished' : (st.started ? 'inprogress' : 'notstarted'),
    elapsed,
    extra,
    league: { id: league.id, name: league.name || '', country: league.ccode || '' },
    home: { id: m.home?.id, name: m.home?.name || '' },
    away: { id: m.away?.id, name: m.away?.name || '' },
    goals: { home: score[0] ?? 0, away: score[1] ?? 0 },
    hasPlayerStats: true,
  };
}

/**
 * Every match in play right now. FotMob indexes by date, so this pulls the
 * day's fixtures and filters — still one request covering every bet.
 */
export async function fetchLiveFixtures() {
  const body = await get(`/data/matches?date=${todayStamp()}`);
  const out = [];
  for (const league of body?.leagues || []) {
    for (const m of league.matches || []) {
      const st = m.status || {};
      if (st.started && !st.finished && !st.cancelled) out.push(normalizeMatch(m, league));
    }
  }
  return out;
}

// -------------------------------------------------------------- team stats --

const TEAM_MAP = {
  total_shots: 'shotsTotal',
  ShotsOnTarget: 'shotsOn',
  ShotsOffTarget: 'shotsOff',
  blocked_shots: 'shotsBlocked',
  shots_inside_box: 'shotsInBox',
  shots_outside_box: 'shotsOutBox',
  shots_woodwork: 'woodwork',
  expected_goals: 'xg',
  big_chance: 'bigChances',
  corners: 'corners',
  BallPossesion: 'possession',
  passes: 'passes',
  touches_opp_box: 'touchesInBox',
  Offsides: 'offsides',
  fouls: 'fouls',
  yellow_cards: 'yellow',
  red_cards: 'red',
  'matchstats.headers.tackles': 'tackles',
  interceptions: 'interceptions',
  clearances: 'clearances',
  keeper_saves: 'saves',
  duel_won: 'duelsWon',
};

function normalizeTeamStats(details) {
  const out = {};
  const all = details?.content?.stats?.Periods?.All;
  for (const group of all?.stats || []) {
    for (const item of group.stats || []) {
      const key = TEAM_MAP[item.key];
      if (!key || out[key]) continue;
      const [home, away] = item.stats || [];
      if (home == null && away == null) continue;
      out[key] = stat(key, home, away, { homeText: home == null ? null : String(home), awayText: away == null ? null : String(away) });
    }
  }
  return out;
}

// ------------------------------------------------------------ player stats --

// FotMob keys player stats by their display title, which is localised. Titles
// are matched loosely and only for values the shotmap can't supply.
const TITLE_MAP = [
  [/^fotmob rating$/i, 'rating'],
  [/^(minutes played|minutes)$/i, 'minutes'],
  [/^goals?$/i, 'goals'],
  [/^assists?$/i, 'assists'],
  [/^(fouls committed|fouls)$/i, 'fouls'],
  [/^was fouled$/i, 'fouled'],
  [/^(tackles won|tackles)$/i, 'tackles'],
  [/^interceptions?$/i, 'interceptions'],
  [/^offsides?$/i, 'offsides'],
  [/^saves$/i, 'saves'],
  [/^(chances created|key passes)$/i, 'keyPasses'],
  [/^touches$/i, 'touches'],
];

function canonicalFromTitle(title) {
  for (const [re, key] of TITLE_MAP) if (re.test(String(title).trim())) return key;
  return null;
}

function playerStatValue(entry) {
  // Shapes seen: {stat:{value}}, {value}, or a bare number.
  if (entry == null) return null;
  if (typeof entry === 'number' || typeof entry === 'string') return toNumber(entry);
  return toNumber(entry.stat?.value ?? entry.value ?? entry.stat);
}

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

function normalizePlayers(details) {
  const raw = details?.content?.playerStats;
  if (!raw || !Object.keys(raw).length) return null;

  const homeId = details?.general?.homeTeam?.id;
  const sides = { home: [], away: [] };

  for (const entry of Object.values(raw)) {
    const stats = {};
    for (const group of entry.stats || []) {
      for (const [title, value] of Object.entries(group.stats || {})) {
        const key = canonicalFromTitle(title);
        if (!key || stats[key] != null) continue;
        const v = playerStatValue(value);
        if (v != null) stats[key] = v;
      }
    }

    // Shots come from the shotmap: structured, and language-independent.
    const shots = entry.shotmap || [];
    if (shots.length) {
      stats.shots = shots.length;
      stats.shotsOn = shots.filter((s) => s.isOnTarget).length;
      stats.shotsBlocked = shots.filter((s) => s.isBlocked).length;
      stats.shotsOff = stats.shots - stats.shotsOn - stats.shotsBlocked;
      const xg = shots.reduce((a, s) => a + (Number(s.expectedGoals) || 0), 0);
      if (xg) stats.xg = Math.round(xg * 100) / 100;
    }

    // FotMob only includes a player in playerStats once they have taken the
    // pitch, so presence in the payload is itself the signal.
    const played = Object.keys(stats).length > 0;
    const side = String(entry.teamId) === String(homeId) ? 'home' : 'away';
    sides[side].push({
      id: entry.id,
      name: entry.name || '',
      shirt: entry.shirtNumber ?? null,
      position: entry.usualPosition || (entry.isGoalkeeper ? 'G' : ''),
      substitute: false,
      played,
      stats: played ? fillZeroes(stats) : stats,
      cards: null,
    });
  }

  if (!sides.home.length && !sides.away.length) return null;
  return { confirmed: true, ...sides };
}

/** Cards come from the match-facts event list. */
function applyCards(details, players) {
  const cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } };
  const events = details?.content?.matchFacts?.events?.events || [];
  const byId = new Map();
  for (const side of ['home', 'away']) {
    for (const p of players?.[side] || []) if (p.id != null) byId.set(String(p.id), p);
  }

  for (const ev of events) {
    if (ev.type !== 'Card') continue;
    const isRed = /red/i.test(ev.card || '');
    const side = ev.isHome ? 'home' : 'away';
    cards[side][isRed ? 'red' : 'yellow'] += 1;
    const p = byId.get(String(ev.player?.id));
    if (p) p.cards = isRed ? 'red' : (p.cards ? 'red' : 'yellow');
  }
  return cards;
}

/** Everything about one live match: a single request. */
export async function fetchFixtureDetail(fixtureId) {
  const details = await get(`/data/matchDetails?matchId=${fixtureId}`);
  if (!details) return { team: {}, players: null, cards: null };

  const team = normalizeTeamStats(details);
  const players = normalizePlayers(details);
  const cards = applyCards(details, players);

  if (!team.yellow || cards.home.yellow || cards.away.yellow) {
    team.yellow = stat('yellow', cards.home.yellow, cards.away.yellow);
  }
  if (cards.home.red || cards.away.red) team.red = stat('red', cards.home.red, cards.away.red);

  return { team, players, cards };
}
