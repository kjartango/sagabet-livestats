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

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function chip(label, value, cls = '', title = '') {
  const t = title ? ` title="${esc(title)}"` : '';
  return `<span class="chip ${cls}"${t}>${label ? `<span class="k">${esc(label)}</span>` : ''}<span class="v">${esc(value)}</span></span>`;
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

/** The over/under line from the pick, e.g. "Yfir 32.5" -> 32.5. Number only, so
 *  it works whatever language the site is set to. */
function betLine(pick) {
  const m = String(pick || '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

function totalsChip(team, bet) {
  if (!bet?.market || !team) return '';
  const spec = TOTALS_MARKETS.find((t) => t.re.test(bet.market));
  if (!spec) return '';

  let total = null;
  for (const key of spec.keys) {
    const s = team[key];
    if (!s) continue;
    total = (total || 0) + (s.home || 0) + (s.away || 0);
  }
  if (total == null) return '';

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
  const min = data.elapsed != null
    ? `${data.elapsed}${data.extra ? `+${data.extra}` : ''}'`
    : (data.status || 'LIVE');
  out.push(`<span class="chip live"><span class="dot"></span>${esc(min)}</span>`);
  out.push(chip('', `${data.goals.home} – ${data.goals.away}`, 'score headline'));

  for (const key of keys) {
    const s = team?.[key];
    if (!s) continue;
    const h = s.homeText ?? s.home;
    const a = s.awayText ?? s.away;
    if (h == null && a == null) continue;
    if (key === 'yellow' && !s.home && !s.away) continue; // no cards yet: skip
    out.push(chip(TEAM_LABELS[key] || key, `${h ?? '–'}–${a ?? '–'}`));
  }
  return out;
}

// ----------------------------------------------------------- player table --

function playerRows(players, keys) {
  const sorted = [...players]
    .filter((p) => p.played || Object.keys(p.stats).length)
    .sort((a, b) => (b.stats[keys[0]] ?? -1) - (a.stats[keys[0]] ?? -1));

  return sorted.map((p) => {
    const card = p.cards === 'red' ? '<span class="card">🟥</span>'
      : p.cards === 'yellow' ? '<span class="card">🟨</span>' : '';
    const cells = keys.map((k) => {
      const v = p.stats[k];
      const cls = v == null || v === 0 ? ' class="zero"' : '';
      return `<td${cls}>${v == null ? '–' : esc(v)}</td>`;
    }).join('');
    return `<tr><td><span class="shirt">${p.shirt ?? ''}</span> ${esc(p.name)}${card}</td>${cells}</tr>`;
  }).join('');
}

function playerTable(data, detail, keys) {
  if (!detail?.players) {
    return `<div class="players"><span class="chip muted">No player data published for this match yet</span></div>`;
  }
  const head = `<tr><th>Player</th>${keys.map((k) => `<th title="${esc(PLAYER_LABELS[k] || k)}">${esc(PLAYER_SHORT[k] || k)}</th>`).join('')}</tr>`;
  const side = (name, players) => `
    <div class="side">
      <h4>${esc(name)}</h4>
      <table><thead>${head}</thead><tbody>${playerRows(players, keys)}</tbody></table>
    </div>`;
  return `<div class="players">${side(data.home.name, detail.players.home)}${side(data.away.name, detail.players.away)}</div>`;
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
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  shadow.append(style, wrap);

  // Expanding the player table must survive the 30s repaint, so the open set is
  // keyed by bet and the strip is simply re-rendered from its last arguments.
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

function paint(anchor, html) {
  const wrap = ensureHost(anchor).shadowRoot.querySelector('.wrap');
  if (wrap.innerHTML !== html) wrap.innerHTML = html;
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
      const pct = Math.round(data.closest.score * 100);
      bits.push(chip(
        'closest',
        `${data.closest.home} v ${data.closest.away} · ${pct}%`,
        'muted',
        `Nearest fixture in ${data.providerLabel}'s live list, too different to be trusted as a match`
        + (data.closest.league ? ` — ${data.closest.league}` : ''),
      ));
    }
    bits.push(chip('', `${data.providerLabel || 'provider'} · ${data.searched ?? 0} live searched`, 'teams'));
    paint(anchor, `<div class="chips">${bits.join('')}</div>`);
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

  const chips = [
    totalsChip(team, bet),
    ...teamChips(data, team, settings.teamStats),
  ].filter(Boolean);

  if (settings.showPlayers) {
    // Count players who have actually taken the pitch, not the whole squad list.
    const onPitch = detail?.players
      ? [...detail.players.home, ...detail.players.away].filter((p) => p.played).length
      : 0;
    chips.push(
      `<button class="chip" data-toggle="players" type="button">`
      + `<span class="k">Players</span><span class="v">${onPitch || '–'}</span>`
      + `<span class="caret">${isOpen ? '▲' : '▼'}</span></button>`,
    );
  }

  chips.push(chip(
    '',
    `${data.home.name} v ${data.away.name}`,
    'teams',
    `${data.providerLabel} · ${data.league?.name || ''} · matched at ${Math.round(data.confidence * 100)}%`,
  ));

  if (detail?.error) chips.push(chip('', detail.error, 'err'));

  const body = `<div class="chips">${chips.join('')}</div>`
    + (isOpen && settings.showPlayers ? playerTable(data, detail, settings.playerStats) : '');
  paint(anchor, body);
}

export function renderError(anchor, message) {
  paint(anchor, `<div class="chips">${chip('', message, 'err')}</div>`);
}

export function renderLoading(anchor) {
  const wrap = ensureHost(anchor).shadowRoot.querySelector('.wrap');
  if (!wrap.innerHTML) wrap.innerHTML = `<div class="chips">${chip('', 'Loading live stats…', 'muted')}</div>`;
}

export function clearFrom(anchor) {
  for (const c of [...(anchor?.children || [])]) {
    if (c.classList?.contains(HOST_CLASS)) c.remove();
  }
}

export function clearAll() {
  document.querySelectorAll(`.${HOST_CLASS}, .${MARKER_CLASS}`).forEach((el) => el.remove());
}
