/*** /tests/manifest.test.mjs
 * Checks that every file the manifest and extension pages name exists in `src/`.
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const SOURCE = 'src';
const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json'), 'utf8'));

/**
 * Asserts that a file exists under SOURCE.
 * @param {string} file - The file, relative to SOURCE
 */
function exists(file) {
    assert.ok(fs.existsSync(path.join(SOURCE, file)), `Missing ${ file }`);
}

test('content scripts and styles exist', () => {
    for(const { js = [], css = [] } of manifest.content_scripts)
        [...js, ...css].forEach(exists);
});

test('background scripts exist', () => {
    const { scripts = [], service_worker } = manifest.background;

    [...scripts, service_worker].filter(Boolean).forEach(exists);
});

test('pages and icons exist', () => {
    const pages = [manifest.options_page, manifest.options_ui?.page, (manifest.action ?? manifest.browser_action)?.default_popup];
    const icons = [...Object.values(manifest.icons), ...Object.values((manifest.action ?? manifest.browser_action)?.default_icon ?? {})];

    [...pages, ...icons].filter(Boolean).forEach(exists);
});

test('page scripts exist', () => {
    for(const page of ['options/index.html', 'popup/index.html']) {
        const folder = path.posix.dirname(page);

        for(const [, src] of fs.readFileSync(path.join(SOURCE, page), 'utf8').matchAll(/<script[^>]*\bsrc=['"]([^'"]+)['"]/gi))
            exists(path.posix.join(folder, src));
    }
});
