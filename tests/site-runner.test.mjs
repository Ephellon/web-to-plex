/*** /tests/site-runner.test.mjs
 * Unit tests for src/lib/site-runner.js, the Phase 3 replacement of plugn.js `prepare` + `handle`.
 *
 * tests/fixtures/site-globs.json holds, for every `cloud/**` script, the RegExp source the MV2 `prepare` template
 * emitted for its `url` (generated once from plugn.js; see the w2p-p3-runner report).
 */

import fs from 'node:fs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { GlobToRegExp, ParseResultString, NormaliseItem, ClassifyResult, RandomName, RunSite } from '../src/lib/site-runner.js';

const GLOBS = JSON.parse(fs.readFileSync('tests/fixtures/site-globs.json', 'utf8'));

/**
 * Builds a test environment for RunSite: storage from `stored`, requests and warnings recorded.
 * @param {object} [overrides] - `stored`, `href` and any environment member to replace
 * @returns {object} The environment, with `requests`, `warnings` and `listeners` arrays
 */
function environment({ stored = {}, href = 'https://www.imdb.com/title/tt0111161/', ...overrides } = {}) {
    const env = {
        instance: 'testinstance',
        requests: [],
        warnings: [],
        listeners: [],
        href: () => href,
        get: async key => stored[key],
        getCache: async name => stored['~/cache/' + name] ?? null,
        populate: async request => env.requests.push(request),
        require: async(...args) => env.requests.push({ type: 'REQUIRE', args }),
        minionsWanted: async() => stored.UseMinions,
        listen: handler => env.listeners.push(handler),
        // Retries are recorded, not run, unless a test passes real (mocked) timers
        timers: [],
        setTimeout: (callback, delay) => env.timers.push(delay),
        clearTimeout: () => {},
        warn: (...messages) => env.warnings.push(messages.join(' ')),
        ...overrides,
    };

    return env;
}

test('glob → RegExp matches the MV2 prepare template for every cloud script', () => {
    assert.ok(GLOBS.length >= 40, `Only ${ GLOBS.length } golden globs`);

    for(const { file, url, source } of GLOBS)
        assert.equal(GlobToRegExp(url).source, source, file);
});

test('glob → RegExp matches and rejects real URLs', () => {
    const cases = [
        ['*://*.imdb.com/(title|list)/(tt|ls)\\d+/(#*|?*)?$', 'https://www.imdb.com/title/tt0111161/', true],
        ['*://*.imdb.com/(title|list)/(tt|ls)\\d+/(#*|?*)?$', 'https://www.imdb.com/title/tt0111161/?ref_=nv', true],
        ['*://*.imdb.com/(title|list)/(tt|ls)\\d+/(#*|?*)?$', 'https://www.imdb.com/name/nm0000209/', false],
        ['*://*.themoviedb.org/(movie|tv)/\\d+([\\w\\-]+)?$', 'https://www.themoviedb.org/movie/278-the-shawshank-redemption', true],
        ['*://*.themoviedb.org/(movie|tv)/\\d+([\\w\\-]+)?$', 'https://www.themoviedb.org/movie/278-the-shawshank-redemption/cast', false],
        ['*://*.letterboxd.com/(?:\\w+/)?(film|list)/*', 'https://letterboxd.com/film/the-shawshank-redemption/', true],
        ['*://*.letterboxd.com/(?:\\w+/)?(film|list)/*', 'https://letterboxd.com/someone/list/favourites/', true],
        ['*://*.tvmaze.com/shows/*', 'https://www.tvmaze.com/shows/82/game-of-thrones', true],
        ['*://*.trakt.tv/(movie|show)s/*', 'https://trakt.tv/movies/the-shawshank-redemption-1994', true],
        ['*://*.trakt.tv/(movie|show)s/*', 'https://trakt.tv/users/someone', false],
        ['*://app.plex.tv/desktop/?#!/(server/(?:[a-f\\d]+)|provider/(?:tv.plex.provider.vod))/(details|list)\\?*', 'https://app.plex.tv/desktop/#!/server/0123abcd/details?key=%2Flibrary%2Fmetadata%2F1', true],
    ];

    for(const [url, href, expected] of cases)
        assert.equal(GlobToRegExp(url).test(href), expected, `${ url } vs ${ href }`);
});

test('result string Title (YYYY):type', () => {
    assert.deepEqual(ParseResultString('The Godfather (1972):movie'), { type: 'movie', title: "The Godfather", year: '1972' });
    assert.equal(ParseResultString('The Godfather'), null);
});

test('punctuation normalisation and numeric year', () => {
    const item = NormaliseItem({ type: 'movie', title: "“The” Director’s Cut — Part‚ II", year: '1999', IMDbID: 'tt1' });

    assert.deepEqual(item, { type: 'movie', title: "\"The\" Director's Cut - Part, II", year: 1999, IMDbID: 'tt1' });
});

