import { ext } from '../common/browser.js';
import { loadSettings } from '../common/settings.js';
import { providerChain } from './providers.js';
import { matchFixture } from './matcher.js';

// ---- tiny TTL cache + in-flight dedupe -------------------------------------
const cache = new Map();     // key -> {value, expires}
const inflight = new Map();  // key -> Promise

async function cached(key, ttlMs, producer) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = await producer();
      cache.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

const status = { requests: 0, provider: null, lastError: null, since: Date.now() };

/**
 * Pull the live fixture list, falling back through the other providers if the
 * preferred one refuses. Whichever answered is used for the detail calls too —
 * fixture ids are provider-specific and can't be mixed.
 */
async function liveFixtures(cfg, ttl) {
  const chain = providerChain(cfg.provider, cfg);
  if (!chain.length) throw new Error('No usable data source. Pick one in the extension options.');
  const errors = [];

  for (const provider of chain) {
    try {
      const fixtures = await cached(`live:${provider.id}`, ttl, async () => {
        status.requests += 1;
        return provider.fetchLiveFixtures(cfg);
      });
      status.provider = provider.id;
      status.lastError = errors.length ? errors.join(' | ') : null;
      return { provider, fixtures };
    } catch (e) {
      errors.push(`${provider.label}: ${e.message}`);
      cache.delete(`live:${provider.id}`);
    }
  }
  status.lastError = errors.join(' | ');
  throw new Error(errors.join(' | ') || 'No stats provider reachable');
}

async function getStatsFor(bets) {
  const cfg = await loadSettings();
  const ttl = Math.max(15, Number(cfg.refreshSeconds) || 60) * 1000;
  const { provider, fixtures } = await liveFixtures(cfg, ttl);

  const results = {};
  const wanted = new Set();

  for (const bet of bets) {
    const m = matchFixture(bet, fixtures);
    if (!m) {
      results[bet.key] = { state: 'no-live-match' };
      continue;
    }
    const fx = m.fixture;
    results[bet.key] = {
      state: 'live',
      provider: provider.id,
      providerLabel: provider.label,
      confidence: Number(m.score.toFixed(2)),
      fixtureId: fx.id,
      league: fx.league,
      status: fx.status,
      statusType: fx.statusType,
      elapsed: fx.elapsed,
      extra: fx.extra,
      home: fx.home,
      away: fx.away,
      goals: fx.goals,
    };
    wanted.add(fx.id);
  }

  // Detail is fetched once per fixture and returned in its own map, so several
  // bets on the same match cost one lookup and one copy over the wire.
  const details = {};
  await Promise.all([...wanted].map(async (fixtureId) => {
    try {
      details[fixtureId] = await cached(`detail:${provider.id}:${fixtureId}`, ttl, async () => {
        status.requests += 1;
        return provider.fetchFixtureDetail(fixtureId, { includePlayers: cfg.showPlayers }, cfg);
      });
    } catch (e) {
      details[fixtureId] = { error: e.message, team: {}, players: null };
    }
  }));

  return { results, details, meta: { provider: provider.id, providerLabel: provider.label, requests: status.requests } };
}

// ---- messaging -------------------------------------------------------------
function handle(msg) {
  switch (msg?.type) {
    case 'GET_STATS':
      return getStatsFor(msg.bets || []);
    case 'GET_STATUS':
      return Promise.resolve({ ...status });
    case 'CLEAR_CACHE':
      cache.clear();
      return Promise.resolve({ ok: true });
    default:
      return Promise.resolve({ error: 'unknown message type' });
  }
}

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((e) => {
      status.lastError = e.message;
      sendResponse({ error: e.message, meta: { requests: status.requests } });
    });
  return true; // keep the channel open for the async response
});
