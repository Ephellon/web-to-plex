/*** /tests/google.test.mjs
 * T19: cloud/google.js decides "movie" or "show" from the result links. FILM looked for themoviedb.org/tv/ (a show
 * link) instead of themoviedb.org/movie/, so a film result whose only ID link is TMDb's was never recognised.
 * The live result page asked headless Chrome for a CAPTCHA (2026-10-03, not solved), so the pages here are built by hand:
 * the result links, and the knowledge-panel title and subtitle the script reads.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests one compound selector of attribute tests (`[href*="…"]`, `[href$="…"]`, `:not([class])`) against a link.
 * @param {object} link - `{ href, className }`
 * @param {string} compound - The compound selector
 * @returns {boolean} Whether it matches
 */
function matches(link, compound) {
    if(/:not\(\[class\]\)/.test(compound) && link.className)
        return false;

    return [...compound.matchAll(/\[href([*$])="([^"]+)"\]/g)].every(([, operator, value]) => (operator == '*' ? link.href.includes(value) : link.href.endsWith(value)));
}

/**
 * Loads cloud/google.js against a result page.
 * @param {object[]} links - The page's links, `{ href, className, textContent }`
 * @param {object} [elements] - Other elements, by the exact selector the script asks for
 * @returns {object} The script
 */
function load(links, elements = {}) {
    const source = fs.readFileSync('src/cloud/google.js', 'utf8')
        , $ = selector => {
            const found = selector.includes('[href') ? links.filter(link => selector.split(/,\s*/).some(compound => matches(link, compound))) : [].concat(elements[selector] ?? []);

            return Object.assign(found, { first: found[0], empty: !found.length });
        };

    return new Function('$', `${ source }\nreturn script;`)($);
}

const PANEL = {
    '#wp-tabs-container [data-attrid="title"i] span, [data-local-attribute], [role="heading"i] > div > a': { textContent: 'The Shawshank Redemption' },
    '#wp-tabs-container [data-attrid="subtitle"i] span, [role="heading"i] > div:last-child': { textContent: '1994 ‧ Drama ‧ 2h 22m' },
};

test('a film result linking only TMDb (/movie/) is a movie', () => {
    const script = load([{ href: 'https://www.themoviedb.org/movie/278-the-shawshank-redemption', className: 'x' }], PANEL);

    assert.equal(script.getType(), 'movie');
    assert.deepEqual(script.init(), { type: 'movie', title: 'The Shawshank Redemption', year: 1994, image: void null, IMDbID: void null });
});

test('a film result with an IMDb link is still a movie, with its IMDb ID', () => {
    const script = load([{ href: 'https://www.imdb.com/title/tt0111161/', className: '', textContent: 'IMDb' }], PANEL);

    assert.equal(script.getType(), 'movie');
    assert.equal(script.init().IMDbID, 'tt0111161');
});

test('a TMDb /tv/ or TVDb link is a show, as before', () => {
    assert.equal(load([{ href: 'https://www.themoviedb.org/tv/1396-breaking-bad', className: 'x' }]).getType(), 'show');
    assert.equal(load([{ href: 'https://thetvdb.com/series/breaking-bad', className: 'x' }]).getType(), 'show');
});

test('T17: a subtitle without a year gives 0, never a year left over from an earlier regex', () => {
    // Reading the subtitle first runs another regex, as the page's own code would, leaving RegExp.$1 = "2026"
    const subtitle = { get textContent() {
        /(2026)/.exec('stale 2026');

        return 'Drama ‧ 2h 22m';
    } };
    const script = load([{ href: 'https://www.themoviedb.org/movie/278-the-shawshank-redemption', className: 'x' }], {
        ...PANEL,
        '#wp-tabs-container [data-attrid="subtitle"i] span, [role="heading"i] > div:last-child': subtitle,
    });

    assert.equal(script.init().year, 0);
});

test('a result page with no title links is not handled', () => {
    const script = load([{ href: 'https://en.wikipedia.org/wiki/Film', className: '' }]);

    assert.equal(script.getType(), 'error');
    assert.equal(script.init(), -1);
});
