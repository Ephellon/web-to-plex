# Web to Plex — runtime architecture (`src/`, MV2)

Source: repo `Ephellon/web-to-plex`, branch `claude/extension-rewrite-features-b4afna`, commit `cb7ec2a`.
Scope: `src/manifest.json`, `src/background.js`, `src/plugn.js`, `src/utils.js`, `src/helpers.js`, `src/history-hack.js`.
Read-only survey; no code was changed. Every claim cites `file:line`.

---

## 1. What runs where

### 1.1 Background page (one shared global scope)

`manifest.json:192-195` declares a **persistent MV2 background page** built from two classic scripts, loaded in order:

1. `background.js` — service bridge: Plex search, *arr/Ombi/CouchPotato/Watcher/Medusa/SickBeard pushes, context menu, badge, downloads.
2. `plugn.js` — "plugin" loader: fetches site scripts (`cloud/*`) from a remote host, wraps them (`prepare`), and injects them into the active tab with `tabs.executeScript`.

Both files share **one global scope**. Consequences:

- Both declare top-level `function load` / `function save` (`background.js:148,152`, `plugn.js:16,20`) and `function getConfiguration` / `function parseConfiguration` (`background.js:106,144`, `plugn.js:113,222`). The later script (`plugn.js`) wins for any call made **after** `plugn.js` has loaded. The very first `UpdateConfiguration()` call at `background.js:176` runs while only `background.js` has executed, so it uses the background versions. Every later call (e.g. `UPDATE_CONFIGURATION`, `background.js:1010`) uses the `plugn.js` versions, which also derive `*URL` / `*BasicAuth` keys (`plugn.js:142-207`).
- `background.js:48` declares `class Headers`, which shadows the global Fetch `Headers` for both files.
- Both register their own `chrome.runtime.onMessage` listener (`background.js:914`, `plugn.js:542`). Every message reaches both (see §3).

### 1.2 Content scripts (manifest-declared)

Chrome injects each `content_scripts` entry in manifest order. Files inside one entry run in array order, in the extension's isolated world. Default `run_at` (`document_idle`) applies everywhere.

| Entry | Matches | Files (load order) | Frames |
|---|---|---|---|
| `manifest.json:21-44` | 34 `openload.*` / `oload.*` domains | `download/oload.js` | all |
| `manifest.json:45-49` | `consistent.stream/titles/*`, `/watch/*` | `download/consistent.js` | all |
| `manifest.json:50-54` | `app.plex.tv/desktop#!/server/*/details?*` | `download/plex.js` | all |
| `manifest.json:55-59` | `gounlimited.to/embed-*` | `download/gounlimited.js` | all |
| `manifest.json:60-64` | `fembed.com/v/*` | `download/fembed.js` | all |
| `manifest.json:66-69` | `movieo.me` | `history-hack.js`, `utils.js`, `sites/movieo/index.js` + CSS | top |
| `manifest.json:75-77` | `trakt.tv` | `history-hack.js`, `utils.js`, `sites/trakt/index.js` + CSS | top |
| `manifest.json:70-185` (other 28 entries) | one site each (IMDb, Letterboxd, TVmaze, TVDb, TMDb, VRV, Hulu, Google Play, iTunes, ShanaProject, Fandango, Amazon, Vudu, Verizon, CouchPotato, Rotten Tomatoes, Netflix, Vumoo, Google, YouTube, FlickMetrix, JustWatch, MovieMeter, AlloCiné, GoStream, Tubi, webtoplex.github.io, Plex) | `utils.js`, `sites/<site>/index.js` (Google Play: `sites/google/play.js`) + `sites/<site>/index.css` | top |
| `manifest.json:186-189` | `*://*/*` (every page) | `utils.js`, `sites/common.js` | top |

Notes:

- On every listed site, **two** entries match: the site entry and the catch-all `*://*/*`. `utils.js` is therefore listed twice for the same frame (`manifest.json:72` and `:188`, for example).
- `download/*.js` scripts run in all frames and only report video URLs to `top` with `postMessage(..., '*')` (`download/oload.js:22`, `download/consistent.js:22`, `download/fembed.js:22`, `download/gounlimited.js:22`, `download/plex.js:106`).
- `helpers.js` is **not** in the manifest. Only `plugn.js` injects it, right before each wrapped cloud script (`plugn.js:503,524,596,613`).

### 1.3 Site-script bootstrap

Every built-in site script is a one-liner that sets the shared `init` global and immediately calls it, for example `sites/imdb/index.js:2`: `(init = () => Update('SCRIPT', { script: 'imdb' }))();`.
`sites/common.js:2-5` does the same for any other page, but only if `init` is not already set. It sends `Update('PLUGIN', { plugin: <hostname label> })`.

`Update` is assigned inside the synchronous prefix of `INITIALIZE` (`utils.js:976`), which runs when `utils.js:3959` calls `INITIALIZE(new Date)`. The first `await` in `INITIALIZE` is at `utils.js:1457`, so `Update` exists before the site script runs.

### 1.4 Injected code

