# Web to Plex — bug candidates (site integrations)

Scope: `src/sites/**`, `src/cloud/**`, `src/download/*`, and the manifest `content_scripts`. Commit `b5f1bc7`.
Method: static reading only. No site was visited.
IDs `T#` are local to this file. Related core/settings items are cited as `B#` (`docs/triage/bugs-core.md`) and `S#` (settings `bugs.md`).

---

## High confidence

### T1. `cloud/itunes.js:73` — top-level `return` (known candidate)

As a standalone file, `return` outside a function is a `SyntaxError` (lint/parse failure). Inside the `prepare` wrapper (`plugn.js:286-372`) the code sits in an arrow-function body, so it parses. But when the page has no CSP `<meta>` (`:70-73`), the `return` exits the **wrapper** before the URL test and `init` (`plugn.js:330-371`). `executeScript` then yields `undefined`, which triggers the re-injection loop (core B25).

Two related problems:

- `ready` requires `top.__NewCSP__` (`:4`), which is set only after a CSP meta has been rewritten (`:92`). Pages without one are therefore never "ready" either.
- Rewriting a CSP `<meta>` after parse has no effect in browsers.

**Fix direction:** delete the CSP block (`:67-93`) and the `top.__NewCSP__` clause in `ready`.

### T2. `plugn.js:295` + names — consent is default-allow and keyed by derived names

The wrapper blocks only when consent is **exactly `false`** (`if(${ allowed } === false)`), and `GetConsent` returns `undefined` for unknown keys (`plugn.js:63`). As a result:

- **Google Play.** The stub sends `script: 'google.play'` (`sites/google/play.js:2`). The key read is `builtin_google.play`, but options stores `builtin_googleplay` (`options/index.js:155`). The user cannot disable Google Play.
- **Indomovie.** `sites/common.js:5` derives `indomovietv` from `indomovietv.club`. The key read is `plugin_indomovietv`, but options stores `plugin_indomovie` (`options/index.js:187, 2306`). The plugin runs even though it is "off" by default.
- **Every other site.** Any site without a stub sends `PLUGIN` with its hostname label. No key exists, so `allowed` is `undefined` and the fetched code runs. With Developer Mode off, it fetches `https://webtoplex.github.io/web/plugins/<label>.js`, and any file published there under that name is executed on that site (see core B15).

### T3. `download/plex.js:19-21, 36` — Plex token sent through a public third-party proxy

`getXML` prefixes every URL with `//cors-anywhere.herokuapp.com/`. The URLs carry `X-Plex-Token=<token>` in the query (`:19-21`), so the user's Plex account token goes to a third-party host. The public cors-anywhere demo has required opt-in since 2021, so the feature probably fails as well.

**Fix direction:** the background page already has `<all_urls>`. Fetch through a background message instead of a proxy.

### T4. `sites/shanaproject/index.js:2` — no `cloud/shanaproject.js`

The stub sends `SCRIPT 'shanaproject'`:

- In Developer Mode `plugn.js:578` fetches `cloud/shanaproject.js`, which does not exist. The fetch rejects, and the error is rethrown unhandled (`plugn.js:621`).
- Only `cloud/plugin/shanaproject.js` exists. It declares `let plugin`, and it is never requested, because the stub sets `init` and `sites/common.js:2-3` then skips.

The built-in Shana Project integration is therefore dead in Developer Mode. The non-dev case depends on `webtoplex.github.io/web/scripts/shanaproject.js`.

### T5. `cloud/imdb.js:4, 18-29, 35-47` — pre-2020 IMDb DOM

- `ready` waits for `#servertime`, which the current IMDb pages do not have. The script returns its timeout forever and never extracts anything.
- `.title_wrapper`, `#titleYear` and `.originalTitle` are also gone.

IMDb is the most-used source, so this is the highest-impact selector rot.

### T6. `cloud/metacritic.js` — offered as a plugin, but it cannot load as one

Options lists `plugin_metacritic` (`options/index.js:194, 2316`), and there is no manifest entry. `sites/common.js` sends `PLUGIN 'metacritic'`. That path:

- fetches `cloud/plugin/metacritic.js`, which is missing (or `…/web/plugins/metacritic.js`);
- and even if fetched, `cloud/metacritic.js` declares `let script`, while the wrapper calls `plugin.url` / `plugin.init`, giving a `ReferenceError`.

