/*** /tests/options-s29-ombi-servers.test.mjs
 * S29: "Attach to Ombi" read `json.servers.length` from Ombi's Plex settings, which throws when Ombi has Plex enabled
 * but no `servers` (and then `json.ip.replace` on an empty server). It now says so and stops the spinner. Ombi is a
 * fake: `fetch` answers from a table of Ombi v4 reply shapes; nothing leaves the test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SOURCE = fs.readFileSync('src/options/index.js', 'utf8').replace(/\r\n/g, '\n');

/**
 * The source of a top-level function.
 * @param {string} name - The function name
 * @returns {string} Its source, or '' when the file has no such function
 */
const slice = name => {
    const start = SOURCE.indexOf(`\nfunction ${ name }(`);

    return start < 0 ? '' : SOURCE.slice(start + 1, SOURCE.indexOf('\n}\n', start) + 2);
};

/**
 * Runs "Attach to Ombi".
 * @param {object} replies - Ombi path (after `api/v1/`) → reply body; a missing path answers 404
 * @param {object} [page] - `useOmbi` (the "fill in your Manager Settings" box)
 * @returns {Promise<object>} `{ fields, toasts, requests, save, loading }`: the filled option values, toasts, requested URLs
 */
async function AttachToOmbi(replies, { useOmbi = true } = {}) {
    const fields = {}
        , toasts = []
        , requests = []
        , element = key => ({
            set value(v) {
                fields[key] = v;
            },
            get value() {
                return key == '#ombi_url' ? 'http://ombi.invalid:3579' : key == '#ombi_api' ? 'admin-key' : fields[key];
            },
            textContent: '',
            innerHTML: '',
            title: '',
            checked: key == '[data-option="UseOmbi"]' ? useOmbi : false,
        })
        , elements = {}
        , $ = selector => (elements[selector] ??= element(selector))
        , save = { disabled: null, innerHTML: '' }
        , servers = { value: '', innerHTML: '' }
        , loading = []
        , stubs = {
            $,
            __save__: save,
            __servers__: servers,
            MARKERS: { yes: 'yes', no: 'no', maybe: 'maybe' },
            LoadingAnimation: (state = false) => loading.push(state),
            Notification: class {
                constructor(type, message) {
                    toasts.push(`${ type }: ${ message }`);
                }
            },
            fetch: async url => {
                requests.push(url);

                const path = url.replace(/^.*\/api\/v1\//, '');

                if(!(path in replies))
                    return { ok: false, status: 404, json: async() => null };

                return { ok: true, status: 200, json: async() => structuredClone(replies[path]) };
            },
            ClientID: null,
            ServerID: null,
        }
        , names = ['performOmbiLogin', 'FillFromOmbi', 'OmbiURL'].filter(name => slice(name))
        , login = new Function(...Object.keys(stubs), `${ names.map(slice).join('\n') }\nreturn performOmbiLogin;`)(...Object.values(stubs));

    const unhandled = [];
    const onRejection = reason => unhandled.push(String(reason));

    process.on('unhandledRejection', onRejection);
    login({});

    for(let i = 0; i < 20; ++i)
        await new Promise(resolve => setTimeout(resolve, 0));

    process.off('unhandledRejection', onRejection);

    return { fields, toasts, requests, save, loading, unhandled };
}

for(const plex of [{ enable: true }, { enable: true, servers: [] }]) {
    test(`Ombi with Plex on and ${ plex.servers ? 'an empty' : 'no' } server list: a clear message, no TypeError`, async() => {
        const { toasts, unhandled, loading, save } = await AttachToOmbi({ 'Settings/plex': plex });

        assert.ok(toasts.some(toast => /no Plex server/.test(toast)), toasts.join(' | '));
        assert.ok(!toasts.some(toast => /TypeError/.test(toast)), toasts.join(' | '));
        assert.deepEqual(unhandled, []);
        assert.equal(loading.at(-1), false, 'the spinner is stopped');
        assert.equal(save.innerHTML, 'Save no');
    });
}
