# Web to Plex — bug candidates (core runtime)

Scope: `src/background.js`, `src/plugn.js`, `src/utils.js`, `src/helpers.js`, `src/history-hack.js`, `src/manifest.json` at commit `cb7ec2a`.
Method: static reading only. Nothing was run and nothing was live-tested. Confidence reflects how certain the code reading is, not a reproduction.
Entries are ordered by impact within each confidence band.

---

## High confidence

### B1. `utils.js:1657` — `UTF_16` character class has stray characters (known candidate)

The class is `/[^0 -~, 1¡¿-ÿ, 2Ā-…, 8₠-₿]+/g`. The `0`–`8` labels and `, ` separators are inside the brackets. They are harmless as members, since they are already in ` -~`.
**Suspected cause:** `¡¿-ÿ` is meant to be the range `¡-¿` plus `À-ÿ`. As written it is the single character `¡` plus `¿-ÿ`, so `¢-¾` (`¢ £ ¥ © ® ° ±` etc.) is **stripped** from titles. That changes the title used in Plex searches and in cache keys (`utils.js:1676, 1800`).
**Fix direction:** rewrite the class as `/[^ -~¡-ÿĀ-ɏ̀-ͯͰ-ԯ₠-₿]+/g`.

### B2. `utils.js:2532-2546` — `Request_SickBeard` always throws

`CAUGHT` is overwritten with the bare parsed object (`:2533-2534`). That drops the `has`/`bump`/`charge` methods added at `:1200-1242`, so `CAUGHT.has(...)` at `:2546` throws `TypeError`. Every later `CAUGHT.has` in the tab breaks too (e.g. `:2749, 2954, 3037`).
`COMPRESS = options.UseLZW` (`:2532`) also reads the item, not the config, so `COMPRESS` becomes `undefined`. With LZW enabled, `JSON.parse` of compressed data then throws.
**Fix direction:** delete `:2532-2534`.

### B3. `background.js:136` — `handleOptions` is undefined

The `lastError` fallback calls `chrome.storage.local.get(null, handleOptions)`. The local function is named `handleConfiguration` (`:108`). When `sync` errors, this throws `ReferenceError` in the callback, and the promise never settles.

### B4. `background.js:744` — `PromiseRace` empty check never fires

`!~promises.length` is only true when `length === -1`. If every Plex connection fails, the recursion reaches `Promise.race([])`, which never settles. `Search_Plex` (`:841`) then never calls `sendResponse`, and the content-side `Request_Plex` promise hangs.
**Fix direction:** `if(!promises.length)`.

### B5. `background.js:902, 908` — context-menu download uses `item.href`, which does not exist

`contextMenus.onClicked` gives `OnClickData`, which has `linkUrl`/`srcUrl`/`pageUrl` but no `href`. `url` is computed at `:892` (`external.ITEM_URL`) but not used, so `downloads.download({ url: undefined })` fails both times.
**Fix direction:** use `url`.

### B6. `background.js:857` — context-menu click before any `SEARCH_FOR` throws

`external` starts as `{}` (`:4`), so `external.ID_PROVIDER.slice` throws `TypeError` if a `W2P*` item is clicked before `ChangeStatus` ran.

### B7. `background.js:647` — SickBeard fallback JSON is invalid

The fallback is `` `{"data":{},message:"",result:""}` ``, with unquoted keys. An empty response body makes `JSON.parse` throw, and the outer catch reports a parse error instead of the real state.

### B8. `background.js:691-696` — Ombi push continues after "Invalid ID"

`sendResponse({ error: 'Invalid TMDbID' | 'Invalid TVDbID' })` has no `return`, so the POST at `:696` still runs with a `null` ID.

### B9. `utils.js:3186-3187` — repeat Plex search for the same item hangs forever

The `return …, Request_Plex.PROMISED_WORK[uuid]` happens **inside the Promise executor**. Its return value is ignored, so the outer promise never settles. `PROMISED_WORK[uuid]` is always `undefined` anyway (it stores the return of `resolve()`/`reject()`, `:3196-3201`), and `IN_WORK` is never cleared. Any second search with identical options in the same page (reload button `:2683`, `INITIALIZE` message `:3281`, SPA navigation) hangs.

