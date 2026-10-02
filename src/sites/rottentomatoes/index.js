/* global RunSite, script */ // RunSite: lib/site-runner.js; script: the site script loaded before this stub
(init = () => RunSite(script, { alias: 'rottentomatoes', type: 'script' }).catch(error => console.warn(`[rottentomatoes] ${ error }`)))();
