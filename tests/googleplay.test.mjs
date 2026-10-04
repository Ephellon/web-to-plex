/*** /tests/googleplay.test.mjs
 * GP1: cloud/google.play.js. `h1 ~ div span` (the year) and `img[alt="cover art"]` are gone, so init threw
 * `TypeError … reading 'textContent'` (live 2026-10-04). The heading is `h1 > span[itemprop=name]`, the next block after
 * the heading's wrapper reads "2026 • 105 minutes", and the poster is `img[itemprop=image]`. The structure below is
 * copied from play.google.com/store/movies/details/Stranglehold?id=jPpIFcLhrDA.P; `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const POSTER = 'https://play-lh.googleusercontent.com/CwhydlF_lClUWgyaBK3EiVCzmFthAQ72M5x7zuIR_z_Umc2Dve2i3UuX0gTsr_oc0nMsBGfokPuJNOGFKFS4=w240-h480-rw';

/**
 * Builds the heading: `div > h1 > span[itemprop=name]`, followed by the details line.
 * @param {string} name - The heading text
 * @param {string} line - The details line text
 * @returns {object} The name span
 */
function heading(name, line) {
    const wrapper = { nextElementSibling: line == null ? null : { textContent: line } }
        , h1 = { parentElement: wrapper, closest: () => h1 };

    return { textContent: name, closest: selector => (selector == 'h1' ? h1 : null) };
}

/**
 * Loads cloud/google.play.js against a details page.
 * @param {string} pathname - The page path
 * @param {object} [page] - `title` (from `heading`) and `poster`
 * @returns {object} The script
 */
function load(pathname, { title, poster } = {}) {
    const elements = {
            'h1 [itemprop="name"], h1': title ? [title] : [],
            'img[itemprop="image"], img[alt="cover art" i]': poster ? [{ src: poster }] : [],
        }
        , $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length });

    return new Function('$', 'location', `${ fs.readFileSync('src/cloud/google.play.js', 'utf8') }\nreturn script;`)($, { pathname });
}

test('a movie page: name, the year from the details line, the poster', () => {
    const script = load('/store/movies/details/Stranglehold', { title: heading('Stranglehold', '2026 • 105 minutes'), poster: POSTER });

    assert.deepEqual(script.init(), { type: 'movie', title: 'Stranglehold', year: 2026, image: POSTER });
});

test('a year in the heading ("Title (1994)") wins and is taken out of the title', () => {
    const script = load('/store/movies/details/x', { title: heading('The Shawshank Redemption (1994)', '2008 • 142 minutes') });

    assert.deepEqual(script.init(), { type: 'movie', title: 'The Shawshank Redemption', year: 1994, image: void null });
});

test('a TV page is a show; no details line gives no year, without throwing', () => {
    const script = load('/store/tv/details/x', { title: heading('Example Show', null) });

    assert.deepEqual(script.init(), { type: 'show', title: 'Example Show', year: null, image: void null });
});

test('no heading yet asks for a retry', () => {
    assert.equal(load('/store/movies/details/x').init(), 1000);
});
