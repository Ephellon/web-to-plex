/*** /tests/background-services.test.mjs
 * Fetch parity for the MV3 service worker (Phase 3b): for every service message, the same request object goes to
 * the MV2 background page (tests/fixtures/mv2/background.js, in a `vm` context) and to the MV3 router (src/background/router.js).
 * Each must make the same requests (URL, method, headers, body, mode) and send the same replies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { LoadMV2, LoadMV3 } from './background-harness.mjs';

const OPTIONS = { plexToken: 'T', servers: [{ id: 'abc', token: 'T', connections: [{ uri: 'https://a.plex.direct:32400' }] }], DeveloperMode: false };
const AUTH = { username: 'user', password: 'pass' };

// Objects made inside the vm context have that realm's prototypes; compare plain JSON
const plain = value => JSON.parse(JSON.stringify(value));

// Plex search reply with one matching movie
const PLEX_HIT = { MediaContainer: { Hub: [{ type: 'movie', Metadata: [{ title: "Heat", year: 1995, key: '/library/metadata/42/children', guid: 'imdb://tt0113277', Genre: [{}] }] }] } };

/**
 * Builds a responder from `[pattern, body]` pairs; the first pattern the URL matches answers. `null` body throws.
 * @param {Array} pairs - `[RegExp, body]` pairs
 * @returns {function} The responder
 */
const responder = pairs => url => {
    for(const [pattern, body] of pairs)
        if(pattern.test(url)) {
            if(body === null)
                throw new TypeError("NetworkError when attempting to fetch resource.");

            if(body?.status404)
                return { status: 404, body: '' };

            return { body };
        }

    throw new TypeError(`unexpected request ${ url }`);
};

