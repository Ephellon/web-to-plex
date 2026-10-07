/*** /tests/options-o2-ombi-prefill.test.mjs
 * O2 (owner report): "Attach to Ombi" no longer filled in Radarr and Sonarr. Root causes:
 *   1. The Radarr/Sonarr/CouchPotato requests ran only inside the "Ombi has Plex enabled" branch.
 *   2. Ombi v4 answers `GET /api/v1/Settings/radarr` with `{ radarr, radarr4K }` (RadarrCombinedModel), so
 *      `json.enabled` was undefined and the prefill returned without a word.
 *   3. `subDir` was dropped from the manager URLs, and request errors were rethrown into nothing.
 * The fake Ombi below answers with the v4 shapes of Ombi's SettingsController and settings models (camelCase JSON);
 * nothing leaves the test.
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

const RADARR = { radarr: { enabled: true, apiKey: 'radarr-key', defaultQualityProfile: '4', defaultRootPath: '/movies', ip: 'radarr.invalid', port: 7878, ssl: false, subDir: '/radarr/' }, radarr4K: { enabled: false, apiKey: '', ip: '', port: 0 } }
    , SONARR = { enabled: true, apiKey: 'sonarr-key', qualityProfile: '6', rootPath: '/tv', ip: 'http://sonarr.invalid', port: 8989, ssl: true, subDir: '' }
    , field = (fields, option) => fields[`[data-option="${ option }"]`];

test('without Plex in Ombi, Radarr and Sonarr are still filled in from the v4 replies (subDir kept)', async() => {
    const { fields, toasts, unhandled, loading } = await AttachToOmbi({
        'Settings/plex': { enable: false, servers: [] },
        'Settings/radarr': RADARR,
        'Settings/sonarr': SONARR,
        'Settings/CouchPotato': { enabled: false },
    });

    assert.equal(field(fields, 'ombiURLRoot'), 'http://ombi.invalid:3579/');
    assert.equal(field(fields, 'ombiToken'), 'admin-key');
    assert.equal(field(fields, 'radarrToken'), 'radarr-key');
    assert.equal(field(fields, 'radarrURLRoot'), 'http://radarr.invalid:7878/radarr/');
    assert.equal(field(fields, 'radarrQualityProfileId'), '4');
    assert.equal(field(fields, 'radarrStoragePath'), '/movies');
    assert.equal(field(fields, 'sonarrToken'), 'sonarr-key');
    assert.equal(field(fields, 'sonarrURLRoot'), 'https://sonarr.invalid:8989/');
    assert.equal(field(fields, 'sonarrQualityProfileId'), '6');
    assert.equal(field(fields, 'sonarrStoragePath'), '/tv');
    assert.equal(field(fields, 'couchpotatoToken'), void null);
    assert.ok(toasts.includes('update: Filled in Radarr') && toasts.includes('update: Filled in Sonarr'), toasts.join(' | '));
    assert.deepEqual(unhandled, []);
    assert.equal(loading.at(-1), false);
});

test('with Plex in Ombi, the Plex server and the managers are filled in', async() => {
    const { fields, toasts } = await AttachToOmbi({
        'Settings/plex': { enable: true, servers: [{ name: 'Home', plexAuthToken: 'plex-token', machineIdentifier: 'abc123', ip: '192.0.2.1', port: 32400, ssl: false }] },
        'Settings/radarr': RADARR,
        'Settings/sonarr': SONARR,
        'Settings/CouchPotato': { enabled: true, apiKey: 'cp-key', ip: 'cp.invalid', port: 5050, ssl: false, subDir: '' },
    });

    assert.equal(field(fields, '#plex_token') ?? fields['#plex_token'], 'plex-token');
    assert.equal(field(fields, 'radarrToken'), 'radarr-key');
    assert.equal(field(fields, 'couchpotatoURLRoot'), 'http://cp.invalid:5050/');
    assert.ok(toasts.includes('update: Filled in CouchPotato'), toasts.join(' | '));
});

test('an older Ombi that answers with the Radarr settings themselves still fills in', async() => {
    const { fields } = await AttachToOmbi({ 'Settings/plex': { enable: false }, 'Settings/radarr': RADARR.radarr });

    assert.equal(field(fields, 'radarrToken'), 'radarr-key');
});

test('a failing request (here a 404) says so, and the others still fill in', async() => {
    const { fields, toasts, unhandled } = await AttachToOmbi({ 'Settings/plex': { enable: false }, 'Settings/sonarr': SONARR });

    assert.ok(toasts.some(toast => /^error: Error getting Radarr details from Ombi: Ombi answered 404/.test(toast)), toasts.join(' | '));
    assert.equal(field(fields, 'sonarrToken'), 'sonarr-key');
    assert.deepEqual(unhandled, []);
});

test('with "use Ombi to fill in" off, no manager settings are requested', async() => {
    const { requests } = await AttachToOmbi({ 'Settings/plex': { enable: false }, 'Settings/radarr': RADARR }, { useOmbi: false });

    assert.deepEqual(requests.map(url => url.replace(/^.*\/api\/v1\//, '')), ['Settings/plex']);
});
