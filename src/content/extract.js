// DOM adapter for epicbet's "My bets" view.
//
// epicbet's class names are content-hashed (`_1yfzc7i3`) and change on every
// deploy, so nothing here keys off them. We anchor on the `data-testid` /
// `data-match-id` attributes the site ships, and fall back to structure.
//
// Shape of one placed selection (whitespace added):
//
//   <div class="_1axdwyn0">                                <- wrapper
//     <div data-testid="betslip-selection" data-testkey="449136057">
//       <span>Yfir 32.5</span>                             <- pick
//       <div>Match Total Shots</div>                       <- market
//       <div>Brest - PSG</div>                             <- fixture
//       <div>13. sep., 18:45 / Ligue 1</div>               <- meta (date / league)
//       <span>Í beinni</span><div>1.38</div>               <- live badge, odds
//     </div>
//     <div data-match-id="2007484" data-sport-id="1"       <- only when in play
//          data-testid="match-container"> 0 1 73' 2H </div>
//   </div>
export const SELECTORS = {
  // The "My bets" modal. Scoping here keeps us off the bet-placement betslip,
  // which reuses the same selection testid.
  scope: '[data-testid="my-bets-container"], [data-testid="ticket-list-container"]',
  selection: '[data-testid="betslip-selection"]',
  matchWidget: '[data-match-id]',
};

// epicbet sport ids. API-Football only covers association football.
export const SPORT_FOOTBALL = '1';

// "13. sep., 18:45 / Ligue 1" -> league. Digits and the slash carry the match,
// so this survives the site's language setting.
const META_RE = /\d{1,2}:\d{2}\s*\/\s*(.+)$/;

// epicbet joins teams with " - "; other books use en/em dashes or "vs".
const VS_SPLIT = /\s+(?:[-–—]|vs\.?|v\.?)\s+/i;

// A running clock: 73' or 73’ or 45+2'. No word boundary — the widget's text
// nodes concatenate with the score ("0" + "1" + "73'" + "2H"), and a finished
// match renders the score alone, which is exactly what distinguishes the two.
const CLOCK_RE = /\d{1,3}(?:\+\d{1,2})?\s*['’]/;

const KEY_ATTR = 'data-els-key';
let seq = 0;

function text(el) {
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

/** Leaf elements carrying text, in document order. */
function textLeaves(root) {
  const out = [];
  for (const node of root.querySelectorAll('*')) {
    if (node.children.length) continue;
    if (node.closest('.sagabet-livestats-host')) continue;
    const t = text(node);
    if (t) out.push({ node, text: t });
  }
  return out;
}

/** Split "Brest - PSG" into teams; null when the line isn't a fixture. */
export function splitFixture(label) {
  const s = String(label || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 120) return null;
  const parts = s.split(VS_SPLIT);
  if (parts.length !== 2) return null;
  const [home, away] = parts.map((p) => p.trim());
  if (!home || !away) return null;
  if (/^\d+$/.test(home) || /^\d+$/.test(away)) return null;
  return { home, away };
}

function findScopes() {
  const scopes = [...document.querySelectorAll(SELECTORS.scope)];
  return scopes.length ? scopes : [document];
}

/**
 * The live-score widget epicbet renders beside an in-play selection.
 * It sits next to the selection, not inside it.
 */
function findWidget(selection) {
  const wrapper = selection.parentElement;
  if (!wrapper) return null;
  const widget = wrapper.querySelector(SELECTORS.matchWidget);
  // Guard against picking up a widget belonging to a neighbouring selection.
  if (!widget || widget.closest(SELECTORS.selection)) return null;
  return widget;
}

/** Pull the fixture out of one selection. */
function parseSelection(selection) {
  const leaves = textLeaves(selection);
  if (!leaves.length) return null;

  // The meta line ("<date>, <time> / <league>") is the anchor: the fixture is
  // the element right before it. Positional parsing would misfire on outright
  // bets, whose market name also contains " - "
  // (e.g. "Tímabil H2H Crystal Palace - Sunderland").
  let league = '';
  let fixture = null;

  const metaLeaf = leaves.find((l) => META_RE.test(l.text));
  if (metaLeaf) {
    league = (metaLeaf.text.match(META_RE)?.[1] || '').trim();
    const prev = metaLeaf.node.previousElementSibling;
    fixture = splitFixture(text(prev));
    if (!fixture) {
      const idx = leaves.indexOf(metaLeaf);
      fixture = idx > 0 ? splitFixture(leaves[idx - 1].text) : null;
    }
  }

  if (!fixture) {
    // No meta line: take the first line that reads like a fixture, skipping the
    // pick and market lines at the top of the card.
    for (const leaf of leaves.slice(2)) {
      const f = splitFixture(leaf.text);
      if (f) { fixture = f; break; }
    }
  }

  if (!fixture) return null;

  return {
    ...fixture,
    league,
    pick: leaves[0]?.text || '',
    market: leaves[1]?.text || '',
  };
}

/**
 * Scrape the placed bets currently rendered.
 * @returns {Array<{key, home, away, league, live, sportId, matchId, el, anchor}>}
 */
export function extractBets() {
  const bets = [];
  const seen = new Set();

  for (const scope of findScopes()) {
    for (const selection of scope.querySelectorAll(SELECTORS.selection)) {
      if (seen.has(selection)) continue;
      seen.add(selection);

      const parsed = parseSelection(selection);
      if (!parsed) continue;

      const widget = findWidget(selection);
      const sportId = widget?.getAttribute('data-sport-id') || null;
      const matchId = widget?.getAttribute('data-match-id') || null;

      // epicbet only renders the score widget once a match is under way, and
      // only shows a running clock while it is in play.
      const live = !!widget && CLOCK_RE.test(text(widget));

      // The selection's own testkey is stable across re-renders; the hashed
      // class names are not.
      let key = selection.getAttribute('data-testkey');
      if (!key) {
        key = selection.getAttribute(KEY_ATTR) || `els-${seq += 1}`;
        selection.setAttribute(KEY_ATTR, key);
      }
      key = `sel:${key}`;

      bets.push({
        ...parsed,
        key,
        sportId,
        matchId,
        live,
        el: selection,
        // Render below the score widget when there is one.
        anchor: widget && widget.parentElement === selection.parentElement
          ? selection.parentElement
          : selection,
      });
    }
  }

  return bets;
}

/** Bets we should spend an API lookup on. */
export function isFootball(bet) {
  return bet.sportId === null || bet.sportId === SPORT_FOOTBALL;
}
