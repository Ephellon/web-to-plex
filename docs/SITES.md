# Web to Plex — site integrations catalog

Source: repo `Ephellon/web-to-plex`, branch `claude/extension-rewrite-features-b4afna`, commit `b5f1bc7` (`src/` unchanged since `cb7ec2a`).
Scope: `src/sites/**`, `src/cloud/**` (including `cloud/plugin/*`), `src/download/*`, and `manifest.json` `content_scripts`.
This is a static read only. No site was visited. "Likely dead" is based on public knowledge of each domain and was **not live-checked**.
"T#" refers to `bugs.md` in this share. "B#" and "S#" refer to `docs/triage/bugs-core.md` and the settings job.

---

## 1. How a site integration works

Each built-in site has three parts:

1. **Manifest entry**: it injects `utils.js` and the stub `sites/<x>/index.js`, plus `sites/<x>/index.css` (`manifest.json:66-185`).
2. **Stub** (`sites/<x>/index.js`, 2 lines each): `(init = () => Update('SCRIPT', { script: '<x>' }))();`.
3. **Cloud script** (`cloud/<x>.js`): the real extractor. It is fetched, wrapped and injected by `plugn.js`.

### 1.1 `Update('SCRIPT', …)` end to end

1. The stub sets the shared `init` and calls `Update('SCRIPT', { script: '<x>' })` (e.g. `sites/imdb/index.js:2`). `Update` is defined in `utils.js:976`.
2. `Update` sends `chrome.runtime.sendMessage({ type: 'SCRIPT', options: { script: '<x>' } })` (`utils.js:1026`). The same message is deduplicated for 30 s (`utils.js:1021-1038`).
3. In the background, `plugn.js:607-622` handles `SCRIPT`:
   - Consent: `allowed = PLUGN_CONFIGURATION['builtin_<x>']` (`plugn.js:63, 608`).
   - Source:
     - Developer Mode on: `chrome.runtime.getURL('cloud/<x>.js')`.
     - Developer Mode off: `https://webtoplex.github.io/web/scripts/<x>.js` (`plugn.js:576-580`).
   - Injection: `helpers.js`, then the code wrapped by `prepare` (`plugn.js:260-379`), into the tab `TAB.id`. `TAB` is the last tab seen, not the sender's tab (core B13).
   - Note: the wrapper blocks only when consent is **exactly `false`**. An undefined consent key runs the script (T2).
4. The wrapper checks permissions, then tests `script.url` (glob converted to a regex, `plugn.js:331-342`) against `location.href`:
   - If `script.ready` exists, it calls it. Truthy: run `minions()` (when `UseMinions` is on) and then `init(ready)`. Falsy: return `script.timeout || 1000` (`plugn.js:344-367`).
   - The returned value is the result of `executeScript`.
5. `handle` in `plugn.js:381-462` reads the result:
   - number ≥ 0: retry after that many milliseconds;
   - number < 0: send `NO_RENDER`;
   - `'<perm>'` string: a permission is missing;
   - array: send `POPULATE` with the list;
   - object: normalise the punctuation and send `POPULATE`.
6. `utils.js:3229-3276` runs `Identify` (ID lookup), then `FindMediaItem(s)`, then `SEARCH_PLEX` to the background. It then updates the floating button: found → watch link; not found → "download" (send to the manager).
7. On a SPA navigation, the wrapper re-runs `init` on `popstate`/`pushstate-changed` (`plugn.js:327-328`; `history-hack.js` is only on Movieo and Trakt). The 1 s `href` poll then forces a reload (core B39).

### 1.2 Button placement (all sites)

- The **master button** is always the same element: `button.web-to-plex-button`, appended to `<body>` (`utils.js:2614-2709`).
  - Position and shape come from `sites/common.css`, `sites/theme.css` and the `__theme` classes (`utils.js:2583-2611`).
  - The per-site `index.css` only adjusts it for that site.
- **Minion buttons** are optional in-page buttons. They are created by each script's `minions()` only when `UseMinions` is on (`plugn.js:275-280`), and mirror the master button's state (`utils.js:117-125`). The "Minion" column in §4 lists where they are inserted.

### 1.3 Template contract (`cloud/__layout__.js`, `cloud/__test__.js`)

Contract enforced by `prepare`/`handle` (`cloud/__layout__.js:1-39`; worked example `cloud/__test__.js:1-37`):

| Member | Required | Contract |
|---|---|---|
| top-level `let script = {…}` (built-in) / `let plugin = {…}` (plugin) | yes | The wrapper refers to `<type>.url`, `<type>.init`, etc. (`plugn.js:327-371`). The variable name must match the type. |
| `url` | yes | A glob: `*://` = any scheme, `*.` = optional subdomain, `.*` = any TLD, `/*` / `?*` / `&*` / `#*` = any rest. The rest is used as raw regex syntax (`plugn.js:331-341`). |
| `init(ready)` | yes | Returns one of:<br>• `{ type, title, year, image?, IMDbID?, TMDbID?, TVDbID? }`<br>• an array of those<br>• a `"Title (YYYY):type"` string<br>• a number (≥ 0 = retry in ms, < 0 = stop) |
| `ready()` | no | Boolean or promise. A falsy value causes a retry after `timeout`. |
| `timeout` | no | Retry delay; default 1000 ms. |
| `getType()` etc. | no | Helpers. `type` is normalised by regex later: movie / film / cinema / theatre → `movie`; tv / show / series → `show` (`utils.js:483, 1664-1669`). |
| `minions()` | no | Insert in-page buttons and register them with `addMinions` (`utils.js:53-61`). |
| `// "Name" requires: api, token` comment | no | `prepare` turns it into a `Require(...)` call, which raises a permission prompt (`plugn.js:316-318`; `helpers.js:40-50`). |

