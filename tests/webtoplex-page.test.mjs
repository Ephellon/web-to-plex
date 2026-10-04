/*** /tests/webtoplex-page.test.mjs
 * T16: cloud/webtoplex.js (webtoplex.github.io/web/) read `.textContent`, `.src` and `.getAttribute` of elements the
 * page builds only after its own lookup; on the live page (2026-10-04) none of #title, #year, #poster, #info or #tmdb
 * exist yet, so `ready()` threw on every retry. Every read is now null-safe. `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Loads cloud/webtoplex.js against a page.
 * @param {object} elements - Elements by id selector (`#title`, …)
 * @param {string} [search] - The page's query
 * @returns {object} The script
 */
function load(elements, search = '?tmdb=278&type=movie') {
    const $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length });

    return new Function('$', 'location', 'setTimeout', `${ fs.readFileSync('src/cloud/webtoplex.js', 'utf8') }\nreturn script;`)($, { search, pathname: '/web/' }, () => 0);
}

test('nothing rendered yet: ready is false and init retries, without throwing', () => {
    const script = load({});

    assert.doesNotThrow(() => script.ready());
    assert.ok(!script.ready());
    assert.equal(script.init(), script.timeout);
});

test('a rendered page gives the item', () => {
    const script = load({
        '#title': [{ textContent: 'The Shawshank Redemption' }],
        '#year': [{ textContent: '1994' }],
        '#poster': [{ src: 'https://example.invalid/278.jpg' }],
        '#info': [{ getAttribute: name => (name == 'type' ? 'movie' : null) }],
        '#tmdb': [{ textContent: '278' }],
        '#imdb': [{ textContent: 'tt0111161' }],
    });

    assert.equal(script.ready(), '278');
    assert.deepEqual(script.init(), { type: 'movie', title: 'The Shawshank Redemption', year: 1994, image: 'https://example.invalid/278.jpg', IMDbID: 'tt0111161', TMDbID: 278 });
});

test('a title without year, poster, info or IDs still gives the item', () => {
    assert.deepEqual(load({ '#title': [{ textContent: 'Heat' }] }).init(), { type: 'show', title: 'Heat', year: 0, image: void null, IMDbID: '', TMDbID: 0 });
});
