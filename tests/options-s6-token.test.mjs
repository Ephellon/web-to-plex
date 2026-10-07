/*** /tests/options-s6-token.test.mjs
 * S6: options/index.js `get<Svc>` returned a `Notification` (the page's toast) when the token was empty, and every
 * caller chains `.then` on the result: `TypeError: … .then is not a function`, a raw error toast, and a spinner that
 * only the catch could stop. Each now returns a rejected Promise, which the callers' `.catch` turns into one
 * "Invalid <Svc> token" message.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const SOURCE = fs.readFileSync('src/options/index.js', 'utf8').replace(/\r\n/g, '\n');

/**
 * Builds a top-level function of options/index.js with its page helpers stubbed.
 * @param {string} name - The function name
 * @param {object} stubs - Names the function reads, and their stand-ins
 * @returns {function} The function
 */
function extract(name, stubs) {
    const start = SOURCE.indexOf(`\nfunction ${ name }(`)
        , end = SOURCE.indexOf('\n}\n', start);

    return new Function(...Object.keys(stubs), `return (${ SOURCE.slice(start + 1, end + 2) })`)(...Object.values(stubs));
}

const SERVICES = [['Watcher', 'watcher'], ['Radarr', 'radarr'], ['Sonarr', 'sonarr'], ['Medusa', 'medusa'], ['SickBeard', 'sickBeard'], ['CouchPotato', 'couchpotato']];

test('an empty token gives a rejected Promise with the "Invalid <Svc> token" message, and no request', async() => {
    for(const [name, key] of SERVICES) {
        const toasts = []
            , requests = []
            , get = extract(`get${ name }`, {
                Notification: class {
                    constructor(type, message) {
                        toasts.push(message);
                    }
                },
                ServiceFetch: url => (requests.push(url), Promise.resolve({ json: async() => ({}) })),
                btoa,
            })
            , result = get({ [`${ key }Token`]: '', [`${ key }URLRoot`]: 'http://localhost:1' });

        assert.equal(typeof result?.then, 'function', `get${ name } returns a Promise`);
        await assert.rejects(result, new RegExp(`Invalid ${ name.replace('SickBeard', 'Sick Beard') } token`));
        assert.deepEqual(requests, [], name);
        assert.deepEqual(toasts, [], `${ name }: the caller's catch shows the one toast`);
    }
});
