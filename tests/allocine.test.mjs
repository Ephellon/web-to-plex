/*** /tests/allocine.test.mjs
 * AC1: cloud/allocine.js. Series pages have no `.date`, so init retried forever (live 2026-10-04: Stranger Things,
 * ficheserie_gen_cserie=19156, 0 runs); their first `.meta-body-info` line reads "2016 - 2025 | 55 min | …". Film pages
 * returned the type `film` instead of `movie`. The texts below are copied from the live pages; `$` is a stub keyed by
 * selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Loads cloud/allocine.js against a page.
 * @param {string} pathname - The page path
 * @param {object} elements - Elements by the exact selector the script asks for
 * @returns {object} The script
 */
function load(pathname, elements) {
    const $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length });

    return new Function('$', 'top', `${ fs.readFileSync('src/cloud/allocine.js', 'utf8') }\nreturn script;`)($, { location: { pathname } });
}

const TITLE = '.titlebar-title'
    , YEAR = '.date, .meta-body font, .meta-body-info'
    , IMAGE = '.thumbnail-img';

test('a series page (no `.date`) takes the year from the first info line and is a show', () => {
    const script = load('/series/ficheserie_gen_cserie=19156.html', {
        [TITLE]: [{ textContent: 'Stranger Things' }],
        [YEAR]: [{ textContent: '2016 - 2025 | 55 min | Drame, Epouvante-horreur, Fantastique, Science Fiction' }],
        [IMAGE]: [{ src: 'https://fr.web.img4.acsta.net/c_310_420/img/b6/40/b640b5857449902c32431fca38df4122.jpg' }],
    });

    assert.deepEqual(script.init(), { type: 'show', title: 'Stranger Things', year: 2016, image: 'https://fr.web.img4.acsta.net/c_310_420/img/b6/40/b640b5857449902c32431fca38df4122.jpg' });
});

test('a film page is a movie (not `film`)', () => {
    const script = load('/film/fichefilm_gen_cfilm=327721.html', {
        [TITLE]: [{ textContent: "Le Seigneur des anneaux : la communauté de l'anneau (version longue)" }],
        [YEAR]: [{ textContent: '4 septembre 2024' }],
    });

    assert.deepEqual(script.init(), { type: 'movie', title: "Le Seigneur des anneaux : la communauté de l'anneau (version longue)", year: 2024, image: void null });
});

test('no title or no year line yet asks for a retry', () => {
    assert.equal(load('/series/x', { [TITLE]: [{ textContent: 'X' }] }).init(), 1000);
    assert.equal(load('/film/x', {}).init(), 1000);
});
