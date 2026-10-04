/*** /tests/flickmetrix.test.mjs
 * FM1 (T18): cloud/flickmetrix.js answered an empty list with `new Notification('error', …)`. In a content script that
 * is the browser's Notification (the extension's notice class lives inside utils.js), whose second argument must be an
 * options object, so the page threw `TypeError: Failed to construct 'Notification'` (live 2026-10-03). It now warns once
 * and retries. `$` is a stub keyed by selector; `Notification` is the browser's, made to throw as Chrome does.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Loads cloud/flickmetrix.js against a list page.
 * @param {object[]} films - The `.film` elements, each with `.title`, the year after it, `img` and an IMDb link
 * @returns {{ script: object, warnings: string[] }} The script, and what it warned
 */
function load(films) {
    const warnings = []
        , select = (elements, selector) => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length })
        , page = { '.film': films, '#singleFilm': [] }
        , $ = (selector, container) => select(container?.parts ?? page, selector)
        , Notification = class {
            constructor(title, options) {
                if(options !== void null && typeof options != 'object')
                    throw new TypeError("Failed to construct 'Notification': The provided value is not of type 'NotificationOptions'.");
            }
        }
        , console = { warn: (...message) => warnings.push(message.join(' ')) }
        , script = new Function('$', 'location', 'Notification', 'console', `${ fs.readFileSync('src/cloud/flickmetrix.js', 'utf8') }\nreturn script;`)(
            $, { search: '' }, Notification, console);

    return { script, warnings };
}

/**
 * A `.film` element.
 * @param {string} title - The title
 * @param {string} year - The text after the title ("(1994)")
 * @param {string} IMDbID - The IMDb ID of its link
 * @returns {object} The element
 */
const film = (title, year, IMDbID) => ({ parts: {
    '.title': [{ textContent: title }],
    '.title + *': [{ textContent: year }],
    img: [{ src: `https://example.invalid/${ IMDbID }.jpg` }],
    '[href*="imdb.com/title/tt"]': [{ href: `https://www.imdb.com/title/${ IMDbID }/` }],
} });

test('an empty list warns once and retries, without throwing', () => {
    const { script, warnings } = load([]);

    assert.equal(script.isList(), true);
    assert.equal(script.init(), 1000);
    assert.equal(script.init(), 1000);
    assert.equal(warnings.length, 1);
});

test('a list gives its films', () => {
    const { script } = load([film('The Shawshank Redemption', '(1994)', 'tt0111161'), film('Heat', '(1995)', 'tt0113277')]);

    assert.deepEqual(script.init().map(({ title, year }) => [title, year]), [['The Shawshank Redemption', 1994], ['Heat', 1995]]);
});
