function $(selector, container = document) {
	return queryBy(selector, container);
}

async function load(name = '') {
	if(!name) return;

	name = '~/cache/' + (name.toLowerCase().replace(/\s+/g, '_'));

	return new Promise((resolve, reject) => {
		function LOAD(DISK) {
			let data = JSON.parse(DISK[name] || null);

			return resolve(data);
		}

		HELPERS_STORAGE.get(null, DISK => LOAD(DISK));
	});
}

async function save(name = '', data) {
	if(!name) return;

	name = '~/cache/' + (name.toLowerCase().replace(/\s+/g, '_'));
	data = JSON.stringify(data);

	await HELPERS_STORAGE.set({[name]: data}, () => data);

	return name;
}

async function kill(name) {
	return HELPERS_STORAGE.remove(['~/cache/' + (name.toLowerCase().replace(/\s+/g, '_'))]);
}

async function Notify(state, text, timeout = 7000, requiresClick = true) {
	return top.postMessage({ type: 'NOTIFICATION', data: { state, text, timeout, requiresClick } }, '*');
}

/**
 * A saved permission answer, read from chrome.storage (O3). `load` reads HELPERS_STORAGE, the page's filtered
 * configuration, which hides every `~/cache/` key until the site has a grant: a saved grant was never seen, and the
 * prompt came back on every load.
 * @param {string} name - `has/<site>` or `get/<site>`
 * @returns {Promise<*>} The saved value, or null
 */
async function LoadGrant(name) {
	let key = '~/cache/' + name.toLowerCase().replace(/\s+/g, '_'),
		area = chrome.storage.sync || chrome.storage.local,
		stored = await area.get(key).catch(() => ({}));

	return stored[key] == null ? null : JSON.parse(stored[key]);
}

async function Require(permission, name, alias, instance) {
	let allowed = await LoadGrant(`has/${ name }`),
		allotted = await LoadGrant(`get/${ name }`);

	top.postMessage({ type: 'PERMISSION', data: { instance, permission, name, alias, allowed, allotted } });

	/* Already asked for permission */
	if(typeof allowed == 'boolean')
		/* The allowed permission(s) */
		return allotted;
}