### B10. `plugn.js:706-713` — `onUpdated` retry loop never ends

For any update whose `change` has no `status: 'complete'` (`title`, `favIconUrl`, `audible`, `loading`, …), `refresh` re-calls itself every 1 s with the **same stale `change` object**. The loop never terminates. Each such event adds a permanent 1 s timer, and each tick resets the global `instance` (`:707`). Timers grow without limit over a browser session.

### B11. `plugn.js:496` vs `options/index.js:2392, 2401` — third-party plugins never load

For plugin sites, options writes `script:<pid>` and `builtin:<pid> = false`. `tabchange` computes `type = 'plugin'` and reads `plugin:<ali>`, which nothing writes, so `js` is `null` and it returns at `:500`.

### B12. `plugn.js:536, 681` — `insertCSS({ code })` without a tab ID

With no tab ID, CSS goes to the active tab of the current window, which may not be `id`/`TAB`.
At `:679-681` this also runs after **every** handled message that has `options`, including `SEARCH_PLEX`, `PUSH_*`, `FOUND` and `GRANT_PERMISSION`. In those cases `options[_type]` is `undefined`, so it fetches `…/styles/undefined.css` and injects the 404 body as CSS.

### B13. `plugn.js:544, 596-617` — injection targets the global `TAB`, not `sender.tab`

`processMessage` uses the last tab seen by `tabchange` (`:472`) instead of `sender.tab.id`. Suppose a background tab finishes loading after the user switches tabs. Its `SCRIPT` message then injects into the wrong tab, and the `POPULATE` result goes to the wrong page.

### B14. `plugn.js:550-560` — `plugn.js` can answer messages meant for `background.js`

If `TAB` is unset or is a `chrome:` page, `callback(null)` runs synchronously for every message with `options`. That includes `SEARCH_PLEX`, which `background.js` answers asynchronously. The first reply wins, so `Request_Plex` gets `null` and rejects (`utils.js:3199-3200`).

### B15. `plugn.js:591-604` + `sites/common.js:5` — every visited page fetches a remote plugin URL

`sites/common.js` runs on `*://*/*` (`manifest.json:186-189`) and sends `PLUGIN` with the hostname label. `processMessage` fetches `https://webtoplex.github.io/web/plugins/<label>.js` **before** checking consent; consent only gates execution, inside the generated code (`plugn.js:295`). It then fetches `…/styles/<label>.css` (`:679`). The result is a browsing-history leak to a third-party host plus useless traffic.
`utils.js:1595-1600` (domain check) runs after the `await` at `:1457`, which is too late to stop this.

### B16. `utils.js:17` — `HELPERS_STORAGE.get` with an array throws

`result.push` should be `results.push` (`ReferenceError`). `results` also starts as a copy of `keys` (`:14`), so the values would be appended after the keys.

### B17. `utils.js:41` — `HELPERS_STORAGE.remove` with a `String` object uses undeclared `key`

`key` is undeclared there (`ReferenceError`). Also, `keys instanceof String` (`:11, 40`) is false for string primitives, so `get('x')`/`remove('x')` fall through: `get` never calls back and `remove` does nothing.

### B18. `utils.js:1070` — throws when `plexURL` is empty

`o.plexURL.replace(...)` throws `TypeError` if `plexURL` is undefined. The throw happens inside the storage callback, so the promise never settles and `INITIALIZE` stalls at `:1457`. `plugn.js:135` guards the same expression with `o.plexURL?`.
In both files the result is also written to `options.plexURL` after `o` was spread from `options` (`utils.js:1061-1070`, `plugn.js:126-137`), so the computed URL never reaches `o`.

### B19. `utils.js:1196-1197` — first run with no `__caught` rejects `INITIALIZE`

`JSON.parse(undefined)` throws `SyntaxError` before any button renders. This needs a check of whether the options page always seeds `__caught` (`options/index.js:145`).

