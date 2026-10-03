/*** /src/background/services/radarr.js
 * Radarr (movies): look up and add a movie.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 */

import { REPLIED, RequestHeaders, Terminal } from '../common.js';

/** Radarr - Movies **/
export function Push_Radarr(request, sendResponse) {
    let headers = {
            'Content-Type': 'application/json',
            'X-Api-Key': request.token,
            ...(RequestHeaders(request.basicAuth))
        }
        , id = (/^(tt)?$/.test(request.imdbId) ? request.tmdbId : request.imdbId)
      		// if the IMDbID is empty, jump to the TMDbID
        , query = (/^tt\d+$/i.test(id) ? 'imdb?imdbid' : /^\d+$/.test(id) ? 'tmdb?tmdbid' : (id = encodeURI(`${ request.title } ${ request.year }`), 'term'))
      		// if the IMDbID is empty, use "/tmdb?tmdbid={ id }"
      		// if the IMDbID isn't empty, use "/imdb?imdbid={ id }"
      		// otherwise, use "&term={ title } { year }"
        , debug = { headers, query, request };
   	// setup a stack trace for debugging

    // Radarr v3+ only serves /api/v3; v2 and older only /api. Try v3 first and keep whichever base answers for the add
    let base = request.url;

    const bases = [request.url.replace(/\/api\/movie\/?$/, '/api/v3/movie/'), request.url].filter((url, index, all) => all.indexOf(url) == index);

    (async() => {
        let response;

        for(base of bases) {
            response = await fetch(debug.url = `${ base }lookup/${ query }=${ id }&apikey=${ request.token }`);

            if(response.ok)
                break;
        }

        return response;
    })()
        .then(response => response.json())
        .catch(error => {
            sendResponse({ error: 'Movie not found', location: '@0B: Push_Radarr => fetch.then.catch', silent: true });
            throw REPLIED;
        })
        .then(data => {
            let body
            				// Monitor, search, and download movie ASAP
                , props = {
                    monitored: true,
                    minimumAvailability: 'preDB',
                    qualityProfileId: request.QualityID,
                    rootFolderPath: request.StoragePath,
                    addOptions: {
                        searchForMovie: true
                    }
                };

            if(!data || (!data.length && !data.title)) {
                throw new Error("Movie not found")
            } else if(data.length) {
                body = {
                    ...data[0],
                    ...props
                }
            } else if(data.title) {
                body = {
                    ...data,
                    ...props
                }
            }

            Terminal().group('Generated URL');
            Terminal().log('URL', request.url);
            Terminal().log('Head', headers);
            Terminal().log('Body', body);
            Terminal().groupEnd();

            return debug.body = body;
        })
        .then(body => {
            return fetch(`${ base }?apikey=${ request.token }`, debug.requestHeaders = {
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
                    location: `@0B: Push_Radarr => fetch("${ request.url }", { headers }).then(data => { if })`,
                    debug
                })
            } else if(data && data.path) {
                sendResponse({
                    success: 'Added to ' + data.path
                })
            } else {
                sendResponse({
                    error: 'Unknown error',
                    location: `@0B: Push_Radarr => fetch("${ request.url }", { headers }).then(data => { else })`,
                    debug
                })
            }
        })
        .catch(error => {
            if(error === REPLIED)
                return;

            sendResponse({
                error: String(error),
                location: `@0B: Push_Radarr => fetch("${ request.url }", { headers }).catch(error => { sendResponse })`,
                debug
            });
        });
}
