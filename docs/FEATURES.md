# Web to Plex — settings and features inventory

Source: repo `Ephellon/web-to-plex`, branch `claude/extension-rewrite-features-b4afna`, commit `b5f1bc7` (`src/` unchanged since `cb7ec2a`).
Scope: `src/options/index.html`, `src/options/index.js`, `src/options/xml.js`, `src/options/compare.js`, `src/popup/*`.
Readers checked: `src/background.js`, `src/plugn.js`, `src/utils.js`, `src/helpers.js`, `src/sites/**`, `src/cloud/**`.
This was a read-only survey; no code was run. In this file, `idx.js` means `src/options/index.js` and `idx.html` means `src/options/index.html`.

---

## 0. How options are saved and read

**Saving: `idx.js`**

- `__options__` (`idx.js:31-202`) is the list of keys the page handles.
- `getOptionValues` (`idx.js:624-658`) reads each `[data-option="<key>"]` element in that list. It uses `.checked` for checkboxes and `.value` for everything else. It also rebuilds `__caught`/`__theme` (and compresses them when `UseLZW` is on).
- Three save paths write to `chrome.storage.sync` (falling back to `local`, `idx.js:16`). Each one then sends `UPDATE_CONFIGURATION` (`idx.js:1811, 1956, 1985`):
  - `saveOptions` (`idx.js:1633-1822`) writes `{ ...options, servers: [...] }` at `idx.js:1800`. It adds `IGNORE_PLEX=false` (`:1672`), `plexURLRoot` (`:1714`), and `proxy` (`:1773`). It also writes `ClientID` separately (`:1712`).
  - `saveOptionsWithoutPlex` (`idx.js:1824-1967`) writes `options` at `idx.js:1945`. It adds `IGNORE_PLEX=true` (`:1832`), a fixed `plexURL`/`plexURLRoot` (`:1873`), and `proxy` (`:1925`). It writes `ClientID` (`:1868`) only if unset.
  - `saveOptionsWhileResetting` (`idx.js:1969-1996`) writes the raw `getOptionValues()` at `idx.js:1974`, with **no** `proxy`, `servers`, or `IGNORE_PLEX`.
- The first two paths also normalise every `<svc>URLRoot` to end in `/` and start with `http(s)://` (`idx.js:1714-1745`, `:1873-1897`).

**Restoring: `idx.js`**

- `restoreOptions` (`idx.js:2025-2116`, run on `DOMContentLoaded`, `:2417`) copies stored values back into the inputs (`:2029-2055`).
- It then re-runs every service test in "refreshing" mode (`:2057-2074`), which re-fetches profiles and paths.
- It also recomputes `__domains` and sets `__defaults='false'` (`:2076-2086`).

**Reading at runtime**

- `background.js:106-141` reads `plexToken`, `servers`, `IGNORE_PLEX`, and `DeveloperMode`.
- `plugn.js:113-219` builds `server`, `plexURL`, `<svc>URL` and `<svc>BasicAuth`, and reads `builtin_*`/`plugin_*` (`:63`) and `UseMinions` (`:276`).
- `utils.js:1048-1166` (`options()`) derives the same values for the content scripts. `ParsedOptions` (`utils.js:1169-1455`) keeps the full set as the private `__CONFIG__`. Its copy `configuration` hides keys matching `/username|password|token|api|server|url|storage|cache|proxy|client|builtin|plugin|qualit/i` unless a cloud script was granted them (`utils.js:1180-1191`).

**localStorage (extension origin)**

The options page also writes `localStorage` through its own `save()` (`idx.js:485-495`); keys are base64-encoded with `btoa(name)`. The popup (§5) and `plugn.js` (`:495-496`) read these keys.

**Developer Mode defaults to on.** `DeveloperMode` is pre-checked (`idx.html:956`), so the first save stores `true`. With it on:

- `plugn.js` injects the **local** `cloud/*.js` scripts instead of fetching from `webtoplex.github.io` (`plugn.js:511-519, 576-584`).
- All three runtimes log to the console (`background.js:164`, `plugn.js:226`, `utils.js:1463`).

This narrows core bug B15 (`docs/triage/bugs-core.md`): remote fetching happens only when `DeveloperMode` is off or not yet saved.

---

## 1. Option table

Notes for every row:

- **Saved:** every `__options__` key is saved through `getOptionValues` (`idx.js:627-636`) and then the save paths in §0 (`idx.js:1800, 1945, 1974`). The "Saved" column gives the `__options__` line.
- **Restored:** every key is restored at `idx.js:2029-2037`.
- **Readers:** "Readers" lists runtime readers outside the options page. "—" means nothing outside the options page reads the key.
- **Default:** "Default" comes from the HTML `default` / `checked` / `value` attributes, which "Reset" also uses (`idx.js:2486-2496`).

### 1.1 Plex settings

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `plexToken` | "Use your Plex token" (`idx.html:44-45`) | text | `''` | `idx.js:34` | `background.js:109`; `plugn.js:116`; `utils.js:1051, 3172` | Required unless `IGNORE_PLEX`. Used to list servers (`idx.js:497-517`). The server token, not this one, is what searches use. |
| `UseOmbi` | "Would you like to use Ombi to fill in your Manager Settings?" (`idx.html:72-74`) | checkbox | `true` | `idx.js:35` | — (options only: `idx.js:685, 702`) | During "Attach to Ombi" login, also fill in the Ombi/CouchPotato/Radarr/Sonarr fields from Ombi. |
| `preferredServer` | "Select a preferred server" (`idx.html:86-87`) | select | `''` | `idx.js:36` | — (options only: `idx.js:19, 1637`) | Picks which `PlexServers` entry becomes `servers[0]` on save. |
| `plexURL` | "Plex Server URL" (`idx.html:98-99`) | text | `''` → `https://app.plex.tv/` on save (`idx.js:1714`) | `idx.js:33` | `plugn.js:135-136`; `utils.js:1070-1071, 3172, 3207` | Base for the "Watch on Plex" link (`utils.js:3207`). Not used for searching; searches use `servers[0].connections`. |

