/*** /tests/background-plugins.test.mjs
 * Plugin sites in the MV3 service worker (src/background/plugins.js): the table matches the plugin scripts, match
 * patterns come from each `url` glob's host, and SyncPlugins registers exactly the enabled plugins whose hosts are
 * granted (fake `chrome`).
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { PLUGINS, PLUGIN_CSS, MatchesFor, Registration, TouchesPlugins, SyncPlugins } = await import('../src/background/plugins.js');

/**
 * A fake `chrome` with stored options, granted origins and a content-script registry.
 * @param {object} options - Stored options
 * @param {string[]} granted - Granted origin patterns
 * @returns {object} `{ chrome, registry, calls }`
 */
function FakeChrome(options, granted) {
    const registry = new Map()
        , calls = [];

    const chrome = {
        runtime: { lastError: null },
        storage: { sync: { get: (keys, callback) => callback(structuredClone(options)) } },
        permissions: { contains: async({ origins }) => origins.every(origin => granted.includes(origin)) },
        scripting: {
            getRegisteredContentScripts: async() => [...registry.values()],
            unregisterContentScripts: async({ ids }) => (calls.push(['unregister', ids]), ids.forEach(id => registry.delete(id))),
            registerContentScripts: async scripts => {
                calls.push(['register', scripts.map(script => script.id)]);

                for(const script of scripts) {
                    assert.ok(!registry.has(script.id), `duplicate id ${ script.id }`);
                    registry.set(script.id, script);
                }
            },
        },
    };

    return { chrome, registry, calls };
}

test('the plugin table matches every plugin script (file, url glob) and has a boot stub per plugin', () => {
    const files = fs.readdirSync('src/cloud/plugin').filter(file => file != 'shanaproject.js');

    assert.deepEqual(PLUGINS.map(plugin => plugin.file.replace('cloud/plugin/', '')).sort(), files.sort());

    for(const plugin of PLUGINS) {
        const source = fs.readFileSync(`src/${ plugin.file }`, 'utf8')
            // `"url": "…"` (legacy) or `url: '…'` (house style)
            , url = /^\s*"?url"?:\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/m.exec(source)[2].replace(/\\\\/g, '\\');

        assert.equal(plugin.url, url, plugin.file);

        const stub = fs.readFileSync(`src/sites/plugin-boot/${ plugin.name }.js`, 'utf8');

        assert.match(stub, RegExp(`RunSite\\(plugin, \\{ alias: '${ plugin.name }', type: 'plugin' \\}\\)`));
    }
});

test('match patterns come from the url glob host; inner wildcards need listed hosts', () => {
    assert.deepEqual(MatchesFor({ url: '*://*.kitsu.io/anime/*' }), ['*://*.kitsu.io/*']);
    assert.deepEqual(MatchesFor({ url: '*://freeform.go.com/(movies|shows)/*' }), ['*://freeform.go.com/*']);
    assert.deepEqual(MatchesFor({ url: '*://*.myanimelist.net/anime/\\d+/*' }), ['*://*.myanimelist.net/*']);
    assert.deepEqual(MatchesFor({ url: '*://*.indomovietv.*/(?!tag|$)' }), []);
    assert.deepEqual(MatchesFor(PLUGINS.find(plugin => plugin.name == 'indomovie')), ['*://*.indomovietv.club/*', '*://*.indomovietv.org/*', '*://*.indomovietv.net/*']);

    for(const plugin of PLUGINS)
        assert.ok(MatchesFor(plugin).length, plugin.name);
});

test('a registration loads the runtime, the plugin, then its boot stub, with the button style sheets', () => {
    assert.deepEqual(Registration(PLUGINS.find(plugin => plugin.name == 'kitsu')), {
        id: 'plugin-kitsu',
        matches: ['*://*.kitsu.io/*'],
        js: ['utils.js', 'helpers.js', 'site-runner.js', 'cloud/plugin/kitsu.js', 'sites/plugin-boot/kitsu.js'],
        css: PLUGIN_CSS,
        runAt: 'document_idle',
    });
});

test('SyncPlugins registers enabled plugins with granted hosts only, and follows changes', async() => {
    const options = { plugin_kitsu: true, plugin_myanimelist: true, plugin_toloka: false, plugin_redbox: true, builtin_imdb: true }
        , granted = ['*://*.kitsu.io/*', '*://*.myanimelist.net/*', '*://*.toloka.to/*'];

    const { chrome, registry, calls } = FakeChrome(options, granted);

    globalThis.chrome = chrome;

    // kitsu and myanimelist: on and granted. toloka: granted but off. redbox: on but not granted
    assert.deepEqual(await SyncPlugins(), ['plugin-kitsu', 'plugin-myanimelist']);
    assert.deepEqual([...registry.keys()], ['plugin-kitsu', 'plugin-myanimelist']);

    // The user turns kitsu off and grants redbox: the registry follows, with no duplicate ids
    options.plugin_kitsu = false;
    granted.push('*://*.redbox.com/*');
    assert.deepEqual(await SyncPlugins(), ['plugin-myanimelist', 'plugin-redbox']);
    assert.deepEqual([...registry.keys()].sort(), ['plugin-myanimelist', 'plugin-redbox']);

    // Overlapping syncs (several events at once) run one after another
    await Promise.all([SyncPlugins(), SyncPlugins(), SyncPlugins()]);
    assert.deepEqual([...registry.keys()].sort(), ['plugin-myanimelist', 'plugin-redbox']);

    // Everything off: nothing registered, nothing left over
    for(const key of Object.keys(options))
        options[key] = false;
    assert.deepEqual(await SyncPlugins(), []);
    assert.equal(registry.size, 0);
    assert.deepEqual(calls.at(-1), ['unregister', ['plugin-myanimelist', 'plugin-redbox']]);
});

test('only plugin switches trigger a sync from storage changes', () => {
    assert.ok(TouchesPlugins({ plugin_kitsu: { newValue: true } }));
    assert.ok(!TouchesPlugins({ builtin_imdb: { newValue: true }, __theme: {} }));
});
