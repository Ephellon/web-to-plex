# Web to Plex revamp

Rewrite of the Chrome extension (`src/`) to MV3 with a plugin layout, declarative settings, tests, lint and a
build, plus a scripting language for user rules (Phase 7). Playbook: `CONVERTING-EXTENSIONS.md` (TTV Tools v6).

## Status

| Item | Value |
|---|---|
| Base | `beta-branch` @ `3a89875`, tagged `pre-revamp` (local; the tag push was refused with HTTP 403) |
| Dev branch | `claude/extension-rewrite-features-b4afna` (Ephellon/web-to-plex) |
| Phase | 0-2 done. 3: MV3 build live-checked; round fixes F1, app.trakt.tv, IMDb landed (IMDb awaits an owner live check) |
| Budget | Round from 17:14 UTC 2026-10-03: 5 fixes or 3 hours. Spent (B36, T2, PL1-PL3) at 17:50 UTC |
| Offser rules share | `w2p-live-rules` (`common.md`) |

## Phases

| # | Phase | Exit criteria | State |
|---|---|---|---|
| 0 | Baseline and tooling: lint, `scripts/build.mjs` (`dist/chrome`, `dist/firefox`, zips), pre-commit hook, CI | `npm test`, `npm run lint` (0 errors), `npm run build` run | ✅ |
| 1 | Inventory: `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, per-file digests, bug candidates | Every setting maps to code; every file has a digest | ✅ (`ARCHITECTURE.md`, `FEATURES.md`, `SITES.md`) |
| 2 | Triage and isolated fixes: `docs/triage/TRIAGE.md` | Every candidate verified against code | ✅ (B36 needs a CouchPotato server) |
| 3 | Core extraction and plugin contract (`src/lib/`, plugin registry, unit tests) | Pilot plugins behave identically (headless parity) | 3a-3d ✅; live checks pending (`docs/PHASE3.md`) |
| 4 | Plugin migration: one plugin per site, one per service | Parity per batch | |
| 5 | Declarative settings | Settings page renders the same; first-run defaults stored exactly | |
| 6 | Styles and tokens | Computed styles unchanged (snapshot diff) | |
| 7 | New features (owner's breakdown) and the W2P DSL | Own tests plus live checks | |
| 8 | Docs and release | Owner's call | |

Nothing behavioural changes before Phase 7; Phases 3 to 6 are moves proven by parity.

## Scope

- `src/` is the Chrome source and the only code being rewritten.
- The legacy `moz/`, `opa/`, `win/` copies and their packages were removed on 2026-10-03; Firefox is built from `src/`,
  and the Chromium zip serves Chrome, Edge and Opera.

## Known MV3 blockers (from the first read)

**Live finding (2026-10-01):** Chrome 153 and Edge 154 refuse to load the MV2 build at all, so the current release is
unusable on Chromium. The MV3 conversion in Phase 3 is the top priority.


- `background.js` + `plugn.js` are a persistent MV2 background page; they use `window`, `localStorage`,
  `sessionStorage` and long-lived globals.
- `plugn.js` fetches site scripts and CSS (`src/cloud/*`) and runs them with `tabs.executeScript({ code })`:
  remote code, banned in MV3. The scripts must ship in the package and register as content scripts.
- `eval` / `new Function` in `options/index.js:436`, `utils.js:3498`, `utils.js:3919`; CSP has `'unsafe-eval'`.
- `<all_urls>` permission plus a `*://*/*` content script; user-entered server URLs (Plex, Radarr, Sonarr, Ombi,
  CouchPotato, Watcher…) need `optional_host_permissions` requested at runtime.
- `browser_action` to `action`; `tabs.executeScript` / `insertCSS` to `chrome.scripting`.

## Tooling (Phase 0)

- `npm test`: `node --test tests/*.test.mjs` (manifest and page references exist).
- `npm run lint` / `npm run format`: ESLint flat config (`eslint.config.mjs`) with `@stylistic` and the house rules in
  `scripts/eslint/style.mjs` (`w2p/*`). Style findings are warnings; the legacy code shows about 22,900 of them, so the
  bulk `npm run format` pass is its own commit, not mixed with moves.
- `npm run build`: `scripts/build.mjs` writes `dist/chrome` and `dist/firefox`; `--release` also writes
  `web-to-plex.zip` and `web-to-plex.moz.zip` at the root. `.githooks/pre-commit` rebuilds them when `src/` is staged.
- CI: `.github/workflows/ci.yml`. The `web-ext lint` step blocks on errors (0 since Phase 3a removed the top-level
  `return` in `cloud/itunes.js`); its 66 warnings (`innerHTML` assignments, the vendored lodash `Function`) do not.
- `Makefile`, `env.example` and the legacy `src.*`/`moz.*`/`opa.*`/`win.*` packages were removed (2026-10-03).

## Decisions

| Date | Decision |
|---|---|
| 2026-10-01 | Base the rewrite on `beta-branch`. Only `src/` (Chrome) is in scope; `moz`, `opa`, `win` are ignored. |
| 2026-10-01 | Push to Ephellon/web-to-plex only; SpaceK33z/web-to-plex stays untouched. |
| 2026-10-01 | Build outputs Chrome and Firefox from the one `src/`. |
| 2026-10-01 | House style comes from a styleguide the owner will upload; lint rules wait for it. |
| 2026-10-01 | New features come from the owner's breakdown; none are invented. |
| 2026-10-01 | House style is `docs/STYLEGUIDE.md` (owner's upload; rule prefix `w2p/`): 4 spaces, leading `?`/`:`, comma-first. |
| 2026-10-01 | Firefox build keeps the published add-on ID `mink.cbos@gmail.com`. |
| 2026-10-03 | Remove the legacy `moz/`, `opa/`, `win/` copies, their packages, `Makefile` and `env.example` (owner). |
| 2026-10-03 | The manager posts jobs to the board and does not apply fixes itself unless the owner explicitly says so (owner). |
| 2026-10-03 | The rewrite is version `5.0.0.0`, `version_name` "5.0 beta"; the fourth number counts beta builds. |

## Offser usage

| Date | Job | Model | Use |
|---|---|---|---|
| 2026-10-01 | `w2p-inventory-core` | subordinate (`webtoplex-subo`) | `docs/ARCHITECTURE.md`, `docs/triage/bugs-core.md` (61 candidates, unverified) |
| 2026-10-01 | `w2p-inventory-settings` | subordinate (`webtoplex-subo`) | `docs/FEATURES.md`, `docs/triage/bugs-settings.md` (33 candidates, unverified); corrects core B15: `DeveloperMode` defaults on, so local `cloud/*` runs by default |
| 2026-10-01 | `w2p-inventory-sites` | subordinate (`webtoplex-subo`) | `docs/SITES.md`, `docs/triage/bugs-sites.md` (32 candidates) |
| 2026-10-01 | `w2p-triage-core`, `w2p-triage-settings` | subordinate (`webtoplex-subo`) | `docs/triage/TRIAGE.md`: 33 + 11 size-S Phase 2 fixes |
| 2026-10-01 | `w2p-fix-plex` | subordinate (`webtoplex-subo`) | B9 B4 B18 B41 B42, one commit each |
| 2026-10-01 | `w2p-fix-services` | subordinate (`webtoplex-subo`) | B2 B8 B29 B28 B7 B30 B24 B44 |
| 2026-10-01 | `w2p-fix-settings` | subordinate (`webtoplex-subo`) | S5 S2 S1 S13 S4 S10 S11 S20 (two patches tidied: indent, quotes) |
| 2026-10-01 | `w2p-triage-sites` | subordinate (`webtoplex-subo`) | T1-T32 verdicts, drop list (13 integrations; owner's call on iTunes, Verizon, Kitsu) |
| 2026-10-01 | `w2p-fix-utils-a`, `w2p-fix-utils-b`, `w2p-fix-misc` | subordinate (`webtoplex-subo`) | 22 fixes: B39 B43 B40 B1 B20 B21; B16 B17 B34 B22 B23 B45 B46 B33 B35; B31 S14 S15 S18 B32 B51 B52 |
| 2026-10-01 | `w2p-live-recheck-1` | subordinate (`webtoplex-subo`) | Firefox BiDi live checks: B39 B21 S1 S2 S18 pass; found N1 (fixed), N2; confirmed B37, B13 |
| 2026-10-02 | `w2p-p3-runner`, `w2p-p3-worker`, `w2p-p3-csp` | subordinate (`webtoplex-subo`) | Phase 3a-3c; manager wired 3d |
| 2026-10-02 | `w2p-live-mv3-1` | subordinate (`webtoplex-subo`) | MV3 live check; 5 site/selector fixes; F1-F5 |
| 2026-10-02 | `w2p-site-trakt` | subordinate (`webtoplex-subo`) | app.trakt.tv rewrite; L1, L2 |
| 2026-10-02 | `w2p-site-imdb` | subordinate (`webtoplex-subo`) | IMDb rewrite, offline-checked; live blocked by CAPTCHA |
| 2026-10-03 | `w2p-fix-round4` | subordinate (`webtoplex-subo`) | L1, F5, F4 |
| 2026-10-03 | `w2p-vnext-cleanup` | subordinate (`webtoplex-subo`) | Owner's v-next folder synced to `7c98555`, stale `dist/` rebuilt |
| 2026-10-03 | `w2p-fix-round5`, `w2p-fix-round5-d` | subordinate (`webtoplex-subo`) | P1, S3, F2, D1 |
| 2026-10-03 | `w2p-fix-round6` | subordinate (`webtoplex-subo`) | R1, M1, I1, I2; O1 was a misdiagnosis (☐/☑ are status marks); Kitsu moved to kitsu.app (owner's drop-list call) |
| 2026-10-03 | `w2p-vnext-sync-3` | subordinate (`webtoplex-subo`) | Owner folder at `400a642`; CI green again; R1 holds live |
| 2026-10-03 | `w2p-fix-round7` | subordinate (`webtoplex-subo`) | B36, T2 (Google Play alias), PL1 Free Movies Cinema, PL2 My Shows, PL3 Toloka; dead plugins listed in TRIAGE (round 7) |
