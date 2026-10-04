/*** /tests/plex.test.mjs
 * cloud/plex.js and the runner's page path on the Plex web app (checked live 2026-10-03, dummy account, read-only).
 *   - The app routes with the hash (`/desktop/#!/provider/…/details?key=…`), so the pathname never changes; `PathOf`
 *     ignored the hash, the runner never re-ran after the first page, and plex.js never ran on a details page.
 *   - The details page marks its parts with `data-testid` (`metadata-title`, `metadata-line1`, a "Seasons" hub); the
 *     old `data-qa-id` selectors are gone. The texts below are copied from live pages; `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobToRegExp, PathOf } from '../src/lib/site-runner.js';

/**
 * Loads cloud/plex.js against a details page.
 * @param {object} page - `title`, `line1`, `hubs` (hub and season-link texts) and `poster`
 * @returns {object} The script
 */
function load({ title, line1 = '', hubs = [], poster } = {}) {
    const elements = {
            '[data-testid="metadata-title"]': title ? [{ textContent: title }] : [],
            '[data-testid="metadata-line1"]': [{ textContent: line1 }],
            '[data-testid="hubTitle"], [data-testid="metadataTitleLink"]': hubs.map(textContent => ({ textContent })),
            '[data-testid="metadata-poster"] img': poster ? [{ src: poster }] : [],
        }
        , $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length });

    return new Function('$', `${ fs.readFileSync('src/cloud/plex.js', 'utf8') }\nreturn script;`)($);
}

const POSTER = 'https://images.plex.tv/photo?size=medium-360&url=example';

test('PathOf: a hash route is part of the path; other hashes and queries are not', () => {
    const one = 'https://app.plex.tv/desktop/#!/provider/tv.plex.provider.vod/details?key=%2Flibrary%2Fmetadata%2F5d77682aa091de001f2e69b0'
        , two = 'https://app.plex.tv/desktop/#!/provider/tv.plex.provider.vod/details?key=%2Flibrary%2Fmetadata%2F5d776ba2fb0d55001f56de78';

    assert.notEqual(PathOf(one), PathOf(two));
    assert.notEqual(PathOf('https://app.plex.tv/desktop/#!/'), PathOf(one));
    assert.equal(PathOf('https://example.com/app/#/movies/1'), '/app/#/movies/1');
    assert.equal(PathOf('https://trakt.tv/shows/x?season=1'), '/shows/x');
    assert.equal(PathOf('https://www.imdb.com/title/tt0111161/#cast'), '/title/tt0111161/');
});

test('the glob takes server and free-provider details pages, not the home or a library list', () => {
    const glob = GlobToRegExp(load().url);

    assert.ok(glob.test('https://app.plex.tv/desktop/#!/server/0123abcd/details?key=%2Flibrary%2Fmetadata%2F1'));
    assert.ok(glob.test('https://app.plex.tv/desktop/#!/provider/tv.plex.provider.vod/details?key=%2Flibrary%2Fmetadata%2F5d77682aa091de001f2e69b0&context=source%3Ahub.movie'));
    assert.ok(!glob.test('https://app.plex.tv/desktop/#!/media/tv.plex.provider.vod?source=movies'));
});

test('a movie page: title, year from line 1, poster', () => {
    const script = load({ title: 'Halloween', line1: 'R    2007    1hr 50min    Horror', hubs: ['Cast & Crew', 'Reviews', 'Extras', 'You Might Also Like'], poster: POSTER });

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'movie', title: 'Halloween', year: 2007, image: POSTER });
});

test('a show page (a "Seasons" hub) is a show', () => {
    const script = load({ title: 'Hannibal', line1: 'TV-MA    2013    Drama, Crime,  and more', hubs: ['Seasons', 'Cast & Crew', 'Extras'] });

    assert.deepEqual(script.init(), { type: 'show', title: 'Hannibal', year: 2013, image: void null });
});

test('an episode page is its show, without the air-date year', () => {
    const script = load({ title: 'The Walking Dead', line1: 'Season 2    Episode 12', hubs: ['Watch from these locations', 'Cast & Crew'] });

    assert.deepEqual(script.init(), { type: 'show', title: 'The Walking Dead', year: null, image: void null });
});

test('nothing rendered yet: not ready, retry', () => {
    const script = load();

    assert.equal(script.ready(), false);
    assert.equal(script.init(), 5000);
});
