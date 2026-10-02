/*** /src/background/services/watcher.js
 * Watcher (movies): add a movie.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 */

import { REPLIED, RequestHeaders } from '../common.js';

/** Watcher - Movies **/
export function Push_Watcher(request, sendResponse) {
    let headers = {
            'Content-Type': 'application/json',
            'X-Api-Key': request.token,
            ...(RequestHeaders(request.basicAuth))
        }
        , id = (/^(tt)?$/.test(request.imdbId) ? request.tmdbId : request.imdbId)
      		// if the IMDbID is empty, jump to the TMDbID
        , query = (/^tt\d+$/i.test(id) ? 'imdbid' : /^\d+$/.test(id) ? 'tmdbid' : (id = encodeURI(`${ request.title } ${ request.year }`), 'term'))
      		// if the IMDbID is empty, use "&tmdbid={ id }"
      		// if the IMDbID isn't empty, use "&imdbid={ id }"
      		// otherwise, use "&term={ title } { year }"
        , debug = { headers, query, request };
   	// setup a stack trace for debugging

    fetch(debug.url = `${ request.url }?apikey=${ request.token }&mode=addmovie&${ query }=${ id }`, { headers })
        .then(response => response.json())
        .catch(error => {
            sendResponse({ error: 'Movie not found', location: '@0B: Push_Watcher => fetch.then.catch', silent: true });
            throw REPLIED;
        })
        .then(response => {
            if((response.response + '') == 'true')
                return sendResponse({
                    success: `Added to Watcher (${ request.StoragePath })`
                });

            throw new Error(response.error);
        })
        .catch(error => {
            if(error === REPLIED)
                return;

            sendResponse({
                error: String(error),
                location: `@0B: Push_Watcher => fetch("${ request.url }", { headers }).catch(error => { sendResponse })`,
                debug
            });
        });
}
