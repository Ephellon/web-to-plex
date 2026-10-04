/*** /tests/fandango.test.mjs
 * FD1: cloud/fandango.js. The old selectors (.subnav__title, .movie-details__release-date) are gone, so init threw
 * `TypeError … reading 'textContent'` (live 2026-10-04). The page has a JSON-LD Movie whose name carries the year. The
 * data below is copied from fandango.com/digger-2026-245150/movie-overview; `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobToRegExp } from '../src/lib/site-runner.js';

const PAGE = 'https://www.fandango.com/digger-2026-245150/movie-overview'
    , MOVIE = { '@context': 'http://schema.org', '@type': 'Movie', name: 'Digger (2026)', datePublished: '2026-10-02', url: PAGE, image: 'https://images.fandango.com/ImageRenderer/0/0/redesign/static/img/default_poster--dark-mode.png/0/images/masterrepository/Fandango/245150/DIGGER_VERT_CAST_2764x4096_DOM.jpg' };

/**
 * Loads cloud/fandango.js against a page holding `data` as JSON-LD.
 * @param {string} href - The page URL
 * @param {object[]} [data] - The JSON-LD objects
 * @returns {object} The script
 */
function load(href, data = []) {
    const elements = { 'script[type="application/ld+json"]': data.map(item => ({ textContent: JSON.stringify(item) })) }
        , $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length });

    return new Function('$', 'top', `${ fs.readFileSync('src/cloud/fandango.js', 'utf8') }\nreturn script;`)($, { location: new URL(href) });
}

test('the glob matches movie-overview pages', () => {
    const glob = GlobToRegExp(load(PAGE).url);

    assert.ok(glob.test(PAGE));
    assert.ok(!glob.test('https://www.fandango.com/movies-in-theaters'));
});

test('a movie page: title without the year, the year from the name, the poster', () => {
    const script = load(PAGE, [MOVIE, { '@type': 'FAQPage' }]);

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'movie', title: 'Digger', year: 2026, image: MOVIE.image });
});

test('a name without a year falls back to datePublished', () => {
    assert.deepEqual(load(PAGE, [{ ...MOVIE, name: 'Digger' }]).init().year, 2026);
});

test('no data, or data for another page, asks for a retry', () => {
    assert.equal(load(PAGE).ready(), false);
    assert.equal(load(PAGE).init(), 1000);
    assert.equal(load(PAGE, [{ ...MOVIE, url: 'https://www.fandango.com/other-1/movie-overview' }]).init(), 1000);
});
