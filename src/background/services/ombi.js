/*** /src/background/services/ombi.js
 * Ombi (movies and TV): request an item.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 */

import { REPLIED, RequestHeaders } from '../common.js';

/** Ombi* - TV Shows/Movies **/
export function Push_Ombi(request, sendResponse) {
    const headers = {
            'Content-Type': 'application/json',
            'ApiKey': request.token,
            ...RequestHeaders()
        }
        , type = request.contentType
        , id = (type == 'movie' ? request.tmdbId : request.tvdbId)
        , body = ({ [type == 'movie' ? 'theMovieDbId' : 'tvDbId']: id, requestAll: true, latestSeason: true, firstSeason: true })
        , debug = { headers, body, request };
   	// setup stack trace for debugging

    if(request.contentType == 'movie' && (id || null) === null)
        return sendResponse({ error: 'Invalid TMDbID', location: '@0B: Push_Ombi => if', silent: true });
    else if((id || null) === null)
        return sendResponse({ error: 'Invalid TVDbID', location: '@0B: Push_Ombi => else if', silent: true });

    fetch(debug.url = request.url, {
        method: 'POST',
     			// mode: cors(request.url),
        body: JSON.stringify(body),
        headers
    })
        .catch(error => {
            sendResponse({ error: `${ type } not found`, location: '@0B: Push_Ombi => fetch.then.catch', debug, silent: true });
            throw REPLIED;
        })
        .then(response => response.text())
        .then(data => {
            debug.data =
                data = JSON.parse(data);

            if(data && data.isError) {
                if(/already +been +requested/i.test(data.errorMessage))
                    sendResponse({
                        success: 'Already requested on Ombi'
                    });
                else
                    sendResponse({
                        error: data.errorMessage,
                        location: `@0B: Push_Ombi => fetch("${ request.url }", { headers }).then(data => { if })`,
                        debug
                    });
            } else if(data && data.path) {
                sendResponse({
                    success: 'Added to Ombi'
                })
            } else {
                sendResponse({
                    error: 'Unknown error',
                    location: `@0B: Push_Ombi => fetch("${ request.url }", { headers }).then(data => { else })`,
                    debug
                })
            }
        })
        .catch(error => {
            if(error === REPLIED)
                return;

            sendResponse({
                error: String(error),
                location: `@0B: Push_Ombi => fetch("${ request.url }", { headers }).catch(error => { sendResponse })`,
                debug
            });
        });
}
