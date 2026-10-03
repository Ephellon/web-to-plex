/* global RunSite, plugin */ // RunSite: lib/site-runner.js; plugin: the plugin script loaded before this stub (background/plugins.js)
(init = () => RunSite(plugin, { alias: 'toloka', type: 'plugin' }).catch(error => console.warn(`[toloka] ${ error }`)))();
