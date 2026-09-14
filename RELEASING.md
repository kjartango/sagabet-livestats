# Releasing

How a new version reaches users. Relevant to maintainers only.

## Distribution model

The add-on is **self-distributed (unlisted)** on addons.mozilla.org: Mozilla signs the
`.xpi`, we host it on GitHub Releases. It is not published in the AMO catalogue.

Why: a signed `.xpi` installs on *any* Firefox with no `about:config` change, which is the
whole difficulty for non-technical users. Listed distribution would add catalogue
discoverability and hand update-hosting to Mozilla, at the cost of a human review queue —
worth revisiting once the extension is proven, but not the fastest path to "my friends can
install this".

Consequences of being unlisted:

- **We own updates.** Firefox polls `update_url` in the manifest, which points at
  [`updates.json`](updates.json) in this repo. Without that file being correct, nobody ever
  gets an update.
- **`update_url` must be removed if this ever becomes a listed add-on.** AMO rejects it,
  because it handles updates itself.
- Only signed builds auto-update. Firefox will not install an unsigned `.xpi` over a signed
  one.

## Cutting a release

### Automated (preferred)

One-time setup: create an API key at
[addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/)
and put the two values in a `.env` file in the project root (gitignored):

```
AMO_JWT_ISSUER=user:12345678:123
AMO_JWT_SECRET=...
```

The secret is displayed once and cannot be retrieved later. Anyone holding it can publish
add-ons as you — treat it like a password, and revoke it on that page if it ever leaks.

Then, per release:

```bash
# 1. bump the version in package.json AND src/manifest.json (they must match)
npm test          # includes the built-artifact checks
npm run lint      # addons-linter, self-hosted mode — expect 0 errors
npm run sign      # uploads to AMO, waits for signing, writes the signed .xpi to dist/
git commit -am "Release vX.Y.Z" && git push
npm run release   # GitHub release + updates.json + push
```

`npm run sign` submits to the **unlisted** channel, which is what keeps the add-on
self-distributed. Unlisted submissions are signed automatically, usually in under a minute.

`npm run release` refuses to publish an unsigned `.xpi` — it checks for the Mozilla
signature first, because an unsigned file on the release would install for nobody and break
auto-updates without any visible error.

### By hand

The web flow, if you'd rather not hold an API key:

```bash
npm test && npm run lint && npm run build
```

- [Developer Hub](https://addons.mozilla.org/developers/) → the add-on → **Upload New
  Version** → **On your own** → upload `dist/sagabet-livestats-firefox-mv2.xpi`
- Download the signed `.xpi` back from the Developer Hub — it is *not* the file you uploaded
- Put it at `dist/sagabet-livestats-firefox-mv2.xpi`, replacing the unsigned build
- `npm run release`

Either way the release asset must keep the exact filename
`sagabet-livestats-firefox-mv2.xpi`; `updates.json` links to it by name.

## Verifying updates work

After a release, in a Firefox profile with the previous version installed:

1. `about:addons` → gear → **Check for Updates**
2. The version under the add-on's name should change

If it doesn't: fetch `updates.json` in a browser and confirm it is served as JSON and the
`update_link` is reachable. A 404 there is silent from the user's side.

## Notes on review

Unlisted submissions are signed automatically but remain subject to manual review at any
time. Things that make that go smoothly, all already true here:

- **No minification or bundling.** The source in the `.xpi` is the source in this repo, so
  there is no build to reproduce and no source-upload requirement.
- **No remote code.** Nothing is `eval`'d or fetched-then-executed; the only network calls
  return JSON that is parsed and displayed.
- **Narrow permissions.** Two site hosts and the stats providers, each justified in the
  README.

Two things a reviewer may reasonably ask about, worth having an answer ready for: the
extension reads undocumented SofaScore/FotMob endpoints, and it operates on a gambling site.
Neither breaches Mozilla's policies, but be prepared to explain both.

### If AMO refuses a Manifest V2 submission

Mozilla's stance on new MV2 submissions has shifted over time. If `-mv2` is rejected,
submit `dist/sagabet-livestats-firefox.xpi` (MV3) instead and update the install
instructions: on Firefox, MV3 host permissions are opt-in, so users must additionally go to
`about:addons` → the extension → **Permissions** and grant access to epicbet.com,
api.sofascore.com and www.fotmob.com. Until they do, the extension installs cleanly and does
nothing.

## Validating before you upload

```bash
npm run lint
```

Runs Mozilla's own `addons-linter` the way AMO validates a **self-distributed** add-on.
Expect **0 errors**. One warning is known and accepted:

- **`MANIFEST_UPDATE_URL` is an error in *listed* mode, not here.** AMO forbids `update_url`
  on catalogue-hosted add-ons because it handles updates itself; self-distribution requires
  it. If you ever switch to listed, that key must come out. Always lint with
  `--self-hosted`, or you'll be chasing an error that doesn't apply.
- **`KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`.** `data_collection_permissions` is
  understood from Firefox 140 on desktop but only from 142 on Android, and
  `strict_min_version` is 140. Raising it to 142 would clear the warning at the cost of
  locking out Firefox ESR 140. Since the add-on declares no `gecko_android` support and has
  never been tested on mobile, the desktop floor is the one that matters.

AMO's submission checklist calls `UNSAFE_VAR_ASSIGNMENT` a rejection risk, so the dynamic
`import()` it referred to is gone: the content script is bundled with esbuild, unminified,
and the manifest no longer needs `web_accessible_resources` at all.

There are also no `innerHTML` assignments anywhere in the extension; every node is built
with `createElement`/`textContent`, because team and player names come from third-party APIs
and market text is scraped from epicbet. `npm test` asserts both of these against the built
artifacts, so neither can come back unnoticed.

## Notes for the reviewer

Worth pasting into the submission notes:

> No account is needed to test the extension's code paths, but seeing it render requires a
> logged-in epicbet account with a bet on a match currently in play. The extension reads the
> team names from the bet slip, queries a public football statistics endpoint, and draws the
> returned numbers under the bet. It transmits nothing about the user, stores only settings,
> and executes no remote code.
>
> `content/content.bundle.js` is built from `src/content/` with esbuild and is not
> minified. Source and build script: https://github.com/kjartango/sagabet-livestats
