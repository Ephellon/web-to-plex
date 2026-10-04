/*** /tests/letterboxd-pages.test.mjs
 * LB1: cloud/letterboxd.js on today's pages (2026-10-03). List rows are `li.posteritem` with the film in the poster's
 * `data-item-name` ("Harakiri (1962)"), so the old `.poster-list .poster-container` found nothing ("Empty result
 * list"); on film pages the first `.film-poster img` is the empty-poster placeholder, while the JSON-LD `Movie.image`
 * (wrapped in CDATA comments) is the real poster. The rows and data below are copied from
 * letterboxd.com/official/list/letterboxds-top-500-films/ and letterboxd.com/film/the-shawshank-redemption/.
 * `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const POSTER = 'https://a.ltrbxd.com/resized/sm/upload/7l/hn/46/uz/zGINvGjdlO6TJRu9wESQvWlOKVT-0-600-0-900-crop.jpg?v=8736d1c395'
    , EMPTY = 'https://s.ltrbxd.com/static/img/empty-poster-1000-CR2Xn85D.png';

/**
 * A list row: `li.posteritem > div[data-item-name] > img`.
 * @param {string} name - The poster's data-item-name
 * @param {string} src - The image's src
 * @returns {object} The row
 */
const row = (name, src) => ({
    querySelector: selector => ({ '[data-item-name]': { getAttribute: attribute => (attribute == 'data-item-name' ? name : null) }, img: { src } })[selector] ?? null,
});

/**
 * Loads cloud/letterboxd.js against a page.
 * @param {string} pathname - The page path
 * @param {object} elements - Elements by the exact selector the script asks for
 * @returns {object} The script
 */
function load(pathname, elements) {
    const $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length })
        , source = fs.readFileSync('src/cloud/letterboxd.js', 'utf8');

    return new Function('$', 'top', `${ source }\nreturn script;`)($, { location: { pathname } });
}

test('a list page gives its films from li.posteritem rows: title, year, loaded posters only', () => {
    const script = load('/official/list/letterboxds-top-500-films/', {
        'li.posteritem, .poster-list .poster-container, .poster-list .film-detail': [
            row('Harakiri (1962)', 'https://a.ltrbxd.com/resized/film-poster/4/3/0/1/5/43015-harakiri-0-125-0-187-crop.jpg?v=007080a0fb'),
            row("The Human Condition III: A Soldier's Prayer (1961)", 'https://s.ltrbxd.com/static/img/empty-poster-125-AiuBHVCI.png'),
            row('12 Angry Men (1957)', 'https://a.ltrbxd.com/resized/film-poster/5/1/7/0/0/51700-12-angry-men-0-125-0-187-crop.jpg?v=b8aaf291a9'),
        ],
    });

    assert.deepEqual(script.init(), [
        { type: 'movie', title: 'Harakiri', year: 1962, image: 'https://a.ltrbxd.com/resized/film-poster/4/3/0/1/5/43015-harakiri-0-125-0-187-crop.jpg?v=007080a0fb' },
        { type: 'movie', title: "The Human Condition III: A Soldier's Prayer", year: 1961, image: void null },
        { type: 'movie', title: '12 Angry Men', year: 1957, image: 'https://a.ltrbxd.com/resized/film-poster/5/1/7/0/0/51700-12-angry-men-0-125-0-187-crop.jpg?v=b8aaf291a9' },
    ]);
});

test('a row without a year or a name', () => {
    const script = load('/someone/list/x/', { 'li.posteritem, .poster-list .poster-container, .poster-list .film-detail': [row('Untitled Film', EMPTY), row('', EMPTY)] });

    assert.deepEqual(script.init(), [{ type: 'movie', title: 'Untitled Film', year: null, image: void null }]);
});

test('a film page takes the poster from the JSON-LD, not the placeholder', () => {
    const script = load('/film/the-shawshank-redemption/', {
        'script[type="application/ld+json"]': [{ textContent: `\n/* <![CDATA[ */\n${ JSON.stringify({ '@type': 'Movie', name: 'The Shawshank Redemption', image: POSTER }) }\n/* ]]> */\n` }],
        '.film-poster img, .image': [{ src: EMPTY }, { src: 'https://a.ltrbxd.com/resized/other-230.jpg' }],
    });

    assert.equal(script.getPoster(), POSTER);
});

test('without JSON-LD, the first loaded poster image (never the placeholder)', () => {
    const script = load('/film/the-shawshank-redemption/', { '.film-poster img, .image': [{ src: EMPTY }, { src: 'https://a.ltrbxd.com/resized/real-230.jpg' }] });

    assert.equal(script.getPoster(), 'https://a.ltrbxd.com/resized/real-230.jpg');
});
