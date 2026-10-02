/* global RunSite, plugin */ // RunSite: lib/site-runner.js; plugin: the site script loaded before this stub
(init = () => RunSite(plugin, { alias: 'shanaproject', type: 'script' }).catch(error => console.warn(`[shanaproject] ${ error }`)))();