### 1.2 Ombi

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `usingOmbi` | checkbox in the "Ombi (Movies/TV Shows)" summary (`idx.html:115`) | checkbox (locked until a test passes) | `false` | `idx.js:40` | `plugn.js:167`; `utils.js:333, 344, 409, 420, 1114, 1248, 1670, 1711, 2068, 2077, 2777, 2844, 2892, 3041, 3132` | Makes Ombi the first-choice manager for both movies and shows. |
| `ombiURLRoot` | "Ombi URL" (`idx.html:121-122`) | text | `''` | `idx.js:41` | `plugn.js:167-168`; `utils.js:410, 421, 1114-1115, 1711-1712, 2185, 2207` | Base for `api/v1/Request/*` and `api/v1/Search/*`. |
| `ombiToken` | "Ombi API Key" (`idx.html:129-130`) | text | `''` | `idx.js:42` | `plugn.js:167`; `utils.js:1114, 1250, 1648, 2185-2186` | `apikey` query and `ApiKey` header. |
| `ombiBasicAuthUsername` / `ombiBasicAuthPassword` | "Username" / "Password" (`idx.html:142, 146`) | text, **commented out** (`idx.html:137-154`) | — | not in `__options__` | — | Dead UI. |

### 1.3 Watcher (movies)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `usingWatcher` | Watcher summary checkbox (`idx.html:170`) | checkbox | `false` | `idx.js:54` | `plugn.js:179`; `utils.js:337, 359, 377, 413, 1126, 1277, 2779, 2846, 2894, 3041, 3132` | Enables Watcher for movies. Ombi wins if both are on (`utils.js:2777-2781`). |
| `watcherURLRoot` | "Watcher URL" (`idx.html:176-177`) | text | `''` | `idx.js:55` | `plugn.js:179-180`; `utils.js:414, 1126-1127, 2307, 2330` | Base for `api/`. |
| `watcherToken` | "Watcher API Key" (`idx.html:184-185`) | text | `''` | `idx.js:56` | `plugn.js:179`; `utils.js:1126, 1279, 2308` | `apikey` query. |
| `watcherBasicAuthUsername` | "Username" (`idx.html:197-198`) | text | `''` | `idx.js:57` | `plugn.js:149-151`; `utils.js:1084-1086, 1281` | Basic auth. **Ignored for pushes**: `background.js:254` sends no headers. |
| `watcherBasicAuthPassword` | "Password" (`idx.html:203-204`) | text (becomes `password` once saved, `idx.js:2045`) | `''` | `idx.js:58` | `plugn.js:152`; `utils.js:1087, 1282` | Basic auth. |
| `watcherStoragePath` | "Watcher Storage Path" (`idx.html:219-220`) | select, **disabled** | `[Empty]` | `idx.js:59` | `utils.js:2309` | Shown only. It is filled from Watcher's `moverpath` (`idx.js:953`), and sent as `StoragePath`, which is used only in the success text (`background.js:260`). |
| `watcherQualityProfileId` | "Quality Profile" (`idx.html:225-226`) | select | `''` (`'Default'` in tests) | `idx.js:60` | `utils.js:1280` | Quality used for the `liststatus` charge. Required to save (`idx.js:1691`). |

### 1.4 Radarr (movies)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `usingRadarr` | Radarr summary checkbox (`idx.html:239`) | checkbox | `false` | `idx.js:63` | `plugn.js:185`; `utils.js:335, 357, 375, 393, 411, 1132, 1304, 1670, 1713-1714, 1852, 1915, 1994, 2781, 2848, 2896, 3041, 3132` | Enables Radarr for movies. Used after Ombi and Watcher. |
| `radarrURLRoot` | "Radarr URL" (`idx.html:245-246`) | text | `''` | `idx.js:64` | `plugn.js:185-186`; `utils.js:412, 1132-1133, 1714-1719, 2364, 2389` | Base for `api/movie/` (v1/v2 API). |
| `radarrToken` | "Radarr API Key" (`idx.html:253-254`) | text | `''` | `idx.js:65` | `plugn.js:185`; `utils.js:1132, 1306, 1716-1719, 2365` | `X-Api-Key` header + `apikey` query. |
| `radarrBasicAuthUsername` | "Username" (`idx.html:264-265`) | text | `''` | `idx.js:66` | `plugn.js:155-157`; `utils.js:1090-1092, 1307` | Basic auth. |
| `radarrBasicAuthPassword` | "Password" (`idx.html:269-270`) | text | `''` | `idx.js:67` | `plugn.js:158`; `utils.js:1093, 1308` | Basic auth. |
| `radarrStoragePath` | "Radarr Storage Path" (`idx.html:285-286`) | select (value = root-folder **id**, `idx.js:1089`) | `''` | `idx.js:68` | `utils.js:2366, 2849` | Converted id → path through `radarrStoragePaths` (`utils.js:2353`); sent as `rootFolderPath`. Required to save (`idx.js:1688`). |
| `radarrQualityProfileId` | "Quality Profile" (`idx.html:294-295`) | select | `''` | `idx.js:69` | `utils.js:2367` | Sent as `qualityProfileId`. Required to save (`idx.js:1694`). |

### 1.5 CouchPotato (movies)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `usingCouchPotato` | CouchPotato summary checkbox (`idx.html:308`) | checkbox | `false` | `idx.js:90` | `plugn.js:173`; `utils.js:339, 415, 1120, 1331, 2783, 2856, 2898, 3041, 3132` | Enables CouchPotato. Lowest movie priority. |
| `couchpotatoURLRoot` | "CouchPotato URL" (`idx.html:314-315`) | text | `''` | `idx.js:91` | `plugn.js:173-174`; `utils.js:416, 1120-1121, 2245` | Base for `api/<token>/…`. |
| `couchpotatoToken` | "CouchPotato API Key" (`idx.html:322-323`) | text | `''` | `idx.js:92` | `plugn.js:173-174`; `utils.js:1120-1121` | Path segment of the API URL. |
| `couchpotatoBasicAuthUsername` | "Username" (`idx.html:334-335`) | text | `''` | `idx.js:93` | `plugn.js:142-144`; `utils.js:1077-1079` | Basic auth for background pushes. |
| `couchpotatoBasicAuthPassword` | "Password" (`idx.html:339-340`) | text | `''` | `idx.js:94` | `plugn.js:145`; `utils.js:1080` | Basic auth. |
| `couchpotatoQualityProfileId` | "Quality Profile" (`idx.html:356-359`) | select, **commented out** | — | commented (`idx.js:95`) | — | Dead UI. |
| `enableCouchPotato` | "Enable CouchPotato" button (`idx.html:362-364`) | button, **commented out** | — | not in `__options__` | — | Dead UI. |

