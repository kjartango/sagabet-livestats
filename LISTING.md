# AMO listing copy

Ready-to-paste text for a **listed** (catalogue) submission on
addons.mozilla.org. Upload `dist/sagabet-livestats-firefox-listed.xpi` — the
self-distributed build carries an `update_url`, which AMO rejects on listed
add-ons.

---

## Name

```
SagaBet Live Stats
```

## Summary

*(250 characters max — AMO counts strictly)*

```
Adds live match statistics to your placed bets on epicbet: score, shots, shots on target, corners, fouls, cards and possession, plus an expandable per-player table. Bets on totals markets show the running count against your line.
```

## Description

```
Watching a bet on a match in play, without knowing how the match is actually going, means switching to another tab to find out. This extension puts the numbers next to the bet.

Under every selection in the My Bets view, on a match that is currently being played, it adds a strip showing:

• Score and minute
• Shots, shots on target, shots off target, blocked shots
• Corners, fouls, offsides, possession
• Yellow and red cards
• Expected goals (xG) and big chances

If the bet is on a totals market — over 5.5 corners, match total shots — the first chip shows the running count against your line, which is the number the bet actually turns on.

Click "Players" for a per-player table: shots, shots on target, fouls, tackles and ratings for everyone on the pitch, with a marker beside anyone booked. 22 team statistics and 17 player statistics are available; you choose which are shown.

WHAT IT DOES NOT DO

It never places, changes or cancels a bet. It cannot — it only reads the page and displays information. It is not betting advice, and live data can be delayed or wrong.

PRIVACY

No account, no sign-up, no tracking, no analytics, no server. Your settings are stored in your own browser and nothing about you is transmitted anywhere. The source is published in full and is not minified.

DATA SOURCES

Match statistics come from public football data endpoints (SofaScore or FotMob, selectable in the settings). API-Football is also supported if you prefer to supply your own licensed API key.

NOT AFFILIATED

This is an independent, open-source tool, not connected with epicbet, SofaScore or FotMob in any way.

Source code and issue tracker: https://github.com/kjartango/sagabet-livestats
```

## Categories

```
alerts-updates
```

**Alerts & Updates.** AMO has no sports category — the full list for Firefox extensions is
feeds-news-blogging, web-development, download-management, privacy-security, search-tools,
appearance, bookmarks, language-support, photos-music-videos, social-communication,
alerts-updates, other, tabs, shopping, games-entertainment.

*Alerts & Updates* is the closest honest fit: the extension surfaces live-updating
information on a page. *Games & Entertainment* and *Other* are defensible alternatives.
This is set in `amo-metadata.json`, which the listed submission passes to the API.

## Tags

**None.** AMO's tags are a fixed vocabulary of 42 values, not free text, and there is no
sports, football or statistics tag among them:

> ad blocker, anti malware, anti tracker, antivirus, chat, container, content blocker,
> coupon, dailymotion, dark mode, dndbeyond, download, facebook, google, image search, mp3,
> music, password manager, pinterest, pixiv, privacy, reddit, roblox, scholar, search,
> security, shopping, social media, streaming, torrent, translate, twitch, twitter, user
> scripts, video converter, video downloader, vpn, wayback machine, whatsapp, word counter,
> youtube, zoom

Nothing there describes a live sports-statistics overlay, so the field is left empty rather
than mislabelled. Retrieve the current list with an OPTIONS request against
`/api/v5/addons/addon/<guid>/`.

## Support

| Field | Value |
|---|---|
| Support site | `https://github.com/kjartango/sagabet-livestats/issues` |
| Homepage | `https://github.com/kjartango/sagabet-livestats` |
| Licence | MIT |

## Privacy policy

**Must be pasted in by hand.** AMO's v5 API does not expose `privacy_policy` as a writable
field — only a read-only `has_privacy_policy` flag — so a PATCH containing it is accepted
and silently discarded. `npm run update-listing` therefore does not send it, and warns if
it is still unset.

Developer Hub → the add-on → **Edit Product Page** → *Privacy Policy*:

```
SagaBet Live Stats collects no personal data.

The extension stores your display preferences (which statistics to show, refresh interval, chosen data source) in your browser's local extension storage. This never leaves your device and is not accessible to the author or anyone else.

The extension reads the names of the teams in the bets displayed on epicbet in your browser, in order to look up statistics for those matches. Those team names are sent to the public football statistics service you have selected (SofaScore or FotMob by default), solely to retrieve match statistics. No identifier, account information, bet amount, or anything else about you or your account is included in those requests.

There is no analytics, no telemetry, no tracking, no advertising, and no server operated by this project. Nothing is recorded about which matches you look at.

If you choose to supply your own API-Football key, it is stored in your browser's extension storage and sent only to api-football.com to authenticate your own requests.

Contact: https://github.com/kjartango/sagabet-livestats/issues
```

## Screenshots

`docs/screenshot-firefox.png` — the extension running on two live matches. Uploaded by
`npm run update-listing`, with this caption:

```
Live statistics under each bet, with the per-player table available on any match in play.
```

The script skips the upload if any screenshot is already attached, so it never duplicates
them; remove the existing one in the Developer Hub first to replace it.

**More would help.** AMO allows several, and a listing with one screenshot looks thin.
Worth capturing, all with stakes and account details cropped or blurred:

1. The expanded **Players** table
2. The settings page, showing the statistic pickers
3. A totals bet with the `Corners 3 / 5.5` chip visible

## Notes to reviewer

*(Private — not shown publicly. This matters here: a reviewer cannot exercise the extension without a betting account.)*

```
Seeing this extension render anything requires a logged-in epicbet account with a bet placed on a football match that is in play at the time of review. We cannot provide a shared test account for a gambling site, and there is no demo mode.

What it does, in full: a content script reads the two team names shown on each selection in the "My bets" view, sends those names to a public football statistics endpoint (api.sofascore.com by default, www.fotmob.com selectable), and renders the returned statistics into a shadow root beneath the selection. It performs no other network activity, stores only display preferences, transmits nothing about the user, and executes no remote code.

content/content.bundle.js is built from src/content/ with esbuild and is deliberately not minified, so it can be read directly and compared against the source. Build script and full source: https://github.com/kjartango/sagabet-livestats

The extension is read-only with respect to the site: it never places, modifies or cancels a bet, and has no code path that submits anything to epicbet.
```

---

## Applying this listing

```bash
npm run update-listing
```

Pushes `listing.json` (description, privacy policy, homepage, support URL, tags) to AMO and
uploads the screenshot. **AMO throttles listing writes** — roughly one burst per 25 minutes
— so a 429 means wait, not that something is wrong.

## Before submitting

```bash
npm test
npm run lint:listed     # addons-linter in listed mode — expect 0 errors
```

One warning is expected and explained in [RELEASING.md](RELEASING.md).