test('result classification follows handle()', () => {
    assert.deepEqual(ClassifyResult(-1), { action: 'no-render', data: -1 });
    assert.deepEqual(ClassifyResult(2500), { action: 'retry', delay: 2500 });
    assert.deepEqual(ClassifyResult(0, 700), { action: 'retry', delay: 700 });
    assert.deepEqual(ClassifyResult(null, 700), { action: 'retry', delay: 700 });
    assert.equal(ClassifyResult('<api>').action, 'stop');
    assert.equal(ClassifyResult('no year here').action, 'stop');
    assert.deepEqual(ClassifyResult('Heat (1995):movie'), { action: 'populate', data: { type: 'movie', title: "Heat", year: 1995 } });

    // A list of two or more is posted unchanged; a list of one becomes that item, normalised
    const list = [{ type: 'movie', title: "A’s", year: '2000' }, null, { type: 'show', title: "B", year: 2001 }];

    assert.deepEqual(ClassifyResult(list), { action: 'populate', data: [list[0], list[2]] });
    assert.deepEqual(ClassifyResult([null, { type: 'movie', title: "A’s", year: '2000' }]), { action: 'populate', data: { type: 'movie', title: "A's", year: 2000 } });
    assert.equal(ClassifyResult([]).action, 'stop');
    assert.equal(ClassifyResult({ type: 'movie', year: 2000 }).action, 'stop');
    assert.equal(ClassifyResult(true).action, 'stop');
});

test('instance names start with a letter and pass the utils.js PERMISSION check', () => {
    for(let i = 0; i < 50; ++i) {
        const name = RandomName();

        assert.match(name, /^[a-z]/i);
        assert.match(name, /[\da-z]{64,}/i);
    }
});

test('RunSite posts the MV2 POPULATE request', async() => {
    const env = environment();
    const script = { url: '*://*.imdb.com/(title|list)/(tt|ls)\\d+/(#*|?*)?$', init: () => ({ type: 'movie', title: "The Shawshank Redemption", year: '1994', IMDbID: 'tt0111161' }) };
    const outcome = await RunSite(script, { alias: 'imdb', type: 'script' }, env);

    assert.equal(outcome.action, 'populate');
    assert.deepEqual(env.requests, [{
        data: { type: 'movie', title: "The Shawshank Redemption", year: 1994, IMDbID: 'tt0111161' },
        instance: 'testinstance',
        script: 'imdb',
        instance_type: 'SCRIPT',
        type: 'POPULATE',
    }]);

    assert.equal(env.listeners.length, 1);
});

test('consent false stops; consent missing runs', async() => {
    const script = { url: '*://*.imdb.com/*', init: () => 'Heat (1995):movie' };

    let env = environment({ stored: { builtin_imdb: false } });

    assert.equal((await RunSite(script, { alias: 'imdb' }, env)).action, 'stop');
    assert.equal(env.requests.length, 0);

    env = environment({ stored: { '~/cache/has/imdb': false } });
    assert.equal((await RunSite(script, { alias: 'imdb' }, env)).action, 'stop');

    env = environment({ stored: { plugin_kitsu: false }, href: 'https://kitsu.io/anime/x' });
    assert.equal((await RunSite({ ...script, url: '*://*.kitsu.io/anime/*' }, { alias: 'kitsu', type: 'plugin' }, env)).action, 'stop');

    env = environment();
    assert.equal((await RunSite(script, { alias: 'imdb' }, env)).action, 'populate');
});

test('URL mismatch and a missing init post NO_RENDER (the wrapper returned -1)', async() => {
    let env = environment({ href: 'https://www.imdb.com/name/nm0000209/' });
    const script = { url: '*://*.imdb.com/title/*', init: () => 'Heat (1995):movie' };

    await RunSite(script, { alias: 'imdb' }, env);
    assert.deepEqual(env.requests.map(({ type, data }) => [type, data]), [['NO_RENDER', -1]]);

    env = environment();
    await RunSite({ url: '*://*.imdb.com/*' }, { alias: 'imdb' }, env);
    assert.deepEqual(env.requests.map(({ type, data }) => [type, data]), [['NO_RENDER', -1]]);
});

test('ready() falsy retries after script.timeout, then populates', async() => {
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
        let ready = false, inits = 0;
        const env = environment({ setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer) });
        const script = { url: '*://*.imdb.com/*', timeout: 1500, ready: () => ready, init: state => (++inits, { type: 'movie', title: `T${ state }`, year: 2000 }) };
        const first = await RunSite(script, { alias: 'imdb' }, env);

        assert.deepEqual(first, { action: 'retry', delay: 1500 });
        assert.equal(inits, 0);

        ready = 'yes';
        mock.timers.tick(1499);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(env.requests.length, 0);

        mock.timers.tick(1);
        for(let i = 0; i < 5 && !env.requests.length; ++i)
            await new Promise(resolve => setImmediate(resolve));

        assert.equal(inits, 1);
        assert.equal(env.requests[0].type, 'POPULATE');
        assert.equal(env.requests[0].data.title, 'Tyes', 'init receives the ready state');
    } finally {
        mock.timers.reset();
    }
});