### 1.6 Medusa (TV)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `usingMedusa` | Medusa summary checkbox (`idx.html:376`) | checkbox | `false` | `idx.js:45` | `plugn.js:197`; `utils.js:350, 366, 384, 400, 426, 1144, 1389, 1670, 1713, 1724, 1847, 1910, 1989, 2068, 2077, 2787, 2852, 2902, 3041, 3132` | Enables Medusa for shows. Used after Ombi and Sonarr. |
| `medusaURLRoot` | "Medusa URL" (`idx.html:382-383`) | text | `''` | `idx.js:46` | `plugn.js:197-198`; `utils.js:427, 1144-1145, 1724-1727, 2478-2479, 2502` | Base for `api/v2/`. |
| `medusaToken` | "Medusa API Key" (`idx.html:390-391`) | text | `''` | `idx.js:47` | `plugn.js:197`; `utils.js:1144, 1391, 1726-1727, 2480` | `api_key` query / `X-Api-Key`. |
| `medusaBasicAuthUsername` | "Username" (`idx.html:401-402`) | text | `''` | `idx.js:48` | `utils.js:1102-1104, 1392` | Basic auth. `plugn.js` does not derive it. |
| `medusaBasicAuthPassword` | "Password" (`idx.html:405-406`) | text | `''` | `idx.js:49` | `utils.js:1105, 1393` | Basic auth. |
| `medusaStoragePath` | "Medusa Storage Path" (`idx.html:420-421`) | select (value = path) | `''` | `idx.js:50` | `utils.js:2481, 2853` | Sent as `StoragePath`; used only in the success text (`background.js:490-503`). |
| `medusaQualityProfileType` | "Quality Profile Type" (`idx.html:429-430`) | select (Default / User Defined / Any) | index 0 | **not saved** (missing from `__options__`) | — (options only: `idx.js:1292`) | Chooses which Medusa quality list the test loads. |
| `medusaQualityProfileId` | "Quality Profile" (`idx.html:435-436`) | select | `''` | `idx.js:51` | `utils.js:2482` | Sent as `QualityID`. The background ignores it (`background.js:449-520`). |

### 1.7 Sonarr (TV)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `usingSonarr` | Sonarr summary checkbox (`idx.html:449`) | checkbox | `false` | `idx.js:72` | `plugn.js:191`; `utils.js:346, 364, 382, 398, 422, 1138, 1364, 1670, 1713, 1720, 1852, 1915, 1994, 2068, 2077, 2785, 2850, 2900, 3041, 3132` | Enables Sonarr for shows. Used after Ombi. |
| `sonarrURLRoot` | "Sonarr URL" (`idx.html:455-456`) | text | `''` | `idx.js:73` | `plugn.js:191-192`; `utils.js:423, 1138-1139, 1720-1723, 2423, 2446` | Base for `api/series/`. |
| `sonarrToken` | "Sonarr API Key" (`idx.html:463-464`) | text | `''` | `idx.js:74` | `plugn.js:191`; `utils.js:1138, 1366, 1722-1723, 2424` | `X-Api-Key` + `apikey`. |
| `sonarrBasicAuthUsername` | "Username" (`idx.html:474-475`) | text | `''` | `idx.js:75` | `plugn.js:161-163`; `utils.js:1096-1098, 1367` | Basic auth. |
| `sonarrBasicAuthPassword` | "Password" (`idx.html:479-480`) | text | `''` | `idx.js:76` | `plugn.js:164`; `utils.js:1099, 1368` | Basic auth. |
| `sonarrStoragePath` | "Sonarr Storage Path" (`idx.html:495-496`) | select (value = id) | `''` | `idx.js:77` | `utils.js:2425, 2851` | Converted id → path (`utils.js:2412`); sent as `rootFolderPath`. |
| `sonarrQualityProfileId` | "Quality Profile" (`idx.html:504-505`) | select | `''` | `idx.js:78` | `utils.js:2426` | Sent as `qualityProfileId`. |

### 1.8 Sick Beard (TV)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `usingSickBeard` | Sick Beard summary checkbox (`idx.html:518`) | checkbox | `false` | `idx.js:81` | `plugn.js:203`; `utils.js:348, 368, 386, 402, 424, 1150, 1415, 1670, 1713, 1729, 1857, 1920, 1999, 2068, 2077, 2789, 2854, 2904, 3041, 3132` | Enables Sick Beard for shows. Lowest TV priority. |
| `sickBeardURLRoot` | "Sick Beard URL" (`idx.html:524-525`) | text | `''` | `idx.js:82` | `plugn.js:203-204`; `utils.js:425, 1150-1151, 1731-1732, 2538, 2562` | Base for `api/<token>/`. |
| `sickBeardToken` | "Sick Beard API Key" (`idx.html:532-533`) | text | `''` | `idx.js:83` | `plugn.js:203`; `utils.js:1150, 1417, 1731-1732, 2538-2539` | Path segment. |
| `sickBeardBasicAuthUsername` | "Username" (`idx.html:545-546`) | text | `''` | `idx.js:84` | `utils.js:1108-1110, 1418` | Basic auth. |
| `sickBeardBasicAuthPassword` | "Password" (`idx.html:549-550`) | text | `''` | `idx.js:85` | `utils.js:1111, 1419` | Basic auth. |
| `sickBeardStoragePath` | "Sick Beard Storage Path" (`idx.html:564-565`) | select (value = path) | `''` | `idx.js:86` | `utils.js:2540, 2855` | `location` for `show.addnew` (`background.js:605, 622`). |
| `sickBeardQualityProfileType` | "Quality Profile Type" (`idx.html:573-574`) | select (Initial / Archive) | index 0 | **not saved** | — (options only: `idx.js:1418`) | Chooses `initial` vs `archive` qualities in the test. |
| `sickBeardQualityProfileId` | "Quality Profile" (`idx.html:578-579`) | select | `''` | `idx.js:87` | `utils.js:2541` | Sent as `initial` (`background.js:621`). |

