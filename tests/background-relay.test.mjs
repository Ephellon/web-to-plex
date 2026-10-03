/*** /tests/background-relay.test.mjs
 * The service worker's fetch relay (src/background/services/relay.js): fallbacks, one reply, no credentials.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Service_Fetch } from '../src/background/services/relay.js';

/**
 * Runs the relay against a fake fetch.
 * @param {object} request - The SERVICE_FETCH message
 * @param {object} answers - URL to `{ status, text }`; a missing URL throws like a network error
 * @returns {Promise<{ replies: object[], calls: object[] }>} What the relay replied and fetched
 */
async function relay(request, answers) {
    const replies = []
        , calls = [];

    globalThis.fetch = async(url, init) => {
        calls.push({ url, init });

        if(!(url in answers))
            throw new TypeError("Failed to fetch");

        const { status, text } = answers[url];

        return { ok: status >= 200 && status < 300, status, text: async() => text };
    };

    await Service_Fetch(request, reply => replies.push(reply));

    return { replies, calls };
}

test('falls back to the legacy URL when the first answers 404', async() => {
    const { replies, calls } = await relay(
        { urls: ['http://localhost:7878/api/v3/movie', 'http://localhost:7878/api/movie'], headers: { 'X-Api-Key': 'k' } },
        { 'http://localhost:7878/api/v3/movie': { status: 404, text: '' }, 'http://localhost:7878/api/movie': { status: 200, text: '[]' } }
    );

    assert.deepEqual(replies, [{ ok: true, status: 200, url: 'http://localhost:7878/api/movie', text: '[]' }]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.credentials, 'omit');
    assert.equal(calls[0].init.headers['X-Api-Key'], 'k');
});

test('stops at the first 2xx answer', async() => {
    const { replies, calls } = await relay(
        { urls: ['http://localhost:7878/api/v3/movie', 'http://localhost:7878/api/movie'] },
        { 'http://localhost:7878/api/v3/movie': { status: 200, text: '[{"tmdbId":1}]' } }
    );

    assert.equal(replies.length, 1);
    assert.equal(replies[0].ok, true);
    assert.equal(calls.length, 1);
});

test('a network error replies once with the error; non-http URLs are refused', async() => {
    const failed = await relay({ urls: ['http://radarr.invalid/api/movie'] }, {})
        , refused = await relay({ urls: ['file:///etc/passwd', 'chrome://settings'] }, {});

    assert.equal(failed.replies.length, 1);
    assert.match(failed.replies[0].error, /Failed to fetch/);
    assert.deepEqual(refused.calls, []);
    assert.equal(refused.replies.length, 1);
    assert.ok(refused.replies[0].error);
});