### T7. `cloud/imdb.js:96-98` — `getIMDbID` reads `.content` from a list

`$('meta[property="pageId"]')` returns a `queryBy` array, which is always truthy, and `tag.content` is `undefined`. IMDb pages never pass their own ID.

**Fix:** `.first`.

### T8. `cloud/tvmaze.js:22-26` — TVmaze ID passed as `TVDbID`

`getTVDbID` returns the number in `/shows/<id>/…`, which is TVmaze's own ID. `Identify` trusts a given `TVDbID` (`utils.js:1654, 1747-1748`), and `PUSH_SONARR` sends it as `tvdb:<id>` (`background.js:375-380`). This can add the **wrong series**.

**Fix:** read the TheTVDB link on the page, or leave `TVDbID` empty.

### T9. `cloud/rottentomatoes.js:24` — year always 0

`.replace(/[^]*(\d{4})/, '')` deletes everything up to and including the year, so the year is lost. `+''` gives `0`, and other text gives `NaN`. It should be `'$1'` with a trailing `[^]*`.

### T10. `cloud/rottentomatoes.js:66-68`, `cloud/tmdb.js:64-66` — list `process(element)` ignores `element`

`$('.movieTitle')`, `$('.poster')`, `$('.title')` and similar run on the whole document, so every list item returns the first card's data. Compare `cloud/letterboxd.js:65-66`, which passes `element` correctly.

### T11. `cloud/verizon.js:18, 21` — on-demand TV path throws

- `.replace(/…/i)` has no replacement argument, so `"undefined"` is inserted.
- `decodeURL` does not exist; `decodeURIComponent` was probably meant.
- `toCpas` is a typo for `toCaps`.

Either of the last two throws `ReferenceError`/`TypeError`.

Also, `getType` (`:45-53`) returns `'show'` only for paths containing "series". The `url` pattern only admits `(movie|show)s?`, so shows always get `'error'`.

### T12. `cloud/rottentomatoes.js:56` — `/^\/browse\/i/` has the flag inside the pattern

The pattern matches the literal "/browse/i…". List mode is never detected; `/browse/...` falls through to `/^\/m/`/`/^\/t/` and then `'error'` → 1000 ms retry loop.

### T13. `cloud/letterboxd.js:78-82` — null dereference in `minions`

`actions.id` is read before the `if(!actions)` check. When `UseMinions` is on, pages without an action panel throw.

### T14. `cloud/youtube.js:86-106` — 10 ms interval and forced UI clicks

`init` clicks the description "more"/"less" buttons on every watch page (`:19-23`). After the first success it starts `setInterval(…, 10)`, which re-runs `init(true)` while the description is collapsed (`:87-92`). `init` returns early (`:16-17`) before reaching `clearInterval` (`:105`) whenever `.opened` or a dropdown is present. The interval can therefore keep firing every 10 ms and re-clicking.

---

## Medium confidence

### T15. `cloud/tvdb.js:38-43` — TVDb ID only from numeric paths

TheTVDB now uses slug URLs (`/series/<slug>`), so `TVDbID` is `undefined`. Sonarr, Medusa and Sick Beard need it (`utils.js:2400, 2457, 2513`). The ID has to come from `Identify` instead, which costs extra lookups and risks misses.

### T16. Missing null checks on images and titles: one missing poster kills `init`

When the element is absent, `.src`/`.textContent` throws. The wrapper then returns nothing, and the B25 loop follows. Locations:

- `cloud/allocine.js:16`
- `cloud/fandango.js:12-14` (`image.empty` on an Element is always `undefined`)
- `cloud/justwatch.js:18`
- `cloud/moviemeter.js:20`
- `cloud/tubi.js:14-16`
- `cloud/hulu.js:14-18` (`.child(n)` may be `undefined`)
- `cloud/webtoplex.js:31-33`
- `cloud/plugin/kitsu.js:19-21`
- `cloud/plugin/foxsearchlight.js:19`
- `cloud/plugin/indomovietv.js:17-19`
- `cloud/plugin/redbox.js:16-19`
- `cloud/plugin/myanimelist.js:8-20`
- `cloud/plugin/myshows.js:12-21`
- `cloud/plugin/toloka.js:17-27`

