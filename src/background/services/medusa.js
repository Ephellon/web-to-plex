/*** /src/background/services/medusa.js
 * Medusa (TV): search and add a series.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 */

import { REPLIED, RequestHeaders, Terminal } from '../common.js';

/** Medusa - TV Shows **/
export function Push_Medusa(request, sendResponse) {
    const headers = {
            'Content-Type': 'application/json',
            'X-Api-Key': request.token,
            ...(RequestHeaders(request.basicAuth))
        }
        , id = request.tvdbId
        , query = request.title.replace(/\s+/g, '+')
        , debug = { headers, query, request };
   	// setup stack trace for debugging

    fetch(debug.url = `${ request.root }internal/searchIndexersForShowName?api_key=${ request.token }&indexerId=0&query=${ query }`)
        .then(response => response.json())
        .catch(error => {
            sendResponse({ error: 'TV Show not found', location: '@0B: Push_Medusa => fetch.then.catch', silent: true });
            throw REPLIED;
        })
        .then(data => {
            data = data.results;

            if(!(data instanceof Array) || !data.length)
                throw new Error("TV Show not found");

         			// Monitor, search, and download series ASAP
         			// The add call only needs the TVDb ID (the search result itself was never sent)
            const body = { id: { tvdb: id } };

            Terminal().group('Generated URL');
            Terminal().log('URL', request.url);
            Terminal().log('Head', headers);
            Terminal().log('Body', body);
            Terminal().groupEnd();

            return debug.body = body;
        })
        .then(body => {
            return fetch(`${ request.url }`, debug.requestHeaders = {
                method: 'POST',
            				// mode: cors(request.url),
                body: JSON.stringify(body),
                headers
            });
        })
        .then(response => response.text())
        .then(data => {
            const path = request.StoragePath.replace(/\\?$/, '\\');

            debug.data =
                data = JSON.parse(data || `{"path":"${ path }${ request.title } (${ request.year })"}`);

            if(data && data.error) {
                sendResponse({
                    error: data.error,
                    location: `@0B: Push_Medusa => fetch("${ request.url }", { headers }).then(data => { if })`,
                    debug
                })
            } else if(data && data.id) {
                sendResponse({
                    success: `Added to ${ path }${ request.title }(${ request.year })`
                })
            } else {
                sendResponse({
                    error: 'Unknown error',
                    location: `@0B: Push_Medusa => fetch("${ request.url }", { headers }).then(data => { else })`,
                    debug
                })
            }
        })
        .catch(error => {
            if(error === REPLIED)
                return;

            sendResponse({
                error: String(error),
                location: `@0B: Push_Medusa => fetch("${ request.url }", { headers }).catch(error => { sendResponse })`,
                debug
            });
        });
}