| What | Injected by | World | Where |
|---|---|---|---|
| `helpers.js` file | `chrome.tabs.executeScript({ file })` | isolated (same world as `utils.js`) | `plugn.js:503,524,596,613` |
| Wrapped remote site script (`prepare` output) | `chrome.tabs.executeScript({ code })` | isolated | `plugn.js:505,526,598,615,626` |
| CSS `sites/common.css`, `theme.css`, `glyphs.css`, `colors.css` | `chrome.tabs.insertCSS({ file, cssOrigin: 'user' })` | — | `plugn.js:390-393` |
| Remote site CSS text | `chrome.tabs.insertCSS({ code })`, **no tabId** | — | `plugn.js:536,681` |
| `history.pushState`/`replaceState` hook | inline `<script>` appended to `document.head` | **page main world** | `history-hack.js:1-26` |
| "Plex It!" bookmarklet | `<script src="//webtoplex.github.io/plex.it.js">` appended to `<head>` | **page main world** | `utils.js:2643` |
| Hidden options-page iframe (`options/index.html#!/~save`) | `sFrame` | page DOM | `utils.js:952-969`, `:993` |
| `document.furnish.__cache__` fallback | `chrome.tabs.executeScript({ code })` from a content script | isolated | `utils.js:3923` |

`history-hack.js` dispatches a `pushstate-changed` `CustomEvent` on `window` (`history-hack.js:14,20`). Wrapped scripts listen for it plus `popstate` on `top` (`plugn.js:327-328`).

### 1.5 Extension pages (out of scope, listed for context)

- `options/index.html` is both `options_page` and `options_ui` (`manifest.json:197-201`).
- `popup/index.html` is the browser-action popup (`manifest.json:203-212`).
- They share `localStorage` with the background page because both run on the extension origin.

---

## 2. Every `chrome.*` API use

### `background.js`

| Line | API | Purpose |
|---|---|---|
| 17 | `chrome.storage.sync` \|\| `chrome.storage.local` | Pick the storage area: `BACKGROUND_STORAGE`. |
| 77 | `chrome.browserAction.setBadgeText` | Show the ID provider (`IMDb`/`TMDb`/`TVDb`) on the badge. |
| 81 | `chrome.browserAction.setBadgeBackgroundColor` | Orange `#f45a26` when an ID is known; grey otherwise. |
| 85, 90, 99 | `chrome.contextMenus.update` | Retitle `W2P`, `W2P-IM/TM/TV`, `W2P-XX` for the current item. |
| 134 | `BACKGROUND_STORAGE.get(null, …)` | Read all options. |
| 135, 1082 | `chrome.runtime.lastError` | Error check / suppression. |
| 136 | `chrome.storage.local.get` | Fallback read (calls the undefined `handleOptions`; see `bugs.md`). |
| 852 | `chrome.contextMenus.onClicked.addListener` | Open IMDb/TMDb/TVDb/search URLs, or download a file. |
| 901, 907 | `chrome.downloads.download` | Context-menu "Save as" download, then retry without a filename. |
| 914 | `chrome.runtime.onMessage.addListener` | Main message router (§3). |
| 976 | `chrome.runtime.openOptionsPage` | `OPEN_OPTIONS` message. |
| 985 | `chrome.contextMenus.update` | `SAVE_AS`: retitle `W2P-DL`. |
| 994, 1001 | `chrome.downloads.download` | `DOWNLOAD_FILE`, then retry without an extension. |
| 1042, 1047, 1054, 1063 | `chrome.contextMenus.create` | Create `W2P`, `W2P-DL`, `W2P-IM/TM/TV` (checkboxes), `W2P-XX` at startup. |

### `plugn.js`

| Line | API | Purpose |
|---|---|---|
| 13 | `chrome.storage.sync` \|\| `chrome.storage.local` | `PLUGN_STORAGE`. |
| 37 | `PLUGN_STORAGE.get(null, …)` | Read the `~/cache/*` permission keys (`Load`). |
| 38-39, 213-214 | `chrome.runtime.lastError` → `chrome.storage.local.get` | Fallback read. |
| 53 | `PLUGN_STORAGE.set` | Write `~/cache/*` keys (`Save`). |
| 212 | `PLUGN_STORAGE.get(null, …)` | Read all options (`getConfiguration`). |
| 240 | `chrome.storage.onChanged.addListener` | Re-parse configuration on any storage change. |
| 376 | `chrome.runtime.sendMessage` | **Inside the generated code string**: wrapped script sends `$INIT$` from the tab. |
| 387 | `chrome.extension.getURL` | Defined (`extURL`) but unused. |
| 390-393 | `chrome.tabs.insertCSS({ file })` | Inject the shared button CSS into the tab. |
| 410, 439, 458 | `chrome.tabs.sendMessage` | Send `NO_RENDER` / `POPULATE` to the tab's `utils.js`. |
| 503, 505, 524, 526, 596, 598, 613, 615, 626 | `chrome.tabs.executeScript` | Inject `helpers.js`, then the wrapped script (`{ code }`). |
| 513, 514, 518, 578, 579, 583 | `chrome.runtime.getURL` | Developer mode: local `cloud/*.js` and `sites/*/index.css` instead of remote. |
| 536, 681 | `chrome.tabs.insertCSS({ code })` | Inject fetched remote CSS; no tabId, so it targets the active tab. |
| 634 | `chrome.tabs.sendMessage` | `$INIT$` → send `INITIALIZE` to the tab. |
| 635 | `chrome.tabs.getCurrent` | Commented out. |
| 695 | `chrome.tabs.onActiveChanged.addListener` | Commented out. |
| 698 | `chrome.tabs.onActivated.addListener` | New instance; run `tabchange` for the activated tab. |
| 701 | `chrome.tabs.get` | Resolve the activated tab. |
| 706 | `chrome.tabs.onUpdated.addListener` | Run `tabchange` on `status == 'complete'`; otherwise retry every 1 s. |

### `utils.js` (content script)

