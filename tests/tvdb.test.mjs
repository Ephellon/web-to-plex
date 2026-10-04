/*** /tests/tvdb.test.mjs
 * T15: cloud/tvdb.js. TheTVDB series pages use slugs (https://thetvdb.com/series/breaking-bad; numeric /series/81189 is a
 * 404 now), so the ID never came from the path, and the basic-info parse never found "First Aired" (the rows have blank
 * lines inside) and fell back to `YEAR`, a utils.js local: ReferenceError, no button. The rows below are the live
 * page's (2026-10-03), whitespace included; `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * A basic-info row: `<li><strong>name</strong><span>value</span></li>`.
 * @param {string} name - The row name
 * @param {string} value - The row text, as textContent gives it
 * @returns {object} The row
 */
const row = (name, value) => ({
    textContent: `\n    ${ name }\n    ${ value }\n`,
    querySelector: selector => ({ strong: { textContent: name }, span: { textContent: value } })[selector] ?? null,
});

const ROWS = [
    row('TheTVDB.com Series ID', '81189'),
    row('Status', '\n        Ended\n    '),
    row('First Aired', '\n        \n            January 20, 2008\n        \n    '),
    row('Network', '\n        AMC\n    '),
];

/**
 * Loads cloud/tvdb.js against a series page.
 * @param {string} pathname - The page path
 * @param {object} [page] - `rows`, `title` and `poster`
 * @returns {object} The script
 */
function load(pathname, { rows = ROWS, title = 'Breaking Bad', poster = 'https://artworks.thetvdb.com/banners/posters/81189-10.jpg' } = {}) {
    const elements = {
            '#series_basic_info': rows.length ? [{}] : [],
            '#series_basic_info li': rows,
            '#series_title, .translated_title': title ? [{ textContent: `\n  ${ title }\n` }] : [],
            'img[src*="/posters/"]': poster ? [{ src: poster }] : [],
        }
        , $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length })
        , source = fs.readFileSync('src/cloud/tvdb.js', 'utf8');

    return new Function('$', 'top', `${ source }\nreturn script;`)($, { location: { pathname } });
}

test('a slug page gives the show, the First Aired year and the TVDb ID from the basic info', () => {
    const script = load('/series/breaking-bad');

    assert.equal(script.ready(), true);
    assert.deepEqual(script.init(), { type: 'show', title: 'Breaking Bad', year: 2008, image: 'https://artworks.thetvdb.com/banners/posters/81189-10.jpg', TVDbID: '81189' });
});

test('a numeric path still gives its ID', () => {
    assert.equal(load('/series/81189', { rows: ROWS.slice(1) }).getTVDbID(), '81189');
});

test('missing rows give no year and no ID, without throwing', () => {
    const script = load('/series/breaking-bad', { rows: [row('Status', 'Ended')], poster: null });

    assert.deepEqual(script.init(), { type: 'show', title: 'Breaking Bad', year: 0, image: void null, TVDbID: void null });
});

test('no title yet asks for a retry', () => {
    assert.equal(load('/series/breaking-bad', { title: null }).init(), 1000);
});