### 1.9 Theme

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `theme:button-shape` | "What shape should the master button be?" (`idx.html:602-606`) | checkbox, `theme="true:box"` | `false` (circle) | `idx.js:198` (collected dynamically) | — directly. Applied through `__theme` key `button-shape-box` → class (`utils.js:2592-2601`) → `sites/theme.css:72-96` | Box (top-centre) vs circle button. |
| `theme:button-location` | "Which direction should the master button open?" (`idx.html:618-622`) | checkbox, `theme="true:right"` | `false` | `idx.js:198` | through `__theme` key `button-location-right` → `sites/theme.css:53` | Circle opens to the left or the right. |
| `theme:button-opacity` | "How transparent should the master button be when hidden?" (`idx.html:627-629`) | range 0–10, step 5, `theme="for:hidden"` | `10` | `idx.js:198` | through `__theme` key `button-opacity-hidden` → attribute (`utils.js:2596`) → `sites/theme.css:59-67` | Opacity of the hidden button. |
| `UseMinions` | "Allow the use of custom (minion) buttons?" (`idx.html:635-639`) | checkbox | `false` | `idx.js:197` | `plugn.js:276` | Adds `<type>.minions()` to each cloud script's `runOnInit` (`plugn.js:275-280`). |

`theme:*` → `__theme` mapping is done by `UpdateTheme` (`idx.js:2580-2603`). See bugs S1 and S2: these changes do not reliably reach `__theme`.

### 1.10 Sites (generated)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `builtin_<name>` (31 keys: `allocine`, `amazon`, `couchpotato`, `fandango`, `flickmetrix`, `google`, `googleplay`, `hulu`, `imdb`, `justwatch`, `letterboxd`, `moviemeter`, `movieo`, `netflix`, `plex`, `rottentomatoes`, `shanaproject`, `showrss`, `tmdb`, `tvmaze`, `tvdb`, `trakt`, `vrv`, `verizon`, `vudu`, `vumoo`, `youtube`, `itunes`, `gostream`, `tubi`, `webtoplex`) | site title (`builtins`, `idx.js:2170-2204`), rendered at `idx.js:2249-2261` | checkbox | `true` | `idx.js:149-180` | `plugn.js:63` (`GetConsent`, key `builtin_<name>`) | Consent to run the cloud script for that site. **`tabchange` looks it up by host (`builtin_imdb.com`), so only the `SCRIPT`-message path matches (bug S3).** |
| `plugin_<name>` (11 keys: `toloka`, `myanimelist`, `myshows`, `indomovie`, `redbox`, `kitsu`, `go`, `snagfilms`, `freemoviescinema`, `foxsearchlight`, `metacritic`) | plugin title (`plugins`, `idx.js:2305-2319`), rendered at `idx.js:2364-2376` | checkbox | `false` | `idx.js:183-194` | `plugn.js:63` (key `plugin_<name>`) | Consent for experimental sites. |
| `#all-builtin` / `#all-plugin` | toggle-all checkboxes (`idx.html:653, 660`) | checkbox, no key | — | not saved | — | Bulk-toggles the site checkboxes (`idx.js:2294-2302, 2405-2413`). |

The site checkboxes also write `localStorage` keys `permission:<host>`, `script:<host>` and `builtin:<host>` (`idx.js:2271-2292, 2382-2403`; see §2).

### 1.11 Connection (proxy)

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `UseProxy` | "Force Secure Connections" (`idx.html:677-679`) | checkbox | `false` | `idx.js:99` | — directly. Read as `proxy.enabled` (`utils.js:1764, 1775`). | Route `Identify` lookups through the proxy. |
| `ProxyURL` | "Proxy URL & Syntax" (`idx.html:689-690`) | text | `''` | `idx.js:100` | read as `proxy.url` (`utils.js:1761, 1765-1768`) | Proxy template with `{url}`, `{enc-url}`, `{b64-url}`. Insecure schemes are refused at save (`idx.js:1591-1592`). |
| `ProxyHeaders` | "Proxy Headers" (`idx.html:705-706`) | `contenteditable` code editor (`.value` set by `updateEditor`, `idx.js:3248`) | `''` | `idx.js:101` | read as `proxy.headers` (`utils.js:1762` → `HandleProxyHeaders` `utils.js:1607-1637`) | `name=value` lines with `@{url}` and `@object.path` substitution. |

### 1.12 Media

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `UseAutoGrab` | "Auto Grab" (`idx.html:747-749`) | checkbox (all/ask) | `false` | `idx.js:104` | `utils.js:1460` | On: grab every found item. Off: show the "select" prompt (`utils.js:2806`). |
| `AutoGrabLimit` | "Maximum Auto Grabs" (`idx.html:760-761`) | range 10–100, step 10 | `30` | `idx.js:105` | `utils.js:1461` | Auto-grab only when the item count is below the limit (`utils.js:2806`). |
| `PromptLocation` | "Prompt for Save Location" (`idx.html:770-772`) | checkbox | `false` | `idx.js:106` | `utils.js:493, 738, 814, 2348-2357, 2407-2416, 2464-2471, 2520-2527` | Show the storage-path `<select>` in prompts before pushing. |
| `PromptQuality` | "Prompt for Quality" (`idx.html:785-787`) | checkbox | `false` | `idx.js:107` | `utils.js:489, 734, 808, 2348-2355, 2407-2414, 2464-2469, 2520-2525` | Show the quality `<select>` in prompts. |

### 1.13 Notifications

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `NotifyNewOnly` | "Ignore Found Items" (`idx.html:804-806`) | checkbox | `false` | `idx.js:110` | `utils.js:285` | Suppress error/warning toasts that say "already exists/added". |
| `NotifyOnlyOnce` | "Ignore Repetitive Notifications" (`idx.html:815-817`) | checkbox | `false` | `idx.js:111` | `utils.js:285` | Suppress repeat `info` toasts after the first. |

