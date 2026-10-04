/*** /tests/shanaproject.test.mjs
 * SH1: cloud/plugin/shanaproject.js sent the header's CSS `background-image` value as the poster, quotes and all, and
 * for series without art that is the site's placeholder (live 2026-10-03, /series/20402/:
 * `"//static.shanaproject.com/no-art.jpg"`). The placeholder now gives no image, and a real one loses its quotes.
 * `$` is a stub keyed by selector.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Loads cloud/plugin/shanaproject.js against a series page.
 * @param {string} [background] - The header box's `background-image` style
 * @returns {object} The plugin
 */
function load(background) {
    const elements = {
            '.overview i, #header_big .header_info_block': [{ textContent: 'Kusuriya no Hitorigoto' }],
            '#header_big .header_info_block + *': [{ textContent: 'Fall 2023' }],
            '#header_big .header_display_box': background == null ? [] : [{ style: { 'background-image': background } }],
        }
        , $ = selector => Object.assign([...elements[selector] ?? []], { first: (elements[selector] ?? [])[0], empty: !(elements[selector] ?? []).length });

    return new Function('$', `${ fs.readFileSync('src/cloud/plugin/shanaproject.js', 'utf8') }\nreturn plugin;`)($);
}

test('the "no art" placeholder gives no image', () => {
    assert.deepEqual(load('url("//static.shanaproject.com/no-art.jpg")').init(), { type: 'show', title: 'Kusuriya no Hitorigoto', year: 2023, image: null });
});

test('real art is kept, without its CSS quotes', () => {
    assert.equal(load('url("//static.shanaproject.com/art/20402.jpg")').init().image, '//static.shanaproject.com/art/20402.jpg');
    assert.equal(load('url(//static.shanaproject.com/art/20402.jpg)').init().image, '//static.shanaproject.com/art/20402.jpg');
});

test('no header box gives no image, without throwing', () => {
    assert.equal(load().init().image, null);
});
