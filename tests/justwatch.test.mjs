/*** /tests/justwatch.test.mjs
 * JW1: cloud/justwatch.js on its 2026 pages (checked live 2026-10-03 in a normal window; headless Chrome gets a 403).
 * The title and year still read, but `.title-poster__image` is gone, so the image is the JSON-LD Movie/TVSeries `image`,
 * an `@id` pointing at an ImageObject. The data below is copied from those pages; `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Loads a cloud script against a page.
 * @param {string} file - The script under src/cloud
 * @param {string} href - The page URL
 * @param {object} elements - Elements by the exact selector the script asks for
 * @returns {object} The script
 */
function load(file, href, elements) {
    const $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length })
        , source = fs.readFileSync(`src/cloud/${ file }`, 'utf8');

    return new Function('$', 'top', `${ source }\nreturn script;`)($, { location: new URL(href) });
}

const ld = data => [{ textContent: JSON.stringify(data) }];

const JW_MOVIE = { '@context': 'https://schema.org', '@graph': [
        { '@id': 'https://www.justwatch.com/us/movie/the-shawshank-redemption', '@type': 'Movie', dateCreated: '1994-09-23', name: 'The Shawshank Redemption', image: { '@id': 'https://www.justwatch.com/#/schema/image/1' } },
        { '@id': 'https://www.justwatch.com/#/schema/image/1', '@type': 'ImageObject', url: 'https://images.justwatch.com/poster/309786652/s718/the-shawshank-redemption.jpg' },
    ] }
    , JW_TITLE = '.title-block, .title-detail-hero__details__title'
    , JW_YEAR = '.title-block .text-muted, .title-detail-hero__details__title .release-year';

test('JustWatch: title and year from the hero heading, poster from the JSON-LD ImageObject', () => {
    const script = load('justwatch.js', 'https://www.justwatch.com/us/movie/the-shawshank-redemption', {
        [JW_TITLE]: [{ localName: 'h1', textContent: 'The Shawshank Redemption (1994)' }],
        [JW_YEAR]: [{ textContent: '(1994)' }],
        'script[type="application/ld+json"]': ld(JW_MOVIE),
    });

    assert.deepEqual(script.init(), { type: 'movie', title: 'The Shawshank Redemption', year: 1994, image: 'https://images.justwatch.com/poster/309786652/s718/the-shawshank-redemption.jpg' });
});

test('JustWatch: a show page, and no JSON-LD gives no image without throwing', () => {
    const script = load('justwatch.js', 'https://www.justwatch.com/us/tv-show/breaking-bad', {
        [JW_TITLE]: [{ localName: 'h1', textContent: 'Breaking Bad (2008)' }],
        [JW_YEAR]: [{ textContent: '(2008)' }],
    });

    assert.deepEqual(script.init(), { type: 'show', title: 'Breaking Bad', year: 2008, image: void null });
});
