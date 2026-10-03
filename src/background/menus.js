/*** /src/background/menus.js
 * The context menu (background.js `ChangeStatus`, the `onClicked` listener and the start-up `create` calls).
 * The service worker can stop between events, so the last item's details (`external`) live in
 * `chrome.storage.session` instead of a global, and the menus are created once, in `runtime.onInstalled`.
 */

import { SetBadge } from './badge.js';

// chrome.storage.session key holding background.js's `external`
const EXTERNAL = 'external';

// Status changes read and then write `external`; run them one at a time, so a tab switch and the item its page names
// again cannot interleave (F5)
let STATUS_QUEUE = Promise.resolve();

const Serial = task => (STATUS_QUEUE = STATUS_QUEUE.then(task, task));

/**
 * Creates the context menu items (background.js:988-1022).
 */
export function CreateMenus() {
    const parent = chrome.contextMenus.create({
        id: 'W2P',
        title: "Web to Plex",
    });

    chrome.contextMenus.create({
        id: 'W2P-DL',
        title: "Nothing to Save",
    });

    // Standard search engines
    for(const item of ['IM', 'TM', 'TV'])
        chrome.contextMenus.create({
            id: 'W2P-' + item,
            parentId: parent,
            title: `Using ${ item }Db`,
            type: 'checkbox',
            checked: true, // implement a way to use the checkboxes?
        });

    // Non-standard search engines
    chrome.contextMenus.create({
        id: 'W2P-XX',
        parentId: parent,
        title: "Using best guess",
        type: 'checkbox',
        checked: true, // implement a way to use the checkboxes?
    });
}

/**
 * Reads the last item's details.
 * @returns {Promise<object>} background.js `external`
 */
export async function ReadExternal() {
    return (await chrome.storage.session.get(EXTERNAL))[EXTERNAL] ?? {};
}

/**
 * Derives the item fields background.js computed for every message (background.js:868-881).
 * @param {object} request - The message
 * @returns {object} `{ item, ITEM_TITLE, ITEM_YEAR, ITEM_TYPE, ID_PROVIDER, ITEM_URL, FILE_TYPE, FILE_PATH, ITEM_ID }`
 */
export function ParseItem(request = {}) {
    const item = request.options || request
        , ID_PROVIDER = (i => {
            for(const p in i)
                if(/^TV(Db)?/i.test(p) && i[p])
                    return 'TVDb';
                else if(/^TM(Db)?/i.test(p) && i[p])
                    return 'TMDb';

            return 'IMDb';
        })(item)
        , ITEM_ID = ((i, I) => {
            for(const p in i)
                if(RegExp('^' + I, 'i').test(p))
                    return i[p];
        })(item, ID_PROVIDER);

    let ITEM_TYPE = item.type;

    if(/movie|film|cinema|theat[re]{2}/i.test(ITEM_TYPE))
        ITEM_TYPE = 'movie';
    else if(/tv|show|series|episode/i.test(ITEM_TYPE))
        ITEM_TYPE = 'show';

    return {
        item,
        ITEM_TITLE: item.title,
        ITEM_YEAR: item.year,
        ITEM_TYPE,
        ID_PROVIDER,
        ITEM_URL: item.href || '',
        FILE_TYPE: item.tail || 'mp4',
        FILE_PATH: item.path || '',
        ITEM_ID,
    };
}

/**
 * Records the page's item and retitles the badge and menus for it (background.js `ChangeStatus`).
 * @param {object} details - `{ ITEM_ID, ITEM_TITLE, ITEM_TYPE, ID_PROVIDER, ITEM_YEAR, ITEM_URL, FILE_TYPE, FILE_PATH, TAB_ID }`;
 *     `TAB_ID` is the sending tab, so a tab switch or a left page can forget the item (F5)
 * @returns {Promise<object>} The stored `external`
 */
export function ChangeStatus(details) {
    return Serial(() => SetStatus(details));
}

