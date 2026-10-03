/*** /src/lib/site-runner.js
 * Content-side site runner (Phase 3a). Replaces `plugn.js` `prepare()` + `handle()`: instead of the background
 * page fetching a site script, wrapping it and injecting it, the site script ships as a content script and its boot
 * stub calls `RunSite(script, { alias, type })` in the page.
 *
 * Behaviour is moved, not changed. Where the MV2 path only "worked" through a bug, the runner takes the evident intent
 * and the difference is listed in `RunSite`'s header.
 */

/* global HandleInstanceMessage, Require */ // Set by utils.js and helpers.js in the same content-script world

// "Fancy" punctuation that `handle()` normalised in titles (plugn.js:449-453)
const PUNCTUATION = [
    [/[‐-―]/g, '-'],                      // Hyphens and dashes
    [/[‚❟]/g, ','],                       // Low quotation commas
    [/[‘’‛❛❜]/g, "'"],     // Single quotes and apostrophes
    [/[“-‟❝❞]/g, '"'],          // Double quotes
];

// Retry delay when a script gives none (plugn.js:362)
const DEFAULT_TIMEOUT = 1000;

// Navigation events that re-run a site (the MV2 wrapper listened to the first two; `$INIT$` covered the third)
const NAVIGATION_EVENTS = ['popstate', 'pushstate-changed'];

// Per environment: the latest run of each site, so a repeated RunSite (utils.js re-calls `init`) replaces the last
// one instead of stacking navigation listeners and retry timers
const ACTIVE = new WeakMap();

let SHARED_ENVIRONMENT = null;

/**
 * Converts a site script's `url` glob into the RegExp the MV2 wrapper built (plugn.js:331-342).
 * The rules, in order: `*:` at the start is any scheme; `*.` is an optional sub-domain; `.*` is an optional TLD;
 * `/*`, `?*`, `&*` and `#*` match the rest. Everything else is used as regular-expression source, unanchored.
 * @param {string} url - The glob from `script.url`
 * @returns {RegExp} Case-insensitive pattern to test against `location.href`
 */
