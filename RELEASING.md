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

**1. Bump the version.** In `package.json` *and* `src/manifest.json` — they must match.

```bash
npm test && npm run build
```

**2. Get the Firefox build signed.**

- Go to the [Developer Hub](https://addons.mozilla.org/developers/) → your add-on →
  **Upload New Version**
- Choose **On your own** (this is what keeps it unlisted)
- Upload `dist/sagabet-livestats-firefox-mv2.xpi`
- Wait for signing — unlisted submissions are usually signed within minutes
- **Download the signed `.xpi`** from the Developer Hub. This is not the same file you
  uploaded; it now carries Mozilla's signature

**3. Publish the release**, with the *signed* Firefox file:

```bash
gh release create v<version> \
  <path-to-signed>.xpi \
  dist/sagabet-livestats-chrome.zip \
  --title "v<version>" --notes "..."
```

The signed asset must be named `sagabet-livestats-firefox-mv2.xpi` — `updates.json` links
to it by exact filename.

**4. Point the update manifest at it:**

```bash
node scripts/make-updates-json.mjs
git add updates.json && git commit -m "Release v<version>" && git push
```

Existing installs pick the new version up within a day, or immediately via
`about:addons` → gear → **Check for Updates**.

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
Expect **0 errors**. Two warnings are known and accepted:

- **`MANIFEST_UPDATE_URL` is an error in *listed* mode, not here.** AMO forbids `update_url`
  on catalogue-hosted add-ons because it handles updates itself; self-distribution requires
  it. If you ever switch to listed, that key must come out. Always lint with
  `--self-hosted`, or you'll be chasing an error that doesn't apply.
- **Two `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` warnings.** `data_collection_permissions`
  is only understood from Firefox 140, and `strict_min_version` here is 115. Raising the
  minimum would silence both, at the cost of locking out ESR and any Firefox fork on an
  older base — including, potentially, the Zen build someone is already running. Older
  Firefox simply ignores the key, so the warnings are the cheaper side of that trade.
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
