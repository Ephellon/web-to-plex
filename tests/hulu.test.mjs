/*** /tests/hulu.test.mjs
 * SW1: cloud/hulu.js on title pages. The masthead selectors are gone (live 2026-10-03: `TypeError … reading
 * 'textContent'`, no button); the pages carry JSON-LD Movie / TVSeries with `releasedEvent.startDate`. The data below
 * is the live JSON-LD of www.hulu.com/movie/city-of-dreams-… and /series/1000-lb-best-friends-…, trimmed.
 * `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const MOVIE = { '@type': 'Movie', name: 'City of Dreams', url: 'https://www.hulu.com/movie/city-of-dreams-5bc04587-cf5e-476d-aa5b-f75bb6c1bde6', image: 'https://img4.hulu.com/user/v3/artwork/5bc04587-cf5e-476d-aa5b-f75bb6c1bde6?size=952x536', releasedEvent: { '@type': 'PublicationEvent', startDate: '2024-08-30' } }
    , SERIES = { '@type': 'TVSeries', name: '1000-Lb. Best Friends', url: 'https://www.hulu.com/series/1000-lb-best-friends-1b63df0c-204e-45db-9494-0d02788e986f', image: 'https://img2.hulu.com/user/v3/artwork/1b63df0c-204e-45db-9494-0d02788e986f?size=952x536', releasedEvent: { '@type': 'PublicationEvent', startDate: '2022-02-07' } };

/**
 * Loads cloud/hulu.js against a page.
 * @param {string} pathname - The page path
 * @param {object[]} [data] - The JSON-LD objects
 * @param {object} [elements] - Other elements, by selector
 * @returns {object} The script
 */
function load(pathname, data = [], elements = {}) {
    const all = { 'script[type="application/ld+json"]': data.map(item => ({ textContent: JSON.stringify(item) })), ...elements }
        , $ = selector => Object.assign([...all[selector] ?? []], { first: (all[selector] ?? [])[0], empty: !(all[selector] ?? []).length })
        , source = fs.readFileSync('src/cloud/hulu.js', 'utf8');

    return new Function('$', 'top', `${ source }\nreturn script;`)($, { location: { pathname, href: `https://www.hulu.com${ pathname }` } });
}

test('a movie page gives the movie from its JSON-LD', () => {
    const script = load(new URL(MOVIE.url).pathname, [MOVIE, { '@type': 'ItemList' }]);

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'movie', title: 'City of Dreams', year: 2024, image: MOVIE.image });
});

test('a series page gives the show and its premiere year', () => {
    assert.deepEqual(load(new URL(SERIES.url).pathname, [SERIES]).init(), { type: 'show', title: '1000-Lb. Best Friends', year: 2022, image: SERIES.image });
});

test('no data yet, or data for another page, asks for a retry', () => {
    assert.equal(load(new URL(MOVIE.url).pathname).ready(), false);
    assert.equal(load(new URL(MOVIE.url).pathname).init(), 1000);
    assert.equal(load(new URL(MOVIE.url).pathname, [SERIES]).init(), 1000);
});

test('the player page (/watch/) without its lines asks for a retry, without throwing', () => {
    assert.equal(load('/watch/0c050189-e841-4a12-99ae-93889c47c51a').init(), 5000);
});
