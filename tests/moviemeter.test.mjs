/*** /tests/moviemeter.test.mjs
 * MM1: cloud/moviemeter.js on its 2026 pages (checked live 2026-10-03 in a normal window; headless Chrome gets a
 * Cloudflare block). `ready` waited for `.rating + p font`, which is gone, so the script never ran; the page has JSON-LD
 * Movie (name, image, `sameAs` = IMDb) and the heading "Fools Rush In (1997)". The data below is copied from
 * moviemeter.nl/film/1229; `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobToRegExp } from '../src/lib/site-runner.js';

/**
 * Loads a cloud script against a page.
 * @param {string} file - The script under src/cloud
 * @param {string} href - The page URL
 * @param {object} elements - Elements by the exact selector the script asks for
 * @returns {object} The script
 */
function load(file, href, elements) {
    const $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length })
        , source = fs.readFileSync(`src/cloud/${ file }`, 'utf8');

    return new Function('$', 'top', `${ source }\nreturn script;`)($, { location: new URL(href) });
}

const ld = data => [{ textContent: JSON.stringify(data) }];

const MM_MOVIE = { '@context': 'https://schema.org', '@type': 'Movie', datePublished: '2023-02-24T23:07:08+01:00', dateCreated: '2013-07-01T07:58:26+02:00', name: 'Fools Rush In', image: 'https://www.moviemeter.nl/images/cover/1000/1229.300.jpg', sameAs: 'https://www.imdb.com/title/tt0119141' }
    , MM_PAGE = {
        'script[type="application/ld+json"]': [...ld({ '@type': 'https://schema.org/WebPage', name: 'Fools Rush In (Film, 1997) - MovieMeter.nl' }), ...ld(MM_MOVIE)],
        h1: [{ textContent: 'Fools Rush In (1997)' }],
        'meta[property="og:title"]': [{ content: 'Fools Rush In (Film, 1997) - MovieMeter.nl' }],
        'meta[property="og:type"]': [{ content: 'video.movie' }],
    };

test('MovieMeter: the glob matches film pages', () => {
    const glob = GlobToRegExp(load('moviemeter.js', 'https://www.moviemeter.nl/', {}).url);

    assert.ok(glob.test('https://www.moviemeter.nl/film/1229'));
    assert.ok(!glob.test('https://www.moviemeter.nl/user/179959'));
});

test('MovieMeter: a film page gives the movie, the heading year (not the database dates) and the IMDb ID', () => {
    const script = load('moviemeter.js', 'https://www.moviemeter.nl/film/1229', MM_PAGE);

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'movie', title: 'Fools Rush In', year: 1997, image: MM_MOVIE.image, IMDbID: 'tt0119141' });
});

test('MovieMeter: og:title gives the year without a heading; a series is a show; no data asks for a retry', () => {
    const series = load('moviemeter.js', 'https://www.moviemeter.nl/film/1', {
        ...MM_PAGE,
        h1: [],
        'meta[property="og:title"]': [{ content: 'Example (Serie, 2008) - MovieMeter.nl' }],
        'meta[property="og:type"]': [{ content: 'video.tv_show' }],
    });

    assert.equal(series.init().type, 'show');
    assert.equal(series.init().year, 2008);

    const empty = load('moviemeter.js', 'https://www.moviemeter.nl/film/1229', {});

    assert.equal(empty.ready(), false);
    assert.equal(empty.init(), 1000);
});
