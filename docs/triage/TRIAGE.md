# Triage

Verdicts for every bug candidate from Phase 1. Candidate lists: `bugs-core.md` (B), `bugs-settings.md` (S), `bugs-sites.md` (T).

Phase rules (manager-confirmed):

- `plugn.js` and MV2 background-page plumbing are fixed by the Phase 3 rewrite, not patched (phase `3+`).
- `background.js` service handlers are fixed now (phase `2`); they move by parity later, so the fix moves with them.
- Options-page bugs wait for Phase 5 unless they corrupt stored data the runtime reads or block saving; then phase `2`.

## Core (B)

Source list: `docs/triage/bugs-core.md`. Code: branch `claude/extension-rewrite-features-b4afna` @ `701713a` (`src/` unchanged since `cb7ec2a`). No code was changed.

**Verdicts**

| Verdict | Meaning |
|---|---|
| `bug` | Confirmed from the code. |
| `not-a-bug` | The code or the data flow rules it out. |
| `dead-code` | Unreachable or unused. |
| `live-check` | The code alone cannot decide; the reason says what to observe. |

**Size:** `S` ≤ 10 lines · `M` · `L`.

**Phase:** `2` = fix now in isolation · `3+` = fix lands with the rewrite.

**Phase rule applied**

- Phase `3+`:
  - Everything in `plugn.js` (remote loading, `prepare`, `handle`, `tabchange`, `processMessage`).
  - Anything that exists only because of the persistent MV2 page: `localStorage` in the background, startup-time globals, `return true` message plumbing.
  - Manifest changes (the manifest is rewritten for MV3).
- Phase `2`:
  - Service-handler logic in `background.js` (`Push_*`, `Search_Plex`, the context menu). It moves to the service worker or to service plugins by parity in Phases 3–4. Fixing it first means parity tests pin the correct behaviour.
  - `utils.js` logic.

**Security flag:** `security` marks B15, B21, B60 and the extra item X1 (remote `<script>` at `utils.js:2643`).

### Table