### 1.14 Search

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `UseLoose` | "Loose Searching" (`idx.html:832-834`) | checkbox | `true` | `idx.js:114` | `utils.js:1980` | Enables the third, fuzzy matching pass in `Identify`. |
| `UseLooseScore` | "Searching Sensitivity" (`idx.html:838-840`) | range 0–100, step 5 | `40` | `idx.js:115` | `utils.js:1826` | Passing score for fuzzy matching. |
| `ManagerSearch` | "Manager Searching" (`idx.html:851-853`) | checkbox | `false` | `idx.js:116` | `utils.js:1656` | `Identify` asks Ombi/Radarr/Sonarr/Medusa before the public APIs. |
| `UseLowCache` | "ID Fetching Mode" (`idx.html:865-867`) | checkbox (all/min) | `false` | `idx.js:117` | `utils.js:826, 1244` | ALL: on every page load, fetch every ID from every enabled manager (`utils.js:1244-1438`). |

### 1.15 Advanced

| Key | Label | Input | Default | Saved | Readers | Effect |
|---|---|---|---|---|---|---|
| `OMDbAPI` | "OMDb" (`idx.html:886-887`) | text | `''` | `idx.js:120` | `utils.js:1647` | OMDb key. Falls back to the literal `'PlzBanMe'`. |
| `TMDbAPI` | "TMDb" (`idx.html:894-895`) | text | `''` | `idx.js:121` | `utils.js:1646`; `cloud/webtoplex.js:48-49` | TMDb key. Falls back to a hard-coded key. Also pre-fills the key field on webtoplex.github.io. |
| `UseLZW` | "Data Compression" (`idx.html:915-917`) | checkbox | `false` | `idx.js:122` | `utils.js:1193, 2532` | BWT+LZW-compress `__caught` and `__theme` (`idx.js:654-655`; `utils.js:1197, 1226, 2585`). It also disables the Copy/Paste section (`idx.js:2946-2968`). |
| `DeveloperMode` | "Developer Mode" (`idx.html:954-956`) | checkbox | `true` | `idx.js:123` | `background.js:164`; `plugn.js:226`; `utils.js:1463` | Turns on console logging. In `plugn.js` it also switches to local `cloud/` scripts and `top.<instance>` naming (`plugn.js:267, 511-519, 576-584`). In the options page it also controls GitHub "latest" vs "all releases" (`idx.js:2814-2857`). |
| (none) | "Yes, Reset" (`idx.html:906`) | button | — | — | — | Resets inputs to `default` and sets `RESETTING_SETTINGS` (`idx.js:2483-2503`). |
| (none) | "Configuration Data" + "Generate"/"Restore" (`idx.html:928-936`) | text + buttons | — | — | — | Export: `btoa(JSON.stringify(getOptionValues()))` (`idx.js:2459-2466`). Import: `restoreOptions(atob(...))` (`idx.js:2443-2456`). |
| (none) | "Yes, Erase" (`idx.html:943`) | button | — | — | — | Removes every `~/cache/*` storage key, then calls `saveOptions` (`idx.js:2469-2480`). |

### 1.16 Hidden inputs (`idx.html:1047-1070`)

All are `<input data-option=…>` inside `.hide`, filled by code and not editable by the user.

| Key | Written by (options) | Saved | Readers | Effect |
|---|---|---|---|---|
| `watcherQualities` | `idx.js:947` (Watcher test) | `idx.js:126` | `utils.js:360` | Quality list for the prompt `<select>`. |
| `radarrQualities` | `idx.js:1050` | `idx.js:127` | `utils.js:358` | Same, for Radarr. |
| `sonarrQualities` | `idx.js:1180` | `idx.js:128` | `utils.js:365` | Same, for Sonarr. |
| `medusaQualities` | `idx.js:1313` | `idx.js:129` | `utils.js:367` | Same, for Medusa (`{value, name}` objects, so `Q.id` is `undefined`, `utils.js:490`). |
| `sickBeardQualities` | `idx.js:1440` | `idx.js:130` | `utils.js:369` | Same, for Sick Beard. |
| `watcherStoragePaths` | `idx.js:955` (**a string or object, not an array**) | `idx.js:131` | `utils.js:378` | Location list for the prompt. |
| `radarrStoragePaths` | `idx.js:1095` | `idx.js:132` | `utils.js:376, 2353` | id → path lookup. |
| `sonarrStoragePaths` | `idx.js:1224` | `idx.js:133` | `utils.js:383, 2412` | id → path lookup. |
| `medusaStoragePaths` | `idx.js:1348` | `idx.js:134` | `utils.js:385, 2472` | id (= path) → path lookup. |
| `sickBeardStoragePaths` | `idx.js:1483` | `idx.js:135` | `utils.js:387, 2528` | index → path lookup. |
| `__radarrQuality` / `__radarrStoragePath` | `idx.js:1054` / `:1099` (refresh only) | `idx.js:136` / `:140` | `utils.js:394` | Prompt default quality/location. |
| `__sonarrQuality` / `__sonarrStoragePath` | `idx.js:1184` / `:1228` | `idx.js:137` / `:141` | `utils.js:399` | Same. |
| `__medusaQuality` / `__medusaStoragePath` | `idx.js:1317` / `:1352` | `idx.js:138` / `:142` | `utils.js:401` | Same. |
| `__sickBeardQuality` / `__sickBeardStoragePath` | `idx.js:1444` / `:1487-1488` (index) | `idx.js:139` / `:143` | `utils.js:403` | Same. |
| `__domains` | `idx.js:2076-2085` (hosts from `builtins` + `plugins`) | `idx.js:144` | `utils.js:1597` | `utils.js` stops initialising on hosts that are not listed (`utils.js:1599-1600`). |
| `__caught` | `idx.js:654` (from test charges `idx.js:837-849, 965-966, 1064-1065, 1194, 1327-1328, 1461, 1563-1564`) | `idx.js:145` | `utils.js:1196-1197, 1228, 2533-2534` | IDs already in a manager. Drives the "queued" button state and skips. |
| `__theme` | `idx.js:655` (from `UpdateTheme` `idx.js:2584-2600`) | `idx.js:146` | `utils.js:2583-2596` | Button classes/attributes. |
| `__defaults` | `idx.html:1069` (`true`), `idx.js:2086` (`'false'`) | `idx.js:201` | — | Read into an unused variable (`idx.js:639`). |

