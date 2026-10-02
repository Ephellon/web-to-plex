/*** /src/background/badge.js
 * The toolbar badge: which ID provider the page's item came from, orange when an ID is known (background.js
 * `ChangeStatus`). MV3 renames `browserAction` to `action`.
 */

/**
 * Sets the badge text and colour.
 * @param {string} text - The ID provider: `IMDb`, `TMDb` or `TVDb`
 * @param {boolean} known - Whether the item has an ID (orange) or not (grey)
 */
export function SetBadge(text, known) {
    const action = chrome.action ?? chrome.browserAction;

    action.setBadgeText({
        text,
    });

    action.setBadgeBackgroundColor({
        color: known ? '#f45a26' : '#666666',
    });
}