Globals available to cloud code (same isolated world):

- from `helpers.js`: `$`, `load`, `save`, `kill`, `Notify`, `Require`;
- from `utils.js`: `queryBy`, `furnish`, `IMAGES`, `addMinions`, `UUID`, `configuration`, `String.prototype.toCaps`, plus the private `YEAR`/`MONT`/`DAY` that `prepare` injects (`plugn.js:289-292`).

Restrictions:

- Any `chrome|browser.storage.*` text is rewritten to a `console.warn` (`plugn.js:319-321`).
- The code runs inside an arrow-function body. A top-level `return` therefore exits the wrapper early, which matters for `cloud/itunes.js` (T1).

`sites/__layout__.js` and `sites/__test__.js` are stub templates with no manifest entry. `cloud/__test__.js` matches `webtoplex.github.io/web/test/*`, but no stub sends `SCRIPT '__test__'` from a manifest entry, so it is never loaded in normal use.

### 1.4 Plugins (`cloud/plugin/*`) vs built-ins (`cloud/*`)

| | Built-in (`cloud/<x>.js`) | Plugin (`cloud/plugin/<x>.js`) |
|---|---|---|
| Trigger | Manifest site entry + stub → `SCRIPT` | Catch-all `*://*/*` entry (`manifest.json:186-189`) → `sites/common.js:5` → `PLUGIN` for **every** page that has no stub |
| Name | Fixed in the stub | Derived from the hostname: `location.hostname.replace(/(?:[\w\-]+\.)?([^\.]+)(?:\.[^\\\/]+)/, '$1')` (e.g. `www.redbox.com` → `redbox`) |
| Variable | `let script` | `let plugin` |
| Source (dev / non-dev) | `cloud/<x>.js` / `…/web/scripts/<x>.js` | `cloud/plugin/<x>.js` / `…/web/plugins/<x>.js` (`plugn.js:576-580`) |
| Consent key | `builtin_<x>` (options default **on**) | `plugin_<x>` (options default **off**) |
| CSS | `sites/<x>/index.css` via the manifest, plus a remote/dev CSS fetch | Only the remote/dev CSS fetch (`plugn.js:582-584, 679-681`); `sites/<x>/index.css` does not exist for plugins |
| Enabling | "Default Sites" checkboxes (`options/index.js:2249-2292`) | "Experimental Sites" checkboxes (`options/index.js:2364-2403`) |

There is no manifest entry per plugin site. Plugins rely on the catch-all `utils.js` + `common.js` injection and on `<all_urls>`. Consent only blocks when the key is stored as `false`, so a plugin whose derived name has no key runs regardless (T2).

---

## 2. `download/*` scripts

All five run in **every frame** of their matched pages (`all_frames: true`). They poll the DOM for a video source and `postMessage` it to `top` with target `'*'`. The page's `utils.js` handles `SEND_VIDEO_LINK` (`utils.js:3307-3313`) and switches the button to "Download", which leads to `SAVE_AS` / `DOWNLOAD_FILE` in the background (`background.js:984-1007`).

| File | Manifest | Looks for | Posts | Needs | Status |
|---|---|---|---|---|---|
| `download/oload.js` | `manifest.json:21-44` (34 `openload.*`/`oload.*` domains) | `div > p + p` text: the stream ID (`oload.js:11`) | `href: https://oload.fun/stream/<id>?mime=true`, `from: 'oload'` (`:22`) | Host match only; download uses the background `downloads` permission (`manifest.json:217`) | **Likely dead**: Openload shut down in 2019. |
| `download/consistent.js` | `manifest.json:45-49` (`consistent.stream/titles/*`, `/watch/*`) | `<video>` `src` (`consistent.js:11`) | raw `src`, `from: 'consistent'` | same | **Likely dead** |
| `download/gounlimited.js` | `manifest.json:55-59` (`gounlimited.to/embed-*`) | `<video>` `src` | raw `src`, `from: 'gounlimited'` | same | **Likely dead** |
| `download/fembed.js` | `manifest.json:60-64` (`fembed.com/v/*`) | `<video>` `src` | raw `src`, `from: 'fembed'` | same | **Likely dead** |
| `download/plex.js` | `manifest.json:50-54` (`app.plex.tv/desktop#!/server/*/details?*`; the fragment in a match pattern likely never matches, core B38) | `localStorage.myPlexAccessToken` on app.plex.tv. It then fetches `plex.tv/api/resources`, `/library/metadata/<id>` and the part key **through `cors-anywhere.herokuapp.com`** (`plex.js:36`) | `href: <server><partkey>?download=1&X-Plex-Token=<token>`, `from: 'plex'` (`:101-106`) | Host match; the third-party CORS proxy (T3) | Proxy is restricted since 2021, so it is likely broken. |

All five start through `check = document.body.onload = …` (`oload.js:10` etc., `plex.js:131`). That only runs if the page has not already fired `load` when the content script runs at `document_idle` (T22).

---

## 3. Catalog: identity, patterns, files, gate

Columns:

- **Manifest**: the match pattern(s), with the line of the `matches` array.
- **Script `url`**: the `url` glob inside the cloud file.
- **Gate**: the options consent key read by `plugn.js:63`.
- Every built-in also has `sites/<x>/index.js` (stub) and `sites/<x>/index.css` unless noted. `sites/common.css`, `theme.css`, `glyphs.css` and `colors.css` are injected for all sites (`plugn.js:390-393`).

