/*** /tests/background-defaults.test.mjs
 * D1: first-run defaults in the service worker (src/background/defaults.js). The keys and values must be the options
 * page's own, and a saved value must never be overwritten.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { BUILTINS, DOMAINS, DEFAULT_OPTIONS, RENAMED_KEYS, MissingDefaults, RenamedOptions, SeedDefaults } = await import('../src/background/defaults.js');

const PAGE = fs.readFileSync('src/options/index.js', 'utf8').replace(/\r\n/g, '\n')
    , HTML = fs.readFileSync('src/options/index.html', 'utf8');

// The `__options__` list (commented-out entries do not count)
const OPTION_KEYS = (() => {
    const start = PAGE.indexOf('__options__'), end = PAGE.indexOf('];', start);

    return [...PAGE.slice(start, end).matchAll(/^\s*'([^']+)',/gm)].map(match => match[1]);
})();

/**
 * Evaluates one top-level object literal of the options page (`let NAME = { … }, …`).
 * @param {string} name - `builtins` or `plugins`
 * @returns {object} The object
 */
function PageObject(name) {
    const start = PAGE.indexOf(`let ${ name } = {`) + `let ${ name } = `.length
        , end = PAGE.indexOf('\n}', start) + 2;

    return new Function(`return (${ PAGE.slice(start, end) })`)();
}

test('every default is an option of the page, or a value the page itself saves (options.KEY = …)', () => {
    for(const key of Object.keys(MissingDefaults({})))
        assert.ok(OPTION_KEYS.includes(key) || PAGE.includes(`options.${ key } =`), key);
});

test('built-in switches: the page list, all on', () => {
    assert.deepEqual(BUILTINS.map(name => `builtin_${ name }`), OPTION_KEYS.filter(key => /^builtin_/.test(key)));

    for(const name of BUILTINS)
        assert.equal(DEFAULT_OPTIONS[`builtin_${ name }`], true, name);
});

