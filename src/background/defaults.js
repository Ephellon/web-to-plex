/*** /src/background/defaults.js
 * First-run options (D1). utils.js runs on a site only once options are saved: it needs `__caught` and `__theme`, and
 * without a Plex token it needs `IGNORE_PLEX`. Until the options page was saved once, no site showed the button. The
 * worker now writes the options page's own defaults on install, and on update fills in keys that are still missing.
 * A saved value is never overwritten.
 *
 * Keys and values follow the options page (options/index.js `__options__`, options/index.html `checked`/`default`);
 * tests/background-defaults.test.mjs keeps them in step.
 */

import { GetOptions } from './common.js';

// Built-in sites: every `builtin_*` switch starts on (options/index.js builtin list, `checked default="true"`)
export const BUILTINS = [
    'allocine', 'amazon', 'couchpotato', 'fandango', 'flickmetrix', 'google', 'googleplay', 'hulu', 'imdb', 'justwatch',
    'letterboxd', 'moviemeter', 'movieo', 'netflix', 'plex', 'rottentomatoes', 'shanaproject', 'showrss', 'tmdb', 'tvmaze',
    'tvdb', 'trakt', 'vrv', 'verizon', 'vudu', 'vumoo', 'youtube', 'itunes', 'gostream', 'tubi', 'webtoplex',
];

// The hosts utils.js acknowledges, as the options page saves them (`__domains`: built-in, then plugin sites)
export const DOMAINS = [
    'allocine.fr', 'amazon.com', 'couchpotato.life', 'fandango.com', 'flickmetrix.com', 'google.com', 'play.google.com',
    'gostream.site', 'hulu.com', 'imdb.com', 'itunes.apple.com', 'justwatch.com', 'letterboxd.com', 'moviemeter.nl',
    'movieo.me', 'netflix.com', 'app.plex.tv', 'rottentomatoes.com', 'shanaproject.com', 'showrss.info', 'themoviedb.org',
    'trakt.tv', 'app.trakt.tv', 'tubitv.com', 'tvmaze.com', 'thetvdb.com', 'verizon.com', 'vrv.co', 'vudu.com', 'vumoo.to',
    'webtoplex.github.io', 'ephellon.github.io', 'youtube.com',
    'foxsearchlight.com', 'freemoviescinema.com', 'freeform.go.com', 'indomovietv.club', 'indomovietv.org',
    'indomovietv.net', 'kitsu.io', 'metacritic.com', 'myanimelist.net', 'myshows.me', 'redbox.com', 'snagfilms.com',
    'toloka.to',
];

export const DEFAULT_OPTIONS = {
    __caught: '{"imdb":[],"tmdb":[],"tvdb":[]}',
    __theme: '{}',
    __domains: DOMAINS.join(','),
    ...Object.fromEntries(BUILTINS.map(name => [`builtin_${ name }`, true])),
    UseOmbi: true,
    UseLoose: true,
    UseLooseScore: '40',
    AutoGrabLimit: '30',
    DeveloperMode: true,
};

// Consent keys saved under an older site name (T2): the site runner reads `builtin_<alias>` / `plugin_<alias>`, and the
// aliases now match the options page's keys
export const RENAMED_KEYS = { 'builtin_google.play': 'builtin_googleplay', plugin_indomovietv: 'plugin_indomovie' };

/**
 * Moves saved values from old key names to the current ones; a value already saved under the new name wins.
 * @param {object} stored - The saved options
 * @returns {{ set: object, remove: string[] }} What to write and which old keys to drop
 */
export function RenamedOptions(stored = {}) {
    const set = {}
        , remove = [];

    for(const [old, key] of Object.entries(RENAMED_KEYS))
        if(old in stored) {
            if(!(key in stored))
                set[key] = stored[old];
            remove.push(old);
        }

    return { set, remove };
}

/**
 * The defaults a store is missing.
 * @param {object} stored - The saved options
 * @returns {object} Only the keys that are not saved yet
 */
export function MissingDefaults(stored = {}) {
    const missing = {};

    for(const [key, value] of Object.entries(DEFAULT_OPTIONS))
        if(!(key in stored))
            missing[key] = value;

    // Without a Plex server the page runs Plex-less (options "Continue without a Plex server?"); never with a token
    if(!('IGNORE_PLEX' in stored) && !stored.plexToken)
        missing.IGNORE_PLEX = true;

    return missing;
}

/**
 * Writes the missing defaults on install and update (`runtime.onInstalled`).
 * @param {object} details - `runtime.onInstalled` details
 * @returns {Promise<object>} What was written
 */
export async function SeedDefaults({ reason } = {}) {
    if(reason != 'install' && reason != 'update')
        return {};

    const stored = await GetOptions()
        , renamed = RenamedOptions(stored)
        , missing = { ...MissingDefaults({ ...stored, ...renamed.set }), ...renamed.set };

    // The same area the options page saves to: sync, or local where sync is unavailable (as common.js GetOptions)
    if(Object.keys(missing).length)
        await (chrome.storage.sync ?? chrome.storage.local).set(missing)
            .catch(() => chrome.storage.local.set(missing));

    // Old key names go only once their values are saved under the new ones
    if(renamed.remove.length)
        await (chrome.storage.sync ?? chrome.storage.local).remove(renamed.remove)
            .catch(() => chrome.storage.local.remove(renamed.remove));

    return missing;
}
