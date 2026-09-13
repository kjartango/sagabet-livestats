# SagaBet Live Stats

A browser extension that adds live match statistics to the **My bets** view on epicbet —
team totals *and* per-player numbers, right under each selection.

Works with no API key, no account and no quota — or with your own licensed key if you
prefer. Chrome, Firefox (incl. Zen), and Safari.

> **Not affiliated with epicbet, SofaScore or FotMob.** This is an independent, unofficial
> tool that runs in your own browser. See [Data sources](#data-sources) before you rely on it.

---

## What it looks like

Under a selection whose match is in play:

```
Shots 19/32.5 │ ● 73' │ 0–0 │ Shots 18–1 │ On target 6–0 │ Corners 11–0 │ Fouls 5–3 │ Players 22 ▼
```

The leading chip appears when the bet is on a totals market — *Match Total Shots*,
*Total Corners* — and shows the combined count so far against your line, which is the
number the bet actually turns on.

Click **Players ▼** for the per-player table, with 🟨/🟥 beside anyone booked:

```
  Northport                Sh   SoT   Fls   Rtg
  5  E. Pulgar              3     0     2   7.3
  10 G. de Arrascaeta       3     0     0   6.4
  16 S. Lino                3     2     0   6.5
```

**22 team stats:** shots, on/off target, blocked, inside/outside box, woodwork, xG, big
chances, corners, possession, passes, touches in box, offsides, fouls, yellow, red,
tackles, interceptions, clearances, saves, duels won.

**17 player stats:** shots, on/off target, blocked, goals, assists, xG, fouls, fouled,
tackles, interceptions, offsides, saves, key passes, touches, minutes, rating.

All of them are toggleable in the settings.

---

## Install

You need [Node.js](https://nodejs.org) to build. There is no bundler and no runtime
dependency — the build just copies `src/` and writes a per-browser manifest.

```bash
git clone https://github.com/<you>/sagabet-livestats.git
cd sagabet-livestats
npm run build
```

That produces `dist/chrome`, `dist/firefox`, `dist/firefox-mv2`, `dist/safari`, and two
`.xpi` files.

### Chrome (also Edge, Brave, Opera)

1. Open **`chrome://extensions`**
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select the **`dist/chrome`** folder

Pin it from the puzzle-piece menu. That's it — open a live bet on epicbet.

### Firefox, Zen, LibreWolf, Waterfox

Use **`dist/firefox-mv2`**. Firefox's MV3 makes host permissions opt-in, so the MV3 build
installs happily and then fetches nothing until you grant them by hand; MV2 grants them at
install, and Firefox supports MV2.

**To try it (removed when the browser restarts):**

1. **`about:debugging#/runtime/this-firefox`**
2. **Load Temporary Add-on…**
3. Select **`dist/firefox-mv2/manifest.json`**

**To install permanently**, Gecko wants the extension signed. Either:

- **Disable the check** — works in Zen and several other forks, *not* in release Firefox:
  `about:config` → `xpinstall.signatures.required` → `false`, then `about:addons` → gear →
  **Install Add-on From File…** → `dist/sagabet-livestats-firefox-mv2.xpi`
- **Get it signed, free** — upload the `.xpi` at
  [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) as an **unlisted**
  add-on (stays private, isn't published), download the signed file, install that.

If you prefer the MV3 build, install `dist/sagabet-livestats-firefox.xpi` and then grant
host permissions manually: `about:addons` → the extension → **Permissions** → allow
`epicbet.com`, `api.sofascore.com` and `www.fotmob.com`.

### Safari

Safari extensions must be wrapped in a macOS app bundle, so this step **requires a Mac with
Xcode** — it cannot be done on Linux or Windows.

```bash
npm run build:safari
xcrun safari-web-extension-converter dist/safari --project-location safari/ --macos-only
open "safari/SagaBet Live Stats/SagaBet Live Stats.xcodeproj"
```

Build and run in Xcode, then in Safari enable **Settings → Advanced → Show features for web
developers**, and **Settings → Developer → Allow unsigned extensions**. Finally tick the
extension under **Settings → Extensions** and grant it access to epicbet.

---

## Using it

Open epicbet → **My bets** → **Opið**, on a match that is in play. Nothing to configure.

Click the toolbar icon for settings:

| Setting | Default | Notes |
|---|---|---|
| Data source | SofaScore | Or FotMob, or API-Football with your own key. Unusable sources are skipped and the next one is tried |
| Refresh | 30s | No quota to protect, so this is purely how fresh you want it |
| Only look up matches epicbet shows as in play | on | Off looks up every football selection |
| Team stats | 6 of 22 | Chips shown under each bet |
| Player stats | 4 of 17 | Columns in the expandable table |
| Debug logging | off | Logs what the adapter found, to the page console |

Troubleshooting lives in **[SETUP.md](SETUP.md)**.

---

## How it works

| Piece | File | Role |
|---|---|---|
| DOM adapter | `src/content/extract.js` | Finds selections in the bets modal, scrapes the fixture |
| Renderer | `src/content/render.js` | Injects the strip into a shadow root under each row |
| Loop | `src/content/content.js` | Re-scans on DOM mutation, polls on an interval |
| Connectors | `src/background/sofascore.js`, `fotmob.js`, `api-football.js` | Live feeds — two keyless, one BYOK — with fallback |
| Vocabulary | `src/background/stat-keys.js` | Canonical keys both connectors translate into |
| Matcher | `src/background/matcher.js` | Fuzzy-matches bookmaker team names to a fixture |
| Broker | `src/background/service-worker.js` | Caching, dedupe, provider fallback |

### Reading the page

epicbet's class names are content-hashed (`_1yfzc7i3`, `_1axdwyn0`) and change on every
deploy, so the adapter keys off the site's `data-testid` / `data-match-id` attributes and
the structure around them. Three things make it hold up:

- **The fixture is located via the meta line, not by position.** Outright bets put a `" - "`
  in the *market* name ("Tímabil H2H Ashford Town - Westvale"), so naive parsing invents
  matches that don't exist. The adapter finds the `<time> / <league>` line — numeric, so
  language-independent — and takes the element before it.
- **Live is detected from the running clock**, not a label. epicbet renders the score widget
  for any started match but shows a clock only while it's in play. This is what keeps
  lookups to matches that can actually return something.
- **`data-sport-id` gates the lookup.** `1` is football; `18` is American football, which no
  football feed covers.

### Matching team names

Bookmakers and stats providers rarely spell clubs the same way — "Brest" vs "Stade Brestois
29", "Man Utd" vs "Manchester United", "Bayern Munich" vs "Bayern München". The matcher
normalises, strips club-name noise, applies an alias table, and falls back to character
bigram similarity, scoring both teams and both orientations. A league name breaks ties but
never gates a match, because epicbet localises competition names.

### Data sources

Three connectors, all translating into one canonical vocabulary so they're interchangeable.

| | SofaScore (default) | FotMob | API-Football |
|---|---|---|---|
| Key needed | no | no | **yes, your own** |
| Documented API | no | no | yes |
| Team stats | 22 canonical keys | 22 canonical keys | 15 canonical keys |
| Player stats | from `lineups` | from `playerStats` | from `fixtures/players` |
| Per-player shots | `totalShots` etc. | derived from `shotmap` — every shot with minute, xG, on-target flag | `shots.total` / `shots.on` |
| Cards per player | `incidents` feed | `matchFacts` events | per-player `cards` |
| Quota | none | none | 100 req/day on the free plan |

### Bring your own key

API-Football is a **licensed, documented API** — the option to reach for if you'd rather
not depend on undocumented endpoints, or if you're distributing this to anyone. Register
free at [dashboard.api-football.com](https://dashboard.api-football.com/register), then
paste the key into the extension's options; a key panel appears when you select that
source.

The key is stored in your browser's extension storage and sent only to API-Football. **It
is never in this repository or in any build** — and it cannot be. A browser extension ships
to every user as readable files, so there is no way to embed a secret in one. Bring-your-own-key
is the only honest arrangement; the alternative is running a proxy server that holds the key
and pays for everyone's usage.

> **SofaScore and FotMob are undocumented endpoints, not published APIs.** They can change or start
> refusing requests without notice. That is why there are two of them, why every field is
> read defensively, and why the normalizers are pinned by tests. Use of them is subject to
> those providers' terms, not this project's licence — if you intend to distribute or
> monetize anything built on this, get a licensed feed instead.

One call fetches the live-match list, shared by every bet, plus one detail call per distinct
match you hold a bet on. Responses are cached for the refresh interval and concurrent
requests are deduped. All network calls happen in the background worker, never in the page.

### Privacy

The extension stores your settings locally and sends nothing anywhere. It has no analytics,
no telemetry, no remote configuration, and no server. It reads the bets modal on epicbet and
calls the two stats providers; that is the whole of its network activity.

---

## Development

```bash
npm test              # matcher, DOM adapter, both connectors, full render pipeline
npm run check:live    # are the provider endpoints up right now?
npm run build         # all targets
```

| Script | Covers |
|---|---|
| `test-matcher.mjs` | Team-name matching, including a pair that must *not* match |
| `test-extract.mjs` | DOM adapter against `samples/fixtures/bets.html`, with assertions |
| `test-normalize.mjs` | All three connectors against API responses in `samples/api/` |
| `test-render.mjs` | Full pipeline: page fixture + real provider data → rendered strip |

`samples/fixtures/bets.html` is a synthetic stand-in for the bets modal. It reproduces the
real structure with invented data and deliberately includes the cases that break naive
parsing: a live match, a finished one, an unstarted one, an outright whose market name
contains `" - "`, and an American-football selection.

**Two caveats on the connector tests.** SofaScore and FotMob TLS-fingerprint their callers
and reject Node's `fetch` whatever headers you send — Chrome passes, which is where the
extension runs, so those two are tested against responses captured with curl, and
`npm run check:live` probes the real endpoints. The API-Football fixtures are *synthetic*,
written from its published v3 schema rather than captured, because that connector needs a
key nobody had at the time; a failure there is a hint, not proof.

### Icons

`src/icons/icon.svg` is the source. Regenerate the PNGs with `node scripts/make-icons.mjs`
(needs `rsvg-convert`).

### Adapting after an epicbet redesign

`src/content/extract.js` is the only site-specific file. Save a copy of the bets modal, run
`node scripts/test-extract.mjs <your-file.html>` to see what the adapter makes of it, and
use `scripts/slice.py <file> <needle>` to pretty-print any subtree of the saved page.

There is also a console probe for checking the adapter against the live site without
installing anything — see [SETUP.md](SETUP.md#the-scraping-probe).

---

## Licence

[MIT](LICENSE).

Nothing here is betting advice, and live data can be wrong, delayed, or missing. Check
anything that matters against the source.