// Each case: [name, request, response pairs]
const CASES = [
    ['SEARCH_PLEX hit, first connection down', {
        type: 'SEARCH_PLEX',
        options: { title: "Heat", year: 1995, type: 'movie', IMDbID: 'tt0113277' },
        serverConfig: { token: 'T', connections: [{ uri: 'https://down.plex.direct:32400' }, { uri: 'http://10.0.0.2:32400' }] },
    }, [[/down\.plex/, null], [/10\.0\.0\.2/, PLEX_HIT]]],
    ['SEARCH_PLEX miss', {
        type: 'SEARCH_PLEX',
        options: { title: "Nope", year: 2000, type: 'show' },
        serverConfig: { token: 'T', connections: [{ uri: 'http://10.0.0.2:32400' }] },
    }, [[/10\.0\.0\.2/, PLEX_HIT]]],
    ['SEARCH_PLEX all connections down', {
        type: 'SEARCH_PLEX',
        options: { title: "Heat", year: 1995 },
        serverConfig: { token: 'T', connections: [{ uri: 'http://10.0.0.2:32400' }] },
    }, [[/10\.0\.0\.2/, null]]],
    ['QUERY_COUCHPOTATO (http, Basic auth)', { type: 'QUERY_COUCHPOTATO', url: 'http://cp.invalid/api/k/media.get', imdbId: 'tt0113277', tmdbId: 949, basicAuth: AUTH },
        [[/media\.get/, { success: true, media: { status: 'active' } }]]],
    ['PUSH_COUCHPOTATO', { type: 'PUSH_COUCHPOTATO', url: 'https://cp.invalid/api/k/movie.add', imdbId: 'tt0113277', tmdbId: 949, basicAuth: AUTH },
        [[/movie\.add/, { success: true }]]],
    ['PUSH_COUCHPOTATO non-JSON reply', { type: 'PUSH_COUCHPOTATO', url: 'https://cp.invalid/api/k/movie.add', imdbId: 'tt0113277' },
        [[/movie\.add/, '<html>']]],
    ['CHARGE_COUCHPOTATO', { type: 'CHARGE_COUCHPOTATO', url: 'http://cp.invalid/api/k/media.list?type=movie&status=active', basicAuth: AUTH },
        [[/media\.list/, { movies: [{ info: { imdb: 'tt1', tmdb_id: 1 } }] }]]],
    ['PUSH_WATCHER by IMDb', { type: 'PUSH_WATCHER', url: 'http://w.invalid/api/', token: 'k', StoragePath: '/movies', basicAuth: AUTH, title: "Heat", year: 1995, imdbId: 'tt0113277', tmdbId: 949 },
        [[/mode=addmovie/, { response: true }]]],
    ['PUSH_WATCHER by title, refused', { type: 'PUSH_WATCHER', url: 'http://w.invalid/api/', token: 'k', title: "Heat", year: 1995, imdbId: 'tt', tmdbId: '' },
        [[/mode=addmovie/, { response: false, error: 'already added' }]]],
    ['PUSH_RADARR', { type: 'PUSH_RADARR', url: 'http://r.invalid/api/movie/', token: 'k', StoragePath: 'D:\\Movies\\', QualityID: 4, basicAuth: AUTH, title: "Heat", year: 1995, imdbId: 'tt0113277', tmdbId: 949 },
        [[/\/api\/v3\//, { status404: true }], [/lookup\/imdb/, [{ title: "Heat", tmdbId: 949 }]], [/\?apikey=/, { path: 'D:\\Movies\\Heat (1995)' }]]],
    ['PUSH_RADARR empty lookup', { type: 'PUSH_RADARR', url: 'http://r.invalid/api/movie/', token: 'k', StoragePath: '/m/', title: "Heat", year: 1995, imdbId: '', tmdbId: 949 },
        [[/\/api\/v3\//, { status404: true }], [/lookup\/tmdb/, []]]],
    ['PUSH_RADARR server error', { type: 'PUSH_RADARR', url: 'http://r.invalid/api/movie/', token: 'k', StoragePath: '/m/', title: "Heat", year: 1995, imdbId: 'tt0113277' },
        [[/\/api\/v3\//, { status404: true }], [/lookup/, { title: "Heat" }], [/\?apikey=/, [{ errorMessage: 'This movie has already been added' }]]]],
    ['PUSH_SONARR', { type: 'PUSH_SONARR', url: 'http://s.invalid/api/series/', token: 'k', StoragePath: '/tv/', QualityID: 1, basicAuth: AUTH, title: "Lost", year: 2004, tvdbId: 73739 },
        [[/\/api\/v3\//, { status404: true }], [/lookup\?/, [{ title: "Lost", tvdbId: 73739 }]], [/\?apikey=/, '']]],
    ['PUSH_SONARR lookup fails', { type: 'PUSH_SONARR', url: 'http://s.invalid/api/series/', token: 'k', StoragePath: '/tv/', title: "Lost", year: 2004, tvdbId: 73739 },
        [[/\/api\/v3\//, { status404: true }], [/lookup\?/, null]]],
    ['PUSH_MEDUSA', { type: 'PUSH_MEDUSA', url: 'http://m.invalid/api/v2/series', root: 'http://m.invalid/api/v2/', token: 'k', StoragePath: 'D:\\TV', basicAuth: AUTH, title: "Lost Girl", year: 2010, tvdbId: 182181 },
        [[/searchIndexers/, { results: [['tvdb', 'Lost Girl', 182181]] }], [/api\/v2\/series$/, { id: { tvdb: 182181 } }]]],
    ['PUSH_SICKBEARD', { type: 'PUSH_SICKBEARD', url: 'http://sb.invalid/api/k/', token: 'k', StoragePath: 'D:\\TV', QualityID: 'hd', title: "Lost", year: 2004, tvdbId: 73739, exists: false },
        [[/sb\.searchtvdb/, { result: 'success', data: { results: [{}] } }], [/sb\.addrootdir/, {}], [/show\.addnew/, '']]],
    ['PUSH_OMBI movie', { type: 'PUSH_OMBI', url: 'http://o.invalid/api/v1/Request/movie?apikey=k', token: 'k', title: "Heat", year: 1995, imdbId: 'tt0113277', tmdbId: 949, contentType: 'movie' },
        [[/Request\/movie/, { isError: true, errorMessage: 'This has already been requested' }]]],
    ['PUSH_OMBI tv without TVDb ID', { type: 'PUSH_OMBI', url: 'http://o.invalid/api/v1/Request/tv?apikey=k', token: 'k', title: "Lost", contentType: 'tv', tvdbId: 0 },
        []],
    ['PUSH_OMBI network error', { type: 'PUSH_OMBI', url: 'http://o.invalid/api/v1/Request/tv?apikey=k', token: 'k', title: "Lost", contentType: 'tv', tvdbId: 73739 },
        [[/Request\/tv/, null]]],
];

for(const [name, request, pairs] of CASES)
    test(`${ name }: same requests and replies as MV2`, async() => {
        const mv2 = await LoadMV2(OPTIONS, responder(pairs))
            , mv3 = await LoadMV3(OPTIONS, responder(pairs));

        const before2 = mv2.requests.length
            , before3 = mv3.requests.length;

        const a = await mv2.send(request)
            , b = await mv3.send(request);

        // Radarr and Sonarr try /api/v3 first (v3+ servers); on these v2-style servers that answers 404 and MV3 falls back
        const mv3Requests = mv3.requests.slice(before3).filter(({ url }) => !/\/api\/v3\//.test(url))
            // CouchPotato no longer sends MV2's `mode: cors(url)` (B36; see the test below)
            , modeless = list => (/COUCHPOTATO/.test(name) ? list.map(({ mode, ...rest }) => rest) : list);

        assert.deepEqual(plain(modeless(mv3Requests)), plain(modeless(mv2.requests.slice(before2))), 'requests');
        assert.deepEqual(plain(b.replies), plain(a.replies), 'replies');
        assert.equal(b.replies.length, 1, 'exactly one reply');
        assert.equal(b.returned, true, 'async reply keeps the channel open');
    });

// B36: a browser answers a `no-cors` request with an opaque, empty reply; CouchPotato over HTTP must still read JSON
for(const [name, request, reply, expected] of [
    ['QUERY_COUCHPOTATO', { type: 'QUERY_COUCHPOTATO', url: 'http://cp.invalid/api/k/media.get', imdbId: 'tt0113277', basicAuth: AUTH }, { success: true, media: { status: 'active' } }, { success: true, status: 'active' }],
    ['PUSH_COUCHPOTATO', { type: 'PUSH_COUCHPOTATO', url: 'http://cp.invalid/api/k/movie.add', imdbId: 'tt0113277', token: 'k', basicAuth: AUTH }, { success: true }, { success: true }],
    ['CHARGE_COUCHPOTATO', { type: 'CHARGE_COUCHPOTATO', url: 'http://cp.invalid/api/k/media.list?type=movie', basicAuth: AUTH }, { movies: [] }, { movies: [] }],
])
    test(`${ name } over HTTP: no no-cors mode, the JSON reply and the Authorization header get through`, async() => {
        const mv3 = await LoadMV3(OPTIONS, (url, init) => (init.mode == 'no-cors' ? { status: 0, body: '' } : { body: reply }))
            , before = mv3.requests.length
            , { replies } = await mv3.send(request)
            , sent = mv3.requests.slice(before);

        assert.equal(sent.length, 1);
        assert.equal(sent[0].mode, null, 'no mode');
        assert.match(sent[0].headers.Authorization, /^Basic /);
        assert.deepEqual(plain(replies), [expected]);
    });

test('PUSH_RADARR on a v3+ server: lookup and add both use /api/v3', async() => {
    const mv3 = await LoadMV3(OPTIONS, responder([[/\/api\/v3\/movie\/lookup\/imdb/, [{ title: "Heat", tmdbId: 949 }]], [/\/api\/v3\/movie\/\?apikey=/, { path: '/movies/Heat (1995)' }]]))
        , before = mv3.requests.length
        , { replies } = await mv3.send({ type: 'PUSH_RADARR', url: 'http://r.invalid/api/movie/', token: 'k', StoragePath: '/movies/', QualityID: 4, title: "Heat", year: 1995, imdbId: 'tt0113277' });

    assert.deepEqual(mv3.requests.slice(before).map(({ url, method }) => [method, url]), [
        ['GET', 'http://r.invalid/api/v3/movie/lookup/imdb?imdbid=tt0113277&apikey=k'],
        ['POST', 'http://r.invalid/api/v3/movie/?apikey=k'],
    ]);
    assert.deepEqual(plain(replies), [{ success: 'Added to /movies/Heat (1995)' }]);
});

// Sonarr on /api/v3: v3 has language profiles (and requires one on add), v4 answers 404 for them
for(const [version, profiles, expected] of [['v3', [{ id: 2, name: "English" }, { id: 3, name: "Japanese" }], 2], ['v4', { status404: true }, void null]])
    test(`PUSH_SONARR on a ${ version } server: lookup, language profiles, add, all on /api/v3`, async() => {
        const mv3 = await LoadMV3(OPTIONS, responder([[/\/api\/v3\/series\/lookup\?/, [{ title: "Lost", tvdbId: 73739 }]], [/\/api\/v3\/languageprofile\?/, profiles], [/\/api\/v3\/series\/\?apikey=/, '']]))
            , before = mv3.requests.length;

        await mv3.send({ type: 'PUSH_SONARR', url: 'http://s.invalid/api/series/', token: 'k', StoragePath: '/tv/', QualityID: 1, title: "Lost", year: 2004, tvdbId: 73739 });

        const requests = mv3.requests.slice(before);

        assert.deepEqual(requests.map(({ url, method }) => [method, url]), [
            ['GET', 'http://s.invalid/api/v3/series/lookup?apikey=k&term=tvdb%3A73739'],
            ['GET', 'http://s.invalid/api/v3/languageprofile?apikey=k'],
            ['POST', 'http://s.invalid/api/v3/series/?apikey=k'],
        ]);
        assert.equal(JSON.parse(requests.at(-1).body).languageProfileId, expected);
    });

test('PUSH_SONARR on /api/v3 keeps a language profile the lookup already carries', async() => {
    const mv3 = await LoadMV3(OPTIONS, responder([[/\/api\/v3\/series\/lookup\?/, [{ title: "Lost", tvdbId: 73739, languageProfileId: 3 }]], [/\/api\/v3\/series\/\?apikey=/, '']]))
        , before = mv3.requests.length;

    await mv3.send({ type: 'PUSH_SONARR', url: 'http://s.invalid/api/series/', token: 'k', StoragePath: '/tv/', QualityID: 1, title: "Lost", year: 2004, tvdbId: 73739 });

    const requests = mv3.requests.slice(before);

    assert.ok(!requests.some(({ url }) => /languageprofile/.test(url)), 'no profile lookup');
    assert.equal(JSON.parse(requests.at(-1).body).languageProfileId, 3);
});
