# Web to Plex — bug candidates (settings, options page, popup)

Scope: `src/options/*`, `src/popup/*`, plus the runtime readers of settings. Commit `b5f1bc7`.
Method: static reading only. Nothing was run. `idx.js` means `src/options/index.js`.
IDs `S#` are separate from the core list (`B#`, `docs/triage/bugs-core.md`); where they overlap, the `B#` is cited.

---

## High confidence

### S1. `idx.js:646-647` — theme changes never reach `__theme`

`getOptionValues` starts with `__theme = JSON.parse(THM.value)` whenever the hidden `__theme` input is non-empty. It is non-empty from the first call onwards:

- `save('builtin.sites', …)` at `idx.js:2269` calls `getOptionValues` while the page loads (`idx.js:486`), which writes `'{}'`.
- `restoreOptions` then writes the stored value into the input (`idx.js:2037`).

`UpdateTheme` (`idx.js:2584-2600`) changes only the in-memory `__theme` object. The next `getOptionValues` (on save, test, `load` or `save`) overwrites it from the stale input before serialising. So changes to `theme:button-shape`, `theme:button-location` and `theme:button-opacity` are lost, and `utils.js:2583-2596` keeps using the old classes.

### S2. `idx.js:646` with `UseLZW` on — options page breaks after reload

When `UseLZW` is on, the stored `__theme` is compressed (`idx.js:655`). `restoreOptions` puts the compressed string into the input, and `JSON.parse(THM.value)` then throws `SyntaxError`.

Every later `getOptionValues` throws. That includes every `load()`/`save()` (`idx.js:473, 486`), every service test (`idx.js:792, 894, 1010…`) and Save itself. The help text warns "may cause data loss", but the real effect is that the page cannot save at all.

### S3. `plugn.js:498` vs `idx.js:2241, 2253` — `tabchange` consent key never matches

The options page stores consent as `builtin_<name>` (e.g. `builtin_imdb`, `builtin_googleplay`). `tabchange` calls `GetConsent(ali, …)` with `ali = TLDHost(url.host)` (e.g. `imdb.com`, `play.google.com`). It reads `builtin_imdb.com`, which is always `undefined`, and returns at `plugn.js:500`.

Only the `SCRIPT`/`PLUGIN` message path (`plugn.js:591, 608`) uses the short name and matches. The tab-activation and tab-update injection path is therefore dead. This compounds core B11.

### S4. `idx.js:31-202` — the two "Quality Profile Type" selects are not saved

`medusaQualityProfileType` (`idx.html:430`) and `sickBeardQualityProfileType` (`idx.html:574`) are missing from `__options__`. After a reload they reset to index 0.

The refresh test then lists that type's profiles (`idx.js:1292-1295, 1418-1421`). If the saved `…QualityProfileId` belongs to the other type, `quality.value = QualityProfileID` (`idx.js:1317, 1444`) selects nothing. The next Save then fails with "Select a quality profile for Medusa/Sick Beard" (`idx.js:1700-1705`).

### S5. `idx.js:1969-1996` — Save after "Reset" throws

`saveOptionsWhileResetting` calls `OptionsSavedMessage()` (`:1982`), which is defined only inside the other two save functions. On error it also uses an undefined `data` (`:1979`). Both throw `ReferenceError` inside the storage callback, so `UPDATE_CONFIGURATION` (`:1985`) is never sent.

This path also writes no `proxy`, `servers` or `IGNORE_PLEX`. That leaves:

- a stale `servers` entry from before the reset (storage `set` merges);
- no `proxy`, which `utils.js:1760-1762` dereferences (core B41).

### S6. `idx.js:874, 990, 1120, 1249, 1375, 1510` — a missing token crashes the test

Each `get<Svc>` returns a `Notification` object, not a Promise, when the token is empty. The callers immediately call `.then` on it (`idx.js:912, 1028, 1073, 1158, 1202, 1287, 1336, 1413, 1469, 1544`), which throws `TypeError`.

Each `Get` wraps the call in `try` (`idx.js:972, 1102, 1231, 1357, 1492, 1570`), so the user sees a raw `TypeError` toast instead of "Invalid <Svc> token". The `Notification` toast from `get<Svc>` is shown as well, and `LoadingAnimation` is cleared only by the catch.

### S7. `idx.js:823` — the Ombi test failure path throws