### 3.1 Built-in sites (manifest entry + stub + cloud script)

| Site | Manifest (line) | Script `url` | Files | Gate | Status |
|---|---|---|---|---|---|
| Movieo | `*://*.movieo.me/*` (`:67`) | `*://*.movieo.me/*` (`cloud/movieo.js:2`) | `history-hack.js` + stub + `cloud/movieo.js` + CSS | `builtin_movieo` | **Likely dead** (movieo.me closed) |
| IMDb | `*://*.imdb.com/*` (`:71`) | `*://*.imdb.com/(title\|list)/(tt\|ls)\d+/(#*\|?*)?$` (`cloud/imdb.js:2`) | stub + `cloud/imdb.js` + CSS | `builtin_imdb` | Alive; selectors are pre-2020 (T5) |
| Trakt | `*://*.trakt.tv/*` (`:75`) | `*://*.trakt.tv/(movie\|show)s/*` (`cloud/trakt.js:6`) | `history-hack.js` + stub + `cloud/trakt.js` + CSS | `builtin_trakt` | Alive |
| Letterboxd | `*://*.letterboxd.com/*` (`:79`) | `*://*.letterboxd.com/(?:\w+/)?(film\|list)/*` (`cloud/letterboxd.js:2`) | stub + `cloud/letterboxd.js` + CSS | `builtin_letterboxd` | Alive |
| TVmaze | `*://*.tvmaze.com/shows/*` (`:83`) | `*://*.tvmaze.com/shows/*` (`cloud/tvmaze.js:2`) | stub + `cloud/tvmaze.js` + CSS | `builtin_tvmaze` | Alive |
| TheTVDB | `*://*.thetvdb.com/series/*` (`:87`) | `*://*.thetvdb.com/series/*` (`cloud/tvdb.js:2`) | stub + `cloud/tvdb.js` + CSS | `builtin_tvdb` | Alive; redesigned with slug URLs (T15) |
| TMDb | `*://*.themoviedb.org/movie/*`, `/tv/*` (`:91`) | `*://*.themoviedb.org/(movie\|tv)/\d+([\w\-]+)?$` (`cloud/tmdb.js:2`) | stub + `cloud/tmdb.js` + CSS | `builtin_tmdb` | Alive |
| VRV | `*://*.vrv.co/*` (`:95`) | `*://*.vrv.co/(series\|watch(list)?)\b` (`cloud/vrv.js:2`) | stub + `cloud/vrv.js` + CSS | `builtin_vrv` | **Likely dead** (VRV shut down 2023, moved to Crunchyroll) |
| Hulu | `*://*.hulu.com/*` (`:99`) | `*://*.hulu.com/(watch\|series\|movie)/*` (`cloud/hulu.js:2`) | stub + `cloud/hulu.js` + CSS | `builtin_hulu` | Alive |
| Google Play | `*://play.google.com/store/*` (`:103`) | `*://play.google.com/store/(movies\|tv)/details/*` (`cloud/google.play.js:2`) | `sites/google/play.js` + `cloud/google.play.js` + `sites/google/index.css` | `builtin_googleplay` (the stub sends `google.play`, so the key read is `builtin_google.play`: T2) | **Likely dead** (Play Movies & TV moved to Google TV) |
| iTunes | `*://itunes.apple.com/*` (`:107`) | `*://itunes.apple.com/\w{2,4}/(movie\|tv(-season)?)/*` (`cloud/itunes.js:2`) | stub + `cloud/itunes.js` + CSS | `builtin_itunes` | **Likely dead** (movie/TV pages redirect to tv.apple.com) |
| Shana Project | `*://*.shanaproject.com/*` (`:111`) | **no `cloud/shanaproject.js`**. Only `cloud/plugin/shanaproject.js` (`*://*.shanaproject.com/series/\d+`, `:4`) exists, and it is never used (T4) | stub + CSS | `builtin_shanaproject` | Status unknown |
| Fandango | `*://*.fandango.com/*` (`:115`) | `*://*.fandango.com/[\w\-]+/movie-overview` (`cloud/fandango.js:2`) | stub + `cloud/fandango.js` + CSS | `builtin_fandango` | Alive |
| Amazon | `*://*.amazon.com/*` (`:119`) | `*://*.amazon.com/*/video/detail/*` (`cloud/amazon.js:14`) | stub + `cloud/amazon.js` + CSS | `builtin_amazon` | Alive |
| Vudu | `*://*.vudu.com/*` (`:123`) | `*://*.vudu.com/*` (`cloud/vudu.js:2`) | stub + `cloud/vudu.js` + CSS | `builtin_vudu` | **Likely dead** (rebranded Fandango at Home 2024; domain redirects) |
| Verizon | `*://*.verizon.com/*` (`:127`) | `*://*.verizon.com/*/(movie\|show)s?/*` (`cloud/verizon.js:2`) | stub + `cloud/verizon.js` + CSS | `builtin_verizon` | Unknown; Fios web catalog paths changed |
| CouchPotato (site) | `*://*.couchpotato.life/*/*` (`:131`) | `*://*.couchpotato.life/(movies\|shows)/*` (`cloud/couchpotato.js:2`) | stub + `cloud/couchpotato.js` + CSS | `builtin_couchpotato` | **Likely dead** (unverified) |
| Rotten Tomatoes | `*://*.rottentomatoes.com/*/*` (`:135`) | `*://*.rottentomatoes.com/([mt]\|browse)/*` (`cloud/rottentomatoes.js:2`) | stub + `cloud/rottentomatoes.js` + CSS | `builtin_rottentomatoes` | Alive |
| Netflix | `*://*.netflix.com/watch/*` (`:139`) | `*://*.netflix.com/watch/\d+` (`cloud/netflix.js:2`) | stub + `cloud/netflix.js` + CSS | `builtin_netflix` | Alive |
| Vumoo | `*://*.vumoo.to/*` (`:143`) | `*://*.vumoo.to/(movies\|tv-series)/*` (`cloud/vumoo.js:2`) | stub + `cloud/vumoo.js` + CSS | `builtin_vumoo` | **Likely dead** |
| Google Search | `*://www.google.com/*` (`:147`) | `*://www.google.com/search` (`cloud/google.js:6`) | stub + `cloud/google.js` + `sites/google/index.css` | `builtin_google` | Alive |
| YouTube | `*://www.youtube.com/*` (`:151`) | `*://www.youtube.com/.+` (`cloud/youtube.js:6`) | stub + `cloud/youtube.js` + CSS | `builtin_youtube` | Alive; the "YouTube Movies" layout has changed |
| Flickmetrix | `*://*.flickmetrix.com/*` (`:155`) | `*://*.flickmetrix.com/(watchlist\|seen\|favourites\|trash\|share\|\?)?` (`cloud/flickmetrix.js:2`) | stub + `cloud/flickmetrix.js` + CSS | `builtin_flickmetrix` | Alive (unverified) |
| JustWatch | `*://*.justwatch.com/*` (`:159`) | `*://*.justwatch.com/(\w{2})/(tv(?:-show)\|movie)/*` (`cloud/justwatch.js:2`) | stub + `cloud/justwatch.js` + CSS | `builtin_justwatch` | Alive |
| MovieMeter | `*://*.moviemeter.nl/*` (`:163`) | `*://*.moviemeter.nl/film/\d+` (`cloud/moviemeter.js:2`) | stub + `cloud/moviemeter.js` + CSS | `builtin_moviemeter` | Alive |
| AlloCiné | `*://*.allocine.fr/*` (`:167`) | `*://*.allocine.fr/(film\|series)/*` (`cloud/allocine.js:2`) | stub + `cloud/allocine.js` + CSS | `builtin_allocine` | Alive |
| GoStream | `*://*.gostream.site/*` (`:171`) | `*://*.gostream.site/(?!genre\|most-viewed\|top-imdb\|contact)` (`cloud/gostream.js:2`) | stub + `cloud/gostream.js` + CSS | `builtin_gostream` | **Likely dead** |
| Tubi | `*://*.tubitv.com/*` (`:175`) | `*://*.tubitv.com/(movies\|series)/\d+/*` (`cloud/tubi.js:2`) | stub + `cloud/tubi.js` + CSS | `builtin_tubi` | Alive |
| Web to Plex site | `*://webtoplex.github.io/web/*`, `*://ephellon.github.io/web.to.plex/*` (`:179`) | `*://(ephellon\|webtoplex).github.io/web[\w\.]*/(?!test\|login)` (`cloud/webtoplex.js:7`) | stub + `cloud/webtoplex.js` + CSS | `builtin_webtoplex` (the options checkbox has `pid`, not `bid`: settings S11) | Owner's site |
| Plex (web app) | `*://app.plex.tv/desktop/*` (`:183`) | `*://app.plex.tv/desktop/?#!/(server/(?:[a-f\d]+)\|provider/(?:tv.plex.provider.vod))/(details\|list)\?*` (`cloud/plex.js:2`) | stub + `cloud/plex.js` + CSS | `builtin_plex` | Alive |
| *(all pages)* | `*://*/*` (`:187`) | — | `utils.js` + `sites/common.js` | `plugin_<hostname label>` | Plugin trigger (§1.4) |

