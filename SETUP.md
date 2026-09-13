# Setup

**Nothing is required from you except two minutes and Chrome.** The default data sources
are keyless — no account, no signup, no payment details. A third source (API-Football) is
available if you'd rather use a licensed API; it needs a free key, and there's a setup panel
for it in the options.

---

## 1. Build

```bash
cd sagabet-livestats
npm run build:chrome
```

Creates `dist/chrome/`. Nothing is installed yet — it's just a folder of files.

## 2. Load it into Chrome

1. Open a new tab → **`chrome://extensions`**
2. Turn on **Developer mode** (toggle, top right)
3. Click **Load unpacked** (top left)
4. Select the folder **`dist/chrome`**
   — the folder itself; don't open it and pick a file

"SagaBet Live Stats" appears in the list. Pin it: puzzle-piece icon in the toolbar → pin.

**This is the step that makes stats appear.** Everything before it only produced files.

## 3. Open a live bet

1. **epicbet.com** → log in → **My bets** → **Opið**
2. Find a selection on a match **in play right now** — epicbet shows a running clock on
   it, like `73'`

Under that selection:

```
Shots 19/32.5 │ ● 73' │ 0–0 │ Shots 18–1 │ On target 6–0 │ Corners 11–0 │ Fouls 5–3 │ Players 22 ▼
```

Click **Players ▼** for the per-player table — shots, on target, fouls, rating, with
🟨/🟥 beside anyone booked:

```
  Flamengo                Sh   SoT   Fls   Rtg
  5  E. Pulgar             3     0     2   7.3
  10 G. de Arrascaeta      3     0     0   6.4
  16 S. Lino               3     2     0   6.5
```

Refreshes every 30 seconds.

---

## Optional: settings

Click the toolbar icon.

- **Data source** — SofaScore (default), FotMob, or API-Football. The first two are
  keyless and cover each other automatically, so this is a preference, not a dependency.
  Selecting API-Football reveals a panel for your own key (free registration at
  dashboard.api-football.com); it is stored only in this browser and sent only to that API.
- **Refresh** — 30s default. There is no quota to protect, so this is only about how
  fresh you want it.
- **Only look up matches epicbet shows as in play** — on by default.
- **Team stats** — 22 available: shots, on/off target, blocked, in box, outside box,
  woodwork, xG, big chances, corners, possession, passes, touches in box, offsides,
  fouls, yellow, red, tackles, interceptions, clearances, saves, duels won.
- **Player stats** — 17 columns: shots, on/off target, blocked, goals, assists, xG,
  fouls, fouled, tackles, interceptions, offsides, saves, key passes, touches, minutes,
  rating.

## If the strip doesn't appear

**Is anything in play?** By default only matches epicbet shows a running clock for get
looked up. A bet on a match that hasn't kicked off or has finished gets nothing — correct
behaviour, not a failure.

**Is the extension running on the page?** Options → turn on *"Log debug output to the
page console"*. Reload epicbet, F12 → Console:

```
[sagabet-livestats] 4 selection(s), 1 to look up  ["Brest - PSG"]
```

- **No lines** → content script isn't loading. Check `chrome://extensions` for an error
  on the card, and confirm you're on `epicbet.com` or `epicbet.io`.
- **`0 selection(s)`** → the bets modal wasn't open, or the markup changed. Run the probe
  below.
- **`N selection(s), 0 to look up`** → nothing in play.

**Is the provider reachable?** `npm run check:live` — probes both endpoints from this
machine.

**Provider errors** surface in the background worker's console:
`chrome://extensions` → the extension's **service worker** link → Console.

**Wrong match, or no match?** The bookmaker and the stats provider spell clubs
differently, and the matcher bridges that. If a match isn't found, turn on debug and send
me the console output — extending the matcher is a one-line change.

## The scraping probe

A read-only check of the DOM half alone. On epicbet with the bets modal open: F12 →
Console → type `allow pasting` + Enter (Chrome demands this once), then paste the
contents of `scripts/console-probe.js`.

It prints a table of every selection it parsed. It renders nothing — it only reports
whether the adapter reads the page correctly. Regenerate it after changing the adapter:
`node scripts/make-console-probe.mjs`

## Zen Browser (and Firefox, LibreWolf, Waterfox)

Zen is a Firefox fork, so it takes the Firefox build. Two things differ from Chrome:
Gecko wants extensions **signed**, and on MV3 it makes host permissions **opt-in**.

```bash
npm run build              # produces both Firefox variants and .xpi files
```

Use **`dist/firefox-mv2`** for Zen. MV2 grants host permissions at install time; the MV3
build leaves them switched off until you grant them by hand, and until you do the
extension fetches nothing and fails silently. Firefox still supports MV2.

### Quickest — works now, lost on restart

1. Open **`about:debugging#/runtime/this-firefox`**
2. **Load Temporary Add-on…**
3. Select **`dist/firefox-mv2/manifest.json`**

Good for confirming it works. Temporary add-ons are removed when the browser restarts.

### Permanent — needs the signature check handled

Gecko refuses unsigned extensions on release builds. Two routes:

**Route 1 — disable the check.** Confirmed working in Zen Browser (verified 2026-09-13).
Other Gecko forks vary; release Firefox itself does not permit this.

1. **`about:config`** → accept the warning
2. Search **`xpinstall.signatures.required`** → set to **`false`**
3. **`about:addons`** → gear icon → **Install Add-on From File…** →
   `dist/sagabet-livestats-firefox-mv2.xpi`

If a fork doesn't expose the pref, or still refuses the install as "not verified", that
browser enforces signing and you need Route 2.

**Route 2 — get it signed (permanent, free).** Mozilla signs unlisted add-ons for personal
use at no cost. You'll need a Mozilla account — I can't create one for you:

1. Sign in at **https://addons.mozilla.org/developers/**
2. **Submit a New Add-on** → **On your own** (unlisted — it stays private, not published)
3. Upload `dist/sagabet-livestats-firefox-mv2.xpi`
4. Download the signed `.xpi` it returns
5. **`about:addons`** → gear → **Install Add-on From File…** → the *signed* file

The add-on id (`sagabet-livestats@kjartan`) is already set in the manifest, which signing
requires.

### If you want the MV3 build instead

Install `dist/sagabet-livestats-firefox.xpi` the same way, then grant host permissions by
hand — **`about:addons`** → the extension → **Permissions** → enable access to
`epicbet.com`, `api.sofascore.com` and `www.fotmob.com`. Without this it installs fine and
does nothing.

## Safari

```bash
npm run build:safari    # needs macOS + Xcode; see README
```