`enabled.parentElement.setAttribute('disabled')` has no second argument, which throws `TypeError: 2 arguments required`. That throw replaces the `throw new Error('Ombi error […]')` on the next line, so the user sees the wrong error.

### S8. `idx.js:577-585` — an empty server list shows as success

`getServers(...).then((servers = []) => …)`: `servers` is always an array, so `!servers` is false.

- An account with no servers gets the ✓ marker, `in-use=true`, and an enabled Save.
- `MARKERS[+!servers]` (`:581`) is always `MARKERS[0]` (yes).

### S9. `idx.js:1521` — the CouchPotato test ignores Basic auth

`headers` (with `Authorization`) is built at `:1512-1519` but not passed to `fetch`. CouchPotato behind Basic auth always fails the test. This mirrors core B30 for Watcher pushes.

### S10. `idx.js:955` — `watcherStoragePaths` is not an array

The test stores `JSON.stringify(path || { path: '[Default Location]', id: 0 })`, which is a string or an object. `utils.js:378` parses it, and `utils.js:494` calls `.map` on it. With Watcher and `PromptLocation` on, the prompt throws `TypeError`.

### S11. `idx.js:2229` — the multi-URL built-in ("Web to Plex") uses `pid`, but the handler reads `bid`

The handler at `idx.js:2274` reads `bid`, so it gets `null`. It then saves `permission:null`, `script:null` and `builtin:null` (`:2280-2290`), and `builtin_sites[null]` throws at `:2279`.

### S12. `idx.js:2764` — `#!/~save` posts to the wrong window

`window.postMessage({ type: 'INITIALIZE' })` targets the hidden iframe's own window, and nothing handles `INITIALIZE` on `window` messages anyway (`utils.js:3302-3343`). The comment-intended re-initialise never happens.

---

## Medium confidence

### S13. `idx.js:217, 643-654` — `__caught` is rebuilt from the session only

`__caught` starts as empty arrays and is never seeded from storage. `getOptionValues` overwrites the hidden input with the in-memory copy (`:654`). Every Save therefore replaces the stored `__caught` with only the IDs that this page's test charges have collected so far. Those charges are asynchronous (`idx.js:837-852, 963-968, …`), so a quick Save drops IDs. IDs added by content scripts through `CAUGHT.bump` (`utils.js:1207-1229`) are lost too.

### S14. `idx.js:510` + `xml.js:52-64` — a single `<Device>` is not an array

`_parse` turns repeated child nodes into arrays only from the second instance onwards. An account whose `resources` response has exactly one `Device` gives an object, and `data.Device.filter` throws. The `/^\s*Invalid/i.test(data)` check (`:507`) runs on an object too.

### S15. `idx.js:1054, 1099, 1184, 1228, 1317, 1352, 1444, 1487-1488` — prompt defaults lag one save

`__<svc>Quality` and `__<svc>StoragePath` are written only during the refresh tests, using the values loaded from storage. They are never updated when the user changes the select. The `Prompt` defaults (`utils.js:391-406`) are therefore the previous save's choices.

### S16. `idx.js:1586-1592, 1711, 1773` — an insecure proxy URL leaves the page stuck

`HandleProxySettings` throws a `Notification` object. In `saveOptions` this happens after `LoadingAnimation(true)` (`:1711`) and after the `storage.set({ ClientID })` (`:1712`), so the spinner stays and the save is half-applied.

`Recall.GetIPAddress` (`:2870`) throws the same object, unhandled, on every page load.

### S17. `idx.js:2483-2503` — "Reset" does not remove data

The help text says "This will remove all of your data", but the handler only resets inputs. The save (S5) uses `storage.set`, which merges, so these all survive:

- `servers`, `proxy`, `ClientID`, `plexURLRoot`;
- `~/cache/*`;
- the localStorage site keys.

### S18. `idx.js:2760-2765` + `utils.js:993` — the hidden-iframe save can prompt or save without Plex

`sFrame` loads `options/index.html#!/~save` into a hidden iframe on the visited site. After 1 s, `saveOptions` runs. If `performPlexTest` (`:2060`) has not filled `preferredServer` by then, `confirm('Continue without a Plex server?')` (`:1640`) appears from the hidden iframe. If the user confirms, the save takes the `IGNORE_PLEX=true` path.

