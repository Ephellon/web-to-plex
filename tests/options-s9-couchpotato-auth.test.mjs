/*** /tests/options-s9-couchpotato-auth.test.mjs
 * S9: options/index.js `getCouchPotato` built `headers` with the Basic-auth `Authorization` and then called
 * `ServiceFetch(url)` without them, so a CouchPotato behind a password always failed the test. `ServiceFetch` is a
 * stub that records what it is given; nothing leaves the test.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const SOURCE = fs.readFileSync('src/options/index.js', 'utf8').replace(/\r\n/g, '\n');

/**
 * Builds `getCouchPotato` with a recording `ServiceFetch`.
 * @returns {{ getCouchPotato: function, requests: object[] }} The function and the recorded calls
 */
function build() {
    const requests = []
        , start = SOURCE.indexOf('\nfunction getCouchPotato(')
        , end = SOURCE.indexOf('\n}\n', start)
        , stubs = {
            ServiceFetch: (url, init) => (requests.push({ url, init }), Promise.resolve({ json: async() => ({ success: true }) })),
            Notification: class {},
            btoa,
        };

    return { getCouchPotato: new Function(...Object.keys(stubs), `return (${ SOURCE.slice(start + 1, end + 2) })`)(...Object.values(stubs)), requests };
}

test('the Basic-auth header reaches the request', async() => {
    const { getCouchPotato, requests } = build();

    await getCouchPotato({ couchpotatoURLRoot: 'http://couchpotato.invalid:5050', couchpotatoToken: 'key', couchpotatoBasicAuthUsername: 'user', couchpotatoBasicAuthPassword: 'pass' });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://couchpotato.invalid:5050/api/key/updater.info');
    assert.equal(requests[0].init?.headers?.Authorization, `Basic ${ btoa('user:pass') }`);
});

test('without Basic auth the request carries no Authorization header', async() => {
    const { getCouchPotato, requests } = build();

    await getCouchPotato({ couchpotatoURLRoot: 'http://couchpotato.invalid:5050', couchpotatoToken: 'key' });

    assert.equal(requests[0].init?.headers?.Authorization, void null);
    assert.equal(requests[0].init?.headers?.['X-API-Key'], 'key');
});
