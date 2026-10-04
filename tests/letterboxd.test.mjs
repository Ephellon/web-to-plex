/*** /tests/letterboxd.test.mjs
 * T13: cloud/letterboxd.js `minions` read the watch panel's `id` before checking that the panel exists, so a film or list
 * page without the panel (not rendered yet) threw `TypeError: Cannot read properties of
 * undefined (reading 'id')`. The page helpers (`$`, `furnish`, `addMinions`, `IMAGES`) are stubs.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Loads cloud/letterboxd.js against a page whose only element is `panel` (or none).
 * @param {object|null} panel - The element `$` finds for the panel selectors
 * @param {string} [pathname] - The page path
 * @returns {{ script: object, minions: object[] }} The script, and the minions it added
 */
function load(panel, pathname = '/film/the-shawshank-redemption/') {
    const minions = []
        , $ = () => Object.assign(panel ? [panel] : [], { first: panel ?? void null, empty: !panel })
        , furnish = (tag, attributes, ...children) => ({ tag, children })
        , source = fs.readFileSync('src/cloud/letterboxd.js', 'utf8')
        , script = new Function('$', 'furnish', 'addMinions', 'IMAGES', 'top', `${ source }\nreturn script;`)(
            $, furnish, minion => minions.push(minion), {}, { location: { pathname } });

    return { script, minions };
}

test('no watch panel: minions does nothing and does not throw', () => {
    for(const pathname of ['/film/the-shawshank-redemption/', '/dave/list/official-top-250-narrative-feature-films/']) {
        const { script, minions } = load(null, pathname);

        assert.doesNotThrow(() => script.minions(), pathname);
        assert.deepEqual(minions, []);
    }
});

test('with the panel (#watch, as on the live film page), one minion is added to it', () => {
    const appended = []
        , { script, minions } = load({ id: 'watch', appendChild: node => appended.push(node) });

    script.minions();

    assert.equal(minions.length, 1);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].tag, 'div.other');
});
