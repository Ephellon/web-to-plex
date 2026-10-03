/*** /tests/identify-tvmaze-lookup.test.mjs
 * TV1: utils.js `Identify` for a show that has an IMDb ID but no TVDb ID (an IMDb title or list page). It asked
 * `https://api.tvmaze.com/shows/?imdb=…`, which is not a TVmaze route (404), so the IDs stayed empty; it now asks
 * `/lookup/shows?imdb=…`. tests/fixtures/tvmaze-lookup-breaking-bad.json is a recorded reply of
 * `https://api.tvmaze.com/lookup/shows?imdb=tt0903747` (2026-10-03; the worker's fetch follows the 301 to /shows/169),
 * trimmed to the fields Identify reads; `/lookup/shows?thetvdb=81189` (TV2) gives the same show. Requests go to a stub of
 * `ServiceRequest`; nothing leaves the test.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const SHOW = fs.readFileSync('tests/fixtures/tvmaze-lookup-breaking-bad.json', 'utf8');
const SOURCE = fs.readFileSync('src/utils.js', 'utf8').replace(/\r\n/g, '\n');

/**
 * Pulls a function's source out of utils.js by its first line and the indentation of its closing brace.
 * @param {string} head - The function's first line, up to the parameters
 * @param {string} indent - The closing brace's indentation
 * @returns {string} The source
 */
function slice(head, indent) {
    const start = SOURCE.indexOf(head)
        , end = SOURCE.indexOf(`\n${ indent }}\n`, start);

    return SOURCE.slice(start, end + indent.length + 2);
}

String.prototype.toCaps ??= function() {
    return this;
};

/**
 * Builds `Identify` with its page-scope helpers stubbed: no saved results, no proxy, no managers, and
 * `ServiceRequest` answering from `reply(url)`.
 * @param {function} reply - Gives `{ status, text }` for a URL
 * @returns {{ Identify: function, requests: string[] }} The function and the URLs it asked for
 */
function identify(reply) {
    const requests = []
        , stubs = {
            __CONFIG__: {},
            UTILS_TERMINAL: { LOG() {}, log() {}, WARN() {}, ERROR() {}, error() {} },
            load: async() => null,
            save: async() => {},
            HandleProxyHeaders: () => ({}),
            YEAR: 2026,
            ServiceRequest: async urls => {
                const url = [].concat(urls)[0]
                    , { status, text } = reply(url);

                requests.push(url);

                return { ok: status < 300, status, url, text: async() => text, json: async() => JSON.parse(text) };
            },
            TVmazeShow: new Function(`return (${ slice('function TVmazeShow(', '') })`)(),
        }
        , Identify = new Function(...Object.keys(stubs), `return (${ slice('async function Identify(', '\t').trim() })`)(...Object.values(stubs));

    return { Identify, requests };
}

test('a show with an IMDb ID gets its TVDb ID from the TVmaze lookup', async() => {
    const { Identify, requests } = identify(url => (/^https:\/\/api\.tvmaze\.com\/lookup\/shows\?imdb=tt0903747$/.test(url) ? { status: 200, text: SHOW } : { status: 404, text: 'null' }));
    const data = await Identify({ type: 'show', title: 'Breaking Bad', year: 2008, IMDbID: 'tt0903747' });

    assert.deepEqual(requests, ['https://api.tvmaze.com/lookup/shows?imdb=tt0903747']);
    assert.equal(data.imdb, 'tt0903747');
    assert.equal(data.tvdb, 81189);
    assert.equal(data.year, 2008);
});

test('a show TVmaze does not know (404, `null`) keeps its IMDb ID and no others, without throwing', async() => {
    const { Identify, requests } = identify(() => ({ status: 404, text: 'null' }));
    const data = await Identify({ type: 'show', title: 'Nothing Here', year: 2020, IMDbID: 'tt0000001' });

    assert.equal(requests[0], 'https://api.tvmaze.com/lookup/shows?imdb=tt0000001');
    assert.equal(data.imdb, 'tt0000001');
    assert.equal(data.tvdb, 0);
    assert.equal(data.tmdb, 0);
});

// TV2: shows with a title and no IMDb ID go to OMDb and the F2 single search first; the TVDb lookup is for those with both IDs
test('a show with a TVDb ID asks the TVmaze lookup by TVDb ID', async() => {
    const { Identify, requests } = identify(url => (/^https:\/\/api\.tvmaze\.com\/lookup\/shows\?thetvdb=81189$/.test(url) ? { status: 200, text: SHOW } : { status: 404, text: 'null' }));
    const data = await Identify({ type: 'show', title: 'Breaking Bad', year: 2008, IMDbID: 'tt0903747', TVDbID: 81189 });

    assert.deepEqual(requests, ['https://api.tvmaze.com/lookup/shows?thetvdb=81189']);
    assert.equal(data.imdb, 'tt0903747');
    assert.equal(data.tvdb, 81189);
    assert.equal(data.year, 2008);
});

test('a TVDb ID TVmaze does not know (404, `null`) keeps the given IDs, without throwing', async() => {
    const { Identify, requests } = identify(() => ({ status: 404, text: 'null' }));
    const data = await Identify({ type: 'show', title: 'Nothing Here', year: 2020, IMDbID: 'tt0000001', TVDbID: 1 });

    assert.equal(requests[0], 'https://api.tvmaze.com/lookup/shows?thetvdb=1');
    assert.equal(data.imdb, 'tt0000001');
    assert.equal(data.tvdb, 1);
    assert.equal(data.tmdb, 0);
});

test('movies never ask TVmaze', async() => {
    const { Identify, requests } = identify(() => ({ status: 404, text: 'null' }));

    await Identify({ type: 'movie', title: 'The Shawshank Redemption', year: 1994, IMDbID: 'tt0111161' });

    assert.ok(requests.every(url => !url.includes('tvmaze')), requests.join(' '));
});