### 3.2 Cloud scripts without a built-in manifest entry

| Script | Script `url` | How it could load | Gate | Status |
|---|---|---|---|---|
| `cloud/metacritic.js` | `*://*.metacritic.com/(movie\|tv\|list)/*` (`:2`) | Only as plugin `metacritic` (options `plugin_metacritic`, `options/index.js:194, 2316`). But the plugin path fetches `cloud/plugin/metacritic.js`, which does not exist, and the file declares `let script`, not `let plugin` (T6). | `plugin_metacritic` | Alive site, but the integration is dead |
| `cloud/__layout__.js` | `< URL RegExp >` placeholder | Never; it is a template | — | Template |
| `cloud/__test__.js` | `*://webtoplex.github.io/web/test/*` (`:2`) | Only if a page sends `SCRIPT '__test__'`. `sites/__test__.js` has no manifest entry. | `builtin___test__` | Test fixture |

### 3.3 Plugins (`cloud/plugin/*`): no manifest entry, triggered by `sites/common.js`

| Plugin file | Script `url` | Name `common.js` derives from a typical host | Options gate | Status |
|---|---|---|---|---|
| `foxsearchlight.js` | `*://*.foxsearchlight.com/(?!films\|search\|$)` (`:2`) | `foxsearchlight` | `plugin_foxsearchlight` | **Likely dead** (renamed searchlightpictures.com, 2020) |
| `freemoviescinema.js` | `*://*.freemoviescinema.com/watch/*` (`:2`) | `freemoviescinema` | `plugin_freemoviescinema` | **Likely dead** |
| `go.js` | `*://freeform.go.com/(movies\|shows)/*` (`:2`) | `go` | `plugin_go` | **Likely dead** (Freeform moved off go.com) |
| `indomovietv.js` | `*://*.indomovietv.*/(?!tag\|$)` (`:2`) | `indomovietv` (mismatch with options key `plugin_indomovie`: T2) | `plugin_indomovie` (never matches) | **Likely dead** (TLD-hopping piracy site) |
| `kitsu.js` | `*://*.kitsu.io/anime/*` (`:4`) | `kitsu` | `plugin_kitsu` | **Likely dead domain** (Kitsu moved to kitsu.app) |
| `myanimelist.js` | `*://*.myanimelist.net/anime/\d+/*` (`:5`) | `myanimelist` | `plugin_myanimelist` | Alive; old table layout |
| `myshows.js` | `*://*.myshows.me/view/\d+/*` (`:5`) | `myshows` | `plugin_myshows` | Alive (unverified) |
| `redbox.js` | `*://*.redbox.com/(ondemand-)?(movies\|tvshows)/(?!featured\|$)` (`:2`) | `redbox` | `plugin_redbox` | **Likely dead** (Redbox closed 2024) |
| `shanaproject.js` | `*://*.shanaproject.com/series/\d+` (`:4`) | never sent: Shana Project has a built-in stub, so `init` exists and `common.js` skips | — | Dead file (T4) |
| `snagfilms.js` | `*://*.snagfilms.com/(films?\|shows?)/*` (`:2`) | `snagfilms` | `plugin_snagfilms` | **Likely dead** |
| `toloka.js` | `*://*.toloka.to/*` (`:12`) | `toloka` | `plugin_toloka` | Alive (unverified) |

