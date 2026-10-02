/*** /tests/csp.test.mjs
 * Phase 3c: the extension must run under the default MV3 CSP, which has no `'unsafe-eval'`.
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// Vendored, minified: lodash's only `Function("return this")` is behind `self`, which pages always have
const ALLOWED = new Set(['options/lodash.min.js']);

/**
 * Lists every `.js` file under a folder.
 * @param {string} folder - The folder
 * @returns {string[]} Paths relative to `src`
 */
function scripts(folder = 'src') {
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(folder, entry.name);

        return entry.isDirectory()
            ? scripts(full)
            : entry.name.endsWith('.js') ? [path.relative('src', full).replace(/\\/g, '/')] : [];
    });
}

/**
 * Pulls a top-level function's source out of a legacy script (CRLF-safe).
 * @param {string} file - Path under src
 * @param {string} name - The function name
 * @returns {function} The function, built from its own source
 */
function extract(file, name) {
    const source = fs.readFileSync(path.join('src', file), 'utf8').replace(/\r\n/g, '\n')
        , start = source.indexOf(`\nfunction ${ name }(`)
        , end = source.indexOf('\n}\n', start);

    return new Function(`return (${ source.slice(start + 1, end + 2) })`)();
}

test('no eval, new Function or string timers in src/', () => {
    const found = [];

    for(const file of scripts().filter(file => !ALLOWED.has(file)))
        fs.readFileSync(path.join('src', file), 'utf8').split('\n').forEach((line, index) => {
            if(/\beval\(|\bnew Function\b|[^.\w]Function\(|set(Timeout|Interval)\(\s*['"`]/.test(line.replace(/\/\/.*$/, '')))
                found.push(`${ file }:${ index + 1 }`);
        });

    assert.deepEqual(found, []);
});

test('addListener (utils.js and options/index.js) adds real listeners, in order, keeping closures', () => {
    for(const file of ['utils.js', 'options/index.js']) {
        const addListener = extract(file, 'addListener')
            , calls = []
            , listeners = []
            , element = { addEventListener: (type, fn) => listeners.push([type, fn]) }
            , local = 'closure';

        addListener(element, 'mouseup', () => calls.push(`first ${ local }`));
        addListener(element, 'onmouseup', () => calls.push('second'));
        addListener(element, 'click', () => calls.push('click'));

        assert.deepEqual(listeners.map(([type]) => type), ['mouseup', 'mouseup', 'click'], file);
        listeners.forEach(([, fn]) => fn());
        assert.deepEqual(calls, ['first closure', 'second', 'click'], file);
    }
});