---

## 2. Options with no UI (read by code, never shown)

| Key | Written at | Read at | Notes |
|---|---|---|---|
| `servers` (`[{ id, token, connections[] }]`) | `idx.js:1782-1788` | `background.js:109, 118`; `plugn.js:116, 125`; `utils.js:1051, 1060`; restore `idx.js:2060` | The selected server's own `accessToken` and connections, from `plex.tv/api/resources` (`idx.js:1659-1660`). |
| `IGNORE_PLEX` | `idx.js:1672, 1832` | `background.js:109, 115`; `plugn.js:116, 122`; `utils.js:1051, 1057, 3172` | Set by "Continue without a Plex server?" (`idx.js:1640`). |
| `proxy` (`{ enabled, url, headers }`) | `idx.js:1773, 1925` (not in the reset path) | `utils.js:1760-1775` | Derived from `UseProxy`/`ProxyURL`/`ProxyHeaders` (`idx.js:1586-1599`). |
| `plexURLRoot` | `idx.js:1714, 1873` | — | Written, never read (except the popup copy below). |
| `ClientID` | `idx.js:1712, 1868` | — | Never read back; the page variable resets each load (`idx.js:206`). |
| `~/cache/*` (`has/<alias>`, `get/<alias>`, search results) | `plugn.js:53`; `utils.js:241, 863-864, 2159-2161` | `plugn.js:67-68`; `utils.js:1176-1177, 1697-1701` | Removed by "Erase cache" (`idx.js:2473-2477`). |
| Derived at read time, never stored: `server`, `ombiURL`, `couchpotatoURL`, `watcherURL`, `radarrURL`, `sonarrURL`, `medusaURL`, `sickBeardURL`, `<svc>BasicAuth` | — | `plugn.js:118-207`; `utils.js:1060-1154` | Built from the `<svc>URLRoot`/`<svc>Token`/`using<Svc>` keys. |

localStorage keys written by the options page (via `idx.js:485-495`):

| Key | Written at | Read at |
|---|---|---|
| `URLs` (manager names list) | `idx.js:1760, 1912` | `popup/index.js:25` |
| `<svc>.url` (`plex`, `ombi`, `medusa`, `watcher`, `radarr`, `sonarr`, `couchpotato`, `sickBeard`) | `idx.js:1761, 1913` | `popup/index.js:37` |
| `builtin`, `plugin` (arrays of `"<name>:<bool>"`) | `idx.js:1791-1798, 1936-1943` | `popup/index.js:26-27, 45-58` |
| `builtin.sites`, `optional.sites` | `idx.js:2269, 2380` | — |
| `permission:<host>` | `idx.js:2280, 2284, 2391, 2395` | — |
| `script:<host>` | `idx.js:2281, 2285, 2392, 2396` | `plugn.js:496` (as `<type>:<host>`) |
| `builtin:<host>` | `idx.js:2290, 2401` | `plugn.js:495` |
| `configuration` | `background.js:173` (not by options) | `background.js:157` |

---

## 3. UI with no reader (saved or shown, never read outside the options page)

| Key / control | Where | Why it matters |
|---|---|---|
| `UseOmbi` | `idx.html:74` | Only drives the Ombi auto-fill (`idx.js:702`). |
| `preferredServer` | `idx.html:87` | Only selects `servers[0]` at save. |
| `UseProxy`, `ProxyURL`, `ProxyHeaders` (raw keys) | `idx.html:679, 690, 706` | Runtime reads the derived `proxy` object only. |
| `theme:button-shape`, `theme:button-location`, `theme:button-opacity` | `idx.html:606, 622, 629` | Runtime reads `__theme` only. |
| `__defaults` | `idx.html:1069` | Read into an unused variable (`idx.js:639`). |
| `medusaQualityProfileType`, `sickBeardQualityProfileType` | `idx.html:430, 574` | **Not saved at all**: missing from `__options__`. |
| `#plex_username`, `#plex_password` | `idx.html:55-56` | Intentionally not saved; used once for login (`idx.js:536-537`). |
| `#ombi_url`, `#ombi_api` | `idx.html:69-70` | Not saved; used for "Attach to Ombi" (`idx.js:661-662`). |
| `ombiBasicAuth*`, `couchpotatoQualityProfileId`, `enableCouchPotato` | `idx.html:137-154, 355-364` | Inside HTML comments. |
| `#json_data` | `idx.html:928` | Import/export only. |
| `#all-builtin`, `#all-plugin` | `idx.html:653, 660` | Bulk toggles only. |
| `showrss` in `builtins` (`idx.js:2186`) and in the popup (`popup/index.html:133`) | — | No manifest entry and no `sites/showrss` script. The checkbox does nothing. |
| `plexURLRoot`, `ClientID` | `idx.js:1712-1714` | Saved, never read. |

---

## 4. Services

Common pattern for every manager:

1. The user enters a URL and a key, then presses **Test Settings**.
2. The `mouseup` handler (`idx.js:2420-2440`) runs `perform<Svc>Test`.
3. The test normalises the URL (prefix `localhost` for a bare `:port`, add `http(s)://`, strip the trailing `/`).
4. It calls `requestURLPermissions`. This is a stub that always grants (`idx.js:1998-2004`); everything after `:2006` is dead code.
5. It runs `get<Svc>` and fills the quality and path selects plus the hidden lists. On success it ticks `using<Svc>` and unlocks the checkbox.
6. It "charges" `__caught` with the IDs the manager already has.
7. On page load, `restoreOptions` re-runs the same tests with `refreshing: true` (`idx.js:2057-2074`).

Fields required at save:

