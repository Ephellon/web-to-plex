/* global RunSite, script */ // RunSite: lib/site-runner.js; script: the site script loaded before this stub
(init = () => RunSite(script, { alias: 'amazon', type: 'script' }).catch(error => console.warn(`[amazon] ${ error }`)))();
