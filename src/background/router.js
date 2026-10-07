/*** /src/background/router.js
 * The service worker's single `runtime.onMessage` handler (docs/PHASE3.md "Service worker router").
 *
 *   - Messages from anything but this extension (`sender.id`) are rejected.
 *   - A table maps each type to its handler; unknown types are ignored, not answered.
 *   - Handlers that reply asynchronously make the listener return `true`, and reply exactly once.
 *
 * The `plugn.js` types (`SCRIPT`, `PLUGIN`, `$INIT$`, `_INIT_`, `FOUND`, `GRANT_PERMISSION`) are not in the table:
 * lib/site-runner.js replaces that round trip, so they are ignored like any unknown type.
 */

import { Terminal, RefreshTerminal } from './common.js';
import { SeedDefaults } from './defaults.js';
import { ParseItem, ChangeStatus, ForgetStatus, SaveAs, DownloadFile } from './menus.js';
import { Search_Plex } from './services/plex.js';
import { Query_CouchPotato, Push_CouchPotato, Charge_CouchPotato } from './services/couchpotato.js';
import { Push_Watcher } from './services/watcher.js';
import { Push_Radarr } from './services/radarr.js';
import { Push_Sonarr } from './services/sonarr.js';
import { Push_Medusa } from './services/medusa.js';
import { Push_SickBeard } from './services/sickbeard.js';
import { Push_Ombi } from './services/ombi.js';
import { Service_Fetch } from './services/relay.js';

/**
 * Message types and their handlers. `replies` marks the handlers that answer through `sendResponse`.
 * Each handler gets `(request, sendResponse, parsed)`, where `parsed` is `ParseItem(request)`.
 */
export const ROUTES = {
    SEARCH_PLEX: { replies: true, handle: (request, reply) => Search_Plex(request, reply) },
    CHARGE_COUCHPOTATO: { replies: true, handle: (request, reply) => Charge_CouchPotato(request, reply) },
    QUERY_COUCHPOTATO: { replies: true, handle: (request, reply) => Query_CouchPotato(request, reply) },
    PUSH_COUCHPOTATO: { replies: true, handle: (request, reply) => Push_CouchPotato(request, reply) },
    PUSH_RADARR: { replies: true, handle: (request, reply) => Push_Radarr(request, reply) },
    PUSH_SONARR: { replies: true, handle: (request, reply) => Push_Sonarr(request, reply) },
    PUSH_MEDUSA: { replies: true, handle: (request, reply) => Push_Medusa(request, reply) },
    PUSH_WATCHER: { replies: true, handle: (request, reply) => Push_Watcher(request, reply) },
    PUSH_OMBI: { replies: true, handle: (request, reply) => Push_Ombi(request, reply) },
    PUSH_SICKBEARD: { replies: true, handle: (request, reply) => Push_SickBeard(request, reply) },
    SERVICE_FETCH: { replies: true, handle: (request, reply) => Service_Fetch(request, reply) },

    // These never answered in MV2 either; the listener now says so (returns false) instead of holding the port (B50)
    OPEN_OPTIONS: { replies: false, handle: () => chrome.runtime.openOptionsPage() },
    SEARCH_FOR: {
        replies: false,
        handle(request, reply, parsed, sender) {
            const { ITEM_ID, ITEM_TITLE, ITEM_TYPE, ID_PROVIDER, ITEM_YEAR, ITEM_URL, FILE_TYPE, FILE_PATH } = parsed;

            if(ITEM_TITLE && ITEM_TYPE)
                return ChangeStatus({ ITEM_ID, ITEM_TITLE, ITEM_TYPE, ID_PROVIDER, ITEM_YEAR, ITEM_URL, FILE_TYPE, FILE_PATH, TAB_ID: sender?.tab?.id });
        },
    },
    SAVE_AS: { replies: false, handle: (request, reply, parsed) => SaveAs(parsed) },
    DOWNLOAD_FILE: { replies: false, handle: (request, reply, parsed) => DownloadFile(parsed) },
    UPDATE_CONFIGURATION: { replies: false, handle: () => RefreshTerminal() },
    // S17: the options page's Reset cleared both storage areas; write the defaults again, as on a fresh install
    RESEED_DEFAULTS: { replies: true, handle: (request, reply) => SeedDefaults({ reason: 'install' }).then(written => reply({ ok: true, keys: Object.keys(written).length })) },
    // utils.js: the page was left; its item no longer applies (F5)
    PAGE_HIDDEN: { replies: false, handle: (request, reply, parsed, sender) => ForgetStatus(sender?.tab?.id) },
};

/**
 * The `runtime.onMessage` listener.
 * @param {object} request - The message
 * @param {object} sender - `runtime.MessageSender`
 * @param {function} sendResponse - Replies to the sender
 * @returns {boolean} `true` when the reply comes later (keeps the channel open), otherwise `false`
 */
export function Route(request, sender, sendResponse) {
    if(sender?.id !== chrome.runtime.id)
        return false;

    const route = ROUTES[request?.type];

    if(!route)
        return false;

    Terminal().log('From:', sender);

    // Exactly one reply, whatever the handler does
    let replied = false;

    const reply = response => {
        if(replied)
            return;

        replied = true;
        sendResponse(response);
    };

    try {
        const result = route.handle(request, reply, ParseItem(request), sender);

        // A rejected promise from a handler is reported like a thrown error, never as an unhandled rejection
        if(result instanceof Promise)
            result.catch(error => {
                Terminal().error(error);
                route.replies && reply({ error: String(error), location: '@0B: Route => handler' });
            });
    } catch(error) {
        Terminal().error(error);
        reply({ error: String(error), location: '@0B: Route => handler' });

        return false;
    }

    return route.replies;
}
