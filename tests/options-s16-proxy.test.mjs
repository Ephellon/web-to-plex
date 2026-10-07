/*** /tests/options-s16-proxy.test.mjs
 * S16: options/index.js `HandleProxySettings` threw a `Notification` object for an insecure proxy URL. In Save that
 * came after `LoadingAnimation(true)` and `storage.set({ ClientID })` (spinner stuck, half-saved), and in
 * `GetIPAddress` it went unhandled on every page load. It now shows the error and returns null, and each caller stops
 * before the spinner or any storage write.
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
 * Builds `HandleProxySettings` with a recording `Notification`.
 * @returns {{ handle: function, toasts: string[] }} The function and its toasts
 */
function build() {
    const toasts = []
        , Notification = class {
            constructor(type, message) {
                toasts.push(`${ type }: ${ message }`);
            }
        };

    return { handle: new Function('Notification', `return (${ slice('HandleProxySettings') })`)(Notification), toasts };
}

test('an insecure proxy URL shows one error and gives null, without throwing', () => {
    const { handle, toasts } = build();
    let result;

    assert.doesNotThrow(() => (result = handle({ UseProxy: true, ProxyURL: 'http://proxy.invalid/{url}', ProxyHeaders: '' })));
    assert.equal(result, null);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0], /^error: Insecure URI scheme/);
});

test('a secure or unused proxy gives the proxy object', () => {
    const { handle, toasts } = build();

    assert.deepEqual(handle({ UseProxy: true, ProxyURL: 'https://proxy.invalid/{url}', ProxyHeaders: 'X: 1' }), { enabled: true, url: 'https://proxy.invalid/{url}', headers: 'X: 1' });
    assert.deepEqual(handle({ UseProxy: false, ProxyURL: 'http://proxy.invalid/', ProxyHeaders: '' }), { enabled: false, url: 'http://proxy.invalid/', headers: '' });
    assert.deepEqual(toasts, []);
});

test('Save checks the proxy before the spinner and before any storage write', () => {
    for(const name of ['saveOptions', 'saveOptionsWithoutPlex']) {
        const body = slice(name)
            , check = body.indexOf('HandleProxySettings(options)');

        assert.ok(check > 0, name);
        assert.match(body.slice(check, check + 120), /if\(!proxy\)\s+return/, name);

        for(const later of ['LoadingAnimation(true)', 'storage.set('])
            assert.ok(body.indexOf(later) == -1 || body.indexOf(later) > check, `${ name }: ${ later } comes after the check`);
    }
});

test('GetIPAddress with an insecure proxy marks the test failed, without a request or a throw', async() => {
    const start = SOURCE.indexOf("Recall['@auto'].GetIPAddress = ")
        , end = SOURCE.indexOf('\n};\n', start)
        , requests = []
        , ip = { innerHTML: '' }
        , status = { innerHTML: '' }
        , { handle } = build()
        , stubs = {
            Recall: { '@auto': {} },
            $: selector => (selector == '#ip-address' ? ip : status),
            getOptionValues: () => ({ UseProxy: true, ProxyURL: 'http://proxy.invalid/{url}', ProxyHeaders: '' }),
            HandleProxySettings: handle,
            HandleProxyHeaders: () => ({}),
            MARKERS: { maybe: 'maybe', no: 'no' },
            IP_CHECK_URL: 'https://example.invalid/ip',
            fetch: url => (requests.push(url), Promise.reject(new Error('no network in tests'))),
            Notification: class {},
        };

    new Function(...Object.keys(stubs), SOURCE.slice(start, end + 3))(...Object.values(stubs));

    await assert.doesNotReject(stubs.Recall['@auto'].GetIPAddress());
    assert.equal(status.innerHTML, 'no');
    assert.deepEqual(requests, []);
});
