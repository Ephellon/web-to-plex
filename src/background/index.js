/*** /src/background/index.js
 * MV3 service worker entry (Phase 3b), bundled by esbuild to `background.js` in 3d. Replaces the persistent MV2
 * background page (`background.js` + `plugn.js`). Listeners are registered at the top level, as a service worker
 * requires, so every wake-up has them.
 */

import { SeedDefaults } from './defaults.js';
import { RefreshTerminal } from './common.js';
import { Route } from './router.js';
import { CreateMenus, OnMenuClicked, SwitchStatus } from './menus.js';
import { SyncPlugins, TouchesPlugins } from './plugins.js';

chrome.runtime.onMessage.addListener(Route);
chrome.runtime.onInstalled.addListener(() => (CreateMenus(), void SyncPlugins()));

// Plugin sites run where the user enabled them and granted their hosts; registrations follow both
chrome.runtime.onStartup.addListener(() => void SyncPlugins());
chrome.storage.onChanged.addListener(changes => TouchesPlugins(changes) && void SyncPlugins());
chrome.permissions.onAdded.addListener(() => void SyncPlugins());
chrome.permissions.onRemoved.addListener(() => void SyncPlugins());
chrome.contextMenus.onClicked.addListener(item => void OnMenuClicked(item));

// F5: the menus name the active tab's item; switching to another tab forgets one that belongs elsewhere
chrome.tabs.onActivated.addListener(({ tabId }) => void SwitchStatus(tabId));

// Options were cached in localStorage by MV2; the worker reads them on demand and refreshes on change
chrome.storage.onChanged.addListener(() => void RefreshTerminal());
RefreshTerminal();

// D1: a fresh install gets the options page's defaults, so sites work before the options are first saved; an update
// fills in only the keys still missing
chrome.runtime.onInstalled.addListener(details => void SeedDefaults(details));
