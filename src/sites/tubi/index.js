/* global RunSite, script */ // RunSite: lib/site-runner.js; script: the site script loaded before this stub
(init = () => RunSite(script, { alias: 'tubi', type: 'script' }).catch(error => console.warn(`[tubi] ${ error }`)))();