---

## 4. Catalog: extraction, selectors, placement, rot

Abbreviations: **R** = `ready()` condition; **T** = type detection; **F** = fields returned; **S** = main selectors; **M** = minion placement (only when `UseMinions` is on). "—" means none.

### Built-in sites

**AlloCiné** (`cloud/allocine.js`)
- R: — (`init` returns 1000 until the title and year exist, `:12-13`).
- T: path `/film/` → `'film'`, else `'show'` (`:24-28`).
- F: title, year (legacy `R.$1`), image.
- S: `.titlebar-title`, `.date, .meta-body font`, `.thumbnail-img`.
- M: —
- Rot: **medium**. Generic class names; the year relies on `RegExp.$1`.

**Amazon** (`cloud/amazon.js`)
- R: IMDb badge or reviews present (`:17`).
- T: any season, episode or series class → `'tv'` (`:50-54`).
- F: title, year (badge, or `R.$1`/`R.$2` from the title regex), image (background-image or fallback).
- S: `[data-automation-id="title"]`, `#aiv-content-title`, `.dv-node-dp-title`, `[data-automation-id="release-year-badge"]`, `.av-bgimg__div`.
- M: `#dv-action-box` (or `.av-action-button-box` for TV): `a.av-button`.
- Rot: **high**. Prime Video markup changes often; `data-automation-id` values are internal.

**CouchPotato site** (`cloud/couchpotato.js`)
- R: `.media-body .clearfix` has children (`:4`).
- T: path `/movies/` or `/shows/` (`:22-30`).
- F: title (from `[itemprop="description"]`), year (previous sibling), image, IMDbID (IMDb link).
- S: `[itemprop="description"]`, `img[src*="wp-content"]`, `[href*="imdb.com/title/tt"]`.
- M: parent of the IMDb link (`[href*=…] < *`).
- Rot: **high** (site likely gone).

**Fandango** (`cloud/fandango.js`)
- R: —
- T: always `movie`.
- F: title, year, image.
- S: `.subnav__title`, `.movie-details__release-date`, `.movie-details__movie-img`.
- M: `.subnav ul` → `li.subnav__link-item`.
- Rot: **medium**. BEM classes, but redesigns have happened.

**Flickmetrix** (`cloud/flickmetrix.js`)
- R: the loading overlay is hidden (`:4`).
- T: always `movie`. List mode when there is no `#singleFilm` and no `id=` in the query (`:33`).
- F: title, year, image, IMDbID; a list returns an array (`:35-60`).
- S: `#singleFilm`, `.film`, `.title`, `.title + *`, `img`, `[href*="imdb.com/title/tt"]`.
- M: —
- Rot: **medium**. Very generic selectors; `img` takes the first image on the page.

**Google Search** (`cloud/google.js`)
- R: —
- T: TVDb/TMDb-tv/IMDb-externalsites links → show; TMDb-tv (sic) or IMDb link → movie; else `'error'` → -1 (`:1-2, 53-59`).
- F: title, year, image, IMDbID.
- S: `#wp-tabs-container [data-attrid="title"] span`, `[data-local-attribute]`, `[role="heading"] > div > a`, `[data-attrid="subtitle"]`, `#media_result_group img`.
- M: —
- Rot: **high**. The knowledge-panel markup is obfuscated and changes often.

**Google Play** (`cloud/google.play.js`)
- R: —
- T: path `/store/movies` → movie, else show (`:19-23`).
- F: title, year, image.
- S: `h1`, `` h1 ~ div span:first-of-type `` / `:last-of-type`, `img[alt="cover art" i]`.
- M: next to `wishlist-add` / `wishlist-added` (`:25-65`).
- Rot: **high** (store section retired).

