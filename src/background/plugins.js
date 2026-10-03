/*** /src/background/plugins.js
 * Third-party plugin sites (`cloud/plugin/*.js`, options keys `plugin_<name>`). MV2 ran them through the all-sites
 * catch-all content script and plugn.js; MV3 registers each enabled plugin, on the hosts the user granted, with
 * `chrome.scripting.registerContentScripts`.
 *
 * Matches come from the host part of each plugin's `url` glob (`MatchesFor`): `*://*.kitsu.io/anime/*` becomes
 * `*://*.kitsu.io/*`. The path stays with the glob, which lib/site-runner.js still checks on every run. A host with a
 * wildcard anywhere but in front (`*.indomovietv.*`) is no match pattern, so such a plugin lists its hosts itself.
 */

import { GetOptions } from './common.js';

// Each plugin: its options name (`plugin_<name>`, also the runner alias), its script, and that script's `url` glob,
// kept in step with the file by tests/background-plugins.test.mjs. Options' "Metacritic" has no script; the
// shanaproject plugin became a built-in site.
export const PLUGINS = [
    { name: 'foxsearchlight', file: 'cloud/plugin/foxsearchlight.js', url: '*://*.foxsearchlight.com/(?!films|search|$)' },
    { name: 'freemoviescinema', file: 'cloud/plugin/freemoviescinema.js', url: '*://*.freemoviescinema.com/watch/*' },
    { name: 'go', file: 'cloud/plugin/go.js', url: '*://freeform.go.com/(movies|shows)/*' },
    {
        name: 'indomovie', file: 'cloud/plugin/indomovietv.js', url: '*://*.indomovietv.*/(?!tag|$)',
        // The options page's own list of its domains
        hosts: ['*.indomovietv.club', '*.indomovietv.org', '*.indomovietv.net'],
    },
    { name: 'kitsu', file: 'cloud/plugin/kitsu.js', url: '*://*.kitsu.io/anime/*' },
    { name: 'myanimelist', file: 'cloud/plugin/myanimelist.js', url: '*://*.myanimelist.net/anime/\\d+/*' },
    { name: 'myshows', file: 'cloud/plugin/myshows.js', url: '*://*.myshows.me/view/\\d+/*' },
    { name: 'redbox', file: 'cloud/plugin/redbox.js', url: '*://*.redbox.com/(ondemand-)?(movies|tvshows)/(?!featured|$)' },
    { name: 'snagfilms', file: 'cloud/plugin/snagfilms.js', url: '*://*.snagfilms.com/(films?|shows?)/*' },
    { name: 'toloka', file: 'cloud/plugin/toloka.js', url: '*://*.toloka.to/*' },
];

// The style sheets every site gets for the button (manifest content_scripts, minus the site's own)
export const PLUGIN_CSS = ['sites/common.css', 'sites/theme.css', 'sites/glyphs.css', 'sites/colors.css'];

const PREFIX = 'plugin-';

/**
 * The match patterns for a plugin.
 * @param {object} plugin - A `PLUGINS` entry
 * @returns {string[]} Patterns such as `*://*.kitsu.io/*`; empty when the host cannot be one
 */
export function MatchesFor({ url, hosts }) {
    const host = hosts ?? [/^[^:]+:\/\/([^/]+)/.exec(url)?.[1]];

    return host
        .filter(name => name && /^(\*\.)?[^*/]+$/.test(name))
        .map(name => `*://${ name }/*`);
}

/**
 * The content-script registration for a plugin.
 * @param {object} plugin - A `PLUGINS` entry
 * @returns {object} A `scripting.RegisteredContentScript`
 */
export function Registration(plugin) {
    return {
        id: PREFIX + plugin.name,
        matches: MatchesFor(plugin),
        js: ['utils.js', 'helpers.js', 'site-runner.js', plugin.file, `sites/plugin-boot/${ plugin.name }.js`],
        css: PLUGIN_CSS,
        runAt: 'document_idle',
    };
}

/**
 * Whether a storage change touches a plugin switch.
 * @param {object} changes - `storage.onChanged` changes
 * @returns {boolean}
 */
export function TouchesPlugins(changes) {
    return Object.keys(changes).some(key => /^plugin_/.test(key));
}

// One sync at a time: each reads the registrations and then changes them
let SYNC_QUEUE = Promise.resolve();

/**
 * Registers every enabled plugin whose hosts are granted, and unregisters the rest.
 * @returns {Promise<string[]>} The registered plugin ids
 */
export function SyncPlugins() {
    return SYNC_QUEUE = SYNC_QUEUE.then(Sync, Sync);
}

async function Sync() {
    const options = await GetOptions()
        , wanted = [];

    for(const plugin of PLUGINS) {
        const matches = MatchesFor(plugin);

        if(options[`plugin_${ plugin.name }`] === true && matches.length && await chrome.permissions.contains({ origins: matches }))
            wanted.push(Registration(plugin));
    }

    const registered = (await chrome.scripting.getRegisteredContentScripts())
        .map(script => script.id)
        .filter(id => id.startsWith(PREFIX));

    if(registered.length)
        await chrome.scripting.unregisterContentScripts({ ids: registered });

    if(wanted.length)
        await chrome.scripting.registerContentScripts(wanted);

    return wanted.map(script => script.id);
}