### B20. `utils.js:1878-1884, 1946-1952, 2019-2025` — TMDb "local" matcher compares array, returns array

Each loop reassigns `f` on every pass, with no break, and indexes `o.title` on the **array** `o`, not on `o[i]`. Only the last iteration counts, `o.title` is always `undefined`, and the function returns the whole array or a boolean. A later `'externals' in json` on a boolean `true` (`:1884` returns `!!iid`) throws `TypeError` at `:2094`.

### B21. `utils.js:3302-3348` — `message` listener has no origin or source check

Any page script or frame can post these messages:

- `PERMISSION` with arbitrary `name`/`alias` to raise a spoofed permission prompt. If the user accepts, `has/<name>` and `get/<name>` are saved (`:862-865`). The button handlers reject untrusted clicks (`:926-927`), so a real user click is still required.
- `SEND_VIDEO_LINK` with an arbitrary `href`, which becomes the `DOWNLOAD_FILE` URL (`:3307-3313`, `:2869`).
- `NOTIFICATION` with arbitrary text.

**Fix direction:** check `event.source`, plus a per-instance secret.

### B22. `utils.js:3481` — `wait()` never waits

`(on instanceof Function && on()) || true` is always truthy, so `then` runs immediately and the 50 ms poll is dead code. The "sleeping button" at `:3351` renders before `readyState === 'complete'`.

### B23. `utils.js:3711` — `queryBy(element).empty` is always `true`

`!media.length` is evaluated on an `Element`, which has no `length`. Callers that test `.empty` on a single element get the wrong answer.

### B24. `utils.js:2256` — CouchPotato requires both IDs

`!options.IMDbID || !options.TMDbID` rejects items that have only one ID. The comment at `:2255` says the function "does not work anymore". The guard should probably be `&&`.

### B25. `plugn.js:395-399` — failed injection can loop

When `results` is empty (script threw, or the tab is a restricted page), `handle` assigns a new name to its **local parameter** `instance`, not the module variable, then calls `tabchange([TAB])`. That re-injects the cached code (`:502-506`), which fails the same way, and so on, until the cache is cleared after 1e6 ms (`:508`).

### B26. `plugn.js:420` — title parsing relies on legacy `RegExp.$n` after a no-op `replace`

`data.replace(regex)` with one argument still sets `RegExp.$1-$3`. If the string does not match, `$1-$3` keep **stale values** from the last successful regex anywhere in the background page. `handle` then sends `POPULATE` with an unrelated title/year/type.

### B27. `plugn.js:497` — implicit global `code`

`code = cache[ali]` is not declared in `tabchange` (`:474-478`), so it creates a global. Concurrent `tabchange` calls (activation + update) can overwrite each other's `code`.

### B28. `background.js:306` — Radarr lookup with an empty array posts `undefined`

For `data = []`, the condition `!(data instanceof Array) && …` is false, `data.length` is `0` and `data.title` is `undefined`. `body` stays `undefined`, and the POST sends no body. The guard should throw for an empty array.

### B29. `background.js:687` — Ombi body key typo

`lastestSeason` should be `latestSeason`, so Ombi ignores the flag.

### B30. `background.js:240-254` — Watcher ignores Basic auth

`headers` (with `Authorization`/`X-Api-Key`) is built but `fetch` at `:254` is called without options. Users behind Basic auth always fail.

### B31. `background.js:215, 256, 292, 382, 462, 536, 611, 702` — `.catch` mid-chain continues the chain

Each `.catch(error => sendResponse(...))` returns `undefined`, and the next `.then` runs on `undefined` (`response.success`, `response.response`, `data.results`, `response.text()`, …). It throws, and a second `sendResponse` is attempted. The first one wins, so the user sees the right error, but `Push_Ombi` (`:702-703`) calls `undefined.text()` and logs noise.

### B32. `utils.js:1355` — CouchPotato fallback fetch is unreachable

The `try` wraps only `setTimeout(...)` (`:1348-1353`), which never throws synchronously, so the `catch` branch never runs.