### T17. Legacy `RegExp.$n` after a regex that may not match

When the match fails, these read stale values from whichever regex ran last in the page's isolated world, including `utils.js`:

- `cloud/allocine.js:18-19`
- `cloud/amazon.js:26, 33`
- `cloud/google.js:33-35`
- `cloud/vudu.js:14-15`
- `cloud/vumoo.js:14-17`
- `cloud/letterboxd.js:70-71`
- `cloud/movieo.js:69-70`
- `cloud/plugin/foxsearchlight.js:21-22`
- `cloud/plugin/kitsu.js:32-34`
- `cloud/plugin/freemoviescinema.js:17-18`
- `cloud/plugin/redbox.js:16-17`
- `cloud/plugin/toloka.js:18-23`
- `cloud/metacritic.js:41-43`

### T18. `cloud/flickmetrix.js:56-57` — returns a `Notification` object

On an empty list, `init` returns `new Notification(...)`. `handle` treats it as a data object, and `title.replace` throws at `plugn.js:449`. Also, `Notification` here is the browser's Web Notification constructor, because `utils.js`'s class is closure-private (`utils.js:274`). Passing a string as the second argument throws `TypeError`, so `init` throws instead of returning.

### T19. `cloud/google.js:1-2, 26` — `FILM` selector uses the TMDb **tv** path

`FILM` includes `[href*="themoviedb.org/tv/"]`; `/movie/` was intended. On the show branch, `$(SHOW).first.querySelector('*')` can be `null`, which throws.

### T20. `cloud/amazon.js:38` — `.src` on a `queryBy` array

`$('.av-fallback-packshot img').src` is always `undefined`; `.first` is missing. The header comment says "Toloka Plugin" (copy-paste, `:1`).

### T21. `cloud/plugin/freemoviescinema.js:19` — image regex returns the quote

`.replace(/url\((["']?)([^]+?)\1\)/, '$1')` substitutes group 1 (the quote character), not group 2 (the URL). The style string is returned with the `url(...)` removed.

### T22. `download/*.js:10` (`plex.js:131`) — start hook may never fire

`check = document.body.onload = …` is set by a content script at `document_idle`. If the frame's `load` event already fired, `check` never runs, and the download link is never found. It also overwrites any page-assigned `body.onload` handler.

**Fix direction:** call `check()` directly.

### T23. `cloud/vumoo.js:58-68`, `cloud/plugin/indomovietv.js:49-59` — unchecked `message` listener

Any frame posting `{ from: … }` or `{ found: true }` cancels the auto-click timers. This is benign, but it is another origin-unchecked listener (compare core B21).

### T24. `cloud/vrv.js:90-91` — `minions()` calls `script.init()`

It re-runs extraction and its side effects just to get a title.

### T25. `cloud/plugin/toloka.js:12` — `url` matches every page

`*://*.toloka.to/*` covers forum index and search pages. `.maintitle` is often missing there, so `init` throws (T16).

### T26. `cloud/webtoplex.js:44-57` — `return -1` inside `setTimeout`

The return value is discarded. The comments ("don't run on the login page") suggest that the author believed it stops the script.

---

## Low confidence / hygiene

### T27. `cloud/trakt.js:37-48, 99-103` — dead list branch

The list branch is unreachable (`getType` never returns `'list'`), and `process` returns an empty object.

### T28. `cloud/vudu.js:36` — leftover `console.log({ actions })`

### T29. `cloud/itunes.js:45-49` — `adjustButton` assumes the button exists

`$('.web-to-plex-button').first` can be `undefined` 1 s after `init`.

### T30. `cloud/rottentomatoes.js:103` — wrapper never inserted

`element.appendChild(minion)` appends the minion, not its `parent` wrapper. The wrapper `div` is never inserted.

### T31. `cloud/__test__.js` / `sites/__test__.js` — test fixtures in the shipped `src/`

No manifest entry or options key exists for them, but `cloud/__test__.js` would load if a page sends `SCRIPT '__test__'`. Consider moving them under `tests/`.

### T32. `options/index.js:2186` / `popup/index.html:133` — ShowRSS listed with no script

ShowRSS is listed as a built-in site, but it has no manifest entry, stub or cloud script.