| ID | Verdict | Reason | Size | Phase | Flag |
|---|---|---|---|---|---|
| B1 | bug | `utils.js:1657`. The class `[^…¡¿-ÿ…]` omits `¢-¾`, so `¢£¥©®°±` etc. are stripped from titles (used at `:1676, 1800`). The `0`–`8` and `, ` members are harmless. | S | 2 | |
| B2 | bug | `utils.js:2532-2534`. Overwriting `CAUGHT` drops `has`/`bump`/`charge` (`:1200-1242`), so `CAUGHT.has` at `:2546` throws; `COMPRESS = options.UseLZW` reads the item, not the config. Fix: delete the 3 lines. | S | 2 | |
| B3 | bug | `background.js:136` calls `handleOptions`; the local is `handleConfiguration` (`:108`). `ReferenceError` on the `lastError` path. | S | 2 | |
| B4 | bug | `background.js:744`. `!~promises.length` is false for any real length, so when all connections fail the code reaches `Promise.race([])`, which never settles and `Search_Plex` (`:841`) never replies. | S | 2 | |
| B5 | bug | `background.js:902, 908` pass `item.href`; `OnClickData` has no `href`. `url` (`:892`) is unused. Downloads get `url: undefined`. | S | 2 | |
| B6 | bug | `background.js:857`. `external` starts `{}` (`:4`), so `external.ID_PROVIDER.slice` throws before the first `SEARCH_FOR`. | S | 2 | |
| B7 | bug | `background.js:647`. The fallback `{"data":{},message:"",result:""}` is invalid JSON (unquoted keys); an empty body makes it throw. | S | 2 | |
| B8 | bug | `background.js:691-694`. The "Invalid TMDbID/TVDbID" `sendResponse` has no `return`; the POST at `:696` still runs with a `null` ID. | S | 2 | |
| B9 | bug | `utils.js:3186-3187`. The early `return` is inside the Promise executor, so the outer promise never settles. `PROMISED_WORK[uuid]` stores `resolve()`'s `undefined` (`:3196-3201`), and `IN_WORK` is never cleared. A repeat search hangs. | S | 2 | |
| B10 | bug | `plugn.js:706-713`. `refresh` re-calls itself every 1 s with the same stale `change` when `status != 'complete'`; there is no exit. The timers accumulate. | S | 3+ | |
| B11 | bug | `plugn.js:495-496`. For plugins it reads `plugin:<host>`; options writes `script:<host>` + `builtin:<host>=false` (`options/index.js:2392, 2401`). Also see settings S3: `tabchange` consent uses `builtin_<host>`, which never matches. | S | 3+ | |
| B12 | bug | `plugn.js:536, 681`. `insertCSS({ code })` has no tab ID, and `:679-681` runs after every `options` message, fetching `styles/undefined.css`. | S | 3+ | |
| B13 | bug | `plugn.js:544, 596-626`. It uses the global `TAB`, not `sender.tab`. | S | 3+ | |
| B14 | bug | `plugn.js:550-560`. A synchronous `callback(null)` can answer `SEARCH_PLEX` before `background.js` does. | S | 3+ | |
| B15 | bug | `plugn.js:591-604` + `sites/common.js:5`. A `PLUGIN` fetch for every page without a stub. Correction: remote only when `DeveloperMode` is off or unsaved (`plugn.js:576-580`); default-on (`options/index.html:956`) uses local `cloud/plugin/<x>.js`, which still 404s for unknown hosts. Consent blocks only on `=== false` (`plugn.js:295`), so unknown names run (sites T2). | M | 3+ | security |
| B16 | bug | `utils.js:17`. `result.push` is a `ReferenceError` (should be `results`); `results` is seeded with the keys (`:14`). | S | 2 | |
| B17 | bug | `utils.js:40-41`. `instanceof String` misses primitives, and `delete configuration[key]` uses an undeclared `key`. | S | 2 | |
| B18 | bug | `utils.js:1070`. `o.plexURL.replace` throws when `plexURL` is unset, and the promise never settles. The computed URL is written to `options`, not `o` (`:1061-1070`). Same pattern at `plugn.js:126-137` (3+). | S | 2 | |
| B19 | not-a-bug | `__caught` is always written by every options save (`options/index.js:145, 651-654`), and `options()` rejects before `:1196` when no save exists (`utils.js:1051-1053`). Only a hand-edited or imported config could lack it. | — | — | |
| B20 | bug | `utils.js:1878-1884` (also `:1946-1952, 2019-2025`). The loop assigns `f` every pass with no `break` and reads `o.title` on the array; it returns the array or a boolean. A `true` result then throws at `:2094` (`'externals' in true`). | M | 2 | |
| B21 | bug | `utils.js:3302-3348`. There is no `event.source`/origin check. Any frame can post `PERMISSION` (spoofed prompt), `SEND_VIDEO_LINK` (download URL) or `NOTIFICATION`. | M | 2 | security |
| B22 | bug | `utils.js:3481`. `(… ) \|\| true` is always truthy, so `wait` never polls. | S | 2 | |
| B23 | bug | `utils.js:3711`. `empty: !media.length` on an Element is always `true`. | S | 2 | |
| B24 | bug | `utils.js:2256`. `!IMDbID \|\| !TMDbID` rejects single-ID items; it should be `&&`. | S | 2 | |
| B25 | bug | `plugn.js:395-399`. The reassignment changes the parameter `instance`, not the module variable, and re-injects the cached failing code until the 1e6 ms cache clear. | S | 3+ | |
| B26 | bug | `plugn.js:420`. A one-argument `replace` relies on `RegExp.$1-3`; when nothing matches, the values are stale. | S | 3+ | |
| B27 | bug | `plugn.js:497`. `code` is an implicit global (not in the `let` at `:474-478`). | S | 3+ | |
| B28 | bug | `background.js:306`. For `data = []` the guard passes and `body` stays `undefined`. | S | 2 | |
| B29 | bug | `background.js:687`. `lastestSeason` should be `latestSeason`. | S | 2 | |
| B30 | bug | `background.js:254`. `fetch` is called without the `headers` built at `:240-244`, so Watcher Basic auth is ignored. | S | 2 | |
| B31 | bug | `background.js:215, 256, 292, 382, 462, 611, 702`. A mid-chain `.catch` returns `undefined` and the next `.then` throws; a second `sendResponse` is ignored. Noise, and `Push_Ombi` calls `undefined.text()`. `:536` is in the dead `addMedusa` (B51). | S | 2 | |
| B32 | dead-code | `utils.js:1347-1359`. `try` only wraps `setTimeout`; the `catch` fetch is unreachable. | S | 2 | |
| B33 | bug | `utils.js:1220, 1240`. The `filter` result is discarded, so the number filter never applies. | S | 2 | |
| B34 | bug | `utils.js:227, 230`. Bits are compared to `QUOTA_BYTES` (bytes), so the cache erases about 8× early. Writing 3 sync keys per search (`:2159-2161`) risks the sync write-rate limit. | S | 2 | |
| B35 | bug | `utils.js:3370, 3387` (also `options/index.js:3033, 3050`, `popup/index.js:144, 161`). `[\x32]` is the digit `2`, not a space. | S | 2 | |
| B36 | bug | `background.js:21, 186, 210, 231`. `mode: 'no-cors'` always gives an opaque response (Fetch spec), so `.json()` rejects and `Authorization` is stripped. The background has `<all_urls>`, so `cors` works. To observe: CouchPotato over `http://` fails with a JSON parse error. | S | 2 | |
| B37 | live-check | `manifest.json:72` + `:188`. Code cannot decide whether Chrome re-runs `utils.js` for a second matching entry. Observe on imdb.com, with DevTools on the extension's content-script context: whether `SyntaxError: Identifier 'configuration' has already been declared` appears. | S | 3+ | |
| B38 | live-check | `manifest.json:51, 183`. `:51` puts a fragment in the pattern, which never matches; `:183` matches only `/desktop/…`. Observe the current Plex web URL (`/desktop/#!/…` vs `/desktop#!/…`) and whether `sites/plex` and `download/plex` load. Manifest is rewritten in MV3. | S | 3+ | |
| B39 | bug | `utils.js:3565-3583`. Once a callback is registered (the setter at `:3589-3605`, used by the `prepare` code at `plugn.js:376`), every `href` change runs `open(to, '_self')`, a full reload. Unregistered callbacks also add a `beforeunload` with `preventDefault`. Removing `:3582` is isolated. | S | 2 | |
| B40 | bug | `utils.js:1176-1182`. `Update.running` is `null`, so it loads `has/null`. When `allowed` is true and `permiss` is not an array (the object form saved by `GRANT_PERMISSION`), `permiss.join` throws. | S | 2 | |
| B41 | bug | `utils.js:1760-1762`. `__CONFIG__.proxy` is missing after a Reset save (settings S5) or for configs saved before proxy support. Every `Identify` throws. | S | 2 | |
| B42 | bug | `utils.js:1597`. `__domains.split` throws if unset. `__domains` is written only by `restoreOptions` (`options/index.js:2085`), so a save made through "Restore Data" or Reset can lack it. | S | 2 | |
| B43 | bug | `utils.js:2066, 2103`. `json[tr].length` is read when `tv_results` is absent. | S | 2 | |
| B44 | bug | `utils.js:2353, 2412`. `.filter(n => n)[0].path` throws when the saved path ID is not in the list. | S | 2 | |
| B45 | bug | `utils.js:290`. It delays by elapsed time (`now - start`), not remaining time (`stop - now`). The same pattern is at `options/index.js:252`. | S | 2 | |
| B46 | bug | `utils.js:1734`. `A \|\| B \|\| C && (rerun \|= 8)`: the bit is set only via `C`. The `0b1000` bit gates `manable` on reruns (`:1656`), so the IMDb and `*` paths retry the manager search. | S | 2 | |
| B47 | bug | `plugn.js:58-64, 240-246, 498`. When the configuration rejects, `PLUGN_CONFIGURATION` stays undefined and every `tabchange` and storage change throws. | S | 3+ | |
| B48 | bug | `plugn.js:642-645` reads `request.instance`/`request.found`; `Update` nests them under `options` (`utils.js:1026-1029, 3274`). | S | 3+ | |
| B49 | bug | `plugn.js:648` needs `options.grant_permission`, which is never sent (`utils.js:871`). | S | 3+ | |
| B50 | bug | `background.js:1027` returns `true` for handlers that never reply (`OPEN_OPTIONS`, `SEARCH_FOR`, `SAVE_AS`, `DOWNLOAD_FILE`, `UPDATE_CONFIGURATION`), so the sender's callback gets "message port closed". This is message-router plumbing. | S | 3+ | |
| B51 | dead-code | `background.js:523-594`. `addMedusa` has no route. | S | 2 | |
| B52 | dead-code | `background.js:470, 544`. The Medusa `body` is computed and unused; the POST sends `{ id: { tvdb } }`. | S | 2 | |
| B53 | not-a-bug | `background.js:148, 152`; `plugn.js:16, 20`. `private` is legal in sloppy classic scripts. It only matters for an ES-module service worker, where the code is rewritten anyway. | — | 3+ | |
| B54 | bug | `background.js:915` logs `'From: ' + sender` as `[object Object]`. | S | 2 | |
| B55 | bug | `background.js:871, 876, 881, 885-888`. Titles go into query strings unencoded; `&`, `#`, `?` break the search URL. | S | 2 | |
| B56 | dead-code | `plugn.js:429-430` is unreachable (numbers return at `:406-414`). | S | 3+ | |
| B57 | not-a-bug | `utils.js:3363`. `[-1]` is always `undefined`, but `\|\| x` returns the accumulated total, so `from36` gives the correct value. | — | — | |
| B58 | dead-code | `utils.js:3921-3926`. The fallback calls `chrome.tabs`, which content scripts lack, so it can never succeed. `throw __error, _error` drops the first error. It is removed with `new Function`. | S | 3+ | |
| B59 | bug | `helpers.js:27`; `plugn.js:53`; `utils.js:241, 250, 1228`. `await` on callback-style `storage.set`/`remove` does not wait. Fixed by the MV3 promise API. | S | 3+ | |
| B60 | bug | `utils.js:1646-1647`. A hard-coded TMDb key and the literal OMDb key `'PlzBanMe'` ship in the extension; `theimdbapi.org` (`:1754-1755`) appears defunct. Removing the fallback changes behaviour, so it is the owner's call. | S | 3+ | security |
| B61 | live-check | `utils.js:1716-1727`, `background.js:290, 329, 380, 409` use `/api/movie` and `/api/series` (v1/v2). Observe the owner's Radarr/Sonarr versions: whether `GET <root>api/movie` returns 200 or 404 (v3 serves `/api/v3/`). Only read requests; never add. | M | 3+ | |