| Line | API | Purpose |
|---|---|---|
| 147 | `chrome.extension.getURL` | `extURL` for `img/*` assets (`IMAGES`, `utils.js:152-176`). |
| 188 | `chrome.storage.sync` \|\| `chrome.storage.local` | `UTILS_STORAGE`. |
| 203, 220, 1159 | `UTILS_STORAGE.get(null, …)` | Read cache / quota scan / all options. |
| 204, 1160 | `chrome.runtime.lastError` | Retry the read (on the same area). |
| 235, 250 | `UTILS_STORAGE.remove` | Cache eviction / `remove(name)`. |
| 241, 1228 | `UTILS_STORAGE.set` | Write `~/cache/*` keys; write `__caught`. |
| 946 | `chrome.runtime.sendMessage` | `OPEN_OPTIONS`. |
| 1026 | `chrome.runtime.sendMessage` | Generic `Update(type, options)`. |
| 1349 | `chrome.runtime.sendMessage` | `CHARGE_COUCHPOTATO` (after a 10 s `setTimeout`). |
| 2183, 2221, 2262, 2305, 2362, 2421, 2476, 2536 | `chrome.runtime.sendMessage` | `PUSH_OMBI`, `PUSH_COUCHPOTATO`, `QUERY_COUCHPOTATO`, `PUSH_WATCHER`, `PUSH_RADARR`, `PUSH_SONARR`, `PUSH_MEDUSA`, `PUSH_SICKBEARD`. |
| 3190 | `chrome.runtime.sendMessage` | `SEARCH_PLEX`. |
| 3211 | `chrome.runtime.onMessage.addListener` | Handle `POPULATE`, `INITIALIZE`, `NO_RENDER`, `POSTED` from `plugn.js`. |
| 3923 | `chrome.tabs.getCurrent`, `chrome.tabs.executeScript` | `furnish` fallback when `new Function` fails. `chrome.tabs` does not exist in content scripts, so this always throws. |
| 3956-3957 | `chrome.runtime.lastError` | No-op read. |

### `helpers.js`, `history-hack.js`

No direct `chrome.*` calls. `helpers.js` uses `HELPERS_STORAGE` (defined by `utils.js:5`) and `top.postMessage` (`helpers.js:37,44`).

---

## 3. Messages

### 3.1 `chrome.runtime` messages (content/options → background)

Both background listeners receive every message:

- `background.js:914` handles the service types. It returns `true` (keeps the channel open) after any handled `case`, and `false` for plugin types or unknown types.
- `plugn.js:542` is an `async` function, so it always returns a Promise; Chrome MV2 does not treat that as "will respond". It runs for any message with `request.options`. If the cached `TAB` has no URL or a `chrome:` URL, it calls `callback(null)` synchronously (`plugn.js:550-560`), which can win the race against `background.js`'s asynchronous reply.

| Type | Sender (file:line) | Handler | Payload keys | Reply |
|---|---|---|---|---|
| `SCRIPT` | `utils.js:1026` via `Update`, called from `sites/<site>/index.js` (e.g. `sites/imdb/index.js:2`) | `plugn.js:607-622` (background: `background.js:1014` returns `false`) | `options.script` | `callback` unused; work happens via `executeScript` → `POPULATE` |
| `PLUGIN` | `utils.js:1026` via `sites/common.js:5` | `plugn.js:590-605` | `options.instance_type`, `options.plugin` | none |
| `_INIT_` | no sender found in scope | `plugn.js:625-627` (re-runs `LAST` code) | — | none |
| `$INIT$` | generated code `plugn.js:376` (`top.onlocationchange`) | `plugn.js:630-640` → `INITIALIZE` to tab | `options: { [type]: alias }` | none |
| `FOUND` | `utils.js:3274` via `Update(..., true)` | `plugn.js:642-645` (`FOUND[request.instance] = request.found`) | `options: { ...request, found }`. Note: `instance`/`found` are inside `options`, but the handler reads `request.instance`/`request.found` | none |
| `GRANT_PERMISSION` | `utils.js:871` via `Update` | `plugn.js:647-653` | `options.allowed`, `options.permissions` (handler keys on `options[_type]` = `options.grant_permission`, which is never sent) | none |
| `SEARCH_FOR` | `utils.js:2730` (`UpdateButton`) | `background.js:979-982` → `ChangeStatus` | `options.{title, year, type, href, tail, path, IMDbID/TMDbID/TVDbID…, button}` | none (channel held open) |
| `SAVE_AS` | `utils.js:2874` | `background.js:984-988` | `options.{title, year, tail}` | none |
| `DOWNLOAD_FILE` | `utils.js:2869` | `background.js:990-1007` | `options.{title, year, tail, href}` | none |
| `OPEN_OPTIONS` | `utils.js:946` | `background.js:975-977` | — | none |
| `UPDATE_CONFIGURATION` | `options/index.js:1811,1956,1985` | `background.js:1009-1011` | — | none |
| `SEARCH_PLEX` | `utils.js:3190` | `background.js:935-937` → `Search_Plex` (`:826`) | `options` (item: `title`, `year`, `type`, `field`, `IMDbID`…), `serverConfig` (`token`, `connections[].uri`, `id`) | `{ found, key }` or `{ error, location }` |
| `CHARGE_COUCHPOTATO` | `utils.js:1349` | `background.js:228` | `url`, `basicAuth` | CouchPotato JSON or `{ error, location }` |
| `QUERY_COUCHPOTATO` | `utils.js:2262` | `background.js:183` | `url`, `imdbId`, `tmdbId`, `basicAuth` | `{ success, status }` or `{ error, location }` |
| `PUSH_COUCHPOTATO` | `utils.js:2221` | `background.js:199` | `url`, `imdbId`, `tmdbId`, `basicAuth` (no `token`) | `{ success }` or `{ error, location, debug?, silent? }` |
| `PUSH_WATCHER` | `utils.js:2305` | `background.js:239` | `url`, `token`, `StoragePath`, `basicAuth`, `title`, `year`, `imdbId`, `tmdbId` | `{ success: 'Added to Watcher (…)' }` or error |
| `PUSH_RADARR` | `utils.js:2362` | `background.js:275` | `url`, `token`, `StoragePath`, `QualityID`, `basicAuth`, `title`, `year`, `imdbId`, `tmdbId` | `{ success: 'Added to <path>' }` or error |
| `PUSH_SONARR` | `utils.js:2421` | `background.js:369` | `url`, `token`, `StoragePath`, `QualityID`, `basicAuth`, `title`, `year`, `tvdbId` | same shape |
| `PUSH_MEDUSA` | `utils.js:2476` | `background.js:449` | `url`, `root`, `token`, `StoragePath`, `QualityID`, `basicAuth`, `title`, `year`, `tvdbId` | same shape |
| `PUSH_SICKBEARD` | `utils.js:2536` | `background.js:597` | `url`, `token`, `StoragePath`, `QualityID`, `basicAuth`, `title`, `year`, `tvdbId`, `exists` | same shape |
| `PUSH_OMBI` | `utils.js:2183` | `background.js:679` | `url`, `token`, `title`, `year`, `imdbId`, `tmdbId`, `tvdbId`, `contentType` | `{ success }` or error |