- URL whenever a key is set (`idx.js:1685`).
- Storage path for Radarr/Sonarr/Medusa/Sick Beard (`idx.js:1688`).
- Quality for Watcher/Radarr/Sonarr/Medusa/Sick Beard (`idx.js:1691-1705`).

### Plex

- **Fields:** `plexToken`, **or** Plex username + password, **or** Ombi URL + key. Then `preferredServer`. `plexURL` is optional.
- **Test path:** `#plex_test` (`idx.js:2420-2433`), which picks one of three routes:
  - `performPlexTest` (`:565-607`) → `getServers` (`:497-517`): GET `https://plex.tv/api/resources?includeHttps=1` with `X-Plex-Token`. Parses the XML (`xml.js:85-89`) and keeps devices whose `provides` includes `server`.
  - `performPlexLogin` (`:535-563`) → `tryPlexLogin` (`:520-533`): POST `https://plex.tv/users/sign_in.json` with Basic auth. Then `performPlexTest`.
  - `performOmbiLogin` (`:660-789`): GET `<ombi>api/v1/Settings/plex` with an `apikey` header. Takes the token and machine ID from Ombi. If `UseOmbi` is checked, it also fetches `Settings/CouchPotato`, `Settings/radarr` and `Settings/sonarr` and fills those forms.
- **Save:** `saveOptions` (`:1633-1822`) stores `servers[0] = { id: clientIdentifier, token: accessToken, connections }`.
- **Runtime use:** `background.js:826-847` races `<uri>/hubs/search` across all connections.

### Ombi (movies + TV)

- **Fields:** `ombiURLRoot`, `ombiToken`.
- **Test:** `performOmbiTest` (`idx.js:791-870`): GET `<url>/api/v1/Status?apikey=` with headers `apikey` and `accept: text/html`. A numeric body in the range 200–399 counts as a pass. It then charges from `api/v1/Request/movie` and `Request/tv`.
- **Runtime:** `utils.js:2171-2214` → `PUSH_OMBI` → `background.js:679-738`. Search goes through `utils.js:1712`.

### Watcher (movies)

- **Fields:** `watcherURLRoot`, `watcherToken`, optional Basic auth, `watcherQualityProfileId`.
- **Test:** `performWatcherTest` (`idx.js:893-986`) → `getWatcher` (`:872-891`): GET `<url>/api?apikey=&mode=getconfig&quality=`. Reads `config.Quality.Profiles` and `config.Postprocessing.moverpath`. Then `mode=liststatus` for the charge.
- **Runtime:** `utils.js:2295-2337` → `PUSH_WATCHER` → `background.js:239-272`.

### Radarr (movies)

- **Fields:** `radarrURLRoot`, `radarrToken`, optional Basic auth, `radarrStoragePath`, `radarrQualityProfileId`.
- **Test:** `performRadarrTest` (`idx.js:1009-1116`) → `getRadarr` (`:988-1007`): GET `<url>/api/profile`, `/api/movie` (charge) and `/api/rootfolder`, with `X-Api-Key`.
- **Runtime:** `utils.js:2340-2396` → `PUSH_RADARR` → `background.js:275-366`.

### CouchPotato (movies)

- **Fields:** `couchpotatoURLRoot`, `couchpotatoToken`, optional Basic auth.
- **Test:** `performCouchPotatoTest` (`idx.js:1529-1584`) → `getCouchPotato` (`:1508-1527`): GET `<url>/api/<token>/updater.info`, then `media.list?type=movie&status=active`. The headers built at `:1512-1519` are **not sent**.
- **Runtime:** `utils.js:2218-2292` → `QUERY_/PUSH_COUCHPOTATO` → `background.js:183-226`.

### Medusa (TV)

- **Fields:** `medusaURLRoot`, `medusaToken`, optional Basic auth, `medusaStoragePath`, `medusaQualityProfileType` (unsaved), `medusaQualityProfileId`.
- **Test:** `performMedusaTest` (`idx.js:1268-1371`) → `getMedusa` (`:1247-1266`): GET `<url>/api/v2/config` (twice: once for `consts.qualities`, once for `main.rootDirs`), plus `/api/v2/series` for the charge.
- **Runtime:** `utils.js:2456-2509` → `PUSH_MEDUSA` → `background.js:449-520`.

### Sonarr (TV)

- **Fields:** `sonarrURLRoot`, `sonarrToken`, optional Basic auth, `sonarrStoragePath`, `sonarrQualityProfileId`.
- **Test:** `performSonarrTest` (`idx.js:1139-1245`) → `getSonarr` (`:1118-1137`): GET `<url>/api/profile`, `/api/series` (charge) and `/api/rootfolder`.
- **Runtime:** `utils.js:2399-2453` → `PUSH_SONARR` → `background.js:369-446`.

### Sick Beard (TV)

- **Fields:** `sickBeardURLRoot`, `sickBeardToken`, optional Basic auth, `sickBeardStoragePath`, `sickBeardQualityProfileType` (unsaved), `sickBeardQualityProfileId`.
- **Test:** `performSickBeardTest` (`idx.js:1394-1506`) → `getSickBeard` (`:1373-1392`): GET `<url>/api/<token>/?cmd=sb.getdefaults`, `shows` (charge) and `sb.getrootdirs`.
- **Runtime:** `utils.js:2512-2569` → `PUSH_SICKBEARD` → `background.js:597-676`.

### Other services the settings touch

| Service | Where | Purpose |
|---|---|---|
| OMDb | `OMDbAPI`, `utils.js:1647, 1736-1739` | ID lookup. |
| TMDb | `TMDbAPI`, `utils.js:1646, 1742-1745` | ID lookup. |
| TVmaze, theimdbapi.org | `utils.js:1748-1755` | ID lookup; no setting. |
| Proxy | `UseProxy`/`ProxyURL`/`ProxyHeaders` | `#test-proxy-settings` → `Recall.GetIPAddress` (`idx.js:2861-2942, 3343`) fetches `https://check.torproject.org`, directly or through the proxy, and shows the public IP. It also runs automatically 100 ms after the page loads (`idx.js:2975-2981`). |
| GitHub | none | `Recall.SetVersionInfo` (`idx.js:2813-2858`) fetches `api.github.com/repos/webtoplex/browser-extension/releases[/latest]` on every page load and compares versions with `compareVer` (`compare.js:112-133`). |
| OS proxy settings | `#!/native/settings/network/proxy` link (`idx.html:734`) | Rewritten to `ms-settings:network-proxy` on Windows, `#` elsewhere, and opened in a hidden iframe (`idx.js:2689-2743`). |

