/*** /src/background/services/plex.js
 * Plex: search every server connection and take the first answer.
 * Moved verbatim from background.js (Phase 3b); only `Headers` → `RequestHeaders` and `BACKGROUND_TERMINAL` → `Terminal()`.
 */

import { Terminal } from '../common.js';

// Unfortunately the native Promise.race does not work as you would suspect.
// If one promise (Plex request) fails, we still want the other requests to continue racing.
// See https://www.jcore.com/2016/12/18/promise-me-you-wont-use-promise-race/ for an explanation
export function PromiseRace(promises) {
    if(!promises.length) {
        return Promise.reject('Cannot start a race without promises!')
    }

   	// There is no way to know which promise is rejected.
   	// So we map it to a new promise to return the index when it fails
    const Promises = promises.map((promise, index) =>
        promise.catch(() => {
            throw index;
        })
    );

    return Promise.race(Promises)
        .catch(index => {
         			// The promise has rejected, remove it from the list of promises and just continue the race.
            const promise = promises.splice(index, 1)[0];

            promise.catch(error => Terminal().log(`Plex request #${ index } failed:`, error));
            return PromiseRace(promises);
        });
}
export function $Search_Plex(connection, headers, options) {
    let type = options.type || 'movie'
        , url = `${ connection.uri }/hubs/search`
        , field = options.field || 'title';

    if(!options.title)
        return {};

    if(/movie|film|cinema|theat[re]{2}/i.test(type))
        type = 'movie';
    else if(/tv|show|series|episode/i.test(type))
        type = 'show';

   	// Letterboxd can contain special white-space characters. Plex doesn't like this.
    const title = encodeURIComponent(options.title.replace(/\s+/g, ' '))
        , finalURL = `${ url }?query=${ field }:${ title }`;

   	// Terminal().warn(`Fetching <${ JSON.stringify(headers) } ${ finalURL } >`);
    return fetch(finalURL, { headers })
        .then(response => response.json())
        .then(data => {
            const Hub = data.MediaContainer.Hub.find(hub => hub.type === type);
         			// type: actor album artist autotag collection director episode genre movie photo photoalbum place playlist shared show track

            if(!Hub || !Hub.Metadata)
                return { found: false };

         			// We only want to search in Plex libraries with the type "Movie", i.e. not the type "Other Videos".
         			// Weirdly enough Plex doesn't seem to have an easy way to filter those libraries so we invent our own hack.
            const items = Hub.Metadata.filter(
				meta =>
				    meta.Directory
				    || meta.Genre
				    || meta.Country
				    || meta.Role
				    || meta.Writer
                )
                , strip = (string) => string.replace(/\W+/g, '').toLowerCase();

         			// This is messed up, but Plex's definition of a year is year when it was available,
         			// not when it was released (which is Movieo's definition).
         			// For examples, see Bone Tomahawk, The Big Short, The Hateful Eight.
         			// So we'll first try to find the movie with the given year, and then + 1 it.
         			// Added [strip] to prevent mix-ups, see: "Kingsman: The Golden Circle" v. "The Circle"
            let media = items.find(meta => (((meta.year == +options.year) || (meta.year == +options.year + 1)) && strip(meta.title) == strip(options.title)))
                , key = null;

            if(!media && options.IMDbID)
                media = items.find(meta => new RegExp('imdb://' + options.IMDbID, 'i').test(meta.guid));

            key = media ? media.key.replace('/children', '') : key;

            return {
                found: !!media,
                key
            };
        })
        .catch(error => { throw error });
}
export async function Search_Plex(request, sendResponse) {
    let { options, serverConfig } = request
        , headers = {
            'X-Plex-Token': serverConfig.token,
            'Accept': 'application/json'
        };

   	// Try all Plex connection URLs
    const requests = serverConfig.connections.map(connection =>
        $Search_Plex(connection, headers, options)
    );

    try {
      		// See what connection URL finishes the request first and pick that one.
      		// TODO: optimally, as soon as the first request is finished, all other requests would be cancelled using AbortController.
        const result = await PromiseRace(requests);

        sendResponse(result);
    } catch(error) {
        sendResponse({ error: String(error), location: '@0B: Search_Plex' });
    }
}
