/*** /src/background/common.js
 * Helpers shared by the service-worker modules (Phase 3b). Moved from background.js; `Headers` is renamed
 * `RequestHeaders` so it no longer shadows the Fetch API's `Headers`.
 */

// Thrown after a step has already replied, so the rest of the chain stops without a second reply
export const REPLIED = Symbol('replied');

// Quiet stand-in for `console` when Developer Mode is off
const QUIET = { error: m => m, info: m => m, log: m => m, warn: m => m, group: m => m, groupEnd: m => m };

let terminal = QUIET;

/**
 * The console when Developer Mode is on, otherwise a silent stand-in (background.js `BACKGROUND_TERMINAL`).
 * @returns {object} An object with `error`, `info`, `log`, `warn`, `group` and `groupEnd`
 */
export function Terminal() {
    return terminal;
}

/**
 * Reads `DeveloperMode` from storage and switches the terminal to match.
 * @returns {Promise<boolean>} Whether Developer Mode is on
 */
export async function RefreshTerminal() {
    const { DeveloperMode } = await GetOptions();

    terminal = DeveloperMode ? console : QUIET;
    terminal.warn(`BACKGROUND_DEVELOPER: ${ DeveloperMode }`);

    return !!DeveloperMode;
}

/**
 * Reads every saved option, from `sync` when it is available and `local` otherwise.
 * @returns {Promise<object>} The stored options
 */
export function GetOptions() {
    return new Promise(resolve => {
        const area = chrome.storage.sync ?? chrome.storage.local;

        area.get(null, options => {
            if(chrome.runtime.lastError)
                chrome.storage.local.get(null, resolve);
            else
                resolve(options ?? {});
        });
    });
}

/**
 * Returns the CORS mode background.js used for a URL: `cors` for HTTPS (or ports 443/22), `no-cors` otherwise.
 * @param {string} url - The request URL
 * @returns {string} `cors` or `no-cors`
 */
export function cors(url) {
    return (/^(https|sftp)\b/i.test(url) || /:(443|22)\b/i.test(url) ? '' : 'no-') + 'cors';
}

/**
 * Builds request headers: `Accept: application/json`, plus Basic authorisation when credentials are given.
 * Same keys and order as background.js `new Headers(…)`.
 * @param {{ username: string, password: string }} [authorization] - Basic-auth credentials
 * @returns {object} Plain header object
 */
export function RequestHeaders(authorization) {
    const headers = { Accept: 'application/json' };

    if(!authorization)
        return headers;

    return {
        Authorization: `Basic ${ btoa(`${ authorization.username }:${ authorization.password }`) }`,
        ...headers,
    };
}

/**
 * Turns an object into URL parameters: `{ a: 1, b: 2 }` → `a=1&b=2` (values are not encoded, as before).
 * @param {object} data - The parameters
 * @returns {string} The query string, without `?`
 */
export function formify(data) {
    const body = [];

    for(const key in data)
        body.push(`${ key }=${ data[key] }`);

    return body.join('&');
}
