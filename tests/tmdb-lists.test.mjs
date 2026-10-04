/*** /tests/tmdb-lists.test.mjs
 * T10: cloud/tmdb.js on list pages (live 2026-10-04). The glob and the manifest only took title pages, so the list
 * branch never ran; `process(element)` read `$('.title')` from the whole page; `.item.card` is gone. Popular and
 * top-rated pages render cards (`div[data-object-id]` with `a[data-media-type] > h2`, `.release_date`, `img.poster`); a
 * user list (/list/<id>) has a JSON-LD ItemList. The data below is copied from themoviedb.org/movie and /list/28.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobToRegExp } from '../src/lib/site-runner.js';

/**
 * A popular-page card: `div[data-object-id]` with its link, heading, date and poster.
 * @param {string} href - The link (`/movie/<id>-<slug>` or `/tv/<id>-<slug>`)
 * @param {string} title - The heading
 * @param {string} date - The release date text
 * @param {string} poster - The poster URL
 * @returns {object} The card
 */
function card(href, title, date, poster) {
    const link = { getAttribute: name => (name == 'href' ? href : null), querySelector: selector => (selector == 'h2' ? { textContent: title } : null) };

    return { querySelector: selector => (/a\[data-media-type\]/.test(selector) ? link : selector == '.release_date' ? { textContent: date } : selector == 'img.poster' ? { src: poster } : null) };
}

/**
 * Loads cloud/tmdb.js against a page.
 * @param {string} pathname - The page path
 * @param {object} elements - Elements by the exact selector the script asks for
 * @returns {object} The script
 */
function load(pathname, elements = {}) {
    const $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length });

    return new Function('$', 'top', `${ fs.readFileSync('src/cloud/tmdb.js', 'utf8') }\nreturn script;`)($, { location: { pathname } });
}

const CARDS = '[data-object-id]:has(a[data-media-type] h2)'
    , LD = 'script[type="application/ld+json"]';

test('the glob and the manifest take title and list pages, not cast, people or discover', () => {
    const glob = GlobToRegExp(load('/movie').url)
        , manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8')).content_scripts.find(entry => entry.js.includes('cloud/tmdb.js')).matches;

    for(const path of ['/movie/278-the-shawshank-redemption', '/tv/1396-breaking-bad', '/movie', '/movie?page=2', '/tv/top-rated', '/list/28-best-picture-winners-the-academy-awards'])
        assert.ok(glob.test(`https://www.themoviedb.org${ path }`), path);

    for(const path of ['/movie/278-the-shawshank-redemption/cast', '/person/287-brad-pitt', '/discover/movie'])
        assert.ok(!glob.test(`https://www.themoviedb.org${ path }`), path);

    assert.ok(manifest.includes('*://*.themoviedb.org/list/*'));
});

test('a popular page gives each card from inside that card', () => {
    const script = load('/movie', { [CARDS]: [
        card('/movie/969681-spider-man-brand-new-day', 'Spider-Man: Brand New Day', 'July 31, 2026', 'https://media.themoviedb.org/t/p/w220_and_h330_face/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg'),
        card('/tv/276161', 'Teach You a Lesson', 'Mar 3, 2026', 'https://media.themoviedb.org/t/p/w220_and_h330_face/fMECSPrTmRClSViMsXFYmiYIcWP.jpg'),
    ] });

    assert.equal(script.getType(), 'list');
    assert.deepEqual(script.init(), [
        { type: 'movie', title: 'Spider-Man: Brand New Day', year: 2026, image: 'https://media.themoviedb.org/t/p/w220_and_h330_face/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg', TMDbID: 969681 },
        { type: 'show', title: 'Teach You a Lesson', year: 2026, image: 'https://media.themoviedb.org/t/p/w220_and_h330_face/fMECSPrTmRClSViMsXFYmiYIcWP.jpg', TMDbID: 276161 },
    ]);
});

test('a user list gives its JSON-LD items (CDATA comments and all)', () => {
    const list = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Best Picture Winners - The Academy Awards', itemListElement: [
        { '@type': 'Movie', url: 'https://www.themoviedb.org/movie/1054867-one-battle-after-another', name: 'One Battle After Another', image: 'https://image.tmdb.org/t/p/w500/lbBWwxBht4JFP5PsuJ5onpMqugW.jpg', dateCreated: '2025-09-26' },
        { '@type': 'Movie', url: 'https://www.themoviedb.org/movie/1064213-anora', name: 'Anora', image: 'https://image.tmdb.org/t/p/w500/cgXk2tNYhJZLXdBDO5DidAVzQ82.jpg', dateCreated: '2024-10-18' },
    ] };
    const script = load('/list/28-best-picture-winners-the-academy-awards', { [LD]: [{ textContent: `\n/* <![CDATA[ */\n${ JSON.stringify(list) }\n/* ]]> */\n` }] });

    assert.deepEqual(script.init().map(({ title, year, TMDbID }) => [title, year, TMDbID]), [['One Battle After Another', 2025, 1054867], ['Anora', 2024, 1064213]]);
});

test('an empty list retries; a title path is still a title page', () => {
    assert.equal(load('/movie').init(), 1000);
    assert.equal(load('/movie/278-the-shawshank-redemption').getType(), 'movie');
    assert.equal(load('/tv/1396').getType(), 'tv');
    assert.equal(load('/person/287').getType(), 'error');
});