`addMedusa` (`background.js:523-594`) duplicates `Push_Medusa` and has no message route.

### 3.2 `chrome.tabs.sendMessage` (background → content)

All are received by `utils.js:3211`, which reads `request.instance_type` and `request.data`.

| Type | Sender | Payload | Effect in `utils.js` |
|---|---|---|---|
| `POPULATE` | `plugn.js:439,458` | `data` (item or array), `instance`, `[script\|plugin]`, `instance_type` | `Identify` each item → `FindMediaItem(s)` → `SEARCH_PLEX` (`utils.js:3229-3276`) |
| `NO_RENDER` | `plugn.js:410` | `data` (negative number), `instance`, … | Remove all buttons (`utils.js:3285-3288`) |
| `INITIALIZE` | `plugn.js:634` | `data: {}`, `instance`, … | Remove buttons, rerun `INITIALIZE` + `init` (`utils.js:3278-3283`) |
| `POSTED` | none (sender commented out at `plugn.js:644`) | — | Log only (`utils.js:3290-3293`) |

### 3.3 `window.postMessage` (page/frames → `utils.js`)

Handled at `utils.js:3302-3348` on `top`. **The handler checks neither origin nor source.**

| Type | Sender | Payload | Effect |
|---|---|---|---|
| `SEND_VIDEO_LINK` | `download/*.js` (e.g. `download/oload.js:22`), target `'*'` | `href`, `tail`, `from` | `UpdateButton(MASTER_BUTTON, 'download', …)` → `SAVE_AS` / `DOWNLOAD_FILE` |
| `NOTIFICATION` | `helpers.js:37` (`Notify`), target `'*'` | `data.{state, text, timeout, requiresClick}` | Show a toast |
| `PERMISSION` | `helpers.js:44` (`Require`), no target origin | `data.{instance, permission, name, alias, allowed, allotted}` | Show the permission prompt, or re-parse options |
| (untyped) | `utils.js:1041` (`Update(..., postToo)`) | raw `options` object | Ignored (default branch) |

---

## 4. Outbound network requests

"BG" means the background page, which has `<all_urls>` and so is not blocked by CORS. "CS" means a content script: in Chrome 85+ these requests use the page's origin and are subject to CORS and mixed-content rules.

### 4.1 Background (`background.js`)

| Service | Line | Method | URL shape | Auth |
|---|---|---|---|---|
| Plex | 784 | GET | `<connection.uri>/hubs/search?query=<field>:<title>` | `X-Plex-Token` header |
| CouchPotato (query) | 184 | GET | `<couchpotatoURLRoot>/api/<token>/media.get?id=<imdbId>` | Basic (optional); `mode` = `cors` for https/`:443`/`:22`, otherwise `no-cors` (`:21`) |
| CouchPotato (add) | 208 | POST | `<…>/api/<token>/movie.add?identifier=<imdbId>` | `X-Api-Key: undefined`, Basic |
| CouchPotato (charge) | 229 | GET | `<…>/api/<token>/media.list?type=movie&status=active` | Basic |
| Watcher | 254 | GET | `<watcherURLRoot>api/?apikey=<t>&mode=addmovie&imdbid\|tmdbid\|term=<id>` | API key in query; the headers built at `:240` are **not sent** |
| Radarr (lookup) | 290 | GET | `<radarrURLRoot>api/movie/lookup/imdb?imdbid=<id>&apikey=<t>` (or `tmdb?tmdbid=`, or `term=`) | API key in query |
| Radarr (add) | 329 | POST | `<radarrURLRoot>api/movie/?apikey=<t>`, JSON body | `X-Api-Key`, Basic, query key |
| Sonarr (lookup) | 380 | GET | `<sonarrURLRoot>api/series/lookup?apikey=<t>&term=tvdb%3A<id>` | query |
| Sonarr (add) | 409 | POST | `<sonarrURLRoot>api/series/?apikey=<t>`, JSON body | `X-Api-Key`, Basic, query |
| Medusa (search) | 460 | GET | `<medusaURLRoot>api/v2/internal/searchIndexersForShowName?api_key=<t>&indexerId=0&query=<title>` | query |
| Medusa (add) | 481 | POST | `<medusaURLRoot>api/v2/series`, body `{"id":{"tvdb":<id>}}` | `X-Api-Key`, Basic |
| SickBeard (search) | 609 | GET | `<sickBeardURLRoot>api/<t>/?cmd=sb.searchtvdb&tvdbid=<id>` | key in path |
| SickBeard (root dir) | 635 | GET | `…?cmd=sb.addrootdir&tvdbid=…&initial=…&location=…&status=wanted` | key in path |
| SickBeard (add) | 637 | POST | `…?cmd=show.addnew\|show.addexisting&<same form>` | key in path, headers |
| Ombi | 696 | POST | `<ombiURLRoot>api/v1/Request/movie\|tv?apikey=<t>`, JSON body | `ApiKey` header + query |