test('__domains is what the options page saves: its built-in then plugin sites, by the page TLDHost', () => {
    const TLDHost = host => host.replace(/^(ww\w+|\w{2})\./, '')
        , sorted = object => Object.keys(object).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
        , hosts = object => sorted(object).flatMap(title => [].concat(object[title]).map(url => TLDHost(new URL(url).host)));

    assert.match(PAGE, /function TLDHost\(host\) \{\n\treturn host\.replace\(\/\^\(ww\\w\+\|\\w\{2\}\)\\\.\/, ''\);/);
    assert.deepEqual(DOMAINS, [...new Set([...hosts(PageObject('builtins')), ...hosts(PageObject('plugins'))])]);
});

test('other defaults match the page controls (checked boxes, range defaults)', () => {
    for(const [key, value] of Object.entries(DEFAULT_OPTIONS)) {
        if(/^(builtin_|__)/.test(key))
            continue;

        const control = new RegExp(`<input[^>]*data-option="${ key }"[^>]*>`).exec(HTML)?.[0];

        assert.ok(control, key);
        if(value === true)
            assert.match(control, /\bchecked\b/, key);
        else
            assert.match(control, new RegExp(`default="${ value }"`), key);
    }

    assert.deepEqual(JSON.parse(DEFAULT_OPTIONS.__caught), { imdb: [], tmdb: [], tvdb: [] });
    assert.deepEqual(JSON.parse(DEFAULT_OPTIONS.__theme), {});
});

test('only missing keys are filled; saved values, and a saved Plex token, are kept', () => {
    const fresh = MissingDefaults({});

    assert.equal(fresh.IGNORE_PLEX, true);
    assert.equal(Object.keys(fresh).length, Object.keys(DEFAULT_OPTIONS).length + 1);

    const saved = { builtin_imdb: false, DeveloperMode: false, __theme: '{"button-location":"top"}', plexToken: 'T', UseLooseScore: '65' }
        , missing = MissingDefaults(saved);

    for(const key of Object.keys(saved))
        assert.ok(!(key in missing), key);
    assert.ok(!('IGNORE_PLEX' in missing), 'never Plex-less with a token');
    assert.equal(missing.builtin_tmdb, true);

    assert.ok(!('IGNORE_PLEX' in MissingDefaults({ IGNORE_PLEX: false })));
});

test('SeedDefaults writes on install and update only, and never overwrites', async() => {
    const store = { builtin_imdb: false }
        , writes = [];

    globalThis.chrome = {
        runtime: { lastError: null },
        storage: {
            sync: {
                get: (keys, callback) => callback(structuredClone(store)),
                set: async items => (writes.push(Object.keys(items)), Object.assign(store, items)),
            },
        },
    };

    assert.deepEqual(await SeedDefaults({ reason: 'chrome_update' }), {});
    assert.equal(writes.length, 0);

    const written = await SeedDefaults({ reason: 'install' });

    assert.equal(store.builtin_imdb, false, 'saved value kept');
    assert.equal(store.builtin_tmdb, true);
    assert.equal(store.__caught, '{"imdb":[],"tmdb":[],"tvdb":[]}');
    assert.ok(!('builtin_imdb' in written));

    // A later update finds nothing missing
    assert.deepEqual(await SeedDefaults({ reason: 'update' }), {});
    assert.equal(writes.length, 1);
});

// T2: the site runner checks `builtin_<alias>` / `plugin_<alias>` (lib/site-runner.js); each must be the page's own key
test('every RunSite alias in src/sites has its options key (builtin_* in the defaults, plugin_* on the page)', () => {
    const stubs = []
        , walk = folder => fs.readdirSync(folder, { withFileTypes: true }).forEach(entry => (entry.isDirectory() ? walk(`${ folder }/${ entry.name }`) : /\.js$/.test(entry.name) && stubs.push(`${ folder }/${ entry.name }`)));

    walk('src/sites');

    const calls = stubs.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/RunSite\(\w+, \{ alias: '([^']+)', type: '(script|plugin)' \}\)/g)].map(([, alias, type]) => ({ file, alias, type })));

    assert.ok(calls.length >= 40, `${ calls.length } RunSite calls`);

    for(const { file, alias, type } of calls) {
        const key = `${ type == 'plugin' ? 'plugin' : 'builtin' }_${ alias }`;

        assert.ok(OPTION_KEYS.includes(key), `${ file }: ${ key } is not an options key`);
        if(type == 'script')
            assert.equal(DEFAULT_OPTIONS[key], true, `${ file }: ${ key } has no default`);
    }
});

test('options saved under an old site name move to the current key; a value under the new key wins', () => {
    assert.deepEqual(RenamedOptions({ 'builtin_google.play': false }), { set: { builtin_googleplay: false }, remove: ['builtin_google.play'] });
    assert.deepEqual(RenamedOptions({ plugin_indomovietv: true, plugin_indomovie: false }), { set: {}, remove: ['plugin_indomovietv'] });
    assert.deepEqual(RenamedOptions({ builtin_imdb: true }), { set: {}, remove: [] });

    for(const key of Object.values(RENAMED_KEYS))
        assert.ok(OPTION_KEYS.includes(key), key);
});

test('SeedDefaults on update carries a renamed switch over (an off switch stays off), then drops the old key', async() => {
    const store = { 'builtin_google.play': false, builtin_imdb: true }
        , removed = [];

    globalThis.chrome = {
        runtime: { lastError: null },
        storage: {
            sync: {
                get: (keys, callback) => callback(structuredClone(store)),
                set: async items => Object.assign(store, items),
                remove: async keys => (removed.push(...keys), keys.forEach(key => delete store[key])),
            },
        },
    };

    await SeedDefaults({ reason: 'update' });
    assert.equal(store.builtin_googleplay, false, 'the off switch is kept, not reset to the default');
    assert.ok(!('builtin_google.play' in store));
    assert.deepEqual(removed, ['builtin_google.play']);
});
