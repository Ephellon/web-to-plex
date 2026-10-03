/*** /tests/rottentomatoes.test.mjs
 * T9, T12: cloud/rottentomatoes.js. tests/fixtures/rottentomatoes-jsonld.json holds the JSON-LD of three live pages
 * (2026-10-03, trimmed to the fields the script reads): /m/shawshank_redemption, /tv/breaking_bad and
 * /browse/movies_at_home (first three items). The page is a stub with just those scripts.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobToRegExp } from '../src/lib/site-runner.js';

const PAGES = JSON.parse(fs.readFileSync('tests/fixtures/rottentomatoes-jsonld.json', 'utf8'));

/**
 * Loads cloud/rottentomatoes.js against a page holding `data` as JSON-LD.
 * @param {string} pathname - The page path
 * @param {object[]} [data] - The JSON-LD objects
 * @returns {object} The script
 */
function load(pathname, data = []) {
    const source = fs.readFileSync('src/cloud/rottentomatoes.js', 'utf8')
        , document = { querySelectorAll: selector => (selector == 'script[type="application/ld+json"]' ? data.map(item => ({ textContent: JSON.stringify(item) })) : []) }
        , top = { location: { pathname, href: `https://www.rottentomatoes.com${ pathname }` } };

    return new Function('document', 'top', `${ source }\nreturn script;`)(document, top);
}

test('the glob matches movie, show (/tv/) and browse pages only', () => {
    const glob = GlobToRegExp(load('/').url);

    for(const path of ['/m/shawshank_redemption', '/tv/breaking_bad', '/tv/breaking_bad/s01', '/browse/movies_at_home/'])
        assert.ok(glob.test(`https://www.rottentomatoes.com${ path }`), path);

    for(const path of ['/', '/celebrity/tim_robbins', '/news/'])
        assert.ok(!glob.test(`https://www.rottentomatoes.com${ path }`), path);
});

test('a movie page gives the title, the year (not an empty string) and the poster', () => {
    const script = load('/m/shawshank_redemption', PAGES['/m/shawshank_redemption']);

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'movie', title: 'The Shawshank Redemption', year: 1994, image: PAGES['/m/shawshank_redemption'][0].image });
});

test('a show page (/tv/) gives a show', () => {
    const script = load('/tv/breaking_bad/', PAGES['/tv/breaking_bad']);

    assert.deepEqual({ ...script.init(), image: void null }, { type: 'show', title: 'Breaking Bad', year: 2008, image: void null });
});

test('a season page gives its series', () => {
    const season = { '@type': 'TVSeason', name: 'Season 1', url: 'https://www.rottentomatoes.com/tv/breaking_bad/s01', partOfSeries: PAGES['/tv/breaking_bad'][0].partOfSeries };

    assert.deepEqual(load('/tv/breaking_bad/s01', [season]).init(), { type: 'show', title: 'Breaking Bad', year: 2008, image: void null });
});

test('a browse page (/browse/…, T12) is a list of its items', () => {
    const script = load('/browse/movies_at_home', PAGES['/browse/movies_at_home']);

    assert.equal(script.getType(), 'list');
    assert.deepEqual(script.init().map(({ image, ...item }) => item), [
        { type: 'movie', title: 'Let Go', year: 2026 },
        { type: 'movie', title: 'Speakeasy', year: 2026 },
        { type: 'movie', title: 'Coyote vs. Acme', year: 2026 },
    ]);
});

test('JSON-LD for another page, none yet, or a non-title page', () => {
    assert.equal(load('/m/shawshank_redemption', PAGES['/tv/breaking_bad']).init(), 1000);
    assert.equal(load('/m/shawshank_redemption').ready(), false);
    assert.equal(load('/browse/movies_at_home').init(), 1000);
    assert.equal(load('/m/x', [{ '@type': 'Person', name: 'X', url: 'https://www.rottentomatoes.com/m/x' }]).init(), -1);
});
