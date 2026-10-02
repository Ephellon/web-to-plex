/* global RunSite, script */ // RunSite: lib/site-runner.js; script: the site script loaded before this stub
(init = () => RunSite(script, { alias: 'hulu', type: 'script' }).catch(error => console.warn(`[hulu] ${ error }`)))();