export function GlobToRegExp(url) {
    return RegExp(
        url
            .replace(/^\*:/, '\\w{3,}:')
            .replace(/\*\./g, '(?:[^\\.]+\\.)?')
            .replace(/\.\*/g, '(?:\\.[^\\/\\.]+)?')
            .replace(/([/?&#])\*/g, '\\$1[^$]*')
        , 'i'
    );
}

/**
 * Parses the string form a site script may return: `Title (YYYY):type`.
 * MV2 read the groups from the legacy `RegExp.$n` statics, so a string that didn't match produced stale values (B26);
 * here it produces `null`.
 * @param {string} text - The returned string
 * @returns {{ type: string, title: string, year: string }|null} The parts, or `null` when the string doesn't match
 */
export function ParseResultString(text) {
    const match = /^([^]+?)\s*\((\d{4})\):([\w-]+)$/.exec(text);

    if(match == null)
        return null;

    const [, title, year, type] = match;

    return { type, title, year };
}

/**
 * Normalises one item the way `handle()` did before posting it: fancy punctuation in the title, and `+year`.
 * @param {object} item - `{ type, title, year, … }` from the site script
 * @returns {object} A copy with `title` normalised and `year` a number
 */
export function NormaliseItem(item) {
    let { type, title, year } = item;

    for(const [pattern, replacement] of PUNCTUATION)
        title = title.replace(pattern, replacement);

    year = +year;

    return { ...item, type, title, year };
}

/**
 * Decides what to do with a site script's `init()` result, following `handle()` (plugn.js:381-462).
 * @param {*} result - What `init()` returned (after the URL and `ready` checks)
 * @param {number} [timeout] - The script's own retry delay, used when there is no result
 * @returns {{ action: string, data?: *, delay?: number, message?: string }} One of:
 *     `populate` (with `data`), `retry` (with `delay`), `no-render` (with the negative number as `data`) or
 *     `stop` (with `message`)
 */
export function ClassifyResult(result, timeout = DEFAULT_TIMEOUT) {
    if(typeof result == 'number') {
        if(result < 0)
            return { action: 'no-render', data: result };

        // 0 is falsy; MV2 treated it like an empty result (below)
        return { action: 'retry', delay: result || timeout };
    }

    // MV2 re-injected at once and forever on an empty result (B25); the runner waits for the script's timeout
    if(!result)
        return { action: 'retry', delay: timeout };

    if(typeof result == 'string') {
        const permission = /^<([^<>]+)>$/.exec(result);

        if(permission)
            return { action: 'stop', message: `The instance requires the "${ permission[1] }" permission` };

        const parsed = ParseResultString(result);

        if(parsed == null)
            return { action: 'stop', message: `Unrecognised result string "${ result }"` };

        result = parsed;
    }

    if(typeof result != 'object')
        return { action: 'stop', message: `Unrecognised result type "${ typeof result }"` };

    if(result instanceof Array) {
        const items = result.filter(item => item);

        // A list is posted as is, without normalising (plugn.js:438-441)
        if(items.length > 1)
            return { action: 'populate', data: items };

        if(items.length < 1)
            return { action: 'stop', message: "Empty result list" };

        result = items[0];
    }

    // MV2 threw on a missing title (`title.replace`), so nothing was posted
    if(typeof result.title != 'string')
        return { action: 'stop', message: "Result has no title" };

    return { action: 'populate', data: NormaliseItem(result) };
}

/**
 * The path of a URL, which is what tells one page of a site from another.
 * @param {string} href - The URL
 * @returns {string} Its `pathname`, or the whole string when it is not a URL
 */
export function PathOf(href) {
    try {
        return new URL(href).pathname;
    } catch {
        return href;
    }
}

/**
 * Makes an instance name like `plugn.js` `RandomName()`: base-36 random values, starting with a letter.
 * `utils.js` checks a `PERMISSION` instance with `/[\da-z]{64,}/i`, so the default length matches MV2.
 * @param {number} [length=16] - How many random 32-bit values to join
 * @returns {string} The name
 */
export function RandomName(length = 16) {
    const values = [...crypto.getRandomValues(new Uint32Array(length))].map(value => value.toString(36));

    return values.join('').replace(/^[^a-z]+/i, '');
}

/**
 * Builds the browser-facing environment the runner uses. Tests pass their own.
 * @returns {object} `{ href, get, getCache, populate, require, minionsWanted, listen, setTimeout, clearTimeout, warn }`
 */
export function DefaultEnvironment() {
    const area = () => chrome.storage.sync ?? chrome.storage.local;

    const get = key => new Promise(resolve =>
        area().get(key, items => resolve(chrome.runtime.lastError ? void null : items?.[key]))
    );

    return {
        href: () => location.href,
        get,

        // `~/cache/<name>` entries, saved as JSON by `plugn.js` `Save` and `helpers.js` `save`
        async getCache(name) {
            const value = await get('~/cache/' + name.toLowerCase().replace(/\s+/g, '_'));

            return value == null ? null : JSON.parse(value);
        },

        // utils.js sets `HandleInstanceMessage` once its options have loaded
        async populate(request) {
            for(let tries = 0; typeof HandleInstanceMessage != 'function' && tries < 300; ++tries)
                await new Promise(resolve => setTimeout(resolve, 100));

            if(typeof HandleInstanceMessage != 'function')
                throw new Error(`utils.js never set HandleInstanceMessage; dropped ${ request.type }`);

            return HandleInstanceMessage(request);
        },

        require: (...args) => (typeof Require == 'function' ? Require(...args) : void null),
        minionsWanted: () => get('UseMinions'),

        listen(handler) {
            for(const type of NAVIGATION_EVENTS)
                top.addEventListener(type, handler);

            // utils.js defines `onlocationchange` as a setter that registers the callback with its href poll
            window.onlocationchange = handler;
        },

        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: timer => clearTimeout(timer),
        warn: (...messages) => console.warn(...messages),
    };
}

/**
 * The default environment, created once so that repeated RunSite calls share their per-site state.
 * @returns {object} See `DefaultEnvironment`
 */
export function SharedEnvironment() {
    return SHARED_ENVIRONMENT ??= DefaultEnvironment();
}

/**
 * Runs a site script in the page: consent, URL, readiness, `init()`, then the result handling `handle()` did, and
 * finally posts the request `utils.js` used to receive from the background page.
 *
 * Differences from MV2, each taking the evident intent where MV2 only worked through a bug:
 *   - An empty `init()` result retries after the script's timeout; MV2 re-injected at once, forever (B25).
 *   - A result string that isn't `Title (YYYY):type` stops; MV2 used stale `RegExp.$n` values (B26).
 *   - An async `ready()` is awaited; MV2 called it and took the (always truthy) promise as "ready".
 *   - A retry runs the whole pipeline again; MV2's cached wrapper only re-ran when the instance name changed.
 *   - Navigation re-runs the pipeline in place; MV2 posted `$INIT$` to the background, which re-injected the script.
 *
 * @param {object} script - The site script object (`url`, `init`, optional `ready`, `timeout`, `minions`, `requires`)
 * @param {object} options
 * @param {string} options.alias - The site's name, as in its options key (`builtin_<alias>`, `plugin_<alias>`): `imdb`,
 *     `googleplay`, `myanimelist`…
 * @param {string} [options.type='script'] - `script` for a built-in site, `plugin` for an experimental one
 * @param {object} [env] - Environment overrides (tests); see `DefaultEnvironment`
 * @returns {Promise<object>} The last outcome: `{ action, … }` as from `ClassifyResult`, or a consent/URL stop
 */
export async function RunSite(script, { alias, type = 'script' } = {}, env = SharedEnvironment()) {
    const kind = type.toLowerCase()
        , TYPE = kind.toUpperCase()
        , instance = env.instance ?? RandomName()
        , timeout = script.timeout || DEFAULT_TIMEOUT;

    let timer = null
        , path = null;

    // The request shape the background page sent with `tabs.sendMessage` (plugn.js:410, 439, 458)
    const request = (requestType, data) => ({ data, instance, [kind]: alias, instance_type: TYPE, type: requestType });

    const schedule = delay => {
        env.clearTimeout(timer);
        timer = env.setTimeout(() => run(), delay);
    };

    const run = async() => {
        env.clearTimeout(timer);
        path = PathOf(env.href());

        // 1. Consent: only an explicit `false` stops (T2 stays open until the Phase 4 registry)
        if(await env.get(`${ kind == 'plugin' ? 'plugin' : 'builtin' }_${ alias }`) === false)
            return post({ action: 'stop', message: "The instance requires the \"allowed\" permission" });

        if(await env.getCache(`has/${ alias }`) === false)
            return post({ action: 'stop', message: "The instance requires the \"authorized\" permission" });

        // The `// "Name" requires: …` comment of MV2, as data (only cloud/webtoplex.js uses it)
        if(script.requires instanceof Array)
            await env.require(['cache', ...script.requires].join(','), alias, script.requiresName ?? alias, instance);

        // 2. URL: no match is the wrapper's -1, which the background turned into NO_RENDER
        const pattern = GlobToRegExp(script.url);

        if(!pattern.test(env.href())) {
            env.warn(`The domain (${ env.href() }) does not match the pattern '${ script.url }' (${ pattern })`);

            return post({ action: 'no-render', data: -1 });
        }

        if(!(script.init instanceof Function)) {
            env.warn(`The ${ kind } (${ alias }) is incorrectly structured. Could not find required function ${ kind }.init`);

            return post({ action: 'no-render', data: -1 });
        }

        // 3. Readiness, then the minions hook, then init
        let state = void null
            , result;

        try {
            if(script.ready instanceof Function) {
                state = await script.ready();

                if(!state)
                    return post({ action: 'retry', delay: timeout });
            }

            if(await env.minionsWanted() && script.minions instanceof Function)
                script.minions();

            result = await (state === void null ? script.init() : script.init(state));
        } catch(error) {
            // A throwing site script left MV2's executeScript without a result, which it retried; never throw into the page
            env.warn(`[${ alias }] ${ error }`);

            return post({ action: 'retry', delay: timeout });
        }

        // 4. Result handling
        return post(ClassifyResult(result, timeout));
    };

    // 5. Populate locally, or retry, or stop
    const post = async outcome => {
        switch(outcome.action) {
            case 'populate': {
                await env.populate(request('POPULATE', outcome.data));
            } break;

            case 'no-render': {
                await env.populate(request('NO_RENDER', outcome.data));
            } break;

            case 'retry': {
                schedule(outcome.delay);
            } break;

            case 'stop': {
                env.warn(`[${ alias }] ${ outcome.message }`);
            } break;
        } // switch outcome.action

        return outcome;
    };

    // 6. Navigation re-runs the site; one listener per site, pointing at its latest run
    let sites = ACTIVE.get(env);

    if(sites == null)
        ACTIVE.set(env, sites = new Map());

    const previous = sites.get(alias);

    previous?.stop();
    sites.set(alias, { rerun: () => schedule(0), stop: () => env.clearTimeout(timer), path: () => path });

    // Only a new path is a new page: a query or hash change (Trakt's `replaceState` to `?season=1`) keeps the item
    if(previous == null)
        env.listen(() => {
            const site = sites.get(alias);

            if(PathOf(env.href()) != site.path())
                site.rerun();
        });

    return run();
}
