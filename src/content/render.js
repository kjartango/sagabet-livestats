// Renders the stats strip and the per-player table.
//
// Everything lives in a shadow root so epicbet's stylesheet can't reach in and
// ours can't leak out. CSS custom properties do cross the shadow boundary, so
// the strip picks up the site's own palette and follows any reskin.
import { PLAYER_SHORT, PLAYER_LABELS, TEAM_LABELS } from '../background/stat-keys.js';

export const HOST_CLASS = 'sagabet-livestats-host';
export const MARKER_CLASS = 'sagabet-livestats-mark';

// Marks epicbet's own "Í beinni" / "In play" badge with whether the stats
// provider actually has this match, so the answer is visible at a glance
// without reading the strip.
const MARKS = {
  loading: { symbol: '⋯', color: 'inherit', title: 'Looking up live stats…' },
  available: { symbol: '✓', color: 'var(--palette-primary-main, #B6EA00)', title: 'Live stats available for this match' },
  unavailable: { symbol: '✕', color: 'var(--palette-negative-light, #ffb4a9)', title: 'This match was not found in the stats provider\u2019s live list' },
  error: { symbol: '!', color: 'var(--palette-negative-light, #ffb4a9)', title: 'Could not reach the stats provider' },
};

/**
 * Add or update the marker on epicbet's live badge. The badge belongs to the
 * site, so the marker is a single appended span with inline styles — React may
 * wipe it on re-render, and the next poll simply puts it back.
 */
export function markBadge(badge, state, title = '') {
  if (!badge) return;
  const spec = MARKS[state];
  if (!spec) return;
  let mark = [...badge.children].find((c) => c.className === MARKER_CLASS);
  if (!mark) {
    mark = document.createElement('span');
    mark.className = MARKER_CLASS;
    badge.appendChild(mark);
  }
  if (mark.textContent !== spec.symbol) mark.textContent = spec.symbol;
  mark.title = title || spec.title;
  mark.style.cssText = `margin-left:5px;font-weight:700;color:${spec.color};`;
}

export function clearBadge(badge) {
  if (!badge) return;
  for (const c of [...badge.children]) if (c.className === MARKER_CLASS) c.remove();
}

// Which bets have their player table open. Survives repaints; not persisted.
const expanded = new Set();

/** Open or close a bet's player table programmatically. */
export function setExpanded(key, open) {
  if (open) expanded.add(key);
  else expanded.delete(key);
}

const CSS = `
:host { all: initial; display: block; }
.wrap {
  font: 500 11px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  margin: 2px 0 6px; padding: 5px 7px;
  border-radius: 8px;
  color: #e8eef5;
  background: var(--palette-surface-secondary-main, rgba(255,255,255,.05));
  border: 1px solid var(--palette-outline-primary-main, rgba(255,255,255,.10));
}
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 6px; border-radius: 6px;
  background: var(--palette-surface-primary-elevated, rgba(255,255,255,.07));
  white-space: nowrap;
}
.chip .k { opacity: .58; font-weight: 500; }
.chip .v { font-weight: 700; font-variant-numeric: tabular-nums; }
.live {
  background: var(--palette-negative-main, #d92d20);
  color: var(--palette-negative-contrast, #fff);
  font-weight: 700; letter-spacing: .02em;
}
.live .dot {
  width: 5px; height: 5px; border-radius: 50%; background: currentColor;
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .2 } }
@media (prefers-reduced-motion: reduce) { .live .dot { animation: none } }
.score {
  background: var(--palette-primary-main, #c8f000);
  color: var(--palette-primary-contrast, #0b1220);
  font-weight: 800;
}
.total {
  background: var(--palette-info-main, #2e90fa);
  color: var(--palette-info-contrast, #fff); font-weight: 700;
}
.total .k { opacity: .8; }
.headline .v { font-size: 12px; }
.muted { opacity: .55; font-weight: 500; }
.err { color: var(--palette-negative-light, #ffb4a9); }
.teams { opacity: .45; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
button.chip {
  border: 0; font: inherit; cursor: pointer; color: inherit;
}
button.chip:hover { background: var(--palette-surface-primary-main, rgba(255,255,255,.14)); }
.caret { font-size: 9px; opacity: .7; }

.players { margin-top: 6px; max-height: 280px; overflow: auto; overscroll-behavior: contain; }
.side { margin-bottom: 8px; }
.side h4 {
  margin: 0 0 3px; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; opacity: .5;
  position: sticky; top: 0;
  background: var(--palette-surface-secondary-main, #16202e);
  padding: 2px 0;
}
table { border-collapse: collapse; width: 100%; font-size: 11px; }
th, td { padding: 2px 4px; text-align: right; white-space: nowrap; }
th { font-weight: 600; opacity: .5; font-size: 10px; }
th:first-child, td:first-child { text-align: left; width: 100%; }
tbody tr:nth-child(odd) { background: rgba(255,255,255,.035); }
td { font-variant-numeric: tabular-nums; }
td.zero { opacity: .3; }
.shirt { opacity: .4; display: inline-block; min-width: 16px; }
.card { margin-left: 3px; font-size: 9px; }
`;


