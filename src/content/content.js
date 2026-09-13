import { sendMessage, ext } from '../common/browser.js';
import { loadSettings } from '../common/settings.js';
import { extractBets, isFootball } from './extract.js';
import {
  renderStats, renderError, renderLoading, clearFrom, clearAll,
  markBadge, clearBadge, HOST_CLASS, MARKER_CLASS,
} from './render.js';

let settings = null;
let timer = null;
let running = false;
let lastAnchors = new Set();

function log(...args) {
  if (settings?.debug) console.log('[sagabet-livestats]', ...args);
}

function candidates(bets) {
  return bets.filter((b) => isFootball(b) && (settings.onlyLive ? b.live : true));
}

async function tick() {
  if (running || !settings?.enabled) return;
  running = true;
  let live = [];
  try {
    const bets = extractBets();
    live = candidates(bets);
    log(`${bets.length} selection(s), ${live.length} to look up`, live.map((b) => `${b.home} - ${b.away}`));

    // Drop strips from rows that are no longer candidates (bet settled, tab
    // switched, "only live" toggled on).
    const keep = new Set(live.map((b) => b.anchor));
    for (const anchor of lastAnchors) if (!keep.has(anchor)) clearFrom(anchor);
    lastAnchors = keep;
    for (const b of bets) if (!keep.has(b.anchor)) clearBadge(b.badge);

    if (!live.length) return;
    for (const b of live) {
      renderLoading(b.anchor);
      markBadge(b.badge, 'loading');
    }

    const payload = live.map(({ key, home, away, league }) => ({ key, home, away, league }));
    const res = await sendMessage({ type: 'GET_STATS', bets: payload });

    if (res?.error) {
      for (const b of live) {
        renderError(b.anchor, res.error);
        markBadge(b.badge, 'error', res.error);
      }
      return;
    }
    for (const b of live) {
      const data = res.results?.[b.key];
      const detail = data?.fixtureId != null ? res.details?.[data.fixtureId] : null;
      renderStats(b.anchor, data, detail, settings, b);
      markBadge(b.badge, data?.state === 'live' ? 'available' : 'unavailable');
    }
  } catch (e) {
    // Surface failures on the page. A silent catch here is indistinguishable
    // from the extension not running at all.
    log('tick failed', e);
    for (const b of live) {
      renderError(b.anchor, e.message);
      markBadge(b.badge, 'error', e.message);
    }
  } finally {
    running = false;
  }
}

function schedule() {
  clearInterval(timer);
  const secs = Math.max(15, Number(settings?.refreshSeconds) || 60);
  timer = setInterval(tick, secs * 1000);
}

// The bets modal is client-rendered and React replaces its subtree freely, so
// re-scan whenever the DOM settles. Mutations we caused ourselves are ignored,
// otherwise rendering would retrigger the observer forever.
let debounce = null;
const observer = new MutationObserver((records) => {
  const ours = records.every((r) => {
    const t = r.target;
    const ownClass = (n) => n.nodeType === 1
      && (n.classList?.contains(HOST_CLASS) || n.classList?.contains(MARKER_CLASS));
    if (t.nodeType === 1 && (ownClass(t) || t.closest?.(`.${HOST_CLASS}, .${MARKER_CLASS}`))) return true;
    const nodes = [...r.addedNodes, ...r.removedNodes];
    return nodes.length > 0 && nodes.every(ownClass);
  });
  if (ours) return;
  clearTimeout(debounce);
  debounce = setTimeout(tick, 600);
});

async function start() {
  settings = await loadSettings();
  if (!settings.enabled) return;
  schedule();
  observer.observe(document.body, { childList: true, subtree: true });
  tick();
}

ext.storage.onChanged.addListener(async () => {
  settings = await loadSettings();
  if (!settings.enabled) {
    clearInterval(timer);
    clearAll();
    lastAnchors = new Set();
    return;
  }
  schedule();
  tick();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