**GoStream** (`cloud/gostream.js`)
- R: the player iframe has a `src` (`:4`).
- T: always `movie`.
- F: title, year, image. Also notifies "Select the OL/VH server".
- S: `h3[itemprop="name"]`, `.mvic-desc [href*="year/"]`, `.hiddenz, [itemprop="image"]`.
- M: —
- Rot: **high** (site likely gone).

**Hulu** (`cloud/hulu.js`)
- R: an element whose class ends in `__meta` (`:4`).
- T: `/series/` or `/movie/` path, else the third line of the `/watch` player (`:35-47`).
- F: title, year (masthead child 3/4, or the current year on `/watch`), image.
- S: `[class~="masthead__title"]`, `[class~="masthead__meta"]`, `[class~="masthead__artwork"]`, `[class$="__second-line"]`, `[class$="__third-line"]`.
- M: `.Details > .SimpleModalNav` → `div.Nav__item`.
- Rot: **high**. React class names; positional `child(n)`.

**IMDb** (`cloud/imdb.js`)
- R: `#servertime` exists (`:4`).
- T: `og:type` meta: `video.movie` / `video.tv_show`; `/list/` → list (`:74-93`).
- F: title / alttitle, year, image, IMDbID (broken, T7); lists: array via `process` (`:101-116`); forces `mode=simple` (`:57-58`).
- S: `.originalTitle`, `.title_wrapper h1`, `#titleYear`, `.title_wrapper [href*="/releaseinfo"]`, `img[alt$="poster"i]`, `#main .lister-item`, `.col-title a`.
- M: `.plot_summary` or `.lister-list .lister-col-wrapper`.
- Rot: **high, effectively broken**. These are pre-2020 IDs and classes; `#servertime` no longer exists, so `ready` is never true.

**iTunes** (`cloud/itunes.js`)
- R: `.section` exists **and** `top.__NewCSP__` is set (`:4`).
- T: `/tv` or `/tv-season` path → `'tv'`, else movie (`:39-43`).
- F: title, year, image. Rewrites the page CSP `<meta>` to allow fonts (`:67-93`).
- S: `[class~="movie-header__title"]`, `[class~="show-header__title"]`, `h1[itemprop="name"]`, `time, [datetime]`, `picture img`.
- M: `.product-header > *:last-child > *:first-child`.
- Rot: **high** (site redirected; T1).

**JustWatch** (`cloud/justwatch.js`)
- R: — (`init` returns 1000 until the title exists).
- T: path `/tv` or `/tv-show` (`:23-30`).
- F: title, year, image.
- S: `.title-block`, `.title-block .text-muted`, `.title-poster__image`.
- M: —
- Rot: **medium**.

**Letterboxd** (`cloud/letterboxd.js`)
- R: list pages are always ready; films need `.js-watch-panel` (`:4`).
- T: path `/film/` → movie, else list (`:41-48`).
- F: title, year, image, IMDbID; lists: array (`:64-75`).
- S: `#featured-film-header .headline-1`, `.headline-1[itemprop="name"]`, `[href*="/year/"]`, `small[itemprop="datePublished"]`, `.film-poster img`, `.track-event[href*="imdb.com/title/tt"]`, `.poster-list .poster-container`, `.frame-title`.
- M: `.actions-panel ul`, `.js-watch-panel .services` or `#watch`.
- Rot: **medium**. `itemprop` is stable; `.track-event` and the header IDs have changed before.

**MovieMeter** (`cloud/moviemeter.js`)
- R: `.rating + p font` (`:4`).
- T: the runtime text contains "series"/"show" (`:25-33`).
- F: title, year, image.
- S: `.details span`, `.details *`, `.poster`, `.rating + p font`.
- M: —
- Rot: **high**. `<font>` tags and positional `lastChild`.

**Movieo** (`cloud/movieo.js`)
- R: `.share-box, .zopim` (`:4`).
- T: `/lists/` paths → list (`:47-53`).
- F: title (`data-title`), year (meta), image, IMDbID; lists: array.
- S: `#doc_title`, `meta[itemprop="datePublished"]`, `img.poster`, `[data-title][data-id]`, `.tt-parent[href*=imdb]`.
- M: `.mid-top-actions` (also removes the comment-button text).
- Rot: **high** (site likely gone).

**Netflix** (`cloud/netflix.js`)
- R: the player time element is non-zero (`:4-8`).
- T: an episodes control exists → show (`:23-27`).
- F: title only (year 0, no image).
- S: `[class$="__time"]`, `.video-title h4`, `[class*="playerEpisodes"]`.
- M: —
- Rot: **high**. The player UI was rebuilt; `.video-title` is the old player.

**Plex** (`cloud/plex.js`)
- R: no `.loading` (`:4`).
- T: cell title mentions "season" → show (`:26-35`).
- F: title, year.
- S: `[data-qa-id$="maintitle"] *`, `[data-qa-id$="secondtitle"] *`, `[data-qa-id$="celltitle"]`.
- M: —
- Rot: **low/medium**. `data-qa-id` is test-oriented and fairly stable.

**Rotten Tomatoes** (`cloud/rottentomatoes.js`)
- R: `#reviews` (`:4`).
- T: `/m` → movie, `/t` → show, `/browse/i` (sic) → list (`:53-63`).
- F: title, year (broken, T9), image (`srcset`); lists: array (broken, T10).
- S: `.playButton + .title`, `[itemprop="name"]`, `[class*="wrap__title" i]`, `time`, `[class*="posterimage" i]`, `.mb-movie`, `.movieTitle`.
- M: `.franchiseLink` or the first child of `#topSection`.
- Rot: **high**. RT was redesigned in 2023 (web components); `#reviews` and `.mb-movie` are old.

