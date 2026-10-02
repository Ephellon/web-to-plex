/*** /src/background/services/sonarr.js
 * Sonarr (TV): look up and add a series.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 */

import { REPLIED, RequestHeaders, Terminal } from '../common.js';

/** Sonarr - TV Shows **/
export function Push_Sonarr(request, sendResponse) {
    const headers = {
            'Content-Type': 'application/json',
            'X-Api-Key': request.token,
            ...(RequestHeaders(request.basicAuth))
        }
        , id = request.tvdbId
        , query = encodeURIComponent(`tvdb:${ id }`)
        , debug = { headers, query, request };
   	// setup stack trace for debugging

    fetch(debug.url = `${ request.url }lookup?apikey=${ request.token }&term=${ query }`)
        .then(response => response.json())
        .catch(error => {
            sendResponse({ error: 'TV Show not found', location: '@0B: Push_Sonarr => fetch.then.catch', silent: true });
            throw REPLIED;
        })
        .then(data => {
            if(!(data instanceof Array) || !data.length)
                throw new Error("TV Show not found");

         			// Monitor, search, and download series ASAP
            const body = {
                ...data[0],
                monitored: true,
                seasonFolder: true,
                minimumAvailability: 'preDB',
                qualityProfileId: request.QualityID,
                rootFolderPath: request.StoragePath,
                addOptions: {
                    searchForMissingEpisodes: true
                }
            };

            Terminal().group('Generated URL');
            Terminal().log('URL', request.url);
            Terminal().log('Head', headers);
            Terminal().log('Body', body);
            Terminal().groupEnd();

            return debug.body = body;
        })
        .then(body => {
            return fetch(`${ request.url }?apikey=${ request.token }`, debug.requestHeaders = {
                method: 'POST',
            				// mode: cors(request.url),
                body: JSON.stringify(body),
                headers
            });
        })
        .then(response => response.text())
        .then(data => {
            debug.data =
                data = JSON.parse(data || `{"path":"${ request.StoragePath.replace(/\\/g, '\\\\') }${ request.title } (${ request.year })"}`);

            if(data && data[0] && data[0].errorMessage) {
                sendResponse({
                    error: data[0].errorMessage,
                    location: `@0B: Push_Sonarr => fetch("${ request.url }", { headers }).then(data => { if })`,
                    debug
                })
            } else if(data && data.path) {
                sendResponse({
                    success: 'Added to ' + data.path
                })
            } else {
                sendResponse({
                    error: 'Unknown error',
                    location: `@0B: Push_Sonarr => fetch("${ request.url }", { headers }).then(data => { else })`,
                    debug
                })
            }
        })
        .catch(error => {
            if(error === REPLIED)
                return;

            sendResponse({
                error: String(error),
                location: `@0B: Push_Sonarr => fetch("${ request.url }", { headers }).catch(error => { sendResponse })`,
                debug
            });
        });
}
