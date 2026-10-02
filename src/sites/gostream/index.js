/* global RunSite, script */ // RunSite: lib/site-runner.js; script: the site script loaded before this stub
(init = () => RunSite(script, { alias: 'gostream', type: 'script' }).catch(error => console.warn(`[gostream] ${ error }`)))();