---

## 5. Popup (`src/popup/`)

**What it shows**

- A static grid of 30 built-in sites ("Default Sites"; `verizon` is among them, `google` is not) and 6 experimental sites (`popup/index.html:13-247`). Each tile is a link to the site.
- Hover titles are built from attributes such as `not-safe`, `is-slow`, `is-shy`, `save-file` and `cost-cash-*` (`popup/index.js:80-120`).
- A row of "local manager" tiles for every manager URL saved by the options page, using `img/local.<name>.png` (`popup/index.js:29-78`).

**What it reads** (`localStorage` only, through `load()`, `popup/index.js:1-11`)

- `URLs` and `<name>.url` (`popup/index.js:25, 37`): the manager tiles.
- `builtin` and `plugin` (`popup/index.js:26-27`). Each `"<name>:<bool>"` entry sets or clears `disabled` on the tile with `id="<name>"` (`popup/index.js:45-58`).

**What it sends:** nothing. There are no `chrome.*` calls, messages or network requests. The `save` (`:13-21`) and compression helpers (`:122-258`) are unused.

**Gaps**

- The tiles for `google` (built-in) and for `toloka`, `myanimelist`, `indomovie`, `snagfilms` and `freemoviescinema` (plugins) are missing. Their enabled state is never shown.
- `showrss` is listed (`popup/index.html:133`) but has no site support.

---

## 6. The `eval` in `addListener` (`idx.js:425-437`)

```js
function addListener(element, eventName, callback) {
	eventName = eventName.replace(/^(on)?/, 'on');
	callback = callback.toString().replace(/;+$/g, '');
	let event = element.getAttribute(eventName);
	event = (event && event.length)? `${ event }; ${ callback }`: callback;
	element[eventName] = eval(event);
}
```

**What it evaluates:** `element.getAttribute('on<event>') + '; ' + callback.toString()`. That is any inline `on<event>` attribute text, followed by the **source text of the callback function**.

**Where the text comes from:** only from `idx.js` itself. All 24 callers (`idx.js:2272, 2294, 2383, 2405, 2420, 2434-2440, 2443, 2459, 2469, 2483, 2517, 2571, 2584, 2642, 2957, 3221, 3222, 3343`) pass function literals defined in this file. No element in `idx.html` has an inline `on*` attribute (`grep " on[a-z]+=" idx.html` finds nothing). The generated site checkboxes (`idx.js:2229, 2253, 2344, 2368`) have none either. So no stored or remote data reaches the `eval`.

**Side effects**

- Because of the `a; b` form, any pre-existing inline handler code would run **once at registration** instead of on the event.
- Only the last expression (the callback) becomes the property handler.
- Re-evaluating from source drops the callback's closure. It works today only because every callback refers to globals or to its own parameters.
- It replaces any earlier `on<event>` property, so two `addListener` calls on the same element and event cannot coexist.

**MV3:** this, plus `utils.js:3498`, needs `'unsafe-eval'` (`manifest.json:18`). A drop-in replacement is `element.addEventListener(eventName.replace(/^on/, ''), callback)`. No caller depends on the string merge.

---

## Appendix: full site keys (from `__options__`, `idx.js:149-194`)

Every key below is a checkbox `data-option` generated at `idx.js:2249-2261` (built-ins) or `idx.js:2364-2376` (plugins), and is read only by `plugn.js:63`. See §1.10 for details.

| Key | `__options__` line |
|---|---|
| `builtin_allocine` | `idx.js:149` |
| `builtin_amazon` | `idx.js:150` |
| `builtin_couchpotato` | `idx.js:151` |
| `builtin_fandango` | `idx.js:152` |
| `builtin_flickmetrix` | `idx.js:153` |
| `builtin_google` | `idx.js:154` |
| `builtin_googleplay` | `idx.js:155` |
| `builtin_hulu` | `idx.js:156` |
| `builtin_imdb` | `idx.js:157` |
| `builtin_justwatch` | `idx.js:158` |
| `builtin_letterboxd` | `idx.js:159` |
| `builtin_moviemeter` | `idx.js:161` |
| `builtin_movieo` | `idx.js:162` |
| `builtin_netflix` | `idx.js:163` |
| `builtin_plex` | `idx.js:164` |
| `builtin_rottentomatoes` | `idx.js:165` |
| `builtin_shanaproject` | `idx.js:166` |
| `builtin_showrss` | `idx.js:167` |
| `builtin_tmdb` | `idx.js:168` |
| `builtin_tvmaze` | `idx.js:169` |
| `builtin_tvdb` | `idx.js:170` |
| `builtin_trakt` | `idx.js:171` |
| `builtin_vrv` | `idx.js:172` |
| `builtin_verizon` | `idx.js:173` |
| `builtin_vudu` | `idx.js:174` |
| `builtin_vumoo` | `idx.js:175` |
| `builtin_youtube` | `idx.js:176` |
| `builtin_itunes` | `idx.js:177` |
| `builtin_gostream` | `idx.js:178` |
| `builtin_tubi` | `idx.js:179` |
| `builtin_webtoplex` | `idx.js:180` |
| `plugin_toloka` | `idx.js:183` |
| `plugin_myanimelist` | `idx.js:185` |
| `plugin_myshows` | `idx.js:186` |
| `plugin_indomovie` | `idx.js:187` |
| `plugin_redbox` | `idx.js:188` |
| `plugin_kitsu` | `idx.js:189` |
| `plugin_go` | `idx.js:190` |
| `plugin_snagfilms` | `idx.js:191` |
| `plugin_freemoviescinema` | `idx.js:192` |
| `plugin_foxsearchlight` | `idx.js:193` |
| `plugin_metacritic` | `idx.js:194` |