### Extra (not in `bugs-core.md`, flagged by the brief)

| ID | Verdict | Reason | Size | Phase | Flag |
|---|---|---|---|---|---|
| X1 | bug | `utils.js:2643`. "Open Plex It!" appends `<script src="//webtoplex.github.io/plex.it.js">` to the visited page, which runs remote code in the page's main world with page privileges. It is protocol-relative (http on http pages), and MV3 forbids remote code. | S | 2 (remove or bundle) or 3+ (if Plex It! is kept) | security |

### Phase 2 fix list (phase `2` + verdict `bug` + size `S`), ordered by impact

1. ~~**B9.** Repeat Plex searches hang forever (`utils.js:3186-3201`).~~ Fixed (`w2p-fix-plex`).
2. ~~**B2.** Sick Beard push always throws and breaks `CAUGHT` for the page (`utils.js:2532-2534`).~~ Fixed (`w2p-fix-services`).
3. ~~**B4.** Plex search never replies when every connection fails (`background.js:744`).~~ Fixed (`w2p-fix-plex`).
4. ~~**B39.** SPA navigations force full reloads and can show "Leave site?" (`utils.js:3582`, `:3573-3576`).~~ Fixed (`w2p-fix-utils-a`).
5. ~~**B41.** A missing `proxy` breaks every `Identify` (`utils.js:1760-1762`).~~ Fixed (`w2p-fix-plex`).
6. ~~**B42.** A missing `__domains` aborts `INITIALIZE` (`utils.js:1597`).~~ Fixed (`w2p-fix-plex`).
7. ~~**B18.** An unset `plexURL` stalls `INITIALIZE`, and the computed URL is lost (`utils.js:1061-1072`).~~ Fixed (`w2p-fix-plex`).
8. **B36.** CouchPotato over HTTP always fails (`background.js:21` and its callers).
9. ~~**B8.** Ombi POSTs with a null ID after reporting an error (`background.js:691-696`).~~ Fixed (`w2p-fix-services`).
10. ~~**B5.** Context-menu download passes `url: undefined` (`background.js:902, 908`).~~ Fixed by the manager.
11. ~~**B6.** Context-menu click before any search throws (`background.js:857`).~~ Fixed by the manager.
12. ~~**B3.** Configuration fallback `ReferenceError` (`background.js:136`).~~ Fixed by the manager.
13. ~~**B30.** Watcher pushes ignore Basic auth (`background.js:254`).~~ Fixed (`w2p-fix-services`).
14. ~~**B24.** CouchPotato rejects items with a single ID (`utils.js:2256`).~~ Fixed (`w2p-fix-services`).
15. ~~**B28.** Radarr posts an empty body for an empty lookup (`background.js:306`).~~ Fixed (`w2p-fix-services`).
16. ~~**B29.** Ombi `latestSeason` typo (`background.js:687`).~~ Fixed (`w2p-fix-services`).
17. ~~**B7.** Sick Beard fallback JSON is invalid (`background.js:647`).~~ Fixed (`w2p-fix-services`).
18. ~~**B44.** Stale storage-path ID throws on push (`utils.js:2353, 2412`).~~ Fixed (`w2p-fix-services`).
19. ~~**B43.** TMDb `find` with only `movie_results` throws (`utils.js:2066, 2103`).~~ Fixed (`w2p-fix-utils-a`).
20. ~~**B40.** Permission filter throws on object-form permissions (`utils.js:1176-1182`).~~ Fixed (`w2p-fix-utils-a`).
21. ~~**B1.** `UTF_16` class strips `¢`–`¾` from titles (`utils.js:1657`).~~ Fixed (`w2p-fix-utils-a`).
22. ~~**B16.** `HELPERS_STORAGE.get([...])` `ReferenceError` (`utils.js:17`).~~ Fixed (`w2p-fix-utils-b`).
23. ~~**B17.** `HELPERS_STORAGE` string keys and undeclared `key` (`utils.js:11, 40-41`).~~ Fixed (`w2p-fix-utils-b`).
24. ~~**B34.** Cache quota check off by 8× (`utils.js:227-230`).~~ Fixed (`w2p-fix-utils-b`).
25. ~~**B55.** Unencoded titles in context-menu search URLs (`background.js:871-888`).~~ Fixed by the manager.
26. ~~**B31.** Mid-chain `.catch` continues the chain (`background.js` 7 sites).~~ Fixed (`w2p-fix-misc`).
27. ~~**B22.** `wait()` never waits (`utils.js:3481`).~~ Fixed (`w2p-fix-utils-b`).
28. ~~**B23.** `queryBy(element).empty` is always true (`utils.js:3711`).~~ Fixed (`w2p-fix-utils-b`).
29. ~~**B45.** Notification queue delay uses elapsed time (`utils.js:290`).~~ Fixed (`w2p-fix-utils-b`).
30. ~~**B46.** `rerun` flag precedence (`utils.js:1734`).~~ Fixed (`w2p-fix-utils-b`).
31. ~~**B33.** Discarded `filter` results (`utils.js:1220, 1240`).~~ Fixed (`w2p-fix-utils-b`).
32. ~~**B35.** BWT guard tests `'2'`, not a space (`utils.js:3370, 3387` + copies).~~ Fixed (`w2p-fix-utils-b`).
33. ~~**B54.** Log shows `[object Object]` (`background.js:915`).~~ Fixed by the manager.

