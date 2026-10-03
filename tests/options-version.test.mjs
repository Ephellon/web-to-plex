/*** /tests/options-version.test.mjs
 * S23: options/index.js `SetVersionInfo` asked GitHub for the releases every time the options page opened. It now keeps
 * the tag in chrome.storage.local and asks again only after 24 hours; a failed request keeps the last known tag and
 * shows no ERROR. The function runs with its page helpers stubbed; `fetch` is intercepted, so nothing leaves the test.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const SOURCE = fs.readFileSync('src/options/index.js', 'utf8').replace(/\r\n/g, '\n');
const DAY = 86_400_000;

/**
 * Builds `SetVersionInfo` against a fake page, storage and network.
 * @param {object} [setup] - `DM` (Developer Mode), `stored` (chrome.storage.local) and `reply(url)` for fetch
 * @returns {object} `run`, plus the `requests`, `stored`, `warnings` and `#version` element to inspect
 */
function page({ DM = false, stored = {}, reply = () => ({ status: 200, body: { tag_name: 'v4.2.0' } }) } = {}) {
    const start = SOURCE.indexOf("Recall['@0sec'].SetVersionInfo = ")
        , end = SOURCE.indexOf('\n};\n', start)
        , requests = []
        , warnings = []
        , attributes = {}
        , version = { href: 'https://github.com/webtoplex/browser-extension/releases', innerHTML: '...', setAttribute: (name, value) => (attributes[name] = value), attributes }
        , stubs = {
            Recall: { '@0sec': {} },
            getOptionValues: () => ({ DeveloperMode: DM }),
            $: () => version,
            manifest: { version: '4.2.0' },
            compareVer: (remote, local) => Math.sign(remote.localeCompare(local, 'en', { numeric: true })),
            chrome: { storage: { local: {
                get: async key => (key in stored ? { [key]: structuredClone(stored[key]) } : {}),
                set: async items => Object.assign(stored, structuredClone(items)),
            } } },
            fetch: async url => {
                const { status, body } = reply(url);

                requests.push(url);

                return { ok: status < 300, status, json: async() => body };
            },
            console: { warn: (...message) => warnings.push(message.join(' ')) },
        };

    new Function(...Object.keys(stubs), SOURCE.slice(start, end + 3))(...Object.values(stubs));

    return { run: stubs.Recall['@0sec'].SetVersionInfo, requests, stored, warnings, version };
}

test('the first open asks GitHub once and keeps the tag', async() => {
    const { run, requests, stored, version } = page();

    await run();

    assert.deepEqual(requests, ['https://api.github.com/repos/webtoplex/browser-extension/releases/latest']);
    assert.equal(stored.GitHubRelease.release.tag_name, 'v4.2.0');
    assert.ok(Date.now() - stored.GitHubRelease.time < 1000);
    assert.equal(version.innerHTML, 'v4.2.0');
    assert.equal(version.attributes.status, 'same');
});

test('within 24 hours the kept tag is used and GitHub is not asked', async() => {
    const { run, requests, version } = page({ stored: { GitHubRelease: { time: Date.now() - DAY + 60_000, release: { tag_name: 'v4.3.0' } } } });

    await run();

    assert.deepEqual(requests, []);
    assert.equal(version.attributes.status, 'low');
});

test('after 24 hours GitHub is asked again', async() => {
    const { run, requests, stored } = page({ stored: { GitHubRelease: { time: Date.now() - DAY - 1, release: { tag_name: 'v4.1.0' } } } });

    await run();

    assert.equal(requests.length, 1);
    assert.equal(stored.GitHubRelease.release.tag_name, 'v4.2.0');
});

test('a failed request (rate limit, no network) keeps the last known status, without ERROR or a throw', async() => {
    for(const reply of [() => ({ status: 403, body: { message: 'API rate limit exceeded' } }), () => ({ status: 200, body: { message: 'Not Found' } }), () => { throw new TypeError('Failed to fetch'); }]) {
        const { run, stored, warnings, version } = page({ reply, stored: { GitHubRelease: { time: Date.now() - DAY - 1, release: { tag_name: 'v4.1.0' } } } });

        await run();

        assert.equal(version.attributes.status, 'high');
        assert.notEqual(version.innerHTML, 'ERROR');
        assert.equal(stored.GitHubRelease.release.tag_name, 'v4.1.0');
        assert.equal(warnings.length, 1);
    }

    const { run, version } = page({ reply: () => ({ status: 403, body: {} }) });

    await run();

    assert.equal(version.innerHTML, '...');
    assert.equal(version.attributes.status, void null);
});

test('Developer Mode reads all releases (the newest, pre-releases included) under its own key', async() => {
    const { run, requests, stored } = page({ DM: true, stored: { GitHubRelease: { time: Date.now(), release: { tag_name: 'v4.2.0' } } }, reply: () => ({ status: 200, body: [{ tag_name: 'v4.3.0-beta' }, { tag_name: 'v4.2.0' }] }) });

    await run();

    assert.deepEqual(requests, ['https://api.github.com/repos/webtoplex/browser-extension/releases']);
    assert.equal(stored.GitHubReleases.release.tag_name, 'v4.3.0-beta');
});