### B33. `utils.js:1220, 1240` — `filter` result discarded

`CAUGHT[ID].filter(...)` and `CAUGHT.NO_CACHE[ID].filter(...)` return new arrays that are thrown away, so the intended number-only filtering never happens.

### B34. `utils.js:230` — quota check compares bits to bytes

`bytes` is `length * 8` (`:227`), but it is compared against `QUOTA_BYTES`, which is in bytes. The cache is erased about 8× too early. Separately, writing every `Identify` result to `chrome.storage.sync` (`:2159-2161`; three writes per search) can hit the sync write-rate limit (120 writes/min).

### B35. `utils.js:3370, 3387` — BWT empty-input guard tests the wrong character

`/^[\x32]*$/` matches strings made only of `'2'` (0x32), not spaces (0x20). A string such as `"22"` returns `''`.

---

## Medium confidence

### B36. `background.js:21, 186, 210, 231` — `no-cors` mode for plain-HTTP CouchPotato

`cors(url)` returns `'no-cors'` for `http://` URLs without `:443`/`:22`. A `no-cors` response is opaque, so `response.json()` rejects, and non-safelisted headers (`Authorization`) are dropped. CouchPotato over HTTP (the case the comment at `:179-182` mentions) would then always fail. The background page has `<all_urls>`, so plain `cors` mode would work.
**Needs live check:** extension-origin requests may get special handling.

### B37. `manifest.json:72` + `:188` (and every site entry) — `utils.js` runs twice per frame

On every listed site, two entries inject `utils.js` into the same isolated world. The second run redeclares top-level `let`/`class` names (`utils.js:4-63, 102, 3950`), which raises `SyntaxError: Identifier 'configuration' has already been declared`. That copy aborts and `sites/common.js` then runs against the first copy. The effect is console noise. A failure would be possible if Chrome changes how it deduplicates.
**Needs live check:** confirm whether Chrome deduplicates identical files across entries.

### B38. `manifest.json:51, 183` — Plex match patterns may never match

Match patterns ignore the URL fragment. Plex web URLs look like `https://app.plex.tv/desktop/#!/…` or `…/desktop#!/…`. `*://app.plex.tv/desktop#!/server/*/details?*` (`:51`) puts the fragment in the path, so it likely never matches. `*://app.plex.tv/desktop/*` (`:183`) only matches the trailing-slash form.
**Needs live check** against current Plex URLs.

### B39. `utils.js:3557-3583` + `plugn.js:376` — SPA navigation forces a full reload

Once a wrapped script sets `top.onlocationchange` (`plugn.js:376`), the 1 s poll (`utils.js:3607`) sees each `href` change. It invokes the callback and then calls `open(to, '_self')` (`:3582`), which reloads the page.
For callbacks not yet marked `exists` it also adds a `beforeunload` handler that calls `preventDefault` (`:3573-3576`), which can trigger "Leave site?" prompts.

### B40. `utils.js:1176-1182` — permission filter keyed on `Update.running`

`Update.running` is `null` until the first `Update`. The filter loads `has/null`/`get/null`; when `allowed` is true but `permiss` is not an array (e.g. an object saved from `GRANT_PERMISSION`), `permiss.join` throws.

### B41. `utils.js:1760-1762` — `__CONFIG__.proxy` assumed present

`proxy.url` and `proxy.headers` throw `TypeError` if the user never saved proxy settings (`options/index.js:1773` writes it only on save). That breaks every `Identify` call.

### B42. `utils.js:1597` — `__domains` assumed present

`configuration.__domains.split` throws if `__domains` is unset, which aborts `INITIALIZE` before the listeners at `:3211` and `:3302` are registered.

### B43. `utils.js:2066, 2103` — `json[tr].length` when only `movie_results` exists

This throws `TypeError` if the response has `movie_results` but no `tv_results`.

### B44. `utils.js:2353, 2412` — `parsePath` throws when the stored path ID is missing

`.filter(n => n)[0].path` throws if `radarrStoragePath`/`sonarrStoragePath` is not in the `…StoragePaths` list (e.g. after the paths change on the server).