// ---------------------------------------------------------------------------
// Everything below builds real DOM nodes rather than HTML strings. Team and
// player names arrive from a third-party API and market text is scraped off
// epicbet, so nothing here should ever be parsed as markup — textContent means
// it cannot be, regardless of what those sources return.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

/** A labelled pill. `label` is optional; `title` becomes the tooltip. */
function chip(label, value, cls = '', title = '') {
  const node = el('span', `chip ${cls}`.trim());
  if (title) node.title = title;
  if (label) node.append(el('span', 'k', label));
  node.append(el('span', 'v', value));
  return node;
}

function pair(stats, key) {
  const h = stats?.home?.[key];
  const a = stats?.away?.[key];
  if (h == null && a == null) return null;
  return `${h ?? '–'}–${a ?? '–'}`;
}

function shotsTotal(side) {
  if (!side) return null;
  if (side.shots_total != null) return side.shots_total;
  const { shots_on: on, shots_off: off, shots_blocked: blocked } = side;
  if (on == null && off == null) return null;
  return (on || 0) + (off || 0) + (blocked || 0);
}

// ------------------------------------------------------------ totals chip --

// Markets where a running count is what the bet turns on.
const TOTALS_MARKETS = [
  { re: /shot/i, label: 'Shots', keys: ['shotsTotal'] },
  { re: /corner/i, label: 'Corners', keys: ['corners'] },
  { re: /card|booking/i, label: 'Cards', keys: ['yellow', 'red'] },
  { re: /foul/i, label: 'Fouls', keys: ['fouls'] },
  { re: /offside/i, label: 'Offsides', keys: ['offsides'] },
];

/**
 * The over/under line from the pick, e.g. "Yfir 32.5" -> 32.5. Only the number
 * is read, so it works whatever language the site is set to.
 */
