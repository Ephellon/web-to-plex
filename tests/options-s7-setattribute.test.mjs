/*** /tests/options-s7-setattribute.test.mjs
 * S7: the Ombi test's failure path called `setAttribute('disabled')` with one argument, which throws
 * `TypeError: … 2 arguments required` and replaced the `Ombi error [status]` thrown on the next line. No one-argument
 * `setAttribute` may remain anywhere in src/.
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Lists every `.js` file under a folder.
 * @param {string} folder - The folder
 * @returns {string[]} The paths
 */
function scripts(folder) {
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? scripts(path.join(folder, entry.name)) : entry.name.endsWith('.js') ? [path.join(folder, entry.name)] : []));
}

test('every setAttribute call passes a value', () => {
    const found = scripts('src')
        .filter(file => !/lodash/.test(file))
        .flatMap(file => fs.readFileSync(file, 'utf8').split('\n').map((line, index) => (/setAttribute\(\s*(['"`])[^'"`]+\1\s*\)/.test(line) ? `${ file.replace(/\\/g, '/') }:${ index + 1 }` : null)))
        .filter(hit => hit);

    assert.deepEqual(found, []);
});
