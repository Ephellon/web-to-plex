/*** /src/background/services/relay.js
 * Fetch relay for content scripts. A content script's own fetch runs with the page's origin, so the page's CORS rules,
 * CSP and the browser's private-network rules (a page reaching http://localhost) block calls to the user's servers.
 * The service worker fetches instead, with the host permissions the user granted in the options page; without them
 * Chrome still applies CORS, so the relay can do nothing a granted origin or an open API would not allow.
 */

/**
 * Fetches the first URL that answers with a 2xx status (later URLs are fallbacks, e.g. a legacy API path).
 * @param {{ urls: string[], method?: string, headers?: object, body?: string }} request - The message
 * @param {function} reply - Replies once: `{ ok, status, url, text }`, or `{ error }` when nothing could be fetched
 * @returns {Promise<void>}
 */
export async function Service_Fetch(request, reply) {
    const urls = [].concat(request.urls ?? []).filter(url => /^https?:\/\//i.test(url))
        , init = { method: request.method ?? 'GET', headers: request.headers ?? {}, body: request.body, credentials: 'omit' };

    let last = { error: 'No http(s) URL to fetch' };

    for(const url of urls) {
        try {
            const response = await fetch(url, init)
                , text = await response.text();

            last = { ok: response.ok, status: response.status, url, text };

            if(response.ok)
                break;
        } catch(error) {
            last = { error: String(error), url };
        }
    }

    reply(last);
}