**TMDb** (`cloud/tmdb.js`)
- R: —
- T: path `/movie/<id>` or `/tv/<id>`; `/discover/` → list (`:49-57`).
- F: title, year, image, TMDbID (from the path); lists: array (broken, T10).
- S: `.title > span > *:not(.release_date)`, `.title .release_date`, `img.poster`, `.item.card`.
- M: `.header .actions` → `li.tooltip`.
- Rot: **medium**. `.title` and `.release_date` have been stable, but the header was restructured.

**Trakt** (`cloud/trakt.js`)
- R: `#info-wrapper ul.external` or `.format-date` (`:8`).
- T: path `/movies/` or `/shows/` (`:57-67`); list mode commented out.
- F: title, year, image, IMDbID, TMDbID, TVDbID (external links, `:69-97`).
- S: `.mobile-title`, `.mobile-title .year`, `.poster img.real[alt="poster"i]`, `[href*="imdb.com/title/tt"]`, `[href*="themoviedb.org/"]`, `[href*="thetvdb.com/"]`.
- M: `#info-wrapper .action-buttons`, inserted at `childNodes[3]`.
- Rot: **medium**. The external-link IDs are robust; `.mobile-title` is layout-specific.

**Tubi** (`cloud/tubi.js`)
- R: —
- T: path `/movies` → movie (`:21`).
- F: title, year, image (from the style).
- S: `._1mbQP`, `._3BhXb`, `._2TykB`.
- M: —
- Rot: **high**. Hashed CSS-module class names.

**TheTVDB** (`cloud/tvdb.js`)
- R: `#series_basic_info` (`:4`).
- T: always show.
- F: title, year (from "First Aired"), image, TVDbID (from a numeric path, T15).
- S: `#series_title, .translated_title`, `img[src*="/posters/"]`, `#series_basic_info` (text-parsed).
- M: —
- Rot: **medium**.

**TVmaze** (`cloud/tvmaze.js`)
- R: `#general-info-panel .rateit` (`:4`).
- T: always show.
- F: title, year, image, TVDbID (**actually the TVmaze ID**, T8).
- S: `header.columns > h1`, `#year`, `figure img`.
- M: `nav.page-subnav > ul`.
- Rot: **medium**.

**Verizon** (`cloud/verizon.js`)
- R: play button, details or "more like this" (`:4`).
- T: path has "movie" → movie; "series" → show; else `'error'` (`:45-53`).
- F: title, year, image. Three page variants: on-demand, watch, default.
- S: `.cover img`, `.detail *`, `.rating *`, `[class*="title__"]`, `[class*="subtitle__"]`, `.copy > .title`, `.copy > .details`.
- M: `.container .content-holder`, `.detail .fl` or `[class^="primaryButtons"]`.
- Rot: **high** (T11).

**VRV** (`cloud/vrv.js`)
- R: poster image or list card, or no spinner (`:4-9`).
- T: `/series/` → show; `/watch/` with or without `.content .series`; `/watchlist` → list (`:51-67`).
- F: title, year, image; lists: array.
- S: `.series, .series-title, .video-title`, `.additional-information-item`, `.series-poster img`, `[class*="content-title"]`.
- M: `.action-buttons` (after 5 s) or watchlist card actions.
- Rot: **high** (site gone).

**Vudu** (`cloud/vudu.js`)
- R: a poster image exists (`:4`).
- T: path ends in `Season-N/<id>` → show (`:27-31`).
- F: title, year, image.
- S: `.head-big`, `.container .row:first-child .row ~ * > .row span`, `img[src*="poster" i]`.
- M: `actions.child(6)` of `.container .row:nth-child(3) .row > *`.
- Rot: **high** (site rebranded; positional selectors).

**Vumoo** (`cloud/vumoo.js`)
- R: `[role="presentation"]` (`:4`).
- T: path `/movies` (`:48-54`).
- F: title, year, image. Also auto-clicks every server tab to trigger the download scripts (`:21-43`).
- S: `.film-box h1`, `.film-box > * span`, `.poster`, `.play`, `[role="presentation"] a`.
- M: —
- Rot: **high** (site gone).

**Web to Plex** (`cloud/webtoplex.js`)
- R: a query string is present and `#tmdb` has text (`:15`).
- T: `#info[type]` attribute (`:39`).
- F: title, year, image, IMDbID, TMDbID (from `#imdb`/`#tmdb`). Pre-fills `#apikey` with `TMDbAPI` on `/login` (`:44-57`).
- S: `#title`, `#year`, `#poster`, `#info`, `#imdb`, `#tmdb`, `#apikey`.
- M: —
- Rot: **low**. The owner controls the site.

**YouTube** (`cloud/youtube.js`)
- R: — (`init` itself retries).
- T: owner "YouTube Movies" → movie; `SxEx` or "season N" in the title → show; `/playlist` → list; else `'error'` (`:111-134`).
- F: title, year (from "release/air date" in the description), image. Opens and closes the description to read it (`:19-23`).
- S: `.more-button`, `.less-button`, `#offer-module-container[class*="movie-offer"]`, `#owner-container`, `#content ytd-expander`, `.super-title`, `#header #main-title`.
- M: —
- Rot: **high**. `ytd-expander`, `.more-button` and the offer module have been replaced.

### Plugins

