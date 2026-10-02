/*** /tests/background-router.test.mjs
 * The MV3 service-worker router contract (docs/PHASE3.md), and parity with MV2 for the message types that drive
 * the context menu, badge, downloads and options page instead of fetching.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { LoadMV2, LoadMV3, Settle } from './background-harness.mjs';

const OPTIONS = { plexToken: 'T', servers: [{ id: 'abc', token: 'T' }], DeveloperMode: false };
const NO_FETCH = () => { throw new TypeError("no fetch expected") };
const plain = value => JSON.parse(JSON.stringify(value));

// What utils.js sends for a page item (`Update('SEARCH_FOR', { ...options, button })`)
const SEARCH_FOR = { type: 'SEARCH_FOR', options: { type: 'movie', title: "Heat", year: 1995, IMDbID: 'tt0113277', TMDbID: 949, TVDbID: 0, href: 'https://cdn.invalid/heat.mp4', tail: 'mkv', path: 'D:\\Films\\' } };

/**
 * Sends the same messages to MV2 and MV3 and returns the chrome calls each made for the last one.
 * @param {object[]} requests - Messages, in order
 * @returns {Promise<object>} `{ mv2, mv3, a, b }`: the two harnesses and the last exchanges
 */
async function Both(...requests) {
    const mv2 = await LoadMV2(OPTIONS, NO_FETCH)
        , mv3 = await LoadMV3(OPTIONS, NO_FETCH);

    let a, b;

    for(const request of requests) {
        mv2.calls.length = mv3.calls.length = 0;
        a = await mv2.send(request);
        b = await mv3.send(request);
    }

    return { mv2, mv3, a, b };
}

test('messages from another extension are rejected', async() => {
    const mv3 = await LoadMV3(OPTIONS, NO_FETCH)
        , { returned, replies } = await mv3.send({ type: 'OPEN_OPTIONS' }, { id: 'someone-else' });

    assert.equal(returned, false);
    assert.deepEqual(replies, []);
    assert.deepEqual(mv3.calls, []);
});

test('unknown types and the plugn.js types are ignored, not answered', async() => {
    const mv3 = await LoadMV3(OPTIONS, NO_FETCH);

    for(const type of ['NOPE', 'SCRIPT', 'PLUGIN', '$INIT$', '_INIT_', 'FOUND', 'GRANT_PERMISSION', void null]) {
        const { returned, replies } = await mv3.send({ type, options: { script: 'imdb' } });

        assert.equal(returned, false, type);
        assert.deepEqual(replies, [], type);
    }

    assert.deepEqual(mv3.calls, []);
});

test('a handler that fails still replies exactly once', async() => {
    const mv3 = await LoadMV3(OPTIONS, NO_FETCH)
        , { returned, replies } = await mv3.send({ type: 'SEARCH_PLEX', options: { title: "Heat" } });   // no serverConfig

    assert.equal(returned, true);
    assert.equal(replies.length, 1);
    // Replied as an error object, so content-side callers reject instead of treating a string as success
    assert.match(replies[0].error, /TypeError/);
});

test('context menus: created on install, same items as MV2 start-up', async() => {
    const mv2 = await LoadMV2(OPTIONS, NO_FETCH)
        , mv3 = await LoadMV3(OPTIONS, NO_FETCH);

    mv3.install();
    assert.deepEqual(plain(mv3.calls), plain(mv2.calls.filter(([api]) => api == 'contextMenus.create')));
});

test('SEARCH_FOR: same badge and menu updates as MV2', async() => {
    const { mv2, mv3, a, b } = await Both(SEARCH_FOR);

    assert.ok(mv3.calls.length >= 6);
    assert.deepEqual(plain(mv3.calls), plain(mv2.calls));
    assert.deepEqual([a.replies, b.replies], [[], []]);
    assert.equal(b.returned, false, 'no reply is coming (MV2 returned true and held the port: B50)');
});

test('SAVE_AS, DOWNLOAD_FILE, OPEN_OPTIONS: same chrome calls as MV2', async() => {
    for(const type of ['SAVE_AS', 'DOWNLOAD_FILE', 'OPEN_OPTIONS']) {
        const { mv2, mv3 } = await Both({ ...SEARCH_FOR, type });

        assert.ok(mv3.calls.length >= 1, type);
        assert.deepEqual(plain(mv3.calls), plain(mv2.calls), type);
    }
});

test('UPDATE_CONFIGURATION is handled without a reply', async() => {
    const { b } = await Both({ type: 'UPDATE_CONFIGURATION' });

    assert.equal(b.returned, false);
    assert.deepEqual(b.replies, []);
});

test('menu clicks after SEARCH_FOR open the same pages and downloads as MV2 (external kept in storage.session)', async() => {
    for(const item of ['W2P-IM', 'W2P-TM', 'W2P-TV', 'W2P-XX', 'W2P-DL', 'other']) {
        const { mv2, mv3 } = await Both(SEARCH_FOR);

        mv2.calls.length = mv3.calls.length = 0;
        mv2.click({ menuItemId: item });
        await mv3.click({ menuItemId: item });
        await Settle();

        assert.deepEqual(plain(mv3.calls), plain(mv2.calls), item);
    }
});

test('show items without an IMDb ID: menus and clicks match MV2', async() => {
    const show = { type: 'SEARCH_FOR', options: { type: 'tv show', title: "Lost & Found", year: 2004, TVDbID: 73739 } };

    for(const item of ['W2P-TV', 'W2P-XX', 'W2P-IM']) {
        const { mv2, mv3 } = await Both(show);

        assert.deepEqual(plain(mv3.calls), plain(mv2.calls), 'SEARCH_FOR');
        mv2.calls.length = mv3.calls.length = 0;
        mv2.click({ menuItemId: item });
        await mv3.click({ menuItemId: item });
        assert.deepEqual(plain(mv3.calls), plain(mv2.calls), item);
    }
});