### B45. `utils.js:290` — notification queue delay uses elapsed time

`+(new Date) - last.start` is time since start, not time remaining (`last.stop - now`). Queued toasts fire at roughly the wrong moment.

### B46. `utils.js:1734` — operator precedence in the `rerun` flag

`A || B || C && (rerun |= 0b1000)` sets the flag only when the third operand runs. If the intent was "flag whenever this branch is taken", the `&&` needs parentheses around the `||` group.

### B47. `plugn.js:242, 498` — `GetConsent` throws when the config failed to parse

If required options are missing, `parseConfiguration` rejects (`plugn.js:116-118`) and `PLUGN_CONFIGURATION` stays undefined. Every `tabchange` then throws `'Configuration not found…'` as an unhandled rejection (`:61`), and every storage change re-triggers the rejection (`:240-242`).

### B48. `plugn.js:642-645` — `FOUND` handler reads the wrong keys

`Update('FOUND', { ...request, found })` nests the data under `options` (`utils.js:3274, 1026-1029`), but the handler reads `request.instance` and `request.found`. `FOUND[undefined]` is set, so the "already found" short-circuit at `plugn.js:395, 470` never applies to a real instance.

### B49. `plugn.js:647-653` — `GRANT_PERMISSION` never saves

The handler requires `options[_type]`, i.e. `options.grant_permission`, but `utils.js:871` sends `{ allowed, permissions }`. It returns `false` before saving. `utils.js:863-864` does save locally, so the impact is limited to the background copy.

### B50. `background.js:1027` — `return true` for handlers that never reply

`OPEN_OPTIONS`, `SEARCH_FOR`, `SAVE_AS`, `DOWNLOAD_FILE` and `UPDATE_CONFIGURATION` never call `callback`, but the listener still returns `true`. The sender's callback (`utils.js:1029`) fires only when the port is garbage-collected, then logs "Invalid response".

---

## Low confidence / hygiene

### B51. `background.js:523-594` — dead `addMedusa`

It duplicates `Push_Medusa` with no route.

### B52. `background.js:470, 544` — Medusa `body` unused

It is computed from search results but the POST sends only `{ id: { tvdb } }`. This may be intentional.

### B53. `background.js:148, 152`; `plugn.js:16, 20` — parameter named `private`

`private` is a reserved word in strict mode. It is fine in these sloppy scripts, but it will break under ES modules (MV3 service worker with `type: module`).

### B54. `background.js:915` — `'From: ' + sender` logs `[object Object]`

### B55. `background.js:871, 876, 881` — search URLs are not encoded

`tt`/`tl` go into query strings without `encodeURIComponent`.

### B56. `plugn.js:429-430` — unreachable branch

`typeof data == 'number'` was already handled at `:406-414`.

### B57. `utils.js:3363` — `[-1]` on an array is always `undefined`

`from36` works only because of the `|| x` fallback.

### B58. `utils.js:3923-3925` — `throw __error, _error` throws `_error`

The comma operator means the first error is lost. The `chrome.tabs` call itself can never work in a content script (see `ARCHITECTURE.md` §8 #19).

### B59. `helpers.js:27`; `plugn.js:53`; `utils.js:241, 1228` — `await` on callback-style storage calls

In MV2 Chrome, `storage.set(obj, cb)` returns `undefined`, so `await` does not wait. Callers continue before the write completes (e.g. `plugn.js:651-652` then `:679`).

### B60. `utils.js:1646-1647` — hard-coded fallback API keys

There is a TMDb key, and OMDb uses the literal `'PlzBanMe'`. Requests fail or are rate-limited without a user key. `theimdbapi.org` (`:1754-1755`) appears to be defunct.

### B61. `utils.js:1716-1727`; `background.js:290, 329, 380, 409` — legacy *arr API paths

The code calls `/api/movie` and `/api/series` (v1/v2). Current Radarr and Sonarr use `/api/v3/…`.
**Needs live check:** confirm against the owner's versions.