The URL roots come from the content-side callers: `utils.js:2185, 2224, 2265, 2307, 2364, 2423, 2478-2479, 2538`, `utils.js:1332`.

### 4.2 Background (`plugn.js`) — remote code

| Line | Method | URL | Purpose |
|---|---|---|---|
| 515 → 521 | GET (`cors`) | `https://webtoplex.github.io/web/scripts/<js>.js` or `…/web/plugins/<js>.js` | Site script source for `tabchange` |
| 519 → 534 | GET | `https://webtoplex.github.io/web/styles/<js>.css` | Site CSS |
| 580 → 593, 610 | GET | `https://webtoplex.github.io/web/{scripts\|plugins}/<name>.js` | `SCRIPT` / `PLUGIN` message |
| 584 → 679 | GET | `https://webtoplex.github.io/web/styles/<options[type]>.css` | After **every** message with `options`, including service messages (where `options[type]` is `undefined`) |

Developer mode (`PLUGN_DEVELOPER`) swaps these for `chrome.runtime.getURL('cloud/<js>.js')`, `cloud/plugin/<js>.js`, and `sites/<js>/index.css` (`plugn.js:511-519, 576-584`).

### 4.3 Content script (`utils.js`)

| Service | Line | Method | URL shape | Auth |
|---|---|---|---|---|
| Ombi (charge) | 1252, 1263 | GET | `<ombiURL>/api/v1/Request/movie\|tv?apikey=<t>` | query |
| Watcher (charge) | 1284 | GET | `<watcherURL>/api/?apikey=<t>&mode=liststatus&quality=<q>` | `X-Api-Key`, Basic or `X-Authorization` |
| Radarr (charge) | 1310 | GET | `<radarrURL>/api/movie` | `X-Api-Key`, Basic |
| CouchPotato (charge fallback) | 1355 | GET | `<couchpotatoURL>/media.list?…` | none (unreachable; see `bugs.md`) |
| Sonarr (charge) | 1370 | GET | `<sonarrURL>/api/series` | `X-Api-Key`, Basic |
| Medusa (charge) | 1395 | GET | `<medusaURL>/api/v2/series` | `X-Api-Key`, Basic |
| SickBeard (charge) | 1421 | GET | `<sickBeardURL>/api/<t>/?cmd=shows` | key in path |
| `Identify` | 1775 | GET (optionally through the user's proxy, `:1760-1771`) | one of the URLs below | per service |

`Identify` URL candidates (`utils.js:1710-1756`):

- Ombi `api/v1/Search/movie|tv/<title>/?apikey=` (`:1712`).
- Radarr `api/movie/lookup/tmdb|imdb|?term=` (`:1716-1719`).
- Sonarr `api/series/lookup?term=` (`:1722-1723`).
- Medusa `api/v2/series/tvdb<id>` or `internal/searchIndexersForShowName` (`:1726-1727`).
- `https://www.omdbapi.com/?i|t=…&apikey=` (`:1736-1739`). Default key `'PlzBanMe'` (`:1647`).
- `https://api.themoviedb.org/3/{movie|tv}/<id>`, `/find/<id>`, `/search/{movie|tv}` (`:1742-1745`). Hard-coded default key at `:1646`.
- `https://api.tvmaze.com/shows/?thetvdb|imdb=`, `/search/shows?q=` (`:1748-1751`).
- `https://www.theimdbapi.org/api/find/…` (`:1754-1755`).

Other outbound loads from the content side: the remote `<script src="//webtoplex.github.io/plex.it.js">` (`utils.js:2643`) and the hidden options iframe (`utils.js:993`).

---

## 5. Storage

### 5.1 `chrome.storage` (`sync`, falling back to `local`)

Every reader and writer selects `chrome.storage.sync || chrome.storage.local`: `background.js:17`, `plugn.js:13`, `utils.js:188`. Reads always fetch **everything** (`get(null)`). The `lastError` fallbacks are `background.js:135-136`, `plugn.js:38-39, 213-214`, and `utils.js:204-205, 1160-1161` (`utils.js` retries the same area, not `local`).

| Key(s) | Written by | Read by |
|---|---|---|
| Options: `plexToken`, `servers`, `plexURL`, `IGNORE_PLEX`, `DeveloperMode`, `using<Svc>`, `<svc>URLRoot`, `<svc>Token`, `<svc>BasicAuthUsername/Password`, `<svc>QualityProfileId`, `<svc>StoragePath(s)`, `<svc>Qualities`, `__<svc>Quality`, `__<svc>StoragePath`, `Prompt{Quality,Location}`, `UseLZW`, `UseLowCache`, `UseAutoGrab`, `AutoGrabLimit`, `UseLoose`, `UseLooseScore`, `ManagerSearch`, `TMDbAPI`, `OMDbAPI`, `proxy`, `Notify{NewOnly,OnlyOnce}`, `UseMinions`, `builtin_<site>`, `plugin_<site>`, `__domains`, `__theme` | options page (`options/index.js:16`; `__domains` at `:2076-2085`; `proxy` at `:1773`) | `background.js:106-141`; `plugn.js:113-219` (consent at `:63`; `UseMinions` at `:276`); `utils.js:1048-1166, 1169-1455` |
| `__caught` (cache of IDs already sent; may be LZW+BWT-compressed) | `utils.js:1228` (`CAUGHT.bump`); options page | `utils.js:1196-1197, 2533-2534` |
| `~/cache/has/<alias>`, `~/cache/get/<alias>` (script permissions) | `plugn.js:651-652` (`Save`); `utils.js:863-864` (`save`) | `plugn.js:67-68` (`Load`); `utils.js:1176-1177` |
| `~/cache/<title> (<year>).<db>`, `~/cache/<title>.<db>` (`Identify` results) | `utils.js:2159-2161` | `utils.js:1697-1701` |

Cache eviction: `utils.js:220-239` clears non-`get`/`has` `~/cache/*` keys when the key count reaches `MAX_ITEMS` or the estimated size reaches `QUOTA_BYTES`.

### 5.2 `localStorage` (extension origin: background page + options page)

Keys are `btoa(name)` and values are JSON (`background.js:148-154`, `plugn.js:16-22`, `options/index.js:470-494`).

| Key | Written by | Read by |
|---|---|---|
| `configuration` (full parsed options, **including tokens and passwords**) | `background.js:173` | `background.js:157` |
| `builtin:<host>` | `options/index.js:2290` (`true`), `:2401` (`false`) | `plugn.js:495` |
| `script:<host>` | `options/index.js:2281, 2285, 2392, 2396` | `plugn.js:496` (as `<type>:<host>`) |
| `plugin:<host>` | **never written** | `plugn.js:496` when `builtin:<host>` is `false` |
| `permission:<id>`, `builtin.sites`, `builtin` | `options/index.js:2280, 2284, 2391, 2395`; `:2269`; `:1791, 1936` | not read in scope files |

### 5.3 `sessionStorage`

Only reachable through the `private` parameter of `load`/`save` (`background.js:149,153`, `plugn.js:17,21`). No caller passes it, so `sessionStorage` is never used.

### 5.4 In-page pseudo storage

`HELPERS_STORAGE` (`utils.js:5-51`) is an in-memory shim over the content-script `configuration` object, used by the injected `helpers.js` (`helpers.js:17,27,33`). It does **not** persist: `load`/`save`/`kill` in injected scripts only touch memory.

---

## 6. `plugn.js` flow

### 6.1 Triggers

1. **Tab activated** (`plugn.js:698-702`) or **tab updated** (`:706-713`): generate a new `instance = RandomName()` and call `tabchange([tab])`.
2. **Message** `SCRIPT` / `PLUGIN` from a site script's `init` (`plugn.js:589-622`).
3. **Message** `_INIT_` (re-run the last code, `:625-627`) or `$INIT$` (`:630-640`).

### 6.2 `tabchange` (`plugn.js:467-537`)

1. Store the tab in the global `TAB` (`:472`). Skip if there is no URL or the URL is `chrome:`/`debugger:`/`view-source:` (`:480-490`).
2. `ali = TLDHost(url.host)`, which strips `www.`-like or 2-letter subdomains (`:256-258, 494`).
3. `type = 'script'` if `localStorage builtin:<ali> == true`, else `'plugin'` (`:495`). `js = localStorage <type>:<ali>` (`:496`).
4. `allowed = PLUGN_CONFIGURATION['builtin_<ali>' | 'plugin_<ali>']` (`GetConsent`, `:58-64, 498`). Stop unless both `allowed` and `js` are set (`:500`).
5. If `cache[ali]` holds code from earlier, inject `helpers.js`, then that code (`:502-509`). The cache is cleared after 1e6 ms (`:508`).
6. Otherwise fetch the script (`:511-515, 521-523`), inject `helpers.js` (`:524`), build the wrapper with `prepare` (`:527`), inject it with `executeScript({ code })` (`:526`), and pass the result to `handle` (`:528`). Then fetch the CSS and `insertCSS({ code })` (`:534-536`).

### 6.3 `prepare` (`plugn.js:260-379`) — wrapper template

Inputs: `code`, `alias`, `type` (`script`/`plugin`), `allowed`, `url`.

1. `name` is the global `instance` (`var <instance>`), or `top.<instance>` in developer mode (`:267-268`).
2. It reads stored permissions with `GetAuthorization(alias)` (`:66-110, 282`). This turns `~/cache/get/<alias>` entries into `A<flag>` booleans.
3. Generated code (`:284-378`):
   - `var <instance> = (<instance> || (<instance>$ = $ => { 'use strict'; … })(document.queryBy));`. This caches the result per instance.
   - Guard clauses return `'<allowed>'`, `'<authorized>'`, or `'<flag>'` when a permission is `false` (`:295-312`).
   - Source rewriting (`:314-322`):
     - A comment of the form `// "Name" requires: a, b` becomes a call to `Require("cache,a, b", alias, "Name", instance)` (defined in `helpers.js:40-50`).
     - Any `chrome|browser.storage.(sync|local|managed).` text is replaced with a `console.warn`.
   - It hooks `popstate` and `pushstate-changed` on `top` to `<type>.init` (`:327-328`).
   - It builds `<type>.RegExp` from `<type>.url` (glob → regex, `:331-342`) and tests `location.href`:
     - On a match, if `<type>.ready` exists, it calls `ready()`; truthy runs the `runOnInit` hooks plus `<type>.init(readyState)`, falsy returns `<type>.timeout || 1000` (a retry delay).
     - With no `ready`, it calls `init()`.
     - Without an `init` function, it returns `-1`.
     - If the URL does not match the pattern, it returns `-1` (`:343-371`).
   - `runOnInit` currently holds only `UseMinions` → `<type>.minions()` (`:273-280`).
   - It sets `top.onlocationchange` to send `$INIT$` (`:376`). That setter is the custom property defined in `utils.js:3589-3605`.
4. The code's completion value (the last expression `;<name>;`) becomes `results[0]` for `executeScript`.

### 6.4 `handle` (`plugn.js:381-462`) — interpret the script result

- It always injects the four shared CSS files (`:390-393`).
- No result: pick a new name and re-run `tabchange([TAB])` (`:395-402`).
- **number**: a negative value sends `NO_RENDER` (`:409-411`); otherwise it schedules a re-run of the last message through `processMessage.properties` (`:413`).
- **string**:
  - `'<perm>'` means a missing permission, which is logged (`:417-418`).
  - Otherwise the string is parsed as `Title (YYYY):type` using legacy `RegExp.$n` (`:420-426`).
- **array**: more than one entry sends `POPULATE` with the array (`:435-441`); exactly one is treated as an object.
- **object** `{ type, title, year, … }`: normalise fancy punctuation, coerce `year` to a number, and send `POPULATE` (`:447-458`).

### 6.5 Remote URLs used by `plugn.js`

- `https://webtoplex.github.io/web/scripts/<name>.js` (`:515, 580`)
- `https://webtoplex.github.io/web/plugins/<name>.js` (`:515, 580`)
- `https://webtoplex.github.io/web/styles/<name>.css` (`:519, 584`)

Local equivalents in `src/cloud/` (`cloud/*.js`, `cloud/plugin/*.js`) are used only in developer mode.

---

## 7. Shared globals from `utils.js`

`utils.js` runs in each matched page's isolated world. These top-level bindings are visible to the site scripts (`sites/*`), to `helpers.js`, and to wrapped cloud scripts, because all of them run in the same world.

| Name | Line | Purpose |
|---|---|---|
| `configuration` | 4 | Options copy with secrets filtered by permission (`:1173-1191`). Briefly holds a Promise (`:983`). Backs `HELPERS_STORAGE`. |
| `init` | 4 | Set by each site script to its bootstrap function (`sites/imdb/index.js:2`). Re-run on reload/permission grant (`:872, 2684, 3282, 3333`). |
| `Update` | 4 (assigned 976) | Send a deduplicated `{ type, options }` to the background; optionally `postMessage` to `top`. |
| `IMAGES` | 4 (assigned 152) | Map of extension image URLs. |
| `Glyphs` | 4 (filled 178-185) | Lazy getters that build `<i glyph=…>` icon elements. |
| `HELPERS_STORAGE` | 5 | In-memory `get`/`set`/`remove` over `configuration` for `helpers.js`. |
| `MINIONS` | 52 | Extra page elements that mirror the main button's state. |
| `addMinions` | 53 | Register minion elements; `.stayUnique(status)` opts them out of updates. |
| `UUID` | 63 | Random ID constructor; `UUID.from(obj)` makes a deterministic hash-like ID. |
| `INITIALIZE` | 102 | Async bootstrap: options, UI classes, listeners, button. Called at `:3959` and on reload. |
| `zip` / `unzip` | 3357 / 3362 | Run-length encode/decode (`a{n}`). |
| `BWT` / `iBWT` | 3369 / 3386 | Burrows–Wheeler transform / inverse. |
| `compress` / `decompress` | 3421 / 3452 | LZW compression (used for `__caught` and `__theme` when `UseLZW`). |
| `wait(on, then)` | 3480 | Intended to poll a condition; in practice runs `then` immediately. |
| `addListener(el, ev, cb)` | 3487 | Append a handler to an inline `on*` attribute using `eval`. |
| `traverse(el, until, siblings)` | 3501 | Walk ancestors (or siblings) until a predicate passes. |
| `pathOf(el)` | 3530 | Event/element path (`path`, `composedPath`, or a manual walk). |
| `watchlocationchange(prop)` | 3552 | 1 s poll of `location.href` (`:3607`) that fires `onlocationchange` callbacks. |
| `window.onlocationchange` | 3589-3605 | Custom setter that registers location-change callbacks. |
| `String.prototype.toCaps` | 3610 | Title-case with English article/preposition and Roman-numeral rules. |
| `Object.filter` | 3646 | Filter an object's entries by a predicate. |
| `document.queryBy` / `queryBy` | 3679 / 3951 | Selector engine with order, `:parent`, `<`, and sibling pseudo-selectors; arrays gain `first`, `last`, `child`, `parent`, `empty`. |
| `document.furnish` / `furnish` | 3883 / 3952 | Element factory from `tag#id.class[attr=v]`. String `on*` attributes become `new Function`. |
| `PRIMITIVE` | 3950 | `Symbol.toPrimitive`, used to mask the source text of `queryBy`, `furnish`, and `toCaps` (`:3954`). |

Inside the `INITIALIZE` closure only (not reachable by site or cloud scripts): `Notification` (`:274`), `Prompt` (`:326`), `Options` (`:945`), `Identify` (`:1641`), `Request_<Svc>` (`:2171-2569`), `RenderButton` (`:2574`), `UpdateButton` (`:2714`), `FindMediaItems` (`:2968`), `FindMediaItem` (`:3086`), `Request_Plex` (`:3171`), `Request_PlexURL` (`:3206`).

`helpers.js` adds these globals to the same world when it is injected: `$` (`:1`), `load` (`:5`), `save` (`:21`), `kill` (`:32`), `Notify` (`:36`), `Require` (`:40`).

---

## 8. MV3 blockers

| # | Blocker | Location |
|---|---|---|
| 1 | `manifest_version: 2` | `manifest.json:6` |
| 2 | Persistent background page with two scripts. MV3 needs one service worker (no DOM, no `window`, no `localStorage`/`sessionStorage`). | `manifest.json:192-195` |
| 3 | `localStorage` / `sessionStorage` in the background | `background.js:149, 153, 157, 173`; `plugn.js:17, 21, 495, 496` |
| 4 | `window.*` in the background (`window.crypto`, `window.open`) | `background.js:29, 898`; `plugn.js:251` |
| 5 | In-memory state that must survive between events (lost when the service worker stops) | `background.js:4` (`external`), `:43-44`; `plugn.js:11` (`LAST*`, `FOUND`), `:464` (`running`, `instance`, `TAB`, `cache`), timers `:413, 430, 508, 712` |
| 6 | Context menus created at load instead of in `runtime.onInstalled` | `background.js:1039-1071` |
| 7 | `content_security_policy` as a string, with `'unsafe-eval'` | `manifest.json:18` |
| 8 | `browser_action` / `chrome.browserAction` (→ `action`) | `manifest.json:203-212`; `background.js:77, 81` |
| 9 | `<all_urls>` inside `permissions` (→ `host_permissions`) | `manifest.json:214-220` |
| 10 | `web_accessible_resources` as a flat array (→ objects with `matches`) | `manifest.json:221` |
| 11 | `chrome.tabs.executeScript` (→ `chrome.scripting.executeScript`; `code` strings not allowed) | `plugn.js:503, 505, 524, 526, 596, 598, 613, 615, 626`; `utils.js:3923` |
| 12 | `chrome.tabs.insertCSS` (→ `chrome.scripting.insertCSS`; `code` → `css`) | `plugn.js:390-393, 536, 681` |
| 13 | **Remotely hosted code**: fetch remote JS and execute it | `plugn.js:515, 521-529, 580, 593-604, 610-621` |
| 14 | Remote `<script>` injected into the page (remote code; also blocked by many page CSPs) | `utils.js:2643` |
| 15 | `eval` | `utils.js:3498` |
| 16 | `new Function` | `utils.js:3919` |
| 17 | Code generated as strings and run with `executeScript({ code })` (the whole `prepare` template) | `plugn.js:284-378` |
| 18 | `chrome.extension.getURL` (removed in MV3 → `chrome.runtime.getURL`) | `plugn.js:387`; `utils.js:147` |
| 19 | `chrome.tabs.*` called from a content script | `utils.js:3923` |
| 20 | Inline `<script>` into the page main world. MV3 alternative: `world: 'MAIN'` content script or `scripting.executeScript({ world: 'MAIN' })`. | `history-hack.js:1-26` |
| 21 | `onMessage` listeners rely on `return true` / async listeners; an async listener returning a Promise does not keep the channel open in Chrome | `background.js:914-1035`; `plugn.js:542`; `utils.js:3211` |
| 22 | `fetch` with `mode: 'no-cors'` for HTTP services (opaque response; `Authorization` stripped) | `background.js:21, 186, 210, 231` |

Content-script `fetch` calls to the user's servers (`utils.js:1252-1437, 1775`) are not MV3 blockers. They do already depend on each server's CORS headers, and MV3 guidance is to move them to the service worker.

---

## Appendix: end-to-end path for a built-in site (IMDb)

1. The page loads, and the manifest injects `utils.js` and then `sites/imdb/index.js` (`manifest.json:71-73`).
2. `utils.js:3959` runs `INITIALIZE`, which sets `Update` (`:976`). `sites/imdb/index.js:2` calls `Update('SCRIPT', { script: 'imdb' })`.
3. `Update` sends `{ type: 'SCRIPT', options }` (`utils.js:1026`).
4. `plugn.js:607-622` fetches `webtoplex.github.io/web/scripts/imdb.js`, injects `helpers.js` and the wrapped code into `TAB.id`, and passes the result to `handle`.
5. `handle` sends `POPULATE` with `{ type, title, year, IDs… }` (`plugn.js:458`).
6. `utils.js:3229-3275` runs: `Identify`, then `FindMediaItem`, then `Request_Plex`, which sends `SEARCH_PLEX` (`:3190`).
7. `background.js:826-847` races every Plex connection's `/hubs/search` and replies `{ found, key }`.
8. `UpdateButton` sets the button to found, download, or not-found (`utils.js:2714-2965`). A click calls `Request_<Svc>`, which sends `PUSH_<SVC>`, and `background.js` performs the push.