async function SetStatus({ ITEM_ID, ITEM_TITLE, ITEM_TYPE, ID_PROVIDER, ITEM_YEAR, ITEM_URL = '', FILE_TYPE = '', FILE_PATH, TAB_ID }) {
    const YEAR = new Date().getFullYear()
        , FILE_TITLE = ITEM_TITLE.replace(/-/g, ' ').replace(/[\s:]{2,}/g, ' - ').replace(/[^\w\s\-']+/g, '')
        , SEARCH_TITLE = ITEM_TITLE.replace(/[-\s]+/g, '-').replace(/\s*&\s*/g, ' and ').replace(/[^\w\-'*#]+/g, '')
        , SEARCH_PROVIDER = ITEM_TYPE == 'show' ? 'GG' : /^im/i.test(ID_PROVIDER) ? 'VO' : /^tm/i.test(ID_PROVIDER) ? 'GX' : 'GG';

    ITEM_ID = (ITEM_ID && !/^tt$/i.test(ITEM_ID) ? ITEM_ID : '') + '';
    ITEM_ID = ITEM_ID.replace(/^.*\b(tt\d+)\b.*$/, '$1').replace(/^.*\bid=(\d+)\b.*$/, '$1').replace(/^.*(?:movie|tv|(?:tv-?)?(?:shows?|series|episodes?))\/(\d+).*$/, '$1');

    const external = { ...await ReadExternal(), ID_PROVIDER, ITEM_ID, ITEM_TITLE, ITEM_YEAR, ITEM_URL, ITEM_TYPE, SEARCH_PROVIDER, SEARCH_TITLE, FILE_PATH, FILE_TITLE, FILE_TYPE, TAB_ID };

    await chrome.storage.session.set({ [EXTERNAL]: external });

    SetBadge(ID_PROVIDER, !!ITEM_ID);

    chrome.contextMenus.update('W2P', {
        title: `Find "${ ITEM_TITLE } (${ ITEM_YEAR || YEAR })"`,
    });

    for(let database of ['IM', 'TM', 'TV'])
        chrome.contextMenus.update('W2P-' + database, {
            title: ((ID_PROVIDER == (database += 'Db')) && ITEM_ID)
                ? `Open in ${ database } (${ (+ITEM_ID ? "#" : "") + ITEM_ID })`
                : `Find in ${ database }`,
            checked: false,
        });

    chrome.contextMenus.update('W2P-XX', {
        title: `Find on ${ SEARCH_PROVIDER == 'VO' ? "Vumoo" : SEARCH_PROVIDER == 'GX' ? "GoStream" : "Google" }`,
        checked: false,
    });

    return external;
}

/**
 * Forgets the item when it belongs to the given tab: the badge and menus go back to their start-up titles
 * (CreateMenus), so they never name an item the page in view does not have (F5).
 * @param {number} tabId - The tab that was left or switched away from
 * @returns {Promise<void>}
 */
export function ForgetStatus(tabId) {
    return Serial(() => Forget(tabId));
}

async function Forget(tabId) {
    const { TAB_ID } = await ReadExternal();

    if(TAB_ID == null || TAB_ID != tabId)
        return;

    await chrome.storage.session.remove(EXTERNAL);

    SetBadge('', false);

    chrome.contextMenus.update('W2P', { title: "Web to Plex" });
    chrome.contextMenus.update('W2P-DL', { title: "Nothing to Save" });

    for(const database of ['IM', 'TM', 'TV'])
        chrome.contextMenus.update('W2P-' + database, { title: `Using ${ database }Db`, checked: true });

    chrome.contextMenus.update('W2P-XX', { title: "Using best guess", checked: true });
}

/**
 * A tab became active: an item that belongs to another tab no longer applies. If this tab's page has an item, its
 * content script names it again as it comes into view (utils.js `visibilitychange`).
 * @param {number} tabId - The newly active tab
 * @returns {Promise<void>}
 */
export function SwitchStatus(tabId) {
    return Serial(async() => {
        const { TAB_ID } = await ReadExternal();

        if(TAB_ID != null && TAB_ID != tabId)
            await Forget(TAB_ID);
    });
}

/**
 * Handles a context-menu click: opens the matching search or page, or downloads the file (background.js:803-863).
 * `window.open` becomes `chrome.tabs.create`, which a service worker has.
 * @param {object} item - `contextMenus.onClicked` data
 * @returns {Promise<void>}
 */
export async function OnMenuClicked(item) {
    if(!/^W2P/i.test(item.menuItemId))
        return;

    const external = await ReadExternal();

    let url = ''
        , dnl = false;

    const db = item.menuItemId.slice(-2).toLowerCase()
        , pv = (external.ID_PROVIDER || '').slice(0, 2).toLowerCase()
        , qu = external.ITEM_ID
        , tl = external.SEARCH_TITLE
        , yr = external.ITEM_YEAR
        , tt = external.ITEM_TITLE
        , lt = external.FILE_TITLE
        , ft = external.FILE_TYPE
        , fp = external.FILE_PATH
        , p = (s, r = '+') => s.replace(/-/g, r);

    switch(db) {
        case 'im': {
            url = (qu && pv == 'im')
                ? `imdb.com/title/${ qu }/`
                : `imdb.com/find?ref_=nv_sr_fn&s=all&q=${ encodeURIComponent(tt) }`;
        } break;

        case 'tm': {
            url = (qu && pv == 'tm')
                ? `themoviedb.org/${ external.ITEM_TYPE == 'show' ? 'tv' : 'movie' }/${ qu }`
                : `themoviedb.org/search?query=${ encodeURIComponent(tt) }`;
        } break;

        case 'tv': {
            url = (qu && pv == 'tv')
                ? `thetvdb.com/series/${ tl }#${ qu }` // TVDb accepts either: a title, or a series number... but only one
                : `thetvdb.com/search?q=${ p(encodeURIComponent(tl)) }`;
        } break;

        case 'xx': {
            url = external.SEARCH_PROVIDER == 'VO'
                ? `google.com/search?q=${ p(encodeURIComponent(tl)) }+site:vumoo.to`
                : external.SEARCH_PROVIDER == 'GX'
                    ? `gostream.site?s=${ p(encodeURIComponent(tl)) }`
                    : `google.com/search?q="${ encodeURIComponent(p(tl, ' ')) } ${ yr }"+${ pv }db`;
        } break;

        case 'dl': {
            dnl = true;
            url = external.ITEM_URL;
        } break;

        default: {
            return;
        }
    } // switch db

    if(!dnl)
        chrome.tabs.create({ url: `https://${ url }` });
    else
        // try/catch won't work here, so use the first download's callback as an error catcher
        chrome.downloads.download({
            url,
            filename: `${ fp }${ lt } (${ yr }).${ ft }`,
            saveAs: true,
        }, id => {
            if(id == null)
                chrome.downloads.download({
                    url,
                    saveAs: true,
                });
        });
}

/**
 * Retitles the "Save as" menu item for a downloadable file (background.js `SAVE_AS`).
 * @param {object} parsed - From `ParseItem`
 */
export function SaveAs({ ITEM_TITLE, ITEM_YEAR, FILE_TYPE }) {
    chrome.contextMenus.update('W2P-DL', {
        title: `Save as "${ ITEM_TITLE } (${ ITEM_YEAR })" (${ FILE_TYPE })`,
    });
}

/**
 * Downloads a file with a friendly name, retrying without the extension on failure (background.js `DOWNLOAD_FILE`).
 * @param {object} parsed - From `ParseItem`
 */
export function DownloadFile({ item, ITEM_TITLE, ITEM_YEAR, FILE_TYPE }) {
    const FILE_TITLE = ITEM_TITLE.replace(/-/g, ' ').replace(/[\s:]{2,}/g, ' - ').replace(/[^\w\s\-']+/g, '');

    // no try/catch, use callback for that
    chrome.downloads.download({
        url: item.href,
        filename: `${ FILE_TITLE } (${ ITEM_YEAR }).${ FILE_TYPE }`,
        saveAs: true,
    }, id => {
        // Error Occured
        if(id == null)
            chrome.downloads.download({
                url: item.href,
                filename: `${ FILE_TITLE } (${ ITEM_YEAR })`,
                saveAs: true,
            });
    });
}
