/*** /tests/options-s17-reset.test.mjs
 * S17: the options page's "Reset" says "This will remove all of your data", but its save only reset the inputs and
 * `storage.set` merges, so `servers`, `proxy`, `ClientID`, `~/cache/*` and the popup's localStorage links survived.
 * The reset save now clears storage.sync, storage.local and localStorage, saves the reset page, and asks the worker to
 * reseed the defaults (`RESEED_DEFAULTS` → `SeedDefaults`, as on a fresh install).
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LoadMV3, Settle } from './background-harness.mjs';

const SOURCE = fs.readFileSync('src/options/index.js', 'utf8').replace(/\r\n/g, '\n');

/**
 * The source of a top-level function.
 * @param {string} name - The function name
 * @returns {string} Its source
 */
const slice = name => {
    const start = SOURCE.indexOf(`\nfunction ${ name }(`);

    return SOURCE.slice(start + 1, SOURCE.indexOf('\n}\n', start) + 2);
};

test('the reset save clears both storage areas and localStorage before it saves, then asks for the defaults', async() => {
    const events = []
        , area = name => ({ clear: async() => events.push(`${ name }.clear`) })
        , chrome = {
            storage: { sync: area('sync'), local: area('local') },
            runtime: { lastError: null, sendMessage: (message, callback) => (events.push(`message ${ message.type }`), callback?.()) },
        }
        , stubs = {
            chrome,
            localStorage: { clear: () => events.push('localStorage.clear') },
            storage: { set: (items, callback) => (events.push(`storage.set ${ Object.keys(items).join(',') }`), callback()) },
            getOptionValues: () => ({ plexToken: '', UseProxy: false }),
            HandleProxySettings: () => ({ enabled: false }),
            LoadingAnimation() {},
            Notification: class {},
            terminal: { log() {}, warn() {} },
            console: { log() {} },
        }
        , save = new Function(...Object.keys(stubs), `${ slice('ClearAllData') }\nreturn (${ slice('saveOptionsWhileResetting') })`)(...Object.values(stubs));

    save();
    await Settle();

    assert.deepEqual(events.slice(0, 3).sort(), ['local.clear', 'localStorage.clear', 'sync.clear']);
    assert.equal(events[3], 'storage.set plexToken,UseProxy,proxy');
    assert.ok(events.includes('message RESEED_DEFAULTS'), events.join(' | '));
    assert.ok(events.includes('message UPDATE_CONFIGURATION'));
});

test('a storage area that cannot be cleared is logged, and the save still happens', async() => {
    const events = []
        , warnings = []
        , stubs = {
            chrome: {
                storage: { sync: { clear: async() => {
                    throw new Error('quota');
                } }, local: { clear: async() => events.push('local.clear') } },
                runtime: { lastError: null, sendMessage: (message, callback) => callback?.() },
            },
            localStorage: { clear() {
                throw new Error('denied');
            } },
            storage: { set: (items, callback) => (events.push('storage.set'), callback()) },
            getOptionValues: () => ({}),
            HandleProxySettings: () => ({ enabled: false }),
            LoadingAnimation() {},
            Notification: class {},
            terminal: { log() {}, warn: (...message) => warnings.push(message.join(' ')) },
            console: { log() {} },
        }
        , save = new Function(...Object.keys(stubs), `${ slice('ClearAllData') }\nreturn (${ slice('saveOptionsWhileResetting') })`)(...Object.values(stubs));

    save();
    await Settle();

    assert.deepEqual(events, ['local.clear', 'storage.set']);
    assert.equal(warnings.length, 2);
});

test('the worker answers RESEED_DEFAULTS by writing the install defaults', async() => {
    const mv3 = await LoadMV3({}, () => {
            throw new TypeError("no fetch expected");
        })
        , written = {};

    globalThis.chrome.storage.sync.set = async items => Object.assign(written, items);
    globalThis.chrome.storage.sync.get = (keys, callback) => (callback ? callback({}) : Promise.resolve({}));

    const { replies } = await mv3.send({ type: 'RESEED_DEFAULTS' });

    assert.equal(replies.length, 1);
    assert.equal(replies[0].ok, true);
    assert.ok(replies[0].keys > 0);
    assert.equal(written.builtin_imdb, true);
    assert.equal(written.IGNORE_PLEX, true);
});