**Fox Searchlight** (`plugin/foxsearchlight.js`)
- R: the `.pace` loader has opacity 0 (`:4`).
- T: always `'film'`.
- F: title, year (legacy `R.$1`), image.
- S: `.lockout h1`, `.lockout h3`, `.poster img`, `.pace`.
- Rot: **high** (site renamed).

**Free Movies Cinema** (`plugin/freemoviescinema.js`)
- R: `.row .row h2 a` (`:4`).
- T: always movie.
- F: title, year, image (from the style; returns the quote group `$1`, not the URL, T21).
- S: `.row .row h2 a`, `[class*="hero"i]`.
- Rot: **high**.

**Go / Freeform** (`plugin/go.js`)
- R: `.container h1` (`:4`).
- T: path `/movies/` (`:29-33`).
- F: title, year (movies only).
- S: `.container h1`, `.panel-meta-data`, `img.hero[alt]`.
- Rot: **high**.

**Indomovie** (`plugin/indomovietv.js`)
- R: `[itemprop="name"]` or `[itemprop="datePublished"]` (`:5`).
- T: always movie.
- F: title, year, image. Auto-clicks the server tabs (`:22-42`).
- S: `[itemprop="name"i]:not(meta)`, `[itemprop="datePublished"i]`, `[itemprop="image"i]`, `[class~="idtabs"i] [href^="#div"i]`.
- Rot: **medium** (`itemprop` is stable), but the domain churns.

**Kitsu** (`plugin/kitsu.js`)
- R: a lazy image has loaded (`:6`).
- T: a "Type" row via legacy `RegExp.$1` (`:31-35`).
- F: title (English/Romanized row), year (Aired row), image.
- S: `.media--information li`, `.media-poster img`.
- Rot: **high** (domain moved).

**MyAnimeList** (`plugin/myanimelist.js`)
- R: —
- T: last word of the "Type" row (`:11-15`).
- F: title, type, year, image.
- S: `table h2:nth-of-type(1) + *`, `table h2:nth-of-type(2) + *`, `… ~ .spaceit ~ .spaceit`, `table img`.
- Rot: **high**. Positional `h2`/`.spaceit` chains.

**MyShows** (`plugin/myshows.js`)
- R: —
- T: always show.
- F: title, year, IMDbID.
- S: `h1[itemprop="name"]` / `main > h1`, `div.clear > p.flat`, `[href*="/title/tt"]`.
- Rot: **medium**.

**Redbox** (`plugin/redbox.js`)
- R: `[data-test-id$="-name"]` (`:4`).
- T: path `/movies` (`:23-27`).
- F: title, year, image.
- S: `[data-test-id$="-name"i]`, `[data-test-id$="-info"i]`, `[data-test-id$="-img"i]`.
- Rot: **low** selectors, but the site is gone.

**Shana Project** (`plugin/shanaproject.js`)
- R: —
- T: always show.
- F: title, year, image (background-image).
- S: `.overview i`, `#header_big .header_info_block`, `#header_big .header_display_box`.
- Rot: **medium** (never loaded, T4).

**SnagFilms** (`plugin/snagfilms.js`)
- R: genre or show title (`:4`).
- T: path `/film` (`:29-33`).
- F: title, year (movies).
- S: `.header-title`, `[itemprop~="genre"i]`, `.show .title`.
- Rot: **high**.

**Toloka** (`plugin/toloka.js`)
- R: —
- T: always movie.
- F: title, year (from `.maintitle` "…/Title (YYYY)"), image, IMDbID (postlink).
- S: `.maintitle`, `.postbody img`, `.postlink`.
- Rot: **low/medium**. phpBB markup is stable, but the `url` matches every page (T25).

---

## 5. Likely-dead summary (no live checks)

| Integration | Kind | Reason |
|---|---|---|
| openload/oload (34 domains), consistent.stream, gounlimited.to, fembed.com | download | File hosts shut down (2019–2022) |
| gostream.site, vumoo.to | built-in | Piracy sites; domains gone |
| movieo.me | built-in | Service closed |
| vrv.co | built-in | Shut down 2023 (merged into Crunchyroll) |
| vudu.com | built-in | Rebranded Fandango at Home (2024); redirects |
| play.google.com/store/movies | built-in | Movies & TV moved to Google TV |
| itunes.apple.com movie/tv | built-in | Redirects to tv.apple.com |
| couchpotato.life | built-in | Unverified; likely gone |
| tv.verizon.com paths | built-in | Unverified; Fios web catalog changed |
| foxsearchlight.com, snagfilms.com, freemoviescinema.com, freeform.go.com, redbox.com, indomovietv.*, kitsu.io | plugin | Renamed, closed or moved domain |
| ShowRSS (options / popup only) | — | No script exists at all |
| download/plex.js via cors-anywhere.herokuapp.com | download | Public proxy demo restricted since 2021 |

Alive sites with effectively broken extractors (selectors from older layouts): IMDb, Rotten Tomatoes, Netflix, YouTube, Tubi, Google Search, Hulu, Amazon, Metacritic.

---

## 6. Coverage check

- **Manifest `content_scripts`:** all 36 entries are listed.
  - 5 `download/*` entries in §2 (`manifest.json:21-64`).
  - 30 site entries in §3.1 (`:66-185`).
  - The catch-all `*://*/*` in §3.1, last row (`:186-189`).
- **`cloud/*.js`:** all 32 files are listed.
  - 29 in §3.1: every built-in except Shana Project, which has no cloud file.
  - `metacritic`, `__layout__` and `__test__` in §3.2.
- **`cloud/plugin/*.js`:** all 11 files are listed in §3.3.
