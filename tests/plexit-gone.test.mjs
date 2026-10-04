/*** /tests/plexit-gone.test.mjs
 * X1b: X1 removed the "Open Plex It!" item and its remote script; the "Add to Plex It!" items (`li#plexit`, hidden by
 * CSS, still built for every search), their icons and the CSS for the bookmarklet frame stayed behind. None of it can
 * do anything without the remote script, so it is gone too.
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Lists every file under a folder.
 * @param {string} folder - The folder
 * @returns {string[]} The paths
 */
function files(folder) {
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? files(path.join(folder, entry.name)) : [path.join(folder, entry.name)]));
}

test('no Plex It! code, styles or icons are left in src/', () => {
    const found = files('src')
        .filter(file => /\.(js|css|html|json)$/.test(file))
        .flatMap(file => fs.readFileSync(file, 'utf8').split('\n').map((line, index) => (/plexit|plex\.it\b|Plex It!/i.test(line) ? `${ file.replace(/\\/g, '/') }:${ index + 1 }` : null)))
        .filter(hit => hit);

    assert.deepEqual(found, []);
    assert.deepEqual(files('src/img').filter(file => /plexit/i.test(file)), []);
});
