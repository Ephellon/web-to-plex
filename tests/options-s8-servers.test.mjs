/*** /tests/options-s8-servers.test.mjs
 * S8: options/index.js `performPlexTest` read `getServers(...).then((servers = []) => …)` and then tested `!servers`,
 * which an array never is: an account with no servers got the ✓ marker, `in-use=true` and an enabled Save. It now
 * checks the length. `getServers` and the page are stubs.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const SOURCE = fs.readFileSync('src/options/index.js', 'utf8').replace(/\r\n/g, '\n');
const MARKERS = Object.assign(['yes', 'no', 'maybe'], { yes: 'yes', no: 'no', maybe: 'maybe' });

/**
 * Runs `performPlexTest` against stubbed Plex replies.
 * @param {object[]|null|undefined} servers - What `getServers` resolves to
 * @returns {Promise<object>} The page state afterwards: marker, Save, in-use flags and server options
 */
async function run(servers) {
    const element = () => ({ innerHTML: '', value: '', title: '', classList: null, attributes: {}, children: [], setAttribute(name, value) {
        this.attributes[name] = value;
    }, appendChild(child) {
        this.children.push(child);
    } })
        , status = element()
        , plex = [element(), element()]
        , save = { ...element(), disabled: null }
        , list = element()
        , start = SOURCE.indexOf('\nfunction performPlexTest(')
        , end = SOURCE.indexOf('\n}\n', start)
        , reply = Promise.resolve(servers)
        , stubs = {
            $: (selector, all) => (all ? plex : selector == '#plex_token' ? { value: 'token' } : status),
            __save__: save,
            __servers__: list,
            MARKERS,
            LoadingAnimation() {},
            Notification: class {},
            getServers: () => reply,
            document: { createElement: () => element() },
            PlexServers: null,
        }
        , performPlexTest = new Function(...Object.keys(stubs), `return (${ SOURCE.slice(start + 1, end + 2) })`)(...Object.values(stubs));

    performPlexTest({});
    await reply;
    await new Promise(resolve => setTimeout(resolve));

    return { marker: status.innerHTML, saveDisabled: save.disabled, save: save.innerHTML, inUse: plex.map(e => e.attributes['in-use']), options: list.children.length };
}

test('no servers (an empty list, or none at all) is a failure: ✗, Save stays disabled, nothing in use', async() => {
    for(const servers of [[], null, void null]) {
        const state = await run(servers);

        assert.equal(state.marker, 'no', JSON.stringify(servers));
        assert.equal(state.saveDisabled, true);
        assert.equal(state.save, 'Save no');
        assert.deepEqual(state.inUse, [false, false]);
        assert.equal(state.options, 0);
    }
});

test('a server is a success: ✓, Save enabled, the server listed after "No Server"', async() => {
    const state = await run([{ sourceTitle: 'Owner', clientIdentifier: 'abc', name: 'Home' }]);

    assert.equal(state.marker, 'yes');
    assert.equal(state.saveDisabled, false);
    assert.deepEqual(state.inUse, [true, true]);
    assert.equal(state.options, 2);
});
