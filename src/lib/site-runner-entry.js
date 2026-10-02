/*** /src/lib/site-runner-entry.js
 * Bundle entry for `site-runner.js` (scripts/build.mjs): exposes `RunSite` to the classic site scripts that load after it.
 */

import { RunSite } from './site-runner.js';

globalThis.RunSite = RunSite;
