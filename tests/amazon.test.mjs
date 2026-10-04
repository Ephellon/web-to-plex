/*** /tests/amazon.test.mjs
 * T20: cloud/amazon.js on Prime Video detail pages. The image fallback read `.src` of a `$()` list (always undefined),
 * and on the 2026 page none of the old title selectors match, so init threw `TypeError … reading 'textContent'`. The
 * elements below are the live pages' (2026-10-03: B0875L45GK The Boys, B0HHH4DNHM a film); `$` is a stub keyed by
 * selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const HERO = 'https://m.media-amazon.com/images/S/pv-target-images/afa52b62887ed55475d095a8e18c5610b2444d28beb5b6ee2f322e6613374bad._SX1080_FMjpg_.jpg';

/**
 * Loads cloud/amazon.js against a detail page.
 * @param {object} page - `art` (title-art alt), `tab` (document.title), `year`, `hero` and `episodes`
 * @returns {object} The script
 */
function load({ art, tab = '', year, hero, episodes = false }) {
    const elements = {
            'h1[data-testid="title-art"] img': art == null ? [] : [{ alt: art }],
            '[data-automation-id="release-year-badge"]': year ? [{ textContent: year }] : [],
            '[data-automation-id="hero-background"] img, img[data-testid="base-image"]': hero ? [{ src: hero }] : [],
            '[data-automation-id="btf-episodes-tab"], [data-automation-id^="ep-title-episode"]': episodes ? [{}] : [],
        }
        , $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length })
        , source = fs.readFileSync('src/cloud/amazon.js', 'utf8');

    return new Function('$', 'document', `${ source }\nreturn script;`)($, { title: tab });
}

test('a show page: title art, release year, hero image, episodes → show', () => {
    const script = load({ art: 'The Boys', tab: 'Watch The Boys - Season 1 | Prime Video', year: '2019', hero: HERO, episodes: true });

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'show', title: 'The Boys', year: 2019, image: HERO });
});

test('a film page (no episodes) is a movie', () => {
    const script = load({ art: 'Go Deep: The DeSean Jackson Story', year: '2026', hero: HERO });

    assert.deepEqual(script.init(), { type: 'movie', title: 'Go Deep: The DeSean Jackson Story', year: 2026, image: HERO });
});

test('without title art, the tab title gives the title; missing year and image do not throw', () => {
    const script = load({ tab: 'Watch Bosch - Season 1 | Prime Video', episodes: true });

    assert.deepEqual(script.init(), { type: 'show', title: 'Bosch', year: null, image: void null });
});

test('nothing rendered yet asks for a retry', () => {
    const script = load({ tab: 'Amazon.com' });

    assert.equal(script.ready(), false);
    assert.equal(script.init(), 1000);
});