test('async ready() is awaited; minions run before init when UseMinions is on', async() => {
    const order = [];
    const env = environment({ stored: { UseMinions: true } });
    const script = {
        url: '*://*.imdb.com/*',
        ready: async() => false,
        init: () => 'Heat (1995):movie',
    };

    assert.equal((await RunSite(script, { alias: 'imdb' }, env)).action, 'retry', 'a resolved false is not ready');
    assert.deepEqual(env.timers, [1000]);

    const env2 = environment({ stored: { UseMinions: true } });
    const script2 = { url: '*://*.imdb.com/*', minions: () => order.push('minions'), init: () => (order.push('init'), 'Heat (1995):movie') };

    await RunSite(script2, { alias: 'imdb' }, env2);
    assert.deepEqual(order, ['minions', 'init']);
});

test('a positive number from init retries after that many ms; navigation re-runs', async() => {
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
        let result = 3000
            , href = 'https://www.imdb.com/title/tt0111161/';

        const env = { ...environment({ setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer) }), href: () => href };
        const script = { url: '*://*.imdb.com/*', init: () => result };

        assert.deepEqual(await RunSite(script, { alias: 'imdb' }, env), { action: 'retry', delay: 3000 });

        result = 'Heat (1995):movie';
        mock.timers.tick(3000);
        for(let i = 0; i < 5 && !env.requests.length; ++i)
            await new Promise(resolve => setImmediate(resolve));

        assert.equal(env.requests.length, 1);

        // Navigation (popstate / pushstate-changed / locationchange) to a new path runs the pipeline again
        href = 'https://www.imdb.com/title/tt0113277/';
        env.listeners[0]();
        mock.timers.tick(0);
        for(let i = 0; i < 5 && env.requests.length < 2; ++i)
            await new Promise(resolve => setImmediate(resolve));

        assert.equal(env.requests.length, 2);
    } finally {
        mock.timers.reset();
    }
});

test('navigation that keeps the path (query or hash change) does not re-run; a new path does', async() => {
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
        let href = 'https://app.trakt.tv/shows/breaking-bad';
        const env = { ...environment({ setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer) }), href: () => href };
        const script = { url: '*://*.trakt.tv/(movie|show)s/*', init: () => ({ type: 'show', title: "Breaking Bad", year: 2008 }) };
        const settle = async count => {
            mock.timers.tick(0);
            for(let i = 0; i < 5 && env.requests.length < count; ++i)
                await new Promise(resolve => setImmediate(resolve));
        };

        await RunSite(script, { alias: 'trakt-path' }, env);
        assert.equal(env.requests.length, 1);

        // Trakt's replaceState to ?season=1 fires pushstate-changed and the href poll: same page, no second run
        href = 'https://app.trakt.tv/shows/breaking-bad?season=1';
        env.listeners[0]();
        env.listeners[0]();
        href = 'https://app.trakt.tv/shows/breaking-bad?season=1#cast';
        env.listeners[0]();
        await settle(2);
        assert.equal(env.requests.length, 1);

        // A new title is a new page
        href = 'https://app.trakt.tv/shows/better-call-saul';
        env.listeners[0]();
        await settle(2);
        assert.equal(env.requests.length, 2);
    } finally {
        mock.timers.reset();
    }
});

test('script.requires calls the Require prompt with the MV2 arguments', async() => {
    const env = environment();

    await RunSite({ url: '*://*.imdb.com/*', requires: ['api'], init: () => 'Heat (1995):movie' }, { alias: 'webtoplex' }, env);
    assert.deepEqual(env.requests[0], { type: 'REQUIRE', args: ['cache,api', 'webtoplex', 'webtoplex', 'testinstance'] });
});

test('a throwing site script is caught and retried, not thrown into the page', async() => {
    const env = environment();
    const outcome = await RunSite({ url: '*://*.imdb.com/*', timeout: 2000, init: () => { throw new TypeError("title is undefined") } }, { alias: 'imdb' }, env);

    assert.deepEqual(outcome, { action: 'retry', delay: 2000 });
    assert.deepEqual(env.timers, [2000]);
    assert.match(env.warnings[0], /title is undefined/);
});

test('a repeated RunSite for the same site keeps one navigation listener and stops the old retry', async() => {
    const { RunSite } = await import('../src/lib/site-runner.js');
    const listeners = []
        , timers = new Map()
        , populated = [];

    let next = 0;

    const env = {
        instance: 'test',
        href: () => 'https://www.example.com/title/1',
        get: async() => void null,
        getCache: async() => null,
        populate: async request => populated.push(request.type),
        require: () => void null,
        minionsWanted: async() => false,
        listen: handler => listeners.push(handler),
        setTimeout: callback => (timers.set(++next, callback), next),
        clearTimeout: timer => timers.delete(timer),
        warn: () => void null,
    };

    // Not ready yet: each run schedules a retry
    const script = { url: '*://*.example.com/*', ready: () => false, init: () => ({ type: 'movie', title: "Heat", year: 1995 }) };

    await RunSite(script, { alias: 'example' }, env);
    await RunSite(script, { alias: 'example' }, env);

    assert.equal(listeners.length, 1);
    assert.equal(timers.size, 1);
});
