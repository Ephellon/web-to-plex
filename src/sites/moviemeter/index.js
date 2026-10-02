/* global RunSite, script */ // RunSite: lib/site-runner.js; script: the site script loaded before this stub
(init = () => RunSite(script, { alias: 'moviemeter', type: 'script' }).catch(error => console.warn(`[moviemeter] ${ error }`)))();
