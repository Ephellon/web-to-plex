/*** /tests/background-harness.mjs
 * Runs the MV2 background page (tests/fixtures/mv2/background.js, kept as the parity reference) and the MV3 service-worker router (src/background/) side by side
 * against the same stub `chrome` and the same intercepted `fetch`, so tests can compare every request and reply.
 * Not a test file itself (no `.test.`); imported by tests/background-*.test.mjs.
 */

import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

export const EXTENSION_ID = 'w2p-test-extension';

/**
 * Makes a stub `chrome` that records every call the background code makes.
 * @param {object} options - The stored options returned by `storage.sync.get(null)`
 * @returns {object} `{ chrome, calls }` where `calls` is a list of `[api, …args]`
 */
export function StubChrome(options = {}) {
    const calls = []
        , session = {}
        , record = name => (...args) => (calls.push([name, ...args.filter(a => typeof a != 'function')]), args.at(-1)?.id);

    const listeners = { message: [], clicked: [], installed: [], changed: [] };

    const chrome = {
        runtime: {
            id: EXTENSION_ID,
            lastError: null,
            onMessage: { addListener: fn => listeners.message.push(fn) },
            onInstalled: { addListener: fn => listeners.installed.push(fn) },
            openOptionsPage: () => calls.push(['runtime.openOptionsPage']),
        },
        storage: {
            sync: { get: (keys, cb) => cb(structuredClone(options)) },
            local: { get: (keys, cb) => cb(structuredClone(options)) },
            session: {
                get: async key => (key in session ? { [key]: structuredClone(session[key]) } : {}),
                set: async items => Object.assign(session, structuredClone(items)),
            },
            onChanged: { addListener: fn => listeners.changed.push(fn) },
        },
        contextMenus: {
            create: props => (calls.push(['contextMenus.create', props]), props.id),
            update: record('contextMenus.update'),
            onClicked: { addListener: fn => listeners.clicked.push(fn) },
        },
        downloads: { download: (props, cb) => (calls.push(['downloads.download', props]), cb && cb(7)) },
        tabs: { create: props => calls.push(['tabs.create', props]) },
        browserAction: { setBadgeText: record('badge.text'), setBadgeBackgroundColor: record('badge.color') },
        action: { setBadgeText: record('badge.text'), setBadgeBackgroundColor: record('badge.color') },
    };

    return { chrome, calls, listeners };
}

/**
 * Makes an intercepting `fetch`. `respond(url, init)` returns `{ body, status? }` (a string or object; status 200 by
 * default), or throws to fail.
 * @param {function} respond - Decides each response
 * @param {function} [parse=JSON.parse] - Parses response JSON; the MV2 side passes the vm realm's, so `instanceof Array`
 *     works there as it does in a browser
 * @returns {{ fetch: function, requests: object[] }} The function and the recorded requests
 */
export function StubFetch(respond, parse = text => JSON.parse(text)) {
    const requests = [];

    const fetch = async(url, init = {}) => {
        const { method = 'GET', headers, body, mode } = init;

        requests.push({ url, method, headers: headers ?? null, body: body ?? null, mode: mode ?? null });

        const answer = await respond(url, init);
        const text = typeof answer.body == 'string' ? answer.body : JSON.stringify(answer.body);

        const status = answer.status ?? 200;

        return { ok: status >= 200 && status < 300, status, json: async() => parse(text), text: async() => text };
    };

    return { fetch, requests };
}

/**
 * Loads the MV2 background page in a fresh `vm` context.
 * @param {object} options - Stored options
 * @param {function} respond - The fetch responder
 * @returns {Promise<object>} `{ send, click, calls, requests }`
 */
export async function LoadMV2(options, respond) {
    const { chrome, calls, listeners } = StubChrome(options)
        , storage = () => ({ getItem: () => null, setItem() {} });

    let context = null;

    const { fetch, requests } = StubFetch(respond, text => vm.runInContext('JSON', context).parse(text));

    context = vm.createContext({
        chrome, fetch, console, btoa, setTimeout, clearTimeout,
        localStorage: storage(), sessionStorage: storage(),
        window: { crypto: webcrypto, open: url => calls.push(['tabs.create', { url }]) },
    });

    vm.runInContext(fs.readFileSync('tests/fixtures/mv2/background.js', 'utf8'), context, { filename: 'background.js' });
    await Settle();

    return {
        calls, requests,
        send: request => Exchange(listeners.message[0], request),
        click: item => listeners.clicked[0](item),
    };
}

/**
 * Loads the MV3 router (src/background/) with the same stubs. `chrome` and `fetch` are set on `globalThis`,
 * which is where the worker modules read them.
 * @param {object} options - Stored options
 * @param {function} respond - The fetch responder
 * @returns {Promise<object>} `{ send, click, install, calls, requests }`
 */
export async function LoadMV3(options, respond) {
    const { chrome, calls } = StubChrome(options)
        , { fetch, requests } = StubFetch(respond);

    globalThis.chrome = chrome;
    globalThis.fetch = fetch;

    const { Route } = await import('../src/background/router.js')
        , { CreateMenus, OnMenuClicked } = await import('../src/background/menus.js');

    return {
        calls, requests,
        send: (request, sender = { id: EXTENSION_ID }) => Exchange(Route, request, sender),
        click: item => OnMenuClicked(item),
        install: () => CreateMenus(),
    };
}

/**
 * Sends one message to a listener and collects what comes back.
 * @param {function} listener - A `runtime.onMessage` listener
 * @param {object} request - The message
 * @param {object} [sender] - The sender
 * @returns {Promise<{ returned: *, replies: object[] }>} The listener's return value and every reply
 */
export async function Exchange(listener, request, sender = { id: EXTENSION_ID }) {
    const replies = []
        , returned = listener(structuredClone(request), sender, response => replies.push(response));

    await Settle();

    return { returned, replies };
}

/**
 * Lets pending promise chains and timers run out.
 * @returns {Promise<void>}
 */
export async function Settle() {
    for(let i = 0; i < 20; ++i)
        await new Promise(resolve => setTimeout(resolve, 0));
}
