# Installing on Safari

Safari is the hardest of the three, and not because of anything in this extension: Apple
requires every Safari extension to be delivered inside a macOS **app**, built and signed
with Xcode. There is no download-and-click route, and it cannot be done from Linux or
Windows.

Budget about 30 minutes, most of it waiting for Xcode to download.

---

## What you need

| | |
|---|---|
| **A Mac** | macOS 13 Ventura or newer |
| **Safari 16.4+** | Older versions can't load this extension — it uses module imports Safari only supports from 16.4 |
| **Xcode** | Free from the Mac App Store. It is a large download (7 GB+) and takes a while |
| **Node.js** | [nodejs.org](https://nodejs.org) — the LTS installer is fine |
| **An Apple ID** | A free one works. A paid developer account ($99/yr) is only needed to avoid one recurring annoyance, described at the bottom |

---

## Step 1 — Build the extension

Open **Terminal** (⌘-Space, type "Terminal") and run:

```bash
git clone https://github.com/kjartango/sagabet-livestats.git
cd sagabet-livestats
npm install
npm run build:safari
```

You now have a `dist/safari` folder. That's the extension, but Safari can't load it yet.

## Step 2 — Wrap it in an app

```bash
xcrun safari-web-extension-converter dist/safari --project-location safari/ --macos-only
```

It will ask a couple of questions — accept the defaults. When it finishes it opens Xcode
automatically. If it doesn't:

```bash
open "safari/SagaBet Live Stats/SagaBet Live Stats.xcodeproj"
```

## Step 3 — Build it in Xcode

1. In the left sidebar, click the blue project icon at the very top (**SagaBet Live Stats**)
2. Select the **SagaBet Live Stats** target, then the **Signing & Capabilities** tab
3. Next to **Team**, choose your Apple ID. If none is listed: **Add an Account…**, sign in
   with your Apple ID, then pick the "(Personal Team)" entry
4. Press **⌘R** (or the ▶ play button) to build and run

A small app window appears saying the extension is ready. Leave it, or quit it — the
extension stays installed either way.

> **If the build fails on signing**, set *Signing Certificate* to **Sign to Run Locally**.
> You're only running this on your own machine, so no real certificate is needed.

## Step 4 — Turn on unsigned extensions in Safari

Safari won't load a locally-built extension until you allow it:

1. Safari → **Settings…** (⌘,) → **Advanced** tab
2. Tick **Show features for web developers** at the bottom
3. A **Developer** tab appears in Settings. Go to it
4. Tick **Allow unsigned extensions**

## Step 5 — Enable it and grant access

1. Safari → **Settings…** → **Extensions** tab
2. Tick **SagaBet Live Stats** in the list
3. Click it, and set its permission for **epicbet.com** to **Allow** — choose
   **Always Allow on This Website** so it doesn't ask again

## Step 6 — Use it

Go to **epicbet.com**, log in, open **My bets**, and look at a bet on a match being played
right now. The stats strip appears under the selection.

---

## The one recurring annoyance

**"Allow unsigned extensions" switches itself off every time you quit Safari.** That's
Apple's rule for locally-built extensions, not something this project can change. Each time
you restart Safari you'll need to redo **Step 4** (Settings → Developer → Allow unsigned
extensions).

The only way around it is a **paid Apple Developer account** ($99/year), which lets you
sign and notarise the app properly so it stays enabled permanently. For most people,
re-ticking one checkbox is the better deal — or just use Firefox/Zen or Chrome, where this
doesn't come up at all.

---

## If something doesn't work

**The extension isn't in Safari's Extensions list.**
The app didn't build or didn't run. Go back to Xcode and press ⌘R again; read the red error
if there is one. The app must have been run at least once.

**It's in the list but greyed out.**
"Allow unsigned extensions" is off — Step 4. It turns itself off on every Safari restart.

**It's enabled but nothing shows on epicbet.**
Check the site permission (Step 5) is *Allow*, not *Ask*. Then confirm the match is actually
in play — epicbet shows a running clock like `66'` on those; bets on matches that haven't
started get nothing, by design.

**Still nothing.**
Open the extension's settings from Safari's toolbar and turn on *Log debug output to the
page console*. Then on epicbet: Develop menu → **Show JavaScript Console**, and look for
`[sagabet-livestats]` lines. [Open an issue](https://github.com/kjartango/sagabet-livestats/issues)
with what you see.

---

## A note on testing

The Chrome and Firefox builds have been run against the live site. **The Safari build has
not** — it needs a Mac, and this was developed on Linux. The code is standard MV3 and the
cross-browser messaging is written to Safari's promise-based API, so it should work, but you
may be the first to find out. If you hit something, please
[open an issue](https://github.com/kjartango/sagabet-livestats/issues).