function betLine(pick) {
  const m = String(pick || '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

function totalsChip(team, bet) {
  if (!bet?.market || !team) return null;
  const spec = TOTALS_MARKETS.find((t) => t.re.test(bet.market));
  if (!spec) return null;

  let total = null;
  for (const key of spec.keys) {
    const s = team[key];
    if (!s) continue;
    total = (total || 0) + (s.home || 0) + (s.away || 0);
  }
  if (total == null) return null;

  const line = betLine(bet.pick);
  return chip(
    spec.label,
    line != null ? `${total} / ${line}` : String(total),
    'total headline',
    line != null ? `${bet.pick} — ${bet.market}` : bet.market,
  );
}

// ------------------------------------------------------------- team chips --

function teamChips(data, team, keys) {
  const out = [];

  const minute = data.elapsed != null
    ? `${data.elapsed}${data.extra ? `+${data.extra}` : ''}'`
    : (data.status || 'LIVE');
  const live = el('span', 'chip live');
  live.append(el('span', 'dot'), document.createTextNode(minute));
  out.push(live);

  out.push(chip('', `${data.goals.home} – ${data.goals.away}`, 'score headline'));

  for (const key of keys) {
    const s = team?.[key];
    if (!s) continue;
    const h = s.homeText ?? s.home;
    const a = s.awayText ?? s.away;
    if (h == null && a == null) continue;
    if (key === 'yellow' && !s.home && !s.away) continue; // no cards yet
    out.push(chip(s.label || key, `${h ?? '–'}–${a ?? '–'}`));
  }
  return out;
}

// ----------------------------------------------------------- player table --

function playerRow(p, keys) {
  const tr = el('tr');
  const name = el('td');
  name.append(el('span', 'shirt', p.shirt ?? ''), document.createTextNode(` ${p.name}`));
  if (p.cards === 'red') name.append(el('span', 'card', '🟥'));
  else if (p.cards === 'yellow') name.append(el('span', 'card', '🟨'));
  tr.append(name);

  for (const k of keys) {
    const v = p.stats[k];
    tr.append(el('td', v == null || v === 0 ? 'zero' : '', v == null ? '–' : v));
  }
  return tr;
}

function sideTable(name, players, keys) {
  const side = el('div', 'side');
  side.append(el('h4', '', name));

  const table = el('table');
  const headRow = el('tr');
  headRow.append(el('th', '', 'Player'));
  for (const k of keys) {
    const th = el('th', '', PLAYER_SHORT[k] || k);
    th.title = PLAYER_LABELS[k] || k;
    headRow.append(th);
  }
  const thead = el('thead');
  thead.append(headRow);

  const tbody = el('tbody');
  const sorted = [...players]
    .filter((p) => p.played || Object.keys(p.stats).length)
    .sort((a, b) => (b.stats[keys[0]] ?? -1) - (a.stats[keys[0]] ?? -1));
  for (const p of sorted) tbody.append(playerRow(p, keys));

  table.append(thead, tbody);
  side.append(table);
  return side;
}

function playerTable(data, detail, keys) {
  const wrap = el('div', 'players');
  if (!detail?.players) {
    wrap.append(chip('', 'No player data published for this match yet', 'muted'));
    return wrap;
  }
  wrap.append(
    sideTable(data.home.name, detail.players.home, keys),
    sideTable(data.away.name, detail.players.away, keys),
  );
  return wrap;
}

// ------------------------------------------------------------------- host --

function ensureHost(anchor) {
  let host = [...anchor.children].find((c) => c.classList?.contains(HOST_CLASS));
  if (host) return host;

  host = document.createElement('div');
  host.className = HOST_CLASS;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const wrap = el('div', 'wrap');
  shadow.append(style, wrap);

  // Expanding the player table must survive the repaint on each poll, so the
  // open set is keyed by bet and the strip is re-rendered from its last
  // arguments.
  shadow.addEventListener('click', (e) => {
    const toggle = e.target.closest?.('[data-toggle]');
    if (!toggle) return;
    e.preventDefault();
    e.stopPropagation();
    const args = host._els;
    if (!args) return;
    if (expanded.has(args.key)) expanded.delete(args.key);
    else expanded.add(args.key);
    renderStats(anchor, args.data, args.detail, args.settings, args.bet);
  });

  anchor.appendChild(host);
  return host;
}

/**
 * Swap in a new strip. Repainting only when the visible text changed keeps the
 * player table's scroll position while a match ticks over.
 */
function paint(anchor, nodes) {
  const wrap = ensureHost(anchor).shadowRoot.querySelector('.wrap');
  const frag = document.createDocumentFragment();
  frag.append(...nodes);

  const sig = frag.textContent;
  if (wrap.dataset.sig === sig && wrap.childNodes.length) return;
  wrap.dataset.sig = sig;
  wrap.replaceChildren(frag);
}

function chipRow(...chips) {
  const row = el('div', 'chips');
  row.append(...chips.filter(Boolean));
  return row;
}

/** Render one bet's stats, or an explanation of why there are none. */
export function renderStats(anchor, data, detail, settings, bet) {
  if (!data) {
    clearFrom(anchor);
    return;
  }

  // A lookup that found nothing is reported, not hidden. Silently removing the
  // strip is indistinguishable from the extension being broken.
  if (data.state === 'no-live-match') {
    const bits = [chip('', 'No live stats for this match', 'muted')];
    if (data.closest) {
      bits.push(chip(
        'closest',
        `${data.closest.home} v ${data.closest.away} · ${Math.round(data.closest.score * 100)}%`,
        'muted',
        `Nearest fixture in ${data.providerLabel}'s live list, too different to be trusted as a match`
        + (data.closest.league ? ` — ${data.closest.league}` : ''),
      ));
    }
    bits.push(chip('', `${data.providerLabel || 'provider'} · ${data.searched ?? 0} live searched`, 'teams'));
    paint(anchor, [chipRow(...bits)]);
    return;
  }

  if (data.state !== 'live') {
    clearFrom(anchor);
    return;
  }

  const host = ensureHost(anchor);
  const key = bet?.key || data.fixtureId;
  host._els = { data, detail, settings, bet, key };

  const team = detail?.team || {};
  const isOpen = expanded.has(key);

  const chips = [totalsChip(team, bet), ...teamChips(data, team, settings.teamStats)];

  if (settings.showPlayers) {
    // Count players who have taken the pitch, not the whole squad list.
    const onPitch = detail?.players
      ? [...detail.players.home, ...detail.players.away].filter((p) => p.played).length
      : 0;
    const button = el('button', 'chip');
    button.type = 'button';
    button.dataset.toggle = 'players';
    button.append(
      el('span', 'k', 'Players'),
      el('span', 'v', onPitch || '–'),
      el('span', 'caret', isOpen ? '▲' : '▼'),
    );
    chips.push(button);
  }

  chips.push(chip(
    '',
    `${data.home.name} v ${data.away.name}`,
    'teams',
    `${data.providerLabel} · ${data.league?.name || ''} · matched at ${Math.round(data.confidence * 100)}%`,
  ));

  if (detail?.error) chips.push(chip('', detail.error, 'err'));

  const out = [chipRow(...chips)];
  if (isOpen && settings.showPlayers) out.push(playerTable(data, detail, settings.playerStats));
  paint(anchor, out);
}

export function renderError(anchor, message) {
  paint(anchor, [chipRow(chip('', message, 'err'))]);
}

export function renderLoading(anchor) {
  const wrap = ensureHost(anchor).shadowRoot.querySelector('.wrap');
  if (!wrap.childNodes.length) paint(anchor, [chipRow(chip('', 'Loading live stats…', 'muted'))]);
}

export function clearFrom(anchor) {
  for (const c of [...(anchor?.children || [])]) {
    if (c.classList?.contains(HOST_CLASS)) c.remove();
  }
}

export function clearAll() {
  document.querySelectorAll(`.${HOST_CLASS}, .${MARKER_CLASS}`).forEach((el2) => el2.remove());
}
