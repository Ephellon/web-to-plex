/*** /src/background/services/couchpotato.js
 * CouchPotato (movies): query, add, and list ("charge") the library.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 * No `mode: cors(url)` (B36): `no-cors` for an HTTP server gave an opaque reply (`.json()` rejects, no `Authorization`);
 * the worker reaches the server with the host permission the options page asks for, as for the other services.
 */

import { REPLIED, RequestHeaders } from '../common.js';

/** CouchPotato - Movies **/
// At this point you might want to think, WHY would you want to do
// these requests in a background page instead of the content script?
// This is because Movieo is served over HTTPS, so it won't accept requests to
// HTTP servers. Unfortunately, many people use CouchPotato over HTTP.
export function Query_CouchPotato(request, sendResponse) {
    fetch(`${ request.url }?id=${ request.imdbId }`, {
        headers: RequestHeaders(request.basicAuth),
    })
        .then(response => response.json())
        .then(json => {
            const { success } = json;

            sendResponse({ success, status: (success ? json.media.status : null) });
        })
        .catch(error => {
            sendResponse({ error: String(error), location: '@0B: Query_CouchPotato' });
        });
}
export function Push_CouchPotato(request, sendResponse) {
    const headers = {
            'Content-Type': 'application/json',
            'X-Api-Key': request.token,
            ...(RequestHeaders(request.basicAuth))
        }
        , query = `identifier=${ request.imdbId }`
        , debug = { headers, query, request };

    fetch(debug.url = `${ request.url }?${ query }`, {
        method: 'POST',
      		// body: JSON.stringify(body),
        headers,
    })
        .then(response => response.json())
        .catch(error => {
            sendResponse({ error: 'Movie not found', location: '@0B: Push_CouchPotato => fetch.then.catch', silent: true });
            throw REPLIED;
        })
        .then(response => {
            sendResponse({ success: response.success });
        })
        .catch(error => {
            if(error === REPLIED)
                return;

            sendResponse({
                error: String(error),
                location: '@0B: Push_CouchPotato => fetch("${ request.url }", { headers }).catch(error => { sendResponse })',
                debug
            });
        });
}
export function Charge_CouchPotato(request, sendResponse) {
    fetch(request.url, {
        headers: RequestHeaders(request.basicAuth),
    })
        .then(response => response.json())
        .then(json => sendResponse(json))
        .catch(error => sendResponse({ error: String(error), location: '@0B: Charge_CouchPotato' }));
}
