/*** /src/background/index.js
 * MV3 service worker entry (Phase 3b), bundled by esbuild to `background.js` in 3d. Replaces the persistent MV2
 * background page (`background.js` + `plugn.js`). Listeners are registered at the top level, as a service worker
 * requires, so every wake-up has them.
 */

import { RefreshTerminal } from './common.js';
import { Route } from './router.js';
import { CreateMenus, OnMenuClicked } from './menus.js';

chrome.runtime.onMessage.addListener(Route);
chrome.runtime.onInstalled.addListener(() => CreateMenus());
chrome.contextMenus.onClicked.addListener(item => void OnMenuClicked(item));

// Options were cached in localStorage by MV2; the worker reads them on demand and refreshes on change
chrome.storage.onChanged.addListener(() => void RefreshTerminal());
RefreshTerminal();
