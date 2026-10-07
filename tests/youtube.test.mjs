/*** /tests/youtube.test.mjs
 * T14: cloud/youtube.js set a 10 ms `setInterval` that re-ran `init` while the description was collapsed. It was only
 * cleared by a second full run of `init`, so when that run returned early (no "more" button yet, a dropdown open) the
 * interval ran for the life of the tab. It is now one check a second, at most 10, and is cleared when it fires.
 * `$` is a stub keyed by selector for a "YouTube Movies" watch page; the timers are recorded, not run.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Loads cloud/youtube.js with recorded timers.
 * @param {object} [page] - `collapsed` (the expander's state), `expander` (whether it exists) and `details` (the description
 *     text, or null for none)
 * @returns {object} `{ script, intervals, cleared, tick }`
 */
function load({ collapsed = true, expander = true, details = 'Release date 1994' } = {}) {
    const intervals = []
        , cleared = new Set()
        , element = text => ({ textContent: text, attributes: collapsed ? { collapsed: '' } : {}, click() {}, addEventListener() {} })
        , elements = {
            '.more-button:not(span), .less-button': [element('more')],
            '.more-button:not(span)': [element('more')],
            '.super-title, #title, #header #main-title': [element('The Shawshank Redemption')],
            '#owner-container, #upload-info [href^="/channel/"]': [element('YouTube Movies')],
            '.title': [element('The Shawshank Redemption')],
            '#content ytd-expander': details == null ? [] : [element(details)],
            'ytd-expander': expander ? [element('')] : [],
        }
        , $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length })
        , setInterval = (callback, delay) => intervals.push({ callback, delay }) - 1
        , clearInterval = id => cleared.add(id)
        , script = new Function('$', 'top', 'setInterval', 'clearInterval', 'setTimeout', `${ fs.readFileSync('src/cloud/youtube.js', 'utf8') }\nreturn script;`)(
            $, { location: { pathname: '/watch' } }, setInterval, clearInterval, () => 0);

    // Runs every live interval once (as a second of time passing)
    const tick = () => intervals.forEach((interval, id) => cleared.has(id) || interval.callback());

    return { script, intervals, cleared, tick };
}

test('the watch-page check runs once a second, not every 10 ms', () => {
    const { script, intervals } = load();

    assert.equal(script.init().type, 'movie');
    assert.ok(intervals.length >= 1);
    assert.ok(intervals.every(interval => interval.delay >= 1000), intervals.map(interval => interval.delay).join(', '));
});

test('the check is capped: an expanded description stops it after 10 checks', () => {
    const { script, intervals, cleared, tick } = load({ collapsed: false });

    script.init();

    for(let second = 0; second < 12; ++second)
        tick();

    assert.ok(intervals.every((interval, id) => cleared.has(id)), 'every interval cleared');
});

test('no expander: the check stops at once, and init does not throw', () => {
    const { script, intervals, cleared, tick } = load({ expander: false });

    assert.doesNotThrow(() => script.init());
    tick();

    assert.ok(intervals.every((interval, id) => cleared.has(id)));
});

test('YT1: the year comes from the release date, else none (no `YEAR` ReferenceError, no NaN)', () => {
    assert.equal(load().script.init().year, 1994);
    assert.equal(load({ details: 'Air date 3/14/09' }).script.init().year, 2009);
    assert.equal(load({ details: 'A man is wrongly imprisoned.' }).script.init().year, null);
    assert.equal(load({ details: null }).script.init().year, null);
    assert.equal(load({ details: null }).script.init().title, 'The Shawshank Redemption');
});
