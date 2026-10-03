/* global RunSite, plugin */ // RunSite: lib/site-runner.js; plugin: the plugin script loaded before this stub (background/plugins.js)
(init = () => RunSite(plugin, { alias: 'freemoviescinema', type: 'plugin' }).catch(error => console.warn(`[freemoviescinema] ${ error }`)))();
