# Phase 3: MV3 core

Chrome 153 and Edge 154 no longer load the MV2 build, so this phase makes the extension load on Chromium again while
keeping its behaviour. Nothing new is added here: every step is a move, proven by parity against the MV2 build running
in Firefox (which still loads it).

## Target shape

```
src/
  manifest.json            MV3: service worker, action, host_permissions, optional_host_permissions
  background/index.js      service worker (ES module, bundled to background.js)
  background/router.js     message router: allowlist of types, sender.id check
  background/services/*.js one module per service (plex, radarr, sonarr, medusa, sickbeard, ombi, watcher, couchpotato)
  lib/site-runner.js       content side: replaces plugn.js prepare() + handle() (bundled to site-runner.js)
  lib/*.js                 shared helpers with unit tests (tests/*.test.mjs)
  cloud/<site>.js          site scripts, now shipped as content scripts (no remote loading)
  sites/<site>/index.js    boot stub: RunSite(script, { alias, type })
  utils.js                 unchanged except: POPULATE/NO_RENDER/INITIALIZE handled by a local function the runner calls
  options/, popup/         unchanged except eval removal and permission requests
```

`plugn.js` is deleted. `history-hack.js` becomes a `world: 'MAIN'` content script.

## Steps and jobs

| Step | Job | Output | Parity check |
|---|---|---|---|
| 3a | `w2p-p3-runner` | `lib/site-runner.js` + unit tests; `cloud/itunes.js` top-level `return` removed | For every `cloud/*.js` with a saved fixture page, the runner yields the same POPULATE payload as `prepare` + `handle` in the MV2 build |
| 3b | `w2p-p3-worker` | `background/` service worker; `background.js` handlers moved unchanged into service modules; router with allowlist | Each `PUSH_*` / `SEARCH_PLEX` / `CHARGE_*` request produces the same fetch (URL, method, headers, body) and the same reply, with fetch intercepted |
| 3c | `w2p-p3-csp` | `addListener` without `eval`; `furnish` without `new Function`; no `'unsafe-eval'` | Options page and button behave the same; zero CSP errors in console |
| 3d | manager | MV3 manifest, build bundles, content-script entries per site, `world: 'MAIN'` history hook, `optional_host_permissions` request on Save | Build loads in Chrome; `w2p-live-*` jobs on a few real sites |

3a, 3b and 3c are independent and run in parallel. 3d lands after them.

## Contracts

### Site runner (`RunSite`)

`RunSite(script, { alias, type })` reproduces the `prepare` + `handle` pipeline in the page:

1. Consent: read `builtin_<alias>` or `plugin_<alias>` from storage. `false` stops (same as `'<allowed>'`). Missing
   means allowed (current default; T2 stays open for the registry in Phase 4).
2. URL: convert `script.url` with the same glob rules as `prepare` and test `location.href`; no match stops.
3. Readiness: if `script.ready` exists, call it (await if async). Falsy retries after `script.timeout || 1000` ms.
   `UseMinions` runs `script.minions()` before `init`.
4. Result handling, as `handle` does: a negative number removes the buttons (NO_RENDER); a positive number retries
   after that many ms; a string `Title (YYYY):type` becomes `{ type, title, year }`; an array of two or more items
   populates a list; one item or an object populates one item, after the punctuation normalisation and `+year`.
5. Populate locally: call the `utils.js` handler with the same request object the MV2 build sent with
   `tabs.sendMessage`, so `utils.js` needs no other change.
6. Re-run on `popstate`, `pushstate-changed` and `locationchange`, replacing the `$INIT$` round trip.
7. `// "Name" requires: a, b` comments become a `script.requires` array; the runner calls the existing `Require`
   prompt (`helpers.js`) with it. Only `cloud/webtoplex.js` uses this today.

### Service worker router

- One `chrome.runtime.onMessage` listener. `sender.id !== chrome.runtime.id` is rejected.
- A table maps each type to its handler; unknown types are ignored, not answered.
- Handlers that reply asynchronously return `true`; each replies exactly once.
- No `localStorage`, `window` or long-lived state: configuration comes from `chrome.storage` on demand.
- Context menus are created in `runtime.onInstalled`; the last item details (`external`) live in
  `chrome.storage.session`.

### Permissions

- `host_permissions`: `https://plex.tv/*` only (account and server list); everything else is the content-script matches.
- `optional_host_permissions: ['*://*/*']`: the options page requests the origin of each service URL and each Plex
  server connection (`*.plex.direct` or the user's own host) when the user tests or saves it. The worker checks `chrome.permissions.contains` before fetching.
- `<all_urls>` and the `*://*/*` catch-all content script go away. Third-party plugins register with
  `chrome.scripting.registerContentScripts` after the user grants their host (Phase 4).

## Parity harness

The subordinate's Firefox WebDriver BiDi harness (`w2p-live-recheck-1/harness.tgz`) runs the MV2 build. Phase 3 adds a
Playwright Chromium runner for the MV3 build against the same saved fixture pages (`tests/fixtures/<site>.html`), and a
diff of the POPULATE payloads and requests the two record.

## Status

| Step | State |
|---|---|
| 3a runner | ✅ `c38676d` |
| 3b worker | ✅ `ef5cad9` |
| 3c CSP | ✅ `c2cbdc3` |
| 3d wiring | ✅ Loads in headless Chromium 1194: the service worker starts; on synthetic TMDb and Letterboxd pages the runner posts POPULATE, `utils.js` renders the button, and `SEARCH_PLEX` is answered through the router; no CSP or eval errors. Live jobs on real sites pending. |

Notes from 3d:

- The catch-all `*://*/*` entry (`sites/common.js`, third-party plugins) is gone; plugins come back through
  `chrome.scripting.registerContentScripts` in Phase 4. Until then `cloud/plugin/*` sites do not run.
- Shana Project's built-in stub had no `cloud/shanaproject.js` (T4); it now loads `cloud/plugin/shanaproject.js`.
- `utils.js` still needs saved options (`__caught`, `__theme`) before it renders, as in MV2; a fresh install shows
  nothing until the options page is saved once.
- The MV2 `background.js` moved to `tests/fixtures/mv2/` as the parity reference; `plugn.js` is deleted.