Phase 2 items that are not size S: ~~**B20**~~ and ~~**B21**~~ fixed (`w2p-fix-utils-a`); B21 keeps a phase 3+ remainder (instance secret; a same-tab page can still post).

Phase 2 `dead-code` removals (size S): ~~B32, B51, B52~~ removed (`w2p-fix-misc`).

### Count check

B1–B61 each appear once in the table: 61 rows, plus X1.

| Verdict | Count |
|---|---|
| `bug` | 50 |
| `not-a-bug` | 3 (B19, B53, B57) |
| `dead-code` | 5 (B32, B51, B52, B56, B58) |
| `live-check` | 3 (B37, B38, B61) |

## Settings (S)

**Source list:** `docs/triage/bugs-settings.md`.
**Code:** branch `claude/extension-rewrite-features-b4afna` @ `701713a`; `src/` is unchanged since `cb7ec2a`. No code was changed.

**Legend**

- **Verdict:**
  - `bug`: confirmed from code.
  - `not-a-bug`: ruled out.
  - `dead-code`: unreachable or unused.
  - `live-check`: code cannot decide.
- **Size:** `S` = 10 lines or fewer · `M` · `L`.
- **Phase:** `2` = fix now · `3+` = fix lands with the rewrite.
- `idx.js` = `src/options/index.js`.

**Phase rule applied**

- Phase 5 replaces the options page with a declarative settings page, and Phases 3–4 delete `plugn.js`. Bugs that live only inside the options page UI or `plugn.js` are therefore `3+`.
- An options-page bug is `2` when it **corrupts or omits stored data that the runtime reads**, or makes the page unusable. Those must be fixed before Phase 5 snapshots the "first-run defaults stored exactly" baseline. Otherwise the parity tests pin broken data.

**Duplicates:** a row marked `dup B#` / `dup S#` / `dup T#` shares its root cause with that ID. The fix is tracked there.

### Table

