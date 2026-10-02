/*** /src/background/services/sickbeard.js
 * Sick Beard (TV): search and add a series.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 */

import { REPLIED, RequestHeaders, Terminal, formify } from '../common.js';

/** Sick Beard - TV Shows **/
export function Push_SickBeard(request, sendResponse) {
    const headers = {
            'Content-Type': 'application/json',
            'X-Api-Key': request.token,
            ...(RequestHeaders(request.basicAuth))
        }
        , id = request.tvdbId
        , query = `tvdbid=${ id }`
        , path = (`${ request.StoragePath }\\${ request.title }`).replace(/\\\\/g, '\\')
        , debug = { headers, query, request };
   	// setup stack trace for debugging

    fetch(debug.url = `${ request.url }?cmd=sb.searchtvdb&${ query }`)
        .then(response => response.json())
        .catch(error => {
            sendResponse({ error: 'TV Show not found', location: '@0B: Push_SickBeard => fetch.then.catch', silent: true });
            throw REPLIED;
        })
        .then(data => {
            if(!/^success$/i.test(data.result))
                throw new Error("TV Show not found");

            data = data.data.results;

         			// Monitor, search, and download series ASAP
            const body = formify({
                tvdbid: id,
                initial: request.QualityID,
                location: encodeURIComponent(path),
                status: 'wanted',
            });

            Terminal().group('Generated URL');
            Terminal().log('URL', request.url);
            Terminal().log('Head', headers);
            Terminal().log('Body', body);
            Terminal().groupEnd();

            return debug.body = body;
        })
        .then(async body => {
            await fetch(`${ request.url }?cmd=sb.addrootdir&${ body }`);

            return fetch(`${ request.url }?cmd=show.${ request.exists ? 'addexisting' : 'addnew' }&${ body }`, debug.requestHeaders = {
                method: 'POST',
            				// mode: cors(request.url),
            				// body: JSON.stringify(body),
                headers
            });
        })
        .then(response => response.text())
        .then(results => {
            debug.data =
                results = JSON.parse(results || `{"data":{},"message":"","result":""}`);

            const { data, message, result } = results;

            if(data && !/^success$/i.test(result) && message) {
                sendResponse({
                    error: message,
                    location: `@0B: Push_SickBeard => fetch("${ request.url }", { headers }).then(results => { if })`,
                    debug
                })
            } else if(data && data.path) {
                sendResponse({
                    success: `Added to ${ request.StoragePath }${ request.title } (${ request.year })`
                })
            } else {
                sendResponse({
                    error: 'Unknown error',
                    location: `@0B: Push_SickBeard => fetch("${ request.url }", { headers }).then(results => { else })`,
                    debug
                })
            }
        })
        .catch(error => {
            if(error === REPLIED)
                return;

            sendResponse({
                error: String(error),
                location: `@0B: Push_SickBeard => fetch("${ request.url }", { headers }).catch(error => { sendResponse })`,
                debug
            });
        });
}
