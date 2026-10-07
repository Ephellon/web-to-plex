/*** /tests/options-s19-client-id.test.mjs
 * S19: the Plex sign-in sent `X-Plex-Client-Identifier: null` (ClientID started null), and after sign-in `ClientID`
 * became the account's auth token; the `ClientID` saved to storage was never read. The identifier is now one random
 * UUID per install, kept in storage.local and reused. `fetch` and `chrome.storage.local` are stubs.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

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

/**
 * Builds `tryPlexLogin` with stubbed storage and network.
 * @param {object} local - The storage.local contents
 * @returns {{ login: function, requests: object[] }} The function and the recorded requests
 */
function build(local) {
    const requests = []
        , stubs = {
            chrome: { storage: { local: {
                get: async key => (key in local ? { [key]: local[key] } : {}),
                set: async items => Object.assign(local, items),
            } } },
            fetch: async(url, init) => (requests.push({ url, init }), { json: async() => ({ user: { authToken: 'account-token' } }) }),
            manifest: { version: '5.0' },
            ClientID: null,
            btoa,
            crypto,
        }
        , login = new Function(...Object.keys(stubs), `${ slice('PlexClientIdentifier') }\nreturn (${ slice('tryPlexLogin') })`)(...Object.values(stubs));

    return { login, requests };
}

test('the sign-in sends a UUID client identifier, made once and stored', async() => {
    const local = {}
        , { login, requests } = build(local);

    await login('user', 'pass');
    await login('user', 'pass');

    const [first, second] = requests.map(request => request.init.headers['X-Plex-Client-Identifier']);

    assert.match(first, /^web-to-plex-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(second, first);
    assert.equal(local.PlexClientIdentifier, first);
});

test('a stored identifier is reused', async() => {
    const { login, requests } = build({ PlexClientIdentifier: 'web-to-plex-kept' });

    await login('user', 'pass');

    assert.equal(requests[0].init.headers['X-Plex-Client-Identifier'], 'web-to-plex-kept');
});

test('the auth token is never used as the client identifier, and the unread ClientID key is not saved', () => {
    assert.doesNotMatch(SOURCE, /ClientID\s*=\s*t\.value/);
    assert.doesNotMatch(SOURCE, /storage\.set\(\{\s*ClientID\s*\}\)/);
});