### S19. `idx.js:528, 556, 1661, 1707-1712` — `ClientID` misuse

- `tryPlexLogin` sends `X-Plex-Client-Identifier: null` (`:528`); `ClientID` starts `null` (`:206`).
- After login, `ClientID` is set to the **auth token** (`:556`, also `:697`).
- At save it becomes the server's `clientIdentifier` (`:1661`), so `servers[0].id = ClientID` (`:1784`).
- The stored `ClientID` (`:1712`) is never read.

### S20. `idx.js:1873-1897` — `saveOptionsWithoutPlex` skips CouchPotato URL normalisation

`couchpotatoURLRoot` gets no trailing slash or scheme (compare `saveOptions` `:1743-1745`). `plugn.js:174` and `utils.js:1121` add `/api/…` safely, but the "open CouchPotato" link `utils.js:2245` (`couchpotatoURLRoot + 'movies'`) breaks.

### S21. `idx.js:2329-2353, 2382-2402` — multi-domain plugins only manage the first host

"Indomovie" lists three hosts. `plugin_sites` gets all three (`:2337`), but only the first renders a checkbox (`:2339`), and the handler saves `script:`/`permission:`/`builtin:` only for that first `pid`. The other two domains can never be enabled.

### S22. Credentials storage

- Basic-auth passwords and API tokens are saved in plain text to `chrome.storage.sync` (`idx.js:1800`), which syncs them to the Google account.
- `background.js:173` copies them into `localStorage` (`configuration`).
- "Generate Data" exports them base64-encoded (`idx.js:2463`).
- The `password` input type is applied only after a value has been saved (`idx.js:2045`). Passwords are shown in clear text while typing.

### S23. `idx.js:2861-2942, 2975-2981, 2850-2857` — network calls on every page open

Opening the options page always calls `https://check.torproject.org` (IP check) and `https://api.github.com/...` (version check). The IP check goes through the user's proxy if one is set.

### S24. `idx.js:801` etc. — the test rewrites the user's URL field

Each test writes the normalised URL back into the input (`path.value = …`) without a trailing slash. The Save normaliser then adds one. This is harmless, but `${root}api` (no slash) is used by the tests and `${root}api` with a slash at runtime. Any root ending in `\` takes the `endingSlash` branch (`:1670`) and gets a backslash.

---

## Low confidence / hygiene

### S25. `idx.js:2536-2546` — LZW toggle work discarded

The handler computes compressed or decompressed `options` and then never saves or uses them.

### S26. `idx.js:209` — logging mode is fixed at load

`terminal` is chosen from the HTML default (`checked`), before `restoreOptions` runs. The options page therefore always logs.

### S27. `idx.js:436` — `eval` in `addListener`

There is no external input (see `FEATURES.md` §6). Still:

- pre-existing inline handler code would run at registration;
- closures are lost;
- `on*` properties are overwritten;
- it requires `'unsafe-eval'`, which blocks MV3.

### S28. `idx.js:473, 486` — `load`/`save` call `getOptionValues` for an unused variable

This adds side effects to every `localStorage` access: the hidden inputs are rewritten and S2 throws.

### S29. `idx.js:688` — `json.servers.length` when `servers` is missing

This throws `TypeError` in "Attach to Ombi" when Ombi has Plex enabled but no servers.

### S30. `popup/index.js:37-43` — unescaped manager URL in `innerHTML`

This is self-XSS from the user's own setting. The extension page CSP (`manifest.json:18`) blocks inline script.

### S31. `popup/index.html` — tiles missing or extra

- The tiles for `google`, `toloka`, `myanimelist`, `indomovie`, `snagfilms` and `freemoviescinema` are missing.
- `showrss` is listed although it has no site script or manifest entry (also `idx.js:2186`).

### S32. `idx.js:2602` — initial `UpdateTheme` call uses inverted checkbox logic

The `(self.checked + '') != a` test is written for `mouseup`, which fires before the toggle ("backwards; fires late", `:2594`). On the synthetic call 1 s after load, a checked box fails that test and falls through to `delete __theme[value]`. This is masked by S1.

### S33. `idx.js:2469-2480` — "Erase cache" also erases script permissions

It deletes `~/cache/has/*` and `~/cache/get/*` (the permissions granted to cloud scripts), which the label does not mention. It then calls `saveOptions`, which can show the S18 confirm.
