/*** /tests/identify-tvmaze.test.mjs
 * F2: utils.js `TVmazeShow`, the TVmaze fallback Identify uses for shows when OMDb fails or has no key of the user's
 * own. tests/fixtures/tvmaze-singlesearch-breaking-bad.json is a recorded reply of
 * `https://api.tvmaze.com/singlesearch/shows?q=Breaking%20Bad` (2026-10-02), trimmed to the fields Identify reads.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPLY = JSON.parse(fs.readFileSync('tests/fixtures/tvmaze-singlesearch-breaking-bad.json', 'utf8'));

/**
 * Pulls a top-level function's source out of a legacy script (CRLF-safe), as tests/csp.test.mjs does.
 * @param {string} file - Path under src
 * @param {string} name - The function name
 * @returns {function} The function, built from its own source
 */
function extract(file, name) {
    const source = fs.readFileSync(`src/${ file }`, 'utf8').replace(/\r\n/g, '\n')
        , start = source.indexOf(`\nfunction ${ name }(`)
        , end = source.indexOf('\n}\n', start);

    return new Function(`return (${ source.slice(start + 1, end + 2) })`)();
}

const TVmazeShow = extract('utils.js', 'TVmazeShow');

test('a matching premiere year (±1) gives the show and its IMDb and TVDb IDs', () => {
    for(const year of [2008, '2008', 2007, 2009]) {
        const show = TVmazeShow(REPLY, year);

        assert.equal(show?.externals.imdb, 'tt0903747', `year ${ year }`);
        assert.equal(show?.externals.thetvdb, 81189, `year ${ year }`);
    }
});

test('another year, no IDs, or no reply give nothing', () => {
    assert.equal(TVmazeShow(REPLY, 2011), null);
    assert.equal(TVmazeShow(REPLY, 2005), null);
    assert.equal(TVmazeShow({ ...REPLY, externals: { tvrage: 18164 } }, 2008), null);
    assert.equal(TVmazeShow({ ...REPLY, premiered: null }, 2008), null);
    assert.equal(TVmazeShow(null, 2008), null);
    assert.equal(TVmazeShow(void null, 2008), null);
});

test('without a page year, any premiere counts', () => {
    assert.equal(TVmazeShow(REPLY, 0)?.externals.imdb, 'tt0903747');
    assert.equal(TVmazeShow(REPLY)?.externals.imdb, 'tt0903747');
});
