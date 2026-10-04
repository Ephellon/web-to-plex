/*** /tests/tubi.test.mjs
 * SW2: cloud/tubi.js. The hashed class selectors (._1mbQP, ._3BhXb, ._2TykB) are gone (live 2026-10-03: `TypeError …
 * reading 'textContent'`, no button); the pages carry a JSON-LD `@graph` with the Movie or TVSeries. The data below is
 * the live JSON-LD of tubitv.com/movies/100063704/… and /series/300021761/…, trimmed. `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobToRegExp } from '../src/lib/site-runner.js';

const MOVIE = { '@id': 'https://tubitv.com/movies/100063704/spider-man-far-from-home#video', '@type': 'Movie', name: 'Spider-Man: Far from Home', url: 'https://tubitv.com/movies/100063704/spider-man-far-from-home', dateCreated: '2019-01-01T00:00:00.000Z', releasedEvent: { startDate: '2019-01-01T00:00:00.000Z', '@type': 'PublicationEvent' } }
    , SERIES = { '@type': 'TVSeries', url: 'https://tubitv.com/series/300021761/tales-from-the-crypt', name: 'Tales From the Crypt', image: 'https://canvas-lb.tubitv.com/opts/KpwuxiW40a6-zQ==/10e4b074-af12-4a16-ac22-5c56e410a6a5/CJgDEMcEOgUxLjEuOQ==', dateCreated: '1996-01-01', startDate: '1996-01-01' }
    , OG_IMAGE = 'https://canvas-lb.tubitv.com/opts/pOHmdqM4ERuoXg==/a5b9cc51-9ac2-444a-905d-d3dbc9a483f5/CNcHEKgEOgUxLjEuOQ==';

/**
 * Loads cloud/tubi.js against a page.
 * @param {string} pathname - The page path
 * @param {object[]} [graph] - The JSON-LD `@graph`
 * @returns {object} The script
 */
function load(pathname, graph = []) {
    const all = {
            'script[type="application/ld+json"]': graph.length ? [{ textContent: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) }] : [],
            'meta[property="og:image"]': [{ content: OG_IMAGE }],
        }
        , $ = selector => Object.assign([...all[selector] ?? []], { first: (all[selector] ?? [])[0], empty: !(all[selector] ?? []).length })
        , source = fs.readFileSync('src/cloud/tubi.js', 'utf8');

    return new Function('$', 'top', `${ source }\nreturn script;`)($, { location: { pathname, href: `https://tubitv.com${ pathname }` } });
}

test('the glob matches movie and series pages', () => {
    const glob = GlobToRegExp(load('/').url);

    assert.ok(glob.test(MOVIE.url));
    assert.ok(glob.test(SERIES.url));
    assert.ok(!glob.test('https://tubitv.com/tv-shows'));
});

test('a movie page gives the movie (og:image when the item has none)', () => {
    const script = load('/movies/100063704/spider-man-far-from-home', [MOVIE]);

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'movie', title: 'Spider-Man: Far from Home', year: 2019, image: OG_IMAGE });
});

test('a series page gives the show', () => {
    assert.deepEqual(load('/series/300021761/tales-from-the-crypt', [SERIES]).init(), { type: 'show', title: 'Tales From the Crypt', year: 1996, image: SERIES.image });
});

test('no data, or data for another page, asks for a retry', () => {
    assert.equal(load('/movies/100063704/spider-man-far-from-home').ready(), false);
    assert.equal(load('/movies/100063704/spider-man-far-from-home').init(), 1000);
    assert.equal(load('/movies/100063704/spider-man-far-from-home', [SERIES]).init(), 1000);
});