| ID | Verdict | Reason | Size | Phase | Flag |
|---|---|---|---|---|---|
| S1 | bug | `idx.js:646-647` re-reads `__theme` from the hidden input on every `getOptionValues` call. That overwrites `UpdateTheme`'s in-memory edits (`:2584-2600`), because the input is already non-empty from `:2269` (via `:486`) and restore (`:2037`). The runtime (`utils.js:2583-2596`) keeps the old theme. | S | 2 | |
| S2 | bug | `idx.js:646, 655` with `UseLZW`: the stored `__theme` is compressed, restore puts it in the input, and `JSON.parse` throws. Every `getOptionValues`, `load` and `save` (`:473, 486`) fails, so the page cannot save. | S | 2 | |
| S3 | bug | `plugn.js:498` passes `TLDHost(host)` (e.g. `imdb.com`) to `GetConsent`, which reads `builtin_imdb.com`. Options writes `builtin_imdb` (`idx.js:2241, 2253`). `tabchange` therefore always stops at `:500`. Same root area as B11 (`plugn.js` key mismatch); different keys. | S | 3+ | dup-area B11 |
| S4 | bug | `medusaQualityProfileType` and `sickBeardQualityProfileType` are absent from `__options__` (`idx.js:31-202`). After a reload they reset to index 0. The refresh test then lists the wrong type (`:1292-1295, 1418-1421`), so the saved profile ID cannot be selected and Save refuses (`:1700-1705`). | S | 2 | |
| S5 | bug | `idx.js:1979, 1982`: `saveOptionsWhileResetting` uses an undefined `data` and calls `OptionsSavedMessage`, which is defined only in the other save functions. The `ReferenceError` means `UPDATE_CONFIGURATION` (`:1985`) is never sent. It also writes no `proxy`, which causes B41. | S | 2 | dup-cause B41 |
| S6 | bug | `idx.js:874, 990, 1120, 1249, 1375, 1510`: with an empty token, `get<Svc>` returns a `Notification`, and the callers call `.then` on it (`:912, 1028, 1073, 1158, 1202, 1287, 1336, 1413, 1469, 1544`). The `TypeError` is caught by `try` (`:972, 1102, 1231, 1357, 1492, 1570`), so the user sees a raw error. Options UI only. | S | 3+ | |
| S7 | bug | `idx.js:823`: `setAttribute('disabled')` with one argument throws `TypeError`, which masks the Ombi error. Options UI only. | S | 3+ | |
| S8 | bug | `idx.js:577-585`: the default `servers = []` means `!servers` is never true, and `MARKERS[+!servers]` is always ✓. An account with no servers shows success and Save is enabled. Options UI only. | S | 3+ | |
| S9 | bug | `idx.js:1508-1527`: the `headers` built at `:1512-1519` are not passed to `fetch` (`:1521`). The CouchPotato test ignores Basic auth. Same pattern as B30 (Watcher push). | S | 3+ | dup-pattern B30 |
| S10 | bug | `idx.js:955` stores `watcherStoragePaths` as a string or object. `utils.js:378` + `:494` then call `.map` on it, which throws when Watcher and `PromptLocation` are both on. This is stored data the runtime reads. | S | 2 | |
| S11 | bug | `idx.js:2229` gives the multi-URL built-in a `pid` attribute, but the handler reads `bid` (`:2274`), gets `null`, and `builtin_sites[null]` throws at `:2279`. The "Web to Plex" site toggle has no effect on `script:`/`builtin:` keys. | S | 2 | |
| S12 | bug | `idx.js:2764` posts `INITIALIZE` to the iframe's own window, and no handler for it exists (`utils.js:3302-3343`). The feature is a no-op. It goes away with the hidden-iframe save (S18). | S | 3+ | |
| S13 | bug | `idx.js:217, 643-654`: `__caught` starts empty and every save overwrites the stored value with the IDs this session has collected. That drops IDs added by `CAUGHT.bump` (`utils.js:1207-1229`) and IDs whose charges have not finished. | S | 2 | |
| S14 | bug | `xml.js:52-64` makes an array only on a repeated child. A single `<Device>` is an object, so `data.Device.filter` throws (`idx.js:510`). Code decides this; users with exactly one device are affected. | S | 2 | |
| S15 | bug | `__<svc>Quality` and `__<svc>StoragePath` are written only during refresh tests (`idx.js:1054, 1099, 1184, 1228, 1317, 1352, 1444, 1487-1488`), never on select change. The prompt defaults (`utils.js:391-406`) are always the previous save's values. | S | 2 | |
| S16 | bug | `idx.js:1592` throws a `Notification` after `LoadingAnimation(true)` (`:1711`) and `storage.set({ ClientID })` (`:1712`): a stuck spinner and a partial save. `GetIPAddress` (`:2870`) also throws, unhandled, on every load. Options UI only. | S | 3+ | |
| S17 | bug | `idx.js:2483-2503` only resets inputs, and the save path uses a merging `storage.set`. `servers`, `proxy`, `ClientID` and the cache survive, which contradicts "remove all of your data" (`idx.html:908`). | M | 3+ | |
| S18 | bug | `idx.js:2760-2765` + `utils.js:993`: the hidden iframe calls `saveOptions` after 1 s. If servers are not loaded yet, `confirm()` is raised from a hidden iframe (`idx.js:1640`), and confirming saves `IGNORE_PLEX=true`. | S | 2 | |
| S19 | bug | `idx.js:528` sends `X-Plex-Client-Identifier: null`. `:556` and `:697` set `ClientID` to an auth token. The stored `ClientID` (`:1712`) is never read. Plex login identity is malformed. | S | 3+ | |
| S20 | bug | `idx.js:1873-1897`: `saveOptionsWithoutPlex` skips `couchpotatoURLRoot` normalisation (compare `:1743-1745`). The runtime link `utils.js:2245` breaks without a trailing slash. | S | 2 | |
| S21 | bug | `idx.js:2339`: only the first host of a multi-domain plugin gets a checkbox, so the handler saves keys only for that host. Indomovie's other two domains can never be enabled. Superseded by sites T2: name and key mismatch. | S | 3+ | dup-area T2 |
| S22 | bug | Secrets are stored in plain text in `chrome.storage.sync`, which syncs to the Google account (`idx.js:1800`). They are copied to the background `localStorage` (`background.js:173`), exported as base64 (`idx.js:2463`), and masked only after save (`:2045`). | M | 3+ | security |
| S23 | bug | `idx.js:2851-2857, 2861-2942, 2975-2981`: GitHub and `check.torproject.org` are contacted on every options open, via the proxy when one is set. This is privacy, not correctness. | S | 3+ | security |
| S24 | not-a-bug | Each test strips the trailing slash and the save adds it back (`idx.js:1714-1745`). The runtime uses the saved form. The backslash case only happens for roots that end in `\`, which are not valid URLs. | — | — | |
| S25 | dead-code | `idx.js:2536-2546` computes compressed `options` that are never used. | S | 3+ | |
| S26 | bug | `idx.js:209` picks `terminal` from the HTML default `checked` (`idx.html:956`) before restore runs, so the page always logs. Options UI only. | S | 3+ | |
| S27 | bug | `idx.js:436`: `eval` over function source from the file itself; no external input reaches it (`FEATURES.md` §6). It needs `'unsafe-eval'`, which MV3 forbids. Replace with `addEventListener`. | S | 3+ | |
| S28 | bug | `idx.js:473, 486`: `load` and `save` call `getOptionValues` for an unused variable. That adds side effects, and with LZW on it propagates S2. The fix is part of S2's. | S | 2 | dup S2 |
| S29 | bug | `idx.js:688`: `json.servers.length` throws when Ombi returns no `servers`. Options UI only. | S | 3+ | |
| S30 | bug | `popup/index.js:37-43` puts the user's own manager URL into `innerHTML` unescaped. The extension CSP blocks inline script (`manifest.json:18`). | S | 3+ | security (low) |
| S31 | bug | `popup/index.html` has no `google`, `toloka`, `myanimelist`, `indomovie`, `snagfilms` or `freemoviescinema` tiles, and lists `showrss` (no script). | S | 3+ | |
| S32 | bug | `idx.js:2602`: the synthetic `UpdateTheme` call one second after load uses the mouseup-inverted test (`:2593-2594`), so a checked box takes the `delete` branch. This is masked by S1; fix both together. | S | 2 | dup-area S1 |
| S33 | bug | `idx.js:2469-2480`: "Erase cache" deletes `~/cache/has/*` and `~/cache/get/*` (cloud-script permissions) without saying so, then calls `saveOptions`, which can raise S18's confirm. Options UI only. | S | 3+ | |

### Phase 2 fix list (phase `2` + verdict `bug` + size `S`), ordered by impact

1. ~~**S5.** Save after Reset throws, so the config never propagates and `proxy` is left missing (`idx.js:1969-1996`). Fixes the cause of B41.~~ Fixed (`w2p-fix-settings`).
2. ~~**S2 + S28.** With `UseLZW` on, the options page cannot save at all (`idx.js:646, 473, 486`).~~ Fixed (`w2p-fix-settings`).
3. ~~**S1 + S32.** Theme settings never reach `__theme` (`idx.js:646-647, 2602`).~~ Fixed (`w2p-fix-settings`).
4. ~~**S13.** Every save truncates `__caught` (`idx.js:217, 643-654`).~~ Fixed (`w2p-fix-settings`).
5. ~~**S4.** The two profile-type selects are not saved, so Save is refused after a reload (`idx.js:31-202`).~~ Fixed (`w2p-fix-settings`).
6. ~~**S10.** `watcherStoragePaths` is not an array and the prompt throws (`idx.js:955`).~~ Fixed (`w2p-fix-settings`).
7. ~~**S14.** A Plex account with a single device fails to list servers (`xml.js:52-64`, `idx.js:510`).~~ Fixed (`w2p-fix-misc`).
8. ~~**S18.** The hidden-iframe save can raise `confirm()` and save without Plex (`idx.js:2760-2765`).~~ Fixed (`w2p-fix-misc`).
9. ~~**S15.** Prompt defaults lag one save (`idx.js:1054`, etc.).~~ Fixed (`w2p-fix-misc`).
10. ~~**S11.** The "Web to Plex" site toggle uses `pid` but the handler reads `bid` (`idx.js:2229, 2274`).~~ Fixed (`w2p-fix-settings`).
11. ~~**S20.** The CouchPotato URL is not normalised in the without-Plex save (`idx.js:1873-1897`).~~ Fixed (`w2p-fix-settings`).

There are no Phase 2 items of size M or L. **Security:** S22 (M), S23 and S30 are all `3+`. S22 needs an owner decision on whether to keep secrets in `storage.sync`.

### Count check

S1–S33 each appear once in the table (33 rows).

| Verdict | Count |
|---|---|
| `bug` | 31 |
| `not-a-bug` | 1 (S24) |
| `dead-code` | 1 (S25) |
| `live-check` | 0 |

## Sites (T)

**Source list:** `docs/triage/bugs-sites.md`.
**Code checked:** branch `claude/extension-rewrite-features-b4afna` @ `1bf4670` (`src/sites`, `src/cloud`, `src/download` unchanged since `cb7ec2a`). No code was changed. No site was visited.

**Legend**

| Field | Values |
|---|---|
| Verdict | `bug` · `not-a-bug` · `dead-code` · `live-check` |
| Size | `S` (10 lines or fewer) · `M` · `L` |
| Phase | `2` = fix now (security or data leak only) · `4` = the site is rewritten and live-checked during plugin migration · `3+` = lands with removal of `plugn.js`, the manifest rewrite, or the message router |

**Cross-references:** `B#` = `bugs-core.md`, `S#` = `bugs-settings.md`. A cross-reference means the two items share a root cause.

### Table

| ID | Verdict | Reason | Size | Phase | Flag |
|---|---|---|---|---|---|
| T1 | bug | `cloud/itunes.js:73`: a top-level `return` exits the `prepare` wrapper (`plugn.js:286-372`) before the URL test whenever the page has no CSP `<meta>`. `ready` (`:4`) also waits on `top.__NewCSP__`, which is set only after such a meta exists (`:92`), and rewriting a CSP meta after parse has no effect. The fix is to delete `:67-93` and the `__NewCSP__` clause. The `web-ext lint` parse error goes with it. | S | 4 | |
| T2 | bug | `plugn.js:295` blocks only when consent is `=== false`, and `GetConsent` returns `undefined` for unknown keys (`plugn.js:63`). As a result, `builtin_google.play` ≠ `builtin_googleplay` (`sites/google/play.js:2`; `options/index.js:155`), `plugin_indomovietv` ≠ `plugin_indomovie` (`sites/common.js:5`; `options/index.js:187`), and every unknown host runs what it fetches. Same root area as B11, B15 and S3. | S | 3+ | security |
| T3 | bug | `download/plex.js:36` prefixes every request with `//cors-anywhere.herokuapp.com/`. The URLs carry `X-Plex-Token=<token>` (`:19-21`), so the account token reaches a third party. Fix: drop the prefix (`fetch(url, …)`). From app.plex.tv, plex.tv and the user's server already answer cross-origin requests from the Plex web app. Removal breaks no **working** feature: the manifest pattern likely never matches (`manifest.json:51`, B38), and the public proxy has been opt-in only since 2021. | S | 2 | security |
| T4 | bug | `sites/shanaproject/index.js:2` sends `SCRIPT 'shanaproject'`, but `src/cloud/shanaproject.js` does not exist, only `cloud/plugin/shanaproject.js` (`let plugin`). In dev mode the fetch at `plugn.js:578` fails and the error is rethrown unhandled (`plugn.js:621`). | S | 4 | |
| T5 | bug | `cloud/imdb.js:4` waits for `#servertime`, and `:18-29, 35-47` use `.title_wrapper`, `#titleYear` and `.originalTitle`. Those are pre-2020 IMDb IDs and classes. Code alone shows it targets the old layout. A live check during Phase 4 confirms current IMDb lacks `#servertime`. | L | 4 | |
| T6 | bug | `plugin_metacritic` is offered (`options/index.js:194, 2316`), but the plugin path fetches `cloud/plugin/metacritic.js`, which is missing. `cloud/metacritic.js` declares `let script`, not `let plugin`, so the wrapper's `plugin.url` would throw a `ReferenceError` (`plugn.js:331`). There is no manifest entry. | S | 4 | |
| T7 | bug | `cloud/imdb.js:96-98`: `$('meta[property="pageId"]')` is a `queryBy` array (always truthy), so `tag.content` is `undefined`. Fix: `.first`. The script is rewritten with T5. | S | 4 | |
| T8 | bug | `cloud/tvmaze.js:22-26` returns the TVmaze show ID as `TVDbID`. `Identify` trusts a given `TVDbID` (`utils.js:1654, 1747-1748`) and `PUSH_SONARR` sends `tvdb:<id>` (`background.js:375-380`), so a wrong series can be added to the user's manager. This is wrong data written to a real service. It can be fixed in place by leaving `TVDbID` empty or reading the page's TheTVDB link. | S | 2 | data |
| T9 | bug | `cloud/rottentomatoes.js:24`: `.replace(/[^]*(\d{4})/, '')` deletes the year, so the result is `0` or `NaN`. | S | 4 | |
| T10 | bug | `cloud/rottentomatoes.js:66-68` and `cloud/tmdb.js:64-66`: `process(element)` queries the whole document, so every list item gets the first card's data. Compare `cloud/letterboxd.js:65-66`. | S | 4 | |
| T11 | bug | `cloud/verizon.js`: `:18` calls `.replace(regex)` with one argument; `:21` uses an undefined `decodeURL` and the typo `toCpas`; `getType` (`:45-53`) never returns `'show'` for URLs the `url` pattern admits. | S | 4 | |
| T12 | bug | `cloud/rottentomatoes.js:56`: in `/^\/browse\/i/` the `i` is part of the pattern, so list mode is never detected. | S | 4 | |
| T13 | bug | `cloud/letterboxd.js:78-82`: `actions.id` is read before the `if(!actions)` check, so it throws when `UseMinions` is on and there is no panel. | S | 4 | |
| T14 | bug | `cloud/youtube.js:87-92` sets a 10 ms `setInterval` that re-runs `init`, and `init` returns early (`:16-17`) before `clearInterval` (`:105`). `:19-23` clicks the description buttons on every watch page. This is CPU and UI side effects, not a leak. | M | 4 | |
| T15 | bug | `cloud/tvdb.js:38-43` takes the ID only from a numeric `/series/<n>` path. Current TheTVDB uses slugs. Code shows the assumption; the URL format needs a Phase 4 live check. | S | 4 | |
| T16 | bug | `.src`/`.textContent` are read without null checks at 14 places (`allocine.js:16`, `fandango.js:12-14`, `justwatch.js:18`, `moviemeter.js:20`, `tubi.js:14-16`, `hulu.js:14-18`, `webtoplex.js:31-33`, and in plugins `kitsu.js:19-21`, `foxsearchlight.js:19`, `indomovietv.js:17-19`, `redbox.js:16-19`, `myanimelist.js:8-20`, `myshows.js:12-21`, `toloka.js:17-27`). One missing element throws, and the B25 loop follows (B25 is in `plugn.js`, 3+). | M | 4 | |
| T17 | bug | Legacy `RegExp.$n` is read after a regex that may not match, in 13 files (list in `bugs-sites.md`), so stale values leak from earlier regexes. Same pattern as B26 (`plugn.js:420`). | M | 4 | |
| T18 | bug | `cloud/flickmetrix.js:57`: `new Notification('error', '…')` resolves to the browser's Web Notification (the `utils.js` class is closure-private, `utils.js:274`). A string second argument throws `TypeError`, so `init` throws on an empty list. | S | 4 | |
| T19 | bug | `cloud/google.js:2`: `FILM` uses `themoviedb.org/tv/` (should be `/movie/`); `:26` `$(SHOW).first.querySelector('*')` may be `null`. | S | 4 | |
| T20 | bug | `cloud/amazon.js:38`: `$(...).src` on a `queryBy` array is always `undefined` (missing `.first`). `:1` has the copy-paste header "Toloka Plugin". | S | 4 | |
| T21 | bug | `cloud/plugin/freemoviescinema.js:19`: the replacement `'$1'` (the quote) should be `'$2'` (the URL). | S | 4 | |
| T22 | live-check | `download/*.js:10`, `plex.js:131`: `check = document.body.onload = …` is assigned at `document_idle`. Code cannot tell whether the frame's `load` has already fired by then. Observe on a page with the embed: does `check` ever run? A direct `check()` call avoids the question. | S | 4 | |
| T23 | bug | `cloud/vumoo.js:58-68` and `cloud/plugin/indomovietv.js:49-59`: `message` listeners with no origin check. Any frame can cancel the auto-click timers. Benign, but the same pattern as B21. Both sites are on the drop list. | S | 4 | |
| T24 | bug | `cloud/vrv.js:90-91`: `minions()` calls `script.init()` and re-runs extraction just for a title. The site is on the drop list. | S | 4 | |
| T25 | bug | `cloud/plugin/toloka.js:12`: `url` is `*://*.toloka.to/*`, so `init` runs on index and search pages without `.maintitle` and throws (T16). | S | 4 | |
| T26 | dead-code | `cloud/webtoplex.js:44-57`: `return -1` inside a `setTimeout` callback is discarded. The pre-fill itself works. | S | 4 | |
| T27 | dead-code | `cloud/trakt.js:37-48, 99-103`: `getType` never returns `'list'` (`:57-67`), so the branch and `process` are unreachable. | S | 4 | |
| T28 | bug | `cloud/vudu.js:36`: a leftover `console.log({ actions })`. Hygiene. The site is on the drop list. | S | 4 | |
| T29 | bug | `cloud/itunes.js:45-49`: `$('.web-to-plex-button').first` can be `undefined` one second after `init`. | S | 4 | |
| T30 | bug | `cloud/rottentomatoes.js:103` appends `minion`, so its `parent` wrapper (`:94-100`) is never inserted. | S | 4 | |
| T31 | not-a-bug | `cloud/__test__.js` and `sites/__test__.js` have no manifest entry and no options key, and no shipped stub sends `SCRIPT '__test__'`, so nothing loads them in normal use. Moving them under `tests/` is housekeeping; Phase 4 moves them with the plugin layout. | S | 4 | |
| T32 | bug | `options/index.js:2186` and `popup/index.html:133` list ShowRSS, but there is no manifest entry, stub or cloud script. The options checkbox and popup tile do nothing. Settings page (Phase 5) or plugin migration (Phase 4). | S | 4 | |

### Phase 2 list (security or data leak, fix now)

1. ~~**T3** (`security`, S). Remove the `cors-anywhere.herokuapp.com` prefix in `download/plex.js:36`, so the Plex token stops going to a third party. No working feature is lost (manifest pattern, B38; proxy opt-in since 2021). Fetch directly instead. If the manager prefers, delete the download path until Phase 4.~~ Fixed by the manager.
2. ~~**T8** (`data`, S). Stop passing the TVmaze ID as `TVDbID` (`cloud/tvmaze.js:22-26`). It can add the wrong series to Sonarr, Medusa or Sick Beard. The smallest fix is to return no `TVDbID`, which leaves `Identify` to look it up.~~ Fixed by the manager.

Security, but phase 3+: **T2**. Consent is default-allow and keyed by derived names. It lives in `plugn.js` (`GetConsent`, the wrapper guard) and is fixed when consent moves to the plugin registry. It is the same root area as B11, B15 and S3.

### Drop list (whole integrations to remove; code evidence only)

Shutdown status is from public knowledge and was **not live-checked**. "Code evidence" is what the code shows by itself.

| Integration | Files | Code evidence | Status (unverified) |
|---|---|---|---|
| Openload | `download/oload.js`, `manifest.json:21-44` | 34 hard-coded TLDs; builds `https://oload.fun/stream/…` (`oload.js:22`) | Host closed 2019 |
| consistent.stream, gounlimited.to, fembed.com | `download/consistent.js`, `gounlimited.js`, `fembed.js`; `manifest.json:45-49, 55-64` | Generic `<video>` scrape only; nothing else references them | Hosts gone |
| GoStream | stub, `cloud/gostream.js`, CSS, `manifest.json:171-174`, `options/index.js:2196` | Asks the user to "Select the OL/VH server" (`gostream.js:14`), which depends on the Openload download path | Gone |
| Vumoo | stub, `cloud/vumoo.js`, CSS, `manifest.json:143-146`, `options/index.js:2189` | Auto-clicks player servers to trigger `download/oload.js` (`vumoo.js:21-43`) | Gone |
| Movieo | stub, `cloud/movieo.js`, CSS, `history-hack.js` use, `manifest.json:66-69` | `ready` waits for a Zendesk `.zopim` widget (`movieo.js:4`) | Closed |
| VRV | stub, `cloud/vrv.js`, CSS, `manifest.json:94-97` | — | Shut 2023 (Crunchyroll) |
| Vudu | stub, `cloud/vudu.js`, CSS, `manifest.json:122-125` | Positional selectors (`vudu.js:10, 34-41`) | Rebranded 2024; redirects |
| Google Play Movies | `sites/google/play.js`, `cloud/google.play.js`, `manifest.json:102-105` | Consent key mismatch (T2) | Moved to Google TV |
| CouchPotato site | stub, `cloud/couchpotato.js`, CSS, `manifest.json:130-133` | Scrapes `wp-content` images (`couchpotato.js:11`) | Likely gone |
| Fox Searchlight, SnagFilms, Free Movies Cinema, Freeform (go.com), Redbox, Indomovie | `cloud/plugin/{foxsearchlight,snagfilms,freemoviescinema,go,redbox,indomovietv}.js`; options `plugin_*` (`options/index.js:183-194, 2305-2319`) | Indomovie's key never matches (T2) | Renamed or closed |
| Metacritic (as plugin) | `cloud/metacritic.js`, `options/index.js:194, 2316` | Can never load (T6). Keep only if rewritten as a built-in in Phase 4. | Site alive |
| Shana Project plugin file | `cloud/plugin/shanaproject.js` | Never requested; the built-in stub wins (`sites/common.js:2-3`) | Dead file (the built-in needs T4) |
| ShowRSS | `options/index.js:2186`, `popup/index.html:133-138` | No script exists at all (T32) | — |

**Owner's call (rewrite or drop):**

- **iTunes** (`itunes.apple.com` movie and TV pages redirect to tv.apple.com; T1, T29).
- **Verizon** (Fios web catalogue paths changed; T11).
- **Kitsu** (domain moved to kitsu.app; the `url` at `kitsu.js:4` needs updating).

### Count check

All 32 IDs (T1–T32) appear exactly once.

| Verdict | Count |
|---|---|
| `bug` | 28 |
| `dead-code` | 2 (T26, T27) |
| `not-a-bug` | 1 (T31) |
| `live-check` | 1 (T22) |

| Phase | IDs |
|---|---|
| 2 | T3, T8 |
| 3+ | T2 |
| 4 | all others |

## Live recheck 1 (`w2p-live-recheck-1`)

Run in a throwaway Firefox 155 profile over WebDriver BiDi, because Chrome 153 and Edge 154 no longer load MV2
extensions. Each check was also run against a build with the fix reverted, to show the test can tell them apart.

| Check | Result |
|---|---|
| B39 SPA navigation | Pass (Firefox) |
| B21 window `message` listener | Pass (Firefox); the Chrome isolated-world `event.source.top` check is untested until the MV3 build loads |
| S1/S32 theme persists | Pass |
| S2/S28 UseLZW on | Pass |
| S18 hidden `~save` | Pass (no-server path) |
| B36 CouchPotato over HTTP | Skipped (no CouchPotato server) |

New findings:

- ~~**N1** (high): the first Save after install stored every default-on checkbox as `false` (31 built-in sites,
  `UseLoose`, `UseOmbi`, `DeveloperMode`), blocking every built-in site and switching to remote script loading.~~
  Fixed by the manager: keys never saved keep the page default.
- **N2** (medium): Trakt moved to `app.trakt.tv`, which the `utils.js` domain check refuses. Phase 4 (site rewrite).
- **N3**: confirms B37 (`utils.js` injected twice) in Firefox. Phase 3+.
- **N4**: confirms B13 (`plugn.js` targets the last tab seen, not the sender). Phase 3+.
