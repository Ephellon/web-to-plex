/*** /tests/permission-o3.test.mjs
 * O3 (owner report): "Granting API access refreshes the page and spams the prompt (not saved)."
 * Root cause: helpers.js `Require` read the saved answer with `load`, which reads HELPERS_STORAGE, the page's filtered
 * configuration. That configuration hides every `~/cache/` key until the site has a grant, so a saved grant
 * (`~/cache/has/<site>` = true) was never seen and the prompt came back on every load; the accept button also reloaded
 * the page. A denial seemed to stick only because the runner reads `has/<site> === false` from chrome.storage itself.
 * `Require` now reads chrome.storage, utils.js `save` waits for its write, and the runner asks only on matching pages.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RunSite } from '../src/lib/site-runner.js';

const HELPERS = fs.readFileSync('src/helpers.js', 'utf8').replace(/\r\n/g, '\n')
    , UTILS = fs.readFileSync('src/utils.js', 'utf8').replace(/\r\n/g, '\n');

/**
 * A chrome.storage area stub (promise and callback forms), backed by `store`.
 * @param {object} store - The stored items
 * @returns {object} The area
 */
const area = store => ({
    get: (key, callback) => {
        const items = key == null ? { ...store } : key in store ? { [key]: store[key] } : {};

        return callback ? callback(items) : Promise.resolve(items);
    },
    set: (items, callback) => (Object.assign(store, items), callback ? callback() : Promise.resolve()),
});

/**
 * Builds helpers.js `Require` against a stored state, with a page configuration that hides cache keys (as
 * utils.js `ParsedOptions` does before a grant).
 * @param {object} store - chrome.storage.sync contents
 * @returns {{ Require: function, posted: object[] }} The function and the messages it posted
 */
function helpers(store) {
    const posted = []
        , stubs = {
            chrome: { storage: { sync: area(store) } },
            top: { postMessage: message => posted.push(message) },
            // What `load` reads: the filtered configuration, without `~/cache/` keys
            HELPERS_STORAGE: { get: (keys, callback) => callback({ plexToken: void null }) },
            queryBy: () => [],
        }
        , { Require } = new Function(...Object.keys(stubs), `${ HELPERS }\nreturn { Require };`)(...Object.values(stubs));

    return { Require, posted };
}

/**
 * Builds utils.js `save` (inside its INITIALIZE closure) against a storage area.
 * @param {object} store - The stored items
 * @returns {function} `save`
 */
function utilsSave(store) {
    const start = UTILS.indexOf('\n\tasync function save(')
        , end = UTILS.indexOf('\n\t}\n', start)
        , stubs = { UTILS_STORAGE: area(store), UTILS_TERMINAL: { WARN() {}, LOG() {}, ERROR() {} } };

    return new Function(...Object.keys(stubs), `return (${ UTILS.slice(start + 1, end + 3) })`)(...Object.values(stubs));
}

test('accept: the grant the prompt saves is the one Require reads next time; no prompt is asked again', async() => {
    const store = {};

    // The accept button's callback saves under the prompt's `name` (the site alias)
    assert.ok(await utilsSave(store)('has/webtoplex', true));
    assert.ok(await utilsSave(store)('get/webtoplex', ['cache', 'api']));

    const { Require, posted } = helpers(store)
        , allotted = await Require('cache,api', 'webtoplex', 'Web to Plex', 'x'.repeat(64));

    assert.deepEqual(allotted, ['cache', 'api']);
    assert.equal(posted[0].data.allowed, true, 'the page gets the saved answer, so it does not prompt');
});

test('deny: the saved denial is read too', async() => {
    const store = {};

    await utilsSave(store)('has/webtoplex', false);
    await utilsSave(store)('get/webtoplex', {});

    const { Require, posted } = helpers(store);

    await Require('cache,api', 'webtoplex', 'Web to Plex', 'x'.repeat(64));

    assert.equal(posted[0].data.allowed, false);
});

test('never asked: Require posts no answer, so the page prompts once', async() => {
    const { Require, posted } = helpers({});

    assert.equal(await Require('cache,api', 'webtoplex', 'Web to Plex', 'x'.repeat(64)), void null);
    assert.equal(posted[0].data.allowed, null);
});

test('utils.js save waits for the write, and reports a failed one (a full storage.sync) as null', async() => {
    let written = false;
    const start = UTILS.indexOf('\n\tasync function save(')
        , end = UTILS.indexOf('\n\t}\n', start)
        , slow = { get: (keys, callback) => callback({}), set: () => new Promise(resolve => setTimeout(() => resolve(written = true), 20)) }
        , full = { get: (keys, callback) => callback({}), set: () => Promise.reject(new Error('QUOTA_BYTES quota exceeded')) }
        , build = storage => new Function('UTILS_STORAGE', 'UTILS_TERMINAL', `return (${ UTILS.slice(start + 1, end + 3) })`)(storage, { WARN() {}, LOG() {}, ERROR() {} });

    await build(slow)('has/webtoplex', true);
    assert.equal(written, true, 'resolved only after the write');
    assert.equal(await build(full)('has/webtoplex', true), null);
});

test('the accept button no longer reloads the page', () => {
    assert.doesNotMatch(UTILS, /await callback\(true, permissions\); top\.open\(/);
});

test('the runner asks for permissions only on pages its glob matches', async() => {
    const requests = []
        , env = {
            href: () => 'https://webtoplex.github.io/web/login.html',
            get: async() => void null,
            getCache: async() => null,
            require: async(...args) => requests.push(args),
            populate: async() => {},
            minionsWanted: async() => false,
            listen() {},
            setTimeout: () => 0,
            clearTimeout() {},
            warn() {},
        };

    await RunSite({ url: '*://(ephellon|webtoplex).github.io/web[\\w\\.]*/(?!test|login)', requires: ['api'], init: () => -1 }, { alias: 'webtoplex-o3' }, env);

    assert.deepEqual(requests, []);
});
